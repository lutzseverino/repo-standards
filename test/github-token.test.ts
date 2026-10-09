import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fixtureFiles, installCli, sourceFixture } from "./installed-cli.ts";
import { githubFixture } from "./github-fixture.ts";
import {
  commit,
  inspectionArgs,
  manifest,
  startArgs,
} from "./remote-fixture.ts";
import { registryFixture } from "./registry-fixture.ts";
import type {
  ErrorReport,
  Inspection,
  OutdatedReport,
  SearchReport,
} from "./json-reports.ts";

const cli = installCli();
after(() => cli.close());
const tokens = {
  GH_TOKEN: "sentinel-gh-205-do-not-record",
  GITHUB_TOKEN: "sentinel-github-205-do-not-record",
};
const yaml = manifest({
  readme: { kind: "file", target: "README.md", exact: "readme.md" },
});
const searchPath =
  "/search/repositories?q=topic%3Arepo-standards%20is%3Apublic&per_page=30&page=1";
const releasePath = "/repos/alice/standards/releases?per_page=100&page=1";
const released = {
  tag_name: "v1.0.0",
  name: "Stable",
  published_at: "2026-10-01T00:00:00Z",
  draft: false,
  prerelease: false,
};

function publishSearch(remote: Awaited<ReturnType<typeof githubFixture>>) {
  remote.responses[`https://api.github.com${searchPath}`] = {
    body: {
      total_count: 1,
      incomplete_results: false,
      items: [
        { full_name: "alice/standards", private: false, description: null },
      ],
    },
  };
  remote.responses[`https://api.github.com${releasePath}`] = {
    body: [released],
  };
  remote.save();
}

interface Request {
  path: string;
  kind: "rest" | "git";
  authorized: boolean;
  matchesGh: boolean;
  matchesGithub: boolean;
  accept?: string;
  apiVersion?: string;
  userAgent?: string;
}

function requests(remote: Awaited<ReturnType<typeof githubFixture>>) {
  return readFileSync(remote.requestFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Request);
}

function noTokens(outputs: string[], roots: string[]) {
  for (const token of Object.values(tokens)) {
    for (const output of outputs)
      assert.equal(output.includes(token), false, "Credential in CLI output");
    for (const root of roots) {
      for (const [path, bytes] of Object.entries(fixtureFiles(root))) {
        assert.equal(path.includes(token), false, "Credential in filename");
        assert.equal(bytes.includes(token), false, `Credential in ${path}`);
      }
    }
  }
}

test("inspection authenticates every REST endpoint, keeps Git anonymous, and preserves identity without storing tokens", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const annotation = "a".repeat(40);
  remote.responses[`${remote.prefix}/git/ref/tags/v1.0.0`] = {
    body: { ref: "refs/tags/v1.0.0", object: { type: "tag", sha: annotation } },
  };
  remote.responses[`${remote.prefix}/git/tags/${annotation}`] = {
    body: { object: { type: "commit", sha: remote.sha } },
  };
  remote.save();
  let identity: string | undefined;
  const outputs: string[] = [];
  for (const [env, expected] of [
    [{}, "absent"],
    [{ GH_TOKEN: "", GITHUB_TOKEN: "" }, "absent"],
    [{ GH_TOKEN: tokens.GH_TOKEN }, "gh"],
    [{ GITHUB_TOKEN: tokens.GITHUB_TOKEN }, "github"],
    [{ GH_TOKEN: "", GITHUB_TOKEN: tokens.GITHUB_TOKEN }, "github"],
    [tokens, "gh"],
  ] as const) {
    const before = requests(remote).length;
    const result = cli.run(inspectionArgs, project.root, {
      ...remote.env,
      ...env,
    });
    outputs.push(result.stdout, result.stderr);
    assert.equal(result.status, 0, "Inspection succeeds");
    const report = JSON.parse(result.stdout) as Inspection;
    identity ??= report.identity;
    assert.equal(report.identity, identity);
    const observed = requests(remote).slice(before);
    const rest = observed.filter((request) => request.kind === "rest");
    assert.equal(rest.length, 5);
    for (const request of rest) {
      assert.equal(request.authorized, expected !== "absent");
      assert.equal(request.matchesGh, expected === "gh");
      assert.equal(request.matchesGithub, expected === "github");
      assert.equal(request.accept, "application/vnd.github+json");
      assert.equal(request.apiVersion, "2022-11-28");
      assert.equal(request.userAgent, "repo-standards");
    }
    const git = observed.filter((request) => request.kind === "git");
    assert.ok(git.length > 0);
    assert.ok(git.every((request) => !request.authorized));
  }
  noTokens(outputs, [project.root, remote.support.root, remote.env.TMPDIR]);
});

