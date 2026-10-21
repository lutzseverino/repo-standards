import type { AdoptReport, ScopeProposal, Status } from "./json-reports.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { directoryFixture, installCli } from "./installed-cli.ts";
import { commit, git, operation } from "./remote-fixture.ts";
import {
  committedState,
  rewriteCommittedState,
  rewriteRetainedInput,
} from "./committed-evidence.ts";
import {
  adoptFirst,
  complete,
  coverage,
  draftScript,
  fixture,
  judgments,
  question,
  readmeFiles,
  reuseFixture,
  source,
  untilStarted,
  type ReuseFixture,
} from "./adopt-fixture.ts";

// An update carries the last complete adoption's recorded answers forward:
// a scope answer, a remote setup deferral and an assessment are reused when
// what each was about is provably unchanged, and proposed for review
// otherwise.

const cli = installCli();
after(() => cli.close());

const ids = (report: { reused: { id: string }[] }) =>
  report.reused.map((answer) => answer.id);

function pinned(f: ReuseFixture, args: string[]) {
  const result = spawnSync(f.pinned, args, {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

// The installed Repo Canon pull request validator's verdict on a body.
function validateBody(f: ReuseFixture, body: string) {
  const event = join(f.external.root, "event.json");
  writeFileSync(
    event,
    JSON.stringify({
      pull_request: {
        title: "chore: adopt repo-canon v1.0.0 with CLI 9.0.0",
        body,
      },
    }),
  );
  return spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../.github/scripts/validate-pr-metadata.mjs", import.meta.url),
      ),
      event,
    ],
    { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } },
  );
}

