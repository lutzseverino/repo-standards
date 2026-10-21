import type { TestContext } from "node:test";
import type { AdoptReport, AnswersFile } from "./json-reports.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { directoryFixture } from "./installed-cli.ts";
import { adoptionFixture, type InstalledCli } from "./adoption-fixture.ts";
import { commit, manifest, operation } from "./remote-fixture.ts";

// The fixtures of the adopt tests: a published source, a committed project,
// and an answers file outside it.

export const source = "https://github.com/alice/standards";
export const rules =
  "README.md starts with a top-level heading naming the project.\n";
export const guidance =
  "Describe the project in README.md under a top-level heading.\n";
export const reason = "Sign in to the hosting platform.";

// A readme check that passes once README.md starts with a heading, a probe
// that is ready once its marker exists outside the project, and remote setup
// that records each application outside it, as a hosting platform would.
export const readmeFiles = {
  "content/AGENTS.md": "Standard agent guidance\n",
  "guidance/readme.md": guidance,
  "rules/readme.md": rules,
  "checks/readme.mjs": `import { readFileSync } from 'node:fs';
const heading = readFileSync('README.md', 'utf8').startsWith('# ');
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: heading ? 'passed' : 'failed', message: heading ? 'README.md has a heading.' : 'README.md has no top-level heading.' }));
`,
  "remote/probe.mjs": `import { existsSync } from 'node:fs';
console.log(JSON.stringify(existsSync(process.argv[2])
  ? { format: 'repo-standards/result/v2', status: 'ready', message: 'Signed in.' }
  : { format: 'repo-standards/result/v2', status: 'not-ready', message: ${JSON.stringify(reason)} }));
`,
  "remote/fix.mjs": `import { appendFileSync } from 'node:fs';
appendFileSync(process.argv[2], 'applied\\n');
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: 'changed', message: 'Labels created.' }));
`,
};

// A published source with stable releases, a committed project with its own
// agent notes and README, and the answers file's directory outside it.
export async function fixture(
  t: TestContext,
  cli: InstalledCli,
  declarations: object,
  options: {
    files?: Record<string, string>;
    project?: Record<string, string>;
    profiles?: Record<string, object>;
    http?: boolean;
  } = {},
) {
  const external = directoryFixture("repo-standards-adopt-");
  t.after(() => external.close());
  const f = await adoptionFixture(
    t,
    cli,
    manifest(declarations, options.profiles),
    {
      files: options.files ?? readmeFiles,
      project: options.project ?? {
        "AGENTS.md": "Local agent notes\n",
        "README.md": "Project notes\n",
      },
      http: options.http,
    },
  );
  // Publishes the release list, one page per list of tags. A full page of
  // releases links to the next.
  const releases = (...pages: (string | string[])[]) => {
    const lists =
      typeof pages[0] === "string"
        ? [pages as string[]]
        : (pages as string[][]);
    lists.forEach((tags, index) => {
      f.remote.responses[
        `${f.remote.prefix}/releases?per_page=100${index === 0 ? "" : `&page=${index + 1}`}`
      ] = {
        headers:
          index + 1 < lists.length
            ? {
                link: `<${f.remote.prefix}/releases?per_page=100&page=${index + 2}>; rel="next"`,
              }
            : {},
        body: tags.map((tag, tagIndex) => ({
          id: index * 100 + tagIndex + 1,
          name: null,
          published_at: "2026-10-01T00:00:00Z",
          tag_name: tag,
          draft: false,
          prerelease: /-/.test(tag),
        })),
      };
    });
    f.remote.save();
  };
  releases("v1.0.0");
  const answersPath = join(external.root, "answers.json");
  const pinned = join(
    f.root,
    ".repo-standards/runtime/node_modules/.bin/repo-standards",
  );
  // An adopt report, from this test's CLI or the project's pinned runtime.
  const adopt = (args: string[], runtime = false) => {
    const command = ["adopt", ...args, "--json"];
    const result = runtime
      ? spawnSync(pinned, command, {
          cwd: f.root,
          env: f.env,
          encoding: "utf8",
        })
      : f.run(command);
    let report: AdoptReport;
    try {
      report = JSON.parse(result.stdout) as AdoptReport;
    } catch {
      assert.fail(
        `adopt exited ${result.status}:\n${result.stdout}${result.stderr}`,
      );
    }
    return { result, report };
  };
  // Writes the answers file: a template with some answers changed.
  const answer = (
    template: AnswersFile,
    answers: Record<string, unknown> = {},
  ) => {
    writeFileSync(
      answersPath,
      JSON.stringify({
        ...template,
        questions: template.questions.map((question) =>
          Object.hasOwn(answers, question.id)
            ? { ...question, answer: answers[question.id] }
            : question,
        ),
      }),
    );
    return ["--answers", answersPath];
  };
  return { ...f, external, releases, adopt, answer, answersPath, pinned };
}

