import type {
  ErrorReport,
  Inspection,
  OutdatedReport,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { inc } from "semver";
import { stringify } from "yaml";
import { installCli, snapshot, sourceFixture } from "./installed-cli.ts";
import { registryFixture } from "./registry-fixture.ts";
import { commit, inspectionArgs, remoteFixture } from "./remote-fixture.ts";

const cli = installCli();
const patch = inc(cli.version, "patch")!;
const minor = inc(cli.version, "minor")!;
const candidate = `${inc(cli.version, "major")!}-rc.1`;
const remote = remoteFixture(
  stringify({
    format: "repo-standards/v2",
    name: "outdated-standards",
    description: "Available update fixture",
    requires: { "repo-standards": ">=1.0.0" },
    defaults: {
      declarations: {
        instructions: { kind: "file", target: "AGENTS.md", exact: "agents.md" },
      },
    },
    profiles: { work: { description: "Work", declarations: {} } },
  }),
  { "agents.md": "Instructions" },
  [],
  "alice/standards",
  true,
);
const releasesUrl = `${remote.prefix}/releases?per_page=100`;
// GitHub lists releases newest first. Drafts, prereleases (by flag or by tag),
// and non-SemVer tags are not stable releases.
const releases = [
  {
    id: 1,
    name: null,
    published_at: "2026-10-01T00:00:00Z",
    tag_name: "v2.0.0-rc.1",
    draft: false,
    prerelease: false,
  },
  {
    id: 1,
    name: null,
    published_at: "2026-10-01T00:00:00Z",
    tag_name: "v1.9.0",
    draft: true,
    prerelease: false,
  },
  {
    id: 1,
    name: null,
    published_at: "2026-10-01T00:00:00Z",
    tag_name: "v1.8.0",
    draft: false,
    prerelease: true,
  },
  {
    id: 1,
    name: null,
    published_at: "2026-10-01T00:00:00Z",
    tag_name: "nightly",
    draft: false,
    prerelease: false,
  },
  {
    id: 1,
    name: null,
    published_at: "2026-10-01T00:00:00Z",
    tag_name: "v1.1.0",
    draft: false,
    prerelease: false,
  },
  {
    id: 1,
    name: null,
    published_at: "2026-10-01T00:00:00Z",
    tag_name: "v1.0.1",
    draft: false,
    prerelease: false,
  },
  {
    id: 1,
    name: null,
    published_at: "2026-10-01T00:00:00Z",
    tag_name: "v1.0.0",
    draft: false,
    prerelease: false,
  },
];
const adopted = sourceFixture("", { "README.md": "Project" });
let registry: Awaited<ReturnType<typeof registryFixture>>;
after(() => {
  registry?.close();
  remote.close();
  adopted.close();
  cli.close();
});

before(async () => {
  commit(adopted.root);
  // The registry offers a prerelease above every stable version it publishes.
  registry = await registryFixture(cli.root, [
    cli.version,
    patch,
    minor,
    candidate,
  ]);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(
    cli.run(inspectionArgs, adopted.root, env).stdout,
  ) as Inspection;
  const started = cli.run(
    ["start", ...inspectionArgs.slice(1), "--identity", inspection.identity],
    adopted.root,
    env,
  );
  assert.equal(started.status, 0, started.stdout + started.stderr);
  commit(adopted.root);
});

function checkout(t: TestContext) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "repo-standards-outdated-")),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["clone", "--quiet", adopted.root, root]);
  return root;
}

function publishReleases(
  t: TestContext,
  entry:
    | { body: unknown; status?: number; headers?: Record<string, string> }
    | undefined,
) {
  if (entry) remote.responses[releasesUrl] = entry;
  else delete remote.responses[releasesUrl];
  remote.save();
  t.after(() => {
    delete remote.responses[releasesUrl];
    remote.save();
  });
}

function environment(overrides: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...remote.env, ...registry.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return { ...env, ...overrides };
}

async function closedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function outdated(root: string, env: NodeJS.ProcessEnv) {
  const logged = remote.requestLog().length;
  const result = cli.run(["outdated", "--json"], root, env);
  return {
    result,
    report: JSON.parse(result.stdout) as OutdatedReport,
    requests: remote.requestLog().slice(logged),
  };
}

