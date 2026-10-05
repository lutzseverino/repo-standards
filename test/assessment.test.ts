import type { ErrorReport, Run, Status } from "./json-reports.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { after, test } from "node:test";
import type { TestContext } from "node:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { embeddedContent, installCli, sha256 } from "./installed-cli.ts";
import {
  git,
  inspectionArgs,
  manifest,
  operation,
  startArgs,
} from "./remote-fixture.ts";
import { filesystemFault } from "./adoption-faults.ts";
import { adoptionFixture } from "./adoption-fixture.ts";

const cli = installCli();
after(() => cli.close());
const check = (id: string) =>
  operation(id, {
    script: "check.mjs",
    prerequisite: { "version-arguments": ["--version"], version: ">=24 <25" },
  });
async function fixture(
  t: TestContext,
  script = `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Verified'}));`,
) {
  const f = await adoptionFixture(
    t,
    cli,
    manifest(
      {
        agents: { kind: "file", target: "AGENTS.md", exact: "default.md" },
        contribution: {
          kind: "file",
          target: "CONTRIBUTING.md",
          exact: "default.md",
        },
        readme: {
          kind: "file",
          target: "README.md",
          guidance: "readme.md",
          checks: [check("headings")],
        },
        review: { kind: "skill", name: "review", source: "skill" },
        layout: {
          kind: "repository",
          guidance: "layout.md",
          targets: { paths: ["config.json"], directories: ["src"] },
        },
      },
      {
        work: {
          agents: { kind: "file", target: "AGENTS.md", exact: "work.md" },
          contribution: { exclude: true },
        },
      },
    ),
    {
      files: {
        "default.md": "Default",
        "work.md": "Work instructions",
        "readme.md": "Describe setup and architecture.",
        "layout.md": "Explain source responsibilities.",
        "skill/SKILL.md": "# Review",
        "check.mjs": script,
      },
      project: {
        "README.md": "# Bob\nA queue service.",
        "CONTRIBUTING.md": "Employer policy",
        ".gitignore": "ignored/\n",
        "src/old.ts": "// Old",
      },
    },
  );
  const { project, remote, env } = f;
  const result = f.run(startArgs(f.inspect().identity));
  const run = JSON.parse(result.stdout) as Run;
  assert.equal(run.phase, "contextual", result.stdout + result.stderr);
  return {
    project,
    remote,
    env,
    run,
    resume<T = Run>(assessment?: unknown) {
      const args = ["resume", "--json"];
      if (assessment !== undefined) {
        const path = join(remote.support.root, "assessment.json");
        writeFileSync(
          path,
          typeof assessment === "string"
            ? assessment
            : JSON.stringify(assessment),
        );
        args.push("--assessment", path);
      }
      const result = f.run(args);
      return { result, report: JSON.parse(result.stdout) as T };
    },
  };
}

test("contextual handoff identifies the run, retained guidance, allowed targets and required evidence", async (t) => {
  const f = await fixture(t);
  assert.equal(f.run.outcome, "incomplete");
  assert.equal(f.run.operations.length, 0);
  const request = f.run.workRequest;
  assert.equal(request!.format, "repo-standards/work-request/v3");
  assert.equal("scope" in request!, false);
  assert.equal(request!.run, f.run.id);
  assert.match(request!.selection, /^sha256:/);
  assert.match(request!.snapshot, /^sha256:/);
  assert.deepEqual(
    request!.declarations.map((d: { id: string }) => d.id),
    ["layout", "readme"],
  );
  assert.deepEqual(request!.declarations[0]!.allowedTargets, {
    paths: ["config.json"],
    directories: ["src"],
  });
  assert.deepEqual(request!.declarations[1]!.guidance, {
    id: "readme",
    targets: ["README.md"],
    source: "readme.md",
    sha256: sha256("Describe setup and architecture."),
    executable: false,
    retained: ".repo-standards/inputs/source/readme.md",
  });
  assert.equal(
    readFileSync(
      join(f.project.root, request!.declarations[1]!.guidance.retained),
      "utf8",
    ),
    "Describe setup and architecture.",
  );
  assert.deepEqual(
    embeddedContent(f.run),
    [],
    "The run record references guidance by path and hash",
  );
  assert.deepEqual(request!.requiredEvidence, [
    "status",
    "explanation",
    "evidence",
  ]);
  assert.equal(
    readFileSync(join(f.project.root, "AGENTS.md"), "utf8"),
    "Work instructions",
  );
  assert.equal(
    readFileSync(join(f.project.root, "CONTRIBUTING.md"), "utf8"),
    "Employer policy",
  );
  assert.equal(
    existsSync(join(f.project.root, ".repo-standards/state.json")),
    false,
  );
});

