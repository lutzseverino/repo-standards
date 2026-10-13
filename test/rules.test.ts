import type {
  CheckReport,
  Inspection,
  Lock,
  Run,
  RulesReport,
  SourceValidation,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { TestContext } from "node:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
import { adoptionFixture } from "./adoption-fixture.ts";

const cli = installCli();
const registry = await registryFixture(cli.root);
after(() => {
  registry.close();
  cli.close();
});

// Fixes change nothing, and each check reports the status CHECK_STATUS names.
const script = `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const fix = input.operation.phase === 'fixes';
console.log(JSON.stringify({format:'repo-standards/result/v2',status:fix?'unchanged':(process.env.CHECK_STATUS ?? 'passed'),message:fix?'Nothing to fix':'README checked'}));`;

const rules = {
  "rules/readme.md": "# README rules\n\nKeep the README short.\n",
  "rules/layout.md": "# Source layout rules\n\nOne module per file.\n",
  "rules/docs.md": "# Documentation rules\n\nEvery guide has a heading.\n",
  "rules/hosting.md": "# Hosting rules\n\nProtect the default branch.\n",
};

function review(explanation: string) {
  return {
    status: "valid",
    explanation,
    evidence: ["Reviewed the confirmed scope."],
    additionalPaths: [] as string[],
  };
}

async function contextualAdoption(t: TestContext) {
  const f = await adoptionFixture(
    t,
    cli,
    manifest({
      "project-readme": {
        kind: "file",
        target: "README.md",
        exact: "readme.md",
        rules: "rules/readme.md",
      },
      "source-layout": {
        kind: "repository",
        guidance: "guidance/layout.md",
        rules: "rules/layout.md",
        targets: { paths: ["Makefile"], directories: ["src"] },
      },
      docs: {
        kind: "repository",
        guidance: "guidance/docs.md",
        rules: "rules/docs.md",
        discovery: "discovery/docs.md",
      },
      hosting: {
        kind: "repository",
        guidance: "guidance/hosting.md",
        rules: "rules/hosting.md",
        discovery: "discovery/hosting.md",
      },
      licence: { kind: "file", target: "LICENSE", exact: "licence.txt" },
    }),
    {
      files: {
        "readme.md": "# Project\n",
        "licence.txt": "Licensed.\n",
        "guidance/layout.md": "Move stray modules into src once.",
        "guidance/docs.md": "Rename legacy guides once.",
        "guidance/hosting.md": "Ask the maintainer about branch protection.",
        "discovery/docs.md": "Find the guides.",
        "discovery/hosting.md": "Propose no paths.",
        ...rules,
      },
      project: {
        Makefile: "all:\n",
        "src/main.ts": "export {};\n",
        "docs/guide.md": "# Guide\n",
      },
      registry,
    },
  );
  const proposal = {
    format: "repo-standards/scope/v2",
    declarations: [
      {
        id: "docs",
        coverage: "The one guide is the project's documentation.",
        candidates: [
          {
            path: "docs/guide.md",
            decision: "include",
            reason: "The project's guide.",
            evidence: ["docs/guide.md"],
          },
        ],
        unresolved: [] as string[],
      },
      {
        id: "hosting",
        coverage: "Hosting rules govern no project file.",
        candidates: [],
        unresolved: [] as string[],
      },
    ],
  };
  const scopeFile = join(f.remote.support.root, "scope.json");
  writeFileSync(scopeFile, JSON.stringify(proposal));
  const args = [...inspectionArgs, "--scope", scopeFile];
  const inspection = f.inspect(args);
  const started = f.json<Run>(startArgs(inspection.identity, args));
  assert.equal(started.report.phase, "contextual", started.result.stdout);
  const assessmentFile = join(f.remote.support.root, "assessment.json");
  const satisfied = (id: string, discovered: boolean) => ({
    id,
    status: "satisfied",
    explanation: "Nothing to change.",
    evidence: ["Reviewed the guidance."],
    ...(discovered
      ? {
          scopeValidity: {
            afterFixes: review("The scope still holds."),
            current: review("The scope still holds."),
          },
        }
      : {}),
  });
  writeFileSync(
    assessmentFile,
    JSON.stringify({
      format: "repo-standards/assessment/v3",
      declarations: [
        satisfied("docs", true),
        satisfied("hosting", true),
        satisfied("source-layout", false),
      ],
    }),
  );
  const complete = f.json<Run>(["resume", "--assessment", assessmentFile]);
  assert.equal(complete.report.outcome, "complete", complete.result.stdout);
  return f;
}

test("adoption installs each declaration's rules with an index of what they cover, and rules prints those covering a path", async (t) => {
  const f = await contextualAdoption(t);
  const root = f.project.root;
  const installed = {
    "project-readme": rules["rules/readme.md"],
    "source-layout": rules["rules/layout.md"],
    docs: rules["rules/docs.md"],
    hosting: rules["rules/hosting.md"],
  };
  const lock = JSON.parse(
    readFileSync(join(root, ".repo-standards/lock.json"), "utf8"),
  ) as Lock;
  for (const [id, content] of Object.entries(installed)) {
    const path = `.repo-standards/rules/${id}.md`;
    assert.equal(readFileSync(join(root, path), "utf8"), content);
    assert.ok(lock.files[path], path);
  }
  assert.equal(
    existsSync(join(root, ".repo-standards/rules/licence.md")),
    false,
  );
  assert.ok(lock.files[".repo-standards/rules/README.md"]);
  const index = readFileSync(
    join(root, ".repo-standards/rules/README.md"),
    "utf8",
  );
  assert.equal(
    index,
    `# Installed rules

These rules come from https://github.com/alice/standards v1.0.0, profile work.
Repository Standards installs and verifies them; adopt again to change them.
Run \`repo-standards rules <path>\` to print the rules that cover a path.

- [\`docs\`](docs.md) covers:
  - \`docs/guide.md\`
- [\`hosting\`](hosting.md) covers the whole repository.
- [\`project-readme\`](project-readme.md) covers:
  - \`README.md\`
- [\`source-layout\`](source-layout.md) covers:
  - \`Makefile\`
  - \`src/\` and everything beneath it
`,
  );

  const lookup = (path: string, cwd = root) => {
    const result = cli.run(["rules", path, "--json"], cwd, f.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout) as RulesReport;
  };
  const covering = (report: RulesReport) =>
    report.rules.map(({ declaration, coverage }) => [declaration, coverage]);
  assert.deepEqual(covering(lookup("src/nested/main.ts")), [
    ["hosting", "repository"],
    ["source-layout", "directory"],
  ]);
  assert.deepEqual(covering(lookup("README.md")), [
    ["hosting", "repository"],
    ["project-readme", "path"],
  ]);
  const guide = lookup("guide.md", join(root, "docs"));
  assert.equal(guide.path, "docs/guide.md");
  assert.deepEqual(covering(guide), [
    ["docs", "path"],
    ["hosting", "repository"],
  ]);
  // A name that merely starts with two dots is inside the project.
  assert.deepEqual(covering(lookup("..config")), [["hosting", "repository"]]);
  const uncovered = lookup("LICENSE");
  assert.deepEqual(uncovered.rules, [
    {
      declaration: "hosting",
      coverage: "repository",
      path: ".repo-standards/rules/hosting.md",
      content: installed.hosting,
    },
  ]);

  const text = cli.run(["rules", "Makefile"], root, f.env);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(
    text.stdout,
    `Rules covering Makefile:

## hosting (.repo-standards/rules/hosting.md), the whole repository

${installed.hosting}
## source-layout (.repo-standards/rules/source-layout.md), covering Makefile

${installed["source-layout"]}`,
  );
  const outside = cli.run(["rules", "../elsewhere.md"], root, f.env);
  assert.equal(outside.status, 2, outside.stdout);
  assert.match(outside.stderr, /\[USAGE\].*inside the project/);
});

async function exactAdoption(t: TestContext) {
  const declarations = {
    "project-readme": {
      kind: "file",
      target: "README.md",
      exact: "readme.md",
      rules: "rules/readme.md",
      checks: [operation("readme-shape")],
    },
    contributing: {
      kind: "file",
      target: "CONTRIBUTING.md",
      exact: "contributing.md",
      rules: "rules/contributing.md",
    },
  };
  const f = await adoptionFixture(t, cli, manifest(declarations), {
    files: {
      "readme.md": "# Project\n",
      "contributing.md": "# Contributing\n",
      "rules/readme.md": rules["rules/readme.md"],
      "rules/contributing.md": "# Contribution rules\n",
      "run.mjs": script,
    },
    registry,
  });
  return { ...f, declarations };
}

test("a failed check names its declaration's installed rules, in a run and in check", async (t) => {
  const f = await exactAdoption(t);
  const inspection = f.inspect();
  const failing = { ...f.env, CHECK_STATUS: "failed" };
  const stopped = f.json<Run>(startArgs(inspection.identity), failing);
  assert.equal(stopped.report.outcome, "incomplete", stopped.result.stdout);
  assert.match(
    stopped.report.reason,
    /^CHECKS_FAILED: .*project-readme\/readme-shape \(rules: \.repo-standards\/rules\/project-readme\.md\)/,
  );

  const g = await exactAdoption(t);
  const adopted = g.json<Run>(startArgs(g.inspect().identity));
  assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
  commit(g.project.root);
  const checked = g.json<CheckReport>(["check", "--json"], {
    ...g.env,
    CHECK_STATUS: "failed",
  });
  assert.equal(checked.result.status, 1);
  assert.deepEqual(
    checked.report.checks.map(({ id, status, rules }) => [id, status, rules]),
    [["readme-shape", "failed", ".repo-standards/rules/project-readme.md"]],
  );
  const passing = g.json<CheckReport>(["check", "--json"]);
  assert.equal(passing.report.checks[0]!.rules, null);
  const summary = g.run(["check"], { ...g.env, CHECK_STATUS: "failed" });
  assert.match(
    summary.stdout,
    /failed {2}project-readme\/readme-shape: README checked Rules: \.repo-standards\/rules\/project-readme\.md Output: /,
  );
});

test("an update that removes a declaration removes its rules and its index entry", async (t) => {
  const f = await exactAdoption(t);
  const adopted = f.json<Run>(startArgs(f.inspect().identity));
  assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
  commit(f.project.root);
  const root = f.project.root;
  assert.ok(existsSync(join(root, ".repo-standards/rules/contributing.md")));

  const { contributing: _removed, ...remaining } = f.declarations;
  f.remote.addVersion("v2.0.0", manifest(remaining));
  const args = inspectionArgs.map((arg) => (arg === "v1.0.0" ? "v2.0.0" : arg));
  const inspection = f.json<Inspection>(args).report;
  const updated = f.json<Run>(startArgs(inspection.identity, args));
  assert.equal(updated.report.outcome, "complete", updated.result.stdout);
  assert.equal(
    existsSync(join(root, ".repo-standards/rules/contributing.md")),
    false,
  );
  assert.equal(
    readFileSync(join(root, ".repo-standards/rules/project-readme.md"), "utf8"),
    rules["rules/readme.md"],
  );
  const lock = JSON.parse(
    readFileSync(join(root, ".repo-standards/lock.json"), "utf8"),
  ) as Lock;
  assert.deepEqual(
    Object.keys(lock.files).filter((path) =>
      path.startsWith(".repo-standards/rules/"),
    ),
    [
      ".repo-standards/rules/project-readme.md",
      ".repo-standards/rules/README.md",
    ],
  );
  const index = readFileSync(
    join(root, ".repo-standards/rules/README.md"),
    "utf8",
  );
  assert.match(index, /v2\.0\.0/);
  assert.doesNotMatch(index, /contributing/);
  const uncovered = f.json<RulesReport>(["rules", "CONTRIBUTING.md", "--json"]);
  assert.deepEqual(uncovered.report.rules, []);
  const text = f.run(["rules", "CONTRIBUTING.md"]);
  assert.equal(text.stdout, "No installed rules cover CONTRIBUTING.md.\n");

  // Every rules file is gone once no declaration has rules.
  f.remote.addVersion(
    "v3.0.0",
    manifest({
      "project-readme": {
        kind: "file",
        target: "README.md",
        exact: "readme.md",
      },
    }),
  );
  commit(root);
  const third = inspectionArgs.map((arg) =>
    arg === "v1.0.0" ? "v3.0.0" : arg,
  );
  const last = f.json<Run>(
    startArgs(f.json<Inspection>(third).report.identity, third),
  );
  assert.equal(last.report.outcome, "complete", last.result.stdout);
  assert.equal(existsSync(join(root, ".repo-standards/rules")), false);
});

test("rules reads only a complete adoption", (t) => {
  const project = sourceFixture("", { "README.md": "Project" });
  t.after(() => project.close());
  commit(project.root);
  const result = cli.run(["rules", "README.md", "--json"], project.root);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(
    (JSON.parse(result.stdout) as { errors: { code: string }[] }).errors[0]!
      .code,
    "NO_SELECTION",
  );
});

test("source validation accepts rules on file and repository declarations, and rejects them on a skill or when missing", (t) => {
  const valid = sourceFixture(
    manifest({
      exact: {
        kind: "file",
        target: "README.md",
        exact: "readme.md",
        rules: "rules/readme.md",
      },
      contextual: {
        kind: "file",
        target: "CONTRIBUTING.md",
        guidance: "guidance.md",
        rules: "rules/contributing.md",
      },
      tree: {
        kind: "repository",
        guidance: "guidance.md",
        rules: "rules/tree.md",
        targets: { paths: [], directories: ["src"] },
      },
      discovered: {
        kind: "repository",
        guidance: "guidance.md",
        rules: "rules/tree.md",
        discovery: "discovery.md",
      },
    }),
    {
      "readme.md": "# Project",
      "guidance.md": "Once.",
      "discovery.md": "Find it.",
      "rules/readme.md": "Lasting.",
      "rules/contributing.md": "Lasting.",
      "rules/tree.md": "Lasting.",
    },
  );
  t.after(() => valid.close());
  const accepted = cli.run(["source", "validate", "--json"], valid.root);
  assert.equal(accepted.status, 0, accepted.stdout);
  const report = JSON.parse(accepted.stdout) as SourceValidation;
  assert.deepEqual(
    report.profiles["work"]!.declarations.map((declaration) => [
      declaration.id,
      "rules" in declaration ? declaration.rules : undefined,
    ]),
    [
      ["contextual", "rules/contributing.md"],
      ["discovered", "rules/tree.md"],
      ["exact", "rules/readme.md"],
      ["tree", "rules/tree.md"],
    ],
  );

  const invalid = sourceFixture(
    manifest({
      skill: {
        kind: "skill",
        name: "review",
        source: "skill",
        rules: "rules.md",
      },
      missing: {
        kind: "file",
        target: "README.md",
        exact: "readme.md",
        rules: "rules/missing.md",
      },
      readme: {
        kind: "file",
        target: "docs/README.md",
        exact: "readme.md",
        rules: "rules.md",
      },
    }),
    { "skill/SKILL.md": "# Review", "readme.md": "# Project", "rules.md": "" },
  );
  t.after(() => invalid.close());
  const rejected = cli.run(["source", "validate", "--json"], invalid.root);
  assert.equal(rejected.status, 1, rejected.stdout);
  assert.deepEqual(
    (JSON.parse(rejected.stdout) as SourceValidation).errors.map(
      ({ code, path }) => [code, path],
    ),
    [
      ["UNKNOWN_FIELD", "/defaults/declarations/skill/rules"],
      ["MISSING_REFERENCE", "/defaults/declarations/missing/rules"],
      ["RESERVED_NAME", "/defaults/declarations/readme/rules"],
    ],
  );
});