export const question = (report: AdoptReport, id: string) =>
  report.answers.questions.find((entry) => entry.id === id)!;

function remoteSetup(applied: string, marker: string) {
  return {
    ...operation("labels", { script: "remote/fix.mjs", arguments: [applied] }),
    "remote-setup": {
      probe: (({ id: _id, ...declared }) => declared)(
        operation("probe", { script: "remote/probe.mjs", arguments: [marker] }),
      ),
    },
  };
}

export function readmeSource(external: string) {
  return {
    "agent-guidance": {
      kind: "file",
      target: "AGENTS.md",
      exact: "content/AGENTS.md",
      fixes: [
        remoteSetup(join(external, "applied.log"), join(external, "ready")),
      ],
    },
    "project-readme": {
      kind: "file",
      target: "README.md",
      guidance: "guidance/readme.md",
      rules: "rules/readme.md",
      checks: [operation("heading", { script: "checks/readme.mjs" })],
    },
  };
}

export const discovery =
  "Projects have a package manifest; fixtures do not count.";

// A source whose discovery script drafts the app's README with the given open
// questions, and a project with an app, a fixture and tools.
export async function discoveryFixture(
  t: TestContext,
  cli: InstalledCli,
  unresolved: string[],
  // Declarations and source files beside the discovery declaration, the
  // source's profiles, and whether GitHub is served over local HTTP.
  others: {
    declarations?: object;
    files?: Record<string, string>;
    profiles?: Record<string, object>;
    http?: boolean;
  } = {},
) {
  const f = await fixture(
    t,
    cli,
    {
      "project-docs": {
        kind: "repository",
        guidance: "guidance.md",
        discovery: "discovery.md",
        "discovery-script": (({ id: _id, ...declared }) => declared)(
          operation("draft", { script: "draft.mjs" }),
        ),
      },
      ...others.declarations,
    },
    {
      files: {
        ...others.files,
        "guidance.md": "Document each maintained project.",
        "discovery.md": discovery,
        "draft.mjs": `import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify({ format: "repo-standards/scope/v2", declarations: [{
  id: input.declaration,
  coverage: "The app is maintained; the fixture is test data.",
  candidates: [
    { path: "app/README.md", decision: "include", reason: "Its manifest makes it a project.", evidence: ["app/package.json"] },
    { path: "fixtures/fake", decision: "exclude", reason: "Fixtures are test data.", evidence: ["fixtures/fake/package.json"] },
  ],
  unresolved: ${JSON.stringify(unresolved)},
}] }));
`,
      },
      project: {
        "app/package.json": "{}",
        "fixtures/fake/package.json": "{}",
        "tools/run.sh": "echo tools",
      },
      ...(others.profiles ? { profiles: others.profiles } : {}),
      ...(others.http ? { http: true } : {}),
    },
  );
  const draft = {
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
    unresolved,
  };
  return { f, draft };
}

// The fixtures of the update tests that reuse recorded answers.

export type ReuseFixture = Awaited<ReturnType<typeof discoveryFixture>>["f"];

