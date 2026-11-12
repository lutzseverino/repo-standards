import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { isAbsolute, join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { directoryFixture } from "./installed-cli.ts";
import { validateMetadata } from "./pr-metadata.ts";

// The update action's scripts run against a fake forge, a local HTTP server
// for GitHub's REST API backed by a bare Git remote, and a fake CLI that
// stands in for npm, npx and the pinned runtime on PATH.

const actionMain = fileURLToPath(new URL("../action/main.ts", import.meta.url));
const fakeCli = fileURLToPath(
  new URL("update-action-cli.mjs", import.meta.url),
);
const source = "https://github.com/alice/standards";
const token = "test-token";
const branch = "repo-standards/update";

interface Pins {
  cli: string;
  standards: string;
}
interface Scenario {
  newest: Pins;
  headless: "complete" | "stopped";
  unknown?: boolean;
}
interface Item {
  number: number;
  kind: "pull" | "issue";
  title: string;
  body: string;
  state: "open" | "closed";
  head?: string;
  base?: string;
  comments: string[];
}
interface Invocation {
  kind: string;
  version?: string;
  args: string[];
  ghToken: boolean;
  actionToken: boolean;
  report?: string;
  output?: string;
  cwd: string;
  project: string;
  reportPath?: string;
}

function git(cwd: string, ...args: string[]) {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function selection(pins: Pins) {
  return [
    "cli:",
    '  package: "@lutzseverino/repo-standards"',
    `  version: ${pins.cli}`,
    "standards:",
    `  repository: ${source}`,
    `  version: ${pins.standards}`,
    "  commit: 803ebec5a180f5a0df852ebb1954d93fffc50e5b",
    "profile: default",
    "",
  ].join("\n");
}

function body(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve) => {
    let text = "";
    request.on("data", (chunk: Buffer) => (text += chunk.toString()));
    request.on("end", () =>
      resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {}),
    );
  });
}

