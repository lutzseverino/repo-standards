import type { ErrorReport, Status } from "./json-reports.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { installCli, snapshot } from "./installed-cli.ts";
import { commit, git, operation } from "./remote-fixture.ts";
import { localRunReport } from "./committed-evidence.ts";
import {
  adoptFirst,
  fixture,
  judgments,
  question,
  reason,
  reuseFixture,
  source,
  type ReuseFixture,
} from "./adopt-fixture.ts";
import { terminalSession } from "./terminal.ts";

// A headless update asks nobody: it updates an established adoption with the
// recorded answers an update reuses, defers every remote setup, and either
// completes in one invocation or stops with the open questions an answers
// file finishes.

const cli = installCli();
after(() => cli.close());

const headlessReason =
  "Deferred by a headless update, which never writes to the hosting platform; the next local adopt applies it once its probe is ready.";

function status(f: { pinned: string; root: string; env: NodeJS.ProcessEnv }) {
  const result = spawnSync(f.pinned, ["status", "--json"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  });
  return JSON.parse(result.stdout) as Status & {
    readyToCommit: boolean;
    active: { outcome: string; phase: string } | null;
  };
}

const ids = (report: { reused: { id: string }[] }) =>
  report.reused.map((answer) => answer.id);

// A headless update by the project's pinned runtime.
function headless(f: ReuseFixture, args: string[] = []) {
  const updated = f.adopt(["--headless", ...args], true);
  assert.equal(updated.report.headless, true, updated.result.stdout);
  return updated;
}

// A headless update that stops before it writes anything: it exits 1 with
// the open questions and leaves the project, HEAD and index unchanged.
function stopsBeforeWriting(f: ReuseFixture, args: string[] = []) {
  const before = snapshot(f.root);
  const { result, report } = headless(f, args);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(report.run, undefined);
  assert.deepEqual(snapshot(f.root), before);
  return report;
}

test("a headless update with every answer reused completes in one invocation, defers remote setup ready or not, and a later local adopt applies it", async (t) => {
  const { f, outside, publish } = await reuseFixture(t, cli);
  adoptFirst(f);
  publish("v1.1.0", {});
  f.releases("v1.0.0", "v1.1.0");
  const head = git(f.root, "rev-parse", "HEAD");

  // Not ready, the remote setup stays deferred with the probe's reason, and
  // every recorded answer is reused.
  const first = headless(f);
  assert.equal(first.result.status, 0, first.result.stdout);
  assert.equal(first.report.outcome, "complete");
  assert.equal(first.report.selection.version, "v1.1.0");
  assert.equal(first.report.selection.profile, "work");
  assert.deepEqual(ids(first.report), [
    "scope:project-docs",
    "remote-setup",
    "assessment:project-docs",
    "assessment:project-readme",
  ]);
  const notReady = {
    declaration: "agent-guidance",
    id: "labels",
    reason: `${headlessReason} Its probe reports it not ready: ${reason}`,
  };
  assert.deepEqual(first.report.deferred, [notReady]);
  // The changes are uncommitted and unstaged, and ready to commit.
  assert.equal(git(f.root, "rev-parse", "HEAD"), head);
  assert.equal(git(f.root, "diff", "--cached", "--name-only"), "");
  const completed = status(f);
  assert.equal(completed.readyToCommit, true);
  assert.deepEqual(completed.deferred, [notReady]);
  commit(f.root);

  // Ready, the remote setup is deferred all the same: the run executes
  // neither its fix nor its prerequisite probe.
  writeFileSync(join(outside, "ready"), "");
  const ready = headless(f);
  assert.equal(ready.result.status, 0, ready.result.stdout);
  assert.equal(ready.report.outcome, "complete");
  const deferred = {
    declaration: "agent-guidance",
    id: "labels",
    reason: headlessReason,
  };
  assert.deepEqual(ready.report.deferred, [deferred]);
  assert.equal(existsSync(join(outside, "applied.log")), false);
  const run = localRunReport(f.root) as unknown as {
    prerequisites: { phase: string; operation: string }[];
    operations: { operation: { id: string } }[];
  };
  assert.deepEqual(
    run.prerequisites.map(({ phase, operation }) => [phase, operation]),
    [["checks", "heading"]],
  );
  assert.ok(run.operations.every(({ operation }) => operation.id !== "labels"));
  assert.deepEqual(status(f).deferred, [deferred]);
  const summary = spawnSync(f.pinned, ["status", "--summary"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  }).stdout;
  assert.ok(summary.includes(headlessReason), summary);
  // The Markdown report marks itself headless and lists the deferral.
  commit(f.root);
  const markdown = spawnSync(f.pinned, ["adopt", "--headless"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  });
  assert.equal(markdown.status, 0, markdown.stdout + markdown.stderr);
  assert.match(markdown.stdout, /This headless update asked nobody/);
  assert.match(
    markdown.stdout,
    /## Deferred fixes\n\n\| Declaration \| Fix \| Reason \|/,
  );
  commit(f.root);

  // A later local adopt applies the ready remote setup.
  const local = f.adopt([], true);
  assert.equal(local.report.outcome, "complete", local.result.stdout);
  assert.equal(local.report.headless, undefined);
  assert.equal(readFileSync(join(outside, "applied.log"), "utf8"), "applied\n");
  assert.deepEqual(status(f).deferred, []);
});

