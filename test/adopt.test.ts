import type {
  AdoptReport,
  ErrorReport,
  PackageManifest,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { directoryFixture, installCli, snapshot } from "./installed-cli.ts";
import { commit, git, operation } from "./remote-fixture.ts";
import {
  discovery,
  discoveryFixture,
  fixture,
  guidance,
  question,
  readmeSource,
  reason,
  rules,
  source,
} from "./adopt-fixture.ts";

const cli = installCli();
after(() => cli.close());

// The Selection section of a Markdown adoption report.
const selectionPart = (summary: string) =>
  summary.split("\n## ").find((part) => part.startsWith("Selection\n")) ?? "";

const stepCommands = (report: AdoptReport) =>
  report.nextSteps.flatMap((step) =>
    [...step.matchAll(/`([^`]+)`/g)].map((match) => match[1]!),
  );

test("adopt without an answers file prints a complete template and changes nothing", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-source-");
  t.after(() => outside.close());
  // The project also holds its own copy of the system skill, which the run
  // replaces whole.
  const f = await fixture(t, cli, readmeSource(outside.root), {
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
  assert.match(
    question(staged.report, "profile").context,
    /Choose from the profile descriptions, the maintainer's request, and repository evidence/,
  );
  assert.match(
    question(staged.report, "profile").context,
    /Ask the maintainer only when these do not settle it/,
  );
  assert.match(
    staged.report.nextSteps.join("\n"),
    /Make no project edits until the run starts/,
  );

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
      ["inspection", report.inspection!.identity],
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
  assert.doesNotMatch(report.inspection!.summary, /maintainer's confirmation/);
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
      `npx --yes @lutzseverino/repo-standards@${cli.version.replaceAll(".", "\\.")} adopt --answers`,
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

test("a start stopped before writing keeps the pre-start no-edit instruction", async (t) => {
  const f = await fixture(
    t,
    cli,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        checks: [
          operation("verify", {
            executable: "repo-standards-missing-tool",
            script: "checks/readme.mjs",
          }),
        ],
      },
    },
    { project: { "README.md": "# Project\n" } },
  );
  const template = f.adopt([source]).report;
  const before = snapshot(f.root);
  const stopped = f.adopt(f.answer(template.answers));
  assert.equal(stopped.result.status, 1, stopped.result.stdout);
  assert.equal(stopped.report.outcome, "blocked");
  assert.match(stopped.report.run!.reason, /PREREQUISITES_BLOCKED/);
  assert.match(
    stopped.report.nextSteps.join("\n"),
    /Make no project edits until the run starts/,
  );
  assert.deepEqual(snapshot(f.root), before);
});

test("adopt stops and tells the maintainer about an uncommitted project before a new run", async (t) => {
  const cases = [
    {
      name: "no commit",
      code: "NO_COMMIT",
      prepare: (root: string) => git(root, "update-ref", "-d", "HEAD"),
    },
    {
      name: "unstaged tracked changes",
      code: "DIRTY_PROJECT",
      prepare: (root: string) =>
        writeFileSync(join(root, "README.md"), "Pending work\n"),
    },
    {
      name: "staged changes",
      code: "DIRTY_PROJECT",
      prepare: (root: string) => {
        writeFileSync(join(root, "README.md"), "Staged work\n");
        git(root, "add", "README.md");
      },
    },
    {
      name: "untracked content",
      code: "DIRTY_PROJECT",
      prepare: (root: string) =>
        writeFileSync(join(root, "notes.md"), "Pending notes\n"),
    },
  ];
  for (const scenario of cases)
    await t.test(scenario.name, async (t) => {
      const f = await fixture(t, cli, {
        "agent-guidance": {
          kind: "file",
          target: "SHARED.md",
          exact: "content/AGENTS.md",
        },
      });
      scenario.prepare(f.root);
      const before = snapshot(f.root);
      const status = git(f.root, "status", "--porcelain=v1");

      const template = f.adopt([source]);
      assert.equal(template.result.status, 0, template.result.stdout);
      assert.equal(template.report.outcome, "answers-required");
      const answers = f.answer(template.report.answers);
      const blocked = f.adopt(answers);
      assert.equal(blocked.result.status, 1, blocked.result.stdout);
      assert.equal(blocked.report.outcome, "blocked");

      for (const { report } of [template, blocked]) {
        assert.ok(report.blockers.some(({ code }) => code === scenario.code));
        assert.equal(report.run, undefined);
        assert.match(
          report.nextSteps.join("\n"),
          /Make no project edits until the run starts/,
        );
        assert.match(report.nextSteps.at(-1)!, /Stop and tell the maintainer/);
        assert.match(report.nextSteps.at(-1)!, /clean, committed/);
        assert.doesNotMatch(
          report.nextSteps.join("\n"),
          /committing or reconciling|Run `.*adopt --answers/,
        );
      }
      // Markdown carries the same stop instruction as JSON, for both the
      // template and a fully answered request that cannot start.
      for (const args of [[source], answers]) {
        const text = f.run(["adopt", ...args]);
        assert.ok(text.stdout.includes(`\`${scenario.code}\``));
        assert.match(text.stdout, /Stop and tell the maintainer/);
      }
      assert.deepEqual(snapshot(f.root), before);
      assert.equal(git(f.root, "status", "--porcelain=v1"), status);
    });
});