test("inspection trims tokens, treats whitespace as absent, and never scans an unused token", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  const outputs: string[] = [];
  for (const [env, expected] of [
    [{ GH_TOKEN: " \t ", GITHUB_TOKEN: tokens.GITHUB_TOKEN }, "github"],
    [{ GH_TOKEN: `  ${tokens.GH_TOKEN}  `, GITHUB_TOKEN: " " }, "gh"],
    [{ GH_TOKEN: tokens.GH_TOKEN, GITHUB_TOKEN: "b" }, "gh"],
    [{ GH_TOKEN: "", GITHUB_TOKEN: `  ${tokens.GITHUB_TOKEN}  ` }, "github"],
    [{ GH_TOKEN: " \t ", GITHUB_TOKEN: "  " }, "absent"],
  ] as const) {
    const before = requests(remote).length;
    const result = cli.run(inspectionArgs, project.root, {
      ...remote.env,
      ...env,
    });
    outputs.push(result.stdout, result.stderr);
    assert.equal(
      result.status,
      0,
      "Only the trimmed, selected token affects inspection",
    );
    const rest = requests(remote)
      .slice(before)
      .filter((request) => request.kind === "rest");
    assert.equal(rest.length, 4);
    assert.ok(
      rest.every((request) => request.authorized === (expected !== "absent")),
    );
    assert.ok(
      rest.every((request) => request.matchesGh === (expected === "gh")),
    );
    assert.ok(
      rest.every(
        (request) => request.matchesGithub === (expected === "github"),
      ),
    );
  }
  noTokens(outputs, [project.root, remote.support.root, remote.env.TMPDIR]);
});

test("CLI Git subprocesses receive neither REST token while GitHub REST requests remain authenticated", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const bin = join(remote.support.root, "bin");
  mkdirSync(bin);
  const log = join(remote.support.root, "git-environment.jsonl");
  writeFileSync(log, "");
  const wrapper = join(bin, "git");
  writeFileSync(
    wrapper,
    `#!${process.execPath}
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify({
  fetch: args.includes('fetch'),
  ghPresent: Object.hasOwn(process.env, 'GH_TOKEN'),
  githubPresent: Object.hasOwn(process.env, 'GITHUB_TOKEN')
}) + '\\n');
const result = spawnSync(${JSON.stringify(realGit)}, args, {stdio: 'inherit'});
process.exit(result.status ?? 1);
`,
  );
  chmodSync(wrapper, 0o755);
  const env = { ...remote.env, ...tokens, PATH: `${bin}:${process.env.PATH}` };
  const outputs: string[] = [];
  for (const args of [inspectionArgs, ["source", "search", "--json"]]) {
    publishSearch(remote);
    const result = cli.run(args, project.root, env);
    outputs.push(result.stdout, result.stderr);
    assert.equal(result.status, 0);
  }
  const observed = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          fetch: boolean;
          ghPresent: boolean;
          githubPresent: boolean;
        },
    );
  assert.ok(observed.some((entry) => entry.fetch));
  assert.ok(
    observed.every((entry) => !entry.ghPresent && !entry.githubPresent),
  );
  assert.ok(
    requests(remote)
      .filter((request) => request.kind === "rest")
      .every((request) => request.matchesGh),
  );
  assert.ok(
    requests(remote)
      .filter((request) => request.kind === "git")
      .every((request) => !request.authorized),
  );
  noTokens(outputs, [project.root, remote.support.root, remote.env.TMPDIR]);
});

