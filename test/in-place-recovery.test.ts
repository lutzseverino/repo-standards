import type { AdoptReport, Run, Status } from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { directoryFixture, installCli } from "./installed-cli.ts";
import { commit, git, operation } from "./remote-fixture.ts";
import {
  discoveryFixture,
  fixture,
  question,
  source,
} from "./adopt-fixture.ts";

const cli = installCli();
after(() => cli.close());

type Fixture = Pick<
  Awaited<ReturnType<typeof fixture>>,
  "root" | "env" | "pinned"
>;

// A command of the project's pinned runtime, with its JSON report.
function pinned<T>(f: Fixture, args: string[]) {
  const result = spawnSync(f.pinned, [...args, "--json"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  });
  return { result, report: JSON.parse(result.stdout) as T };
}

const status = (f: Fixture) =>
  pinned<Status & { readyToCommit: boolean }>(f, ["status"]).report;

const steps = (report: AdoptReport) => report.nextSteps.join("\n");

const valid = {
  status: "valid",
  explanation: "The scope covers every maintained project.",
  evidence: ["app/package.json"],
  additionalPaths: [],
};

// A discovered declaration's run waiting for contextual work, started once an
// answers file carries the drafted scope back.
async function contextualRun(t: Parameters<typeof discoveryFixture>[0]) {
  const { f, draft } = await discoveryFixture(t, cli, []);
  const head = git(f.root, "rev-parse", "HEAD");
  const template = f.adopt([source]).report;
  const contextual = f.adopt(f.answer(template.answers)).report;
  assert.equal(contextual.outcome, "contextual", steps(contextual));
  return { f, draft, head, contextual };
}

