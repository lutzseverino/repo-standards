import { githubForge } from "./github.ts";
import { update, UpdateFailure } from "./update.ts";

// The action's entry point, which `action.yml` runs with Node.js on a checkout
// of the default branch.

const token = (process.env.REPO_STANDARDS_TOKEN ?? "").trim();
if (token) console.log(`::add-mask::${token}`);
const root = process.env.GITHUB_WORKSPACE || process.cwd();
const repository = process.env.GITHUB_REPOSITORY;

try {
  if (!repository) throw new UpdateFailure("GITHUB_REPOSITORY is not set.");
  await update({
    root,
    token,
    agentCommand: (process.env.REPO_STANDARDS_AGENT_COMMAND ?? "").trim(),
    forge: githubForge({
      api: process.env.GITHUB_API_URL || "https://api.github.com",
      repository,
      token,
      root,
    }),
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(
    `::error title=Repository Standards update::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
  );
  process.exitCode = 1;
}
