import type {
  ErrorReport,
  Inspection,
  SourceValidation,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installCli, snapshot, sourceFixture } from "./installed-cli.ts";
import {
  commit,
  inspectionArgs,
  remoteFixture,
  startArgs,
} from "./remote-fixture.ts";

const cli = installCli();
after(() => cli.close());

const discoveryScript = (timeout = 30) => `
      discovery-script:
        run: {executable: node, script: draft.mjs, resources: [data], arguments: ["--strict"]}
        prerequisite: {version-arguments: ["--version"], version: ">=24.0.0"}
        timeout-seconds: ${timeout}
`;
const source = (script = discoveryScript()) => `format: repo-standards/v2
name: scripted-standards
description: Draft maintained project scope
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
    project-docs:
      kind: repository
      guidance: guidance.md
      discovery: discovery.md${script.trimEnd()}
profiles:
  work:
    description: Work
    declarations: {}
`;

// The script drafts from what it reads in its working directory, then does
// whatever its scenario adds.
const draft = (
  scenario = "",
) => `import { existsSync, readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
if (process.argv[2] !== "--strict" || input.format !== "repo-standards/discovery/v1") process.exit(3);
if (input.projectRoot !== process.cwd() || process.env.PWD !== process.cwd()) process.exit(4);
${scenario}
const candidates = ["app", "fixtures/fake"].filter((path) => existsSync(path + "/package.json"));
process.stdout.write(JSON.stringify({
  format: "repo-standards/scope/v2",
  declarations: [{
    id: input.declaration,
    coverage: "The app is maintained; the fixture is test data.",
    candidates: candidates.map((path) => ({
      path: path === "app" ? "app/README.md" : path,
      decision: path === "app" ? "include" : "exclude",
      reason: path === "app" ? "Its manifest makes it a project." : "Fixtures are test data.",
      evidence: [path + "/package.json"],
    })),
    unresolved: ["Is tools a maintained project?"],
  }],
}));
`;
const expectedDraft = {
  format: "repo-standards/scope/v2",
  declarations: [
    {
      id: "project-docs",
      coverage: "The app is maintained; the fixture is test data.",
      candidates: [
        {
          path: "app/README.md",
          decision: "include",
          reason: "Its manifest makes it a project.",
          evidence: ["app/package.json"],
        },
        {
          path: "fixtures/fake",
          decision: "exclude",
          reason: "Fixtures are test data.",
          evidence: ["fixtures/fake/package.json"],
        },
      ],
      unresolved: ["Is tools a maintained project?"],
    },
  ],
};

function fixture(t: TestContext, yaml: string, script: string) {
  const remote = remoteFixture(yaml, {
    "guidance.md": "Document each maintained project.",
    "discovery.md": "Projects have a package manifest; fixtures do not count.",
    "draft.mjs": script,
    "data/notes.txt": "Retained with the script.",
  });
  const project = sourceFixture("", {
    "app/package.json": "{}",
    "fixtures/fake/package.json": "{}",
    "tools/run.sh": "echo tools",
  });
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const inspect = (args = inspectionArgs) =>
    cli.run(args, project.root, remote.env);
  return { remote, project, inspect };
}

test("inspection runs a declared discovery script read-only and reports its draft and open questions", (t) => {
  const { project, inspect } = fixture(t, source(), draft());
  const before = snapshot(project.root);
  const result = inspect();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as Inspection;
  assert.deepEqual(report.discovery!.draft, expectedDraft);
  assert.equal(report.discovery!.proposal, undefined);
  assert.deepEqual(
    report.start.blockers.map((blocker) => blocker.code),
    ["DISCOVERY_REQUIRED"],
  );
  // The script and its resources are retained inputs like an operation's.
  assert.ok(report.inputs["draft.mjs"]);
  assert.ok(report.inputs["data"]);
  assert.deepEqual(snapshot(project.root), before);

  // The Markdown proposal presents the draft and its questions for review.
  const summary = inspect(
    inspectionArgs.map((arg) => (arg === "--json" ? "--summary" : arg)),
  );
  assert.equal(summary.status, 0, summary.stdout + summary.stderr);
  assert.match(summary.stdout, /`app\/README\.md`/);
  assert.match(summary.stdout, /Is tools a maintained project\?/);
});

test("a draft with unanswered questions cannot start a run, and an answered one can", (t) => {
  const { remote, project, inspect } = fixture(t, source(), draft());
  const drafted = JSON.parse(inspect().stdout) as Inspection;
  const proposalFile = join(remote.support.root, "scope.json");
  writeFileSync(proposalFile, JSON.stringify(drafted.discovery!.draft));
  const args = [...inspectionArgs, "--scope", proposalFile];
  const unanswered = JSON.parse(inspect(args).stdout) as Inspection;
  assert.equal(unanswered.start.eligible, false);
  assert.deepEqual(
    unanswered.start.blockers.map((blocker) => blocker.code),
    ["UNRESOLVED_SCOPE"],
  );
  const refused = cli.run(
    startArgs(unanswered.identity, args),
    project.root,
    remote.env,
  );
  assert.notEqual(refused.status, 0, refused.stdout + refused.stderr);
  assert.equal(existsSync(join(project.root, ".repo-standards")), false);

  const answered = structuredClone(expectedDraft);
  answered.declarations[0]!.unresolved = [];
  answered.declarations[0]!.coverage += " Tools holds scripts, not a project.";
  writeFileSync(proposalFile, JSON.stringify(answered));
  const reviewed = JSON.parse(inspect(args).stdout) as Inspection;
  assert.deepEqual(reviewed.start.blockers, []);
  assert.deepEqual(reviewed.discovery!.proposal, answered);
  // A submitted proposal is reviewed as it is; the script does not run again.
  assert.equal(reviewed.discovery!.draft, undefined);
});

