import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  branch,
  breakingMove,
  breakingSections,
  issueBody,
  issueMarker,
  issueTarget,
  issueTitle,
  landedComment,
  pullRequestTitle,
  reaches,
  selectionPins,
  supersededComment,
  type HeadlessReport,
  type Pins,
  type Stop,
} from "./content.ts";

// One run of the update action on a checkout of the default branch: check the
// pins, update headlessly with the newest CLI, and keep one rolling pull
// request or issue current. The forge holds every hosting-platform call.

export interface ForgeItem {
  number: number;
  url: string;
}
export type PushResult = { pushed: true } | { pushed: false; reason: string };
export interface Forge {
  defaultBranch(): Promise<string>;
  // The open pull request from the rolling branch.
  rollingPullRequest(branch: string): Promise<ForgeItem | null>;
  // The open issue whose body holds the marker.
  rollingIssue(marker: string): Promise<(ForgeItem & { body: string }) | null>;
  // A file's text on a branch, or null when either is absent.
  branchFile(branch: string, path: string): Promise<string | null>;
  // Force-push HEAD to the branch.
  push(branch: string): Promise<PushResult>;
  openPullRequest(
    branch: string,
    base: string,
    title: string,
    body: string,
  ): Promise<ForgeItem>;
  editPullRequest(number: number, title: string, body: string): Promise<void>;
  openIssue(title: string, body: string): Promise<ForgeItem>;
  editIssue(number: number, title: string, body: string): Promise<void>;
  close(
    kind: RollingItem["kind"],
    number: number,
    comment: string,
  ): Promise<void>;
}

export interface UpdateOptions {
  root: string;
  token: string;
  agentCommand: string;
  forge: Forge;
}

// A failure that opens or changes nothing.
export class UpdateFailure extends Error {}

interface RollingItem extends ForgeItem {
  kind: "pull-request" | "issue";
  target: Pins | null;
}

interface PinReport {
  pinned: string | null;
  update: "available" | "none" | "unknown";
  newest?: string;
  repository?: string;
  reason?: { code: string; message: string };
}
interface OutdatedReport {
  cli: PinReport;
  standards: PinReport & { repository: string };
}
interface StatusReport {
  readyToCommit: boolean;
  readinessReasons: string[];
  selection: {
    cli: { version: string };
    standards: { repository: string; version: string };
  } | null;
}

const packageName = "@lutzseverino/repo-standards";
const pinnedCli = ".repo-standards/runtime/node_modules/.bin/repo-standards";

