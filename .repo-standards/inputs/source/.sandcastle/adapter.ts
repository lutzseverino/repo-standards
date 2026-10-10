// The factory's adapter: it reads the snapshot through the GitHub CLI and the
// usage readers, asks the decision core what to do, and carries the decisions
// out through GitHub label edits, comments, and Sandcastle launches.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideFactory,
  decideUpdate,
  isProvider,
  labels,
  parseModel,
  unknownProvider,
  updateModel,
  type Claim,
  type Decision,
  type Issue,
  type Mode,
  type Provider,
  type PullRequestState,
  type Run,
  type Settings,
  type Snapshot,
  type Inspection,
  type Outdated,
  type Selection,
} from "./factory.ts";

export type LaunchRequest = {
  issue?: number;
  branch: string;
  prompt: string;
  provider: Provider;
  model: string;
  effort: string;
  log: string;
  // The repository's sandbox image, built from its `.sandcastle/Dockerfile`.
  image: string;
  signal: AbortSignal;
};

export type ImageBuild = { image: string; dockerfile: string };

export type Ports = {
  gh(args: string[]): Promise<string>;
  // No version uses the project's pinned runtime; a version uses an exact
  // external candidate runtime, leaving the project's pin alone.
  standards(args: string[], version?: string): Promise<string>;
  // Resolves or rejects when the run's agent exits.
  launch(request: LaunchRequest): Promise<void>;
  buildImage(request: ImageBuild): Promise<void>;
  readUsage(provider: Provider): Promise<number | null>;
  now(): Date;
  // The repository checkout the factory runs from.
  root: string;
  report(line: string): void;
};

type HostRun = Run & {
  controller: AbortController;
  exited: boolean;
  exitedAt: Date | null;
  stopped: boolean;
};

// The decision core's settings and the time between passes.
export type HostSettings = Settings & { pollSeconds: number };

// The factory host sets these; Repo Canon ships no values for them.
export function readSettings(
  env: Record<string, string | undefined>,
): HostSettings {
  const problems: string[] = [];
  const model = (name: string) => {
    const value = env[name]?.trim() ?? "";
    const parsed = parseModel(value);
    if (!value)
      problems.push(`- ${name}: set it to a model, as a model label names one`);
    else if ("error" in parsed) problems.push(`- ${name}: ${parsed.error}`);
    return value;
  };
  const number = (
    name: string,
    valid: (value: number) => boolean,
    fix: string,
  ) => {
    const value = Number(env[name]);
    if (!env[name]?.trim() || !valid(value)) problems.push(`- ${name}: ${fix}`);
    return value;
  };
  const defaultModel = model("FACTORY_DEFAULT_MODEL");
  const retryModel = env.FACTORY_RETRY_MODEL
    ? model("FACTORY_RETRY_MODEL")
    : null;
  const caps: Settings["caps"] = {};
  if (!env.FACTORY_CAPS?.trim())
    problems.push(
      "- FACTORY_CAPS: set it to <provider>=<count> entries, such as claude-code=2,codex=1",
    );
  else
    for (const entry of env.FACTORY_CAPS.split(",")) {
      const match = /^\s*([^=\s]+)\s*=\s*(\d+)\s*$/.exec(entry);
      if (!match || !Number.isSafeInteger(Number(match[2])))
        problems.push(
          `- FACTORY_CAPS: ${entry.trim() || "an empty entry"} is not <provider>=<count>`,
        );
      else if (!isProvider(match[1]))
        problems.push(`- FACTORY_CAPS: ${unknownProvider(match[1])}`);
      else caps[match[1]] = Number(match[2]);
    }
  const usageThreshold = number(
    "FACTORY_USAGE_THRESHOLD",
    (value) => value >= 0 && value <= 100,
    "set it to a percentage from 0 to 100",
  );
  // Both durations become timers, which wait at most 2^31 - 1 milliseconds.
  const timer = (milliseconds: number) =>
    milliseconds > 0 && milliseconds <= 2 ** 31 - 1;
  const timeLimitMinutes = number(
    "FACTORY_TIME_LIMIT_MINUTES",
    (value) => timer(value * 60_000),
    "set it to a positive number of minutes",
  );
  const pollSeconds = env.FACTORY_POLL_SECONDS
    ? number(
        "FACTORY_POLL_SECONDS",
        (value) => timer(value * 1000),
        "set it to a positive number of seconds, or leave it unset for 300",
      )
    : 300;
  if (problems.length > 0)
    throw new Error(
      ["The factory host settings are unusable:", ...problems].join("\n"),
    );
  return {
    defaultModel,
    retryModel,
    caps,
    usageThreshold,
    timeLimitMinutes,
    pollSeconds,
  };
}

