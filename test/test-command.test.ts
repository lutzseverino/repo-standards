import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { terminalSession } from "./terminal.ts";

const repository = fileURLToPath(new URL("../", import.meta.url));
const setting = "REPO_STANDARDS_TEST_CONCURRENCY";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "repo-standards-test-command-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["test", "scripts", "site"])
    mkdirSync(join(root, directory));
  const { scripts } = JSON.parse(
    readFileSync(join(repository, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  // Exercise the real command chain, with unrelated validation stages inert.
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      type: "module",
      scripts: {
        ...Object.fromEntries(
          ["typecheck", "lint", "format:check", "build"].map((name) => [
            name,
            'node -e ""',
          ]),
        ),
        test: scripts.test,
        validate: scripts.validate,
      },
    }),
  );
  const site = JSON.parse(
    readFileSync(join(repository, "site/package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  writeFileSync(
    join(root, "site/package.json"),
    JSON.stringify({
      scripts: {
        ...Object.fromEntries(
          ["ui:check", "check", "test", "build:fixture"].map((name) => [
            name,
            'node -e ""',
          ]),
        ),
        validate: site.scripts.validate,
      },
    }),
  );
  writeFileSync(join(root, "scripts/check-import-cycles.ts"), "");
  const runner = join(repository, "scripts/run-tests.ts");
  if (existsSync(runner)) cpSync(runner, join(root, "scripts/run-tests.ts"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    pnpm_config_verify_deps_before_run: "false",
  };
  delete env[setting];
  // Do not inherit the outer Node test worker's context into a new test runner.
  delete env.NODE_TEST_CONTEXT;
  return {
    root,
    run: (command: string, concurrency?: string, args: string[] = []) =>
      spawnSync("pnpm", [command, ...args], {
        cwd: root,
        env: {
          ...env,
          ...(concurrency === undefined ? {} : { [setting]: concurrency }),
        },
        encoding: "utf8",
        timeout: 30_000,
      }),
  };
}

for (const command of ["test", "validate"]) {
  test(`${command} limits simultaneous test files with the configured bound`, (t) => {
    const { root, run } = fixture(t);
    // Each process creates a unique live marker, observes its peers, and leaves.
    // Each batch waits for its peers within a finite budget, so a slow worker
    // cannot make correct scheduling look serialized. The event log observes
    // actual file execution rather than runner arguments.
    const source = `
      import { appendFileSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
      import { setTimeout } from 'node:timers/promises';
      const marker = 'live-' + process.pid;
      writeFileSync(marker, '');
      const expected = Number(readFileSync('expected', 'utf8'));
      const index = Number(new URL(import.meta.url).pathname.split('/').pop().split('.')[0]);
      const batch = Math.floor(index / expected);
      const batchSize = Math.min(expected, 4 - batch * expected);
      writeFileSync('ready/' + batch + '-' + index, '');
      const deadline = Date.now() + 10_000;
      while (readdirSync('ready').filter(n => n.startsWith(batch + '-')).length < batchSize) {
        if (Date.now() > deadline) throw Error('test workers did not reach their bounded barrier');
        await setTimeout(20);
      }
      appendFileSync('events', JSON.stringify({ file: import.meta.url, active: readdirSync('.').filter(n => n.startsWith('live-')).length }) + '\\n');
      await setTimeout(400);
      unlinkSync(marker);
    `;
    for (let index = 0; index < 4; index++)
      writeFileSync(join(root, `test/${index}.test.ts`), source);
    writeFileSync(
      join(root, "test/not-a-test.ts"),
      "throw Error('unselected');",
    );
    mkdirSync(join(root, "test/nested"));
    writeFileSync(
      join(root, "test/nested/unselected.test.ts"),
      "throw Error('nested');",
    );
    for (const bound of ["1", "2", undefined]) {
      const expected =
        bound === undefined
          ? Math.min(4, Math.max(1, availableParallelism() - 1))
          : Number(bound);
      rmSync(join(root, "ready"), { recursive: true, force: true });
      mkdirSync(join(root, "ready"));
      writeFileSync(join(root, "expected"), String(expected));
      writeFileSync(join(root, "events"), "");
      const result = run(command, bound);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const events = readFileSync(join(root, "events"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { file: string; active: number });
      assert.equal(new Set(events.map((event) => event.file)).size, 4);
      assert.ok(events.every((event) => event.active <= expected));
      assert.equal(Math.max(...events.map((event) => event.active)), expected);
    }
  });
}

test("normal commands reject invalid concurrency before any test file starts", (t) => {
  const { root, run } = fixture(t);
  writeFileSync(
    join(root, "test/started.test.ts"),
    "import { writeFileSync } from 'node:fs'; writeFileSync('started', '');",
  );
  for (const value of [
    "",
    "0",
    "-1",
    "1.5",
    "no",
    " 2",
    "2e1",
    "9007199254740992",
  ]) {
    const result = run("test", value);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(
      result.stderr,
      /REPO_STANDARDS_TEST_CONCURRENCY must be a positive/,
    );
    assert.equal(existsSync(join(root, "started")), false);
  }
  const validation = run("validate", "0");
  assert.equal(validation.status, 1, validation.stdout + validation.stderr);
  assert.match(
    validation.stderr,
    /REPO_STANDARDS_TEST_CONCURRENCY must be a positive/,
  );
  assert.equal(existsSync(join(root, "started")), false);
});

test("normal commands preserve test failures and forward test-name filtering", (t) => {
  const { root, run } = fixture(t);
  writeFileSync(
    join(root, "test/failure.test.ts"),
    `import test from 'node:test';
     test('passing case', () => console.log('selected case'));
     test('failing case', () => { throw Error('fixture test failure'); });`,
  );
  for (const command of ["test", "validate"]) {
    const failure = run(command, "1");
    assert.equal(failure.status, 1, failure.stdout + failure.stderr);
    assert.match(failure.stdout + failure.stderr, /fixture test failure/);
  }
  const filtered = run("test", "1", ["--test-name-pattern=passing case"]);
  assert.equal(filtered.status, 0, filtered.stdout + filtered.stderr);
  assert.match(filtered.stdout, /selected case/);
});

async function waitFor(check: () => boolean, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    assert.ok(
      Date.now() < deadline,
      "condition did not settle within its bound",
    );
    await setTimeout(20);
  }
}

function running(pid: number) {
  try {
    process.kill(pid, 0);
    // Minimal containers may leave dead orphans unreaped by PID 1. A zombie
    // cannot execute fixture work and must not be mistaken for a live worker.
    const state = spawnSync("ps", ["-p", String(pid), "-o", "stat="], {
      encoding: "utf8",
      timeout: 2_000,
    });
    assert.equal(state.error, undefined);
    return state.status === 0 && !state.stdout.trim().startsWith("Z");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`the test launcher forwards ${signal} and leaves no test worker`, async (t) => {
    const { root } = fixture(t);
    writeFileSync(
      join(root, "test/stalled.test.ts"),
      `import { writeFileSync } from 'node:fs';
       writeFileSync('worker', String(process.pid));
       setInterval(() => {}, 1000);`,
    );
    const child = spawn(process.execPath, ["scripts/run-tests.ts"], {
      cwd: root,
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, [setting]: "1" },
      detached: true,
      stdio: "ignore",
    });
    t.after(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        /* already gone */
      }
    });
    const exited = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });
    await waitFor(() => existsSync(join(root, "worker")));
    const worker = Number(readFileSync(join(root, "worker"), "utf8"));
    child.kill(signal);
    const result = await Promise.race([
      exited,
      setTimeout(5_000, undefined, { ref: false }).then(() => {
        throw Error("cancellation did not finish");
      }),
    ]);
    assert.ok(
      result.signal === signal || (result.code !== null && result.code !== 0),
    );
    await waitFor(() => !running(worker));
  });
}

