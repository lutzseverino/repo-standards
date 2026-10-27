import { spawnSync } from "node:child_process";

// Canon's older validator runs on import; its newer validator exports the
// neutral metadata boundary. Both receive the same fixture event.
export function validateMetadata(event: string) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { readFileSync } from "node:fs";
const validator = await import(process.argv[1]);
if (typeof validator.validatePullRequestMetadata === "function") {
  const event = JSON.parse(readFileSync(process.argv[2], "utf8"));
  process.exitCode = validator.validatePullRequestMetadata(event.pull_request);
}`,
      new URL("../.github/scripts/validate-pr-metadata.mjs", import.meta.url)
        .href,
      event,
    ],
    { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } },
  );
}
