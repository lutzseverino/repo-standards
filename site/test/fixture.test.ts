import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { test } from "node:test";
import { findBrowser } from "./browser.ts";
import { TEARDOWN_BUDGET } from "./fixture.ts";

const executable = findBrowser();
const skip = executable ? false : "no browser installed";

function live(pid: number, group = false) {
  const rows = execFileSync(
    "ps",
    ["-axo", group ? "pgid=,stat=" : "pid=,stat="],
    { encoding: "utf8" },
  );
  return rows.split("\n").some((row) => {
    const [id, state] = row.trim().split(/\s+/);
    return Number(id) === pid && !state.startsWith("Z");
  });
}

async function run(scenario: string) {
  const started = Date.now();
  const env: NodeJS.ProcessEnv = { ...process.env, FIXTURE_SCENARIO: scenario };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      "--test-reporter=spec",
      "test/fixtures/teardown.ts",
      ...(scenario === "profile" ? ["test/social.test.ts"] : []),
    ],
    {
      detached: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let escaped = false;
  const watchdog = setTimeout(() => {
    escaped = true;
    process.kill(-child.pid!, "SIGKILL");
    // Detached browser groups belong to the fixture, outside the runner group.
    for (const match of output.matchAll(/OWNED_PID=(\d+)/g)) {
      try {
        process.kill(-Number(match[1]), "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }, TEARDOWN_BUDGET + 20_000);
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(
      escaped,
      false,
      `outer watchdog caught escaped stall:\n${output}`,
    );
    assert.equal(code, scenario === "success" ? 0 : 1, output);
    for (const match of output.matchAll(/OWNED_PID=(\d+)/g))
      assert.equal(
        live(Number(match[1]), true),
        false,
        `owned process remains: ${match[1]}\n${output}`,
      );
    for (const match of output.matchAll(/OWNED_DIRECTORY=(.+)/g))
      assert.equal(
        existsSync(match[1]),
        false,
        `owned directory remains: ${match[1]}`,
      );
    const port = /SERVER_PORT=(\d+)/.exec(output);
    assert.ok(port, output);
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({
        host: "127.0.0.1",
        port: Number(port[1]),
      });
      socket.once("connect", () => {
        socket.destroy();
        reject(new Error(`server remains:\n${output}`));
      });
      socket.once("error", () => resolve());
    });
    assert.match(output, /SERVER_STOP_ATTEMPT/);
    return { output, elapsed: Date.now() - started };
  } finally {
    clearTimeout(watchdog);
  }
}

test("browser fixture regressions require a browser in CI", () => {
  assert.ok(executable || !process.env.CI, skip || "");
  assert.equal(TEARDOWN_BUDGET, 60_000);
});

test(
  "successful teardown and isolated cleanup failures",
  { skip },
  async (t) => {
    for (const scenario of ["success", "profile", "server", "partial"])
      await t.test(scenario, async () => {
        const { output } = await run(scenario);
        if (scenario === "profile" || scenario === "server") {
          assert.match(output, /original assertion retained/);
          const stage =
            scenario === "profile" ? "browser profile removal" : "server stop";
          const immediate = output.indexOf(`[site fixture] ${stage}:`);
          assert.ok(immediate >= 0, output);
          assert.ok(immediate < output.indexOf("ℹ tests"), output);
          assert.match(
            output.slice(immediate),
            scenario === "profile" ? /ENOTEMPTY/ : /EIO/,
          );
          assert.match(output.slice(immediate), /at /);
        }
        if (scenario === "profile")
          assert.match(output, /✔ the default social image/);
        if (scenario === "partial") {
          assert.match(output, /setup:.*ENOENT/s);
          assert.match(output, /injected server cleanup/);
        }
      });
  },
);

test(
  "process enforcement shares one budget and leaves unrelated processes alone",
  { skip, concurrency: true },
  async (t) => {
    const unrelated = spawn(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      { stdio: "ignore" },
    );
    try {
      await Promise.all(
        ["never", "stubborn", "server-leak", "blocked"].map((scenario) =>
          t.test(scenario, async () => {
            const { output, elapsed } = await run(scenario);
            assert.match(output, /60-second total teardown budget exhausted/);
            assert.match(
              output,
              scenario === "never"
                ? /never resolving cleanup/
                : scenario === "stubborn"
                  ? /stubborn child exit/
                  : scenario === "blocked"
                    ? /blocked event loop/
                    : /server stop/,
            );
            if (scenario === "stubborn") assert.match(output, /IGNORED_TERM/);
            assert.ok(
              elapsed >= TEARDOWN_BUDGET && elapsed < TEARDOWN_BUDGET + 15_000,
              `${elapsed} ms\n${output}`,
            );
            assert.ok(
              live(unrelated.pid!),
              "unrelated child must survive enforcement",
            );
          }),
        ),
      );
    } finally {
      const exited = new Promise<void>((resolve) =>
        unrelated.once("exit", () => resolve()),
      );
      unrelated.kill();
      await exited;
    }
  },
);