export const docsRules = "Each maintained project has a README.\n";
export const draftScript = (
  coverage: string,
) => `import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify({ format: "repo-standards/scope/v2", declarations: [{
  id: input.declaration,
  coverage: ${JSON.stringify(coverage)},
  candidates: [
    { path: "app/README.md", decision: "include", reason: "Its manifest makes it a project.", evidence: ["app/package.json"] },
    { path: "fixtures/fake", decision: "exclude", reason: "Fixtures are test data.", evidence: ["fixtures/fake/package.json"] },
  ],
  unresolved: [],
}] }));
`;
export const coverage = "The app is maintained; the fixture is test data.";

// The discovery declaration with rules, beside an exact declaration with
// remote setup and a contextual README declaration with rules and a check.
function declarations(outside: string, readme: object = {}) {
  const sourced = readmeSource(outside);
  return {
    ...sourced,
    "project-readme": { ...sourced["project-readme"], ...readme },
    "project-docs": {
      kind: "repository",
      guidance: "guidance.md",
      discovery: "discovery.md",
      rules: "rules/docs.md",
      "discovery-script": (({ id: _id, ...declared }) => declared)(
        operation("draft", { script: "draft.mjs" }),
      ),
    },
  };
}

export async function reuseFixture(t: TestContext, cli: InstalledCli) {
  const outside = directoryFixture("repo-standards-reuse-");
  t.after(() => outside.close());
  const { f } = await discoveryFixture(t, cli, [], {
    declarations: declarations(outside.root),
    files: { ...readmeFiles, "rules/docs.md": docsRules },
  });
  // Publishes a later version whose source differs by the given files,
  // README declaration fields and profiles.
  const publish = (
    tag: string,
    files: Record<string, string>,
    readme: object = {},
    profiles?: Record<string, object>,
  ) => {
    f.remote.addVersion(
      tag,
      manifest(declarations(outside.root, readme), profiles),
      {
        ...readmeFiles,
        "rules/docs.md": docsRules,
        "guidance.md": "Document each maintained project.",
        "discovery.md":
          "Projects have a package manifest; fixtures do not count.",
        "draft.mjs": draftScript(coverage),
        ...files,
      },
    );
  };
  return { f, outside: outside.root, publish };
}

export const review = {
  status: "valid",
  explanation: "The app remains the only maintained project.",
  evidence: ["Reviewed app/package.json and the excluded fixture."],
  additionalPaths: [],
};
export const judgments = {
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

// Answers adopt's rounds, carrying each report's answers back with remote
// setup deferred, the given answers, and the current inspection, until the
// run starts or a round leaves the given question unanswered.
export function untilStarted(
  f: ReuseFixture,
  first: string[],
  answers: Record<string, unknown> = {},
  runtime = true,
) {
  let report = f.adopt(first, runtime).report;
  for (let round = 0; !report.run; round++) {
    assert.ok(round < 4, JSON.stringify(report.missing));
    report = f.adopt(
      f.answer(report.answers, {
        "remote-setup": "defer",
        ...answers,
        ...(report.inspection
          ? { inspection: report.inspection.identity }
          : {}),
      }),
      runtime,
    ).report;
  }
  return report;
}

// Completes a run waiting for contextual work with the given answers.
export function complete(
  f: ReuseFixture,
  report: AdoptReport,
  answers: Record<string, unknown>,
) {
  const completed = f.adopt(f.answer(report.answers, answers), true);
  assert.equal(
    completed.report.outcome,
    "complete",
    completed.result.stdout + completed.result.stderr,
  );
  commit(f.root);
  return completed.report;
}

// The first adoption, with its contextual work done and committed.
export function adoptFirst(f: ReuseFixture) {
  const started = untilStarted(f, [source], {}, false);
  assert.equal(started.outcome, "contextual", JSON.stringify(started));
  assert.deepEqual(started.reused, []);
  writeFileSync(join(f.root, "README.md"), "# Project\n\nProject notes\n");
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  return complete(f, started, judgments);
}