test("adopt reports Git blockers before asking for a profile from a multi-profile source", async (t) => {
  for (const noCommit of [false, true])
    await t.test(noCommit ? "no commit" : "dirty tree", async (t) => {
      const f = await fixture(
        t,
        cli,
        {},
        {
          profiles: { work: {}, personal: {} },
        },
      );
      if (noCommit) git(f.root, "update-ref", "-d", "HEAD");
      else writeFileSync(join(f.root, "README.md"), "Pending work\n");
      const before = snapshot(f.root);
      const status = git(f.root, "status", "--porcelain=v1");
      const code = noCommit ? "NO_COMMIT" : "DIRTY_PROJECT";

      const { result, report } = f.adopt([source]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(report.outcome, "answers-required");
      assert.deepEqual(report.missing, ["profile"]);
      assert.equal(question(report, "profile").answer, null);
      assert.ok(report.blockers.some((blocker) => blocker.code === code));
      assert.equal(report.run, undefined);
      assert.match(report.nextSteps.at(-1)!, /Stop and tell the maintainer/);
      assert.match(
        report.nextSteps.at(-1)!,
        /Leave their pending work unchanged/,
      );
      assert.doesNotMatch(
        report.nextSteps.join("\n"),
        /Ask the maintainer each question|Run `.*adopt --answers/,
      );

      const text = f.run(["adopt", source]);
      assert.equal(text.status, 0, text.stderr);
      assert.ok(text.stdout.includes(`\`${code}\``));
      assert.match(text.stdout, /Stop and tell the maintainer/);
      assert.deepEqual(snapshot(f.root), before);
      assert.equal(git(f.root, "status", "--porcelain=v1"), status);
    });
});