// A forge fixture: GitHub's REST API for pull requests, issues and the rolling
// branch's files, over a bare remote the action pushes to.
async function fixture(
  t: TestContext,
  from: Pins = { cli: "9.0.0", standards: "v1.0.0" },
) {
  const directory = directoryFixture("repo-standards-action with spaces-");
  t.after(() => directory.close());
  const root = directory.root;
  const origin = join(root, "origin.git");
  git(root, "init", "--quiet", "--bare", "-b", "main", origin);
  const seed = join(root, "seed");
  git(root, "clone", "--quiet", origin, seed);
  mkdirSync(join(seed, ".repo-standards"), { recursive: true });
  writeFileSync(join(seed, ".repo-standards/selection.yaml"), selection(from));
  writeFileSync(
    join(seed, ".repo-standards/.gitignore"),
    "/runtime/node_modules/\n/local/\n/cache/\n",
  );
  writeFileSync(join(seed, "CONTRIBUTING.md"), "Contributing\n");
  git(seed, "add", ".");
  git(seed, "commit", "--quiet", "-m", "seed");
  git(seed, "push", "--quiet", "origin", "HEAD:main");

  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const name of ["npm", "npx"]) {
    writeFileSync(
      join(bin, name),
      `#!/bin/sh\nexec "${process.execPath}" "${fakeCli}" ${name} "$@"\n`,
    );
    chmodSync(join(bin, name), 0o755);
  }
  const scenarioPath = join(root, "scenario.json");
  const logPath = join(root, "invocations.jsonl");
  writeFileSync(logPath, "");

  const items: Item[] = [];
  const requests: { method: string; path: string; authorized: boolean }[] = [];
  const prefix = "/repos/alice/project";
  const view = (item: Item) => ({
    number: item.number,
    html_url: `https://github.com/alice/project/${item.kind === "pull" ? "pull" : "issues"}/${item.number}`,
    title: item.title,
    body: item.body,
    state: item.state,
    ...(item.kind === "pull" ? { pull_request: {} } : {}),
  });
  let published:
    { version: string; manifest: object; tarball: Buffer } | undefined;
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url!, "http://localhost");
      if (url.pathname.startsWith("/registry/") && published) {
        if (url.pathname === "/registry/package.tgz")
          return response.end(published.tarball);
        response.setHeader("content-type", "application/json");
        if (request.method === "POST") return response.end("{}");
        return response.end(
          JSON.stringify({
            name: "@lutzseverino/repo-standards",
            "dist-tags": { latest: published.version },
            versions: {
              [published.version]: {
                ...published.manifest,
                dist: { tarball: `${api}/registry/package.tgz` },
              },
            },
          }),
        );
      }
      const method = request.method!;
      requests.push({
        method,
        path: url.pathname,
        authorized: request.headers.authorization === `Bearer ${token}`,
      });
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(value));
      };
      const path = url.pathname.slice(prefix.length);
      const numbered = /^\/(pulls|issues)\/(\d+)(\/comments)?$/.exec(path);
      if (method === "GET" && path === "")
        return send(200, { default_branch: "main" });
      if (method === "GET" && path === "/pulls")
        return send(
          200,
          items
            .filter(
              (item) =>
                item.kind === "pull" &&
                item.state === "open" &&
                `alice:${item.head}` === url.searchParams.get("head"),
            )
            .map(view),
        );
      if (method === "GET" && path === "/issues")
        return send(
          200,
          items.filter((item) => item.state === "open").map(view),
        );
      if (method === "GET" && path.startsWith("/contents/")) {
        const file = decodeURIComponent(path.slice("/contents/".length));
        const result = spawnSync(
          "git",
          ["show", `refs/heads/${url.searchParams.get("ref")}:${file}`],
          { cwd: origin, encoding: "utf8" },
        );
        return result.status === 0
          ? send(200, {
              encoding: "base64",
              content: Buffer.from(result.stdout).toString("base64"),
            })
          : send(404, { message: "Not Found" });
      }
      if (method === "POST" && (path === "/pulls" || path === "/issues")) {
        const input = await body(request);
        const item: Item = {
          number: items.length + 1,
          kind: path === "/pulls" ? "pull" : "issue",
          title: input.title as string,
          body: input.body as string,
          state: "open",
          comments: [],
          ...(path === "/pulls"
            ? { head: input.head as string, base: input.base as string }
            : {}),
        };
        items.push(item);
        return send(201, view(item));
      }
      if (numbered) {
        const item = items[Number(numbered[2]) - 1];
        if (!item || (numbered[1] === "pulls" && item.kind !== "pull"))
          return send(404, { message: "Not Found" });
        const input = await body(request);
        if (method === "POST" && numbered[3]) {
          item.comments.push(input.body as string);
          return send(201, {});
        }
        if (method === "PATCH") {
          Object.assign(item, input);
          return send(200, view(item));
        }
      }
      send(404, { message: "Not Found" });
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  let runs = 0;
  return {
    root,
    origin,
    items,
    requests,
    // Use real npm resolution for the matching, unbuilt product checkout.
    publishedCli(version: string) {
      const packageRoot = join(root, "published package");
      mkdirSync(packageRoot);
      const manifest = {
        name: "@lutzseverino/repo-standards",
        version,
        type: "module",
        bin: { "repo-standards": "cli.mjs" },
      };
      writeFileSync(
        join(packageRoot, "package.json"),
        JSON.stringify(manifest),
      );
      writeFileSync(
        join(packageRoot, "cli.mjs"),
        `#!/usr/bin/env node\nprocess.argv.splice(2, 0, "published", ${JSON.stringify(version)});\nawait import(${JSON.stringify(pathToFileURL(fakeCli).href)});\n`,
      );
      execFileSync("npm", ["pack", "--ignore-scripts"], {
        cwd: packageRoot,
        stdio: "pipe",
        timeout: 30_000,
      });
      published = {
        version,
        manifest,
        tarball: readFileSync(
          join(packageRoot, `lutzseverino-repo-standards-${version}.tgz`),
        ),
      };
      const npx = execFileSync("which", ["npx"], { encoding: "utf8" }).trim();
      writeFileSync(join(bin, "npx"), `#!/bin/sh\nexec "${npx}" "$@"\n`);
      writeFileSync(
        join(seed, "package.json"),
        JSON.stringify({
          ...manifest,
          bin: { "repo-standards": "dist/cli.js" },
        }),
      );
      git(seed, "add", "package.json");
      git(seed, "commit", "--quiet", "-m", "unbuilt product package");
      git(seed, "push", "--quiet", "origin", "HEAD:main");
    },
    scenario(value: Scenario) {
      writeFileSync(scenarioPath, JSON.stringify(value));
    },
    invocations() {
      return readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Invocation);
    },
    // Land a selection on the default branch.
    land(pins: Pins) {
      git(seed, "pull", "--quiet", "origin", "main");
      writeFileSync(
        join(seed, ".repo-standards/selection.yaml"),
        selection(pins),
      );
      git(seed, "commit", "--quiet", "-am", "land");
      git(seed, "push", "--quiet", "origin", "HEAD:main");
    },
    // Refuse every push to the remote, as GitHub refuses one.
    refusePushes(reason: string) {
      mkdirSync(join(origin, "hooks"), { recursive: true });
      const hook = join(origin, "hooks/pre-receive");
      writeFileSync(hook, `#!/bin/sh\necho "${reason}" >&2\nexit 1\n`);
      chmodSync(hook, 0o755);
    },
    branchHead() {
      const result = spawnSync("git", ["rev-parse", `refs/heads/${branch}`], {
        cwd: origin,
        encoding: "utf8",
      });
      return result.status === 0 ? result.stdout.trim() : null;
    },
    // One action run on a fresh checkout of the default branch.
    async run(agentCommand = "", localExecutable = false) {
      const checkout = join(root, `checkout ${++runs}`);
      git(root, "clone", "--quiet", origin, checkout);
      const localBin = join(checkout, "node_modules/.bin");
      if (localExecutable) {
        mkdirSync(localBin, { recursive: true });
        const executable = join(localBin, "repo-standards");
        writeFileSync(
          executable,
          "#!/bin/sh\necho 'local CLI ran' >&2\nexit 99\n",
        );
        chmodSync(executable, 0o755);
        writeFileSync(join(checkout, ".git/info/exclude"), "/node_modules/\n");
      }
      const temporary = join(root, `runner temp ${runs}`);
      mkdirSync(temporary);
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${localExecutable ? `${localBin}:` : ""}${bin}:${process.env.PATH}`,
        GITHUB_WORKSPACE: checkout,
        GITHUB_REPOSITORY: "alice/project",
        GITHUB_API_URL: api,
        RUNNER_TEMP: temporary,
        REPO_STANDARDS_TOKEN: token,
        REPO_STANDARDS_AGENT_COMMAND: agentCommand,
        FAKE_SCENARIO: scenarioPath,
        FAKE_SOURCE: source,
        FAKE_LOG: logPath,
        FAKE_EXPECTED_TOKEN: token,
        FAKE_PROJECT: checkout,
        ...(published
          ? {
              npm_config_registry: `${api}/registry/`,
              npm_config_cache: join(root, "npm cache"),
              npm_config_userconfig: join(root, "empty npmrc"),
            }
          : {}),
        GIT_CONFIG_NOSYSTEM: "1",
      };
      delete env.GH_TOKEN;
      delete env.GITHUB_TOKEN;
      const child = spawn(process.execPath, [actionMain], {
        cwd: checkout,
        env,
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
      const status = await new Promise<number | null>((resolve) =>
        child.on("close", resolve),
      );
      return { status, output, checkout };
    },
    agent(action: "finish" | "give-up") {
      return `"${process.execPath}" "${fakeCli}" agent ${action}`;
    },
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function open(f: Fixture) {
  return f.items.filter((item) => item.state === "open");
}

function mutations(f: Fixture) {
  return f.requests.filter((request) => request.method !== "GET");
}

// The installed Repo Canon pull request validator's verdict.
function validate(f: Fixture, item: Item) {
  const event = join(f.root, `event-${item.number}.json`);
  writeFileSync(
    event,
    JSON.stringify({ pull_request: { title: item.title, body: item.body } }),
  );
  return validateMetadata(event);
}

test("no update opens nothing and closes landed rolling items", async (t) => {
  const f = await fixture(t);
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.1.0" },
    headless: "complete",
  });
  assert.equal((await f.run()).status, 0);
  const pull = f.items[0]!;

  // The update lands some other way: the open pull request closes, and nothing
  // opens.
  f.land({ cli: "9.1.0", standards: "v1.1.0" });
  let before = f.invocations().length;
  const current = await f.run();
  assert.equal(current.status, 0, current.output);
  assert.equal(pull.state, "closed");
  assert.deepEqual(pull.comments, [
    "The update to CLI `9.1.0` and standards `v1.1.0` has landed on `main`, so this is closed.",
  ]);
  assert.equal(f.items.length, 1);
  // Only the pinned check ran: no headless update.
  assert.deepEqual(
    f
      .invocations()
      .slice(before)
      .map((entry) => entry.kind),
    ["npm", "pinned"],
  );

  // A stopped update's issue closes the same way once its update lands.
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.2.0" },
    headless: "stopped",
  });
  assert.equal((await f.run()).status, 0);
  const issue = f.items[1]!;
  assert.equal(issue.kind, "issue");
  f.land({ cli: "9.1.0", standards: "v1.2.0" });
  before = f.invocations().length;
  const landed = await f.run();
  assert.equal(landed.status, 0, landed.output);
  assert.deepEqual(open(f), []);
  assert.match(issue.comments.at(-1)!, /has landed on `main`/);
  assert.deepEqual(
    f
      .invocations()
      .slice(before)
      .map((entry) => entry.kind),
    ["npm", "pinned"],
  );
  assert.equal(f.items.length, 2);
});

test("a complete update gives one branch and one pull request whose body is the record, and the token reaches the CLI as GH_TOKEN", async (t) => {
  const f = await fixture(t);
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.1.0" },
    headless: "complete",
  });
  const result = await f.run();
  assert.equal(result.status, 0, result.output);

  assert.equal(f.items.length, 1);
  const pull = f.items[0]!;
  assert.equal(pull.kind, "pull");
  assert.equal(pull.head, branch);
  assert.equal(pull.base, "main");
  assert.equal(pull.title, "chore: adopt standards v1.1.0 with CLI 9.1.0");
  const head = f.branchHead();
  assert.ok(head);
  assert.equal(
    git(f.origin, "rev-parse", `${head}^`),
    git(f.origin, "rev-parse", "refs/heads/main"),
  );
  assert.deepEqual(
    git(f.origin, "diff", "--name-only", "main", branch).split("\n"),
    [".repo-standards/selection.yaml", "CONTRIBUTING.md"],
  );

  // The body is the record status --summary printed, byte for byte, which
  // reported the update ready to commit before the commit.
  const summaries = f
    .invocations()
    .filter((entry) => entry.args.join(" ") === "status --summary");
  assert.equal(summaries.length, 1);
  assert.equal(pull.body, summaries[0]!.output);
  assert.match(pull.body, /^Ready to commit: yes\.$/m);
  assert.match(pull.body, /\| CLI \| `9\.1\.0` \|/);
  assert.match(pull.body, /\| Standards version \| `v1\.1\.0` \|/);
  const validation = validate(f, pull);
  assert.equal(validation.status, 0, validation.stdout + validation.stderr);

  // The token reached every CLI process as GH_TOKEN, and the forge as bearer
  // authorization; the action's own variable reached none.
  const invocations = f.invocations().filter((entry) => entry.kind !== "agent");
  assert.ok(
    invocations.some(
      (entry) =>
        entry.args.join(" ") === "adopt --headless --json" &&
        entry.version === "9.1.0",
    ),
  );
  assert.ok(invocations.every((entry) => entry.ghToken && !entry.actionToken));
  assert.ok(f.requests.every((request) => request.authorized));
});

test("a standards-only update uses the published CLI outside an unbuilt matching package", async (t) => {
  const f = await fixture(t);
  f.publishedCli("9.0.0");
  f.scenario({
    newest: { cli: "9.0.0", standards: "v1.1.0" },
    headless: "complete",
  });
  const result = await f.run();
  assert.equal(result.status, 0, result.output);
  const pull = f.items[0]!;
  assert.equal(pull.kind, "pull");
  assert.equal(pull.title, "chore: adopt standards v1.1.0 with CLI 9.0.0");
  assert.deepEqual(
    git(f.origin, "diff", "--name-only", "main", branch).split("\n"),
    [".repo-standards/selection.yaml", "CONTRIBUTING.md"],
  );
  const invocations = f
    .invocations()
    .filter((entry) => entry.kind === "newest");
  assert.deepEqual(
    invocations.map((entry) => entry.args.join(" ")),
    ["adopt --headless --json", "status --json", "status --summary"],
  );
  for (const entry of invocations) {
    assert.equal(entry.version, "9.0.0");
    assert.equal(entry.project, result.checkout);
    assert.ok(relative(result.checkout, entry.cwd).startsWith(".."));
    assert.ok(entry.ghToken && !entry.actionToken);
  }
  assert.equal(pull.body, invocations.at(-1)!.output);
  assert.match(pull.body, /^Ready to commit: yes\.$/m);

  // Even a same-name executable in the checkout and on PATH cannot replace
  // the selected published CLI. A newer target refreshes the rolling PR.
  f.scenario({
    newest: { cli: "9.0.0", standards: "v1.2.0" },
    headless: "complete",
  });
  const withLocal = await f.run("", true);
  assert.equal(withLocal.status, 0, withLocal.output);
  assert.equal(f.items.length, 1);
  assert.equal(pull.title, "chore: adopt standards v1.2.0 with CLI 9.0.0");
  assert.deepEqual(
    git(f.origin, "diff", "--name-only", "main", branch).split("\n"),
    [".repo-standards/selection.yaml", "CONTRIBUTING.md"],
  );
});

for (const agent of ["none", "give-up", "finish"] as const) {
  test(`a stopped self-update with agent ${agent} uses the published CLI and intended checkout`, async (t) => {
    const f = await fixture(t);
    f.publishedCli("9.0.0");
    f.scenario({
      newest: { cli: "9.0.0", standards: "v1.1.0" },
      headless: "stopped",
    });
    const result = await f.run(agent === "none" ? "" : f.agent(agent));
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(
      open(f).map((item) => item.kind),
      [agent === "finish" ? "pull" : "issue"],
    );
    const invocations = f.invocations();
    const newest = invocations.filter((entry) => entry.kind === "newest");
    assert.deepEqual(
      newest.map((entry) => entry.args.join(" ")),
      [
        "adopt --headless --json",
        ...(agent !== "none" ? ["status --json"] : []),
        ...(agent === "finish" ? ["status --summary"] : []),
      ],
    );
    for (const entry of newest) {
      assert.equal(entry.version, "9.0.0");
      assert.equal(entry.project, result.checkout);
      assert.ok(relative(result.checkout, entry.cwd).startsWith(".."));
      assert.ok(entry.ghToken && !entry.actionToken);
    }
    if (agent !== "none") {
      const command = invocations.find((entry) => entry.kind === "agent")!;
      assert.equal(command.cwd, result.checkout);
      assert.equal(command.report, "answers-required");
      assert.ok(isAbsolute(command.reportPath!));
      assert.ok(
        relative(result.checkout, command.reportPath!).startsWith(".."),
      );
      assert.ok(!command.ghToken && !command.actionToken);
    }
    if (agent === "finish") {
      assert.equal(f.items[0]!.body, newest.at(-1)!.output);
      assert.match(f.items[0]!.body, /^Ready to commit: yes\.$/m);
      assert.deepEqual(
        git(f.origin, "diff", "--name-only", "main", branch).split("\n"),
        [".repo-standards/selection.yaml", "CONTRIBUTING.md"],
      );
    } else {
      assert.equal(f.branchHead(), null);
      assert.match(f.items[0]!.body, /stopped with outcome `answers-required`/);
    }
  });
}

for (const [name, from, newest, moved] of [
  [
    "a CLI major",
    { cli: "9.0.0", standards: "v1.0.0" },
    { cli: "10.0.0", standards: "v1.0.0" },
    /The CLI pin moves from `9\.0\.0` to `10\.0\.0`, a new major version\./,
  ],
  [
    "a standards major from 1.0",
    { cli: "9.0.0", standards: "v1.0.0" },
    { cli: "9.0.0", standards: "v2.0.0" },
    /standards pin moves from `v1\.0\.0` to `v2\.0\.0`, a new major version\./,
  ],
  [
    "a 0.x standards minor",
    { cli: "9.0.0", standards: "v0.15.0" },
    { cli: "9.0.0", standards: "v0.16.0" },
    /standards pin moves from `v0\.15\.0` to `v0\.16\.0`, a new minor version of a 0\.x release/,
  ],
] as const) {
  test(`${name} gives a chore! pull request with Impact and Migration sections`, async (t) => {
    const f = await fixture(t, from);
    f.scenario({ newest, headless: "complete" });
    const result = await f.run();
    assert.equal(result.status, 0, result.output);
    const pull = f.items[0]!;
    assert.equal(
      pull.title,
      `chore!: adopt standards ${newest.standards} with CLI ${newest.cli}`,
    );
    assert.ok(pull.body.startsWith("# Repository Standards adoption record\n"));
    const [record, sections] = pull.body.split("\n## Impact\n");
    assert.match(record!, /^## Operations$/m);
    assert.match(sections!, moved);
    assert.match(sections!, /Contextual update: 1 declaration differs/);
    assert.match(sections!, /`github-settings\/apply`/);
    assert.match(
      sections!,
      /\n## Migration\n\nBefore merging, read the release notes at /,
    );
    assert.match(sections!, /run the pinned `adopt`/);
    const validation = validate(f, pull);
    assert.equal(validation.status, 0, validation.stdout + validation.stderr);
    // Without the sections the validator rejects the breaking title.
    const bare = validate(f, { ...pull, number: 99, body: `${record}\n` });
    assert.equal(bare.status, 1);
    assert.match(bare.stderr, /Impact/);
  });
}

test("rerunning with the same target changes nothing, and a newer release refreshes the same pull request", async (t) => {
  const f = await fixture(t);
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.1.0" },
    headless: "complete",
  });
  assert.equal((await f.run()).status, 0);
  const head = f.branchHead();
  const writes = mutations(f).length;
  const pull = structuredClone(f.items[0]!);

  const again = await f.run();
  assert.equal(again.status, 0, again.output);
  assert.equal(f.branchHead(), head);
  assert.equal(mutations(f).length, writes);
  assert.deepEqual(f.items, [pull]);
  assert.ok(
    !f
      .invocations()
      .slice(-2)
      .some((entry) => entry.args[0] === "adopt"),
  );

  f.scenario({
    newest: { cli: "9.2.0", standards: "v1.2.0" },
    headless: "complete",
  });
  const newer = await f.run();
  assert.equal(newer.status, 0, newer.output);
  assert.equal(f.items.length, 1);
  const refreshed = f.items[0]!;
  assert.equal(refreshed.number, pull.number);
  assert.equal(refreshed.state, "open");
  assert.equal(refreshed.title, "chore: adopt standards v1.2.0 with CLI 9.2.0");
  assert.match(refreshed.body, /\| Standards version \| `v1\.2\.0` \|/);
  assert.notEqual(f.branchHead(), head);
  assert.equal(
    git(f.origin, "rev-parse", `${f.branchHead()}^`),
    git(f.origin, "rev-parse", "refs/heads/main"),
  );
  assert.deepEqual(refreshed.comments, []);
});

test("a stop without an agent command opens one issue, refreshed on a newer release and closed when the update lands", async (t) => {
  const f = await fixture(t);
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.1.0" },
    headless: "stopped",
  });
  const result = await f.run();
  assert.equal(result.status, 0, result.output);
  assert.equal(f.branchHead(), null);
  assert.equal(f.items.length, 1);
  const issue = f.items[0]!;
  assert.equal(issue.kind, "issue");
  assert.equal(
    issue.title,
    "Finish the Repo Standards update to standards v1.1.0 with CLI 9.1.0",
  );
  assert.match(issue.body, /^### Problem\n/);
  assert.match(issue.body, /\n### Desired outcome\n/);
  assert.match(issue.body, /stopped with outcome `answers-required`/);
  assert.match(issue.body, /The CLI pin moves from `9\.0\.0` to `9\.1\.0`\./);
  assert.match(
    issue.body,
    /- `scope:project-docs`: Which files does project-docs cover\?\n/,
  );
  assert.match(
    issue.body,
    /- `remote-setup`: Defer the remote setup that is not ready\? A prefilled proposal awaits review\./,
  );
  assert.match(
    issue.body,
    /- Blocker `SOURCE_CHANGED`: The source moved its tag\./,
  );
  assert.match(
    issue.body,
    /Adopter action: Contextual update: 1 declaration differs from the retained inputs\. It defers remote setup, which the next local `adopt` applies once its probe is ready: `github-settings\/apply`\./,
  );
  assert.match(
    issue.body,
    /npx --yes @lutzseverino\/repo-standards@9\.1\.0 adopt --json/,
  );

  const writes = mutations(f).length;
  assert.equal((await f.run()).status, 0);
  assert.equal(mutations(f).length, writes);

  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.2.0" },
    headless: "stopped",
  });
  assert.equal((await f.run()).status, 0);
  assert.equal(f.items.length, 1);
  assert.equal(issue.state, "open");
  assert.match(issue.title, /standards v1\.2\.0 with CLI 9\.1\.0$/);
  assert.match(issue.body, /\{"cli":"9\.1\.0","standards":"v1\.2\.0"\}/);

  f.land({ cli: "9.1.0", standards: "v1.2.0" });
  assert.equal((await f.run()).status, 0);
  assert.equal(issue.state, "closed");
  assert.deepEqual(issue.comments, [
    "The update to CLI `9.1.0` and standards `v1.2.0` has landed on `main`, so this is closed.",
  ]);
  assert.equal(f.items.length, 1);
});

test("an agent command that leaves the update ready to commit gives a pull request, and one that does not gives an issue", async (t) => {
  const f = await fixture(t);
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.1.0" },
    headless: "stopped",
  });
  const gaveUp = await f.run(f.agent("give-up"));
  assert.equal(gaveUp.status, 0, gaveUp.output);
  assert.deepEqual(
    open(f).map((item) => item.kind),
    ["issue"],
  );
  assert.match(
    f.items[0]!.body,
    /the agent command, which exited 0, did not leave it ready to commit/,
  );
  assert.match(f.items[0]!.body, /- The update has not completed\./);

  // A newer release that the agent finishes replaces the issue with a pull
  // request, linking it from the closed issue.
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.2.0" },
    headless: "stopped",
  });
  const finished = await f.run(f.agent("finish"));
  assert.equal(finished.status, 0, finished.output);
  const agents = f.invocations().filter((entry) => entry.kind === "agent");
  assert.deepEqual(
    agents.map((entry) => [entry.args[0], entry.report, entry.actionToken]),
    [
      ["give-up", "answers-required", false],
      ["finish", "answers-required", false],
    ],
  );
  const [issue, pull] = f.items;
  assert.equal(issue!.state, "closed");
  assert.deepEqual(issue!.comments, [
    "Superseded by https://github.com/alice/project/pull/2, which carries the newest Repo Standards update.",
  ]);
  assert.equal(pull!.kind, "pull");
  assert.equal(pull!.state, "open");
  assert.equal(pull!.title, "chore: adopt standards v1.2.0 with CLI 9.1.0");
  assert.ok(f.branchHead());
});

test("a refused push opens the issue naming the reason, and closes the superseded pull request", async (t) => {
  const f = await fixture(t);
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.1.0" },
    headless: "complete",
  });
  assert.equal((await f.run()).status, 0);
  const head = f.branchHead();
  const reason =
    "refusing to allow a GitHub App to create or update workflow .github/workflows/ci.yml without workflows permission";
  f.refusePushes(reason);
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.2.0" },
    headless: "complete",
  });
  const result = await f.run();
  assert.equal(result.status, 0, result.output);
  assert.equal(f.branchHead(), head);
  const [pull, issue] = f.items;
  assert.equal(issue!.kind, "issue");
  assert.equal(issue!.state, "open");
  assert.match(
    issue!.body,
    /pushing the rolling branch `repo-standards\/update` was refused/,
  );
  assert.ok(issue!.body.includes(reason));
  assert.doesNotMatch(issue!.body, new RegExp(token));
  assert.equal(pull!.state, "closed");
  assert.deepEqual(pull!.comments, [
    "Superseded by https://github.com/alice/project/issues/2, which carries the newest Repo Standards update.",
  ]);
});

test("an unknown pin fails with its reason and opens or changes nothing", async (t) => {
  const f = await fixture(t);
  f.scenario({
    newest: { cli: "9.1.0", standards: "v1.1.0" },
    headless: "complete",
    unknown: true,
  });
  const result = await f.run();
  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /::error title=Repo Standards update::The available update is unknown for the standards pin \(SOURCE_UNAVAILABLE: GitHub returned HTTP 503\.\)/,
  );
  assert.deepEqual(f.items, []);
  assert.deepEqual(mutations(f), []);
  assert.equal(f.branchHead(), null);
});
