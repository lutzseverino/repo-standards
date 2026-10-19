import type { Status } from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { directoryFixture, installCli, snapshot } from "./installed-cli.ts";
import { commit, git, operation } from "./remote-fixture.ts";
import {
  discoveryFixture,
  fixture,
  guidance,
  readmeSource,
  reason,
  rules,
  source,
} from "./adopt-fixture.ts";
import { terminalSession } from "./terminal.ts";

const cli = installCli();
after(() => cli.close());

type Fixture = Awaited<ReturnType<typeof fixture>>;

// The incomplete-run menu of a run stopped for its scope.
const scopeMenu =
  "Change the scope and adopt again in place, abandon the run, or stop? [scope/abandon/stop]: ";

// adopt in a terminal session, run by this test's CLI or the project's
// pinned runtime.
function terminal(
  t: TestContext,
  f: Fixture,
  args: string[] = [],
  runtime = false,
) {
  const session = terminalSession(
    runtime ? f.pinned : join(cli.root, "node_modules/.bin/repo-standards"),
    ["adopt", ...args],
    { cwd: f.root, env: f.env },
  );
  t.after(() => session.close());
  return session;
}

function status(f: Fixture) {
  return JSON.parse(
    spawnSync(f.pinned, ["status", "--json"], {
      cwd: f.root,
      env: f.env,
      encoding: "utf8",
    }).stdout,
  ) as Status & {
    readyToCommit: boolean;
    active: { outcome: string; phase: string; reason: string } | null;
  };
}

test("adopt --json in a terminal prints the answers-file template and changes nothing", async (t) => {
  const f = await fixture(t, cli, {});
  const before = snapshot(f.root);
  const session = terminal(t, f, [source, "--json"]);
  const output = await session.expect(/\{[\s\S]*\n\}/);
  assert.equal(await session.exit(), 0, session.rest());
  const report = JSON.parse(output) as {
    outcome: string;
    answers: { format: string };
  };
  assert.equal(report.outcome, "answers-required");
  assert.equal(report.answers.format, "repo-standards/answers/v1");
  assert.deepEqual(snapshot(f.root), before);
});

test("adopt in a terminal asks its questions, walks contextual work until its checks pass, and completes", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-terminal-");
  t.after(() => outside.close());
  const f = await fixture(t, cli, readmeSource(outside.root), {
    profiles: { work: {}, personal: { "project-readme": { exclude: true } } },
  });
  f.remote.publish("v1.1.0");
  f.releases("v1.0.0", "v1.1.0");
  const session = terminal(t, f, [source]);

  // The version defaults to the newest stable release; the profiles are
  // listed with their descriptions.
  const opening = await session.expect("Version [v1.1.0]: ");
  assert.match(
    opening,
    /An agent runs adopt with --json to get the answers-file template\.[\s\S]*Which standards version/,
  );
  assert.match(
    opening,
    /Which standards version should the project adopt\?[\s\S]*Stable releases: v1\.1\.0, v1\.0\.0/,
  );
  session.type("");
  assert.match(
    await session.expect("Profile: "),
    /Which profile should the project adopt\?[\s\S]*1\. work: work\n[\s\S]*2\. personal: personal\n/,
  );
  session.type("missing");
  await session.expect("Choose one of: work, personal.");
  await session.expect("Profile: ");
  // A profile is chosen by its name or its number in the list.
  session.type("1");

  // The inspection, then the remote setup that is not ready, and the edit the
  // run discards.
  assert.match(
    await session.expect("Defer it, or resolve it first? [defer/resolve]: "),
    new RegExp(
      `# Repository Standards adoption proposal[\\s\\S]*agent-guidance/labels: ${reason}`,
    ),
  );
  session.type("defer");
  assert.match(
    await session.expect("Discard these edits? [y/N]: "),
    /AGENTS\.md[\s\S]*-Local agent notes/,
  );
  session.type("y");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");

  // The contextual declaration, with its rules and adoption guidance.
  const shown = await session.expect(
    "Edit the files now. Press Enter when you are done, or type blocked: ",
  );
  assert.match(shown, /Contextual work 1 of 1: project-readme/);
  assert.match(shown, /Edit only: README\.md/);
  assert.ok(shown.includes(rules), shown);
  assert.ok(shown.includes(guidance), shown);
  assert.equal(
    readFileSync(join(f.root, "AGENTS.md"), "utf8"),
    "Standard agent guidance\n",
  );

  // Until the README has a heading, its check fails, shown with its rules.
  session.type("");
  const failed = await session.expect(
    "Fix it, then press Enter to check again, or type blocked: ",
  );
  assert.match(
    failed,
    /Failed: heading: README\.md has no top-level heading\./,
  );
  assert.match(
    failed,
    /Its rules, \.repo-standards\/rules\/project-readme\.md:/,
  );
  assert.ok(failed.includes(rules), failed);
  session.type("");
  await session.expect(
    "Fix it, then press Enter to check again, or type blocked: ",
  );
  writeFileSync(join(f.root, "README.md"), "# Project\n\nProject notes\n");
  session.type("");
  assert.match(
    await session.expect("Is project-readme done? [Y/n/blocked]: "),
    /Passed: heading: README\.md has a heading\./,
  );
  session.type("");
  await session.expect("The adoption is complete.");
  await session.expect(
    "Review them with git status and git diff, then commit them through the project's normal workflow.",
  );
  assert.equal(await session.exit(), 0, session.rest());

  // The assessment is the maintainer's, and the run is ready to commit.
  const record = status(f);
  assert.equal(record.readyToCommit, true);
  const [judgment] = record.assessments![0]!.declarations;
  assert.equal(judgment!.status, "satisfied");
  assert.match(judgment!.explanation, /maintainer/);
  assert.ok(
    judgment!.evidence.includes(
      "Check heading passed: README.md has a heading.",
    ),
    judgment!.evidence.join("\n"),
  );
  assert.deepEqual(record.deferred, [
    { declaration: "agent-guidance", id: "labels", reason },
  ]);
});

