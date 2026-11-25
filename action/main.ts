#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { githubForge } from "./github.ts";
import { update, UpdateFailure } from "./update.ts";

// One entry point runs unbuilt from the action's Git tree and compiled from
// the package. Only the Actions adapter reads workflow inputs or emits commands.
const actions = process.env.GITHUB_ACTIONS === "true";
const token = (process.env.REPO_STANDARDS_TOKEN ?? "").trim();
if (actions && token) console.log(`::add-mask::${token}`);

function originRepository(root: string) {
  const origin = spawnSync("git", ["config", "--get", "remote.origin.url"], {
    cwd: root,
    encoding: "utf8",
  });
  const repository =
    /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(
      origin.status === 0 ? origin.stdout.trim() : "",
    )?.[1];
  if (!repository)
    throw new UpdateFailure(
      "REPOSITORY_NOT_DERIVABLE: Set --repository <owner/name>; origin must name a GitHub repository over HTTPS or SSH.",
    );
  return repository;
}

try {
  const { values } = parseArgs({
    options: {
      repository: { type: "string" },
      project: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(`Usage: repo-standards-update [--repository <owner/name>] [--project <path>]

Run the rolling update from a clean, dedicated default-branch checkout.
Repository defaults to the checkout's GitHub origin; project defaults to cwd.
REPO_STANDARDS_TOKEN is required. REPO_STANDARDS_AGENT_COMMAND is optional.
GITHUB_API_URL defaults to https://api.github.com. Requires Node.js 24 or 26,
Git, bash and network access to npm and GitHub. Scheduling belongs to the caller.`);
  } else {
    if (!actions && !token)
      throw new UpdateFailure("TOKEN_REQUIRED: Set REPO_STANDARDS_TOKEN.");
    const root = resolve(
      values.project ??
        (actions ? process.env.GITHUB_WORKSPACE : undefined) ??
        process.cwd(),
    );
    const repository =
      values.repository ??
      (actions ? process.env.GITHUB_REPOSITORY : originRepository(root));
    if (!actions && !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? ""))
      throw new UpdateFailure(
        "INVALID_REPOSITORY: Set --repository <owner/name>.",
      );
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
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  const message = token ? detail.replaceAll(token, "<REDACTED>") : detail;
  if (actions)
    console.log(
      `::error title=Repo Standards update::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
    );
  else console.error(message);
  process.exitCode = 1;
}