// The pinned bootstrap acquires a candidate outside the checkout and removes
// its temporary runtime afterwards. Inspection never changes the pin.
export function createStandardsRunner(
  root: string,
  execute: (executable: string, args: string[]) => Promise<string>,
): Ports["standards"] {
  return async (args, version) => {
    const runtime = join(root, ".repo-standards", "runtime");
    const bin = join(runtime, "node_modules", ".bin");
    // Adoption can replace the runtime pin while this host keeps running.
    // Read the checkout and the installation each time, rather than treating
    // an existing executable as evidence that it matches the new lockfile.
    const manifest = JSON.parse(
      readFileSync(join(runtime, "package.json"), "utf8"),
    );
    const packages = Object.keys(manifest.dependencies);
    if (packages.length !== 1)
      throw new Error("the runtime must pin one CLI package");
    const packageName = packages[0];
    const lock = JSON.parse(
      readFileSync(join(runtime, "package-lock.json"), "utf8"),
    );
    const pinned = lock.packages[`node_modules/${packageName}`]?.version;
    if (!pinned || manifest.dependencies[packageName] !== pinned)
      throw new Error("the CLI manifest and lockfile pins disagree");
    const installed = () => {
      try {
        return (
          JSON.parse(
            readFileSync(
              join(runtime, "node_modules", packageName, "package.json"),
              "utf8",
            ),
          ).version === pinned
        );
      } catch {
        return false;
      }
    };
    const executable = join(
      bin,
      version ? "repo-standards-bootstrap" : "repo-standards",
    );
    if (!installed() || !existsSync(executable)) {
      await execute("npm", ["ci", "--ignore-scripts", "--prefix", runtime]);
      if (!installed() || !existsSync(executable))
        throw new Error("npm ci did not restore the pinned CLI runtime");
    }
    return execute(
      executable,
      version ? ["--cli-version", version, ...args] : args,
    );
  };
}

const templates: Record<Mode, string> = {
  direct: readFileSync(new URL("./direct-prompt.md", import.meta.url), "utf8"),
  orchestrated: readFileSync(
    new URL("./orchestrated-prompt.md", import.meta.url),
    "utf8",
  ),
};

export function prompt(mode: Mode, issue: number): string {
  return templates[mode].trim().replaceAll("{{ISSUE}}", String(issue));
}