test("self-adoption answer rounds use an external exact CLI and preserve the target project", async (t) => {
  const f = await fixture(
    t,
    cli,
    {},
    {
      project: {
        "package.json": JSON.stringify({
          name: "@lutzseverino/repo-standards",
          version: cli.version,
          bin: { "repo-standards": "dist/cli.js" },
        }),
      },
    },
  );
  const root = join(f.external.root, "product checkout's notes");
  cpSync(f.root, root, { recursive: true });
  const before = snapshot(root);
  const template = JSON.parse(
    cli.run(["adopt", source, "--project", root, "--json"], f.root, f.env)
      .stdout,
  ) as AdoptReport;
  assert.equal(template.outcome, "answers-required");
  const commands = stepCommands(template);
  const setup = commands.find((command) => command.startsWith("adoption_cli="));
  assert.ok(setup, template.nextSteps.join("\n"));
  // Execute the printed acquisition against the fixture registry, with npm
  // lifecycle scripts disabled, rather than relying on a prebuilt checkout.
  const acquired = spawnSync(
    "sh",
    ["-c", `{\n${setup}\n} >&2\nprintf '%s' "$adoption_cli"`],
    { cwd: root, env: f.env, encoding: "utf8" },
  );
  assert.equal(acquired.status, 0, acquired.stderr);
  const installation = acquired.stdout;
  t.after(() => rmSync(installation, { recursive: true, force: true }));
  const env = { ...f.env, adoption_cli: installation };
  const version = spawnSync(
    join(installation, "node_modules/.bin/repo-standards"),
    ["--version"],
    { cwd: root, env, encoding: "utf8" },
  );
  assert.equal(version.stdout.trim(), cli.version);
  assert.deepEqual(snapshot(root), before);

  const answers = join(f.external.root, "maintainer's answers.json");
  const invoke = commands.find((command) =>
    command.includes(" adopt --answers"),
  );
  assert.ok(invoke, template.nextSteps.join("\n"));
  // Supply only an incomplete answer so this round cannot start a run.
  const partial = { ...template.answers, questions: [] };
  writeFileSync(answers, JSON.stringify(partial));
  const continued = spawnSync(
    "sh",
    ["-c", `${invoke.replace("<answers file>", '"$answers_file"')} --json`],
    { cwd: f.root, env: { ...env, answers_file: answers }, encoding: "utf8" },
  );
  assert.equal(continued.status, 1, continued.stdout + continued.stderr);
  const report = JSON.parse(continued.stdout) as AdoptReport;
  assert.equal(report.outcome, "answers-required");
  assert.equal(report.selection.cli, cli.version);
  assert.deepEqual(report.missing, ["version"]);
  // Later rounds print the concrete answers path, including its shell quotes.
  const next = stepCommands(report).find((command) =>
    command.includes(" adopt --answers"),
  )!;
  const repeated = spawnSync("sh", ["-c", `${next} --json`], {
    cwd: f.root,
    env,
    encoding: "utf8",
  });
  assert.equal(repeated.status, 1, repeated.stdout + repeated.stderr);
  assert.equal(
    (JSON.parse(repeated.stdout) as AdoptReport).inspection?.identity,
    report.inspection?.identity,
  );
  assert.deepEqual(snapshot(root), before);

  // Complete only this isolated, operation-free adoption, then verify that
  // an update without a source remains read-only until answers start a run.
  writeFileSync(answers, JSON.stringify(template.answers));
  const completed = spawnSync("sh", ["-c", `${next} --json`], {
    cwd: f.root,
    env,
    encoding: "utf8",
  });
  assert.equal(completed.status, 0, completed.stdout + completed.stderr);
  assert.equal(
    (JSON.parse(completed.stdout) as AdoptReport).outcome,
    "complete",
  );
  commit(root);
  const adopted = snapshot(root);
  const updated = cli.run(["adopt", "--project", root, "--json"], f.root, env);
  assert.equal(updated.status, 0, updated.stdout + updated.stderr);
  const update = JSON.parse(updated.stdout) as AdoptReport;
  assert.equal(update.outcome, "answers-required");
  assert.ok(
    stepCommands(update).some((command) =>
      command.includes("$adoption_cli/node_modules/.bin/repo-standards"),
    ),
  );
  assert.deepEqual(snapshot(root), adopted);
});

