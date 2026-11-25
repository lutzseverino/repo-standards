import assert from "node:assert/strict";
import { after, test } from "node:test";
import { execFileSync } from "node:child_process";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  directoryFixture,
  installCli,
  sourceFixture,
} from "./installed-cli.ts";
import { inspectionArgs, manifest, startArgs } from "./remote-fixture.ts";
import { adoptionFixture } from "./adoption-fixture.ts";
import type { ErrorReport, Run } from "./json-reports.ts";

const cli = installCli();
after(() => cli.close());

const failures = [
  { name: "missing executable", condition: "could not start (ENOENT)" },
  {
    name: "failing exit with valid output",
    script: "console.log(valid); process.exit(7);",
    condition: "exited with status 7",
  },
  {
    name: "signal stop",
    script: "console.log(valid); process.kill(process.pid, 'SIGTERM');",
    condition: "was stopped by signal SIGTERM",
  },
  {
    name: "unusable output",
    script: "console.log('unusable');",
    condition: "printed no version",
  },
  {
    name: "timeout before valid output",
    script: "setTimeout(() => console.log(valid), 12_000);",
    condition: null,
  },
];

for (const probe of [
  {
    tool: "npm",
    code: "NPM_REQUIRED",
    valid: "11.6.2",
    advice:
      "npm is required. Reinstall the npm bundled with Node.js 24 or 26 from https://nodejs.org/en/download and ensure npm is on PATH.",
  },
  {
    tool: "git",
    code: "GIT_REQUIRED",
    valid: "git version 2.40.0",
    advice:
      "Git 2.32 or newer is required. Install Git and ensure it is on PATH.",
  },
]) {
  for (const failure of failures) {
    test(`inspection identifies ${probe.tool} version ${failure.name} in JSON and text`, (t) => {
      const project = sourceFixture("");
      const bin = directoryFixture("repo-standards-probe-");
      t.after(() => {
        project.close();
        bin.close();
      });
      symlinkSync(process.execPath, join(bin.root, "node"));
      if (probe.tool === "npm")
        symlinkSync(
          execFileSync("/bin/sh", ["-c", "command -v git"], {
            encoding: "utf8",
          }).trim(),
          join(bin.root, "git"),
        );
      if (failure.script)
        writeFileSync(
          join(bin.root, probe.tool),
          `#!${process.execPath}\nconst valid = ${JSON.stringify(probe.valid)};\n${failure.script}\n`,
          { mode: 0o755 },
        );
      const env = { ...process.env, PATH: bin.root };
      const message =
        failure.condition === null
          ? `\`${probe.tool} --version\` did not answer within 10 seconds; the machine may be overloaded. Retry when it is less busy.`
          : `\`${probe.tool} --version\` ${failure.condition}. ${probe.advice}`;
      const result = cli.run(inspectionArgs, project.root, env);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.deepEqual(JSON.parse(result.stdout) as ErrorReport, {
        valid: false,
        errors: [{ code: probe.code, message }],
      });
      const text = cli.run(
        inspectionArgs.filter((arg) => arg !== "--json"),
        project.root,
        env,
      );
      assert.equal(text.status, 1, text.stdout + text.stderr);
      assert.equal(text.stderr.trim(), `[${probe.code}] ${message}`);
    });
  }
}

for (const failure of failures.filter((entry) => entry.script)) {
  test(`runtime acquisition identifies npm cache ${failure.name} with and without --json`, async (t) => {
    for (const json of [true, false]) {
      await t.test(json ? "JSON" : "text", async (t) => {
        const f = await adoptionFixture(
          t,
          cli,
          manifest({
            instructions: {
              kind: "file",
              target: "AGENTS.md",
              exact: "content.md",
            },
          }),
          { files: { "content.md": "Expected" } },
        );
        const inspection = f.inspect();
        const bin = directoryFixture("repo-standards-cache-probe-");
        t.after(() => bin.close());
        writeFileSync(
          join(bin.root, "npm"),
          `#!${process.execPath}
const valid = '; cache = "/unused/cache" ; overridden by cli';
if (process.argv[2] === '--version') console.log('11.6.2');
else if (process.argv[2] === 'config') { ${failure.script} }
else process.exit(99);
`,
          { mode: 0o755 },
        );
        const message =
          failure.condition === null
            ? "`npm config list` did not answer within 10 seconds; the machine may be overloaded. Retry when it is less busy."
            : `\`npm config list\` ${failure.condition === "printed no version" ? "printed no cache path" : failure.condition}. Cannot determine the configured npm cache. Check npm configuration and retry.`;
        const args = startArgs(inspection.identity);
        const result = f.run(
          json ? args : args.filter((arg) => arg !== "--json"),
          {
            ...f.env,
            PATH: `${bin.root}:${process.env.PATH}`,
          },
        );
        assert.equal(result.status, 1, result.stdout + result.stderr);
        if (json) {
          const report = JSON.parse(result.stdout) as Run;
          assert.equal(report.outcome, "incomplete");
          assert.equal(report.reason, `NPM_CACHE: ${message}`);
        } else {
          assert.ok(
            (result.stdout + result.stderr).includes(`NPM_CACHE: ${message}`),
            result.stdout + result.stderr,
          );
        }
      });
    }
  });
}