// The agent supplies only its judgment; the CLI binds the run and derives changed paths.
function submission() {
  return {
    format: "repo-standards/assessment/v3",
    declarations: [
      {
        id: "layout",
        status: "satisfied",
        explanation: "Source responsibilities documented.",
        evidence: ["Queue module identifies its responsibility."],
      },
      {
        id: "readme",
        status: "satisfied",
        explanation: "README describes Bob’s service.",
        evidence: ["Setup and architecture explain the queue."],
      },
    ],
  };
}
function contextualWork(root: string) {
  writeFileSync(
    join(root, "README.md"),
    "# Bob\n## Setup\nRun the queue worker.\n## Architecture\nsrc/queue.ts owns delivery.",
  );
  writeFileSync(join(root, "src/queue.ts"), "// Owns queued message delivery.");
}
test("scripted agent completes Alice work with separate assessment and check evidence and unchanged HEAD", async (t) => {
  const f = await fixture(t);
  const head = git(f.project.root, "rev-parse", "HEAD");
  contextualWork(f.project.root);
  const refreshed = f.resume();
  assert.equal(refreshed.report.phase, "contextual", refreshed.result.stdout);
  assert.notEqual(
    refreshed.report.workRequest!.snapshot,
    f.run.workRequest!.snapshot,
  );
  const { result, report } = f.resume(submission());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.outcome, "complete");
  assert.equal(report.operations[0]!.result!.status, "passed");
  const status = JSON.parse(
    cli.run(["status", "--json"], f.project.root, f.env).stdout,
  ) as Status;
  assert.equal(status.active, null);
  const request = refreshed.report.workRequest;
  // The CLI binds the judgment to the active run and derives each declaration's changed paths.
  assert.deepEqual(status.assessments, [
    {
      format: "repo-standards/assessment/v3",
      run: request!.run,
      selection: request!.selection,
      snapshot: request!.snapshot,
      declarations: [
        {
          id: "layout",
          status: "satisfied",
          explanation: "Source responsibilities documented.",
          changedPaths: ["src/queue.ts"],
          evidence: ["Queue module identifies its responsibility."],
        },
        {
          id: "readme",
          status: "satisfied",
          explanation: "README describes Bob’s service.",
          changedPaths: ["README.md"],
          evidence: ["Setup and architecture explain the queue."],
        },
      ],
    },
  ]);
  assert.equal(status.checks!.length, 1);
  assert.equal(git(f.project.root, "rev-parse", "HEAD"), head);
  assert.notEqual(git(f.project.root, "status", "--porcelain"), "");
  assert.equal(
    readFileSync(join(f.project.root, "CONTRIBUTING.md"), "utf8"),
    "Employer policy",
  );
});

test("blocked agent evidence is retained separately and prevents checks until renewed assessment", async (t) => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  f.resume();
  const blocked = submission();
  blocked.declarations[0]!.status = "blocked";
  blocked.declarations[0]!.explanation =
    "Queue ownership needs maintainer clarification.";
  const { result, report } = f.resume(blocked);
  assert.equal(result.status, 1);
  assert.match(report.reason, /ASSESSMENT_BLOCKED/);
  assert.equal(report.operations.length, 0);
  assert.equal(report.assessments[0]!.declarations[0]!.status, "blocked");
  assert.equal(
    existsSync(join(f.project.root, ".repo-standards/state.json")),
    false,
  );
  const renewed = f.resume(submission());
  assert.equal(renewed.result.status, 0, renewed.result.stdout);
});

