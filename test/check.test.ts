import type {
  CheckErrorDetails,
  CheckReport,
  ErrorReport,
  Lock,
  OperationLog,
  Run,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { TestContext } from "node:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { directoryFixture, installCli, snapshot } from "./installed-cli.ts";
import { registryFixture } from "./registry-fixture.ts";
import {
  commit,
  git,
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

// Each check runs the source's script with a literal argument, and its probe
// can run the code in PROBE_MUTATION and report FIXTURE_VERSION.
const scripted = {
  script: "scripts/run.mjs",
  arguments: ["literal argument"],
  prerequisite: {
    "version-arguments": [
      "-e",
      'eval(process.env.PROBE_MUTATION ?? ""); console.log(process.env.FIXTURE_VERSION ?? process.version)',
    ],
    version: ">=24.0.0",
  },
};

// Each check reports the status CHECK_MODES names for its ID, passing by
// default, and runs the code in CHECK_MUTATION first. Fixes record that they ran in an
// ignored log, which no check observes.
const script = `import { appendFileSync, chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
const input = JSON.parse(readFileSync(0, 'utf8'));
console.error(JSON.stringify({ input, cwd: process.cwd(), args: process.argv.slice(2) }));
const result = (status, message) => console.log(JSON.stringify({ format: 'repo-standards/result/v2', status, message }));
if (input.operation.phase === 'fixes') {
  mkdirSync('ignored', { recursive: true });
  appendFileSync('ignored/fixes.log', input.operation.id + '\\n');
  result('unchanged', 'Nothing to fix');
} else {
  eval(process.env.CHECK_MUTATION ?? '');
  const mode = JSON.parse(process.env.CHECK_MODES ?? '{}')[input.operation.id] ?? 'passed';
  if (mode === 'malformed') console.log('not json');
  else if (mode === 'exit') process.exit(3);
  else if (mode === 'multiline') result('failed', 'first line\\npassed  zulu/forged: second line\\r\\nthird line');
  else if (mode === 'multiple results') console.log('{}\\n{}');
  else if (mode === 'retired version') console.log(JSON.stringify({ format: 'repo-standards/result/v1', status: 'passed', message: '' }));
  else if (mode === 'wrong status') result('unchanged', 'A fix status');
  else result(mode, \`\${input.operation.id} \${mode}\`);
}
`;

async function adopted(t: TestContext, profile = "work") {
  const f = await adoptionFixture(
    t,
    cli,
    manifest(
      {
        instructions: {
          kind: "file",
          target: "AGENTS.md",
          exact: "agents.md",
          fixes: [operation("fix", scripted)],
          checks: [operation("first", scripted), operation("second", scripted)],
        },
        zulu: {
          kind: "skill",
          name: "review",
          source: "skill",
          checks: [operation("third", scripted)],
        },
      },
      { [profile]: {} },
    ),
    {
      files: {
        "agents.md": "Instructions",
        "scripts/run.mjs": script,
        "skill/SKILL.md": "# Review",
      },
      project: { "README.md": "Project", ".gitignore": "ignored/\n" },
      registry,
    },
  );
  const { project, env } = f;
  const run = (args: string[], extra: NodeJS.ProcessEnv = {}) =>
    f.run(args, { ...env, ...extra });
  const args = inspectionArgs.map((arg) => (arg === "work" ? profile : arg));
  return {
    project,
    env,
    run,
    adopt(extra: NodeJS.ProcessEnv = {}) {
      const inspection = f.inspect(args);
      const started = run(startArgs(inspection.identity, args), extra);
      return { started, report: JSON.parse(started.stdout) as Run, inspection };
    },
  };
}

test("check runs every retained check with a run's inputs, reports each result, and changes nothing", async (t) => {
  const f = await adopted(t);
  const { started, inspection } = f.adopt();
  assert.equal(started.status, 0, started.stdout + started.stderr);
  commit(f.project.root);
  writeFileSync(join(f.project.root, "README.md"), "Uncommitted work");
  const fixes = readFileSync(join(f.project.root, "ignored/fixes.log"), "utf8");
  const head = git(f.project.root, "rev-parse", "HEAD");
  const index = git(f.project.root, "ls-files", "--stage", "-v");
  const status = git(
    f.project.root,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  );
  const before = snapshot(f.project.root);

  // The checks were confirmed at adoption: no confirmation, source, or registry is needed.
  const passed = cli.run(["check", "--json"], f.project.root, process.env);
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  const report = JSON.parse(passed.stdout) as CheckReport;
  assert.equal(report.format, "repo-standards/check/v1");
  assert.equal(report.outcome, "passed");
  assert.deepEqual(report.selection, inspection.selection);
  assert.deepEqual(
    report.checks.map(
      (result: {
        declaration: string;
        id: string;
        status: string;
        message: string;
        error: string | null;
      }) => [
        result.declaration,
        result.id,
        result.status,
        result.message,
        result.error,
      ],
    ),
    [
      ["instructions", "first", "passed", "first passed", null],
      ["instructions", "second", "passed", "second passed", null],
      ["zulu", "third", "passed", "third passed", null],
    ],
  );
  const evidence = JSON.parse(
    readFileSync(join(f.project.root, report.checks[0]!.stderr), "utf8"),
  ) as OperationLog;
  assert.equal(evidence.cwd, f.project.root);
  assert.deepEqual(evidence.args, ["literal argument"]);
  assert.equal(evidence.input.format, "repo-standards/operation/v2");
  assert.equal(evidence.input.overwriteAllowed, false);
  assert.deepEqual(evidence.input.operation, {
    declaration: "instructions",
    phase: "checks",
    id: "first",
  });
  assert.equal(evidence.input.projectRoot, f.project.root);
  assert.deepEqual(evidence.input.standards, inspection.selection.standards);
  assert.equal(evidence.input.profile, "work");
  assert.deepEqual(
    evidence.input.declarations,
    inspection.resolved.declarations,
  );
  assert.deepEqual(evidence.input.allowedTargets, {
    paths: ["AGENTS.md"],
    directories: [],
  });
  assert.deepEqual(
    (
      JSON.parse(
        readFileSync(join(f.project.root, report.checks[2]!.stderr), "utf8"),
      ) as OperationLog
    ).input.allowedTargets,
    { paths: [], directories: [".agents/skills/review"] },
  );
  assert.equal(
    readFileSync(join(f.project.root, "ignored/fixes.log"), "utf8"),
    fixes,
    "no fix runs",
  );

  // Only the ignored local logs differ; committed state, HEAD and the index do not.
  rmSync(join(f.project.root, ".repo-standards/local/checks"), {
    recursive: true,
  });
  assert.deepEqual(snapshot(f.project.root), before);
  assert.equal(git(f.project.root, "rev-parse", "HEAD"), head);
  assert.equal(git(f.project.root, "ls-files", "--stage", "-v"), index);
  assert.equal(
    git(f.project.root, "status", "--porcelain=v1", "--untracked-files=all"),
    status,
  );

  const summary = cli.run(["check"], f.project.root, process.env);
  assert.equal(summary.status, 0, summary.stderr);
  assert.equal(
    summary.stdout,
    "Checks of https://github.com/alice/standards v1.0.0, profile work: 3 passed.\n" +
      "passed  instructions/first: first passed\npassed  instructions/second: second passed\npassed  zulu/third: third passed\n",
  );
});

test("check fails when any check fails, is blocked, or returns a malformed result, and still runs every check", async (t) => {
  const f = await adopted(t);
  assert.equal(f.adopt().started.status, 0);
  commit(f.project.root);
  const cases = [
    {
      modes: { first: "failed" },
      statuses: ["failed", "passed", "passed"],
      errors: [null, null, null],
    },
    {
      modes: { second: "blocked" },
      statuses: ["passed", "blocked", "passed"],
      errors: [null, null, null],
    },
    {
      modes: { first: "malformed", third: "exit" },
      statuses: ["error", "passed", "error"],
      errors: ["PROTOCOL_ERROR", null, "NONZERO_EXIT"],
    },
    // Every way to break the result protocol is a protocol error.
    {
      modes: {
        first: "multiple results",
        second: "retired version",
        third: "wrong status",
      },
      statuses: ["error", "error", "error"],
      errors: ["PROTOCOL_ERROR", "PROTOCOL_ERROR", "PROTOCOL_ERROR"],
    },
    // Only a fix may ask for confirmation to overwrite a setting.
    {
      modes: { second: "confirmation-required" },
      statuses: ["passed", "error", "passed"],
      errors: [null, "PROTOCOL_ERROR", null],
    },
  ];
  for (const example of cases)
    await t.test(JSON.stringify(example.modes), () => {
      const result = cli.run(["check", "--json"], f.project.root, {
        ...process.env,
        CHECK_MODES: JSON.stringify(example.modes),
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const report = JSON.parse(result.stdout) as CheckReport;
      assert.equal(report.outcome, "failed");
      assert.deepEqual(
        report.checks.map((check: { status: string }) => check.status),
        example.statuses,
      );
      assert.deepEqual(
        report.checks.map((check: { error: string | null }) => check.error),
        example.errors,
      );
    });
  // The readable summary counts the outcomes and gives each check a line
  // naming its outcome, any error code, and the logs to read.
  const summary = cli.run(["check"], f.project.root, {
    ...process.env,
    CHECK_MODES: JSON.stringify({ first: "failed", third: "malformed" }),
  });
  assert.equal(summary.status, 1);
  const [heading, ...lines] = summary.stdout.trimEnd().split("\n");
  assert.ok(heading!.endsWith(": 1 passed, 1 failed, 1 error."), heading);
  assert.equal(lines.length, 3);
  assert.ok(
    lines[0]!.startsWith("failed  instructions/first: ") &&
      lines[0]!.includes(
        ".repo-standards/local/checks/0.stdout, .repo-standards/local/checks/0.stderr",
      ),
    lines[0],
  );
  assert.ok(lines[1]!.startsWith("passed  instructions/second: "), lines[1]);
  assert.ok(
    lines[2]!.startsWith("error   zulu/third: ") &&
      lines[2]!.includes("PROTOCOL_ERROR") &&
      lines[2]!.includes(
        ".repo-standards/local/checks/2.stdout, .repo-standards/local/checks/2.stderr",
      ),
    lines[2],
  );
});

test("the readable summary keeps each check on one line while JSON keeps its message", async (t) => {
  const f = await adopted(t);
  assert.equal(f.adopt().started.status, 0);
  commit(f.project.root);
  const env = {
    ...process.env,
    CHECK_MODES: JSON.stringify({ second: "multiline" }),
  };
  const json = cli.run(["check", "--json"], f.project.root, env);
  assert.equal(json.status, 1);
  assert.equal(
    (JSON.parse(json.stdout) as CheckReport).checks[1]!.message,
    "first line\npassed  zulu/forged: second line\r\nthird line",
  );
  const readable = cli.run(["check"], f.project.root, env);
  assert.equal(readable.status, 1);
  assert.equal(
    readable.stdout.split("\n")[2],
    "failed  instructions/second: first line passed  zulu/forged: second line third line" +
      " Output: .repo-standards/local/checks/1.stdout, .repo-standards/local/checks/1.stderr",
  );
  assert.equal(readable.stdout.split("\n").length, 5);
});

test("the readable summary keeps the profile on one line while JSON keeps it", async (t) => {
  const profile = "work\npassed  zulu/forged: injected";
  const f = await adopted(t, profile);
  const { started } = f.adopt();
  assert.equal(started.status, 0, started.stdout + started.stderr);
  commit(f.project.root);
  const json = cli.run(["check", "--json"], f.project.root, process.env);
  assert.equal(json.status, 0, json.stdout + json.stderr);
  assert.equal(
    (JSON.parse(json.stdout) as CheckReport).selection.profile,
    profile,
  );
  const readable = cli.run(["check"], f.project.root, process.env);
  assert.equal(readable.status, 0, readable.stderr);
  const lines = readable.stdout.split("\n");
  assert.equal(
    lines[0],
    "Checks of https://github.com/alice/standards v1.0.0, profile work passed  zulu/forged: injected: 3 passed.",
  );
  assert.equal(lines.length, 5);
});

test("check probes the checks' prerequisites as a run does", async (t) => {
  const f = await adopted(t);
  assert.equal(f.adopt().started.status, 0);
  commit(f.project.root);
  const result = cli.run(["check", "--json"], f.project.root, {
    ...process.env,
    FIXTURE_VERSION: "23.0.0",
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
  assert.equal(error!.code, "PREREQUISITES_BLOCKED");
  assert.deepEqual(
    (
      error!.details as { phase: string; operation: string; code: string }[]
    ).map((probe: { phase: string; operation: string; code: string }) => [
      probe.phase,
      probe.operation,
      probe.code,
    ]),
    [
      ["checks", "first", "VERSION_INCOMPATIBLE"],
      ["checks", "second", "VERSION_INCOMPATIBLE"],
      ["checks", "third", "VERSION_INCOMPATIBLE"],
    ],
  );
  assert.equal(
    existsSync(join(f.project.root, ".repo-standards/local/checks")),
    false,
  );
});

test("a check that changes the working tree, product state, HEAD or the index fails check and names the changes", async (t) => {
  const f = await adopted(t);
  assert.equal(f.adopt().started.status, 0);
  commit(f.project.root);
  const cases = [
    ["tracked file", `writeFileSync('README.md', 'Mutated')`, ["README.md"]],
    ["new file", `writeFileSync('NEW.txt', 'New')`, ["NEW.txt"]],
    [
      "product state",
      `writeFileSync('.repo-standards/inputs/added.txt', 'Added')`,
      [".repo-standards/inputs/added.txt"],
    ],
    [
      "index",
      `writeFileSync('NEW.txt', 'New'); execFileSync('git', ['add', 'NEW.txt'])`,
      ["@git/index", "NEW.txt"],
    ],
    [
      "HEAD",
      `execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'x'])`,
      ["@git/HEAD"],
    ],
  ] as const;
  for (const [name, mutation, paths] of cases)
    await t.test(name, () => {
      const env = {
        ...process.env,
        CHECK_MUTATION: `if (input.operation.id === 'second') { ${mutation}; }`,
      };
      const restore = () => {
        git(
          f.project.root,
          "reset",
          "--quiet",
          "--hard",
          name === "HEAD" ? "HEAD~1" : "HEAD",
        );
        git(f.project.root, "clean", "--quiet", "-fd");
        rmSync(join(f.project.root, ".repo-standards/local/checks"), {
          recursive: true,
          force: true,
        });
      };
      const result = cli.run(["check", "--json"], f.project.root, env);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
      assert.equal(error!.code, "CHECK_MUTATION");
      assert.match(
        error!.message,
        /^Check instructions\/second changed the project: /,
      );
      assert.deepEqual((error!.details as CheckErrorDetails).paths, paths);
      for (const path of paths)
        assert.ok(error!.message.includes(path), error!.message);
      assert.equal(
        existsSync(
          join(f.project.root, ".repo-standards/local/checks/2.stderr"),
        ),
        false,
        "later checks do not run",
      );
      restore();
      const readable = cli.run(["check"], f.project.root, env);
      assert.equal(readable.status, 1);
      assert.match(
        readable.stderr,
        /^\[CHECK_MUTATION\] Check instructions\/second changed the project/,
      );
      restore();
    });
});

test("a check that leaves the project unsafe or unreadable to observe fails check with a mutation diagnostic", async (t) => {
  const f = await adopted(t);
  assert.equal(f.adopt().started.status, 0);
  commit(f.project.root);
  const index = join(f.project.root, ".git/index");
  const saved = readFileSync(index);
  const cases = [
    [
      "corrupted index",
      `writeFileSync('.git/index', 'corrupted')`,
      "PROJECT_READ",
      ["@git/index"],
      "@git/index",
    ],
    [
      "symbolic target",
      `rmSync('AGENTS.md'); symlinkSync('README.md', 'AGENTS.md')`,
      "UNSAFE_TARGET",
      [],
      "AGENTS.md",
    ],
    [
      "nested Git metadata",
      `mkdirSync('.agents/skills/review/.git')`,
      "OBSERVATION_UNSAFE",
      [],
      "Nested Git metadata",
    ],
    [
      "unsafe product state",
      `writeFileSync('.repo-standards/cache', 'Not a directory')`,
      "FINAL_INTEGRITY",
      [".repo-standards/cache"],
      ".repo-standards/cache",
    ],
    [
      "replaced local directory",
      `rmSync('.repo-standards/local', { recursive: true }); symlinkSync('..', '.repo-standards/local')`,
      "FINAL_INTEGRITY",
      [".repo-standards", ".repo-standards/local"],
      ".repo-standards/local",
    ],
  ] as const;
  for (const [name, mutation, cause, paths, named] of cases)
    await t.test(name, () => {
      const result = cli.run(["check", "--json"], f.project.root, {
        ...process.env,
        CHECK_MUTATION: `if (input.operation.id === 'second') { ${mutation}; }`,
      });
      writeFileSync(index, saved);
      for (const path of [
        ".agents/skills/review/.git",
        ".repo-standards/cache",
        ".repo-standards/local",
      ])
        rmSync(join(f.project.root, path), { recursive: true, force: true });
      git(f.project.root, "reset", "--quiet", "--hard");
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
      assert.equal(error!.code, "CHECK_MUTATION");
      assert.match(
        error!.message,
        /^Check instructions\/second left the project unsafe or unreadable/,
      );
      assert.equal((error!.details as CheckErrorDetails).cause.code, cause);
      assert.deepEqual((error!.details as CheckErrorDetails).paths, paths);
      assert.ok(error!.message.includes(named), error!.message);
      assert.equal(
        existsSync(
          join(f.project.root, ".repo-standards/local/checks/2.stderr"),
        ),
        false,
        "later checks do not run",
      );
    });
  // A non-root process cannot read a directory without permissions, and the
  // observation fails with the system error rather than a product diagnostic.
  await t.test(
    "unreadable target directory",
    { skip: process.getuid?.() === 0 },
    () => {
      const skill = join(f.project.root, ".agents/skills/review");
      const mode = lstatSync(skill).mode & 0o7777;
      let result;
      try {
        result = cli.run(["check", "--json"], f.project.root, {
          ...process.env,
          CHECK_MUTATION: `if (input.operation.id === 'second') chmodSync('.agents/skills/review', 0o000);`,
        });
      } finally {
        chmodSync(skill, mode);
        rmSync(join(f.project.root, ".repo-standards/local/checks"), {
          recursive: true,
          force: true,
        });
      }
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
      assert.equal(error!.code, "CHECK_MUTATION");
      assert.match(
        error!.message,
        /^Check instructions\/second left the project unsafe or unreadable/,
      );
      assert.equal((error!.details as CheckErrorDetails).cause.code, "EACCES");
      assert.match(
        (error!.details as CheckErrorDetails).cause.message,
        /EACCES/,
      );
    },
  );
  await t.test("initial observation", () => {
    writeFileSync(index, "corrupted");
    const result = cli.run(["check", "--json"], f.project.root, process.env);
    writeFileSync(index, saved);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    // Before any check runs, an unreadable project is a read failure, not a mutation.
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      "PROJECT_READ",
    );
  });
  await t.test("initial unsafe product state", () => {
    const cache = join(f.project.root, ".repo-standards/cache");
    writeFileSync(cache, "Not a directory");
    const result = cli.run(["check", "--json"], f.project.root, process.env);
    rmSync(cache);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
    assert.equal(error!.code, "FINAL_INTEGRITY");
    assert.equal(
      existsSync(join(f.project.root, ".repo-standards/local/checks/0.stderr")),
      false,
      "no check runs",
    );
  });
});

test("a prerequisite probe that writes, or a check that leaves its process group running, fails check", async (t) => {
  const f = await adopted(t);
  assert.equal(f.adopt().started.status, 0);
  commit(f.project.root);
  await t.test("probe", () => {
    const result = cli.run(["check", "--json"], f.project.root, {
      ...process.env,
      PROBE_MUTATION: `require('node:fs').writeFileSync('PROBED.txt', 'Probe')`,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
    assert.equal(error!.code, "CHECK_MUTATION");
    assert.match(
      error!.message,
      /^A prerequisite probe changed the project: PROBED\.txt\./,
    );
    assert.equal(
      existsSync(join(f.project.root, ".repo-standards/local/checks")),
      false,
      "no check runs",
    );
    rmSync(join(f.project.root, "PROBED.txt"));
  });
  await t.test(
    "probe leaves a target directory unreadable",
    { skip: process.getuid?.() === 0 },
    () => {
      const skill = join(f.project.root, ".agents/skills/review");
      const mode = lstatSync(skill).mode & 0o7777;
      let result;
      try {
        result = cli.run(["check", "--json"], f.project.root, {
          ...process.env,
          PROBE_MUTATION: `require('node:fs').chmodSync('.agents/skills/review', 0o000)`,
        });
      } finally {
        chmodSync(skill, mode);
      }
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
      assert.equal(error!.code, "CHECK_MUTATION");
      assert.match(
        error!.message,
        /^A prerequisite probe left the project unsafe or unreadable/,
      );
      assert.equal((error!.details as CheckErrorDetails).cause.code, "EACCES");
      assert.equal(
        existsSync(
          join(f.project.root, ".repo-standards/local/checks/0.stderr"),
        ),
        false,
        "no check runs",
      );
    },
  );
  await t.test("surviving process", (st) => {
    // The process the check leaves behind lives until the test removes the
    // directory it watches.
    const held = directoryFixture("repo-standards-held-");
    st.after(() => held.close());
    const survivor = `const { existsSync } = require('node:fs'); const wait = setInterval(() => { if (!existsSync(${JSON.stringify(held.root)})) clearInterval(wait); }, 10);`;
    const result = cli.run(["check", "--json"], f.project.root, {
      ...process.env,
      CHECK_MUTATION: `if (input.operation.id === 'first') spawn(process.execPath, ['-e', ${JSON.stringify(survivor)}], { stdio: 'ignore' }).unref();`,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
    assert.equal(error!.code, "AUTHOR_PROCESS_ACTIVE");
    assert.match(
      error!.message,
      /^Check instructions\/first left author process group \d+ with live processes/,
    );
    assert.equal(
      existsSync(join(f.project.root, ".repo-standards/local/checks/1.stderr")),
      false,
      "later checks do not run",
    );
  });
});

test("check fails with the existing diagnostics without a complete adoption, during a run, under another CLI, or with changed retained inputs", async (t) => {
  const f = await adopted(t);
  const check = () => {
    const result = cli.run(["check", "--json"], f.project.root, {
      ...process.env,
      CHECK_MODES: JSON.stringify({ first: "failed" }),
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    return (JSON.parse(result.stdout) as ErrorReport).errors[0] as {
      code: string;
      message: string;
    };
  };
  await t.test("no adoption", () => assert.equal(check().code, "NO_SELECTION"));
  await t.test("active run", () => {
    const { started, report } = f.adopt({
      CHECK_MODES: JSON.stringify({ first: "failed" }),
    });
    assert.equal(started.status, 1);
    assert.match(report.reason, /CHECKS_FAILED/);
    const active = snapshot(f.project.root);
    assert.equal(check().code, "ACTIVE_RUN");
    assert.deepEqual(snapshot(f.project.root), active);
    assert.equal(
      (JSON.parse(f.run(["abandon", "--json"]).stdout) as Run).abandoned,
      true,
    );
    git(f.project.root, "clean", "--quiet", "-fdx", "--exclude=ignored");
  });
  assert.equal(f.adopt().started.status, 0);
  commit(f.project.root);
  await t.test("another CLI", () => {
    const lock = join(f.project.root, ".repo-standards/lock.json");
    const original = readFileSync(lock, "utf8");
    const value = JSON.parse(original) as Lock;
    value.selection.cli.version = "0.0.1";
    writeFileSync(lock, JSON.stringify(value));
    const error = check();
    assert.equal(error.code, "CLI_PIN_MISMATCH");
    assert.match(error.message, / 0\.0\.1/);
    writeFileSync(lock, original);
  });
  // Locating the project and its run record needs only rev-parse; the fake
  // passes that to the real Git and records any other Git command.
  const fakeGit = (bin: string, unexpected: string) => {
    const real = execFileSync("sh", ["-c", "command -v git"], {
      encoding: "utf8",
    }).trim();
    writeFileSync(
      join(bin, "git"),
      `#!${process.execPath}
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args.join(' ') === '--version') console.log('git version 2.31.8');
else if (args.includes('rev-parse')) process.exit(spawnSync(${JSON.stringify(real)}, args, { stdio: 'inherit' }).status ?? 1);
else { appendFileSync(${JSON.stringify(unexpected)}, args.join(' ') + '\\n'); process.exit(99); }
`,
      { mode: 0o755 },
    );
  };
  await t.test("unsupported Git", () => {
    const bin = directoryFixture("repo-standards-git-");
    const unexpected = join(bin.root, "unexpected-git-access");
    fakeGit(bin.root, unexpected);
    try {
      for (const json of [true, false]) {
        const result = cli.run(
          ["check", ...(json ? ["--json"] : [])],
          f.project.root,
          { ...process.env, PATH: `${bin.root}:${process.env.PATH}` },
        );
        assert.equal(result.status, 1, result.stdout + result.stderr);
        const message = json
          ? (JSON.parse(result.stdout) as ErrorReport).errors[0]!.message
          : result.stderr;
        if (json)
          assert.equal(
            (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
            "GIT_VERSION_UNSUPPORTED",
          );
        else assert.match(result.stderr, /^\[GIT_VERSION_UNSUPPORTED\] /);
        assert.match(message, /2\.31\.8.*2\.32/);
      }
      assert.equal(
        lstatSync(unexpected, { throwIfNoEntry: false }),
        undefined,
        "only rev-parse and the version probe run",
      );
      assert.equal(
        existsSync(join(f.project.root, ".repo-standards/local/checks")),
        false,
        "no check runs",
      );
    } finally {
      bin.close();
    }
  });
  await t.test("unsupported Git under another CLI", () => {
    const bin = directoryFixture("repo-standards-git-");
    const unexpected = join(bin.root, "unexpected-git-access");
    fakeGit(bin.root, unexpected);
    const lock = join(f.project.root, ".repo-standards/lock.json");
    const original = readFileSync(lock, "utf8");
    const value = JSON.parse(original) as Lock;
    value.selection.cli.version = "0.0.1";
    writeFileSync(lock, JSON.stringify(value));
    let result;
    try {
      result = cli.run(["check", "--json"], f.project.root, {
        ...process.env,
        PATH: `${bin.root}:${process.env.PATH}`,
      });
    } finally {
      writeFileSync(lock, original);
      bin.close();
    }
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
    assert.equal(error!.code, "CLI_PIN_MISMATCH");
    assert.match(error!.message, / 0\.0\.1/);
  });
  // A non-root process cannot register in a Git directory without write access.
  await t.test(
    "unwritable Git directory",
    { skip: process.getuid?.() === 0 },
    () => {
      const gitDirectory = join(f.project.root, ".git");
      chmodSync(gitDirectory, 0o555);
      let json, readable;
      try {
        json = cli.run(["check", "--json"], f.project.root, process.env);
        readable = cli.run(["check"], f.project.root, process.env);
      } finally {
        chmodSync(gitDirectory, 0o755);
      }
      assert.equal(json.status, 1, json.stdout + json.stderr);
      const report = JSON.parse(json.stdout) as ErrorReport;
      assert.equal(report.valid, false);
      assert.equal(report.errors[0]!.code, "CHECK_FAILED");
      assert.match(report.errors[0]!.message, /EACCES/);
      assert.equal(json.stderr, "");
      assert.equal(readable.status, 1);
      assert.match(readable.stderr, /^\[CHECK_FAILED\] .*EACCES/);
      assert.doesNotMatch(readable.stderr, /\n\s+at /, "no stack trace");
    },
  );
  await t.test("changed retained check", () => {
    const retained = join(
      f.project.root,
      ".repo-standards/inputs/source/scripts/run.mjs",
    );
    writeFileSync(retained, 'console.log("tampered")');
    assert.equal(check().code, "STATE_INTEGRITY");
    git(f.project.root, "checkout", "--quiet", ".");
  });
});
