// Keep Node's default scheduling unless the caller explicitly limits it.
import { spawn } from "node:child_process";
import { globSync } from "node:fs";

const concurrency = process.env.REPO_STANDARDS_TEST_CONCURRENCY;
if (
  concurrency !== undefined &&
  (!/^[1-9]\d*$/.test(concurrency) ||
    !Number.isSafeInteger(Number(concurrency)))
) {
  console.error(
    "REPO_STANDARDS_TEST_CONCURRENCY must be a positive safe integer (for example, 2).",
  );
  process.exit(1);
}

const files = globSync("test/*.test.ts").sort();
const child = spawn(
  process.execPath,
  [
    "--test",
    ...(concurrency === undefined ? [] : [`--test-concurrency=${concurrency}`]),
    ...process.argv.slice(2),
    ...files,
  ],
  { stdio: "inherit" },
);
const forward = (signal: NodeJS.Signals) => child.kill(signal);
process.on("SIGINT", forward);
process.on("SIGTERM", forward);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.off("SIGINT", forward);
  process.off("SIGTERM", forward);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