test("a confirmation, an unreused scope proposal, a missing profile and a start blocker each stop a headless update before it writes", async (t) => {
  const { f, publish } = await reuseFixture(t, cli);
  adoptFirst(f);
  const deferred = [
    {
      declaration: "agent-guidance",
      id: "labels",
      reason: `${headlessReason} Its probe reports it not ready: ${reason}`,
    },
  ];

  // A confirmation-required change: headless never confirms one.
  const agents = readFileSync(join(f.root, "AGENTS.md"), "utf8");
  writeFileSync(join(f.root, "AGENTS.md"), "Edited agent guidance\n");
  commit(f.root);
  const confirmation = stopsBeforeWriting(f);
  assert.equal(confirmation.outcome, "answers-required");
  assert.deepEqual(confirmation.missing, ["confirmation", "inspection"]);
  assert.equal(question(confirmation, "confirmation").answer, null);
  assert.deepEqual(confirmation.deferred, deferred);
  writeFileSync(join(f.root, "AGENTS.md"), agents);
  commit(f.root);

  // A recorded scope answer proposed for review, prefilled in the report.
  publish("v1.1.0", { "discovery.md": "Projects have a package manifest.\n" });
  const scope = stopsBeforeWriting(f, ["--standards-version", "v1.1.0"]);
  assert.equal(scope.outcome, "answers-required");
  assert.deepEqual(scope.missing, ["scope:project-docs"]);
  assert.match(
    question(scope, "scope:project-docs").context,
    /proposed here for review/,
  );
  assert.notEqual(question(scope, "scope:project-docs").answer, null);
  assert.equal(question(scope, "remote-setup").answer, "defer");

  // The source no longer offers the recorded profile.
  publish("v1.2.0", {}, {}, { personal: {} });
  const profile = stopsBeforeWriting(f, ["--standards-version", "v1.2.0"]);
  assert.equal(profile.outcome, "answers-required");
  assert.deepEqual(profile.missing, ["profile"]);
  assert.equal(profile.selection.profile, null);
  assert.match(
    question(profile, "profile").context,
    /no longer offers the profile the project adopts, work/,
  );

  // A start blocker: an uncommitted change.
  writeFileSync(join(f.root, "README.md"), "# Project\n\nPending work\n");
  const blocked = stopsBeforeWriting(f);
  assert.equal(blocked.outcome, "blocked");
  assert.ok(
    blocked.blockers.some((blocker) => blocker.code === "DIRTY_PROJECT"),
    JSON.stringify(blocked.blockers),
  );
});