test("malformed assessments, copied run fields, changed paths and missing declarations stay incomplete", async (t) => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  const request = f.resume().report.workRequest;
  const valid = submission();
  const examples: {
    name: string;
    code: string;
    change: (value: ReturnType<typeof submission>) => unknown;
  }[] = [
    { name: "invalid JSON", code: "ASSESSMENT_FORMAT", change: () => "{" },
    { name: "null", code: "ASSESSMENT_FORMAT", change: () => null },
    {
      name: "unknown field",
      code: "ASSESSMENT_FORMAT",
      change: (value) => ({ ...value, unexpected: true }),
    },
    {
      name: "retired format",
      code: "ASSESSMENT_FORMAT",
      change: (value) => ({ ...value, format: "repo-standards/assessment/v2" }),
    },
    {
      name: "copied run fields",
      code: "ASSESSMENT_FORMAT",
      change: (value) => ({
        ...value,
        run: request!.run,
        selection: request!.selection,
        snapshot: request!.snapshot,
      }),
    },
    {
      name: "missing declaration",
      code: "ASSESSMENT_DECLARATIONS",
      change: (value) => ({
        ...value,
        declarations: value.declarations.slice(1),
      }),
    },
    {
      name: "duplicate declaration",
      code: "ASSESSMENT_DECLARATIONS",
      change: (value) => ({
        ...value,
        declarations: [value.declarations[0], value.declarations[0]],
      }),
    },
    {
      name: "unknown declaration",
      code: "ASSESSMENT_DECLARATIONS",
      change: (value) => {
        value.declarations[0]!.id = "unknown";
        return value;
      },
    },
    {
      name: "no explanation",
      code: "ASSESSMENT_FORMAT",
      change: (value) => {
        value.declarations[0]!.explanation = " ";
        return value;
      },
    },
    {
      name: "no evidence",
      code: "ASSESSMENT_FORMAT",
      change: (value) => {
        value.declarations[0]!.evidence = [];
        return value;
      },
    },
    {
      name: "array status",
      code: "ASSESSMENT_FORMAT",
      change: (value) => ({
        ...value,
        declarations: value.declarations.map((entry) => ({
          ...entry,
          status: ["satisfied"],
        })),
      }),
    },
    {
      name: "invalid status",
      code: "ASSESSMENT_FORMAT",
      change: (value) => {
        value.declarations[0]!.status = "passed";
        return value;
      },
    },
    {
      name: "supplied changed paths",
      code: "ASSESSMENT_FORMAT",
      change: (value) => ({
        ...value,
        declarations: value.declarations.map((entry) => ({
          ...entry,
          changedPaths: ["src/queue.ts"],
        })),
      }),
    },
  ];
  for (const example of examples)
    await t.test(example.name, () => {
      const { result, report } = f.resume(
        example.change(structuredClone(valid)),
      );
      assert.equal(result.status, 1, result.stdout);
      assert.ok(report.reason.startsWith(example.code + ":"), report.reason);
      assert.equal(report.operations.length, 0);
      assert.equal(
        existsSync(join(f.project.root, ".repo-standards/state.json")),
        false,
      );
    });
  // The reason names the declaration whose evidence is missing.
  const missing = f.resume({
    ...valid,
    declarations: valid.declarations.slice(1),
  }).report.reason;
  assert.ok(
    missing.startsWith("ASSESSMENT_DECLARATIONS:") &&
      missing.includes("layout"),
    missing,
  );
  assert.equal(f.resume(valid).result.status, 0);
});

test("an assessment submitted for no active run is rejected with the next step", async (t) => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  f.resume();
  assert.equal(f.resume(submission()).result.status, 0);
  const { result, report } = f.resume<ErrorReport>(submission());
  assert.equal(result.status, 1, result.stdout);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0]!.code, "NO_ACTIVE_RUN");
  // The next step reads status.
  assert.ok(
    report.errors[0]!.message.includes("status"),
    report.errors[0]!.message,
  );
});