for (const [name, yaml, script, reason] of [
  [
    "writes to the project",
    source(),
    draft('(await import("node:fs")).writeFileSync("app/README.md", "x");'),
    "PROJECT_WRITE",
  ],
  [
    "times out",
    source(discoveryScript(1)),
    draft("await new Promise((resolve) => setTimeout(resolve, 60_000));"),
    "TIMEOUT",
  ],
  [
    "exits unsuccessfully",
    source(),
    draft('process.stderr.write("cannot draft"); process.exit(2);'),
    "NONZERO_EXIT",
  ],
  [
    "prints something other than a proposal for its declaration",
    source(),
    draft(
      'process.stdout.write(JSON.stringify({format: "repo-standards/scope/v2", declarations: []})); process.exit(0);',
    ),
    "PROTOCOL_ERROR",
  ],
  ...(
    [
      [
        "a path outside the project",
        "../outside",
        "include",
        '["app/package.json"]',
      ],
      ["an existing path without evidence", "tools", "exclude", "[]"],
      [
        "a reserved target",
        ".repo-standards/new",
        "include",
        '["app/package.json"]',
      ],
    ] as const
  ).map(
    ([kind, path, decision, evidence]) =>
      [
        `drafts a candidate with ${kind}`,
        source(),
        draft(
          `process.stdout.write(JSON.stringify({format: "repo-standards/scope/v2", declarations: [{id: input.declaration, coverage: "All.", candidates: [{path: "${path}", decision: "${decision}", reason: "Drafted.", evidence: ${evidence}}], unresolved: []}]})); process.exit(0);`,
        ),
        "PROTOCOL_ERROR",
      ] as const,
  ),
  [
    "drafts overlapping targets",
    source(),
    draft(
      'process.stdout.write(JSON.stringify({format: "repo-standards/scope/v2", declarations: [{id: input.declaration, coverage: "All.", candidates: ["docs", "docs/README.md"].map((path) => ({path, decision: "include", reason: "Drafted.", evidence: []})), unresolved: []}]})); process.exit(0);',
    ),
    "PROTOCOL_ERROR",
  ],
  ...(
    [
      ["a directory's permissions", "app", "0o711"],
      ["a file's permissions", "app/package.json", "0o604"],
      ["its root's permissions", ".", "0o711"],
    ] as const
  ).map(
    ([kind, path, mode]) =>
      [
        `changes ${kind}`,
        source(),
        draft(`(await import("node:fs")).chmodSync("${path}", ${mode});`),
        "PROJECT_WRITE",
      ] as const,
  ),
  [
    "creates a deep tree",
    source(),
    draft(
      '(await import("node:fs")).mkdirSync(Array.from({ length: 200 }, () => "d").join("/"), { recursive: true });',
    ),
    "PROJECT_WRITE",
  ],
] as const)
  test(`inspection fails, leaving the project unchanged, when a discovery script ${name}`, (t) => {
    const { project, inspect } = fixture(t, yaml, script);
    const before = snapshot(project.root);
    const result = inspect();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
    assert.equal(error!.code, "DISCOVERY_SCRIPT_FAILED", result.stdout);
    assert.deepEqual(
      {
        declaration: (error!.details as { declaration: string }).declaration,
        reason: (error!.details as { reason: string }).reason,
      },
      { declaration: "project-docs", reason },
    );
    assert.deepEqual(snapshot(project.root), before);
  });

test("a discovery script's copy omits symbolic links that leave it, and keeps those within it", (t) => {
  const { project, inspect } = fixture(
    t,
    source(),
    draft(
      'if (lstatSync("outside", { throwIfNoEntry: false }) || ["inside", "root", "dotted"].some((link) => !lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink())) process.exit(5);',
    ).replace(
      'import { existsSync, readFileSync } from "node:fs";',
      'import { existsSync, lstatSync, readFileSync } from "node:fs";',
    ),
  );
  symlinkSync(project.root, join(project.root, "outside"));
  symlinkSync("app/package.json", join(project.root, "inside"));
  symlinkSync(".", join(project.root, "root"));
  mkdirSync(join(project.root, "..cache"));
  writeFileSync(join(project.root, "..cache/notes.txt"), "kept");
  symlinkSync("..cache/notes.txt", join(project.root, "dotted"));
  commit(project.root);
  const result = inspect();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(
    (JSON.parse(result.stdout) as Inspection).discovery!.draft,
    expectedDraft,
  );
});