export async function update(options: UpdateOptions) {
  const { root, token, agentCommand, forge } = options;
  const log = (line: string) => console.log(line);
  // The token reaches npm and the CLI as GH_TOKEN, and no other process.
  const baseEnv: NodeJS.ProcessEnv = { ...process.env };
  delete baseEnv.REPO_STANDARDS_TOKEN;
  const cliEnv = { ...baseEnv, ...(token ? { GH_TOKEN: token } : {}) };

  const run = (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv = cliEnv,
  ) => {
    const result = spawnSync(command, args, {
      cwd: root,
      env,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    if (result.error)
      throw new UpdateFailure(`${command}: ${result.error.message}`);
    return result;
  };
  const gitRun = (...args: string[]) => {
    const result = run("git", args, baseEnv);
    if (result.status !== 0)
      throw new UpdateFailure(
        `git ${args[0]} failed: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    return result.stdout.trim();
  };
  const json = <T>(label: string, result: ReturnType<typeof run>) => {
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      throw new UpdateFailure(
        `${label} exited ${result.status} without a JSON report: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
  };
  const diagnostic = (label: string, result: ReturnType<typeof run>) => {
    const report = json<{ errors?: { code: string; message: string }[] }>(
      label,
      result,
    );
    const errors = (report.errors ?? [])
      .map((error) => `${error.code} ${error.message}`)
      .join("; ");
    return new UpdateFailure(
      `${label} exited ${result.status}${errors ? `: ${errors}` : ""}`,
    );
  };

  // 1. Check for updates with the pinned CLI.
  const restore = run("npm", [
    "ci",
    "--ignore-scripts",
    "--prefix",
    ".repo-standards/runtime",
  ]);
  if (restore.status !== 0)
    throw new UpdateFailure(
      `Restoring the pinned runtime failed: ${restore.stderr.trim()}`,
    );
  const checked = run(join(root, pinnedCli), ["outdated", "--json"]);
  if (checked.status !== 0) throw diagnostic("outdated", checked);
  const outdated = json<OutdatedReport>("outdated", checked);
  const unknown = (["cli", "standards"] as const).filter(
    (pin) => outdated[pin].update === "unknown",
  );
  if (unknown.length)
    throw new UpdateFailure(
      `The available update is unknown for ${unknown
        .map((pin) => {
          const reason = outdated[pin].reason;
          return `the ${pin} pin (${reason ? `${reason.code}: ${reason.message}` : "no reason given"})`;
        })
        .join(" and ")}; nothing was opened or changed.`,
    );
  const from: Pins = {
    cli: outdated.cli.pinned!,
    standards: outdated.standards.pinned!,
  };
  const source = outdated.standards.repository;

  const base = await forge.defaultBranch();
  const items = await rollingItems(forge);
  // Close each rolling item whose update the default branch has reached.
  const open: RollingItem[] = [];
  for (const item of items) {
    if (
      item.target &&
      reaches(from.cli, item.target.cli) &&
      reaches(from.standards, item.target.standards)
    ) {
      await forge.close(
        item.kind,
        item.number,
        landedComment(item.target, base),
      );
      log(`Closed ${item.url}: its update has landed.`);
    } else open.push(item);
  }
  if (outdated.cli.update === "none" && outdated.standards.update === "none") {
    log(`Both pins are current: CLI ${from.cli}, standards ${from.standards}.`);
    return;
  }
  const target: Pins = {
    cli: outdated.cli.newest!,
    standards: outdated.standards.newest!,
  };
  const same = open.find(
    (item) =>
      item.target?.cli === target.cli &&
      item.target.standards === target.standards,
  );
  if (same) {
    log(
      `${same.url} already carries CLI ${target.cli} and standards ${target.standards}.`,
    );
    return;
  }

  // 2. Update with the newest CLI.
  // The report stays outside the checkout, so the commit never includes it.
  const temporary = mkdtempSync(
    join(process.env.RUNNER_TEMP || tmpdir(), "repo-standards-"),
  );
  const reportPath = join(temporary, "headless-report.json");
  const newest = (args: string[]) =>
    run("npx", ["--yes", `${packageName}@${target.cli}`, ...args]);
  const headless = newest(["adopt", "--headless", "--json"]);
  if (headless.status !== 0 && headless.status !== 1)
    throw diagnostic("adopt --headless", headless);
  const report = json<HeadlessReport & { valid?: boolean }>(
    "adopt --headless",
    headless,
  );
  if (report.valid === false) throw diagnostic("adopt --headless", headless);
  writeFileSync(reportPath, headless.stdout);
  log(`The headless update ended with outcome ${report.outcome}.`);

  const readStatus = () => {
    const result = newest(["status", "--json"]);
    if (result.status !== 0) throw diagnostic("status", result);
    return json<StatusReport>("status", result);
  };

  const rollingIssue = async (stop: Stop, to: Pins) => {
    const title = issueTitle(source, to);
    const body = issueBody({ source, from, to, base, stop, report });
    const existing = open.find((item) => item.kind === "issue");
    const issue = existing ?? (await forge.openIssue(title, body));
    if (existing) await forge.editIssue(existing.number, title, body);
    log(`${existing ? "Refreshed" : "Opened"} ${issue.url}.`);
    for (const item of open.filter((item) => item.kind === "pull-request"))
      await forge.close(item.kind, item.number, supersededComment(issue.url));
  };

  // 4. A stop: an agent command may finish it.
  let status: StatusReport | undefined;
  if (report.outcome !== "complete" || headless.status !== 0) {
    if (!agentCommand) return rollingIssue({ kind: "stopped" }, target);
    log("Running the agent command.");
    const agent = spawnSync("bash", ["-c", agentCommand], {
      cwd: root,
      env: { ...baseEnv, REPO_STANDARDS_REPORT: reportPath },
      stdio: "inherit",
    });
    status = readStatus();
    if (agent.status !== 0 || !status.readyToCommit)
      return rollingIssue(
        {
          kind: "agent",
          exit: agent.status,
          reasons: status.readinessReasons,
        },
        target,
      );
  }

  // 3. Complete: record, commit, push and propose.
  status ??= readStatus();
  if (!status.readyToCommit || !status.selection)
    return rollingIssue(
      { kind: "not-ready", reasons: status.readinessReasons },
      target,
    );
  const recordRun = newest(["status", "--summary"]);
  if (recordRun.status !== 0)
    throw new UpdateFailure(
      `status --summary exited ${recordRun.status}: ${recordRun.stderr.trim()}`,
    );
  const record = recordRun.stdout;
  const to: Pins = {
    cli: status.selection.cli.version,
    standards: status.selection.standards.version,
  };
  const breaking =
    breakingMove(from.cli, to.cli) !== null ||
    breakingMove(from.standards, to.standards) !== null;
  const title = pullRequestTitle(source, to, breaking);
  const body = breaking
    ? record + breakingSections(record, source, from, to, report)
    : record;

  gitRun("checkout", "--quiet", "-B", branch);
  gitRun("add", "--all");
  const identity = run("git", ["config", "user.email"], baseEnv).stdout.trim()
    ? []
    : [
        "-c",
        "user.name=github-actions[bot]",
        "-c",
        "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      ];
  gitRun(
    ...identity,
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    title,
  );
  const pushed = await forge.push(branch);
  if (!pushed.pushed)
    return rollingIssue({ kind: "push", reason: pushed.reason }, to);

  const existing = open.find((item) => item.kind === "pull-request");
  const pullRequest =
    existing ?? (await forge.openPullRequest(branch, base, title, body));
  if (existing) await forge.editPullRequest(existing.number, title, body);
  log(`${existing ? "Refreshed" : "Opened"} ${pullRequest.url}.`);
  for (const item of open.filter((item) => item.kind === "issue"))
    await forge.close(
      item.kind,
      item.number,
      supersededComment(pullRequest.url),
    );

  async function rollingItems(forge: Forge): Promise<RollingItem[]> {
    const items: RollingItem[] = [];
    const pullRequest = await forge.rollingPullRequest(branch);
    if (pullRequest) {
      const selection = await forge.branchFile(
        branch,
        ".repo-standards/selection.yaml",
      );
      items.push({
        ...pullRequest,
        kind: "pull-request",
        target: selection ? selectionPins(selection) : null,
      });
    }
    const issue = await forge.rollingIssue(issueMarker);
    if (issue)
      items.push({
        number: issue.number,
        url: issue.url,
        kind: "issue",
        target: issueTarget(issue.body),
      });
    return items;
  }
}