test("an unchanged update reuses the recorded scope, remote setup deferral and assessments, and completes in one run", async (t) => {
  const { f, outside } = await reuseFixture(t, cli);
  adoptFirst(f);
  const recorded = (
    JSON.parse(pinned(f, ["status", "--json"])) as Status & {
      scopeProposal: ScopeProposal;
    }
  ).scopeProposal.declarations[0]!;
  const { id: _id, ...entry } = recorded;

  // Nothing is open: the recorded scope answer and remote setup deferral are
  // reused, so one invocation starts the run, which reuses every assessment
  // and completes after its checks.
  const updated = f.adopt([], true);
  assert.equal(
    updated.report.outcome,
    "complete",
    updated.result.stdout + updated.result.stderr,
  );
  const reused = [
    "scope:project-docs",
    "remote-setup",
    "assessment:project-docs",
    "assessment:project-readme",
  ];
  assert.deepEqual(ids(updated.report), reused);

  // Durable state, status and the adoption record list every reused answer.
  const state = committedState(f.root) as ReturnType<typeof committedState> & {
    reused: { id: string }[];
    assessedScopes: Record<string, string>;
    assessments: { declarations: { id: string; explanation: string }[] }[];
  };
  assert.equal(state.format, "repo-standards/state/v8");
  assert.deepEqual(ids(state), reused);
  assert.deepEqual(Object.keys(state.assessedScopes).sort(), [
    "project-docs",
    "project-readme",
  ]);
  assert.equal(
    state.assessments[0]!.declarations.find(
      (entry) => entry.id === "project-readme",
    )!.explanation,
    judgments["assessment:project-readme"].explanation,
  );
  const status = JSON.parse(pinned(f, ["status", "--json"])) as Status & {
    reused: unknown[];
    readyToCommit: boolean;
  };
  assert.equal(status.format, "repo-standards/status/v9");
  assert.deepEqual(status.reused, updated.report.reused);
  assert.equal(status.readyToCommit, true);
  const summary = pinned(f, ["status", "--summary"]);
  assert.match(summary, /^# Repository Standards adoption record\n/);
  assert.deepEqual(
    summary.split("\n").filter((line) => /^#{1,2} /.test(line)),
    [
      "# Repository Standards adoption record",
      "## Ready to commit",
      "## Selection",
      "## Operations",
      "## Changed paths",
      "## Scope changes",
      "## Identities",
    ],
  );
  assert.match(summary, /### Reused answers\n\n\| Question \| Kind \| Why \|/);
  for (const id of reused) assert.ok(summary.includes(`| \`${id}\` |`), id);
  const validated = validateBody(f, summary);
  assert.equal(validated.status, 0, validated.stdout + validated.stderr);
  // The run retains the draft its confirmed entry was decided from.
  const history = JSON.parse(
    readFileSync(
      join(f.root, ".repo-standards/inputs/scope-history.json"),
      "utf8",
    ),
  ) as { format: string; discovery: { drafts: unknown[] } };
  assert.equal(history.format, "repo-standards/scope-history/v6");
  assert.deepEqual(history.discovery.drafts, [
    { id: "project-docs", ...entry },
  ]);
  commit(f.root);

  // An update that discards edits still asks for confirmation with the
  // fresh identity: a confirmation is never replayed.
  writeFileSync(join(f.root, "AGENTS.md"), "Edited agent guidance\n");
  commit(f.root);
  const edited = f.adopt([], true);
  const template = edited.report;
  assert.equal(template.outcome, "answers-required");
  assert.deepEqual(template.missing, ["confirmation"]);
  assert.equal(question(template, "confirmation").answer, null);
  assert.ok(!ids(template).includes("confirmation"));

  // The template asks no scope question: the recorded answer is reused,
  // marked with why, and bound by the inspection.
  assert.deepEqual(ids(template), ["scope:project-docs", "remote-setup"]);
  const scope = question(template, "scope:project-docs");
  assert.deepEqual(scope.answer, entry);
  assert.match(scope.context, /scope answer is reused/);
  assert.deepEqual((scope.details as { reused: unknown }).reused, {
    discovery: (template.reused[0]!.evidence as { discovery: string })
      .discovery,
    rules: (template.reused[0]!.evidence as { rules: string }).rules,
    draft: "decided-from",
    paths: [
      "app/README.md",
      "app/package.json",
      "fixtures/fake",
      "fixtures/fake/package.json",
    ],
  });
  assert.equal(question(template, "remote-setup").answer, "defer");
  assert.match(
    question(template, "remote-setup").context,
    /deferral is reused/,
  );
  // The Markdown report names each reused answer and why.
  const markdown = spawnSync(f.pinned, ["adopt"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  });
  assert.match(markdown.stdout, /## Reused answers/);
  assert.match(markdown.stdout, /\| `scope:project-docs` \| scope \|/);
  assert.match(markdown.stdout, /\| `remote-setup` \| remote-setup \|/);

  // An answer the agent gives itself replaces the reused one.
  const own = f.adopt(
    f.answer(template.answers, {
      "scope:project-docs": { ...entry, coverage: `${coverage} Reviewed.` },
    }),
    true,
  ).report;
  assert.deepEqual(ids(own), ["remote-setup"]);
  assert.deepEqual(own.missing, ["confirmation", "inspection"]);
  git(
    f.root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "revert",
    "--no-edit",
    "--quiet",
    "HEAD",
  );

  // Once the probe is ready, the remote setup applies and no deferral is
  // recorded.
  writeFileSync(join(outside, "ready"), "");
  const applied = f.adopt([], true);
  assert.equal(applied.report.outcome, "complete", applied.result.stdout);
  assert.ok(ids(applied.report).includes("scope:project-docs"));
  assert.ok(!ids(applied.report).includes("remote-setup"));
  assert.equal(readFileSync(join(outside, "applied.log"), "utf8"), "applied\n");
  assert.deepEqual(
    (JSON.parse(pinned(f, ["status", "--json"])) as Status).deferred,
    [],
  );
});

test("changed discovery guidance, rules, draft or a deleted path proposes the recorded scope entry for review", async (t) => {
  const { f, publish } = await reuseFixture(t, cli);
  adoptFirst(f);
  const { id: _id, ...entry } = (
    JSON.parse(pinned(f, ["status", "--json"])) as Status & {
      scopeProposal: ScopeProposal;
    }
  ).scopeProposal.declarations[0]!;
  publish("v1.1.0", { "discovery.md": "Projects have a package manifest.\n" });
  publish("v1.2.0", { "rules/docs.md": "Each project has a README.\n" });
  publish("v1.3.0", {
    "draft.mjs": draftScript("Only the app is maintained."),
  });
  // The scope answer, prefilled with the recorded entry and missing until
  // carried back, with its cause and the fresh draft.
  const proposed = (report: AdoptReport, cause: RegExp) => {
    const scope = question(report, "scope:project-docs");
    assert.ok(
      report.missing.includes("scope:project-docs"),
      report.missing.join(),
    );
    assert.ok(!ids(report).includes("scope:project-docs"));
    assert.deepEqual(scope.answer, entry);
    assert.match(scope.context, /proposed here for review/);
    assert.match(scope.context, cause);
    const details = scope.details as {
      changed: string[];
      draft: { coverage: string };
    };
    assert.match(details.changed.join(" "), cause);
    return details.draft;
  };
  for (const [tag, cause, fresh] of [
    ["v1.1.0", /discovery guidance changed/, coverage],
    ["v1.2.0", /rules changed/, coverage],
    ["v1.3.0", /draft changed/, "Only the app is maintained."],
  ] as const) {
    const report = f.adopt(["--standards-version", tag], true).report;
    assert.equal(report.selection.version, tag);
    assert.equal(proposed(report, cause).coverage, fresh, tag);
    // Carried back, the proposal is the agent's own answer. Resolving the
    // remote setup that is not ready keeps the round from starting a run.
    const carried = f.adopt(
      f.answer(report.answers, { "remote-setup": "resolve" }),
      true,
    ).report;
    assert.equal(carried.outcome, "blocked", tag);
    assert.deepEqual(carried.missing, [], tag);
    assert.ok(!ids(carried).includes("scope:project-docs"), tag);
  }

  // A deleted path the recorded entry names, with a script that drafts only
  // from the paths that exist.
  publish("v1.4.0", {
    "draft.mjs": draftScript(coverage)
      .replace("  ],", "  ].filter((candidate) => existsSync(candidate.path)),")
      .replace(
        'import { readFileSync } from "node:fs";',
        'import { existsSync, readFileSync } from "node:fs";',
      ),
  });
  rmSync(join(f.root, "fixtures"), { recursive: true });
  commit(f.root);
  const deletedRun = f.adopt(["--standards-version", "v1.4.0"], true);
  const deleted = deletedRun.report;
  assert.ok(
    deleted.answers,
    deletedRun.result.stdout + deletedRun.result.stderr,
  );
  assert.equal(
    proposed(
      deleted,
      /no longer exist: fixtures\/fake, fixtures\/fake\/package\.json/,
    ).coverage,
    coverage,
  );
});

test("assessments are reused only while their rules and scoped files are unchanged, including by the run's fixes", async (t) => {
  const { f, publish } = await reuseFixture(t, cli);
  adoptFirst(f);
  const waiting = (report: AdoptReport, changed: string, kept: string) => {
    assert.equal(report.outcome, "contextual", JSON.stringify(report));
    assert.deepEqual(report.missing, [`assessment:${changed}`]);
    assert.ok(ids(report).includes(`assessment:${kept}`));
    assert.ok(!ids(report).includes(`assessment:${changed}`));
    const proposal = question(report, `assessment:${changed}`);
    assert.deepEqual(
      proposal.answer,
      judgments[`assessment:${changed}` as keyof typeof judgments],
    );
    assert.match(proposal.context, /proposed here for review/);
    assert.deepEqual(
      question(report, `assessment:${kept}`).answer,
      judgments[`assessment:${kept}` as keyof typeof judgments],
    );
    return (proposal.details as { changed: string[] }).changed.join(" ");
  };

  // A scoped file changed since the last complete adoption.
  writeFileSync(join(f.root, "app/README.md"), "# App\n\nIts tools.\n");
  commit(f.root);
  const scoped = untilStarted(f, []);
  assert.match(
    waiting(scoped, "project-docs", "project-readme"),
    /Files in its scope changed/,
  );
  // Carrying the proposal back submits it as the agent's own judgment.
  const judged = complete(f, scoped, {
    "assessment:project-docs": judgments["assessment:project-docs"],
  });
  assert.deepEqual(ids(judged), [
    "scope:project-docs",
    "remote-setup",
    "assessment:project-readme",
  ]);

  // Changed rules.
  publish("v1.1.0", {
    "rules/readme.md": "README.md starts with the project's name.\n",
  });
  const ruled = untilStarted(f, ["--standards-version", "v1.1.0"]);
  assert.match(
    waiting(ruled, "project-readme", "project-docs"),
    /rules changed/,
  );
  complete(f, ruled, {
    "assessment:project-readme": judgments["assessment:project-readme"],
  });

  // A fix that changes a scoped file during the run.
  publish(
    "v1.2.0",
    {
      "rules/readme.md": "README.md starts with the project's name.\n",
      "fixes/readme.mjs": `import { readFileSync, writeFileSync } from 'node:fs';
const text = readFileSync('README.md', 'utf8');
const fixed = text.includes('Fixed.') ? text : text + '\\nFixed.\\n';
if (fixed !== text) writeFileSync('README.md', fixed);
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: fixed === text ? 'unchanged' : 'changed', message: 'README.md is fixed.' }));
`,
    },
    { fixes: [operation("readme", { script: "fixes/readme.mjs" })] },
  );
  const fixed = untilStarted(f, ["--standards-version", "v1.2.0"]);
  assert.match(
    waiting(fixed, "project-readme", "project-docs"),
    /Files in its scope changed/,
  );
  assert.match(readFileSync(join(f.root, "README.md"), "utf8"), /Fixed\./);
});

test("a declined overwrite's deferral and a fix's overwrite answer are never reused", async (t) => {
  const outside = directoryFixture("repo-standards-reuse-setting-");
  t.after(() => outside.close());
  const marker = join(outside.root, "ready");
  const message = "Overwrites the label color red with blue.";
  const f = await fixture(
    t,
    cli,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        fixes: [
          {
            ...operation("labels", { script: "setting.mjs" }),
            "remote-setup": {
              probe: (({ id: _id, ...declared }) => declared)(
                operation("probe", {
                  script: "remote/probe.mjs",
                  arguments: [marker],
                }),
              ),
            },
          },
        ],
      },
    },
    {
      files: {
        "content/AGENTS.md": "Standard agent guidance\n",
        "remote/probe.mjs": readmeFiles["remote/probe.mjs"],
        "setting.mjs": `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: input.overwriteAllowed ? 'changed' : 'confirmation-required', message: ${JSON.stringify(message)} }));
`,
      },
      project: { "README.md": "Project notes\n" },
    },
  );
  // The maintainer declines the overwrite, which defers the fix.
  writeFileSync(marker, "");
  const template = f.adopt([source]).report;
  const stopped = f.adopt(f.answer(template.answers)).report;
  assert.deepEqual(stopped.missing, ["fix:agent-guidance/labels"]);
  const declined = f.adopt(
    f.answer(stopped.answers, { "fix:agent-guidance/labels": "defer" }),
    true,
  );
  assert.equal(declined.report.outcome, "complete", declined.result.stdout);
  commit(f.root);

  // Not ready, the declined deferral is no remote setup deferral to reuse.
  rmSync(marker);
  const notReady = f.adopt([], true).report;
  assert.deepEqual(notReady.reused, []);
  assert.equal(question(notReady, "remote-setup").answer, null);
  assert.deepEqual(f.adopt(f.answer(notReady.answers), true).report.missing, [
    "remote-setup",
  ]);

  // Ready again, the fix asks again: its answer is not replayed.
  writeFileSync(marker, "");
  const update = f.adopt([], true).report;
  assert.deepEqual(update.reused, []);
  const again = f.adopt(f.answer(update.answers), true).report;
  assert.equal(again.outcome, "answers-required");
  assert.deepEqual(again.missing, ["fix:agent-guidance/labels"]);
  assert.equal(question(again, "fix:agent-guidance/labels").answer, null);
});

// Rewrites the adoption's records as CLI 9.0.0 writes them: state/v7 without
// reused answers or assessed scopes, and scope-history/v5 without drafts.
function previousRelease(f: ReuseFixture) {
  const {
    reused: _reused,
    assessedScopes: _scopes,
    ...state
  } = committedState(f.root) as ReturnType<typeof committedState> & {
    reused: unknown;
    assessedScopes: unknown;
  };
  rewriteCommittedState(f.root, {
    ...state,
    format: "repo-standards/state/v7",
  });
  const historyPath = ".repo-standards/inputs/scope-history.json";
  const history = JSON.parse(
    readFileSync(join(f.root, historyPath), "utf8"),
  ) as { discovery: { drafts?: unknown } };
  delete history.discovery.drafts;
  rewriteRetainedInput(f.root, historyPath, {
    ...history,
    format: "repo-standards/scope-history/v5",
  });
  commit(f.root);

  return historyPath;
}

test("an update from the previous release's state and scope evidence reuses every answer they prove", async (t) => {
  const { f } = await reuseFixture(t, cli);
  adoptFirst(f);
  const historyPath = previousRelease(f);
  const updated = f.adopt([], true);
  assert.equal(
    updated.report.outcome,
    "complete",
    updated.result.stdout + updated.result.stderr,
  );
  assert.equal(
    (updated.report.reused[0]!.evidence as { draft: string }).draft,
    "recorded-entry",
  );
  assert.deepEqual(ids(updated.report), [
    "scope:project-docs",
    "remote-setup",
    "assessment:project-docs",
    "assessment:project-readme",
  ]);
  // The previous state records only the whole project's snapshot.
  for (const answer of updated.report.reused.slice(2))
    assert.equal(
      (answer.evidence as { scope: { basis: string } }).scope.basis,
      "project",
    );
  assert.equal(committedState(f.root).format, "repo-standards/state/v8");
  assert.ok(existsSync(join(f.root, historyPath)));
});

test("previous-release state reuses no assessment whose scope answer changed", async (t) => {
  const { f } = await reuseFixture(t, cli);
  adoptFirst(f);
  previousRelease(f);
  const {
    id: _id,
    candidates,
    ...entry
  } = (
    JSON.parse(pinned(f, ["status", "--json"])) as {
      scopeProposal: ScopeProposal;
    }
  ).scopeProposal.declarations[0]!;
  // The whole project is unchanged, but the docs scope gains a file to write.
  writeFileSync(
    f.answersPath,
    JSON.stringify({
      format: "repo-standards/answers/v1",
      source,
      questions: [
        {
          id: "version",
          question: "Which standards version should the project adopt?",
          context: "",
          answer: "v1.0.0",
        },
        {
          id: "profile",
          question: "Which profile should the project adopt?",
          context: "",
          answer: "work",
        },
        {
          id: "scope:project-docs",
          question: "Which project files does project-docs cover?",
          context: "",
          answer: {
            ...entry,
            candidates: [
              ...candidates,
              {
                path: "tools/README.md",
                decision: "include",
                reason: "The tools are maintained too.",
                evidence: ["tools/run.sh"],
              },
            ],
          },
        },
      ],
    }),
  );
  const started = f.adopt(["--answers", f.answersPath], true).report;
  assert.equal(started.outcome, "contextual", JSON.stringify(started));
  assert.deepEqual(started.missing, ["assessment:project-docs"]);
  assert.deepEqual(ids(started), ["remote-setup", "assessment:project-readme"]);
});

test("a recorded remote setup deferral beside remote setup it never deferred is proposed for review", async (t) => {
  const outside = directoryFixture("repo-standards-reuse-remote-");
  t.after(() => outside.close());
  const setup = (name: string) => ({
    ...operation(name, {
      script: "remote/fix.mjs",
      arguments: [join(outside.root, `${name}.log`)],
    }),
    "remote-setup": {
      probe: (({ id: _id, ...declared }) => declared)(
        operation("probe", {
          script: "remote/probe.mjs",
          arguments: [join(outside.root, `${name}-ready`)],
        }),
      ),
    },
  });
  const f = await fixture(
    t,
    cli,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        fixes: [setup("labels"), setup("rules")],
      },
    },
    { project: { "README.md": "Project notes\n" } },
  );
  // Labels are deferred and the rules are applied.
  writeFileSync(join(outside.root, "rules-ready"), "");
  const first = untilStarted(f, [source], {}, false);
  assert.equal(first.outcome, "complete", JSON.stringify(first));
  commit(f.root);
  rmSync(join(outside.root, "rules-ready"));
  const update = f.adopt([], true).report;
  assert.deepEqual(update.reused, []);
  const remote = question(update, "remote-setup");
  assert.equal(remote.answer, "defer");
  assert.match(remote.context, /proposed here as defer for review/);
  assert.match(remote.context, /did not defer agent-guidance\/rules/);
  assert.ok(update.missing.includes("remote-setup"));
  // Carried back, the proposal is the agent's own answer.
  const carried = f.adopt(f.answer(update.answers), true).report;
  assert.equal(carried.outcome, "complete", JSON.stringify(carried));
  assert.deepEqual(carried.reused, []);
});
