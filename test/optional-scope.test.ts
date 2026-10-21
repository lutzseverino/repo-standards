import type {
  CheckReport,
  ErrorReport,
  Run,
  RulesReport,
  SourceValidation,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installCli, sourceFixture } from "./installed-cli.ts";
import { registryFixture } from "./registry-fixture.ts";
import {
  commit,
  inspectionArgs,
  manifest,
  operation,
  startArgs,
} from "./remote-fixture.ts";
import { adoptionFixture, type AdoptionFixture } from "./adoption-fixture.ts";
import { fixture, question, source } from "./adopt-fixture.ts";
import { terminalSession } from "./terminal.ts";

const cli = installCli();
const registry = await registryFixture(cli.root);
after(() => {
  registry.close();
  cli.close();
});

// Fixes change nothing, and checks pass.
const script = `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const fix = input.operation.phase === 'fixes';
console.log(JSON.stringify({format:'repo-standards/result/v2',status:fix?'unchanged':'passed',message:fix?'Nothing to fix':'Checked'}));`;

const hostingRules = "# Hosting rules\n\nProtect the default branch.\n";
const trackerRules = "# Tracker rules\n\nLabel every ticket.\n";

// An optional discovery declaration and one that is not, each with rules, a
// fix and a check.
function declarations(optional = true) {
  return {
    hosting: {
      kind: "repository",
      guidance: "guidance/hosting.md",
      rules: "rules/hosting.md",
      discovery: "discovery/hosting.md",
      ...(optional ? { optional: true } : {}),
      fixes: [operation("hosting-fix")],
      checks: [operation("hosting-check")],
    },
    tracker: {
      kind: "repository",
      guidance: "guidance/tracker.md",
      rules: "rules/tracker.md",
      discovery: "discovery/tracker.md",
      checks: [operation("tracker-check")],
    },
  };
}

async function optionalFixture(t: TestContext, optional = true) {
  return adoptionFixture(t, cli, manifest(declarations(optional)), {
    files: {
      "guidance/hosting.md": "Ask the maintainer about branch protection.",
      "guidance/tracker.md": "Label the open tickets once.",
      "discovery/hosting.md": "Include the hosting notes, if any.",
      "discovery/tracker.md": "Propose no paths.",
      "rules/hosting.md": hostingRules,
      "rules/tracker.md": trackerRules,
      "run.mjs": script,
    },
    project: { "docs/guide.md": "# Guide\n" },
    registry,
  });
}

type Scope = "none" | "empty" | string[];

// A proposal giving hosting the scope named, and tracker an empty scope.
function proposal(hosting: Scope, tracker: Scope = "empty") {
  const entry = (id: string, scope: Scope) => ({
    id,
    coverage: `The scope of ${id}.`,
    candidates: [
      ...(Array.isArray(scope) ? scope : []).map((path) => ({
        path,
        decision: "include",
        reason: "The hosting notes.",
        evidence: [] as string[],
      })),
      {
        path: "docs/guide.md",
        decision: "exclude",
        reason: "The guide is not about hosting.",
        evidence: ["docs/guide.md"],
      },
    ],
    unresolved: [] as string[],
    ...(scope === "none" ? { noScope: true } : {}),
  });
  return {
    format: "repo-standards/scope/v2",
    declarations: [entry("hosting", hosting), entry("tracker", tracker)],
  };
}

function scopeArgs(
  f: AdoptionFixture,
  value: unknown,
  args = inspectionArgs,
  name = "scope.json",
) {
  const file = join(f.remote.support.root, name);
  writeFileSync(file, JSON.stringify(value));
  return [...args, "--scope", file];
}

function review(explanation: string) {
  return {
    status: "valid",
    explanation,
    evidence: ["Reviewed the confirmed scope."],
    additionalPaths: [] as string[],
  };
}