test("inspect and start classify quota headers, keep ordinary failures, and never retry a rejected token anonymously", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const identity = (
    JSON.parse(
      cli.run(inspectionArgs, project.root, remote.env).stdout,
    ) as Inspection
  ).identity;
  const outputs: string[] = [];
  for (const [status, headers, code, retry] of [
    [
      403,
      { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "2000000000" },
      "QUOTA_EXHAUSTED",
      "2033-05-18T03:33:20.000Z",
    ],
    [403, { "retry-after": "120" }, "QUOTA_EXHAUSTED", "120 seconds"],
    [
      403,
      {
        "x-ratelimit-remaining": "0",
        "retry-after": "120",
        "x-ratelimit-reset": "2000000000",
      },
      "QUOTA_EXHAUSTED",
      "120 seconds",
    ],
    [
      429,
      { "retry-after": "Wed, 18 May 2033 03:33:20 GMT" },
      "QUOTA_EXHAUSTED",
      "2033-05-18T03:33:20.000Z",
    ],
    [
      429,
      {
        "retry-after": "Sat, 01 Jan 2000 00:00:00 GMT",
        "x-ratelimit-reset": "2000000000",
      },
      "QUOTA_EXHAUSTED",
      "2033-05-18T03:33:20.000Z",
    ],
    [
      429,
      { "retry-after": "Sat, 01 Jan 2000 00:00:00 GMT" },
      "QUOTA_EXHAUSTED",
      null,
    ],
    [
      403,
      { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "946684800" },
      "QUOTA_EXHAUSTED",
      null,
    ],
    [429, {}, "QUOTA_EXHAUSTED", null],
    [
      403,
      {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "invalid",
        "retry-after": "bad",
      },
      "QUOTA_EXHAUSTED",
      null,
    ],
    [
      429,
      {
        "x-ratelimit-reset": "99999999999999999999999999",
        "retry-after": "30",
      },
      "QUOTA_EXHAUSTED",
      "30 seconds",
    ],
    [403, { "x-ratelimit-remaining": "1" }, "SOURCE_UNAVAILABLE", null],
    [404, {}, "SOURCE_UNAVAILABLE", null],
    [401, {}, "SOURCE_UNAVAILABLE", null],
  ] as const) {
    remote.responses[remote.prefix] = {
      status,
      headers,
      body: {},
      reflectToken: true,
    };
    remote.save();
    for (const args of [inspectionArgs, startArgs(identity)]) {
      for (const env of [remote.env, { ...remote.env, ...tokens }]) {
        const before = requests(remote).length;
        const result = cli.run(args, project.root, env);
        outputs.push(result.stdout, result.stderr);
        assert.equal(result.status, 1);
        const error = (JSON.parse(result.stdout) as ErrorReport).errors[0]!;
        assert.equal(error.code, code);
        const observed = requests(remote).slice(before);
        assert.equal(observed.length, 1, "No anonymous retry");
        if (code === "QUOTA_EXHAUSTED") {
          assert.match(error.message, /GH_TOKEN/);
          assert.match(error.message, /GITHUB_TOKEN/);
          if (retry) assert.ok(error.message.includes(retry));
          else assert.doesNotMatch(error.message, /Retry at|Retry after/);
        } else if (status === 401) {
          assert.equal(error.message.includes("rejected"), !!env.GH_TOKEN);
          if (env.GH_TOKEN) {
            assert.match(error.message, /GH_TOKEN/);
            assert.match(error.message, /GITHUB_TOKEN/);
            assert.ok(observed[0]!.matchesGh);
          }
        }
      }
    }
  }
  const summary = cli.run(
    inspectionArgs.map((arg) => (arg === "--json" ? "--summary" : arg)),
    project.root,
    { ...remote.env, ...tokens },
  );
  assert.equal(summary.status, 1);
  assert.match(summary.stderr, /SOURCE_UNAVAILABLE/);
  outputs.push(summary.stdout, summary.stderr);
  noTokens(outputs, [project.root, remote.support.root, remote.env.TMPDIR]);
});

