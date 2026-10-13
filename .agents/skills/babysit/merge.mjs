#!/usr/bin/env node

// Usage: node merge.mjs <number> <head SHA>, from the repository root.
// Exit codes: 0 merged, 1 usage or gh error, 2 head changed; wait again.
import { spawnSync } from "node:child_process";

function gh(args, input) {
  const result = spawnSync("gh", args, {
    input,
    encoding: "utf8",
    timeout: 45_000,
  });
  if (result.error) throw result.error;
  return result;
}

function readPullRequest(number) {
  const result = gh(["pr", "view", number, "--json", "title,body,headRefOid"]);
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return JSON.parse(result.stdout);
}

function retry() {
  console.error("PR head changed; wait again before merging.");
  process.exitCode = 2;
}

function main() {
  const [number, head, ...extra] = process.argv.slice(2);
  if (
    !/^[1-9]\d*$/.test(number ?? "") ||
    !/^[a-f0-9]{40}$/i.test(head ?? "") ||
    extra.length
  ) {
    throw new Error("Usage: node merge.mjs <number> <head SHA>");
  }
  const pullRequest = readPullRequest(number);
  if (pullRequest.headRefOid !== head) return retry();
  const result = gh(
    [
      "pr",
      "merge",
      number,
      "--squash",
      "--match-head-commit",
      head,
      "--subject",
      `${pullRequest.title} (#${number})`,
      "--body-file",
      "-",
    ],
    pullRequest.body ?? "",
  );
  if (result.status !== 0) {
    if (readPullRequest(number).headRefOid !== head) return retry();
    throw new Error(result.stderr.trim());
  }
  process.stdout.write(result.stdout);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