// Submits a satisfied assessment of every contextual declaration, with its
// scope reviews, unless they are left out.
function assess(f: AdoptionFixture, run: Run, scopeValidity = true) {
  const file = join(f.remote.support.root, "assessment.json");
  writeFileSync(
    file,
    JSON.stringify({
      format: "repo-standards/assessment/v3",
      declarations: run.workRequest!.declarations.map(({ id }) => ({
        id,
        status: "satisfied",
        explanation: "Nothing to change.",
        evidence: ["Reviewed the project."],
        ...(scopeValidity
          ? {
              scopeValidity: {
                afterFixes: review("No project file belongs elsewhere."),
                current: review("No project file belongs elsewhere."),
              },
            }
          : {}),
      })),
    }),
  );
  return f.json<Run>(["resume", "--assessment", file]);
}

// Inspects, starts and completes a run with the given scope, then commits it.
function adopt(f: AdoptionFixture, args: string[], prepare = () => {}) {
  const inspection = f.inspect(args);
  const started = f.json<Run>(startArgs(inspection.identity, args));
  assert.equal(started.report.phase, "contextual", started.result.stdout);
  prepare();
  // The work request is refreshed at the project's current content.
  const refreshed = f.json<Run>(["resume"]);
  const complete = assess(f, refreshed.report);
  assert.equal(complete.report.outcome, "complete", complete.result.stdout);
  commit(f.root);
  return { inspection, started: started.report, run: complete.report };
}

const ran = (run: Run) =>
  run.operations.map(
    ({ operation }) =>
      `${operation.declaration}/${operation.phase}/${operation.id}`,
  );

function rulesIndex(f: AdoptionFixture) {
  return readFileSync(join(f.root, ".repo-standards/rules/README.md"), "utf8");
}

