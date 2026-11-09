// Runs only in the isolated subprocess regressions, never as a site test file.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import { syncBuiltinESMExports } from "node:module";
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
      const browser = await Browser.launch(executable, fixture);
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