test("authenticated search fails the whole page when quota runs out in the page, release list, or candidate acquisition", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  publishSearch(remote);
  const outputs: string[] = [];
  for (const path of [
    searchPath,
    releasePath,
    "/repos/alice/standards/git/commits/" + remote.sha,
  ]) {
    const key = `https://api.github.com${path}`;
    const original = remote.responses[key]!;
    remote.responses[key] = {
      status: 429,
      headers: { "retry-after": "45" },
      body: {},
      reflectToken: true,
    };
    remote.save();
    for (const json of [true, false]) {
      const before = requests(remote).length;
      const result = cli.run(
        ["source", "search", ...(json ? ["--json"] : [])],
        project.root,
        { ...remote.env, ...tokens },
      );
      outputs.push(result.stdout, result.stderr);
      assert.equal(result.status, 1);
      if (json) {
        const report = JSON.parse(result.stdout) as ErrorReport;
        assert.equal(report.errors[0]!.code, "QUOTA_EXHAUSTED");
        assert.match(report.errors[0]!.message, /45 seconds/);
        assert.equal("rejected" in report, false);
      } else assert.match(result.stderr, /QUOTA_EXHAUSTED/);
      assert.ok(
        requests(remote)
          .slice(before)
          .every((request) => request.matchesGh),
      );
    }
    remote.responses[key] = original;
    remote.save();
  }
  for (const env of [{}, { GITHUB_TOKEN: tokens.GITHUB_TOKEN }, tokens]) {
    const before = requests(remote).length;
    const result = cli.run(["source", "search", "--json"], project.root, {
      ...remote.env,
      ...env,
    });
    outputs.push(result.stdout, result.stderr);
    assert.equal(result.status, 0);
    assert.equal(
      (JSON.parse(result.stdout) as SearchReport).candidates.length,
      1,
    );
    const rest = requests(remote)
      .slice(before)
      .filter((request) => request.kind === "rest");
    assert.equal(rest.length, 6);
    assert.ok(
      rest.every((request) => request.authorized === "GITHUB_TOKEN" in env),
    );
    if ("GH_TOKEN" in env)
      assert.ok(rest.every((request) => request.matchesGh));
    else if ("GITHUB_TOKEN" in env)
      assert.ok(rest.every((request) => request.matchesGithub));
  }
  remote.responses[`https://api.github.com${releasePath}`] = {
    status: 403,
    body: {},
  };
  remote.save();
  const other = cli.run(["source", "search", "--json"], project.root, {
    ...remote.env,
    ...tokens,
  });
  outputs.push(other.stdout, other.stderr);
  assert.equal(other.status, 0);
  assert.equal(
    (JSON.parse(other.stdout) as SearchReport).rejected[0]!.code,
    "SOURCE_UNAVAILABLE",
  );
  noTokens(outputs, [project.root, remote.support.root, remote.env.TMPDIR]);
});

test("a token cannot make private metadata an adoptable source", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  remote.responses[remote.prefix] = {
    body: { private: true, full_name: "alice/standards" },
  };
  remote.save();
  const result = cli.run(inspectionArgs, project.root, {
    ...remote.env,
    ...tokens,
  });
  assert.equal(result.status, 1);
  assert.equal(
    (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
    "UNSUPPORTED_SOURCE",
  );
  assert.ok(requests(remote)[0]!.matchesGh);
  noTokens(
    [result.stdout, result.stderr],
    [project.root, remote.support.root, remote.env.TMPDIR],
  );
});

test("redirects, disconnected requests, and credential-reflecting bodies never disclose tokens", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const redirected = await githubFixture(
    yaml,
    { "readme.md": "README" },
    tokens,
  );
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    redirected.close();
    project.close();
  });
  const outputs: string[] = [];
  const env = { ...remote.env, ...tokens };
  for (const destination of [remote, redirected]) {
    remote.responses[remote.prefix] = {
      status: 302,
      headers: { location: `${destination.origin}/redirected` },
      body: {},
    };
    destination.responses["https://api.github.com/redirected"] = {
      status: 401,
      body: {},
      reflectToken: true,
    };
    destination.save();
    remote.save();
    const before = requests(destination).length;
    const result = cli.run(inspectionArgs, project.root, env);
    outputs.push(result.stdout, result.stderr);
    assert.equal(result.status, 1);
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      "SOURCE_UNAVAILABLE",
    );
    const final = requests(destination)
      .slice(before)
      .find((request) => request.path === "/redirected")!;
    const message = (JSON.parse(result.stdout) as ErrorReport).errors[0]!
      .message;
    assert.equal(message.includes("rejected"), destination === remote);
    if (destination !== remote) assert.match(message, /redirect target.*401/i);
    assert.equal(
      final.authorized,
      destination === remote,
      "Cross-origin redirects strip authorization",
    );
    assert.equal(final.matchesGh, destination === remote);
  }
  for (const entry of [
    { body: {}, disconnect: true },
    { body: {}, malformed: true },
    { body: {}, reflectToken: true },
    { status: 500, body: {}, reflectToken: true },
  ]) {
    remote.responses[remote.prefix] = entry;
    remote.save();
    const result = cli.run(inspectionArgs, project.root, env);
    outputs.push(result.stdout, result.stderr);
    assert.equal(result.status, 1);
  }
  noTokens(outputs, [
    project.root,
    remote.support.root,
    remote.env.TMPDIR,
    redirected.support.root,
    redirected.env.TMPDIR,
  ]);
});