test("observed out-of-scope tracked and untracked changes block completion while ignored content is excluded", async (t) => {
  for (const path of ["CONTRIBUTING.md", "unrelated.txt", "src-other.txt"])
    await t.test(path, async (st) => {
      const f = await fixture(st);
      contextualWork(f.project.root);
      writeFileSync(join(f.project.root, path), "Unrelated work");
      f.resume();
      const { report } = f.resume(submission());
      assert.ok(
        report.reason.startsWith("ASSESSMENT_SCOPE:") &&
          report.reason.includes(path),
        report.reason,
      );
      assert.equal(
        readFileSync(join(f.project.root, path), "utf8"),
        "Unrelated work",
      );
    });
  const f = await fixture(t);
  contextualWork(f.project.root);
  mkdirSync(join(f.project.root, "ignored"));
  f.resume();
  writeFileSync(join(f.project.root, "ignored/cache"), "Ignored work");
  assert.equal(f.resume(submission()).result.status, 0);
});

test("changed content invalidates prior assessment and every check runs again after renewed evidence", async (t) => {
  const f = await fixture(
    t,
    `import { readFileSync } from 'node:fs';
console.log(JSON.stringify({format:'repo-standards/result/v1',status:readFileSync('README.md','utf8').includes('Ready')?'passed':'failed',message:'Requires readiness'}));`,
  );
  contextualWork(f.project.root);
  f.resume();
  const initial = submission();
  const failed = f.resume(initial);
  assert.match(failed.report.reason, /CHECKS_FAILED/);
  assert.equal(failed.report.assessments.length, 1);
  assert.match(f.resume("{").report.reason, /ASSESSMENT_FORMAT/);
  writeFileSync(
    join(f.project.root, "README.md"),
    readFileSync(join(f.project.root, "README.md"), "utf8") + "\nReady",
  );
  const stale = f.resume(initial);
  assert.match(stale.report.reason, /STALE_ASSESSMENT/);
  assert.equal(stale.report.operations.length, 1);
  f.resume();
  const complete = f.resume(initial);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.deepEqual(
    complete.report.operations.map((o) => o.result!.status),
    ["failed", "passed"],
  );
  const status = JSON.parse(
    cli.run(["status", "--json"], f.project.root, f.env).stdout,
  ) as Status;
  assert.equal(status.checks!.length, 1);
  assert.equal(status.checks![0]!.result!.status, "passed");
});

test("contextual work cannot corrupt installed exact content", async (t) => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  f.resume();
  const valid = submission();
  // One representative: verifyInstallation's branches are covered once, in adoption.test.ts.
  const target = join(f.project.root, "AGENTS.md");
  const before = readFileSync(target);
  writeFileSync(target, "Corrupted");
  const { result, report } = f.resume(valid);
  assert.equal(result.status, 1);
  assert.match(report.reason, /FINAL_INTEGRITY/);
  assert.equal(report.operations.length, 0);
  assert.equal(
    existsSync(join(f.project.root, ".repo-standards/state.json")),
    false,
  );
  assert.equal(readFileSync(target, "utf8"), "Corrupted");
  writeFileSync(target, before);
  // Restoring the bytes cannot erase the recorded out-of-scope agent changes.
  assert.match(f.resume(valid).report.reason, /^ASSESSMENT_SCOPE:/);
});

test("checks after assessment still reject mutation", async (t) => {
  const f = await fixture(
    t,
    `import { writeFileSync } from 'node:fs';
writeFileSync('README.md', 'Changed during check');
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Reported success'}));`,
  );
  contextualWork(f.project.root);
  f.resume();
  const { result, report } = f.resume(submission());
  assert.equal(result.status, 1);
  assert.ok(report.reason.startsWith("CHECK_MUTATION:"), report.reason);
  assert.equal(report.assessments.length, 1);
  assert.equal(report.operations.length, 1);
  assert.equal(
    readFileSync(join(f.project.root, "README.md"), "utf8"),
    "Changed during check",
  );
  assert.equal(
    existsSync(join(f.project.root, ".repo-standards/state.json")),
    false,
  );
});