test("a blocked declaration leaves the run incomplete, and adopt resumes an interrupted run where it stopped", async (t) => {
  const f = await fixture(t, cli, {
    "project-readme": {
      kind: "file",
      target: "README.md",
      guidance: "guidance/readme.md",
      rules: "rules/readme.md",
      checks: [operation("heading", { script: "checks/readme.mjs" })],
    },
  });
  const first = terminal(t, f, [source]);
  await first.expect("Version [v1.0.0]: ");
  first.type("");
  await first.expect("Profile [work]: ");
  first.type("");
  await first.expect("Start the run? [Y/n]: ");
  first.type("");
  await first.expect("Press Enter when you are done, or type blocked: ");
  // Interrupted while the person edits, the run waits where it stopped.
  first.press("\x03");
  assert.equal(await first.exit(), 130);
  assert.equal(status(f).active!.phase, "contextual");

  // Run again, adopt continues the walk, asking nothing it asked before.
  const second = terminal(t, f, [], true);
  const resumed = await second.expect(
    "Press Enter when you are done, or type blocked: ",
  );
  assert.doesNotMatch(resumed, /Which standards version/);
  assert.match(resumed, /Contextual work 1 of 1: project-readme/);
  // Only Enter or blocked answers the wait: a typo asks again, running no
  // check.
  second.type("blokced");
  assert.doesNotMatch(
    await second.expect("Press Enter when you are done, or type blocked: "),
    /Running the checks/,
  );
  // A block after a failed check keeps that check's result as evidence.
  second.type("");
  await second.expect(
    "Fix it, then press Enter to check again, or type blocked: ",
  );
  second.type("blocked");
  await second.expect("Why is project-readme blocked? ");
  second.type("The project has no name yet.");
  assert.match(
    await second.expect("run adopt again to continue."),
    /The run is incomplete\. Blocked: project-readme: The project has no name yet\./,
  );
  assert.equal(await second.exit(), 1);
  const blocked = status(f).active!;
  assert.equal(blocked.outcome, "incomplete");
  assert.ok(
    (
      status(f) as unknown as {
        active: { assessments: { declarations: { evidence: string[] }[] }[] };
      }
    ).active.assessments[0]!.declarations[0]!.evidence.includes(
      "Check heading failed: README.md has no top-level heading.",
    ),
  );
  assert.match(blocked.reason, /ASSESSMENT_BLOCKED: .*project-readme/);

  // Once resolved, the same command completes the run.
  writeFileSync(join(f.root, "README.md"), "# Project\n\nProject notes\n");
  const third = terminal(t, f, [], true);
  await third.expect("Press Enter when you are done, or type blocked: ");
  third.type("");
  await third.expect("Is project-readme done? [Y/n/blocked]: ");
  third.type("y");
  await third.expect("The adoption is complete.");
  assert.equal(await third.exit(), 0, third.rest());
  assert.equal(status(f).readyToCommit, true);
});