for (const progress of [false, true]) {
  test(`terminal missing-prompt waits stay finite for a ${progress ? "busy" : "stalled"} command and clean up`, async (t) => {
    const { root } = fixture(t);
    const session = terminalSession(
      process.execPath,
      [
        "-e",
        `
      console.log('ready ' + process.pid);
      setInterval(() => { ${progress ? "console.log('progress');" : ""} }, 30);
    `,
      ],
      { cwd: root, env: process.env },
    );
    t.after(() => session.close());
    const ready = await session.expect(/ready (\d+)/);
    const pid = Number(/ready (\d+)/.exec(ready)![1]);
    const started = Date.now();
    await assert.rejects(
      session.expect("missing prompt", 300),
      /The terminal did not show missing prompt/,
    );
    assert.ok(Date.now() - started >= 300);
    assert.ok(Date.now() - started < 2_000);
    session.close();
    await session.exit();
    assert.equal(running(pid), false);
  });
}

test("terminal waits report early command exits", async (t) => {
  const { root } = fixture(t);
  const session = terminalSession(
    process.execPath,
    ["-e", "console.log('exit output')"],
    {
      cwd: root,
      env: process.env,
    },
  );
  t.after(() => session.close());
  await assert.rejects(
    session.expect("missing prompt", 1_000),
    /before the command exited.*It showed:\nexit output/s,
  );
  assert.equal(await session.exit(), 0);
});
