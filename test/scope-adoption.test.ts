import type {
  ErrorReport,
  FileState,
  Inspection,
  Run,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { TestContext } from "node:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { installCli, sha256 } from "./installed-cli.ts";
import {
  commit,
  git,
  inspectionArgs,
  manifest,
  operation,
  startArgs,
} from "./remote-fixture.ts";
import { filesystemFault, killAfterRename } from "./adoption-faults.ts";
import { adoptionFixture } from "./adoption-fixture.ts";
import {
  assertCompactRunRecord,
  assertCompactScopeEvidence,
  assertCompactWorkEvidence,
  assertNoMachineLocation,
  committedScopeEvidence,
  committedState,
  localRunReport,
} from "./committed-evidence.ts";

const cli = installCli();
after(() => cli.close());
const script = `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify({format:'repo-standards/result/v1',status:input.operation.phase==='fixes'?'unchanged':'passed',message:JSON.stringify(input.allowedTargets)}));`;
async function fixture(
  t: TestContext,
  base = "components/odd/nested",
  files = {},
  runScript = script,
) {
  const f = await adoptionFixture(
    t,
    cli,
    manifest({
      docs: {
        kind: "repository",
        guidance: "guidance.md",
        discovery: "discovery.md",
        fixes: [operation("prepare")],
        checks: [operation("verify")],
      },
      configuration: {
        kind: "file",
        target: "docs/config.json",
        exact: "config.json",
      },
    }),
    {
      files: {
        "guidance.md":
          "Preserve useful documentation and repair links around exact configuration.",
        "discovery.md":
          "Find maintained projects using manifests and ownership; exclude fixtures, generated output, and organizational directories.",
        "config.json": '{"shared":true}\n',
        "run.mjs": runScript,
      },
      project: {
        [`${base}/package.json`]: '{"name":"maintained"}',
        "fixtures/fake/package.json": "{}",
        ...files,
      },
    },
  );
  const { project, remote, env } = f;
  const run = <T = Run>(args: string[]) => f.json<T>(args);
  const request = run<Inspection>(inspectionArgs).report;
  const member = `${base}/package.json`;
  const excluded = "fixtures/fake/package.json";
  const proposal = {
    format: "repo-standards/scope/v2",
    declarations: [
      {
        id: "docs",
        coverage:
          "The manifest and ownership identify one maintained project. Fixture manifests do not establish membership.",
        candidates: [
          {
            path: `${base}/README.md`,
            decision: "include",
            reason: "Maintained project needs documentation.",
            evidence: [member],
          },
          {
            path: "fixtures/fake",
            decision: "exclude",
            reason: "A test fixture, not a maintained project.",
            evidence: [excluded],
          },
        ],
        unresolved: [] as string[],
      },
    ],
  };
  const scopeFile = join(remote.support.root, "scope.json");
  function inspect<T = Inspection>() {
    writeFileSync(scopeFile, JSON.stringify(proposal));
    return run<T>([...inspectionArgs, "--scope", scopeFile]);
  }
  return {
    project,
    remote,
    env,
    run,
    request,
    proposal,
    member,
    excluded,
    scopeFile,
    inspect,
    start<T = Run>(identity: string) {
      return run<T>(
        startArgs(identity, [...inspectionArgs, "--scope", scopeFile]),
      );
    },
  };
}

test("one confirmed discovery scope starts initial adoption, passes concrete files to fixes, and requires versioned coverage review after fixes and at assessment", async (t) => {
  const f = await fixture(t);
  const inspected = f.inspect();
  assert.equal(inspected.result.status, 0, inspected.result.stdout);
  assert.deepEqual(inspected.report.start.blockers, []);
  const start = f.start(inspected.report.identity);
  assert.equal(start.result.status, 1, start.result.stdout);
  const started = start.report;
  assert.equal(started.phase, "contextual", start.result.stdout);
  assert.equal(started.operations.length, 1);
  assert.deepEqual(
    JSON.parse(started.operations[0]!.result!.message) as unknown,
    { paths: ["components/odd/nested/README.md"], directories: [] },
  );
  assert.equal(
    readFileSync(join(f.project.root, "docs/config.json"), "utf8"),
    '{"shared":true}\n',
  );
  assert.equal(
    existsSync(join(f.project.root, "components/odd/nested/README.md")),
    false,
  );
  const request = started.workRequest;
  assert.equal(request!.format, "repo-standards/work-request/v3");
  assert.equal(request!.scope!.inspection, started.inspection);
  assert.equal(request!.scope!.afterFixes, request!.snapshot);
  const discovery = request!.declarations[0]!.discovery;
  assert.equal(
    discovery!.retained,
    `.repo-standards/inputs/source/${discovery!.source}`,
  );
  assert.equal(
    readFileSync(join(f.project.root, discovery!.retained), "utf8").startsWith(
      "Find maintained projects",
    ),
    true,
  );
  assert.equal(
    sha256(readFileSync(join(f.project.root, discovery!.retained))),
    discovery!.sha256,
  );
  const assessmentFile = join(f.remote.support.root, "assessment.json");
  const review = {
    status: "valid",
    explanation:
      "After fixes the maintained project is still the only applicable project.",
    evidence: ["Reviewed the project manifest and excluded fixture."],
    additionalPaths: [],
  };
  const assessment = {
    format: "repo-standards/assessment/v3",
    declarations: [
      {
        id: "docs",
        status: "satisfied",
        explanation: "Reviewed guidance.",
        evidence: ["No content changes in this protocol exercise."],
        scopeValidity: { afterFixes: review, current: review },
      },
    ],
  };
  writeFileSync(assessmentFile, JSON.stringify(assessment));
  const complete = f.run<Run>([
    "resume",
    "--assessment",
    assessmentFile,
    "--json",
  ]);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.equal(complete.report.outcome, "complete");
  assert.equal(complete.report.operations.length, 2);
});

function assessment() {
  const review = {
    status: "valid",
    explanation:
      "The maintained project and migration files remain fully covered; exclusions still apply.",
    evidence: [
      "Reviewed project manifest, existing documentation, destinations, and links.",
    ],
    additionalPaths: [] as string[],
  };
  return {
    format: "repo-standards/assessment/v3",
    declarations: [
      {
        id: "docs",
        status: "satisfied",
        explanation:
          "Deleted legacy source and created the confirmed destination with its useful setup and recovery instructions preserved; repaired navigation.",
        evidence: [
          "Destination preserves setup and recovery instructions, and navigation links to it.",
        ],
        scopeValidity: {
          afterFixes: structuredClone(review),
          current: structuredClone(review),
        },
      },
    ],
  };
}
function submit(f: Awaited<ReturnType<typeof fixture>>, value: unknown) {
  const path = join(f.remote.support.root, "assessment.json");
  writeFileSync(path, JSON.stringify(value));
  return f.run<Run>(["resume", "--assessment", path, "--json"]);
}
function setScopeTargets(
  f: Awaited<ReturnType<typeof fixture>>,
  targets: string[],
) {
  const entry = f.proposal.declarations[0]!;
  entry.candidates = [
    entry.candidates[1]!,
    ...targets.map((path) => {
      const observed = f.request.discovery!.evidence.some(
        (e: { kind: string; path: string }) =>
          e.kind === "file" && e.path === path,
      );
      return {
        path,
        decision: "include",
        reason:
          "Individually planned migration source, destination, introduction, project README, or link repair.",
        evidence: observed
          ? [path]
          : [
              f.member,
              f.excluded,
              ...f.request
                .discovery!.evidence.filter(
                  (e: { kind: string; path: string }) =>
                    e.kind === "directory" && e.path === dirname(path),
                )
                .map((e: { path: string }) => e.path),
            ],
      };
    }),
  ];
}

test("an unfamiliar layout completes a useful migration around exact configuration and retains historical scope in a fresh checkout", async (t) => {
  const base = "components/odd/nested";
  const useful =
    "# Operations\n\nSetup: node server.js\n\nRecovery: restore the last snapshot.\n";
  const f = await fixture(t, base, {
    "old/operations.md": useful,
    "INDEX.md": "[Operations](old/operations.md)\n",
    "docs/config.json": '{"shared":true}\n',
    "generated/project/README.md": "Generated; preserve.",
    "organization/overview.md": "Organizational; preserve.",
  });
  const targets = [
    `${base}/README.md`,
    "old/operations.md",
    "docs/projects/operations.md",
    "docs/README.md",
    "INDEX.md",
  ];
  setScopeTargets(f, targets);
  for (const [candidate, file, reason] of [
    [
      "generated/project",
      "generated/project/README.md",
      "Generated output is not a maintained project.",
    ],
    [
      "organization",
      "organization/overview.md",
      "An organizational grouping, not an independently maintained project.",
    ],
  ])
    f.proposal.declarations[0]!.candidates.push({
      path: candidate!,
      decision: "exclude",
      reason: reason!,
      evidence: [file!],
    });
  const inspected = f.inspect().report;
  const start = f.start(inspected.identity).report;
  assert.equal(start.phase, "contextual");
  // Paused for agent work, the journal and the local run report hold intervals
  // as identities and deltas only.
  assertCompactRunRecord(
    JSON.parse(
      readFileSync(
        join(f.project.root, ".git/repo-standards-run.lock"),
        "utf8",
      ),
    ) as Run,
    "journal",
  );
  assertCompactRunRecord(localRunReport(f.project.root), "local run report");
  const before = start.workRequest!.scope!.afterFixes;
  mkdirSync(join(f.project.root, "docs/projects"), { recursive: true });
  writeFileSync(join(f.project.root, "docs/projects/operations.md"), useful);
  rmSync(join(f.project.root, "old/operations.md"));
  writeFileSync(
    join(f.project.root, "docs/README.md"),
    "# Documentation\n\n[Operations](projects/operations.md)\n",
  );
  writeFileSync(
    join(f.project.root, "INDEX.md"),
    "[Operations](docs/projects/operations.md)\n",
  );
  writeFileSync(
    join(f.project.root, `${base}/README.md`),
    "# Maintained project\n\nRun node server.js. Recovery instructions are in the repository documentation.\n",
  );
  const refreshed = f.run<Run>(["resume", "--json"]).report.workRequest;
  assert.equal(refreshed!.scope!.afterFixes, before);
  assert.notEqual(refreshed!.snapshot, before);
  const completed = submit(f, assessment());
  assert.equal(completed.result.status, 0, completed.result.stdout);
  // The migration's deletion, creations and link repairs are derived from the run's work evidence.
  assert.deepEqual(
    completed.report.assessments[0]!.declarations[0]!.changedPaths,
    [...targets].sort(),
  );
  assert.deepEqual(completed.report.assessments[0]!.scope, {
    inspection: refreshed!.scope!.inspection,
    afterFixes: refreshed!.scope!.afterFixes,
  });
  assert.equal(
    readFileSync(join(f.project.root, "docs/projects/operations.md"), "utf8"),
    useful,
  );
  assert.equal(existsSync(join(f.project.root, "old/operations.md")), false);
  assert.equal(
    readFileSync(join(f.project.root, "docs/config.json"), "utf8"),
    '{"shared":true}\n',
  );
  assert.equal(
    readFileSync(join(f.project.root, "generated/project/README.md"), "utf8"),
    "Generated; preserve.",
  );
  // Completion carries the local record's intervals into committed state unchanged.
  const local = localRunReport(f.project.root);
  assertCompactRunRecord(local, "local run report");
  assert.deepEqual(
    [...new Set(local.observations.map((interval) => interval.phase))].sort(),
    ["agent", "checks", "fixes"],
  );
  assertCompactWorkEvidence(committedState(f.project.root));
  assert.deepEqual(
    committedState(f.project.root).observations,
    local.observations,
  );
  // Each system skill's link is installation's alone: agent work beside it
  // neither changes nor claims it.
  const links = ["adopt-standards", "standards-updates"].map(
    (name) =>
      [`.claude/skills/${name}`, `../../.agents/skills/${name}`] as const,
  );
  assert.deepEqual(
    committedState(f.project.root).changeSet!.filter(({ path }) =>
      path.startsWith(".claude/"),
    ),
    links.map(([path]) => ({ path, phases: ["installation"] })),
  );
  const status = f.run<Status>(["status", "--json"]).report;
  // The committed interval keeps each changed path's before and after state.
  const migration = status.observations!.find(
    (entry) =>
      entry.phase === "agent" &&
      Object.hasOwn(entry.changes!, "old/operations.md"),
  );
  assert.equal(
    (migration!.changes!["old/operations.md"]!.before as FileState).type,
    "file",
  );
  assert.equal(
    (migration!.changes!["old/operations.md"]!.after as FileState).type,
    "missing",
  );
  assert.equal(
    (migration!.changes!["docs/projects/operations.md"]!.before as FileState)
      .type,
    "missing",
  );
  assert.equal(
    (migration!.changes!["docs/projects/operations.md"]!.after as FileState)
      .type,
    "file",
  );
  assert.match(
    status.assessments![0]!.declarations[0]!.explanation,
    /preserved/,
  );
  commit(f.project.root);
  const checkout = join(f.remote.support.root, "checkout");
  git(f.project.root, "clone", "--quiet", f.project.root, checkout);
  writeFileSync(join(f.remote.support.root, "responses.json"), "{}");
  const retained = f.run<Inspection>([
    "inspect",
    "--project",
    checkout,
    "--json",
  ]);
  assert.equal(retained.result.status, 0, retained.result.stdout);
  assert.equal(retained.report.retained, true);
  assert.equal(retained.report.historicalScope!.evidence, "historical");
  assert.equal(retained.report.historicalScope!.inspection, inspected.identity);
  assert.deepEqual(
    retained.report.historicalScope!.resolved,
    inspected.resolved,
  );
  assert.deepEqual(
    retained.report.historicalScope!.discovery!.proposal,
    inspected.discovery!.proposal,
  );
  assert.deepEqual(
    retained.report.historicalScope!.discovery!.absence,
    inspected.discovery!.absence,
  );
  // The named observation is rebuilt on read from the stored delta.
  assert.deepEqual(
    retained.report.historicalScope!.discovery!.namedObservation,
    inspected.discovery!.namedObservation,
  );
  assert.deepEqual(
    retained.report.historicalScope!.sourceResolved,
    inspected.sourceResolved,
  );
  assert.equal(retained.report.start.eligible, false);
  // A clone carries the links, which the retained inspection matches.
  for (const [path, text] of links)
    assert.equal(readlinkSync(join(checkout, path)), text);
  assert.deepEqual(
    retained.report.systemSkills.map(
      ({ link }: { link: { action: string } }) => link.action,
    ),
    ["match", "match"],
  );
  // The committed run keeps its named observation as the delta of the
  // confirmed targets and the boundaries naming them added.
  const scope = committedScopeEvidence(checkout);
  assertCompactScopeEvidence(scope);
  const stored = scope.discovery!;
  assert.deepEqual(
    Object.keys(stored.named!.targets!).sort(),
    [...targets].sort(),
  );
  assert.deepEqual(stored.named!.boundaries!["docs/projects"], {
    type: "missing",
  });
  assert.equal(
    Object.hasOwn(stored.observation!.boundaries!, "docs/projects"),
    false,
  );
});

test("missing, invalid, unresolved, stale and dirty discovery starts preserve the project before mutation", async (t) => {
  const f = await fixture(t);
  const inspection = f.inspect().report;
  const reject = (report: { errors: { code: string }[] }, code: string) => {
    assert.equal(report.errors[0]!.code, code);
    assert.equal(existsSync(join(f.project.root, ".repo-standards")), false);
    assert.equal(existsSync(join(f.project.root, "docs/config.json")), false);
    assert.equal(f.run<Status>(["status", "--json"]).report.active, null);
  };
  reject(
    f.run<ErrorReport>(startArgs(inspection.identity)).report,
    "STALE_INSPECTION",
  );
  writeFileSync(f.scopeFile, "{}");
  reject(f.start<ErrorReport>(inspection.identity).report, "INVALID_SCOPE");
  f.proposal.declarations[0]!.unresolved = ["Is this project maintained?"];
  const unresolved = f.inspect().report;
  reject(f.start<ErrorReport>(unresolved.identity).report, "START_BLOCKED");
  f.proposal.declarations[0]!.unresolved = [];
  const coverage = f.proposal.declarations[0]!.coverage;
  f.proposal.declarations[0]!.coverage += " Changed rationale.";
  f.inspect();
  reject(f.start<ErrorReport>(inspection.identity).report, "STALE_INSPECTION");
  f.proposal.declarations[0]!.coverage = coverage;
  assert.equal(f.inspect().report.identity, inspection.identity);
  // A change that leaves the confirmed proposal unfit for the project is stale
  // too, although the same proposal fails validation at a new inspection.
  rmSync(join(f.project.root, f.member));
  const unfit = f.start<ErrorReport>(inspection.identity).report;
  reject(unfit, "STALE_INSPECTION");
  assert.match(unfit.errors[0]!.message, /fresh discovery evidence/);
  const unfitAtInspection = f.inspect<ErrorReport>().report.errors[0];
  assert.equal(unfitAtInspection!.code, "INVALID_SCOPE");
  assert.match(unfitAtInspection!.message, /discovery observation/);
  git(f.project.root, "checkout", "--", f.member);
  // So is a confirmed target that is now a directory or a symbolic link.
  const target = join(f.project.root, dirname(f.member), "README.md");
  for (const replace of [
    () => mkdirSync(target),
    () => symlinkSync("package.json", target),
  ]) {
    replace();
    const replaced = f.start<ErrorReport>(inspection.identity).report;
    reject(replaced, "STALE_INSPECTION");
    assert.match(replaced.errors[0]!.message, /fresh discovery evidence/);
    assert.equal(
      f.inspect<ErrorReport>().report.errors[0]!.code,
      "UNSAFE_TARGET",
    );
    rmSync(target, { recursive: true });
  }
  // A proposal confirmed against an earlier observation is stale once the
  // project changes; start rejects it and asks for a fresh review.
  writeFileSync(
    join(f.project.root, ".git/info/exclude"),
    "# new observation input\n",
  );
  const stale = f.start<ErrorReport>(inspection.identity).report;
  reject(stale, "STALE_INSPECTION");
  assert.match(
    stale.errors[0]!.message,
    /scope proposal.*fresh discovery evidence/,
  );
  writeFileSync(join(f.project.root, "unrelated.txt"), "Uncommitted");
  const dirty = f.inspect().report;
  reject(f.start<ErrorReport>(dirty.identity).report, "START_BLOCKED");
  assert.equal(
    readFileSync(join(f.project.root, "unrelated.txt"), "utf8"),
    "Uncommitted",
  );
});

test("scope-validity omissions, copied identities and additional file needs block checks without new authority", async (t) => {
  const f = await fixture(t);
  const start = f.start(f.inspect().report.identity).report;
  const valid = assessment();
  const retiredFormat = { ...valid, format: "repo-standards/assessment/v1" };
  assert.match(submit(f, retiredFormat).report.reason, /ASSESSMENT_FORMAT/);
  const noReview = JSON.parse(JSON.stringify(valid)) as typeof valid;
  delete (
    noReview.declarations[0]! as Partial<(typeof valid.declarations)[number]>
  ).scopeValidity;
  assert.match(submit(f, noReview).report.reason, /ASSESSMENT_FORMAT/);
  const { inspection, afterFixes } = start.workRequest!.scope!;
  assert.match(
    submit(f, { ...valid, scope: { inspection, afterFixes } }).report.reason,
    /ASSESSMENT_FORMAT/,
  );
  for (const phase of ["afterFixes", "current"] as const) {
    const incomplete = structuredClone(valid);
    incomplete.declarations[0]!.scopeValidity[phase].status = "blocked";
    incomplete.declarations[0]!.scopeValidity[phase].additionalPaths = [
      "new-destination.md",
    ];
    const blocked = submit(f, incomplete).report;
    assert.match(blocked.reason, /SCOPE_INCOMPLETE/);
    assert.match(blocked.nextAction, /Additional paths grant no authority/);
    const { run, selection, snapshot } = start.workRequest!;
    assert.deepEqual(blocked.assessments, [
      {
        format: incomplete.format,
        scope: { inspection, afterFixes },
        run,
        selection,
        snapshot,
        declarations: incomplete.declarations.map(
          ({ evidence, scopeValidity, ...judgment }) => ({
            ...judgment,
            changedPaths: [],
            evidence,
            scopeValidity,
          }),
        ),
      },
    ]);
    assert.equal(blocked.operations.length, 1);
    assert.equal(existsSync(join(f.project.root, "new-destination.md")), false);
  }
  const invalidStatus = JSON.parse(JSON.stringify(valid)) as typeof valid;
  (
    invalidStatus.declarations[0]!.scopeValidity.current as { status: unknown }
  ).status = ["valid"];
  assert.match(submit(f, invalidStatus).report.reason, /ASSESSMENT_FORMAT/);
  const falseValid = structuredClone(valid);
  falseValid.declarations[0]!.scopeValidity.current.additionalPaths = [
    "new-destination.md",
  ];
  assert.match(submit(f, falseValid).report.reason, /ASSESSMENT_FORMAT/);
  const complete = submit(f, valid);
  assert.equal(complete.result.status, 0, complete.result.stdout);
});

test("a blocked scope review is corrected by abandoning the run and adopting again with a new confirmed scope", async (t) => {
  const f = await fixture(t);
  f.start(f.inspect().report.identity);
  const needsMore = assessment();
  needsMore.declarations[0]!.scopeValidity.current.status = "blocked";
  needsMore.declarations[0]!.scopeValidity.current.additionalPaths = [
    "new-destination.md",
  ];
  const blocked = submit(f, needsMore);
  assert.equal(blocked.result.status, 1, blocked.result.stdout);
  assert.equal(blocked.report.outcome, "incomplete");
  assert.match(blocked.report.reason, /SCOPE_INCOMPLETE/);
  assert.match(
    blocked.report.nextAction,
    /Preserve the work, abandon the run, commit or discard its changes, and adopt again with a new confirmed scope/,
  );

  const abandoned = f.run<Run>(["abandon", "--json"]);
  assert.equal(abandoned.report.abandoned, true, abandoned.result.stdout);
  git(f.project.root, "checkout", "--", ".");
  git(f.project.root, "clean", "-fdxq");
  setScopeTargets(f, ["components/odd/nested/README.md", "new-destination.md"]);
  const corrected = f.inspect();
  assert.deepEqual(
    corrected.report.start.blockers,
    [],
    corrected.result.stdout,
  );
  const restarted = f.start(corrected.report.identity).report;
  assert.equal(restarted.phase, "contextual");
  assert.deepEqual(
    restarted.workRequest!.declarations[0]!.allowedTargets.paths,
    ["components/odd/nested/README.md", "new-destination.md"],
  );
});

test("discovered contextual changes reject a stale assessment and complete with derived changed paths", async (t) => {
  const f = await fixture(t, "apps/widget", { "stable.md": "Stable" });
  setScopeTargets(f, ["apps/widget/README.md", "stable.md"]);
  const start = f.start(f.inspect().report.identity).report;
  const target = f.proposal.declarations[0]!.candidates.find(
    (candidate) => candidate.decision === "include",
  )!.path;
  writeFileSync(
    join(f.project.root, target),
    "# Project\n\nRun node server.js.\n",
  );
  assert.match(submit(f, assessment()).report.reason, /STALE_ASSESSMENT/);
  assert.equal(
    start.workRequest!.declarations[0]!.allowedTargets.paths.includes(
      "stable.md",
    ),
    true,
  );
  f.run<Run>(["resume", "--json"]);
  const complete = submit(f, assessment());
  assert.equal(complete.result.status, 0, complete.result.stdout);
  // The unchanged confirmed target is not attributed.
  assert.deepEqual(
    complete.report.assessments[0]!.declarations[0]!.changedPaths,
    [target],
  );
});

test("agent work may remove a directory only when its confirmed scope covers every file it held", async (t) => {
  for (const removal of ["confirmed", "outside scope"])
    await t.test(removal, async (st) => {
      const f = await fixture(st, "apps/widget", {
        "legacy/a.md": "A",
        "legacy/b.md": "B",
      });
      setScopeTargets(f, [
        "apps/widget/README.md",
        "legacy/a.md",
        "legacy/b.md",
      ]);
      f.start(f.inspect().report.identity);
      if (removal === "outside scope") {
        rmSync(join(f.project.root, "fixtures"), { recursive: true });
        f.run<Run>(["resume", "--json"]);
        assert.match(
          submit(f, assessment()).report.reason,
          /ASSESSMENT_SCOPE.*fixtures\/fake\/package.json/,
        );
        return;
      }
      // Removing the directory's last file removes the directory too. The run
      // binds the index, so the removal is unstaged again.
      git(f.project.root, "rm", "--quiet", "legacy/a.md", "legacy/b.md");
      git(f.project.root, "reset", "--quiet");
      assert.equal(existsSync(join(f.project.root, "legacy")), false);
      f.run<Run>(["resume", "--json"]);
      const complete = submit(f, assessment());
      assert.equal(complete.result.status, 0, complete.result.stdout);
      const status = f.run<Status>(["status", "--json"]).report;
      const interval = status.observations!.find(
        ({ changes }) => changes && "legacy/a.md" in changes,
      )!;
      assert.deepEqual(Object.keys(interval.boundaryChanges!), ["legacy"]);
      assert.deepEqual(interval.violations, []);
      assert.deepEqual(
        status.changeSet!.filter(({ path }) => path.startsWith("legacy")),
        ["legacy/a.md", "legacy/b.md"].map((path) => ({
          path,
          phases: ["agent"],
        })),
      );
    });
});

test("agent work may remove a directory it emptied in an earlier interval", async (t) => {
  const f = await fixture(t, "apps/widget", { "legacy/only.md": "# Widget" });
  setScopeTargets(f, ["apps/widget/README.md", "legacy/only.md"]);
  f.start(f.inspect().report.identity);
  renameSync(
    join(f.project.root, "legacy/only.md"),
    join(f.project.root, "apps/widget/README.md"),
  );
  f.run<Run>(["resume", "--json"]);
  rmSync(join(f.project.root, "legacy"), { recursive: true });
  f.run<Run>(["resume", "--json"]);
  const complete = submit(f, assessment());
  assert.equal(complete.result.status, 0, complete.result.stdout);
  const removal = f
    .run<Status>(["status", "--json"])
    .report.observations!.find(
      (interval) =>
        interval.boundaryChanges && "legacy" in interval.boundaryChanges,
    )!;
  assert.equal(removal.phase, "agent");
  assert.deepEqual(removal.changes, {});
  assert.deepEqual(removal.violations, []);
});

test("unconfirmed migration destinations and exact corruption preserve incomplete work and installed expectations", async (t) => {
  for (const target of ["invented.md", "docs/config.json"])
    await t.test(target, async (t) => {
      const f = await fixture(t);
      const start = f.start(f.inspect().report.identity).report;
      const installedLock = readFileSync(
        join(f.project.root, ".repo-standards/lock.json"),
        "utf8",
      );
      writeFileSync(join(f.project.root, target), "Preserve this failed work");
      const request = f.run<Run>(["resume", "--json"]).report;
      const rejected =
        target === "invented.md" ? submit(f, assessment()).report : request;
      assert.match(
        rejected.reason,
        target === "invented.md" ? /ASSESSMENT_SCOPE/ : /FINAL_INTEGRITY/,
      );
      assert.equal(
        readFileSync(join(f.project.root, target), "utf8"),
        "Preserve this failed work",
      );
      assert.equal(
        readFileSync(join(f.project.root, ".repo-standards/lock.json"), "utf8"),
        installedLock,
      );
      assert.equal(
        existsSync(join(f.project.root, ".repo-standards/state.json")),
        false,
      );
      assert.equal(rejected.operations.length, start.operations.length);
    });
});

test("discovered fixes and checks enforce confirmed files through the observed-scope contract", async (t) => {
  for (const phase of ["fixes", "checks"])
    await t.test(phase, async (t) => {
      const f = await fixture(
        t,
        "apps/widget",
        {},
        script.replace(
          "console.log(JSON.stringify",
          `if (input.operation.phase === '${phase}') { const { writeFileSync } = await import('node:fs'); writeFileSync('outside.md', 'Operation violation'); }\nconsole.log(JSON.stringify`,
        ),
      );
      const start = f.start(f.inspect().report.identity).report;
      const failed = phase === "fixes" ? start : submit(f, assessment()).report;
      assert.match(
        failed.reason,
        phase === "fixes"
          ? /OPERATION_SCOPE.*outside.md/
          : /CHECK_MUTATION.*outside.md/,
      );
      assert.equal(
        readFileSync(join(f.project.root, "outside.md"), "utf8"),
        "Operation violation",
      );
      assert.equal(failed.outcome, "incomplete");
      assert.equal(
        existsSync(join(f.project.root, ".repo-standards/state.json")),
        false,
      );
    });
});

test("discovered scope survives retry with separate earlier agent evidence and renewed post-fix coverage identity", async (t) => {
  const f = await fixture(
    t,
    "apps/widget",
    {},
    script.replace(
      "console.log(JSON.stringify",
      `if (input.operation.phase === 'fixes') { const { writeFileSync } = await import('node:fs'); writeFileSync(input.allowedTargets.paths[0], '# Prepared by fix'); }\nconsole.log(JSON.stringify`,
    ),
  );
  const started = f.start(f.inspect().report.identity).report;
  assert.equal(started.phase, "contextual");
  writeFileSync(
    join(f.project.root, "apps/widget/README.md"),
    "# Agent documented the maintained project",
  );
  const oldRequest = f.run<Run>(["resume", "--json"]).report.workRequest;
  const retried = f.run<Run>(["resume", "--retry", "--json"]).report;
  assert.equal(retried.phase, "contextual");
  assert.equal(
    retried.workRequest!.scope!.inspection,
    oldRequest!.scope!.inspection,
  );
  assert.notEqual(
    retried.workRequest!.scope!.afterFixes,
    oldRequest!.scope!.afterFixes,
  );
  assert.equal(
    readFileSync(join(f.project.root, "apps/widget/README.md"), "utf8"),
    "# Prepared by fix",
  );
  const complete = submit(f, assessment());
  assert.equal(complete.result.status, 0, complete.result.stdout);
  // The earlier agent change replaced by the replayed fix stays attributed, under the renewed post-fix identity.
  assert.deepEqual(
    complete.report.assessments[0]!.declarations[0]!.changedPaths,
    ["apps/widget/README.md"],
  );
  assert.equal(
    complete.report.assessments[0]!.scope!.afterFixes,
    retried.workRequest!.scope!.afterFixes,
  );
  const status = f.run<Status>(["status", "--json"]).report;
  assert.deepEqual(
    status
      .observations!.filter((entry) =>
        Object.hasOwn(entry.changes!, "apps/widget/README.md"),
      )
      .map((entry: { phase: string }) => entry.phase),
    ["fixes", "agent", "fixes"],
  );
  assert.equal(status.retryHistory!.length, 1);
});

test("interrupted pre-install discovery can retry its relative proposal from another working directory", async (t) => {
  const f = await fixture(t);
  const inspected = f.inspect().report;
  const env = filesystemFault(
    f.remote.support.root,
    f.env,
    "runtime",
    killAfterRename("repo-standards-run.lock"),
  );
  const interrupted = cli.run(
    startArgs(inspected.identity, [
      ...inspectionArgs,
      "--scope",
      relative(f.project.root, f.scopeFile),
    ]),
    f.project.root,
    env,
  );
  assert.equal(interrupted.signal, "SIGKILL");
  assert.equal(existsSync(join(f.project.root, ".repo-standards")), false);
  const elsewhere = join(f.remote.support.root, "runner");
  mkdirSync(elsewhere);
  const recovered = cli.run(
    ["resume", "--retry", "--project", f.project.root, "--json"],
    elsewhere,
    f.env,
  );
  const report = JSON.parse(recovered.stdout) as Run;
  assert.equal(report.phase, "contextual", recovered.stdout);
  assert.equal(report.workRequest!.scope!.inspection, inspected.identity);
  assert.deepEqual(
    report.workRequest!.scope!.proposal,
    inspected.discovery!.proposal,
  );
});

test("an inspection made in another clone of the same content, under another umask, confirms a start in this checkout", async (t) => {
  const f = await fixture(t);
  // Directory modes are not bound, so a clone under a stricter umask is the
  // same project.
  const directory = dirname(f.member);
  chmodSync(join(f.project.root, directory), 0o755);
  const inspected = f.inspect().report;
  const clone = join(f.remote.support.root, "clone");
  const cloned = spawnSync(
    "/bin/sh",
    [
      "-c",
      'umask 077; exec git clone --quiet "$1" "$2"',
      "clone",
      f.project.root,
      clone,
    ],
    { encoding: "utf8" },
  );
  assert.equal(cloned.status, 0, cloned.stderr);
  assert.notEqual(
    lstatSync(join(f.project.root, directory)).mode & 0o777,
    lstatSync(join(clone, directory)).mode & 0o777,
  );
  const run = <T = Run>(args: string[]) => {
    const result = cli.run(args, clone, f.env);
    return { result, report: JSON.parse(result.stdout) as T };
  };
  // Neither the request nor the inspection binds where the project is checked out.
  assert.equal(
    run<Inspection>(inspectionArgs).report.discovery!.identity,
    f.request.discovery!.identity,
  );
  const cloneInspection = run<Inspection>([
    ...inspectionArgs,
    "--scope",
    f.scopeFile,
  ]).report;
  assert.equal(cloneInspection.identity, inspected.identity);
  assert.deepEqual(cloneInspection.start.blockers, []);
  const started = run<Run>(
    startArgs(inspected.identity, [...inspectionArgs, "--scope", f.scopeFile]),
  );
  assert.equal(
    started.result.status,
    1,
    started.result.stdout + started.result.stderr,
  );
  assert.equal(started.report.phase, "contextual", started.result.stdout);
  assert.equal(started.report.inspection, inspected.identity);
  // The run records where it happened, for provenance only.
  assert.equal(started.report.root, realpathSync(clone));
  assert.equal(existsSync(join(f.project.root, ".repo-standards")), false);
});

test("explained empty discovery scope retains its operations, and committed evidence binds ignore inputs by role and content and records no absolute path", async (t) => {
  const f = await fixture(t, "fixtures/example", {
    "fixtures/.gitignore": "build/\n",
  });
  const globalIgnore = join(f.remote.support.root, "global-ignore");
  writeFileSync(globalIgnore, "*.log\n");
  git(f.project.root, "config", "core.excludesFile", globalIgnore);
  const entry = f.proposal.declarations[0]!;
  entry.candidates = [
    {
      path: "fixtures/example",
      decision: "exclude",
      reason: "Fixture project; there are no maintained projects here.",
      evidence: [f.member, f.excluded],
    },
    entry.candidates[1]!,
  ];
  entry.coverage =
    "This repository contains test fixtures only; no maintained project requires documentation.";
  // Explained empty scope still runs fixes, coverage assessment and checks.
  const start = f.start(f.inspect().report.identity).report;
  assert.equal(start.phase, "contextual", JSON.stringify(start));
  assert.equal(start.workRequest!.declarations.length, 1);
  assert.deepEqual(
    JSON.parse(start.operations[0]!.result!.message) as unknown,
    { paths: [], directories: [] },
  );
  const completed = submit(f, assessment());
  assert.equal(completed.result.status, 0, completed.result.stdout);
  assert.deepEqual(
    completed.report.operations.map(
      (op: { operation: { phase: string } }) => op.operation.phase,
    ),
    ["fixes", "checks"],
  );
  assert.deepEqual(
    JSON.parse(completed.report.operations[1]!.result!.message) as unknown,
    { paths: [], directories: [] },
  );
  assert.equal(completed.report.root, f.project.root);
  assert.equal(localRunReport(f.project.root).root, f.project.root);
  const ignores = (
    committedScopeEvidence(f.project.root).discovery!.observation as {
      ignores: Record<string, unknown>;
    }
  ).ignores;
  assert.deepEqual(ignores.global, {
    type: "file",
    sha256: sha256("*.log\n"),
    executable: false,
  });
  assert.deepEqual(ignores["fixtures/.gitignore"], {
    type: "file",
    sha256: sha256("build/\n"),
    executable: false,
  });
  assert.equal((ignores.info as { type: string }).type, "file");
  assert.deepEqual(ignores[".gitignore"], { type: "missing" });
  assertNoMachineLocation(
    f.project.root,
    [
      f.project.root,
      f.remote.support.root,
      globalIgnore,
      realpathSync(tmpdir()),
    ],
    [process.execPath],
  );
});