test("a changed scope answer replaces a run stopped for an out-of-scope path in place, and its change set covers both runs", async (t) => {
  const { f, draft, head, contextual } = await contextualRun(t);
  // The agent's work writes a file the discovered scope misses.
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  writeFileSync(join(f.root, "tools/README.md"), "# Tools\n");
  const assessment = {
    status: "satisfied",
    explanation: "Each maintained project has a README.",
    evidence: ["app/README.md"],
    scopeValidity: { afterFixes: valid, current: valid },
  };
  const rejected = f.adopt(
    f.answer(contextual.answers, { "assessment:project-docs": assessment }),
    true,
  ).report;
  assert.match(rejected.run!.reason, /^ASSESSMENT_SCOPE:.*tools\/README\.md/);
  // The run's report carries its confirmed scope, which a changed answer
  // replaces in place.
  const scope = question(rejected, "scope:project-docs");
  assert.deepEqual(scope.answer, draft);
  assert.match(scope.context, /replaces the run in place/);
  assert.match(steps(rejected), /adopt replaces this run in place/);
  assert.match(steps(rejected), /without asking/);
  assert.doesNotMatch(steps(rejected), /abandon`/);
  const replacedRun = rejected.run!.id;

  const widened = {
    ...draft,
    coverage: `${draft.coverage} The tools scripts are maintained too.`,
    candidates: [
      ...draft.candidates,
      {
        path: "tools/README.md",
        decision: "include",
        reason: "The tools scripts are a maintained project.",
        evidence: ["tools/run.sh"],
      },
    ],
  };
  // An uncommitted change the replaced run did not record blocks the start
  // of the replacement, and the agent stops and tells the maintainer.
  writeFileSync(join(f.root, "notes.txt"), "Maintainer notes\n");
  const answers = f.answer(rejected.answers, {
    "assessment:project-docs": assessment,
    "scope:project-docs": widened,
  });
  const dirty = f.adopt(answers, true);
  assert.equal(dirty.result.status, 1, dirty.result.stdout);
  assert.equal(dirty.report.run, undefined);
  assert.deepEqual(
    dirty.report.blockers.map(({ code, path }) => [code, path]),
    [["DIRTY_PROJECT", "notes.txt"]],
  );
  assert.match(steps(dirty.report), /Stop and tell the maintainer/);
  assert.match(
    steps(dirty.report),
    new RegExp(`adopts again in place over the changes run ${replacedRun}`),
  );
  const archived = status(f);
  assert.equal(archived.active, null);
  assert.equal(archived.abandoned[0]!.id, replacedRun);
  assert.match(archived.abandoned[0]!.reason, /^REPLACED: ASSESSMENT_SCOPE:/);
  rmSync(join(f.root, "notes.txt"));

  // The replacement keeps the run's selection and, needing no confirmation,
  // starts with the new inspection in the same invocation.
  assert.equal(question(dirty.report, "version").answer, "v1.0.0");
  assert.equal(question(dirty.report, "profile").answer, "work");
  const started = f.adopt(answers, true).report;
  assert.equal(started.outcome, "contextual", steps(started));
  assert.notEqual(started.run!.id, replacedRun);
  assert.deepEqual(started.contextual![0]!.allowedTargets, {
    paths: ["app/README.md", "tools/README.md"],
    directories: [],
  });
  const complete = f.adopt(
    f.answer(started.answers, {
      "assessment:project-docs": {
        ...assessment,
        evidence: ["app/README.md", "tools/README.md"],
      },
    }),
    true,
  );
  assert.equal(complete.report.outcome, "complete", steps(complete.report));
  assert.equal(complete.result.status, 0);

  // No abandon, commit or clone: HEAD is unchanged, and the change set holds
  // the replaced run's installation and agent work with the new run's.
  assert.equal(git(f.root, "rev-parse", "HEAD"), head);
  const record = status(f);
  assert.equal(record.readyToCommit, true, record.readinessReasons.join("\n"));
  const changed = Object.fromEntries(
    record.changeSet!.map(({ path, phases }) => [path, phases]),
  );
  assert.deepEqual(changed["app/README.md"], ["agent"]);
  assert.deepEqual(changed["tools/README.md"], ["agent"]);
  assert.deepEqual(changed[".agents/skills/repository-standards/SKILL.md"], [
    "installation",
  ]);
  assert.deepEqual(changed[".claude/skills/repository-standards"], [
    "installation",
  ]);
  assert.deepEqual(record.assessments![0]!.declarations[0]!.changedPaths, [
    "app/README.md",
    "tools/README.md",
  ]);
  const summary = spawnSync(f.pinned, ["status", "--summary"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  }).stdout;
  assert.match(summary, /`tools\/README\.md` \| agent/);
});

test("a run stopped for an incomplete scope recovers in place through the answers file", async (t) => {
  const { f, draft, contextual } = await contextualRun(t);
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  const blocked = {
    status: "blocked",
    explanation: "The tools project needs a README the scope misses.",
    evidence: ["tools/run.sh"],
    additionalPaths: ["tools/README.md"],
  };
  const stopped = f.adopt(
    f.answer(contextual.answers, {
      "assessment:project-docs": {
        status: "blocked",
        explanation: "The scope misses the tools project.",
        evidence: ["tools/run.sh"],
        scopeValidity: { afterFixes: valid, current: blocked },
      },
    }),
    true,
  ).report;
  assert.match(stopped.run!.reason, /^SCOPE_INCOMPLETE:/);
  assert.match(steps(stopped), /adopt replaces this run in place/);
  assert.doesNotMatch(steps(stopped), /abandon`/);

  // A change made after the run stopped is not one it recorded, so it still
  // blocks the replacement's start.
  writeFileSync(join(f.root, "app/NOTES.md"), "Maintainer notes\n");
  const dirty = f.adopt(
    f.answer(stopped.answers, {
      "scope:project-docs": {
        ...draft,
        candidates: [
          ...draft.candidates,
          {
            path: "tools/README.md",
            decision: "include",
            reason: "The tools scripts are a maintained project.",
            evidence: ["tools/run.sh"],
          },
        ],
      },
    }),
    true,
  ).report;
  assert.equal(dirty.run, undefined);
  assert.deepEqual(
    dirty.blockers.map(({ code, path }) => [code, path]),
    [["DIRTY_PROJECT", "app/NOTES.md"]],
  );
  assert.match(steps(dirty), /Stop and tell the maintainer/);
  rmSync(join(f.root, "app/NOTES.md"));

  const started = f.adopt(f.answer(dirty.answers), true).report;
  assert.deepEqual(started.blockers, []);
  assert.equal(started.outcome, "contextual", steps(started));
  writeFileSync(join(f.root, "tools/README.md"), "# Tools\n");
  const complete = f.adopt(
    f.answer(started.answers, {
      "assessment:project-docs": {
        status: "satisfied",
        explanation: "Each maintained project has a README.",
        evidence: ["app/README.md", "tools/README.md"],
        scopeValidity: { afterFixes: valid, current: valid },
      },
    }),
    true,
  ).report;
  assert.equal(complete.outcome, "complete", steps(complete));
  const changed = status(f).changeSet!.map(({ path }) => path);
  assert.ok(changed.includes("app/README.md"), changed.join(", "));
  assert.ok(changed.includes("tools/README.md"), changed.join(", "));
});