test("start retains no tokens in inputs, reports, runtime logs or caches, and outdated uses the shared authentication and quota classification", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  commit(project.root);
  const env = {
    ...remote.env,
    ...registry.env,
    ...tokens,
    npm_config_cache: join(remote.support.root, "npm-cache"),
  };
  const inspection = cli.run(inspectionArgs, project.root, env);
  assert.equal(inspection.status, 0);
  const report = JSON.parse(inspection.stdout) as Inspection;
  const summary = cli.run(
    inspectionArgs.map((arg) => (arg === "--json" ? "--summary" : arg)),
    project.root,
    env,
  );
  assert.equal(summary.status, 0);
  assert.ok(summary.stdout.includes(report.identity));
  const before = requests(remote).length;
  const started = cli.run(startArgs(report.identity), project.root, env);
  assert.equal(started.status, 0, "Start completes");
  const acquired = requests(remote).slice(before);
  assert.ok(
    acquired
      .filter((request) => request.kind === "rest")
      .every((request) => request.matchesGh),
  );
  assert.ok(
    acquired
      .filter((request) => request.kind === "git")
      .every((request) => !request.authorized),
  );
  assert.ok(
    readFileSync(
      join(project.root, ".repo-standards/inputs/source/readme.md"),
      "utf8",
    ).includes("README"),
  );
  const outputs = [
    inspection.stdout,
    inspection.stderr,
    summary.stdout,
    summary.stderr,
    started.stdout,
    started.stderr,
  ];
  const key = `${remote.prefix}/releases?per_page=100`;
  for (const tokenEnv of [
    {},
    { GH_TOKEN: tokens.GH_TOKEN },
    { GITHUB_TOKEN: tokens.GITHUB_TOKEN },
    tokens,
    { GH_TOKEN: "", GITHUB_TOKEN: "" },
  ]) {
    rmSync(join(project.root, ".repo-standards/cache/outdated.json"), {
      force: true,
    });
    remote.responses[key] = { body: [released] };
    remote.save();
    const logged = requests(remote).length;
    const result = cli.run(["outdated", "--json"], project.root, {
      ...env,
      GH_TOKEN: "",
      GITHUB_TOKEN: "",
      ...tokenEnv,
    });
    outputs.push(result.stdout, result.stderr);
    assert.equal(result.status, 0);
    assert.equal(
      (JSON.parse(result.stdout) as OutdatedReport).standards.update,
      "none",
    );
    const observed = requests(remote).slice(logged);
    assert.equal(observed.length, 1);
    assert.equal(
      observed[0]!.authorized,
      !!(tokenEnv.GH_TOKEN || tokenEnv.GITHUB_TOKEN),
    );
    if (tokenEnv.GH_TOKEN) assert.ok(observed[0]!.matchesGh);
    else if (tokenEnv.GITHUB_TOKEN) assert.ok(observed[0]!.matchesGithub);
    noTokens(outputs, [project.root, remote.support.root, remote.env.TMPDIR]);
  }
  for (const entry of [
    {
      status: 403,
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "2000000000",
      },
      body: {},
    },
    { status: 403, headers: { "retry-after": "90" }, body: {} },
    { status: 429, body: {} },
    { status: 401, body: {} },
  ]) {
    rmSync(join(project.root, ".repo-standards/cache/outdated.json"), {
      force: true,
    });
    remote.responses[key] = { ...entry, reflectToken: true };
    remote.save();
    const logged = requests(remote).length;
    const result = cli.run(["outdated", "--json"], project.root, env);
    outputs.push(result.stdout, result.stderr);
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout) as OutdatedReport;
    assert.equal(report.standards.update, "unknown");
    assert.equal(
      report.standards.reason!.code,
      entry.status === 401 ? "SOURCE_UNAVAILABLE" : "QUOTA_EXHAUSTED",
    );
    assert.match(report.standards.reason!.message, /GH_TOKEN/);
    assert.match(report.standards.reason!.message, /GITHUB_TOKEN/);
    assert.equal(requests(remote).length - logged, 1);
    const cached = JSON.parse(
      readFileSync(
        join(project.root, ".repo-standards/cache/outdated.json"),
        "utf8",
      ),
    ) as { lookups: { standards?: unknown } };
    assert.equal(cached.lookups.standards, undefined);
  }
  noTokens(outputs, [
    project.root,
    remote.support.root,
    remote.env.TMPDIR,
    cli.root,
  ]);
});