test("adopt in a terminal retries a run interrupted during its fixes on the person's choice", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-terminal-");
  t.after(() => outside.close());
  const started = join(outside.root, "started");
  const release = join(outside.root, "release");
  const f = await fixture(
    t,
    cli,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        fixes: [
          operation("slow", {
            script: "slow.mjs",
            arguments: [started, release],
          }),
        ],
      },
    },
    {
      files: {
        "content/AGENTS.md": "Standard agent guidance\n",
        "slow.mjs": `import { existsSync, writeFileSync } from 'node:fs';
writeFileSync(process.argv[2], '');
while (!existsSync(process.argv[3])) await new Promise((resolve) => setTimeout(resolve, 50));
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: 'unchanged', message: 'Nothing to do.' }));
`,
      },
      project: { "README.md": "Project notes\n" },
    },
  );
  const first = terminal(t, f, [source]);
  await first.expect("Version [v1.0.0]: ");
  first.type("");
  await first.expect("Profile [work]: ");
  first.type("");
  await first.expect("Start the run? [Y/n]: ");
  first.type("");
  await first.expect("Starting the run");
  for (let tries = 0; !existsSync(started); tries++) {
    assert.ok(tries < 1200, "The fix did not start.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  // The person interrupts the command while the fix runs; the fix finishes
  // on its own.
  first.kill("SIGINT");
  await first.exit();
  writeFileSync(release, "");
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(status(f).active!.outcome, "incomplete");

  const second = terminal(t, f, [], true);
  assert.match(
    await second.expect(
      "Retry the interrupted work, abandon the run, or stop? [retry/abandon/stop]: ",
    ),
    /The run is incomplete: /,
  );
  second.type("retry");
  await second.expect("The adoption is complete.");
  assert.equal(await second.exit(), 0, second.rest());
  assert.equal(status(f).readyToCommit, true);
});

test("adopt in a terminal asks a discovery script's open questions and reviews the confirmed scope", async (t) => {
  const { f } = await discoveryFixture(t, cli, [
    "Is tools a maintained project?",
  ]);
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  const scope = await session.expect("Answer: ");
  assert.match(scope, /Which project files does project-docs cover\?/);
  assert.match(
    scope,
    /include app\/README\.md: Its manifest makes it a project\./,
  );
  assert.match(scope, /Open question: Is tools a maintained project\?/);
  session.type("No, tools holds scripts.");
  await session.expect(
    "Does project-docs cover exactly the drafted files, app/README.md? [Y/n]: ",
  );
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  // The scope is reviewed as the fixes left it, before any edit, and again
  // once the contextual work is done.
  assert.match(
    await session.expect(
      "Before any contextual edit, does it cover every file project-docs should? [Y/n]: ",
    ),
    /The confirmed scope of project-docs, as the run's fixes left the project\.\n/,
  );
  session.type("");
  assert.match(
    await session.expect(
      "Edit the files now. Press Enter when you are done, or type blocked: ",
    ),
    /Edit only: app\/README\.md/,
  );
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  session.type("");
  assert.match(
    await session.expect("Is project-docs done? [Y/n/blocked]: "),
    /project-docs declares no checks\./,
  );
  session.type("");
  await session.expect(
    "Now that the contextual work is done, does the confirmed scope of project-docs, app/README.md, cover every file it should? [Y/n]: ",
  );
  session.type("");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  const [judgment] = status(f).assessments![0]!.declarations;
  const { scopeValidity } = judgment as unknown as {
    scopeValidity: Record<string, { status: string; explanation: string }>;
  };
  assert.equal(scopeValidity.afterFixes!.status, "valid");
  assert.match(scopeValidity.afterFixes!.explanation, /after the run's fixes/);
  assert.equal(scopeValidity.current!.status, "valid");
  assert.match(scopeValidity.current!.explanation, /after the contextual work/);
});

test("adopt in a terminal reruns a fix allowed to overwrite a setting once the person confirms", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-terminal-");
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
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  const prompt =
    "Overwrite the setting, defer the fix, or stop? [overwrite/defer/stop]: ";
  assert.ok((await session.expect(prompt)).includes(message));
  assert.equal(existsSync(log), false);
  session.type("overwrite");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  assert.equal(readFileSync(log, "utf8"), "rebase\n");

  // Declined, the fix is deferred: the run completes without it and records
  // the deferral, and the next run runs it again.
  commit(f.root);
  const declined = terminal(t, f, [], true);
  for (const question of [
    "Version [v1.0.0]: ",
    "Profile [work]: ",
    "Start the run? [Y/n]: ",
  ]) {
    await declined.expect(question);
    declined.type("");
  }
  await declined.expect(prompt);
  declined.type("defer");
  await declined.expect("Deferring the fix");
  await declined.expect("The adoption is complete.");
  assert.equal(await declined.exit(), 0, declined.rest());
  assert.equal(readFileSync(log, "utf8"), "rebase\n");
  assert.deepEqual(status(f).deferred, [
    {
      declaration: "agent-guidance",
      id: "setting",
      reason: `The maintainer declined the overwrite: ${message}`,
    },
  ]);
});