test("content changing between assessment and final verification requires reassessment and fresh checks", async (t) => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  f.resume();
  const valid = submission();
  const env = filesystemFault(
    f.remote.support.root,
    f.env,
    "verification",
    `write.call(fs, 'README.md', '# Bob\\nChanged after assessment');`,
  );
  const assessmentPath = join(f.remote.support.root, "assessment.json");
  writeFileSync(assessmentPath, JSON.stringify(valid));
  const result = cli.run(
    ["resume", "--assessment", assessmentPath, "--json"],
    f.project.root,
    env,
  );
  const report = JSON.parse(result.stdout) as Run;
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(report.reason, /STALE_ASSESSMENT/);
  assert.equal(
    existsSync(join(f.project.root, ".repo-standards/state.json")),
    false,
  );
  f.resume();
  const renewed = f.resume(valid);
  assert.equal(renewed.result.status, 0, renewed.result.stdout);
  assert.equal(renewed.report.operations.length, 2);
});

test("a second independent author uses fixes, repository configuration and runbook evidence through the same handoff", async (t) => {
  const f = await adoptionFixture(
    t,
    cli,
    manifest(
      {
        operations: {
          kind: "repository",
          guidance: "ops.md",
          targets: { paths: ["service.json"], directories: ["runbooks"] },
          fixes: [check("prepare")],
          checks: [check("verify")],
        },
      },
      { work: {} },
      "charlie-operations",
    ),
    {
      repository: "charlie/operations",
      project: { "README.md": "# Payments API" },
      files: {
        "ops.md":
          "Record a service owner, incident command and a service-specific recovery procedure.",
        "check.mjs": `import { readFileSync, writeFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0,'utf8'));
if (input.operation.phase === 'fixes') writeFileSync('service.json', JSON.stringify({owner:'payments'}));
const status = input.operation.phase === 'fixes' ? 'changed' : JSON.parse(readFileSync('service.json','utf8')).owner === 'payments' && readFileSync('runbooks/recovery.md','utf8').includes('Replay failed payments') ? 'passed' : 'failed';
console.log(JSON.stringify({format:'repo-standards/result/v1',status,message:'Service operations verified'}));`,
      },
    },
  );
  const { remote, project, env } = f;
  const args = inspectionArgs.map((arg) =>
    arg === "https://github.com/alice/standards"
      ? "https://github.com/charlie/operations"
      : arg,
  );
  const started = JSON.parse(
    f.run(startArgs(f.inspect(args).identity, args)).stdout,
  ) as Run;
  assert.equal(started.phase, "contextual");
  assert.equal(started.operations[0]!.result!.status, "changed");
  assert.equal(
    readFileSync(join(project.root, "service.json"), "utf8"),
    '{"owner":"payments"}',
  );
  mkdirSync(join(project.root, "runbooks"));
  writeFileSync(
    join(project.root, "runbooks/recovery.md"),
    "Incident command: payments on-call. Replay failed payments using the queue.",
  );
  const request = (
    JSON.parse(cli.run(["resume", "--json"], project.root, env).stdout) as Run
  ).workRequest;
  const path = join(remote.support.root, "assessment.json");
  assert.equal(request!.declarations.length, 1);
  writeFileSync(
    path,
    JSON.stringify({
      format: "repo-standards/assessment/v3",
      declarations: [
        {
          id: "operations",
          status: "satisfied",
          explanation: "Owner recorded and payments recovery documented.",
          evidence: [
            "service.json names payments; runbook gives the replay procedure.",
          ],
        },
      ],
    }),
  );
  const resumed = cli.run(
    ["resume", "--assessment", path, "--json"],
    project.root,
    env,
  );
  assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
  const completed = JSON.parse(resumed.stdout) as Run;
  assert.deepEqual(
    completed.operations.map((o) => o.result!.status),
    ["changed", "passed"],
  );
  // The created directory target and its file are derived; the fix's own change is not contextual.
  assert.deepEqual(completed.assessments[0]!.declarations[0]!.changedPaths, [
    "runbooks",
    "runbooks/recovery.md",
  ]);
});