const issuesQuery = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 50, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        createdAt
        labels(first: 100) { nodes { name } }
        parent { number }
        subIssues(first: 100) { nodes { number state labels(first: 100) { nodes { name } } } }
        blockedBy(first: 100) { nodes { number state } }
      }
    }
  }
}`;

const pullRequestsQuery = `query($owner: String!, $name: String!, $number: Int!, $branch: String!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      state
      closedByPullRequestsReferences(first: 20, includeClosedPrs: true) { nodes { state createdAt isCrossRepository } }
    }
    pullRequests(headRefName: $branch, first: 20) { nodes { state createdAt isCrossRepository } }
  }
}`;

// A repository's sandbox image. Image tags are global to a Docker daemon, so a
// hash of the full identity keeps repositories whose names flatten alike, such
// as a-b/c and a/b-c, apart.
export function imageName(owner: string, name: string): string {
  const slug = `${owner}-${name}`.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  const hash = createHash("sha256")
    .update(`${owner}/${name}`)
    .digest("hex")
    .slice(0, 12);
  return `factory-${slug}-${hash}`;
}

// The branch Sandcastle gives an issue's runs.
export function runBranch(issue: number): string {
  return `factory/issue-${issue}`;
}

export function createFactory(settings: Settings, ports: Ports) {
  const runs: HostRun[] = [];
  let repository: { owner: string; name: string } | null = null;
  let checkedAt: number | null = null;
  let pendingUpdate: Inspection | null = null;
  let updateRun: {
    provider: Provider;
    branch: string;
    log: string;
    controller: AbortController;
    startedAt: number;
    exited: boolean;
  } | null = null;

  async function readUpdate() {
    const now = ports.now().getTime();
    if (checkedAt !== null && now - checkedAt < 86_400_000) return;
    checkedAt = now;
    // Refresh rather than keep a candidate inspected against yesterday's tree.
    pendingUpdate = null;
    try {
      const outdated: Outdated = JSON.parse(
        await ports.standards(["outdated", "--json"]),
      );
      if (decideUpdate(outdated).kind === "no-update") return;
      const status = JSON.parse(await ports.standards(["status", "--json"]));
      if (
        status.active !== null ||
        status.stateError ||
        !status.lastComplete ||
        !status.selection
      ) {
        ports.report("update waits for a complete, readable adoption");
        return;
      }
      const current: Selection = status.selection;
      const version =
        outdated.cli.update === "available"
          ? outdated.cli.newest!
          : current.cli.version;
      const args = ["inspect"];
      if (outdated.standards.update === "available")
        args.push(
          "--source",
          current.standards.repository,
          "--standards-version",
          outdated.standards.newest!,
          "--profile",
          current.profile,
        );
      const inspection: Inspection = JSON.parse(
        await ports.standards([...args, "--json"], version),
      );
      const decision = decideUpdate(outdated, inspection);
      if (decision.kind === "triage-update") {
        const marker = updateMarker(inspection.selection);
        if ((await updateIssue(marker)) !== null) return;
        await ports.gh([
          "issue",
          "create",
          "--label",
          "needs-triage",
          "--title",
          `Review standards update to ${inspection.selection.standards.version} with CLI ${inspection.selection.cli.version}`,
          "--body",
          triageBody(inspection, marker),
        ]);
      } else if (decision.kind === "adopt-update") {
        // Keep checking daily during a long run, but do not queue that same
        // candidate again before its run has settled and the next check is due.
        const branch = `factory/update-${updateMarker(inspection.selection)}`;
        if (updateRun?.branch !== branch) pendingUpdate = inspection;
      } else if (decision.kind === "wait-update")
        ports.report(`update waits: ${decision.reason}`);
    } catch (error) {
      ports.report(`daily update check failed: ${error}`);
    }
  }

  async function updateIssue(marker: string): Promise<number | null> {
    const existing: { number: number }[] = JSON.parse(
      await ports.gh([
        "issue",
        "list",
        "--state",
        "all",
        "--search",
        `in:body ${marker}`,
        "--json",
        "number",
        "--limit",
        "1",
      ]),
    );
    return existing[0]?.number ?? null;
  }

  async function readUpdatePullRequests(branch?: string) {
    // Scope candidate history by exact branch, and scan only open PRs for
    // another update. Both connections paginate, regardless of repository size.
    const query = `query($owner: String!, $name: String!, $endCursor: String${branch ? ", $branch: String!" : ""}) {
      repository(owner: $owner, name: $name) {
        pullRequests(${branch ? "headRefName: $branch" : "states: OPEN"}, first: 100, after: $endCursor) {
          pageInfo { hasNextPage endCursor }
          nodes { state headRefName isCrossRepository }
        }
      }
    }`;
    const pages = JSON.parse(
      await ports.gh([
        "api",
        "graphql",
        "--paginate",
        "--slurp",
        "-f",
        `query=${query}`,
        ...(await identity()),
        ...(branch ? ["-F", `branch=${branch}`] : []),
      ]),
    );
    const prs: {
      state: string;
      headRefName: string;
      isCrossRepository: boolean;
    }[] = pages.flatMap((page: any) => page.data.repository.pullRequests.nodes);
    return prs.filter(
      (pr) =>
        !pr.isCrossRepository &&
        (branch
          ? pr.headRefName === branch
          : pr.headRefName.startsWith("factory/update-")),
    );
  }

  async function settleUpdateRun() {
    if (!updateRun?.exited) return;
    const run = updateRun;
    try {
      if ((await readUpdatePullRequests(run.branch)).length === 0)
        ports.report(
          `update run ended without a pull request; log: ${run.log}`,
        );
    } catch (error) {
      ports.report(`ended update PR lookup failed: ${error}; log: ${run.log}`);
    }
    updateRun = null;
  }

  async function checkUpdateHolds() {
    if (!pendingUpdate || updateRun) return;
    const marker = updateMarker(pendingUpdate.selection);
    const issue = await updateIssue(marker);
    if (issue !== null) {
      ports.report(`update held by triage issue #${issue}`);
      pendingUpdate = null;
      return;
    }
    const branch = `factory/update-${marker}`;
    // An open adoption PR holds the update even across host restarts. A
    // completed/closed PR for this candidate also prevents daily duplicate runs.
    if (
      (await readUpdatePullRequests(branch)).length > 0 ||
      (await readUpdatePullRequests()).length > 0
    )
      pendingUpdate = null;
  }

  async function launchUpdate(snapshot: Snapshot, image: string) {
    if (!pendingUpdate || updateRun) return;
    const model = updateModel(snapshot);
    if ("error" in model) {
      ports.report(`update waits: ${model.error}`);
      return;
    }
    const inspection = pendingUpdate;
    const branch = `factory/update-${updateMarker(inspection.selection)}`;
    const controller = new AbortController();
    const run = {
      provider: model.provider,
      branch,
      log: join(
        ports.root,
        ".sandcastle",
        "logs",
        `${updateMarker(inspection.selection)}.log`,
      ),
      controller,
      startedAt: ports.now().getTime(),
      exited: false,
    };
    updateRun = run;
    pendingUpdate = null;
    ports
      .launch({
        ...model,
        branch,
        image,
        signal: controller.signal,
        log: run.log,
        prompt: updatePrompt(inspection),
      })
      .catch((error) =>
        ports.report(`update run ended with an error: ${error}`),
      )
      .finally(() => {
        run.exited = true;
      });
  }

  async function readRepository() {
    if (!repository) {
      const view = JSON.parse(
        await ports.gh(["repo", "view", "--json", "owner,name"]),
      );
      repository = { owner: view.owner.login, name: view.name };
    }
    return repository;
  }

  async function identity() {
    const { owner, name } = await readRepository();
    return ["-F", `owner=${owner}`, "-F", `name=${name}`];
  }

  // Each pass that launches builds the image again, so runs start from the
  // Dockerfile the checkout holds now; Docker's cache keeps an unchanged
  // build quick.
  async function buildImage(): Promise<string> {
    const { owner, name } = await readRepository();
    const image = imageName(owner, name);
    await ports.buildImage({
      image,
      dockerfile: join(ports.root, ".sandcastle", "Dockerfile"),
    });
    return image;
  }

  async function readIssues(): Promise<Issue[]> {
    const pages = JSON.parse(
      await ports.gh([
        "api",
        "graphql",
        "--paginate",
        "--slurp",
        "-f",
        `query=${issuesQuery}`,
        ...(await identity()),
      ]),
    );
    const names = (connection: { nodes: { name: string }[] }) =>
      connection.nodes.map((label) => label.name);
    const state = (value: string) => (value === "OPEN" ? "open" : "closed");
    return pages.flatMap((page: any) =>
      page.data.repository.issues.nodes.map((node: any) => ({
        number: node.number,
        createdAt: node.createdAt,
        labels: names(node.labels),
        parent: node.parent?.number ?? null,
        subIssues: node.subIssues.nodes.map((child: any) => ({
          number: child.number,
          state: state(child.state),
          labels: names(child.labels),
        })),
        blockedBy: node.blockedBy.nodes.map((blocker: any) => ({
          number: blocker.number,
          state: state(blocker.state),
        })),
      })),
    );
  }

  // A run's pull request is one from this repository, not a fork, that closes
  // its issue or comes from the run's branch, opened once the run started (`since`), so an earlier run's pull
  // requests on the same branch don't decide it. Only a closed issue counts as
  // merged work. An open pull request holds the claim; a merged pull request
  // with the issue still open and none open is its own state.
  async function pullRequestState(
    number: number,
    since?: string,
  ): Promise<PullRequestState> {
    const response = JSON.parse(
      await ports.gh([
        "api",
        "graphql",
        "-f",
        `query=${pullRequestsQuery}`,
        ...(await identity()),
        "-F",
        `number=${number}`,
        "-F",
        `branch=${runBranch(number)}`,
      ]),
    );
    const { issue, pullRequests } = response.data.repository;
    const states = [
      ...issue.closedByPullRequestsReferences.nodes,
      ...pullRequests.nodes,
    ]
      .filter(
        (pullRequest: { createdAt: string; isCrossRepository: boolean }) =>
          !pullRequest.isCrossRepository &&
          (since === undefined ||
            Date.parse(pullRequest.createdAt) >= Date.parse(since)),
      )
      .map((pullRequest: { state: string }) => pullRequest.state);
    if (issue.state === "CLOSED") return "merged";
    if (states.includes("OPEN")) return "open";
    if (states.includes("MERGED")) return "merged-issue-open";
    return states.includes("CLOSED") ? "closed" : "none";
  }

  // Every `factory:running` issue, open or closed, that no run on the host
  // holds. A closed issue's work counts as merged.
  async function readClaims(issues: Issue[]): Promise<Claim[]> {
    const closed: { number: number }[] = JSON.parse(
      await ports.gh([
        "issue",
        "list",
        "--state",
        "closed",
        "--label",
        labels.running,
        "--json",
        "number",
        "--limit",
        "1000",
      ]),
    );
    const held = (number: number) => runs.some((run) => run.issue === number);
    const claims: Claim[] = closed
      .filter(({ number }) => !held(number))
      .map(({ number }) => ({ issue: number, pullRequest: "merged" }));
    for (const issue of issues)
      if (issue.labels.includes(labels.running) && !held(issue.number))
        claims.push({
          issue: issue.number,
          pullRequest: await pullRequestState(issue.number),
        });
    return claims;
  }

  async function readUsage() {
    const usage: Partial<Record<Provider, number | null>> = {};
    for (const provider of Object.keys(settings.caps) as Provider[]) {
      try {
        usage[provider] = await ports.readUsage(provider);
      } catch (error) {
        ports.report(`usage for ${provider} is unreadable: ${error}`);
        usage[provider] = null;
      }
    }
    return usage;
  }

  async function apply(decision: Decision, image: string) {
    const { issue } = decision;
    switch (decision.kind) {
      case "claim":
        await ports.gh([
          "issue",
          "edit",
          String(issue),
          "--add-label",
          labels.running,
        ]);
        return;
      case "launch": {
        forget(issue);
        const controller = new AbortController();
        const run: HostRun = {
          issue,
          mode: decision.mode,
          provider: decision.provider,
          model: decision.model,
          effort: decision.effort,
          attempt: decision.attempt,
          startedAt: ports.now().toISOString(),
          log: join(
            ports.root,
            ".sandcastle",
            "logs",
            `issue-${issue}-attempt-${decision.attempt}.log`,
          ),
          ended: null,
          controller,
          exited: false,
          exitedAt: null,
          stopped: false,
        };
        runs.push(run);
        ports
          .launch({
            issue,
            branch: runBranch(issue),
            prompt: prompt(decision.mode, issue),
            provider: run.provider,
            model: run.model,
            effort: run.effort,
            log: run.log,
            image,
            signal: controller.signal,
          })
          .catch((error) =>
            ports.report(`run for #${issue} ended with an error: ${error}`),
          )
          .finally(() => {
            run.exited = true;
            run.exitedAt = ports.now();
          });
        return;
      }
      case "stop": {
        const run = runs.find((candidate) => candidate.issue === issue);
        if (!run) return;
        run.stopped = true;
        run.controller.abort(new Error(decision.reason));
        return;
      }
      case "fail": {
        const run = runs.find((candidate) => candidate.issue === issue);
        await ports.gh([
          "issue",
          "edit",
          String(issue),
          "--remove-label",
          labels.running,
          "--add-label",
          labels.failed,
        ]);
        await ports.gh([
          "issue",
          "comment",
          String(issue),
          "--body",
          failureComment(decision.failure, decision.log, run),
        ]);
        forget(issue);
        return;
      }
      case "keep":
        forget(issue);
        return;
      case "release":
        await ports.gh([
          "issue",
          "edit",
          String(issue),
          "--remove-label",
          labels.running,
        ]);
        forget(issue);
        return;
      case "skip":
        ports.report(`#${issue} skipped: ${decision.reason}`);
        return;
    }
  }

  function forget(issue: number) {
    const index = runs.findIndex((run) => run.issue === issue);
    if (index !== -1) runs.splice(index, 1);
  }

  async function tick(): Promise<Decision[]> {
    await settleUpdateRun();
    if (
      updateRun &&
      ports.now().getTime() - updateRun.startedAt >
        settings.timeLimitMinutes * 60_000
    )
      updateRun.controller.abort(
        new Error("update exceeded the host time limit"),
      );
    await readUpdate();
    for (const run of runs) {
      // An exited run stays on the host only while it waits to settle, such
      // as for its retry's gate, so its pull request state is read each pass.
      if (run.exited)
        run.ended = {
          // Sandcastle's idle timeout can end a run at its limit before the
          // factory stops it, so the time it ran decides, not who ended it.
          timedOut:
            run.stopped ||
            run.exitedAt!.getTime() - Date.parse(run.startedAt) >=
              settings.timeLimitMinutes * 60_000,
          pullRequest: await pullRequestState(run.issue, run.startedAt),
        };
    }
    const issues = await readIssues();
    const claims = await readClaims(issues);
    const usage = await readUsage();
    const snapshot: Snapshot = {
      now: ports.now().toISOString(),
      issues,
      runs: runs.map(
        ({ controller: _c, exited: _e, stopped: _s, ...run }) => run,
      ),
      claims,
      usage,
      settings,
      additionalRunning: updateRun ? { [updateRun.provider]: 1 } : {},
    };
    const decisions = decideFactory(snapshot);
    if (pendingUpdate && !updateRun && !("error" in updateModel(snapshot)))
      try {
        await checkUpdateHolds();
      } catch (error) {
        pendingUpdate = null;
        ports.report(`update prerequisite lookup failed: ${error}`);
      }
    let image = "";
    let applied = decisions;
    if (
      decisions.some((decision) => decision.kind === "launch") ||
      (pendingUpdate && !updateRun && !("error" in updateModel(snapshot)))
    ) {
      try {
        image = await buildImage();
      } catch (error) {
        ports.report(
          `the sandbox image did not build, so nothing launches: ${error}`,
        );
        applied = decisions.filter(
          (decision) => decision.kind !== "claim" && decision.kind !== "launch",
        );
      }
    }
    for (const decision of applied) await apply(decision, image);
    // Issue launches take their oldest-first turn before an update uses spare
    // capacity. Recount after applying them.
    if (image) await launchUpdate({ ...snapshot, runs }, image);
    return applied;
  }

  return { tick };
}