test("a scope the person reports incomplete stops the walk and the run, which the person abandons", async (t) => {
  // A second contextual declaration follows the discovered one.
  const { f } = await discoveryFixture(t, cli, [], {
    declarations: {
      "project-readme": {
        kind: "file",
        target: "README.md",
        guidance: "guidance/readme.md",
      },
    },
    files: { "guidance/readme.md": guidance },
  });
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect(
    "Does project-docs cover exactly the drafted files, app/README.md? [Y/n]: ",
  );
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("cover every file project-docs should? [Y/n]: ");
  session.type("n");
  await session.expect("File: ");
  session.type("tools/README.md");
  await session.expect("File: ");
  session.type("");
  await session.expect("Why is the confirmed scope incomplete? ");
  session.type("The tools project needs documentation too.");
  // The walk ends there: no later answer can confirm the scope, and no
  // later declaration's work can complete the run.
  assert.doesNotMatch(
    await session.expect("Submitting the assessment"),
    /Press Enter when you are done|Contextual work 2 of 2/,
  );
  assert.match(
    await session.expect(scopeMenu),
    /The run is incomplete: SCOPE_INCOMPLETE: /,
  );
  session.type("abandon");
  await session.expect("Abandoned the run.");
  await session.expect(
    "Run adopt again in this checkout to adopt again in place over them.",
  );
  assert.equal(await session.exit(), 1);
  assert.equal(status(f).active, null);
  // The run's work stays in the project.
  assert.ok(
    existsSync(join(f.root, ".agents/skills/repository-standards/SKILL.md")),
  );
});

test("a person lists the files a discovery declaration covers, and a rejected path asks again", async (t) => {
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
    },
    {
      files: {
        "guidance.md": "Document each maintained project.",
        "discovery.md": "Projects have a package manifest.",
        "draft.mjs": `import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify({ format: "repo-standards/scope/v2", declarations: [{
  id: input.declaration,
  coverage: "The app is maintained.",
  candidates: [
    { path: "app/README.md", decision: "include", reason: "Its manifest makes it a project.", evidence: ["app/package.json"] },
    { path: "tools/README.md", decision: "exclude", reason: "Tools has no manifest.", evidence: ["tools/run.sh"] },
  ],
  unresolved: [],
}] }));
`,
      },
      project: { "app/package.json": "{}", "tools/run.sh": "echo tools" },
    },
  );
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  const list = async (...paths: string[]) => {
    await session.expect(
      "Does project-docs cover exactly the drafted files, app/README.md? [Y/n]: ",
    );
    session.type("n");
    for (const path of [...paths, ""]) {
      await session.expect("File: ");
      session.type(path);
    }
    await session.expect("Why do these files make up its scope? ");
    session.type("The maintainer documents these.");
  };
  // A path inspection rejects asks the scope question again.
  await list("../outside.md");
  await session.expect("Answer the scope questions again.");
  // So does a directory listed as a file.
  await list("tools");
  assert.match(
    await session.expect("Answer the scope questions again."),
    /individual regular files or absent files: tools\./,
  );
  // A drafted exclusion the person lists is included, and a path keeps its
  // spaces.
  await list(
    "app/README.md",
    "tools/README.md",
    "docs/User Guide.md",
    "docs/Trailing.md ",
  );
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("cover every file project-docs should? [Y/n]: ");
  session.type("");
  const walk = await session.expect(
    "Press Enter when you are done, or type blocked: ",
  );
  const targets = /Edit only: (.*)\n/.exec(walk)![1]!.split(", ").sort();
  assert.deepEqual(targets, [
    "app/README.md",
    "docs/Trailing.md ",
    "docs/User Guide.md",
    "tools/README.md",
  ]);
  session.press("\x03");
  assert.equal(await session.exit(), 130);
});

