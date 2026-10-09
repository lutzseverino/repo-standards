import type {
  Diagnostic,
  DirectoryInventory,
  ErrorReport,
  FileInventory,
  Inspection,
  Run,
  SourceValidation,
  UnsafeInventory,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  readFileSync,
  readdirSync,
  lstatSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  chmodSync,
  utimesSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  embeddedContent,
  installCli,
  sha256,
  snapshot,
  sourceFixture,
} from "./installed-cli.ts";
import {
  commit,
  git,
  inspectionArgs,
  remoteFixture,
  versionArgs,
} from "./remote-fixture.ts";
import { adoptionFixture } from "./adoption-fixture.ts";

const cli = installCli();
after(() => cli.close());

function oldGitEnv(directory: string, locateProject = false) {
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const bin = join(directory, "bin");
  mkdirSync(bin);
  const unexpected = join(directory, "unexpected-git-access");
  writeFileSync(
    join(bin, "git"),
    `#!${process.execPath}
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args.join(' ') === '--version') console.log('git version 2.31.8');
else if (${locateProject} && (args.slice(-2).join(' ') === 'rev-parse --show-toplevel' || args.slice(-3).join(' ') === 'rev-parse --git-path repo-standards-run.lock')) {
  const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} else { writeFileSync(${JSON.stringify(unexpected)}, 'Repository accessed'); process.exit(99); }
`,
  );
  chmodSync(join(bin, "git"), 0o755);
  return {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    unexpected,
  };
}

const simpleSource = (target = "AGENTS.md") => `format: repo-standards/v2
name: test-standards
description: Inspection fixture
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
    instructions:
      kind: file
      target: ${target}
      exact: content.md
profiles:
  work:
    description: Work
    declarations: {}
`;

test("inspection reports invalid invocation settings under their skill metadata paths", (t) => {
  const yaml = simpleSource().replace(
    "      kind: file\n      target: AGENTS.md\n      exact: content.md",
    "      kind: skill\n      name: review\n      source: skills/review",
  );
  const remote = remoteFixture(yaml, {
    "skills/review/SKILL.md":
      '---\ndisable-model-invocation: "false"\n---\nReview.',
    "skills/review/agents/openai.yaml":
      'policy:\n  allow_implicit_invocation: "true"\n',
  });
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const error = (JSON.parse(result.stdout) as ErrorReport).errors[0];
  assert.equal(error!.code, "INVALID_STANDARDS");
  assert.deepEqual(
    (error!.details as Diagnostic[]).map(
      ({
        code,
        file,
        line,
        column,
        path,
      }: {
        code: string;
        file: string;
        line: number;
        column: number;
        path: string;
      }) => ({ code, file, line, column, path }),
    ),
    [
      {
        code: "INVALID_TYPE",
        file: "skills/review/SKILL.md",
        line: 2,
        column: 27,
        path: "/disable-model-invocation",
      },
      {
        code: "INVALID_TYPE",
        file: "skills/review/agents/openai.yaml",
        line: 2,
        column: 30,
        path: "/policy/allow_implicit_invocation",
      },
    ],
  );
  assert.deepEqual(snapshot(project.root), before);
});

