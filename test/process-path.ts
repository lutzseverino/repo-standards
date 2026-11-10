import { execFileSync } from "node:child_process";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { directoryFixture } from "./installed-cli.ts";

// A command-local PATH with real check prerequisites, initially without ps.
export function processPath(t: TestContext) {
  const bin = directoryFixture("repo-standards-process-path-");
  t.after(() => bin.close());
  const locate = (name: string) =>
    execFileSync("sh", ["-c", `command -v ${name}`], {
      encoding: "utf8",
    }).trim();
  symlinkSync(process.execPath, join(bin.root, "node"));
  for (const name of ["git", "npm", "sh"])
    symlinkSync(locate(name), join(bin.root, name));
  return {
    env: { ...process.env, PATH: bin.root },
    ps: join(bin.root, "ps"),
    restorePs() {
      symlinkSync(locate("ps"), join(bin.root, "ps"));
    },
    failPs(script: string) {
      writeFileSync(join(bin.root, "ps"), `#!${process.execPath}\n${script}`, {
        mode: 0o755,
      });
    },
  };
}