function gitStatus(root: string) {
  return execFileSync(
    "git",
    [
      "--no-optional-locks",
      "-C",
      root,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ],
    { encoding: "utf8" },
  );
}

test("outdated reports the newest stable CLI and standards versions and the stable releases since each pin", (t) => {
  const root = checkout(t);
  publishReleases(t, { body: releases });
  const { result, report, requests } = outdated(root, environment());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.format, "repo-standards/outdated/v1");
  assert.deepEqual(
    { ...report.cli, checkedAt: undefined },
    {
      package: "@lutzseverino/repo-standards",
      pinned: cli.version,
      update: "available",
      newest: minor,
      newerStableReleases: 2,
      cached: false,
      checkedAt: undefined,
    },
  );
  assert.deepEqual(
    { ...report.standards, checkedAt: undefined },
    {
      repository: "https://github.com/alice/standards",
      pinned: "v1.0.0",
      update: "available",
      newest: "v1.1.0",
      newerStableReleases: 2,
      cached: false,
      checkedAt: undefined,
    },
  );
  assert.ok(Number.isFinite(Date.parse(report.cli.checkedAt!)));
  assert.equal(
    requests.filter((request) =>
      request.url.startsWith(registry.env.npm_config_registry),
    ).length,
    1,
  );
  assert.deepEqual(
    requests
      .filter((request) => request.url.startsWith("https://api.github.com/"))
      .map((request) => request.url),
    [releasesUrl],
  );
});

test("outdated finds stable releases past the first hundred entries", (t) => {
  const root = checkout(t);
  const page2 = `${releasesUrl}&page=2`;
  const release = {
    id: 1,
    tag_name: "v1.0.0",
    name: null,
    published_at: "2026-10-01T00:00:00Z",
    draft: false,
    prerelease: false,
  };
  publishReleases(t, {
    body: Array.from({ length: 100 }, (_, index) => ({
      ...release,
      id: index + 1,
      tag_name: `v8.0.0-beta.${index}`,
      prerelease: true,
    })),
    headers: { link: `<${page2}>; rel="next"` },
  });
  remote.responses[page2] = {
    body: [
      { ...release, id: 101, tag_name: "v9.0.0", draft: true },
      { ...release, id: 102, tag_name: "v7.0.0", prerelease: true },
      { ...release, id: 103, tag_name: "v1.2.0" },
      release,
    ],
  };
  remote.save();
  t.after(() => {
    delete remote.responses[page2];
    remote.save();
  });
  const { result, report, requests } = outdated(root, environment());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.standards.update, "available");
  assert.equal(report.standards.newest, "v1.2.0");
  assert.equal(report.standards.newerStableReleases, 1);
  assert.deepEqual(
    requests
      .filter((request) => request.url.startsWith(remote.prefix))
      .map((request) => request.url),
    [releasesUrl, page2],
  );
});

test("a pin at the newest stable version reports no available update", (t) => {
  const root = checkout(t);
  publishReleases(t, {
    body: releases.filter(
      (release) =>
        release.tag_name !== "v1.1.0" && release.tag_name !== "v1.0.1",
    ),
  });
  const { result, report } = outdated(root, environment());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.standards.update, "none");
  assert.equal(report.standards.newest, "v1.0.0");
  assert.equal(report.standards.newerStableReleases, 0);
});

test("a second invocation within a day answers from the ignored product cache and changes nothing else in a dirty project", (t) => {
  const root = checkout(t);
  publishReleases(t, { body: releases });
  writeFileSync(join(root, "README.md"), "Uncommitted edit");
  writeFileSync(join(root, "NOTES.md"), "Untracked notes");
  const status = gitStatus(root);
  const project = snapshot(root);
  const first = outdated(root, environment());
  assert.equal(
    first.result.status,
    0,
    first.result.stdout + first.result.stderr,
  );
  assert.equal(first.requests.length, 2);
  const second = outdated(root, environment());
  assert.equal(
    second.result.status,
    0,
    second.result.stdout + second.result.stderr,
  );
  assert.deepEqual(second.requests, []);
  assert.deepEqual(second.report, {
    ...first.report,
    cli: { ...first.report.cli, cached: true },
    standards: { ...first.report.standards, cached: true },
  });
  assert.equal(gitStatus(root), status);
  assert.ok(readdirSync(join(root, ".repo-standards/cache")).length > 0);
  rmSync(join(root, ".repo-standards/cache"), { recursive: true });
  assert.deepEqual(snapshot(root), project);
});

