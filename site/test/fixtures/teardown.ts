// Runs only in the isolated subprocess regressions, never as a site test file.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { Browser, findBrowser } from "../browser.ts";
import { BrowserFixture } from "../fixture.ts";

const scenario = process.env.FIXTURE_SCENARIO;
const fixture = new BrowserFixture();
const server = createServer((_request, response) => response.end("fixture"));
const ownProcess = fixture.ownProcess.bind(fixture);
fixture.ownProcess = (child) => {
  console.log(`OWNED_PID=${child.pid}`);
  ownProcess(child);
};
const ownDirectory = fixture.ownDirectory.bind(fixture);
fixture.ownDirectory = (directory) => {
  console.log(`OWNED_DIRECTORY=${directory}`);
  ownDirectory(directory);
};

if (scenario === "profile") {
  const remove = fs.rmSync;
  fs.rmSync = (file, options) => {
    if (String(file).includes("site-browser-"))
      throw Object.assign(new Error("injected profile removal"), {
        code: "ENOTEMPTY",
      });
    return remove(file, options);
  };
  syncBuiltinESMExports();
}

before(() =>
  fixture.setup(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    console.log(`SERVER_PORT=${address.port}`);
    fixture.defer("server stop", async () => {
      console.log("SERVER_STOP_ATTEMPT");
      if (scenario === "server-leak")
        throw new Error("injected server stop rejection");
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (scenario === "server" || scenario === "partial")
        throw Object.assign(new Error("injected server cleanup"), {
          code: "EIO",
        });
    });
    if (scenario === "partial")
      await Browser.launch("/no-such-browser-486", fixture);
    else {
      const executable = findBrowser();
      assert.ok(executable, "subprocess regression requires a browser");
      let launcher = executable;
      let pidFile = "";
      let group = 0;
      if (scenario === "delayed-exit" || scenario === "closed-stderr") {
        const wrapper = fs.mkdtempSync(
          path.join(tmpdir(), "site-browser-parent-"),
        );
        fixture.ownDirectory(wrapper);
        fixture.defer("browser wrapper removal", () =>
          fs.rmSync(wrapper, { recursive: true, force: true }),
        );
        pidFile = path.join(wrapper, "pid");
        launcher = path.join(wrapper, "browser.mjs");
        fs.writeFileSync(
          launcher,
          `#!${process.execPath}
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const browser = spawn(${JSON.stringify(executable)}, process.argv.slice(2), { stdio: ["ignore", "ignore", ${JSON.stringify(scenario === "closed-stderr" ? "pipe" : "inherit")}] });
browser.stderr?.pipe(process.stderr);
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
process.on("SIGTERM", () => {
  spawn(process.execPath, ["-e", "setTimeout(() => process.kill(" + browser.pid + ", 'SIGTERM'), 300)"], { stdio: ["ignore", "ignore", ${JSON.stringify(scenario === "closed-stderr" ? "ignore" : "inherit")}] });
  process.exit(0);
});
`,
          { mode: 0o755 },
        );
        const remove = fs.rmSync;
        fs.rmSync = (file, options) => {
          if (
            String(file).includes("/site-browser-") &&
            !String(file).includes("site-browser-parent-")
          ) {
            const rows = execFileSync("ps", ["-axo", "pgid=,stat="], {
              encoding: "utf8",
            });
            if (
              rows.split("\n").some((row) => {
                const [id, state] = row.trim().split(/\s+/);
                return Number(id) === group && !state.startsWith("Z");
              })
            )
              throw Object.assign(
                new Error(
                  "profile removed while browser descendant is still alive",
                ),
                { code: "ENOTEMPTY" },
              );
          }
          return remove(file, options);
        };
        syncBuiltinESMExports();
      }
      const browser = await Browser.launch(launcher, fixture);
      if (pidFile) group = Number(fs.readFileSync(pidFile, "utf8"));
      const tab = await browser.open("about:blank", {
        width: 320,
        theme: "light",
      });
      await tab.close();
    }
    if (scenario === "never") {
      fixture.defer("never resolving cleanup", () => new Promise(() => {}));
      fixture.defer(
        "another never resolving cleanup",
        () => new Promise(() => {}),
      );
    }
    if (scenario === "blocked")
      fixture.defer("blocked event loop", () =>
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0),
      );
    if (scenario === "stubborn") {
      const child = spawn(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM',()=>console.log('IGNORED_TERM'));console.log('READY');setInterval(()=>{},1000)",
        ],
        {
          detached: true,
          stdio: ["ignore", "pipe", "inherit"],
        },
      );
      fixture.ownProcess(child);
      await new Promise<void>((resolve) =>
        child.stdout.once("data", () => resolve()),
      );
      child.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
      fixture.defer(
        "stubborn child exit",
        () =>
          new Promise<void>((resolve) => {
            child.once("exit", () => resolve());
            child.kill();
          }),
      );
    }
  }),
);

after(() => fixture.close());
test("original assertion", () => {
  if (scenario === "profile" || scenario === "server")
    assert.fail("original assertion retained");
  console.log("ASSERTIONS_COMPLETED");
});