test("contextual work whose assessment is not reused stops a headless update with its run active, and adopt --answers finishes it", async (t) => {
  const { f, publish } = await reuseFixture(t, cli);
  adoptFirst(f);
  publish("v1.1.0", {
    "rules/readme.md": "README.md starts with a heading naming the project.\n",
  });
  f.releases("v1.0.0", "v1.1.0");
  const stopped = headless(f);
  assert.equal(stopped.result.status, 1, stopped.result.stdout);
  const report = stopped.report;
  assert.equal(report.outcome, "contextual");
  assert.ok(report.run);
  assert.deepEqual(report.missing, ["assessment:project-readme"]);
  assert.deepEqual(ids(report), [
    "scope:project-docs",
    "remote-setup",
    "assessment:project-docs",
  ]);
  assert.deepEqual(
    report.contextual?.map((entry) => entry.id),
    ["project-docs", "project-readme"],
  );
  assert.equal(status(f).active?.phase, "contextual");
  const reasons = report.deferred?.map((entry) => entry.reason) ?? [];
  assert.equal(reasons.length, 1);
  assert.ok(reasons[0]!.startsWith(headlessReason));

  // An ordinary adopt with the assessment finishes the same run, which keeps
  // the remote setup deferred.
  const finished = f.adopt(
    f.answer(report.answers, {
      "assessment:project-readme": judgments["assessment:project-readme"],
    }),
    true,
  );
  assert.equal(finished.report.outcome, "complete", finished.result.stdout);
  assert.equal(finished.report.run?.id, report.run.id);
  const completed = status(f);
  assert.equal(completed.readyToCommit, true);
  assert.deepEqual(
    completed.deferred?.map((entry) => entry.reason),
    reasons,
  );
});

test("a fix that returns confirmation-required stops a headless update with its fix question open", async (t) => {
  const f = await fixture(
    t,
    cli,
    {
      instructions: {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        fixes: [operation("setting", { script: "setting.mjs" })],
      },
    },
    {
      files: {
        "content/AGENTS.md": "Standard agent guidance\n",
        "setting.mjs": `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: input.overwriteAllowed ? 'changed' : 'confirmation-required', message: 'Overwrites the label color red with blue.' }));
`,
      },
      project: { "README.md": "Project notes\n" },
    },
  );
  // The first adoption declines the overwrite.
  const template = f.adopt([source]).report;
  const asked = f.adopt(f.answer(template.answers)).report;
  assert.deepEqual(asked.missing, ["fix:instructions/setting"]);
  const declined = f.adopt(
    f.answer(asked.answers, { "fix:instructions/setting": "defer" }),
    true,
  );
  assert.equal(declined.report.outcome, "complete", declined.result.stdout);
  commit(f.root);

  const stopped = headless(f);
  assert.equal(stopped.result.status, 1, stopped.result.stdout);
  assert.equal(stopped.report.outcome, "answers-required");
  assert.ok(stopped.report.run);
  assert.deepEqual(stopped.report.missing, ["fix:instructions/setting"]);
  assert.equal(
    question(stopped.report, "fix:instructions/setting").answer,
    null,
  );
  assert.deepEqual(stopped.report.deferred, []);
  assert.equal(status(f).active?.outcome, "incomplete");

  // Run again, it only reports the active run and answers nothing.
  const again = headless(f);
  assert.equal(again.result.status, 1, again.result.stdout);
  assert.equal(again.report.run?.id, stopped.report.run.id);
  assert.deepEqual(again.report.missing, ["fix:instructions/setting"]);
});

test("adopt --headless rejects a source, answers and a profile, fails without an established adoption, and asks nothing in a terminal", async (t) => {
  const f = await fixture(t, cli, {});
  for (const args of [
    [source],
    ["--answers", f.answersPath],
    ["--profile", "work"],
  ]) {
    const result = f.run(["adopt", "--headless", ...args]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /^\[USAGE\] adopt --headless/);
  }

  const before = snapshot(f.root);
  const unadopted = f.json<ErrorReport>(["adopt", "--headless", "--json"]);
  assert.equal(unadopted.result.status, 1);
  assert.equal(unadopted.report.errors[0]!.code, "NO_SELECTION");
  assert.match(
    unadopted.report.errors[0]!.message,
    /repo-standards adopt https:\/\/github\.com\/OWNER\/STANDARDS/,
  );
  assert.deepEqual(snapshot(f.root), before);

  const adopted = f.adopt([source]);
  assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
  commit(f.root);
  const session = terminalSession(f.pinned, ["adopt", "--headless"], {
    cwd: f.root,
    env: f.env,
  });
  t.after(() => session.close());
  const shown = await session.expect("## Next steps");
  assert.equal(await session.exit(), 0, shown + session.rest());
  assert.match(shown, /This headless update asked nobody/);
  assert.equal(status(f).readyToCommit, true);
});