test("an unreachable registry leaves the CLI pin unknown and still answers the standards pin", async (t) => {
  const root = checkout(t);
  publishReleases(t, { body: releases });
  const { result, report } = outdated(
    root,
    environment({
      npm_config_registry: `http://127.0.0.1:${await closedPort()}/`,
    }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.cli.pinned, cli.version);
  assert.equal(report.cli.update, "unknown");
  assert.equal(report.cli.reason!.code, "REGISTRY_UNAVAILABLE");
  assert.equal(typeof report.cli.reason!.message, "string");
  assert.equal(report.standards.update, "available");
  assert.equal(report.standards.newest, "v1.1.0");
  const credentialed = outdated(
    root,
    environment({
      npm_config_registry: `http://agent:registry-secret@127.0.0.1:${await closedPort()}/`,
    }),
  );
  assert.equal(
    credentialed.result.status,
    0,
    credentialed.result.stdout + credentialed.result.stderr,
  );
  assert.equal(credentialed.report.cli.update, "unknown");
  assert.doesNotMatch(
    credentialed.result.stdout + credentialed.result.stderr,
    /registry-secret/,
  );
});

test("an unreachable remote leaves the standards pin unknown and still answers the CLI pin", (t) => {
  const root = checkout(t);
  publishReleases(t, undefined);
  const { result, report } = outdated(root, environment());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.standards.pinned, "v1.0.0");
  assert.equal(report.standards.update, "unknown");
  assert.equal(report.standards.reason!.code, "SOURCE_UNAVAILABLE");
  assert.equal(report.cli.update, "available");
  assert.equal(report.cli.newest, minor);
});

test("exhausted GitHub quota leaves the standards pin unknown with exit status 0", (t) => {
  const root = checkout(t);
  publishReleases(t, {
    status: 403,
    headers: { "x-ratelimit-remaining": "0" },
    body: { message: "API rate limit exceeded" },
  });
  const { result, report } = outdated(root, environment());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.standards.update, "unknown");
  assert.equal(report.standards.reason!.code, "QUOTA_EXHAUSTED");
  assert.match(report.standards.reason!.message, /GH_TOKEN|GITHUB_TOKEN/);
  assert.equal(report.cli.update, "available");
});

test("degraded answers are not cached, so the next invocation looks up again", (t) => {
  const root = checkout(t);
  publishReleases(t, undefined);
  assert.equal(
    outdated(root, environment()).report.standards.update,
    "unknown",
  );
  publishReleases(t, { body: releases });
  const { report, requests } = outdated(root, environment());
  assert.equal(report.standards.update, "available");
  assert.equal(report.standards.cached, false);
  assert.equal(report.cli.cached, true);
  assert.deepEqual(
    requests.map((request) => request.url),
    [releasesUrl],
  );
});

test("a project without a selection reports both pins unknown and changes nothing", (t) => {
  const project = sourceFixture("", { "README.md": "Not adopted" });
  t.after(() => project.close());
  commit(project.root);
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "repo-standards-outdated-plain-")),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const root of [project.root, directory]) {
    const before = snapshot(root);
    const { result, report, requests } = outdated(root, environment());
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const pin of [report.cli, report.standards]) {
      assert.equal(pin.update, "unknown");
      assert.equal(pin.pinned, null);
      assert.equal(pin.reason!.code, "NO_SELECTION");
    }
    assert.deepEqual(requests, []);
    assert.deepEqual(snapshot(root), before);
  }
  // Without a selection there is no recorded pin, so status answers too.
  const status = cli.run(["status", "--json"], project.root, environment());
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.equal((JSON.parse(status.stdout) as Status).selection, null);
});