function covering(f: AdoptionFixture, path?: string) {
  const { result, report } = f.json<RulesReport>([
    "rules",
    ...(path === undefined ? [] : [path]),
    "--json",
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return report.rules.map(({ declaration, coverage }) => [
    declaration,
    coverage,
  ]);
}

test("source validation accepts optional only on a discovery declaration", (t) => {
  const valid = sourceFixture(manifest(declarations()), {
    "guidance/hosting.md": "Guidance",
    "guidance/tracker.md": "Guidance",
    "discovery/hosting.md": "Discovery",
    "discovery/tracker.md": "Discovery",
    "rules/hosting.md": hostingRules,
    "rules/tracker.md": trackerRules,
    "run.mjs": script,
  });
  t.after(() => valid.close());
  const accepted = cli.run(["source", "validate", "--json"], valid.root);
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  const profile = (JSON.parse(accepted.stdout) as SourceValidation).profiles
    .work!;
  const optional = (id: string) =>
    (
      profile.declarations.find((declaration) => declaration.id === id) as {
        optional?: unknown;
      }
    ).optional;
  assert.equal(optional("hosting"), true);
  assert.equal(optional("tracker"), undefined);

  const invalid = sourceFixture(
    manifest({
      explicit: {
        kind: "repository",
        guidance: "guidance.md",
        targets: { paths: ["README.md"], directories: [] },
        optional: true,
      },
      contextual: {
        kind: "file",
        target: "NOTES.md",
        guidance: "guidance.md",
        optional: true,
      },
      exact: {
        kind: "file",
        target: "LICENSE",
        exact: "guidance.md",
        optional: true,
      },
      skill: {
        kind: "skill",
        name: "review",
        source: "skill",
        optional: true,
      },
      unmarked: {
        kind: "repository",
        guidance: "guidance.md",
        discovery: "discovery.md",
        optional: false,
      },
    }),
    {
      "guidance.md": "Guidance",
      "discovery.md": "Discovery",
      "skill/SKILL.md":
        "---\nname: review\ndescription: Review changes.\n---\n\nReview.\n",
    },
  );
  t.after(() => invalid.close());
  const rejected = cli.run(["source", "validate", "--json"], invalid.root);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  const errors = (JSON.parse(rejected.stdout) as SourceValidation).errors.map(
    ({ code, path }) => [code, path],
  );
  assert.deepEqual(errors, [
    ["INVALID_DECLARATION", "/defaults/declarations/explicit/optional"],
    ["UNKNOWN_FIELD", "/defaults/declarations/contextual/optional"],
    ["UNKNOWN_FIELD", "/defaults/declarations/exact/optional"],
    ["UNKNOWN_FIELD", "/defaults/declarations/skill/optional"],
    ["INVALID_DECLARATION", "/defaults/declarations/unmarked/optional"],
  ]);
});

test("an optional declaration with no scope installs no rules and runs no operations, while an empty scope stays repository-wide", async (t) => {
  const f = await optionalFixture(t);
  const args = scopeArgs(f, proposal("none"));
  const inspection = f.inspect(args);
  const hosting = inspection.resolved.declarations.find(
    (declaration) => declaration.id === "hosting",
  )!;
  assert.deepEqual(hosting, {
    id: "hosting",
    kind: "repository",
    guidance: "guidance/hosting.md",
    checks: [],
    fixes: [],
    targets: { paths: [], directories: [] },
    "no-scope": true,
  });
  assert.deepEqual(
    inspection.operations.map(({ declaration, id }) => `${declaration}/${id}`),
    ["tracker/tracker-check"],
  );
  const summary = f.run([
    ...args.filter((arg) => arg !== "--json"),
    "--summary",
  ]);
  assert.equal(summary.status, 0, summary.stderr);
  assert.match(summary.stdout, /\| `hosting` \| no scope \| added \|/);
  assert.match(summary.stdout, /\| `tracker` \| none \| added \|/);

  const started = f.json<Run>(startArgs(inspection.identity, args));
  assert.equal(started.report.phase, "contextual", started.result.stdout);
  // The declaration is still assessed, against no target and no rules.
  assert.deepEqual(
    started.report.workRequest!.declarations.map(
      ({ id, rules, allowedTargets }) => [id, rules ?? null, allowedTargets],
    ),
    [
      ["hosting", null, { paths: [], directories: [] }],
      [
        "tracker",
        ".repo-standards/rules/tracker.md",
        { paths: [], directories: [] },
      ],
    ],
  );
  // Both scope reviews are required of it.
  const missing = assess(f, started.report, false);
  assert.equal(missing.result.status, 1, missing.result.stdout);
  assert.match(
    missing.report.reason,
    /^ASSESSMENT_FORMAT: .*plus scopeValidity for a discovery declaration/,
  );
  const complete = assess(f, started.report);
  assert.equal(complete.report.outcome, "complete", complete.result.stdout);
  assert.deepEqual(ran(complete.report), ["tracker/checks/tracker-check"]);

  const root = f.root;
  assert.equal(
    existsSync(join(root, ".repo-standards/rules/hosting.md")),
    false,
  );
  assert.equal(
    readFileSync(join(root, ".repo-standards/rules/tracker.md"), "utf8"),
    trackerRules,
  );
  assert.doesNotMatch(rulesIndex(f), /hosting/);
  assert.match(
    rulesIndex(f),
    /- \[`tracker`\]\(tracker\.md\) covers the whole repository\.\n$/,
  );
  assert.deepEqual(covering(f), [["tracker", "repository"]]);
  assert.deepEqual(covering(f, "docs/guide.md"), [["tracker", "repository"]]);
  assert.deepEqual(covering(f, "."), [["tracker", "repository"]]);
  const record = f.run(["status", "--summary"]);
  assert.equal(record.status, 0, record.stderr);
  assert.match(record.stdout, /tracker-check/);
  assert.doesNotMatch(record.stdout, /hosting-(check|fix)/);
  commit(root);
  const checked = f.json<CheckReport>(["check", "--json"]);
  assert.equal(checked.result.status, 0, checked.result.stdout);
  assert.deepEqual(
    checked.report.checks.map(({ declaration, id }) => `${declaration}/${id}`),
    ["tracker/tracker-check"],
  );
  // The confirmed proposal keeps its no scope for a later update.
  const status = f.json<Status>(["status", "--json"]).report;
  assert.equal(
    (
      status.scopeProposal!.declarations.find(
        (entry) => entry.id === "hosting",
      ) as { noScope?: unknown }
    ).noScope,
    true,
  );
});

test("no scope is rejected for a declaration that is not optional, and nothing is installed", async (t) => {
  const f = await optionalFixture(t, false);
  const rejected = (value: unknown, pattern: RegExp) => {
    const { result, report } = f.json<ErrorReport>(scopeArgs(f, value));
    assert.equal(result.status, 1, result.stdout);
    assert.equal(report.errors[0]!.code, "INVALID_SCOPE");
    assert.match(report.errors[0]!.message, pattern);
  };
  rejected(
    proposal("none", "none"),
    /Only an optional declaration can have no scope, and these are not optional: hosting, tracker\./,
  );
  const g = await optionalFixture(t);
  const included = proposal(["docs/hosting.md"]);
  Object.assign(included.declarations[0]!, { noScope: true });
  for (const [value, pattern] of [
    [
      proposal("none", "none"),
      /these are not optional: tracker\. Propose their scope/,
    ],
    [included, /has no scope, so it cannot include a candidate/],
    [
      {
        ...proposal("empty"),
        declarations: proposal("empty").declarations.map((entry) => ({
          ...entry,
          noScope: false,
        })),
      },
      /noScope must be true/,
    ],
  ] as const) {
    const { result, report } = g.json<ErrorReport>(scopeArgs(g, value));
    assert.equal(result.status, 1, result.stdout);
    assert.equal(report.errors[0]!.code, "INVALID_SCOPE");
    assert.match(report.errors[0]!.message, pattern);
  }
  for (const fixture of [f, g])
    assert.equal(existsSync(join(fixture.root, ".repo-standards")), false);
});

test("updates move an optional declaration between scope and no scope, and carry no scope forward", async (t) => {
  const f = await optionalFixture(t);
  const root = f.root;
  // Without noScope, an optional declaration's empty scope is
  // repository-wide, as any other's.
  const empty = adopt(f, scopeArgs(f, proposal("empty")));
  assert.ok(ran(empty.run).includes("hosting/fixes/hosting-fix"));
  assert.deepEqual(covering(f), [
    ["hosting", "repository"],
    ["tracker", "repository"],
  ]);

  // Into no scope: its rules and their index entry go, and it runs nothing.
  const none = adopt(f, scopeArgs(f, proposal("none")));
  assert.deepEqual(
    none.inspection.contextualChanges?.find(({ id }) => id === "hosting")
      ?.changes,
    ["rules", "operations", "scope"],
  );
  assert.equal(
    existsSync(join(root, ".repo-standards/rules/hosting.md")),
    false,
  );
  assert.doesNotMatch(rulesIndex(f), /hosting/);
  assert.ok(!ran(none.run).some((name) => name.startsWith("hosting/")));
  assert.deepEqual(covering(f), [["tracker", "repository"]]);

  // The confirmed no scope, carried forward unchanged, changes nothing: with
  // their rules and scoped files unchanged, the update reuses every recorded
  // assessment and completes after its checks.
  const carried = scopeArgs(
    f,
    f.json<Status>(["status", "--json"]).report.scopeProposal!,
  );
  const inspection = f.inspect(carried);
  assert.equal(inspection.updateClass, "exact");
  const again = f.json<Run>(startArgs(inspection.identity, carried));
  assert.equal(again.report.outcome, "complete", again.result.stdout);
  assert.deepEqual(
    again.report.reused.map((answer) => answer.id),
    ["assessment:hosting", "assessment:tracker"],
  );
  commit(root);
  assert.equal(
    existsSync(join(root, ".repo-standards/rules/hosting.md")),
    false,
  );

  // Into a concrete scope: its rules cover it and its operations run.
  mkdirSync(join(root, "docs"), { recursive: true });
  const scoped = adopt(f, scopeArgs(f, proposal(["docs/hosting.md"])), () =>
    writeFileSync(join(root, "docs/hosting.md"), "# Hosting\n"),
  );
  assert.deepEqual(
    scoped.inspection.contextualChanges?.find(({ id }) => id === "hosting")
      ?.changes,
    ["rules", "operations", "scope"],
  );
  assert.ok(ran(scoped.run).includes("hosting/fixes/hosting-fix"));
  assert.ok(ran(scoped.run).includes("hosting/checks/hosting-check"));
  assert.equal(
    readFileSync(join(root, ".repo-standards/rules/hosting.md"), "utf8"),
    hostingRules,
  );
  assert.match(
    rulesIndex(f),
    /- \[`hosting`\]\(hosting\.md\) covers:\n {2}- `docs\/hosting\.md`\n/,
  );
  assert.deepEqual(covering(f, "docs/hosting.md"), [
    ["hosting", "path"],
    ["tracker", "repository"],
  ]);

  // Out of it again: governance ends, and the project keeps its file.
  const back = scopeArgs(
    f,
    {
      ...proposal("none"),
      declarations: proposal("none").declarations.map((entry) =>
        entry.id === "hosting"
          ? {
              ...entry,
              candidates: [
                ...entry.candidates,
                {
                  path: "docs/hosting.md",
                  decision: "exclude",
                  reason: "Hosting is no longer governed here.",
                  evidence: ["docs/hosting.md"],
                },
              ],
            }
          : entry,
      ),
    },
    inspectionArgs,
  );
  const out = adopt(f, back);
  assert.ok(!ran(out.run).some((name) => name.startsWith("hosting/")));
  assert.equal(
    existsSync(join(root, ".repo-standards/rules/hosting.md")),
    false,
  );
  assert.doesNotMatch(rulesIndex(f), /hosting/);
  assert.deepEqual(covering(f, "docs/hosting.md"), [["tracker", "repository"]]);
  assert.equal(
    readFileSync(join(root, "docs/hosting.md"), "utf8"),
    "# Hosting\n",
  );
});

// A discovery script that drafts no scope for its declaration.
const noScopeDraft = `import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify({ format: "repo-standards/scope/v2", declarations: [{
  id: input.declaration,
  coverage: "The project is not hosted.",
  candidates: [],
  unresolved: [],
  noScope: true,
}] }));
`;

function scripted(optional: boolean) {
  return {
    hosting: {
      kind: "repository",
      guidance: "guidance/hosting.md",
      rules: "rules/hosting.md",
      discovery: "discovery/hosting.md",
      ...(optional ? { optional: true } : {}),
      "discovery-script": (({ id: _id, ...declared }) => declared)(
        operation("draft", { script: "draft.mjs" }),
      ),
      checks: [operation("hosting-check", { script: "run.mjs" })],
    },
  };
}

const scriptedFiles = {
  "guidance/hosting.md": "Ask the maintainer about branch protection.",
  "discovery/hosting.md": "Include the hosting notes, if any.",
  "rules/hosting.md": hostingRules,
  "draft.mjs": noScopeDraft,
  "run.mjs": script,
};

test("a discovery script drafts no scope only for an optional declaration", async (t) => {
  const f = await adoptionFixture(t, cli, manifest(scripted(true)), {
    files: scriptedFiles,
    registry,
  });
  const drafted = f.inspect();
  assert.deepEqual(drafted.discovery!.draft!.declarations, [
    {
      id: "hosting",
      coverage: "The project is not hosted.",
      candidates: [],
      unresolved: [],
      noScope: true,
    },
  ]);
  const summary = f.run([
    ...inspectionArgs.filter((arg) => arg !== "--json"),
    "--summary",
  ]);
  assert.match(summary.stdout, /\| `hosting` \| no scope \| none \| none \|/);

  const g = await adoptionFixture(t, cli, manifest(scripted(false)), {
    files: scriptedFiles,
    registry,
  });
  const { result, report } = g.json<ErrorReport>(inspectionArgs);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(report.errors[0]!.code, "DISCOVERY_SCRIPT_FAILED");
  assert.match(
    report.errors[0]!.message,
    /PROTOCOL_ERROR.*proposes no scope, but hosting is not optional/,
  );
});

test("adopt accepts no scope for an optional declaration in its answers file", async (t) => {
  const f = await fixture(t, cli, scripted(true), { files: scriptedFiles });
  const template = f.adopt([source]).report;
  const scope = question(template, "scope:hosting");
  assert.deepEqual(scope.details, { unresolved: [], optional: true });
  assert.match(scope.context, /hosting is optional: .*answer noScope true/);
  assert.deepEqual(scope.answer, {
    coverage: "The project is not hosted.",
    candidates: [],
    unresolved: [],
    noScope: true,
  });
  const inspected = f.adopt(f.answer(template.answers)).report;
  assert.deepEqual(inspected.missing, ["inspection"]);
  const contextual = f.adopt(
    f.answer(inspected.answers, {
      inspection: question(inspected, "inspection").answer,
    }),
  ).report;
  assert.equal(contextual.outcome, "contextual", JSON.stringify(contextual));
  const assessment = question(contextual, "assessment:hosting");
  assert.deepEqual(assessment.details, {
    allowedTargets: { paths: [], directories: [] },
    noScope: true,
  });
  assert.match(assessment.context, /^hosting has no scope: /);
  const complete = f.adopt(
    f.answer(contextual.answers, {
      "assessment:hosting": {
        status: "satisfied",
        explanation: "The project is not hosted.",
        evidence: ["No hosting configuration exists."],
        scopeValidity: {
          afterFixes: review("No project file is about hosting."),
          current: review("No project file is about hosting."),
        },
      },
    }),
  ).report;
  assert.equal(complete.outcome, "complete", JSON.stringify(complete));
  assert.equal(existsSync(join(f.root, ".repo-standards/rules")), false);
});

test("adopt in a terminal offers no scope for an optional declaration and judges it by its scope reviews", async (t) => {
  const f = await fixture(t, cli, scripted(true), { files: scriptedFiles });
  const session = terminalSession(
    join(cli.root, "node_modules/.bin/repo-standards"),
    ["adopt", source],
    { cwd: f.root, env: f.env },
  );
  t.after(() => session.close());
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  assert.match(
    await session.expect(
      "hosting is optional. Does it have no scope, so that none of its rules install and none of its checks or fixes run? [Y/n]: ",
    ),
    /The discovery script drafted this scope\. It has no scope\.\nCoverage: The project is not hosted\.\n/,
  );
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect(
    "Before any contextual edit, does no project file belong in the scope of hosting? [Y/n]: ",
  );
  session.type("");
  // There is no contextual work to walk.
  const rest = await session.expect(
    "Now that the contextual work is done, does no project file belong in the scope of hosting? [Y/n]: ",
  );
  assert.doesNotMatch(rest, /Contextual work/);
  session.type("");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  const status = f.json<Status>(["status", "--json"]).report;
  const [judgment] = status.assessments![0]!.declarations as unknown as {
    id: string;
    status: string;
    scopeValidity: Record<string, { status: string; explanation: string }>;
  }[];
  assert.equal(judgment!.id, "hosting");
  assert.equal(judgment!.status, "satisfied");
  assert.match(
    judgment!.scopeValidity.current!.explanation,
    /no project file belongs in the declaration's scope/,
  );
  assert.equal(existsSync(join(f.root, ".repo-standards/rules")), false);
  // Its check never ran.
  assert.deepEqual(status.operations, []);
});