test("a failed check outside contextual work waits for the person to resolve it, then runs every check again", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-terminal-");
  t.after(() => outside.close());
  const tool = join(outside.root, "tool");
  const f = await fixture(
    t,
    cli,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        checks: [
          operation("tooling", {
            script: "checks/tooling.mjs",
            arguments: [tool],
          }),
        ],
      },
      "project-readme": {
        kind: "file",
        target: "README.md",
        guidance: "guidance/readme.md",
      },
    },
    {
      files: {
        "content/AGENTS.md": "Standard agent guidance\n",
        "guidance/readme.md": guidance,
        "checks/tooling.mjs": `import { existsSync } from 'node:fs';
const found = existsSync(process.argv[2]);
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: found ? 'passed' : 'failed', message: found ? 'The tool is installed.' : 'The tool is missing.' }));
`,
      },
      project: { "README.md": "Project notes\n" },
    },
  );
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("Press Enter when you are done, or type blocked: ");
  session.type("");
  await session.expect("Is project-readme done? [Y/n/blocked]: ");
  session.type("");
  // No contextual edit fixes it, so nothing is walked again; once the
  // person resolves it, the same assessment runs every check again.
  const failed = await session.expect(
    "Resolve them, then press Enter to run every check again, or type stop: ",
  );
  assert.match(
    failed,
    /Failed: agent-guidance\/tooling: The tool is missing\.\nThese checks are not of contextual work/,
  );
  assert.match(
    status(f).active!.reason,
    /CHECKS_FAILED: .*agent-guidance\/tooling/,
  );
  writeFileSync(tool, "");
  session.type("");
  assert.doesNotMatch(
    await session.expect("The adoption is complete."),
    /Contextual work/,
  );
  assert.equal(await session.exit(), 0, session.rest());
});

test("resolving remote setup that is not ready stops before any other question", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-terminal-");
  t.after(() => outside.close());
  const f = await fixture(t, cli, readmeSource(outside.root));
  const before = snapshot(f.root);
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect("Defer it, or resolve it first? [defer/resolve]: ");
  session.type("resolve");
  assert.doesNotMatch(
    await session.expect("Nothing was changed. Resolve the remote setup"),
    /Discard these edits|Start the run/,
  );
  assert.equal(await session.exit(), 1);
  assert.deepEqual(snapshot(f.root), before);
});