test("inspect and start reject Git older than 2.32 before observing public or retained selections", (t) => {
  const remote = remoteFixture(
    simpleSource(),
    { "content.md": "Instructions" },
    [],
    "alice/standards",
    true,
  );
  const project = sourceFixture("", {
    ".repo-standards/state.json": "Unreadable product state",
  });
  t.after(() => {
    remote.close();
    project.close();
  });
  symlinkSync("/unbound/ignore-rules", join(project.root, ".gitignore"));
  const { env: gitEnv, unexpected } = oldGitEnv(remote.support.root);
  const env = { ...remote.env, ...gitEnv };
  const before = snapshot(project.root);
  for (const args of [
    inspectionArgs,
    ["inspect", "--json"],
    ["start", ...inspectionArgs.slice(1), "--identity", "sha256:unobserved"],
    ["start", "--json", "--identity", "sha256:unobserved"],
  ]) {
    const result = cli.run(args, project.root, env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const error = (JSON.parse(result.stdout) as ErrorReport).errors[0];
    assert.equal(error!.code, "GIT_VERSION_UNSUPPORTED");
    assert.match(error!.message, /2\.31\.8/);
    assert.match(error!.message, /2\.32/);
  }
  assert.equal(
    lstatSync(unexpected, { throwIfNoEntry: false }),
    undefined,
    "Only the Git version probe may run",
  );
  assert.deepEqual(remote.requests(), []);
  assert.deepEqual(snapshot(project.root), before);
});

test("resume rejects Git older than 2.32 before reading records or observing work", async (t) => {
  const f = await adoptionFixture(
    t,
    cli,
    simpleSource().replace("exact: content.md", "guidance: content.md"),
    { files: { "content.md": "Maintain instructions." }, recordRequests: true },
  );
  const { remote, project, env } = f;
  const started = f.start();
  assert.equal(
    started.result.status,
    1,
    started.result.stdout + started.result.stderr,
  );
  assert.equal(started.report.phase, "contextual", started.result.stdout);
  const runRecord = join(
    project.root,
    git(project.root, "rev-parse", "--git-path", "repo-standards-run.lock"),
  );
  const run = JSON.parse(readFileSync(runRecord, "utf8")) as Run;
  const { env: gitEnv, unexpected } = oldGitEnv(remote.support.root, true);
  const requests = remote.requestLog().length;
  const commands = [
    ["resume", "--json"],
    ["resume", "--retry", "--json"],
    ["resume", "--assessment", "/unread/assessment.json", "--json"],
  ];
  for (const corruptRecords of [false, true]) {
    if (corruptRecords) {
      writeFileSync(
        runRecord,
        JSON.stringify({ ...run, format: "repo-standards/run/v999" }),
      );
      writeFileSync(
        join(project.root, ".repo-standards/state.json"),
        "Unreadable product state",
      );
    }
    const before = snapshot(project.root);
    for (const args of commands) {
      const result = cli.run(args, project.root, { ...env, ...gitEnv });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const error = (JSON.parse(result.stdout) as ErrorReport).errors?.[0];
      assert.equal(error?.code, "GIT_VERSION_UNSUPPORTED", result.stdout);
      assert.match(error.message, /2\.31\.8/);
      assert.match(error.message, /2\.32/);
      assert.match(error.message, /resume requires Git/);
      assert.match(error.message, /Upgrade Git and rerun the resume command/);
      assert.deepEqual(snapshot(project.root), before);
    }
  }
  assert.equal(
    lstatSync(unexpected, { throwIfNoEntry: false }),
    undefined,
    "Only the version and project-location probes may run",
  );
  assert.deepEqual(remote.requestLog().slice(requests), []);
});

test("resume rejects a CLI other than the pin before rejecting old Git", (t) => {
  const project = sourceFixture("", {
    ".repo-standards/state.json": "Unreadable product state",
  });
  const support = sourceFixture("");
  t.after(() => {
    project.close();
    support.close();
  });
  const { env, unexpected } = oldGitEnv(support.root, true);
  writeFileSync(
    join(project.root, ".repo-standards/lock.json"),
    JSON.stringify({
      format: "repo-standards/unknown/v999",
      selection: { cli: { version: "99.0.0" } },
    }),
  );
  const before = snapshot(project.root);
  const result = cli.run(["resume", "--json"], project.root, env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const error = (JSON.parse(result.stdout) as ErrorReport).errors[0];
  assert.equal(error!.code, "CLI_PIN_MISMATCH");
  assert.match(error!.message, /99\.0\.0/);
  assert.deepEqual(snapshot(project.root), before);
  assert.equal(
    lstatSync(unexpected, { throwIfNoEntry: false }),
    undefined,
    "Pin rejection must not observe project work",
  );
});

test("Git 2.32 and newer versions including vendor suffixes permit inspection and resume", (t) => {
  const remote = remoteFixture(simpleSource(), {
    "content.md": "Instructions",
  });
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const bin = join(remote.support.root, "bin");
  mkdirSync(bin);
  for (const version of ["2.32.0", "2.32.1 (Apple Git-132)", "3.0.0"]) {
    writeFileSync(
      join(bin, "git"),
      `#!${process.execPath}\nimport { spawnSync } from 'node:child_process';\nconst args = process.argv.slice(2);\nif (args.join(' ') === '--version') console.log(${JSON.stringify(`git version ${version}`)});\nelse { const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' }); process.exit(result.status ?? 1); }\n`,
    );
    chmodSync(join(bin, "git"), 0o755);
    const result = cli.run(inspectionArgs, project.root, {
      ...remote.env,
      PATH: `${bin}:${process.env.PATH}`,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(
      (JSON.parse(result.stdout) as Inspection).start.blockers,
      [],
    );
    const resumed = cli.run(["resume", "--json"], project.root, {
      ...remote.env,
      PATH: `${bin}:${process.env.PATH}`,
    });
    assert.equal(resumed.status, 1, resumed.stdout + resumed.stderr);
    assert.equal(
      (JSON.parse(resumed.stdout) as ErrorReport).errors[0]!.code,
      "NO_ACTIVE_RUN",
    );
  }
});

test("discovery identity ignores directory permissions but still binds a committed executable-bit change", (t) => {
  const yaml = simpleSource().replace(
    "    instructions:",
    "    docs:\n      kind: repository\n      guidance: guidance.md\n      discovery: discovery.md\n    instructions:",
  );
  const remote = remoteFixture(yaml, {
    "content.md": "Instructions",
    "guidance.md": "Document maintained projects.",
    "discovery.md": "Identify maintained projects.",
  });
  const project = sourceFixture("", { "scripts/check": "#!/bin/sh\nexit 0\n" });
  t.after(() => {
    remote.close();
    project.close();
  });
  chmodSync(join(project.root, "scripts/check"), 0o644);
  commit(project.root);
  const inspect = () => {
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout) as Inspection;
  };
  const initial = inspect();
  chmodSync(join(project.root, "scripts"), 0o700);
  assert.equal(inspect().identity, initial.identity);
  chmodSync(join(project.root, "scripts/check"), 0o755);
  commit(project.root);
  const executable = inspect();
  assert.notEqual(executable.identity, initial.identity);
  assert.notEqual(executable.discovery!.identity, initial.discovery!.identity);
  assert.ok(
    !executable.start.blockers.some(
      (blocker: { code: string }) => blocker.code === "DIRTY_PROJECT",
    ),
  );
});

test("inspection reports the pinned complete profile without changing a dirty project or executing author code", (t) => {
  const yaml = readFileSync("examples/alice/standards.yaml", "utf8")
    .replace("executable: python3", "executable: ./probe")
    .replace("resources: []", "resources: [payload.json, resources]");
  const files: Record<string, string> = {
    "payload.json": '{"key": 42}',
    "resources/support.txt": "Operation resource",
  };
  for (const path of [
    "defaults/files/AGENTS.md",
    "defaults/files/CONTRIBUTING.md",
    "defaults/guidance/readme.md",
    "defaults/guidance/source-layout.md",
    "defaults/checks/readme.py",
    "defaults/skills/review/SKILL.md",
    "profiles/work/files/AGENTS.md",
  ]) {
    files[path] = readFileSync(join("examples/alice", path), "utf8");
  }
  const remote = remoteFixture(yaml, files);
  const project = sourceFixture("", {
    "README.md": "Project README",
    "CONTRIBUTING.md": "Employer content",
    "AGENTS.md": "Old guidance",
    probe: "#!/bin/sh\ntouch SENTINEL\necho 3.12.0\n",
  });
  t.after(() => {
    remote.close();
    project.close();
  });
  chmodSync(join(project.root, "probe"), 0o755);
  commit(project.root);
  writeFileSync(join(project.root, "README.md"), "Uncommitted project README");
  writeFileSync(join(project.root, "untracked"), "Untracked content");
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as Inspection;
  assert.equal(report.selection.cli.version, cli.version);
  assert.deepEqual(report.selection.standards, {
    repository: "https://github.com/alice/standards",
    version: "v1.0.0",
    commit: remote.sha,
  });
  assert.equal(report.selection.profile, "work");
  assert.deepEqual(
    report.resolved.declarations.map((d: { id: string }) => d.id),
    ["agent-guidance", "readme", "review-skill", "source-layout"],
  );
  assert.deepEqual(
    embeddedContent(report),
    [],
    "Reports reference content by hash and carry changes as diffs",
  );
  const agents = report.exact.find(
    (d: { id: string }) => d.id === "agent-guidance",
  );
  assert.equal(agents!.action, "replace");
  assert.deepEqual(agents!.files[0]!.before, {
    type: "file",
    sha256: sha256("Old guidance"),
    executable: false,
  });
  assert.deepEqual(agents!.files[0]!.after, {
    type: "file",
    sha256: sha256(files["profiles/work/files/AGENTS.md"]!),
    executable: false,
  });
  assert.match(
    agents!.files[0]!.diff!,
    /^--- a\/AGENTS\.md\n\+\+\+ b\/AGENTS\.md\n@@ -1 \+1(,\d+)? @@\n-Old guidance\n\\ No newline at end of file\n\+/,
  );
  assert.deepEqual(report.guidance[0], {
    id: "readme",
    targets: ["README.md"],
    source: "defaults/guidance/readme.md",
    sha256: sha256(files["defaults/guidance/readme.md"]!),
    executable: false,
  });
  assert.equal(report.operations[0]!.run.executable, "./probe");
  assert.equal(report.operations[0]!.prerequisite.status, "not-checked");
  assert.deepEqual(report.operations[0]!.script, {
    path: "defaults/checks/readme.py",
    sha256: sha256(files["defaults/checks/readme.py"]!),
    executable: false,
  });
  assert.deepEqual(report.operations[0]!.resources[0], {
    path: "payload.json",
    type: "file",
    sha256: sha256(files["payload.json"]!),
    executable: false,
  });
  assert.equal(
    (
      (report.operations[0]!.resources[1]! as DirectoryInventory).entries[
        "support.txt"
      ]! as FileInventory
    ).sha256,
    sha256(files["resources/support.txt"]!),
  );
  assert.equal(
    (report.inputs["payload.json"]! as FileInventory).sha256,
    sha256(files["payload.json"]!),
  );
  assert.deepEqual(report.project.affected["README.md"], {
    type: "file",
    sha256: sha256("Uncommitted project README"),
    executable: false,
  });
  assert.equal(report.start.eligible, false);
  assert.ok(
    report.start.blockers.some(
      (b: { code: string }) => b.code === "DIRTY_PROJECT",
    ),
  );
  assert.deepEqual(
    Object.keys(report.project).sort(),
    ["affected", "productState", "skillLinks", "systemSkills"],
    "The project root, Git HEAD, index and status are not part of the report",
  );
  assert.match(report.identity, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(snapshot(project.root), before);
  git(project.root, "add", ".");
  commit(project.root);
  const pending = JSON.parse(
    cli.run(inspectionArgs, project.root, remote.env).stdout,
  ) as Inspection;
  assert.equal(
    pending.start.eligible,
    null,
    "Author prerequisites remain unverified even in a clean project",
  );
});

test("validation and inspection reject reserved skills and targets in an unselected profile with their original locations", (t) => {
  const remote = remoteFixture(
    simpleSource() +
      `  other:
    description: Other
    declarations:
      competing:
        kind: skill
        name: author-standards
        source: skill
      competing-file:
        kind: file
        target: .agents/skills/author-standards/SKILL.md
        exact: content.md
`,
    {
      "content.md": "Standards material",
      "skill/SKILL.md": "# Competing skill",
    },
  );
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const before = snapshot(project.root);
  const validation = cli.run(
    ["source", "validate", "--json"],
    remote.source.root,
  );
  assert.equal(validation.status, 1, validation.stdout + validation.stderr);
  const report = JSON.parse(validation.stdout) as SourceValidation;
  assert.deepEqual(report.profiles, {});
  const inspection = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(inspection.status, 1, inspection.stdout + inspection.stderr);
  const error = (JSON.parse(inspection.stdout) as ErrorReport).errors[0];
  assert.equal(error!.code, "INVALID_STANDARDS");
  for (const errors of [report.errors, error!.details as Diagnostic[]]) {
    assert.deepEqual(
      errors.map(
        ({
          code,
          path,
          line,
          column,
          profile,
        }: {
          code: string;
          path: string;
          line: number;
          column: number;
          profile?: string;
        }) => ({ code, path, line, column, profile }),
      ),
      [
        {
          code: "RESERVED_NAME",
          path: "/profiles/other/declarations/competing/name",
          line: 20,
          column: 15,
          profile: undefined,
        },
        {
          code: "RESERVED_TARGET",
          path: "/profiles/other/declarations/competing/name",
          line: 20,
          column: 15,
          profile: undefined,
        },
        {
          code: "RESERVED_TARGET",
          path: "/profiles/other/declarations/competing-file/target",
          line: 24,
          column: 17,
          profile: undefined,
        },
        {
          code: "TARGET_OVERLAP",
          path: "/profiles/other/declarations/competing-file/target",
          line: 24,
          column: 17,
          profile: "other",
        },
      ],
    );
  }
  assert.deepEqual(snapshot(project.root), before);
});

test("an unsafe ancestor is reported without following its link, and the identity binds the link target", (t) => {
  const remote = remoteFixture(simpleSource("linked/AGENTS.md"), {
    "content.md": "Expected",
  });
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  symlinkSync(remote.source.root, join(project.root, "linked"));
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as Inspection;
  assert.ok(
    report.start.blockers.some(
      (b: { code: string }) => b.code === "UNSAFE_TARGET",
    ),
    result.stdout,
  );
  assert.equal(report.project.affected["linked/AGENTS.md"]!.type, "unsafe");
  assert.deepEqual(snapshot(project.root), before);
  unlinkSync(join(project.root, "linked"));
  symlinkSync(remote.support.root, join(project.root, "linked"));
  assert.notEqual(
    (
      JSON.parse(
        cli.run(inspectionArgs, project.root, remote.env).stdout,
      ) as Inspection
    ).identity,
    report.identity,
  );
});

test("inspection identity binds affected bytes, executable state and profile, not the index or HEAD", (t) => {
  const remote = remoteFixture(
    simpleSource() + "  other:\n    description: Other\n    declarations: {}\n",
    { "content.md": "Expected" },
  );
  const project = sourceFixture("", { "AGENTS.md": "Expected" });
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const inspect = (args = inspectionArgs) => {
    const result = cli.run(args, project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout) as Inspection;
  };
  const first = inspect();
  assert.equal(first.start.eligible, true);
  assert.equal(first.exact[0]!.action, "match");
  assert.equal(inspect().identity, first.identity);
  assert.notEqual(
    inspect(inspectionArgs.map((arg) => (arg === "work" ? "other" : arg)))
      .identity,
    first.identity,
  );
  writeFileSync(join(project.root, "AGENTS.md"), "Changed once");
  const changed = inspect();
  assert.notEqual(changed.identity, first.identity);
  writeFileSync(join(project.root, "AGENTS.md"), "Changed twice");
  const twice = inspect();
  assert.notEqual(twice.identity, changed.identity);
  chmodSync(join(project.root, "AGENTS.md"), 0o755);
  const executable = inspect();
  assert.equal(
    (executable.exact[0]!.files[0]!.before as FileInventory).executable,
    true,
  );
  assert.notEqual(executable.identity, twice.identity);
  // Staging the same working bytes changes only the index, which the run
  // does not read: the dirty tree still blocks start either way.
  git(project.root, "add", "AGENTS.md");
  const staged = inspect();
  assert.equal(staged.identity, executable.identity);
  writeFileSync(join(project.root, "AGENTS.md"), "Index one");
  git(project.root, "add", "AGENTS.md");
  writeFileSync(join(project.root, "AGENTS.md"), "Working bytes");
  const indexOne = inspect();
  writeFileSync(join(project.root, "AGENTS.md"), "Index two");
  git(project.root, "add", "AGENTS.md");
  writeFileSync(join(project.root, "AGENTS.md"), "Working bytes");
  const indexTwo = inspect();
  assert.equal(indexOne.identity, indexTwo.identity);
  assert.ok(
    indexTwo.start.blockers.some(
      (b: { code: string }) => b.code === "DIRTY_PROJECT",
    ),
  );
  commit(project.root);
  const committed = inspect();
  assert.notEqual(
    committed.identity,
    indexTwo.identity,
    "Committing removes the dirty-project blocker",
  );
  // Unrelated commits touch nothing the run reads.
  writeFileSync(join(project.root, "unrelated.txt"), "Unrelated work");
  commit(project.root);
  git(
    project.root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Unrelated",
  );
  assert.equal(inspect().identity, committed.identity);
});

test("contextual path names cannot disappear from the inspection identity", (t) => {
  const remote = remoteFixture(
    simpleSource("__proto__").replace(
      "exact: content.md",
      "guidance: content.md",
    ),
    { "content.md": "Adapt this project-owned file" },
  );
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  writeFileSync(join(project.root, "__proto__"), "First");
  commit(project.root);
  writeFileSync(join(project.root, "__proto__"), "Dirty content one");
  const first = JSON.parse(
    cli.run(inspectionArgs, project.root, remote.env).stdout,
  ) as Inspection;
  writeFileSync(join(project.root, "__proto__"), "Dirty content two");
  const second = JSON.parse(
    cli.run(inspectionArgs, project.root, remote.env).stdout,
  ) as Inspection;
  assert.notEqual(first.identity, second.identity);
});

test("inspection never executes Git clean filters while observing dirty tracked content", (t) => {
  const remote = remoteFixture(simpleSource(), { "content.md": "Expected" });
  const project = sourceFixture("", {
    ".gitattributes": "filtered.txt filter=side-effect\n",
    "filtered.txt": "original",
  });
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  git(
    project.root,
    "config",
    "filter.side-effect.clean",
    "touch INSPECTION_MUTATED; cat",
  );
  const path = join(project.root, "filtered.txt");
  const stat = lstatSync(path);
  writeFileSync(path, "modified");
  utimesSync(path, stat.atime, new Date(0));
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(snapshot(project.root), before);
});

test("contextual files and repository directory trees reject incompatible existing target types", (t) => {
  const project = sourceFixture("", {
    "README.md/child.txt": "Directory content",
    src: "A file",
  });
  t.after(() => project.close());
  commit(project.root);
  for (const declaration of [
    "kind: file\n      target: README.md\n      guidance: content.md",
    "kind: repository\n      guidance: content.md\n      targets: {paths: [], directories: [src]}",
  ]) {
    const remote = remoteFixture(
      simpleSource().replace(
        "kind: file\n      target: AGENTS.md\n      exact: content.md",
        declaration,
      ),
      { "content.md": "Guidance" },
    );
    t.after(() => remote.close());
    const report = JSON.parse(
      cli.run(inspectionArgs, project.root, remote.env).stdout,
    ) as Inspection;
    assert.equal(report.start.eligible, false);
    assert.ok(
      report.start.blockers.some(
        (b: { code: string }) => b.code === "TARGET_TYPE",
      ),
    );
  }
});

test("inspection orders all fixes before checks, declarations by ID and operations by their declared order", (t) => {
  const operation = (id: string) => `        - id: ${id}
          run: {executable: ./probe, script: operation.sh, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=1.0.0"}
          timeout-seconds: 10`;
  const declaration = (id: string) => `    ${id}:
      kind: file
      target: ${id}.md
      exact: content.md
      fixes:
${operation("z-fix")}
${operation("a-fix")}
      checks:
${operation("z-check")}
${operation("a-check")}`;
  const yaml = simpleSource().replace(
    "    instructions:\n      kind: file\n      target: AGENTS.md\n      exact: content.md",
    `${declaration("beta")}\n${declaration("alpha")}`,
  );
  const remote = remoteFixture(yaml, {
    "content.md": "Expected",
    "operation.sh": "touch AUTHOR_RAN",
  });
  const project = sourceFixture("", {
    probe: "#!/bin/sh\ntouch PROBE_RAN\necho 1.0.0\n",
  });
  t.after(() => {
    remote.close();
    project.close();
  });
  chmodSync(join(project.root, "probe"), 0o755);
  commit(project.root);
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as Inspection;
  assert.deepEqual(
    report.operations.map(
      (op: { phase: string; declaration: string; id: string }) =>
        `${op.phase}:${op.declaration}:${op.id}`,
    ),
    [
      "fixes:alpha:z-fix",
      "fixes:alpha:a-fix",
      "fixes:beta:z-fix",
      "fixes:beta:a-fix",
      "checks:alpha:z-check",
      "checks:alpha:a-check",
      "checks:beta:z-check",
      "checks:beta:a-check",
    ],
  );
  assert.deepEqual(snapshot(project.root), before);
});

test("exact changes carry a unified diff for text and before-and-after hashes for binary content", (t) => {
  const yaml = simpleSource().replace(
    "profiles:",
    `    created:
      kind: file
      target: NEW.md
      exact: new.md
    logo:
      kind: file
      target: logo.bin
      exact: logo.bin
    unchanged:
      kind: file
      target: SAME.md
      exact: same.md
    empty:
      kind: file
      target: EMPTY.md
      exact: empty.md
profiles:`,
  );
  const oldLogo = Buffer.from([0, 1, 2, 255]),
    newLogo = Buffer.from([0, 1, 3, 255]);
  const remote = remoteFixture(yaml, {
    "content.md": "one\n2\nthree\nfour",
    "new.md": "hello\n",
    "logo.bin": newLogo,
    "same.md": "Same\n",
    "empty.md": "",
  });
  const project = sourceFixture("", {
    "AGENTS.md": "one\ntwo\nthree\n",
    "logo.bin": oldLogo,
    "SAME.md": "Same\n",
  });
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as Inspection;
  const files = (id: string) =>
    report.exact.find((entry: { id: string }) => entry.id === id)!.files;
  const text = (value: string) => ({
    type: "file",
    sha256: sha256(value),
    executable: false,
  });
  assert.deepEqual(files("instructions"), [
    {
      path: "AGENTS.md",
      before: text("one\ntwo\nthree\n"),
      after: text("one\n2\nthree\nfour"),
      diff: "--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1,3 +1,4 @@\n one\n-two\n+2\n three\n+four\n\\ No newline at end of file\n",
    },
  ]);
  assert.deepEqual(files("created"), [
    {
      path: "NEW.md",
      before: { type: "missing" },
      after: text("hello\n"),
      diff: "--- /dev/null\n+++ b/NEW.md\n@@ -0,0 +1 @@\n+hello\n",
    },
  ]);
  assert.deepEqual(files("logo"), [
    {
      path: "logo.bin",
      before: { type: "file", sha256: sha256(oldLogo), executable: false },
      after: { type: "file", sha256: sha256(newLogo), executable: false },
      binary: true,
    },
  ]);
  assert.deepEqual(files("unchanged"), [
    { path: "SAME.md", before: text("Same\n"), after: text("Same\n") },
  ]);
  // A unified diff cannot express creating an empty file; its states do.
  assert.deepEqual(files("empty"), [
    { path: "EMPTY.md", before: { type: "missing" }, after: text("") },
  ]);
  assert.deepEqual(embeddedContent(report), []);
});

test("exact replacements preserve both root observations when files and directories conflict", (t) => {
  const project = sourceFixture("", {
    "AGENTS.md/child.txt": "Existing directory child",
    ".agents/skills/review": "Existing file",
  });
  const fileRemote = remoteFixture(simpleSource(), {
    "content.md": "Desired file",
  });
  const skillRemote = remoteFixture(
    simpleSource().replace(
      "kind: file\n      target: AGENTS.md\n      exact: content.md",
      "kind: skill\n      name: review\n      source: skill",
    ),
    { "skill/SKILL.md": "Desired skill" },
  );
  t.after(() => {
    project.close();
    fileRemote.close();
    skillRemote.close();
  });
  commit(project.root);
  const before = snapshot(project.root);
  const inspect = (remote: ReturnType<typeof remoteFixture>) => {
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout) as Inspection;
    assert.equal(report.start.eligible, false);
    assert.ok(
      report.start.blockers.some(
        (blocker: { code: string }) => blocker.code === "TARGET_TYPE",
      ),
    );
    assert.equal(report.exact[0]!.action, "replace");
    return report.exact[0]!.files;
  };
  const file = inspect(fileRemote).find(
    (entry: { path: string }) => entry.path === "AGENTS.md",
  );
  assert.ok(
    file,
    "The exact replacement must retain the root directory and desired file",
  );
  assert.equal(file.before.type, "directory");
  assert.deepEqual(file.before.entries["child.txt"], {
    type: "file",
    sha256: sha256("Existing directory child"),
    executable: false,
  });
  assert.deepEqual(file.after, {
    type: "file",
    sha256: sha256("Desired file"),
    executable: false,
  });
  assert.equal(file.diff, undefined, "A type conflict has no text diff");
  const skill = inspect(skillRemote).find(
    (entry: { path: string }) => entry.path === ".agents/skills/review",
  );
  assert.ok(
    skill,
    "The exact replacement must retain the existing file and desired skill directory",
  );
  assert.deepEqual(skill.before, {
    type: "file",
    sha256: sha256("Existing file"),
    executable: false,
  });
  assert.equal(skill.after.type, "directory");
  assert.equal(
    (skill.after.entries["SKILL.md"]! as FileInventory).sha256,
    sha256("Desired skill"),
  );
  assert.deepEqual(snapshot(project.root), before);
});

test("case conflicts retain the exact target hashes and bind them into inspection identity", (t) => {
  for (const nested of [false, true]) {
    const target = nested ? "foo/AGENTS.md" : "foo";
    const alias = nested ? "FOO/AGENTS.md" : "FOO";
    const project = sourceFixture("", {
      [target]: "Tracked exact bytes",
      [alias]: "Alias bytes",
    });
    t.after(() => project.close());
    if (
      !readdirSync(project.root).includes("foo") ||
      !readdirSync(project.root).includes("FOO")
    ) {
      t.skip(
        "Requires a case-sensitive filesystem where both foo and FOO can exist",
      );
      return;
    }
    const remote = remoteFixture(simpleSource(target), {
      "content.md": "Desired file",
    });
    t.after(() => remote.close());
    commit(project.root);
    writeFileSync(join(project.root, target), "Dirty exact bytes one");
    const before = snapshot(project.root);
    const inspect = () => {
      const result = cli.run(inspectionArgs, project.root, remote.env);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return JSON.parse(result.stdout) as Inspection;
    };
    const first = inspect();
    assert.deepEqual(snapshot(project.root), before);
    assert.equal(first.start.eligible, false);
    assert.ok(
      first.start.blockers.some(
        (blocker: { code: string }) => blocker.code === "CASE_CONFLICT",
      ),
    );
    const obstacles = (first.project.affected[target]! as UnsafeInventory)
      .obstacles;
    assert.ok(
      obstacles!.foo,
      "The exact component must be observed alongside its aliases",
    );
    assert.equal(
      nested
        ? (
            (obstacles!.foo as DirectoryInventory).entries[
              "AGENTS.md"
            ]! as FileInventory
          ).sha256
        : (obstacles!.foo as FileInventory).sha256,
      sha256("Dirty exact bytes one"),
    );
    assert.equal(
      nested
        ? (
            (obstacles!.FOO! as DirectoryInventory).entries[
              "AGENTS.md"
            ]! as FileInventory
          ).sha256
        : (obstacles!.FOO! as FileInventory).sha256,
      sha256("Alias bytes"),
    );
    writeFileSync(join(project.root, target), "Dirty exact bytes two");
    const second = inspect();
    assert.notEqual(second.identity, first.identity);
  }
});

test("inspection reports project, scope, and product-state blockers before one block per installation target", (t) => {
  const yaml = `format: repo-standards/v2
name: test-standards
description: Blocker order fixture
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
    project-docs:
      kind: repository
      guidance: guidance.md
      discovery: discovery.md
    review:
      kind: skill
      name: review
      source: skill
profiles:
  work:
    description: Work
    declarations: {}
`;
  const remote = remoteFixture(yaml, {
    "guidance.md": "Document each project.",
    "discovery.md": "Find maintained projects.",
    "skill/SKILL.md": "Supplied review",
  });
  const project = sourceFixture("", {
    ".agents/skills/adopt-standards/SKILL.md": "Unrelated system skill",
    ".agents/skills/review/SKILL.md": "Unrelated review",
  });
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  writeFileSync(
    join(project.root, ".agents/skills/adopt-standards/local.md"),
    "Untracked system resource",
  );
  writeFileSync(
    join(project.root, ".agents/skills/review/local.md"),
    "Untracked resource",
  );
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as Inspection;
  assert.deepEqual(
    report.start.blockers.map(
      ({ code, path }: { code: string; path?: string }) => ({ code, path }),
    ),
    [
      { code: "DIRTY_PROJECT", path: undefined },
      { code: "DISCOVERY_REQUIRED", path: undefined },
      {
        code: "UNTRACKED_REPLACEMENT",
        path: ".agents/skills/adopt-standards/local.md",
      },
      { code: "UNTRACKED_REPLACEMENT", path: ".agents/skills/review/local.md" },
    ],
  );
  assert.deepEqual(report.discardedEdits, [
    ".agents/skills/adopt-standards",
    ".agents/skills/review",
  ]);
});

// A confirmation-required change is one the run makes by discarding a
// person's edits. Every other change, however large, needs no confirmation.
test("inspection requires confirmation only when the run discards edits, with one reason per discarded edit", async (t) => {
  const standards = (
    version: string,
    declarations: string,
  ) => `format: repo-standards/v2
name: test-standards
description: Confirmation fixture ${version}
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
${declarations}
profiles:
  work:
    description: Work
    declarations: {}
`;
  const instructions = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`;
  const review = `    review:
      kind: skill
      name: review
      source: review`;
  const files = { "agents.md": "Version one", "review/SKILL.md": "# Review" };
  const none = { required: false, reasons: [] };
  const discarded = (...targets: string[]) => ({
    required: true,
    reasons: targets.map((target) => ({ change: "discarded-edit", target })),
  });
  await t.test("a first adoption that discards nothing", async (st) => {
    const f = await adoptionFixture(st, cli, standards("v1", instructions), {
      files,
      project: { "README.md": "Project" },
    });
    assert.deepEqual(f.inspect().confirmation, none);
  });
  await t.test(
    "a first adoption that replaces existing content",
    async (st) => {
      const f = await adoptionFixture(
        st,
        cli,
        standards("v1", `${instructions}\n${review}`),
        {
          files,
          project: {
            "AGENTS.md": "The maintainer's own instructions",
            ".agents/skills/review/SKILL.md": "# The maintainer's review",
          },
        },
      );
      const inspection = f.inspect();
      assert.deepEqual(inspection.discardedEdits, [
        "AGENTS.md",
        ".agents/skills/review",
      ]);
      assert.deepEqual(
        inspection.confirmation,
        discarded("AGENTS.md", ".agents/skills/review"),
      );
    },
  );
  await t.test(
    "an update that replaces an edited installed file",
    async (st) => {
      const f = await adoptionFixture(st, cli, standards("v1", instructions), {
        files,
      });
      f.adopt();
      writeFileSync(join(f.root, "AGENTS.md"), "Maintainer edit");
      commit(f.root);
      f.remote.addVersion("v1.1.0", standards("v1.1", instructions), {
        "agents.md": "Version two",
      });
      assert.deepEqual(
        f.inspect(versionArgs("v1.1.0")).confirmation,
        discarded("AGENTS.md"),
      );
    },
  );
  await t.test(
    "a breaking update that changes, retires and removes unedited installed content",
    async (st) => {
      const f = await adoptionFixture(
        st,
        cli,
        standards("v1", `${instructions}\n${review}`),
        { files },
      );
      f.adopt();
      f.remote.addVersion("v2.0.0", standards("v2", instructions), {
        "agents.md": "Version two",
      });
      const inspection = f.inspect(versionArgs("v2.0.0"));
      assert.deepEqual(inspection.update, ["standards"]);
      assert.deepEqual(
        inspection.removed!.map(({ target }) => target),
        [".agents/skills/review", ".claude/skills/review"],
      );
      assert.equal(inspection.exact[0]!.action, "replace");
      assert.deepEqual(inspection.confirmation, none);
    },
  );
});

test("inspection without npm on PATH fails with setup instructions before any other work", (t) => {
  const project = sourceFixture("");
  t.after(() => project.close());
  const bin = join(project.root, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "node"));
  symlinkSync(
    execFileSync("/bin/sh", ["-c", "command -v git"], {
      encoding: "utf8",
    }).trim(),
    join(bin, "git"),
  );
  const result = cli.run(inspectionArgs, project.root, {
    ...process.env,
    PATH: bin,
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout) as ErrorReport;
  assert.equal(report.errors[0]!.code, "NPM_REQUIRED");
  assert.match(report.errors[0]!.message, /Node\.js 24.*PATH/);
});
