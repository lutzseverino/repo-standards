import type { AdoptReport, ErrorReport, Inspection } from "./json-reports.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { after, test, type TestContext } from "node:test";
import {
  directoryFixture,
  fixtureFiles,
  installCli,
  snapshot,
} from "./installed-cli.ts";
import {
  commit,
  git,
  inspectionArgs,
  manifest,
  versionArgs,
} from "./remote-fixture.ts";
import {
  discoveryFixture,
  fixture,
  readmeFiles,
  readmeSource,
  source,
} from "./adopt-fixture.ts";
import { terminalSession } from "./terminal.ts";

// The GitHub REST requests the product makes, measured at the fixture's HTTP
// boundary across separate CLI processes, with Git object fetches counted
// apart. Releases, repository metadata and tag refs are mutable; commits,
// trees and annotated tag objects are immutable and reused.

const cli = installCli();
after(() => cli.close());

type Fixture = Awaited<ReturnType<typeof fixture>>;
interface Request {
  path: string;
  kind: "rest" | "git";
  authorized: boolean;
}

function received(f: Fixture) {
  return readFileSync(f.remote.requestFile!, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Request);
}

// The REST requests of one or more commands by kind, and their Git fetches.
interface Measured {
  rest: string[];
  metadata: number;
  refs: number;
  tags: number;
  commits: number;
  trees: number;
  blobs: number;
  releases: number;
  fetches: number;
}