test("abandonment exits 0, and adopt then adopts again in place over the preserved changes", async (t) => {
  const { f, head, contextual } = await contextualRun(t);
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  for (const args of [["abandon"], ["abandon", "--json"]]) {
    const result = spawnSync(f.pinned, args, {
      cwd: f.root,
      env: f.env,
      encoding: "utf8",
    });
    if (args.length === 1) {
      assert.equal(result.status, 0, result.stderr);
      continue;
    }
    // A refusal, with no run left to abandon, still exits 1.
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /NO_ACTIVE_RUN/);
  }
  const abandoned = status(f).abandoned[0]!;
  assert.match(abandoned.nextAction, /adopt again in place/);

  // adopt names the way forward from the preserved changes and starts over
  // them with the abandoned run's selection.
  const again = f.adopt(f.answer(contextual.answers), true);
  assert.equal(again.report.outcome, "contextual", steps(again.report));
  assert.deepEqual(again.report.blockers, []);
  const started = again.report;
  const complete = f.adopt(
    f.answer(started.answers, {
      "assessment:project-docs": {
        status: "satisfied",
        explanation: "The app has a README.",
        evidence: ["app/README.md"],
        scopeValidity: { afterFixes: valid, current: valid },
      },
    }),
    true,
  ).report;
  assert.equal(complete.outcome, "complete", steps(complete));
  assert.equal(git(f.root, "rev-parse", "HEAD"), head);
  const record = status(f);
  assert.equal(record.readyToCommit, true, record.readinessReasons.join("\n"));
  assert.ok(
    record.changeSet!.some(({ path }) => path === "app/README.md"),
    JSON.stringify(record.changeSet),
  );
});

test("abandon --json exits 0 on success", async (t) => {
  const { f } = await contextualRun(t);
  const { result, report } = pinned<Run>(f, ["abandon"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.abandoned, true);
  assert.equal(report.outcome, "incomplete");
  // The changes it left are named as the way forward from there.
  const rules = spawnSync(f.pinned, ["rules"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  });
  assert.equal(rules.status, 1);
  assert.match(rules.stderr, /STATE_INTEGRITY/);
  assert.match(
    rules.stderr,
    /Run adopt in this checkout to adopt again in place/,
  );
  assert.equal(
    readFileSync(join(f.root, ".repo-standards/selection.yaml"), "utf8")
      .length > 0,
    true,
  );
});

// A source whose first fix overwrites a setting only once allowed, and whose
// second records that it ran; both write outside the project, as a hosting
// platform's settings would change.
async function settingFixture(t: Parameters<typeof fixture>[0]) {
  const outside = directoryFixture("repo-standards-adopt-setting-");
  t.after(() => outside.close());
  const settings = join(outside.root, "settings.log");
  const labels = join(outside.root, "labels.log");
  const message = "Overwrites the merge setting squash with rebase.";
  const f = await fixture(
    t,
    cli,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        fixes: [
          operation("setting", {
            script: "setting.mjs",
            arguments: [settings],
          }),
          operation("labels", { script: "labels.mjs", arguments: [labels] }),
        ],
      },
    },
    {
      files: {
        "content/AGENTS.md": "Standard agent guidance\n",
        "setting.mjs": `import { appendFileSync, readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const result = (status, message) => console.log(JSON.stringify({ format: 'repo-standards/result/v2', status, message }));
if (!input.overwriteAllowed) result('confirmation-required', ${JSON.stringify(message)});
else { appendFileSync(process.argv[2], 'rebase\\n'); result('changed', 'Set the merge setting.'); }
`,
        "labels.mjs": `import { appendFileSync } from 'node:fs';
appendFileSync(process.argv[2], 'labels\\n');
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: 'changed', message: 'Labels created.' }));
`,
      },
      project: { "README.md": "Project notes\n" },
    },
  );
  return { f, settings, labels, message };
}