function updateMarker(selection: Selection): string {
  return `standards-update-${createHash("sha256")
    .update(
      JSON.stringify({
        cli: selection.cli.version,
        source: selection.standards.repository,
        version: selection.standards.version,
        profile: selection.profile,
      }),
    )
    .digest("hex")
    .slice(0, 16)}`;
}

function triageBody(inspection: Inspection, marker: string): string {
  const { selection } = inspection;
  return [
    `<!-- ${marker} -->`,
    "### Problem",
    "",
    `The available update to ${selection.standards.repository} ${selection.standards.version} (${selection.profile}) with CLI ${selection.cli.version} requires confirmation.`,
    "",
    ...inspection.confirmation.reasons.map(
      (reason) => `- ${reason.change}: \`${reason.target}\``,
    ),
    "",
    "### Desired outcome",
    "",
    "Triage whether to accept these changes before adopting the update.",
    "",
    "### Additional context",
    "",
    `Inspection identity: \`${inspection.identity}\`. Reinspect before confirming; project content may have changed.`,
  ].join("\n");
}

function updatePrompt(inspection: Inspection): string {
  return [
    `Use adopt-standards to update to this selection: ${JSON.stringify(inspection.selection)}.`,
    "The factory authorizes this routine update without a ticket. Install the exact candidate CLI outside the project and use its packaged adopt-standards skill, then the repository's matching skill after installation.",
    "Inspect afresh, build any fresh discovery proposal, and follow the skill through completion. Do not reuse the host inspection identity for start.",
    "If a fresh inspection or a later fix requires confirmation, stop before confirming it and file a needs-triage issue naming the update and every reason. Never pass --confirmed unattended. Include this marker in the issue body and check for an existing issue with it first:",
    updateMarker(inspection.selection),
    "Deliver the completed adoption as one pull request using CONTRIBUTING.md's adoption rules, and use babysit to take it to merge. Do not open an implementation ticket for a routine update.",
  ].join("\n\n");
}

