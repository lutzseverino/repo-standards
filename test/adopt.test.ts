import type {
  AdoptReport,
  AnswersFile,
  ErrorReport,
  PackageManifest,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { directoryFixture, installCli, snapshot } from "./installed-cli.ts";
import { adoptionFixture } from "./adoption-fixture.ts";
import { commit, manifest, operation } from "./remote-fixture.ts";

const cli = installCli();
after(() => cli.close());

const source = "https://github.com/alice/standards";
const rules = "README.md starts with a top-level heading naming the project.\n";
const guidance =
  "Describe the project in README.md under a top-level heading.\n";
const reason = "Sign in to the hosting platform.";

// A readme check that passes once README.md starts with a heading, a probe
// that is ready once its marker exists outside the project, and remote setup
// that records each application outside it, as a hosting platform would.
const files = {
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
async function fixture(
  t: TestContext,
  declarations: object,
  options: {
    files?: Record<string, string>;
    project?: Record<string, string>;
    profiles?: Record<string, object>;
  } = {},
) {
  const external = directoryFixture("repo-standards-adopt-");
  t.after(() => external.close());
  const f = await adoptionFixture(
    t,
    cli,
    manifest(declarations, options.profiles),
    {
      files: options.files ?? files,
      project: options.project ?? {
        "AGENTS.md": "Local agent notes\n",
        "README.md": "Project notes\n",
      },
    },
  );
  // Publishes the release list, one page per list of tags. A full page of
  // 100 releases leads to the next.
  const releases = (...pages: (string | string[])[]) => {
    const lists =
      typeof pages[0] === "string"
        ? [pages as string[]]
        : (pages as string[][]);
    lists.forEach((tags, index) => {
      f.remote.responses[
        `${f.remote.prefix}/releases?per_page=100&page=${index + 1}`
      ] = {
        body: tags.map((tag) => ({
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

const question = (report: AdoptReport, id: string) =>
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

function readmeSource(external: string) {
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

test("adopt without an answers file prints a complete template and changes nothing", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-source-");
  t.after(() => outside.close());
  // The project also holds its own copy of the system skill, which the run
  // replaces whole.
  const f = await fixture(t, readmeSource(outside.root), {
    profiles: { work: {}, personal: { "project-readme": { exclude: true } } },
    project: {
      "AGENTS.md": "Local agent notes\n",
      "README.md": "Project notes\n",
      ".agents/skills/repository-standards/SKILL.md": "# Local copy\n",
    },
  });
  f.remote.publish("v1.1.0");
  f.releases("v1.0.0", "v1.1.0");
  const before = snapshot(f.root);

  // Before a profile is chosen, the template asks for the version, proposing
  // the newest stable release, and for the profile.
  const staged = f.adopt([source]);
  assert.equal(
    staged.result.status,
    0,
    staged.result.stdout + staged.result.stderr,
  );
  assert.equal(staged.report.outcome, "answers-required");
  assert.deepEqual(
    staged.report.answers.questions.map(({ id, answer }) => [id, answer]),
    [
      ["version", "v1.1.0"],
      ["profile", null],
    ],
  );
  assert.deepEqual(question(staged.report, "version").choices, [
    "v1.1.0",
    "v1.0.0",
  ]);
  assert.deepEqual(question(staged.report, "profile").choices, [
    { name: "work", description: "work" },
    { name: "personal", description: "personal" },
  ]);
  assert.deepEqual(staged.report.missing, ["profile"]);

  // With the profile, it holds every question the selection asks: remote
  // setup that is not ready, and the confirmation of a discarded edit.
  const { result, report } = f.adopt([source, "--profile", "work"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.outcome, "answers-required");
  assert.deepEqual(report.selection, {
    cli: cli.version,
    source,
    version: "v1.1.0",
    profile: "work",
  });
  assert.deepEqual(
    report.answers.questions.map(({ id, answer }) => [id, answer]),
    [
      ["version", "v1.1.0"],
      ["profile", "work"],
      ["remote-setup", null],
      ["confirmation", null],
    ],
  );
  assert.deepEqual(question(report, "remote-setup").choices, [
    "defer",
    "resolve",
  ]);
  assert.deepEqual(question(report, "remote-setup").details, [
    { declaration: "agent-guidance", id: "labels", reason },
  ]);
  assert.deepEqual(question(report, "confirmation").details, {
    identity: report.inspection!.identity,
    targets: [".agents/skills/repository-standards", "AGENTS.md"],
  });
  assert.deepEqual(report.missing, ["remote-setup", "confirmation"]);
  // A replaced skill has no file diff; what replaces it is named instead.
  assert.deepEqual(report.discarded![0], {
    target: ".agents/skills/repository-standards",
    files: [],
    replacement: "this CLI's packaged repository-standards skill",
  });
  assert.match(report.discarded![1]!.files[0]!.diff!, /-Local agent notes/);
  assert.ok(report.nextSteps.length > 2);

  // An agent reads it as Markdown: the inspection, the discarded edit, the
  // answers file, and the next steps.
  const text = f.run(["adopt", source, "--profile", "work"]);
  assert.equal(text.status, 0, text.stderr);
  for (const heading of [
    "# Repository Standards adoption",
    "## Repository Standards adoption proposal",
    "### Selection",
    "## Discarded edits",
    "## Answers file",
    "## Next steps",
  ])
    assert.ok(
      text.stdout.includes(`\n${heading}\n`) ||
        text.stdout.startsWith(`${heading}\n`),
      heading,
    );
  assert.match(text.stdout, /"format": "repo-standards\/answers\/v1"/);
  assert.match(
    text.stdout,
    new RegExp(
      `npx @lutzseverino/repo-standards@${cli.version.replaceAll(".", "\\.")} adopt --answers`,
    ),
  );
  assert.deepEqual(snapshot(f.root), before);

  // A project without an adoption needs a source.
  const unnamed = f.run(["adopt"]);
  assert.equal(unnamed.status, 2, unnamed.stderr);
  assert.match(unnamed.stderr, /\[USAGE\] Name the standards source/);
  assert.equal(f.run(["adopt", source, "--answer", "x"]).status, 2);
  // Like inspection, adopt accepts only public GitHub sources.
  const local = f.run(["adopt", f.remote.source.root, "--json"]);
  assert.equal(local.status, 1);
  assert.equal(
    (JSON.parse(local.stdout) as ErrorReport).errors[0]!.code,
    "UNSUPPORTED_SOURCE",
  );
});

test("an answers file adopts through missing answers, confirmation, contextual work and completion with the pinned CLI", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-source-");
  t.after(() => outside.close());
  const f = await fixture(t, readmeSource(outside.root));
  const template = f.adopt([source]).report;
  const identity = template.inspection!.identity;
  const before = snapshot(f.root);

  // An incomplete answers file names its missing answers and changes nothing.
  const incomplete = f.adopt(
    f.answer(template.answers, { "remote-setup": "defer" }),
  );
  assert.equal(incomplete.result.status, 1);
  assert.equal(incomplete.report.outcome, "answers-required");
  assert.deepEqual(incomplete.report.missing, ["confirmation"]);
  assert.deepEqual(snapshot(f.root), before);

  // A continuation command quotes an answers path the shell would split.
  const spaced = join(f.external.root, "review notes");
  mkdirSync(spaced);
  writeFileSync(
    join(spaced, "answers.json"),
    readFileSync(f.answersPath, "utf8"),
  );
  const quoted = f.adopt(["--answers", join(spaced, "answers.json")]);
  assert.deepEqual(quoted.report.missing, ["confirmation"]);
  assert.ok(
    quoted.report.nextSteps.some((step) =>
      step.includes(`adopt --answers '${join(spaced, "answers.json")}'`),
    ),
    quoted.report.nextSteps.join("\n"),
  );

  // A confirmation naming another inspection confirms nothing.
  const stale = f.adopt(
    f.answer(template.answers, {
      "remote-setup": "defer",
      confirmation: `sha256:${"0".repeat(64)}`,
    }),
  );
  assert.equal(stale.result.status, 1);
  assert.deepEqual(stale.report.missing, ["confirmation"]);
  assert.match(
    question(stale.report, "confirmation").context,
    /changed since that confirmation/,
  );
  assert.deepEqual(snapshot(f.root), before);

  // Answering resolve stops before anything is written.
  const resolve = f.adopt(
    f.answer(template.answers, {
      "remote-setup": "resolve",
      confirmation: identity,
    }),
  );
  assert.equal(resolve.result.status, 1);
  assert.equal(resolve.report.outcome, "blocked");
  assert.deepEqual(resolve.report.missing, []);
  assert.deepEqual(snapshot(f.root), before);

  // An answer of the wrong kind, and a flag the answers file contradicts, are
  // rejected.
  const malformed = f.adopt(
    f.answer(template.answers, { "remote-setup": "later" }),
  );
  assert.equal(malformed.result.status, 1);
  assert.equal(
    (malformed.report as unknown as ErrorReport).errors[0]!.code,
    "ANSWERS_FORMAT",
  );
  assert.equal(
    f.run(["adopt", ...f.answer(template.answers), "--profile", "other"])
      .status,
    2,
  );
  assert.deepEqual(snapshot(f.root), before);

  // An answers file inside the project would change it.
  writeFileSync(join(f.root, "answers.json"), "{}");
  const inside = f.run(["adopt", "--answers", "answers.json", "--json"]);
  assert.equal(inside.status, 1);
  assert.equal(
    (JSON.parse(inside.stdout) as ErrorReport).errors[0]!.code,
    "ANSWERS_LOCATION",
  );
  rmSync(join(f.root, "answers.json"));

  // With the confirmed identity, the run starts, defers the remote setup,
  // and returns the contextual declaration with its rules and guidance.
  const answers = f.answer(template.answers, {
    "remote-setup": "defer",
    confirmation: identity,
  });
  const contextual = f.adopt(answers);
  assert.equal(contextual.result.status, 1, contextual.result.stdout);
  assert.equal(contextual.report.outcome, "contextual");
  assert.deepEqual(contextual.report.contextual, [
    {
      id: "project-readme",
      allowedTargets: { paths: ["README.md"], directories: [] },
      rules: {
        path: ".repo-standards/rules/project-readme.md",
        content: rules,
      },
      guidance: {
        path: ".repo-standards/inputs/source/guidance/readme.md",
        content: guidance,
      },
    },
  ]);
  assert.deepEqual(contextual.report.missing, ["assessment:project-readme"]);
  assert.equal(
    readFileSync(join(f.root, "AGENTS.md"), "utf8"),
    "Standard agent guidance\n",
  );
  assert.ok(
    contextual.report.nextSteps.some((step) =>
      step.includes(
        ".repo-standards/runtime/node_modules/.bin/repo-standards adopt --answers",
      ),
    ),
  );

  // The pinned runtime holds the exact CLI that ran, and the selection
  // records it. The adoption skill is no longer installed.
  const runtime = JSON.parse(
    readFileSync(
      join(
        f.root,
        ".repo-standards/runtime/node_modules/@lutzseverino/repo-standards/package.json",
      ),
      "utf8",
    ),
  ) as PackageManifest;
  assert.equal(runtime.version, cli.version);
  const selection = parse(
    readFileSync(join(f.root, ".repo-standards/selection.yaml"), "utf8"),
  ) as { cli: { version: string } };
  assert.equal(selection.cli.version, cli.version);
  assert.equal(
    existsSync(join(f.root, ".agents/skills/adopt-standards")),
    false,
  );
  assert.equal(
    existsSync(join(f.root, ".claude/skills/adopt-standards")),
    false,
  );
  assert.ok(
    existsSync(join(f.root, ".agents/skills/repository-standards/SKILL.md")),
  );

  // Without an assessment the run keeps waiting.
  const waiting = f.adopt(answers, true);
  assert.equal(waiting.report.outcome, "contextual");
  assert.deepEqual(waiting.report.missing, ["assessment:project-readme"]);

  // The active run adopts only its own selection.
  const other = f.adopt(
    [...f.answer(waiting.report.answers), "--profile", "personal"],
    true,
  );
  assert.equal(other.result.status, 1);
  assert.equal(
    (other.report as unknown as ErrorReport).errors[0]!.code,
    "ACTIVE_RUN",
  );

  // A failed check names the installed rules it cites, and the answers stay.
  const assessment = {
    status: "satisfied",
    explanation: "README.md now names the project under a top-level heading.",
    evidence: ["README.md"],
  };
  const submission = f.answer(waiting.report.answers, {
    "assessment:project-readme": assessment,
  });
  const failed = f.adopt(submission, true);
  assert.equal(failed.result.status, 1);
  assert.equal(failed.report.outcome, "contextual");
  assert.match(
    failed.report.run!.reason,
    /CHECKS_FAILED: .*project-readme\/heading \(rules: \.repo-standards\/rules\/project-readme\.md\)/,
  );
  assert.deepEqual(failed.report.failedChecks, [
    {
      declaration: "project-readme",
      id: "heading",
      message: "README.md has no top-level heading.",
    },
  ]);
  assert.deepEqual(
    question(failed.report, "assessment:project-readme").answer,
    assessment,
  );
  assert.deepEqual(failed.report.missing, []);

  // Submitting the same answers again reruns the checks, and only the latest
  // round's failures are reported.
  const again = f.adopt(submission, true);
  assert.equal(again.report.outcome, "contextual");
  assert.equal(again.report.failedChecks!.length, 1);

  // Once the content satisfies the rules, the same answers complete it.
  writeFileSync(join(f.root, "README.md"), "# Project\n\nProject notes\n");
  const complete = f.adopt(submission, true);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.equal(complete.report.outcome, "complete");
  const status = JSON.parse(
    spawnSync(f.pinned, ["status", "--json"], {
      cwd: f.root,
      env: f.env,
      encoding: "utf8",
    }).stdout,
  ) as Status & { readyToCommit: boolean };
  assert.equal(status.readyToCommit, true);
  assert.equal(
    status.assessments![0]!.declarations[0]!.explanation,
    assessment.explanation,
  );
  assert.deepEqual(status.deferred, [
    { declaration: "agent-guidance", id: "labels", reason },
  ]);
});

test("adopt without a source updates an adopted project, offering the newest stable release", async (t) => {
  const f = await fixture(
    t,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
      },
    },
    { project: { "README.md": "Project notes\n" } },
  );
  const first = f.adopt([source]).report;
  assert.deepEqual(first.missing, []);
  const adopted = f.adopt(f.answer(first.answers));
  assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
  commit(f.root);

  f.remote.addVersion(
    "v1.1.0",
    readFileSync(join(f.remote.source.root, "standards.yaml"), "utf8"),
    { "content/AGENTS.md": "Updated agent guidance\n" },
  );
  // The newest 100 releases are prereleases; the stable ones follow on the
  // next page of the release list.
  f.releases(
    Array.from({ length: 100 }, (_, index) => `v2.0.0-rc.${100 - index}`),
    ["v1.1.0", "v1.0.0"],
  );
  const update = f.adopt([]);
  assert.equal(update.result.status, 0, update.result.stderr);
  assert.deepEqual(update.report.selection, {
    cli: cli.version,
    source,
    version: "v1.1.0",
    profile: "work",
  });
  assert.deepEqual(question(update.report, "version").choices, [
    "v1.1.0",
    "v1.0.0",
  ]);
  assert.match(
    question(update.report, "version").context,
    /adopts v1\.0\.0 now/,
  );
  const updated = f.adopt(f.answer(update.report.answers));
  assert.equal(updated.report.outcome, "complete", updated.result.stdout);
  assert.equal(
    readFileSync(join(f.root, "AGENTS.md"), "utf8"),
    "Updated agent guidance\n",
  );
  const selection = parse(
    readFileSync(join(f.root, ".repo-standards/selection.yaml"), "utf8"),
  ) as { standards: { version: string } };
  assert.equal(selection.standards.version, "v1.1.0");
});

const discovery = "Projects have a package manifest; fixtures do not count.";

// A source whose discovery script drafts the app's README with the given open
// questions, and a project with an app, a fixture and tools.
async function discoveryFixture(t: TestContext, unresolved: string[]) {
  const f = await fixture(
    t,
    {
      "project-docs": {
        kind: "repository",
        guidance: "guidance.md",
        discovery: "discovery.md",
        "discovery-script": (({ id: _id, ...declared }) => declared)(
          operation("draft", { script: "draft.mjs" }),
        ),
      },
    },
    {
      files: {
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

test("adopt asks a discovery script's open questions as answers-file fields and starts once they are answered", async (t) => {
  const { f, draft } = await discoveryFixture(t, [
    "Is tools a maintained project?",
  ]);
  const before = snapshot(f.root);
  const template = f.adopt([source]).report;
  const scope = question(template, "scope:project-docs");
  assert.deepEqual(scope.answer, draft);
  assert.deepEqual(scope.details, {
    unresolved: ["Is tools a maintained project?"],
  });
  assert.deepEqual(template.missing, ["scope:project-docs"]);
  assert.equal(template.discovery![0]!.discovery.content, discovery);

  // An answer with an open question is still missing.
  const open = f.adopt(f.answer(template.answers));
  assert.equal(open.result.status, 1);
  assert.deepEqual(open.report.missing, ["scope:project-docs"]);
  assert.deepEqual(snapshot(f.root), before);

  // A malformed entry is the proposal inspection rejects, never a start.
  const malformed = f.adopt(
    f.answer(template.answers, { "scope:project-docs": {} }),
  );
  assert.equal(malformed.result.status, 1);
  assert.equal(
    (malformed.report as unknown as ErrorReport).errors[0]!.code,
    "INVALID_SCOPE",
  );
  assert.deepEqual(snapshot(f.root), before);

  // Answered, the scope is confirmed and the run starts its contextual work.
  const answered = f.adopt(
    f.answer(template.answers, {
      "scope:project-docs": {
        ...draft,
        coverage: `${draft.coverage} Tools holds scripts, not a project.`,
        unresolved: [],
      },
    }),
  );
  assert.equal(answered.report.outcome, "contextual", answered.result.stdout);
  assert.deepEqual(answered.report.contextual![0]!.allowedTargets, {
    paths: ["app/README.md"],
    directories: [],
  });
  assert.equal(answered.report.contextual![0]!.discovery!.content, discovery);
  const text = spawnSync(f.pinned, ["adopt", "--answers", f.answersPath], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  }).stdout;
  assert.ok(text.includes(discovery), text);
  assert.match(
    question(answered.report, "assessment:project-docs").context,
    /scopeValidity/,
  );
});

test("an answers file confirms a fix's overwrite only with the run's inspection identity", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-setting-");
  t.after(() => outside.close());
  const log = join(outside.root, "settings.log");
  const message = "Overwrites the merge setting squash with rebase.";
  const f = await fixture(
    t,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        fixes: [
          operation("setting", { script: "setting.mjs", arguments: [log] }),
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
      },
      project: { "README.md": "Project notes\n" },
    },
  );
  const template = f.adopt([source]).report;
  const stopped = f.adopt(f.answer(template.answers));
  assert.equal(stopped.result.status, 1);
  assert.equal(stopped.report.outcome, "answers-required");
  const fix = question(stopped.report, "fix:agent-guidance/setting");
  assert.equal(fix.answer, null);
  assert.ok(fix.context.includes(message));
  assert.deepEqual(stopped.report.missing, ["fix:agent-guidance/setting"]);
  const { identity } = fix.details as { identity: string };

  // Another identity confirms nothing; the run's own identity reruns the fix
  // allowed to overwrite, and the run completes.
  const refused = f.adopt(
    f.answer(stopped.report.answers, {
      "fix:agent-guidance/setting": `sha256:${"0".repeat(64)}`,
    }),
    true,
  );
  assert.deepEqual(refused.report.missing, ["fix:agent-guidance/setting"]);
  assert.equal(existsSync(log), false);
  const confirmed = f.adopt(
    f.answer(stopped.report.answers, {
      "fix:agent-guidance/setting": identity,
    }),
    true,
  );
  assert.equal(confirmed.report.outcome, "complete", confirmed.result.stdout);
  assert.equal(readFileSync(log, "utf8"), "rebase\n");
});

test("a drafted scope without open questions is an answer only once the answers file carries it", async (t) => {
  const { f, draft } = await discoveryFixture(t, []);
  const before = snapshot(f.root);
  const template = f.adopt([source]).report;
  assert.deepEqual(question(template, "scope:project-docs").answer, draft);
  assert.deepEqual(template.missing, []);

  // An answers file written before the scope question was asked, such as
  // one from before the profile was chosen, does not answer it.
  const early = f.adopt(
    f.answer({
      ...template.answers,
      questions: template.answers.questions.filter(
        ({ id }) => id === "version" || id === "profile",
      ),
    }),
  );
  assert.equal(early.result.status, 1);
  assert.equal(early.report.outcome, "answers-required");
  assert.deepEqual(early.report.missing, ["scope:project-docs"]);
  assert.deepEqual(question(early.report, "scope:project-docs").answer, draft);
  assert.deepEqual(snapshot(f.root), before);

  // Carried back, the draft is the confirmed scope.
  const started = f.adopt(f.answer(early.report.answers));
  assert.equal(started.report.outcome, "contextual", started.result.stdout);
  assert.deepEqual(started.report.contextual![0]!.allowedTargets, {
    paths: ["app/README.md"],
    directories: [],
  });
});