test("a declined overwrite defers its fix: the run continues, records the deferral, and every later run runs the fix again", async (t) => {
  const { f, settings, labels, message } = await settingFixture(t);
  const template = f.adopt([source]).report;
  const stopped = f.adopt(f.answer(template.answers)).report;
  assert.equal(stopped.outcome, "answers-required");
  const fix = question(stopped, "fix:agent-guidance/setting");
  const { identity } = fix.details as { identity: string };
  assert.deepEqual(fix.choices, [identity, "defer"]);
  assert.match(fix.context, /answer defer/);
  assert.match(steps(stopped), /If they decline, answer `defer`/);
  assert.doesNotMatch(steps(stopped), /abandon/);
  assert.equal(existsSync(labels), false);

  const deferred = f.adopt(
    f.answer(stopped.answers, { "fix:agent-guidance/setting": "defer" }),
    true,
  );
  assert.equal(deferred.report.outcome, "complete", steps(deferred.report));
  assert.equal(deferred.result.status, 0);
  // The deferred fix changed nothing, and the next fix ran.
  assert.equal(existsSync(settings), false);
  assert.equal(readFileSync(labels, "utf8"), "labels\n");
  const record = status(f);
  const reason = `The maintainer declined the overwrite: ${message}`;
  assert.deepEqual(record.deferred, [
    { declaration: "agent-guidance", id: "setting", reason },
  ]);
  const summary = spawnSync(f.pinned, ["status", "--summary"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  }).stdout;
  assert.ok(
    summary.includes(
      `| fixes | \`agent-guidance\` | \`setting\` | deferred | ${reason} |`,
    ),
    summary,
  );

  // The next run runs the fix again, which stops again while the setting
  // still differs.
  commit(f.root);
  const update = f.adopt([], true).report;
  const again = f.adopt(f.answer(update.answers), true).report;
  assert.equal(again.outcome, "answers-required", steps(again));
  assert.ok(question(again, "fix:agent-guidance/setting"));
});

test("resume --defer defers the fix a run stopped at, and refuses any other run", async (t) => {
  const { f, labels, message } = await settingFixture(t);
  const template = f.adopt([source]).report;
  assert.equal(
    f.adopt(f.answer(template.answers)).report.outcome,
    "answers-required",
  );
  for (const args of [
    ["resume", "--defer", "--retry"],
    ["resume", "--defer", "--confirmed"],
  ])
    assert.equal(
      spawnSync(f.pinned, args, { cwd: f.root, env: f.env }).status,
      2,
    );
  const refused = pinned<{ errors: { code: string; message: string }[] }>(f, [
    "resume",
  ]).report;
  assert.match(refused.errors[0]!.message, /resume --defer/);
  const { result, report } = pinned<Run>(f, ["resume", "--defer"]);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(report.outcome, "complete");
  assert.deepEqual(report.deferred, [
    {
      declaration: "agent-guidance",
      id: "setting",
      reason: `The maintainer declined the overwrite: ${message}`,
    },
  ]);
  assert.equal(readFileSync(labels, "utf8"), "labels\n");
  const again = pinned<{ errors: { code: string }[] }>(f, [
    "resume",
    "--defer",
  ]);
  assert.equal(again.result.status, 1);
  assert.equal(again.report.errors[0]!.code, "NO_ACTIVE_RUN");
});