// A claim no run holds has no model or log to name.
function failureComment(
  failure: string,
  log: string | null,
  run?: HostRun,
): string {
  const details = [
    ...(run
      ? [
          `- Model: \`${run.provider}/${run.model}@${run.effort}\`, attempt ${run.attempt}`,
        ]
      : []),
    ...(log ? [`- Log: \`${log}\` on the factory host`] : []),
  ];
  return [
    `The factory run failed: ${failure}.`,
    "",
    ...(details.length > 0 ? [...details, ""] : []),
    `Remove \`${labels.failed}\` to let the factory pick this issue up again.`,
  ].join("\n");
}

// Usage is the fullest window's percentage used, or null when unreadable.
function fullest(values: unknown[]): number | null {
  const readings = values.filter(
    (value): value is number => typeof value === "number",
  );
  return readings.length > 0 ? Math.max(...readings) : null;
}

// The result of the Codex app-server's `account/rateLimits/read`.
export function codexUsage(result: any): number | null {
  const limits = result?.rateLimits;
  return fullest([
    limits?.primary?.usedPercent,
    limits?.secondary?.usedPercent,
  ]);
}

// Claude Code's subscription usage, read best-effort.
export function claudeUsage(result: any): number | null {
  return fullest([
    result?.five_hour?.utilization,
    result?.seven_day?.utilization,
  ]);
}