function measure<T>(f: Fixture, command: () => T): Measured & { value: T } {
  const before = received(f).length;
  const value = command();
  const requests = received(f).slice(before);
  const rest = requests
    .filter((request) => request.kind === "rest")
    .map((request) => request.path);
  const count = (pattern: RegExp) =>
    rest.filter((path) => pattern.test(path)).length;
  return {
    value,
    rest,
    metadata: count(/^\/repos\/[^/]+\/[^/?]+$/),
    refs: count(/\/git\/ref\/tags\//),
    tags: count(/\/git\/tags\//),
    commits: count(/\/git\/commits\//),
    trees: count(/\/git\/trees\//),
    blobs: count(/\/git\/blobs\//),
    releases: count(/\/releases\?/),
    // Each Git fetch starts with one reference advertisement.
    fetches: requests.filter(
      (request) =>
        request.kind === "git" && request.path.startsWith("/git/info/refs"),
    ).length,
  };
}

// A warm answer-only round observes only the repository and its tag.
function warm(measured: Measured, rounds = 1) {
  assert.deepEqual(
    {
      metadata: measured.metadata,
      refs: measured.refs,
      total: measured.rest.length,
      fetches: measured.fetches,
    },
    { metadata: rounds, refs: rounds, total: 2 * rounds, fetches: 0 },
    measured.rest.join("\n"),
  );
}

// Publishes the source's current commit as the tag, through a chain of the
// given number of annotated tag objects, returning their object IDs.
function annotate(f: Fixture, tag: string, depth = 1) {
  const { remote } = f;
  remote.publish(tag);
  let target = git(remote.source.root, "rev-parse", "HEAD");
  let type = "commit";
  const objects: string[] = [];
  for (let level = depth; level >= 1; level--) {
    const name = level === 1 ? tag : `${tag}-annotation-${level}`;
    git(
      remote.source.root,
      "-c",
      "tag.gpgSign=false",
      "-c",
      "advice.nestedTag=false",
      "tag",
      "--force",
      "--annotate",
      "--message",
      `Annotation ${level}`,
      name,
      target,
    );
    const object = git(remote.source.root, "rev-parse", `refs/tags/${name}`);
    remote.responses[`${remote.prefix}/git/tags/${object}`] = {
      body: { sha: object, object: { type, sha: target } },
    };
    objects.push(object);
    target = object;
    type = "tag";
  }
  remote.responses[`${remote.prefix}/git/ref/tags/${tag}`] = {
    body: { ref: `refs/tags/${tag}`, object: { type: "tag", sha: target } },
  };
  remote.save();
  return objects;
}

// The budget of a guided adoption or update journey: 16 requests with a
// lightweight tag, one more per annotated tag object, and one more per
// additional release page.
const budget = (annotations: number, pages = 1) => 16 + annotations + pages - 1;

const review = {
  status: "valid",
  explanation: "The app remains the only maintained project.",
  evidence: ["Reviewed app/package.json and the excluded fixture."],
  additionalPaths: [],
};
const assessments = {
  "assessment:project-docs": {
    status: "satisfied",
    explanation: "The app's README describes it.",
    evidence: ["app/README.md starts with its heading."],
    scopeValidity: { afterFixes: review, current: review },
  },
  "assessment:project-readme": {
    status: "satisfied",
    explanation: "README.md starts with the project's heading.",
    evidence: ["README.md starts with # Project."],
  },
};

// A cold first adoption through profile selection, a discovered scope, a
// deferred remote setup, its start and its contextual work, then the
// unchanged update of the committed adoption, each invocation its own CLI
// process.
async function journey(t: TestContext, annotated: boolean) {
  const outside = directoryFixture("repo-standards-budget-");
  t.after(() => outside.close());
  const { f } = await discoveryFixture(t, cli, [], {
    declarations: readmeSource(outside.root),
    files: readmeFiles,
    profiles: { work: {}, personal: { "project-readme": { exclude: true } } },
    http: true,
  });
  const annotations = annotated ? annotate(f, "v1.0.0").length : 0;
  const counts: Record<string, number> = {};
  const step = (
    name: string,
    args: string[],
    expected: AdoptReport["outcome"],
    runtime = false,
  ) => {
    const measured = measure(f, () => f.adopt(args, runtime));
    const { report, result } = measured.value;
    assert.equal(report.outcome, expected, result.stdout + result.stderr);
    counts[name] = measured.rest.length;
    return { ...measured, report };
  };

  // The template reads the releases and acquires the source cold.
  const template = step("template", [source], "answers-required");
  assert.deepEqual(template.report.missing, ["profile"]);
  assert.deepEqual(
    {
      releases: template.releases,
      tags: template.tags,
      commits: template.commits,
      trees: template.trees,
      blobs: template.blobs,
      fetches: template.fetches,
    },
    {
      releases: 1,
      tags: annotations,
      commits: 1,
      trees: 1,
      blobs: 0,
      fetches: 1,
    },
  );

  // Each answer-only round observes the repository and tag once, for its
  // profile and inspection alike, and reuses the snapshot; so does a retry.
  const profile = step(
    "profile",
    f.answer(template.report.answers, { profile: "work" }),
    "answers-required",
  );
  warm(profile);
  assert.deepEqual(profile.report.missing, [
    "scope:project-docs",
    "inspection",
  ]);
  const retry = measure(f, () => f.adopt(["--answers", f.answersPath]));
  warm(retry);
  assert.equal(
    retry.value.report.inspection!.identity,
    profile.report.inspection!.identity,
  );
  const scope = step(
    "scope",
    f.answer(profile.report.answers),
    "answers-required",
  );
  warm(scope);
  assert.deepEqual(scope.report.missing, ["remote-setup", "inspection"]);

  // The start observes the tag once more after acquiring the runtime.
  const started = step(
    "start",
    f.answer(scope.report.answers, {
      "remote-setup": "defer",
      inspection: scope.report.inspection!.identity,
    }),
    "contextual",
  );
  warm(started, 2);

  // Contextual continuation makes no source or release request.
  writeFileSync(join(f.root, "README.md"), "# Project\n\nProject notes\n");
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  const continued = step(
    "continuation",
    f.answer(started.report.answers, assessments),
    "complete",
    true,
  );
  assert.deepEqual(continued.rest, []);
  assert.equal(continued.fetches, 0);
  commit(f.root);
  const adoption =
    counts.template! +
    counts.profile! +
    counts.scope! +
    counts.start! +
    counts.continuation!;
  assert.ok(
    adoption <= budget(annotations),
    `The adoption made ${adoption} requests: ${JSON.stringify(counts)}`,
  );

  // An unchanged update reads the releases again and reuses the snapshot.
  const update = step("update template", [], "answers-required", true);
  assert.equal(update.report.selection.version, "v1.0.0");
  assert.equal(update.releases, 1);
  warm({
    ...update,
    rest: update.rest.filter((path) => !/releases/.test(path)),
  });
  const updateScope = step(
    "update scope",
    f.answer(update.report.answers),
    "answers-required",
    true,
  );
  warm(updateScope);
  assert.deepEqual(updateScope.report.missing, ["remote-setup", "inspection"]);
  const updateStart = step(
    "update start",
    f.answer(updateScope.report.answers, {
      "remote-setup": "defer",
      inspection: updateScope.report.inspection!.identity,
    }),
    "contextual",
    true,
  );
  warm(updateStart, 2);
  const updateContinued = step(
    "update continuation",
    f.answer(updateStart.report.answers, assessments),
    "complete",
    true,
  );
  assert.deepEqual(updateContinued.rest, []);
  const updated =
    counts["update template"]! +
    counts["update scope"]! +
    counts["update start"]! +
    counts["update continuation"]!;
  assert.ok(
    updated <= budget(annotations),
    `The update made ${updated} requests: ${JSON.stringify(counts)}`,
  );
  commit(f.root);

  // A cold outdated lookup makes one GitHub request.
  const outdated = measure(f, () => f.run(["outdated", "--json"]));
  assert.equal(outdated.value.status, 0, outdated.value.stderr);
  assert.equal(outdated.rest.length, 1);
  counts.outdated = 1;
  const total = adoption + updated + 1;
  t.diagnostic(
    `${annotated ? "annotated" : "lightweight"} tag: ${JSON.stringify(counts)}; adoption ${adoption}, update ${updated}, total ${total}`,
  );
  return total;
}

test("a guided adoption and its unchanged update stay within the request budget with a lightweight tag", async (t) => {
  await journey(t, false);
});

test("with an annotated tag, adoption, its unchanged update and a cold outdated lookup make at most 35 GitHub requests", async (t) => {
  assert.ok((await journey(t, true)) <= 35);
});

test("terminal rounds reuse the snapshot and observe only the repository and tag", async (t) => {
  const outside = directoryFixture("repo-standards-budget-terminal-");
  t.after(() => outside.close());
  const f = await fixture(t, cli, readmeSource(outside.root), {
    profiles: { work: {}, personal: { "project-readme": { exclude: true } } },
    http: true,
  });
  const before = received(f).length;
  {
    const session = terminalSession(
      join(cli.root, "node_modules/.bin/repo-standards"),
      ["adopt", source],
      { cwd: f.root, env: f.env },
    );
    t.after(() => session.close());
    await session.expect("Version [v1.0.0]: ");
    session.type("");
    await session.expect("Profile: ");
    session.type("work");
    await session.expect("Defer it, or resolve it first? [defer/resolve]: ");
    session.type("defer");
    await session.expect("Discard these edits? [y/N]: ");
    session.type("y");
    await session.expect("Start the run? [Y/n]: ");
    session.type("");
    await session.expect(
      "Edit the files now. Press Enter when you are done, or type blocked: ",
    );
    writeFileSync(join(f.root, "README.md"), "# Project\n\nProject notes\n");
    session.type("");
    await session.expect("Is project-readme done? [Y/n/blocked]: ");
    session.type("");
    await session.expect("The adoption is complete.");
    assert.equal(await session.exit(), 0, session.rest());
  }
  const sessionRequests = received(f).slice(before);
  const requests = sessionRequests.filter((request) => request.kind === "rest");
  const count = (pattern: RegExp) =>
    requests.filter((request) => pattern.test(request.path)).length;
  // One cold acquisition; every later round observes the repository and tag
  // once, and the start once more after acquiring the runtime.
  assert.deepEqual(
    {
      releases: count(/\/releases\?/),
      commits: count(/\/git\/commits\//),
      trees: count(/\/git\/trees\//),
      tags: count(/\/git\/tags\//),
      blobs: count(/\/git\/blobs\//),
      fetches: sessionRequests.filter(
        (request) =>
          request.kind === "git" && request.path.startsWith("/git/info/refs"),
      ).length,
    },
    { releases: 1, commits: 1, trees: 1, tags: 0, blobs: 0, fetches: 1 },
  );
  const metadata = count(/^\/repos\/[^/]+\/[^/?]+$/);
  assert.equal(count(/\/git\/ref\/tags\//), metadata);
  assert.equal(requests.length, 1 + 2 + 2 * metadata);
  t.diagnostic(
    `terminal: ${requests.length} requests, ${metadata} observations`,
  );
});

test("release pages and annotation chains have counted allowances, source size costs nothing, and answers keep their selected version", async (t) => {
  const files = Object.fromEntries(
    Array.from({ length: 70 }, (_, index) => [
      `material/file-${index}.md`,
      `Material ${index}\n`,
    ]),
  );
  const f = await fixture(
    t,
    cli,
    { standard: { kind: "file", target: "STANDARD.md", exact: "standard.md" } },
    { files: { ...files, "standard.md": "Standard\n" }, http: true },
  );
  const older = Array.from({ length: 100 }, (_, index) => `v0.${index}.0`);
  f.releases(older, ["v1.0.0"]);
  const chain = annotate(f, "v1.0.0", 2);

  // Cold: two release pages, the repository, the tag, two annotated tag
  // objects, the commit and the tree, whatever the source's size.
  const cold = measure(f, () => f.adopt([source]));
  assert.equal(cold.value.report.selection.version, "v1.0.0");
  assert.deepEqual(
    [cold.releases, cold.metadata, cold.refs, cold.tags, cold.commits],
    [2, 1, 1, chain.length, 1],
  );
  assert.equal(cold.rest.length, 4 + chain.length + 2, cold.rest.join("\n"));
  assert.equal(cold.blobs, 0);
  assert.equal(cold.fetches, 1);

  // An independent request reads the releases again; the annotated tag
  // objects and snapshot are reused.
  const again = measure(f, () => f.adopt([source]));
  assert.equal(again.releases, 2);
  warm({ ...again, rest: again.rest.filter((path) => !/releases/.test(path)) });

  // An explicit version reads no release list.
  const explicit = measure(f, () =>
    f.adopt([source, "--standards-version", "v1.0.0"]),
  );
  warm(explicit);

  // A release published meanwhile leaves the continuing answers' version
  // selected, and an independent request finds it.
  const answers = f.answer(cold.value.report.answers);
  f.remote.addVersion(
    "v1.1.0",
    manifest({
      standard: { kind: "file", target: "STANDARD.md", exact: "standard.md" },
    }),
    { "standard.md": "Standard 1.1\n" },
  );
  f.releases(older, ["v1.0.0", "v1.1.0"]);
  const continuing = measure(f, () => f.adopt(["--answers", answers[1]!]));
  assert.equal(continuing.value.report.selection.version, "v1.0.0");
  assert.equal(continuing.value.report.outcome, "complete");
  assert.equal(continuing.releases, 0);
  assert.equal(continuing.fetches, 0);
  commit(f.root);
  const independent = measure(f, () => f.adopt([source]));
  assert.equal(independent.value.report.selection.version, "v1.1.0");
  assert.equal(independent.releases, 2);
  assert.equal(independent.commits, 1);
});

test("a cached snapshot inspects identically, and a damaged, incomplete or evicted one is acquired again", async (t) => {
  const f = await fixture(
    t,
    cli,
    {
      standard: { kind: "file", target: "STANDARD.md", exact: "standard.md" },
    },
    {
      files: { "standard.md": "Standard\n", "other.md": "Other bytes\n" },
      http: true,
    },
  );
  const snapshots = join(
    f.remote.support.root,
    "cache/repo-standards/snapshots",
  );
  const inspect = (args = inspectionArgs) =>
    measure(f, () => {
      const result = f.run(args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return JSON.parse(result.stdout) as Inspection;
    });
  const cold = inspect();
  assert.equal(cold.fetches, 1);
  const identity = cold.value.identity;

  const cached = inspect();
  warm(cached);
  assert.equal(cached.value.identity, identity);

  // The only cached snapshot, and the loose object file of a blob in it.
  const entry = () => {
    const names = readdirSync(snapshots).filter(
      (name) => !name.startsWith("."),
    );
    assert.equal(names.length, 1);
    return join(snapshots, names[0]!);
  };
  const object = (sha: string) =>
    join(entry(), "git/objects", sha.slice(0, 2), sha.slice(2));
  const blob = (path: string) =>
    git(f.remote.source.root, "rev-parse", `HEAD:${path}`);
  const reacquired = (measured: Measured & { value: Inspection }) => {
    assert.equal(measured.value.identity, identity);
    assert.equal(measured.commits, 1);
    assert.equal(measured.trees, 1);
    assert.equal(measured.fetches, 1);
  };

  // Another object's bytes under a blob's identity never become the source.
  const target = object(blob("standard.md"));
  assert.ok(existsSync(target));
  rmSync(target);
  copyFileSync(object(blob("other.md")), target);
  reacquired(inspect());
  warm(inspect());

  // A truncated object, and a snapshot without its provenance.
  rmSync(target);
  writeFileSync(target, "");
  reacquired(inspect());
  rmSync(join(entry(), "provenance.json"));
  reacquired(inspect());

  // An evicted snapshot is acquired again.
  rmSync(snapshots, { recursive: true, force: true });
  reacquired(inspect());

  // Another tag selects its own snapshot, and the first stays cached.
  const published = f.remote.addVersion(
    "v1.1.0",
    manifest({
      standard: { kind: "file", target: "STANDARD.md", exact: "standard.md" },
    }),
    { "standard.md": "Standard 1.1\n" },
  );
  const next = inspect(versionArgs("v1.1.0"));
  assert.equal(next.value.selection.standards.commit, published.sha);
  assert.notEqual(next.value.identity, identity);
  assert.equal(next.commits, 1);
  const first = inspect();
  warm(first);
  assert.equal(first.value.identity, identity);

  // A warm snapshot never hides a tag that moved since it was observed.
  f.remote.addVersion(
    "v1.0.0",
    manifest({
      standard: { kind: "file", target: "STANDARD.md", exact: "standard.md" },
    }),
    { "standard.md": "Moved\n" },
  );
  const moved = measure(f, () => f.run(inspectionArgs));
  assert.equal(moved.value.status, 1);
  assert.equal(
    (JSON.parse(moved.value.stdout) as ErrorReport).errors[0]!.code,
    "MOVED_TAG",
  );
  assert.equal(moved.commits + moved.fetches, 0);
});

test("a tag that moves while start acquires the runtime is rejected before installation", async (t) => {
  const yaml = manifest({
    standard: { kind: "file", target: "STANDARD.md", exact: "standard.md" },
  });
  const f = await fixture(
    t,
    cli,
    {
      standard: { kind: "file", target: "STANDARD.md", exact: "standard.md" },
    },
    { files: { "standard.md": "Standard\n" }, http: true },
  );
  const template = f.adopt([source]).report;
  const answers = f.answer(template.answers);

  // The moved responses, applied by a registry proxy once npm asks for the
  // CLI package, after the start's first inspection.
  const responses = join(f.remote.support.root, "responses.json");
  const original = readFileSync(responses);
  f.remote.addVersion("v1.0.0", yaml, { "standard.md": "Moved\n" });
  const moved = join(f.remote.support.root, "moved.json");
  copyFileSync(responses, moved);
  writeFileSync(responses, original);
  const proxy = join(f.remote.support.root, "registry-proxy.mjs");
  writeFileSync(
    proxy,
    `import { createServer, request } from 'node:http';
import { copyFileSync } from 'node:fs';
const upstream = new URL(${JSON.stringify(f.registry.env.npm_config_registry)});
const server = createServer((req, res) => {
  if (req.url.includes('repo-standards')) copyFileSync(${JSON.stringify(moved)}, ${JSON.stringify(responses)});
  const forwarded = request({ host: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode, answer.headers);
    answer.pipe(res);
  });
  req.pipe(forwarded);
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
process.stdin.on('end', () => process.exit()).resume();
`,
  );
  const server = spawn(process.execPath, [proxy], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  t.after(() => server.kill());
  const port = await new Promise<string>((resolve) =>
    server.stdout.once("data", (data) => resolve(String(data).trim())),
  );
  const before = snapshot(f.root);
  const started = measure(f, () =>
    f.run(["adopt", ...answers, "--json"], {
      ...f.env,
      npm_config_registry: `http://127.0.0.1:${port}`,
    }),
  );
  // The run stops before writing anything.
  const report = JSON.parse(started.value.stdout) as AdoptReport;
  assert.equal(report.outcome, "blocked", started.value.stdout);
  assert.match(report.run!.reason, /^MOVED_TAG: /);
  assert.equal(started.metadata, 2);
  assert.equal(started.fetches, 0);
  assert.deepEqual(snapshot(f.root), before);
});

test("a warm snapshot neither hides GitHub refusing the tag lookup nor retries a rejected token anonymously, and caches no credentials", async (t) => {
  const token = "sentinel-277-do-not-cache";
  const f = await fixture(
    t,
    cli,
    {
      standard: { kind: "file", target: "STANDARD.md", exact: "standard.md" },
    },
    { files: { "standard.md": "Standard\n" }, http: true },
  );
  const env = { ...f.env, GH_TOKEN: token };
  const inspect = () => measure(f, () => f.run(inspectionArgs, env));
  assert.equal(inspect().value.status, 0);
  warm(inspect());
  const ref = `${f.remote.prefix}/git/ref/tags/v1.0.0`;
  const published = f.remote.responses[ref]!;
  for (const [refusal, code] of [
    [
      { status: 403, headers: { "x-ratelimit-remaining": "0" }, body: {} },
      "QUOTA_EXHAUSTED",
    ],
    [{ status: 429, body: {} }, "QUOTA_EXHAUSTED"],
    [{ status: 401, body: {} }, "SOURCE_UNAVAILABLE"],
  ] as const) {
    f.remote.responses[ref] = refusal;
    f.remote.save();
    const before = received(f).length;
    const refused = inspect();
    assert.equal(refused.value.status, 1);
    assert.equal(
      (JSON.parse(refused.value.stdout) as ErrorReport).errors[0]!.code,
      code,
    );
    assert.deepEqual(refused.rest, [
      "/repos/alice/standards",
      "/repos/alice/standards/git/ref/tags/v1.0.0",
    ]);
    assert.ok(
      received(f)
        .slice(before)
        .every((request) => request.authorized),
    );
  }
  f.remote.responses[ref] = published;
  f.remote.save();
  warm(inspect());
  for (const [path, bytes] of Object.entries(
    fixtureFiles(join(f.remote.support.root, "cache")),
  )) {
    assert.equal(path.includes(token), false, path);
    assert.equal(bytes.includes(token), false, path);
  }
});