test("ordinary adopting projects can execute their pinned npx answer-round command", async (t) => {
  const f = await fixture(
    t,
    cli,
    {},
    {
      project: {
        "package.json": JSON.stringify({
          name: "another-project",
          version: cli.version,
        }),
      },
    },
  );
  const template = f.adopt([source]).report;
  f.answer(template.answers, { version: null });
  const pending = f.adopt(["--answers", f.answersPath]).report;
  const command = stepCommands(pending).find((value) =>
    value.includes(" adopt --answers"),
  )!;
  assert.ok(
    command.startsWith(
      `npx --yes @lutzseverino/repo-standards@${cli.version} `,
    ),
  );
  const before = snapshot(f.root);
  const result = spawnSync("sh", ["-c", `${command} --json`], {
    cwd: f.root,
    env: {
      ...f.env,
      npm_config_yes: "true",
      npm_config_cache: join(f.external.root, "npm-cache"),
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as AdoptReport;
  assert.equal(report.outcome, "answers-required");
  assert.equal(report.selection.cli, cli.version);
  assert.deepEqual(snapshot(f.root), before);
});

test("self-adoption recovery uses the matching runtime or the external exact CLI", async (t) => {
  const f = await fixture(
    t,
    cli,
    {
      "project-readme": {
        kind: "file",
        target: "README.md",
        guidance: "guidance/readme.md",
        fixes: [operation("failing", { script: "fix.mjs" })],
      },
    },
    {
      files: {
        "guidance/readme.md": guidance,
        "fix.mjs": `console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: 'failed', message: 'Fixture failure.' }));`,
      },
      project: {
        "README.md": "# Project\n",
        "package.json": JSON.stringify({
          name: "@lutzseverino/repo-standards",
          version: cli.version,
        }),
      },
    },
  );
  const template = f.adopt([source]).report;
  const stopped = f.adopt(f.answer(template.answers));
  assert.equal(stopped.report.outcome, "incomplete", stopped.result.stdout);
  const pinnedStatus = stepCommands(stopped.report).find((command) =>
    command.endsWith(" status"),
  )!;
  assert.ok(pinnedStatus.startsWith(".repo-standards/runtime/"));
  const status = spawnSync("sh", ["-c", `${pinnedStatus} --json`], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
  });
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.equal(
    (JSON.parse(status.stdout) as Status).active!.id,
    stopped.report.run!.id,
  );

  // Model interrupted installation: manifests remain, but no executable is
  // available. Generated recovery must work even from an unrelated directory.
  rmSync(join(f.root, ".repo-standards/runtime/node_modules"), {
    recursive: true,
  });
  const head = git(f.root, "rev-parse", "HEAD");
  const index = readFileSync(join(f.root, ".git/index"));
  const missingRuntime = f.adopt(["--answers", f.answersPath]).report;
  assert.equal(missingRuntime.outcome, "incomplete");
  assert.match(
    missingRuntime.nextSteps.join("\n"),
    /Run `.*resume --retry.*repeat-safe.*without asking/,
  );
  assert.match(
    missingRuntime.nextSteps.join("\n"),
    /Abandon only on the maintainer's instruction/,
  );
  assert.doesNotMatch(
    missingRuntime.nextSteps.join("\n"),
    /Only on the maintainer's explicit instruction, run/,
  );
  const commands = stepCommands(missingRuntime);
  const env = { ...f.env, adoption_cli: cli.root };
  for (const action of ["resume --retry", "abandon"]) {
    const command = commands.find((value) =>
      value.includes(` ${action} --project`),
    );
    assert.ok(command, missingRuntime.nextSteps.join("\n"));
    const result = spawnSync("sh", ["-c", `${command} --json`], {
      cwd: f.external.root,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout) as {
      outcome: string;
      abandoned?: boolean;
      reason: string;
    };
    assert.equal(report.outcome, "incomplete");
    if (action === "abandon") assert.equal(report.abandoned, true);
    else
      assert.match(
        report.reason,
        /FINAL_INTEGRITY:.*runtime dependencies changed/,
      );
  }
  assert.equal(git(f.root, "rev-parse", "HEAD"), head);
  assert.deepEqual(readFileSync(join(f.root, ".git/index")), index);
});

test("an answers file adopts through missing answers, confirmation, contextual work and completion with the pinned CLI", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-source-");
  t.after(() => outside.close());
  const f = await fixture(t, cli, readmeSource(outside.root));
  const head = git(f.root, "rev-parse", "HEAD");
  const template = f.adopt([source]).report;
  const identity = template.inspection!.identity;
  const before = snapshot(f.root);
  const initialSteps = template.nextSteps.join("\n");
  assert.match(initialSteps, /Summarize the inspection.*handoff/);
  assert.match(initialSteps, /trusted scripts.*host, environment, and network/);
  assert.match(initialSteps, /Review each discarded edit.*diff/);
  assert.match(initialSteps, /Answer `confirmation`.*after your review/);
  assert.match(initialSteps, /List each discarded edit.*diff.*handoff/);
  assert.match(initialSteps, /Answer `defer`.*Report each reason/);
  assert.match(initialSteps, /Make no project edits until the run starts/);
  assert.doesNotMatch(
    initialSteps,
    /Ask the maintainer each question|only after they confirm|on the maintainer's choice/,
  );
  assert.match(
    question(template, "version").context,
    /Choose the proposed newest stable release unless the maintainer's request names another/,
  );
  assert.match(
    question(template, "inspection").context,
    /Answer with the current inspection identity without asking for approval/,
  );
  assert.match(
    question(template, "confirmation").context,
    /Review each discarded edit.*diff/,
  );
  assert.doesNotMatch(
    question(template, "confirmation").context,
    /maintainer confirms/,
  );
  assert.match(
    question(template, "remote-setup").context,
    /Answer defer.*Report each reason/,
  );

  // An incomplete answers file names its missing answers and changes nothing.
  const incomplete = f.adopt(
    f.answer(template.answers, { "remote-setup": "defer" }),
  );
  assert.equal(incomplete.result.status, 1);
  assert.equal(incomplete.report.outcome, "answers-required");
  assert.deepEqual(incomplete.report.missing, ["confirmation"]);
  assert.match(incomplete.report.nextSteps.join("\n"), /after your review/);
  assert.match(
    incomplete.report.nextSteps.join("\n"),
    /Make no project edits until the run starts/,
  );
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
  assert.match(
    resolve.report.nextSteps.join("\n"),
    /Answer `remote-setup` with `defer`.*Report each reason/,
  );
  assert.match(
    resolve.report.nextSteps.join("\n"),
    /Make no project edits until the run starts/,
  );
  assert.doesNotMatch(
    resolve.report.nextSteps.join("\n"),
    /with the maintainer|on their choice/,
  );
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
  const waitingSteps = waiting.report.nextSteps.join("\n");
  assert.match(waitingSteps, /Answer each assessment with your own judgment/);
  assert.match(waitingSteps, /answer that assessment `blocked`/);
  assert.match(waitingSteps, /decision the maintainer needs to make/);
  assert.doesNotMatch(waitingSteps, /Stop and tell the maintainer/);

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
  // An answer naming another declaration is still the question's.
  const assessment = {
    id: "elsewhere",
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
  assert.match(
    complete.report.nextSteps.at(-1)!,
    /Do not commit.*hand the changes to the maintainer for review/,
  );
  const steps = complete.report.nextSteps.join("\n");
  assert.match(steps, /git --no-optional-locks diff --no-ext-diff/);
  assert.match(steps, /ls-files --others --exclude-standard -z/);
  assert.match(steps, /read each new file's complete content/);
  assert.match(steps, /uncommitted and unstaged/);
  assert.match(steps, /Report script outcomes and your assessments separately/);
  assert.match(
    steps,
    /ready-to-commit verdict describes the uncommitted changes/,
  );
  assert.match(steps, /Record it before committing.*committed.*not ready/);
  assert.equal(git(f.root, "rev-parse", "HEAD"), head);
  assert.equal(git(f.root, "diff", "--cached"), "");
  assert.notEqual(git(f.root, "status", "--porcelain=v1"), "");
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
    cli,
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
  // Answers written before the inspection, such as a staged template's
  // version and profile, return it to be presented before any run starts.
  const before = snapshot(f.root);
  const unseen = f.adopt(
    f.answer({
      ...first.answers,
      questions: first.answers.questions.filter(
        ({ id }) => id === "version" || id === "profile",
      ),
    }),
  );
  assert.equal(unseen.report.outcome, "answers-required");
  assert.deepEqual(unseen.report.missing, ["inspection"]);
  assert.equal(
    question(unseen.report, "inspection").answer,
    unseen.report.inspection!.identity,
  );
  assert.deepEqual(snapshot(f.root), before);
  const adopted = f.adopt(f.answer(unseen.report.answers));
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
  assert.doesNotMatch(selectionPart(f.run(["adopt"]).stdout), /cannot be read/);
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
  commit(f.root);

  // Without its source, the project applies its current selection again
  // from the retained standards.
  for (const url of Object.keys(f.remote.responses))
    delete f.remote.responses[url];
  f.remote.save();
  const offline = f.adopt([]);
  assert.equal(offline.result.status, 0, offline.result.stdout);
  assert.equal(question(offline.report, "version").answer, "v1.1.0");
  assert.match(
    question(offline.report, "version").context,
    /cannot be read: .* retained standards apply again/,
  );
  assert.equal(question(offline.report, "profile").answer, "work");
  // The Markdown report says, next to the selection, that the proposal is
  // the current version rather than the newest.
  assert.match(
    selectionPart(f.run(["adopt"]).stdout),
    /\| Version +\| `v1\.1\.0` +\|[\s\S]*The releases of https:\/\/github\.com\/alice\/standards cannot be read: .* The template proposes the current version, v1\.1\.0, which the retained standards apply again\./,
  );
  const reapplied = f.adopt(f.answer(offline.report.answers));
  assert.equal(reapplied.report.outcome, "complete", reapplied.result.stdout);
  assert.equal(
    readFileSync(join(f.root, "AGENTS.md"), "utf8"),
    "Updated agent guidance\n",
  );
});

test("adopt fails when GitHub refuses the release lookup, rather than proposing the current version", async (t) => {
  const f = await fixture(
    t,
    cli,
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
  f.remote.publish("v1.1.0");
  f.releases("v1.1.0", "v1.0.0");
  const readable = { ...f.remote.responses };
  // GitHub answers every REST request with the same refusal.
  const refuse = (response: (typeof readable)[string]) => {
    for (const url of Object.keys(readable)) f.remote.responses[url] = response;
    f.remote.save();
  };
  const before = snapshot(f.root);
  const refused = (env: NodeJS.ProcessEnv, code: string, message: RegExp) => {
    const outputs = [
      f.run(["adopt"], env),
      f.run(["adopt", "--json"], env),
      f.run(
        ["adopt", ...f.answer(first.answers, { version: null }), "--json"],
        env,
      ),
    ];
    for (const result of outputs) {
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const diagnostic = result.stdout.startsWith("{")
        ? (JSON.parse(result.stdout) as ErrorReport).errors[0]!
        : {
            code: /\[(\w+)\]/.exec(result.stderr)?.[1],
            message: result.stderr,
          };
      assert.equal(diagnostic.code, code);
      assert.match(diagnostic.message, message);
      assert.match(
        diagnostic.message,
        /To apply the current version, v1\.0\.0, again, pass --standards-version v1\.0\.0\./,
      );
      assert.doesNotMatch(result.stdout, /answers-required|v1\.0\.0 → /);
      assert.deepEqual(snapshot(f.root), before);
    }
  };

  refuse({
    status: 403,
    headers: {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "2000000000",
    },
    body: {},
  });
  refused(
    f.env,
    "QUOTA_EXHAUSTED",
    /quota is exhausted\. Retry at 2033-05-18T03:33:20\.000Z\. .*GH_TOKEN or GITHUB_TOKEN/,
  );
  refuse({ status: 429, headers: { "retry-after": "120" }, body: {} });
  refused(
    f.env,
    "QUOTA_EXHAUSTED",
    /quota is exhausted\. Retry after 120 seconds\. .*GH_TOKEN or GITHUB_TOKEN/,
  );
  refuse({ status: 401, body: {} });
  refused(
    { ...f.env, GH_TOKEN: "rejected-token" },
    "SOURCE_UNAVAILABLE",
    /GitHub rejected the token in GH_TOKEN or GITHUB_TOKEN/,
  );

  // Under the exhausted quota, naming the current version applies it again
  // from the retained standards.
  refuse({
    status: 403,
    headers: {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "2000000000",
    },
    body: {},
  });
  const explicit = f.adopt(["--standards-version", "v1.0.0"]);
  assert.equal(explicit.result.status, 0, explicit.result.stdout);
  assert.equal(explicit.report.selection.version, "v1.0.0");
  assert.equal(question(explicit.report, "profile").answer, "work");
  const reapplied = f.adopt(f.answer(explicit.report.answers));
  assert.equal(reapplied.report.outcome, "complete", reapplied.result.stdout);

  // Readable again, the release list proposes the newest release.
  Object.assign(f.remote.responses, readable);
  f.remote.save();
  assert.equal(f.adopt([]).report.selection.version, "v1.1.0");
});

test("adopt asks a discovery script's open questions as answers-file fields and starts once they are answered", async (t) => {
  const { f, draft } = await discoveryFixture(t, cli, [
    "Is tools a maintained project?",
  ]);
  const before = snapshot(f.root);
  const template = f.adopt([source]).report;
  const scope = question(template, "scope:project-docs");
  assert.deepEqual(scope.answer, draft);
  assert.match(
    scope.context,
    /Decide each open question.*project evidence.*reasons.*without asking/,
  );
  assert.doesNotMatch(scope.context, /Ask the maintainer/);
  assert.match(
    template.nextSteps.join("\n"),
    /resolve membership questions from project evidence, with reasons, without asking/,
  );
  assert.deepEqual(scope.details, {
    unresolved: ["Is tools a maintained project?"],
  });
  assert.deepEqual(template.missing, ["scope:project-docs"]);
  assert.equal(template.discovery![0]!.discovery.content, discovery);

  // An answer with an open question is still missing, and the proposal it
  // makes is a new inspection to present.
  const open = f.adopt(f.answer(template.answers));
  assert.equal(open.result.status, 1);
  assert.deepEqual(open.report.missing, ["scope:project-docs", "inspection"]);
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

  // Answered, the scope changes the inspection, which goes back to be
  // presented; returned, the run starts its contextual work.
  const confirmed = f.adopt(
    f.answer(template.answers, {
      // An answer naming another declaration is still the question's.
      "scope:project-docs": {
        ...draft,
        id: "elsewhere",
        coverage: `${draft.coverage} Tools holds scripts, not a project.`,
        unresolved: [],
      },
    }),
  );
  assert.deepEqual(confirmed.report.missing, ["inspection"]);
  assert.deepEqual(snapshot(f.root), before);
  const answered = f.adopt(f.answer(confirmed.report.answers));
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
    cli,
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
  assert.match(fix.context, /Only after the maintainer confirms the overwrite/);
  assert.match(
    stopped.report.nextSteps.join("\n"),
    /each setting.*current and standard values.*maintainer/,
  );
  assert.match(stopped.report.nextSteps.join("\n"), /Only after they confirm/);
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
  const { f, draft } = await discoveryFixture(t, cli, []);
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
  assert.deepEqual(early.report.missing, ["scope:project-docs", "inspection"]);
  assert.deepEqual(question(early.report, "scope:project-docs").answer, draft);
  assert.deepEqual(snapshot(f.root), before);

  // Carried back, the draft is the confirmed scope, whose inspection is
  // presented before the run starts.
  const scoped = f.adopt(f.answer(early.report.answers));
  assert.deepEqual(scoped.report.missing, ["inspection"]);
  const started = f.adopt(f.answer(scoped.report.answers));
  assert.equal(started.report.outcome, "contextual", started.result.stdout);
  assert.deepEqual(started.report.contextual![0]!.allowedTargets, {
    paths: ["app/README.md"],
    directories: [],
  });
});