test("an exhausted GitHub API quota fails the update instead of offering the current version", async (t) => {
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
  const template = f.adopt([source]).report;
  const adopted = f.adopt(f.answer(template.answers));
  assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
  commit(f.root);
  for (const url of Object.keys(f.remote.responses))
    f.remote.responses[url] = {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
      body: {},
    };
  f.remote.save();
  const before = snapshot(f.root);
  const session = terminal(t, f);
  assert.doesNotMatch(
    await session.expect(
      /\[QUOTA_EXHAUSTED\][\s\S]*pass --standards-version v1\.0\.0\./,
    ),
    /Version \[/,
  );
  assert.equal(await session.exit(), 1);
  assert.deepEqual(snapshot(f.root), before);
});

test("a walk's checks run only from a verified installation", async (t) => {
  const outside = directoryFixture("repo-standards-adopt-terminal-");
  t.after(() => outside.close());
  const ran = join(outside.root, "ran");
  const f = await fixture(t, cli, {
    "project-readme": {
      kind: "file",
      target: "README.md",
      guidance: "guidance/readme.md",
      rules: "rules/readme.md",
      checks: [operation("heading", { script: "checks/readme.mjs" })],
    },
  });
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("Press Enter when you are done, or type blocked: ");
  // A retained check script changed while the person edits is never run.
  writeFileSync(
    join(f.root, ".repo-standards/inputs/source/checks/readme.mjs"),
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(ran)}, '');\n`,
  );
  session.type("");
  await session.expect(/\[[A-Z_]+\] /);
  assert.equal(await session.exit(), 1);
  assert.equal(existsSync(ran), false);
});

test("a person changes a scope reported incomplete, and adopt replaces the run in place and completes it", async (t) => {
  const { f } = await discoveryFixture(t, cli, []);
  const head = git(f.root, "rev-parse", "HEAD");
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect(
    "Does project-docs cover exactly the drafted files, app/README.md? [Y/n]: ",
  );
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("cover every file project-docs should? [Y/n]: ");
  session.type("");
  await session.expect("Press Enter when you are done, or type blocked: ");
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  session.type("");
  await session.expect("Is project-docs done? [Y/n/blocked]: ");
  session.type("");
  await session.expect("cover every file it should? [Y/n]: ");
  session.type("n");
  await session.expect("File: ");
  session.type("tools/README.md");
  await session.expect("File: ");
  session.type("");
  await session.expect("Why is the confirmed scope incomplete? ");
  session.type("The tools project needs documentation too.");
  await session.expect(scopeMenu);
  const replacedRun = status(f).active!.id;
  session.type("scope");
  await session.expect(
    "Does project-docs cover exactly the confirmed files, app/README.md? [Y/n]: ",
  );
  session.type("n");
  for (const path of ["app/README.md", "tools/README.md", ""]) {
    await session.expect("File: ");
    session.type(path);
  }
  await session.expect("Why do these files make up its scope? ");
  session.type("The app and the tools are both maintained.");
  // The replacement asks only to start the new inspection.
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("cover every file project-docs should? [Y/n]: ");
  session.type("");
  await session.expect("Press Enter when you are done, or type blocked: ");
  writeFileSync(join(f.root, "tools/README.md"), "# Tools\n");
  session.type("");
  await session.expect("Is project-docs done? [Y/n/blocked]: ");
  session.type("");
  await session.expect("cover every file it should? [Y/n]: ");
  session.type("");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  assert.equal(git(f.root, "rev-parse", "HEAD"), head);
  const record = status(f);
  assert.equal(record.readyToCommit, true, record.readinessReasons.join());
  assert.equal(record.abandoned[0]!.id, replacedRun);
  assert.match(record.abandoned[0]!.reason, /^REPLACED: SCOPE_INCOMPLETE:/);
  const changed = record.changeSet!.map(({ path }) => path);
  for (const path of ["app/README.md", "tools/README.md"])
    assert.ok(changed.includes(path), changed.join(", "));
});

test("a scope can be blocked before contextual work without missing files and requires a reason", async (t) => {
  const { f } = await discoveryFixture(t, cli, [], {
    declarations: {
      "tools-docs": {
        kind: "repository",
        targets: { paths: ["tools/run.sh"], directories: [] },
        guidance: "guidance.md",
      },
    },
  });
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect(
    "Does project-docs cover exactly the drafted files, app/README.md? [Y/n]: ",
  );
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("cover every file project-docs should? [Y/n]: ");
  session.type("n");
  await session.expect("File: ");
  session.type("");
  await session.expect("Why is the confirmed scope incomplete? ", 5_000);
  session.type("");
  await session.expect("Why is the confirmed scope incomplete? ");
  session.type("   ");
  await session.expect("Why is the confirmed scope incomplete? ");
  assert.deepEqual(status(f).active!.assessments, []);
  const reason = "The app is a fixture and its README must be withdrawn.";
  session.type(reason);
  const stopped = await session.expect(scopeMenu);
  assert.match(stopped, /The run is incomplete: SCOPE_INCOMPLETE: /);
  assert.doesNotMatch(stopped, /Contextual work|Now that the contextual work/);
  session.type("stop");
  assert.equal(await session.exit(), 1);
  const run = status(f).active!;
  assert.match(run.reason, /SCOPE_INCOMPLETE/);
  const [judgment, unwalked] = run.assessments[0]!.declarations;
  assert.equal(judgment!.id, "project-docs");
  assert.equal(judgment!.status, "blocked");
  assert.ok(judgment!.explanation.includes(reason));
  for (const review of Object.values(judgment!.scopeValidity!)) {
    assert.equal(review.status, "blocked");
    assert.deepEqual(review.additionalPaths, []);
    assert.ok(review.explanation.includes(reason));
    assert.deepEqual(review.evidence, ["The confirmed scope: app/README.md."]);
  }
  assert.equal(unwalked!.id, "tools-docs");
  assert.equal(unwalked!.status, "blocked");
  assert.match(unwalked!.explanation, /project-docs/);
});

for (const missing of [[], ["tools/README.md", "tools/NOTES.md"]])
  test(`a scope reported incomplete after contextual work stops the run with ${missing.length ? "missing files" : "no missing files"}`, async (t) => {
    const { f } = await discoveryFixture(t, cli, []);
    const session = terminal(t, f, [source]);
    await session.expect("Version [v1.0.0]: ");
    session.type("");
    await session.expect("Profile [work]: ");
    session.type("");
    await session.expect(
      "Does project-docs cover exactly the drafted files, app/README.md? [Y/n]: ",
    );
    session.type("");
    await session.expect("Start the run? [Y/n]: ");
    session.type("");
    await session.expect("cover every file project-docs should? [Y/n]: ");
    session.type("");
    await session.expect("Press Enter when you are done, or type blocked: ");
    writeFileSync(join(f.root, "app/README.md"), "# App\n");
    session.type("");
    await session.expect("Is project-docs done? [Y/n/blocked]: ");
    session.type("");
    await session.expect(
      "Now that the contextual work is done, does the confirmed scope of project-docs, app/README.md, cover every file it should? [Y/n]: ",
    );
    session.type("n");
    for (const path of [...missing, ""]) {
      await session.expect("File: ");
      session.type(path);
    }
    await session.expect("Why is the confirmed scope incomplete? ");
    const reason = missing.length
      ? "The tools project needs documentation too."
      : "Whether the app is maintained is unresolved.";
    session.type(reason);
    assert.match(
      await session.expect(scopeMenu),
      /The run is incomplete: SCOPE_INCOMPLETE: /,
    );
    session.type("stop");
    assert.equal(await session.exit(), 1);
    // The assessment records both reviews as the person gave them.
    const run = status(f).active!;
    assert.match(run.reason, /SCOPE_INCOMPLETE/);
    const scopeValidity = run.assessments[0]!.declarations[0]!.scopeValidity!;
    assert.equal(scopeValidity.afterFixes.status, "valid");
    assert.equal(scopeValidity.current.status, "blocked");
    assert.deepEqual(scopeValidity.current.additionalPaths, missing);
    assert.ok(scopeValidity.current.explanation.includes(reason));
    for (const path of missing)
      assert.ok(scopeValidity.current.explanation.includes(path));
    assert.deepEqual(scopeValidity.current.evidence, [
      "The confirmed scope: app/README.md.",
    ]);
  });

test("a walk's checks may not change the run's records", async (t) => {
  const f = await fixture(t, cli, {
    "project-readme": {
      kind: "file",
      target: "README.md",
      guidance: "guidance/readme.md",
      rules: "rules/readme.md",
      checks: [operation("heading", { script: "checks/readme.mjs" })],
    },
  });
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("Press Enter when you are done, or type blocked: ");
  // A retained check that rewrites the run's local report, and changes the
  // project too, fails for the records first.
  writeFileSync(
    join(f.root, ".repo-standards/inputs/source/checks/readme.mjs"),
    `import { appendFileSync } from 'node:fs';
appendFileSync('.repo-standards/local/run.json', ' ');
appendFileSync('README.md', 'changed');
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: 'passed', message: 'Fine.' }));
`,
  );
  session.type("");
  await session.expect("[FINAL_INTEGRITY] ");
  assert.equal(await session.exit(), 1);
});

test("a scope review the assessment rejects is asked again", async (t) => {
  const { f } = await discoveryFixture(t, cli, []);
  const session = terminal(t, f, [source]);
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  await session.expect(
    "Does project-docs cover exactly the drafted files, app/README.md? [Y/n]: ",
  );
  session.type("");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  await session.expect("cover every file project-docs should? [Y/n]: ");
  session.type("n");
  await session.expect("File: ");
  session.type("../outside.md");
  await session.expect("File: ");
  session.type("");
  await session.expect("Why is the confirmed scope incomplete? ");
  session.type("This file must be covered too.");
  // The path is refused, and the person is asked again rather than the same
  // answer being submitted again.
  await session.expect(
    "The run did not accept the last assessment: ASSESSMENT_FORMAT",
  );
  await session.expect("cover every file project-docs should? [Y/n]: ");
  session.press("\x03");
  assert.equal(await session.exit(), 130);
});