test("a discovery script whose prerequisite is unavailable fails inspection without running", (t) => {
  const { project, inspect } = fixture(
    t,
    source(discoveryScript().replace(">=24.0.0", ">=99.0.0")),
    draft('(await import("node:fs")).writeFileSync("ran", "x");'),
  );
  const before = snapshot(project.root);
  const result = inspect();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
  assert.equal(error!.code, "DISCOVERY_SCRIPT_FAILED");
  const details = error!.details as { reason: string; stdout: string };
  assert.equal(details.reason, "VERSION_INCOMPATIBLE");
  assert.match(details.stdout, /v\d+\.\d+\.\d+/);
  assert.deepEqual(snapshot(project.root), before);
});

test("a discovery script that leaves a process running fails, and the process is stopped", (t) => {
  const { inspect } = fixture(
    t,
    source(),
    draft(
      'const child = (await import("node:child_process")).spawn("sleep", ["30"], { stdio: "ignore" }); child.unref(); process.stderr.write(String(child.pid));',
    ),
  );
  const result = inspect();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
  const details = error!.details as { reason: string; stderr: string };
  assert.equal(details.reason, "PROCESS_ERROR");
  const state = spawnSync("ps", ["-o", "stat=", "-p", details.stderr], {
    encoding: "utf8",
  }).stdout.trim();
  assert.ok(!state || state.startsWith("Z"), `sleep is still ${state}`);
});

test("prose-only discovery returns no draft", (t) => {
  const { inspect } = fixture(t, source(""), draft());
  const result = inspect();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as Inspection;
  assert.equal(report.discovery!.draft, undefined);
  assert.deepEqual(
    report.start.blockers.map((blocker) => blocker.code),
    ["DISCOVERY_REQUIRED"],
  );
});

test("source validation accepts a discovery script and validates its fields", (t) => {
  const valid = sourceFixture(source(), {
    "guidance.md": "Guidance",
    "discovery.md": "Discovery",
    "draft.mjs": draft(),
    "data/notes.txt": "Data",
  });
  t.after(() => valid.close());
  const accepted = cli.run(["source", "validate", "--json"], valid.root);
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  const report = JSON.parse(accepted.stdout) as SourceValidation;
  assert.deepEqual(
    report.profiles.work!.declarations[0]!["discovery-script" as never],
    {
      run: {
        executable: "node",
        script: "draft.mjs",
        resources: ["data"],
        arguments: ["--strict"],
      },
      prerequisite: { "version-arguments": ["--version"], version: ">=24.0.0" },
      "timeout-seconds": 30,
    },
  );

  const invalid = sourceFixture(
    `format: repo-standards/v2
name: invalid
description: Invalid discovery scripts
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
    malformed:
      kind: repository
      guidance: guidance.md
      discovery: discovery.md
      discovery-script:
        id: draft
        run: {executable: "node --eval", script: missing.mjs, resources: [], arguments: []}
        prerequisite: {version-arguments: [], version: someday}
        timeout-seconds: 0
    explicit:
      kind: repository
      guidance: guidance.md
      targets: {paths: [README.md], directories: []}
      discovery-script:
        run: {executable: node, script: draft.mjs, resources: [], arguments: []}
        prerequisite: {version-arguments: [], version: ">=24.0.0"}
        timeout-seconds: 5
    incomplete:
      kind: repository
      guidance: guidance.md
      discovery: discovery.md
      discovery-script:
        run: {executable: node, script: draft.mjs, resources: [], arguments: []}
    file:
      kind: file
      target: FILE.md
      guidance: guidance.md
      discovery-script: {}
profiles:
  work:
    description: Work
    declarations: {}
`,
    {
      "guidance.md": "Guidance",
      "discovery.md": "Discovery",
      "draft.mjs": draft(),
    },
  );
  t.after(() => invalid.close());
  const rejected = cli.run(["source", "validate", "--json"], invalid.root);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  const errors = (JSON.parse(rejected.stdout) as SourceValidation).errors.map(
    ({ code, path }) => [code, path],
  );
  for (const expected of [
    ["UNKNOWN_FIELD", "/defaults/declarations/malformed/discovery-script/id"],
    [
      "INVALID_EXECUTABLE",
      "/defaults/declarations/malformed/discovery-script/run/executable",
    ],
    [
      "MISSING_REFERENCE",
      "/defaults/declarations/malformed/discovery-script/run/script",
    ],
    [
      "INVALID_VERSION",
      "/defaults/declarations/malformed/discovery-script/prerequisite/version",
    ],
    [
      "INVALID_TIMEOUT",
      "/defaults/declarations/malformed/discovery-script/timeout-seconds",
    ],
    ["INVALID_DECLARATION", "/defaults/declarations/explicit/discovery-script"],
    [
      "REQUIRED_FIELD",
      "/defaults/declarations/incomplete/discovery-script/timeout-seconds",
    ],
    ["UNKNOWN_FIELD", "/defaults/declarations/file/discovery-script"],
  ])
    assert.ok(
      errors.some(
        ([code, path]) => code === expected[0] && path === expected[1],
      ),
      `Missing ${expected.join(" ")}: ${JSON.stringify(errors)}`,
    );
});