test("assessment accounts for deleted tracked files and executable changes", async (t) => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  f.resume();
  rmSync(join(f.project.root, "src/old.ts"));
  chmodSync(join(f.project.root, "src/queue.ts"), 0o755);
  assert.match(f.resume(submission()).report.reason, /STALE_ASSESSMENT/);
  f.resume();
  const { result, report } = f.resume(submission());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.project.root, "src/old.ts")), false);
  assert.deepEqual(
    report.assessments[0]!.declarations.map(
      (entry: { changedPaths: string[] }) => entry.changedPaths,
    ),
    [["src/old.ts", "src/queue.ts"], ["README.md"]],
  );
});

test("only one resume can execute checks for an active contextual adoption", async (t) => {
  // The check runs until the test releases it.
  const f = await fixture(
    t,
    `import { existsSync, writeFileSync } from 'node:fs';
writeFileSync('.repo-standards/local/check-started', 'started');
const wait = setInterval(() => {
  if (!existsSync('.repo-standards/local/check-released')) return;
  clearInterval(wait);
  console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Verified'}));
}, 10);`,
  );
  contextualWork(f.project.root);
  f.resume();
  const assessment = submission();
  const path = join(f.remote.support.root, "assessment.json");
  writeFileSync(path, JSON.stringify(assessment));
  const child = spawn(
    join(cli.root, "node_modules/.bin/repo-standards"),
    ["resume", "--assessment", path, "--json"],
    { cwd: f.project.root, env: f.env },
  );
  t.after(() => child.kill());
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const finished = new Promise<number | null>((resolve, reject) => {
    child.on("close", resolve);
    child.on("error", reject);
  });
  const deadline = Date.now() + 5000;
  while (
    !existsSync(join(f.project.root, ".repo-standards/local/check-started")) &&
    child.exitCode === null &&
    Date.now() < deadline
  )
    await setTimeout(10);
  assert.equal(
    existsSync(join(f.project.root, ".repo-standards/local/check-started")),
    true,
    output,
  );
  const concurrent = cli.run(
    ["resume", "--assessment", path, "--json"],
    f.project.root,
    f.env,
  );
  writeFileSync(
    join(f.project.root, ".repo-standards/local/check-released"),
    "released",
  );
  assert.equal(concurrent.status, 1, concurrent.stdout);
  assert.equal(
    (JSON.parse(concurrent.stdout) as ErrorReport).errors[0]!.code,
    "ACTIVE_RUN",
  );
  assert.equal(await finished, 0, output);
  assert.equal((JSON.parse(output) as Run).operations.length, 1);
});

test("uncertain check outcomes cannot be retried through contextual resume", async (t) => {
  // A process failure and a protocol failure; the other process outcomes take
  // the same path.
  for (const [code, script] of [
    ["NONZERO_EXIT", "process.exit(7);"],
    ["PROTOCOL_ERROR", "console.log('not a result');"],
  ])
    await t.test(code, async (st) => {
      const f = await fixture(
        st,
        `import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const path = '.repo-standards/local/check-attempts';
writeFileSync(path, String((existsSync(path) ? Number(readFileSync(path,'utf8')) : 0) + 1));
${script}`,
      );
      contextualWork(f.project.root);
      f.resume();
      const assessment = submission();
      const failed = f.resume(assessment);
      assert.ok(
        failed.report.reason.startsWith(code + ":"),
        failed.report.reason,
      );
      assert.match(failed.report.nextAction, /Explicit recovery is required/);
      for (const input of [undefined, assessment]) {
        const retry = f.resume<ErrorReport>(input);
        assert.equal(retry.result.status, 1, retry.result.stdout);
        assert.equal(
          retry.report.errors?.[0]!.code,
          "RESUME_UNAVAILABLE",
          retry.result.stdout,
        );
      }
      const status = JSON.parse(
        cli.run(["status", "--json"], f.project.root, f.env).stdout,
      ) as Status;
      assert.equal(status.active!.reason, failed.report.reason);
      assert.equal(status.active!.operations.length, 1);
      assert.equal(
        readFileSync(
          join(f.project.root, ".repo-standards/local/check-attempts"),
          "utf8",
        ),
        "1",
      );
      assert.equal(
        existsSync(join(f.project.root, ".repo-standards/state.json")),
        false,
      );
    });
});
