import type { Status } from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { directoryFixture, installCli } from "./installed-cli.ts";
import { operation } from "./remote-fixture.ts";
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
  assert.match(
    await session.expect("Version [v1.1.0]: "),
    /Which standards version should the project adopt\?[\s\S]*Stable releases: v1\.1\.0, v1\.0\.0/,
  );
  session.type("");
  assert.match(
    await session.expect("Profile: "),
    /Which profile should the project adopt\?[\s\S]*work: work\n[\s\S]*personal: personal\n/,
  );
  session.type("missing");
  await session.expect("Choose one of: work, personal.");
  await session.expect("Profile: ");
  session.type("work");

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
  const walk = await session.expect(
    "Edit the files now. Press Enter when you are done, or type blocked: ",
  );
  assert.match(walk, /Edit only: app\/README\.md/);
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  session.type("");
  assert.match(
    await session.expect(
      "Does its confirmed scope, app/README.md, still cover every file project-docs should? [Y/n]: ",
    ),
    /project-docs declares no checks\./,
  );
  session.type("");
  await session.expect("Is project-docs done? [Y/n/blocked]: ");
  session.type("");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  const [judgment] = status(f).assessments![0]!.declarations;
  assert.equal(
    (judgment as { scopeValidity: { current: { status: string } } })
      .scopeValidity.current.status,
    "valid",
  );
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
  assert.ok(
    (
      await session.expect("Allow the fix to overwrite the setting? [y/N]: ")
    ).includes(message),
  );
  assert.equal(existsSync(log), false);
  session.type("y");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  assert.equal(readFileSync(log, "utf8"), "rebase\n");
});

test("a scope the person reports incomplete stops the run, which the person abandons", async (t) => {
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
  await session.expect("Press Enter when you are done, or type blocked: ");
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  session.type("");
  await session.expect("still cover every file project-docs should? [Y/n]: ");
  session.type("n");
  await session.expect("File: ");
  session.type("tools/README.md");
  await session.expect("File: ");
  session.type("");
  await session.expect("Is project-docs done? [Y/n/blocked]: ");
  session.type("");
  assert.match(
    await session.expect("Abandon the run, or stop? [abandon/stop]: "),
    /The run is incomplete: SCOPE_INCOMPLETE: /,
  );
  session.type("abandon");
  await session.expect("Abandoned the run.");
  assert.equal(await session.exit(), 1);
  assert.equal(status(f).active, null);
  // The run's work stays in the project.
  assert.equal(readFileSync(join(f.root, "app/README.md"), "utf8"), "# App\n");
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
  // A drafted exclusion the person lists is included, and a path keeps its
  // spaces.
  await list("app/README.md", "tools/README.md", "docs/User Guide.md");
  await session.expect("Start the run? [Y/n]: ");
  session.type("");
  const walk = await session.expect(
    "Press Enter when you are done, or type blocked: ",
  );
  const targets = /Edit only: (.*)\n/.exec(walk)![1]!.split(", ").sort();
  assert.deepEqual(targets, [
    "app/README.md",
    "docs/User Guide.md",
    "tools/README.md",
  ]);
  session.press("\x03");
  assert.equal(await session.exit(), 130);
});

test("a failed check outside contextual work stops the session instead of assessing again", async (t) => {
  const f = await fixture(
    t,
    cli,
    {
      "agent-guidance": {
        kind: "file",
        target: "AGENTS.md",
        exact: "content/AGENTS.md",
        checks: [operation("tooling", { script: "checks/tooling.mjs" })],
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
        "checks/tooling.mjs": `console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: 'failed', message: 'The tool is missing.' }));
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
  assert.match(
    await session.expect("then run adopt again."),
    /Failed: agent-guidance\/tooling: The tool is missing\.\nThese checks are not of contextual work/,
  );
  assert.equal(await session.exit(), 1);
  assert.match(
    status(f).active!.reason,
    /CHECKS_FAILED: .*agent-guidance\/tooling/,
  );
});