test("a GitHub token from the environment is sent as authorization only to GitHub and only when present", (t) => {
  const root = checkout(t);
  publishReleases(t, { body: releases });
  const lookups = (env: NodeJS.ProcessEnv) => {
    rmSync(join(root, ".repo-standards/cache"), {
      recursive: true,
      force: true,
    });
    const { result, requests } = outdated(root, env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    // The two lookups run concurrently, so their logged order is not fixed.
    return requests
      .map(
        (request) =>
          [
            request.url.startsWith("https://api.github.com/")
              ? "github"
              : "registry",
            request.authorization,
          ] as const,
      )
      .sort(([a], [b]) => a.localeCompare(b));
  };
  assert.deepEqual(lookups(environment()), [
    ["github", "absent"],
    ["registry", "absent"],
  ]);
  assert.deepEqual(lookups(environment({ GITHUB_TOKEN: "actions-token" })), [
    ["github", "GITHUB_TOKEN"],
    ["registry", "absent"],
  ]);
  assert.deepEqual(
    lookups(
      environment({ GH_TOKEN: "cli-token", GITHUB_TOKEN: "actions-token" }),
    ),
    [
      ["github", "GH_TOKEN"],
      ["registry", "absent"],
    ],
  );
});

test("status makes no network request", (t) => {
  const root = checkout(t);
  const logged = remote.requestLog().length;
  const result = cli.run(["status", "--json"], root, environment());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    (JSON.parse(result.stdout) as Status).selection!.standards.version,
    "v1.0.0",
  );
  assert.deepEqual(remote.requestLog().slice(logged), []);
});

test("invalid outdated usage exits 2 with a structured diagnostic", (t) => {
  const root = checkout(t);
  for (const args of [
    ["outdated", "--json", "--source", "x"],
    ["outdated", "--json", "--project"],
    ["outdated", "--json", "--json"],
  ]) {
    const result = cli.run(args, root, environment());
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      "USAGE",
    );
  }
});

// The Pins table of the plain report, one object per pin, keyed by the table's
// headings, with each cell's inline code unwrapped.
function pinRows(markdown: string) {
  const [heading, , ...rows] = markdown
    .split("\n## ")
    .find((part) => part.startsWith("Pins\n"))!
    .split("\n\n")[1]!
    .trimEnd()
    .split("\n");
  const keys = heading!
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  return Object.fromEntries(
    rows.map((row) => {
      const cells = row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/^`(.*)`$/, "$1"));
      return [
        cells[0]!,
        Object.fromEntries(keys.map((key, index) => [key, cells[index]!])),
      ];
    }),
  );
}

function plain(root: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  const logged = remote.requestLog().length;
  const result = cli.run(["outdated", ...args], root, env);
  return { result, requests: remote.requestLog().slice(logged) };
}

test("plain outdated renders Markdown that agrees with the JSON report, identically for the same report", (t) => {
  const root = checkout(t);
  publishReleases(t, { body: releases });
  const project = snapshot(root);
  const status = gitStatus(root);
  const first = plain(root, environment());
  assert.equal(
    first.result.status,
    0,
    first.result.stdout + first.result.stderr,
  );
  assert.equal(first.result.stderr, "");
  assert.equal(first.requests.length, 2);
  assert.match(
    first.result.stdout,
    /^# Repository Standards available updates\n\n## Pins\n\n/,
  );
  assert.doesNotMatch(first.result.stdout, /^\s*[{[]/);
  assert.doesNotMatch(first.result.stdout, /## Unknown results/);
  assert.equal(first.result.stdout.endsWith("|\n"), true);
  const rows = pinRows(first.result.stdout);
  assert.equal(rows.CLI!.Lookup, "fresh");

  // The report now comes from the cache, so every later rendering of it is the
  // same bytes and none makes a request.
  const second = plain(root, environment());
  const third = plain(root, environment());
  const { report, requests } = outdated(root, environment());
  assert.deepEqual([second.requests, third.requests, requests], [[], [], []]);
  assert.equal(second.result.stdout, third.result.stdout);
  assert.equal(
    second.result.stdout,
    first.result.stdout.replaceAll("| fresh |", "| cached |"),
  );

  const rendered = pinRows(second.result.stdout);
  for (const [name, pin, subject] of [
    ["CLI", report.cli, report.cli.package],
    ["Standards source", report.standards, report.standards.repository],
  ] as const) {
    assert.deepEqual(rendered[name], {
      Pin: name,
      Subject: subject,
      Pinned: pin.pinned,
      Newest: pin.newest,
      Update: pin.update,
      "Newer stable releases": String(pin.newerStableReleases),
      "Checked at": pin.checkedAt,
      Lookup: pin.cached ? "cached" : "fresh",
    });
  }
  assert.equal(report.cli.update, "available");
  assert.equal(report.standards.update, "available");

  // Rendering writes only the ignored cache.
  assert.equal(gitStatus(root), status);
  rmSync(join(root, ".repo-standards/cache"), { recursive: true });
  assert.deepEqual(snapshot(root), project);
});

test("plain outdated renders no update for pins at their newest versions", async (t) => {
  const root = checkout(t);
  publishReleases(t, {
    body: releases.filter((release) => release.tag_name === "v1.0.0"),
  });
  const current = await registryFixture(cli.root, [cli.version]);
  t.after(() => current.close());
  const { result } = plain(root, environment(current.env));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const rows = pinRows(result.stdout);
  for (const name of ["CLI", "Standards source"]) {
    assert.equal(rows[name]!.Update, "none");
    assert.equal(rows[name]!["Newer stable releases"], "0");
  }
  assert.equal(rows.CLI!.Newest, cli.version);
  assert.equal(rows["Standards source"]!.Newest, "v1.0.0");
  assert.doesNotMatch(result.stdout, /## Unknown results/);
});

test("plain outdated reports an unanswered pin with its reason beside the answered one", (t) => {
  const root = checkout(t);
  publishReleases(t, {
    status: 403,
    headers: { "x-ratelimit-remaining": "0" },
    body: { message: "API rate limit exceeded" },
  });
  const { result } = plain(root, environment());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const rows = pinRows(result.stdout);
  assert.equal(rows.CLI!.Update, "available");
  assert.equal(rows.CLI!.Newest, minor);
  assert.deepEqual(rows["Standards source"], {
    Pin: "Standards source",
    Subject: "https://github.com/alice/standards",
    Pinned: "v1.0.0",
    Newest: "unknown",
    Update: "unknown",
    "Newer stable releases": "unknown",
    "Checked at": "unknown",
    Lookup: "unknown",
  });
  const { report } = outdated(root, environment());
  assert.match(
    result.stdout,
    /## Unknown results\n\n\| Pin \| Code \| Message \|\n\| --- \| --- \| --- \|\n\| Standards source \| `QUOTA_EXHAUSTED` \| .*GH\\_TOKEN.* \|\n$/,
  );
  assert.equal(report.standards.reason!.code, "QUOTA_EXHAUSTED");
});

test("plain outdated without a selection reports both pins unknown with the reason, with no request or change", (t) => {
  const project = sourceFixture("", { "README.md": "Not adopted" });
  t.after(() => project.close());
  commit(project.root);
  const before = snapshot(project.root);
  const { result, requests } = plain(project.root, environment());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(requests, []);
  assert.deepEqual(snapshot(project.root), before);
  const rows = pinRows(result.stdout);
  assert.equal(rows.CLI!.Subject, "@lutzseverino/repo-standards");
  assert.equal(rows["Standards source"]!.Subject, "not recorded");
  for (const row of Object.values(rows)) {
    assert.equal(row.Pinned, "not recorded");
    assert.equal(row.Update, "unknown");
  }
  assert.match(result.stdout, /\| CLI \| `NO_SELECTION` \| .* \|\n/);
  assert.match(
    result.stdout,
    /\| Standards source \| `NO_SELECTION` \| .* \|\n/,
  );
});

test("outdated --json is unchanged beside the plain report, and usage errors stay structured", (t) => {
  const root = checkout(t);
  publishReleases(t, undefined);
  const json = plain(root, environment(), "--json");
  assert.equal(json.result.status, 0, json.result.stdout + json.result.stderr);
  const report = JSON.parse(json.result.stdout) as OutdatedReport;
  assert.deepEqual(Object.keys(report), ["format", "cli", "standards"]);
  assert.equal(report.format, "repo-standards/outdated/v1");
  assert.equal(report.standards.reason!.code, "SOURCE_UNAVAILABLE");
  assert.equal(json.result.stdout, JSON.stringify(report, null, 2) + "\n");

  // A usage error without --json is a diagnostic on stderr and exits 2.
  const usage = plain(root, environment(), "--source", "x");
  assert.equal(usage.result.status, 2);
  assert.equal(usage.result.stdout, "");
  assert.match(usage.result.stderr, /^\[USAGE\] /);
});
