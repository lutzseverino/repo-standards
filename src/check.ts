import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  file,
  lockPath,
  projectRoot,
  safeDirectory,
  write,
} from "./adoption-files.js";
import { ProductError } from "./errors.js";
import { execute, operations, preflight } from "./execution.js";
import { formats } from "./formats.js";
import { requireSupportedGit } from "./observation.js";
import { readOnlyGuard } from "./read-only.js";
import {
  activeRunExemption,
  readRecordedAdoption,
  rejectUnsupportedRecords,
  requireRecordedCli,
  type RecordedSelection,
} from "./recorded-state.js";
import { installedRules } from "./rules.js";
import { acquireWorker } from "./run-lock.js";
import { withWaitingRun } from "./adoption-run.js";
import type { ResolvedProfile } from "./model.js";
import { concreteScope } from "./scope.js";

// Runs the retained checks of the last complete adoption against the current
// working tree, on demand and outside any run. The adoption already disclosed
// and confirmed these checks, so nothing is confirmed again. Every check runs
// whatever earlier checks returned. Checks must leave project content
// unchanged; this command cannot prevent a write. Around each prerequisite
// probe and check it makes the observation a run's check interval makes, of
// the project, product state, HEAD and the index, and fails, naming the probe
// or check and the changed paths, when that observation changed or can no
// longer be made. It writes only its logs, under the ignored local directory,
// and records nothing. A terminal adoption runs one contextual declaration's
// checks the same way while its run waits for contextual work.

const logs = ".repo-standards/local/checks";

export interface CheckResult {
  declaration: string;
  id: string;
  status: "passed" | "failed" | "blocked" | "error";
  message: string;
  // The execution error code, when the check did not return a valid result.
  error: string | null;
  // The installed rules of the declaration of a check that did not pass, when
  // it has any.
  rules: string | null;
  stdout: string;
  stderr: string;
}
export interface CheckReport {
  format: typeof formats.check;
  outcome: "passed" | "failed";
  selection: RecordedSelection;
  checks: CheckResult[];
}

export async function check(
  project: string,
  cliVersion: string,
): Promise<CheckReport> {
  const root = projectRoot(project);
  const lock = lockPath(root);
  requireRecordedCli(root, lock, cliVersion);
  // The pin takes priority, as for status; the Git gate still precedes reading
  // records or observing the project.
  requireSupportedGit();
  // An active fresh adoption may not have removed retired state yet; the run
  // is what blocks a check.
  rejectUnsupportedRecords(root, lock, activeRunExemption(lock));
  const release = acquireWorker(lock);
  try {
    if (existsSync(lock))
      throw new ProductError(
        "ACTIVE_RUN",
        "An adoption run is active or incomplete. Read status, and complete or abandon the run before checking.",
      );
    const recorded = readRecordedAdoption(root);
    if (!recorded)
      throw new ProductError(
        "NO_SELECTION",
        "No complete adoption is recorded. Inspect a public source with --source, --standards-version and --profile.",
      );
    const { selection, resolved } = recorded;
    recorded.source();
    const checks = await runChecks(root, resolved, selection);
    return {
      format: formats.check,
      outcome: checks.every((result) => result.status === "passed")
        ? "passed"
        : "failed",
      selection,
      checks,
    };
  } finally {
    release();
  }
}

// Runs one contextual declaration's retained checks against the working tree
// while its run waits for contextual work, as adopt does in a terminal before
// asking whether the declaration is done. It records nothing in the run: the
// run's own check round after the assessment decides.
export async function checkContextual(
  project: string,
  cliVersion: string,
  declaration: string,
) {
  return withWaitingRun(project, cliVersion, ({ report }) =>
    runChecks(
      projectRoot(project),
      report.resolved,
      report.selection,
      declaration,
    ),
  );
}

// Runs the checks of a resolved selection, or of one of its declarations,
// each whatever earlier checks returned, observing that each leaves the
// project unchanged, and keeps their logs.
async function runChecks(
  root: string,
  resolved: Pick<ResolvedProfile, "declarations">,
  selection: { standards: unknown; profile: string },
  declaration?: string,
) {
  const cited = installedRules(resolved.declarations);
  const scope = concreteScope(resolved);
  const selected = {
    declarations: resolved.declarations.filter(
      (entry) => declaration === undefined || entry.id === declaration,
    ),
  };
  const requireUnchanged = readOnlyGuard(
    root,
    scope,
    "CHECK_MUTATION",
    "Checks must leave project content unchanged",
  );
  let group: number | undefined;
  const requireStopped = (actor: string, error: string | null) => {
    if (error === "AUTHOR_PROCESS_ACTIVE" || error === "PROCESS_STATE")
      throw new ProductError(
        error,
        `${actor} left author process group ${group} with live processes, or its state cannot be read. Stop them before checking again.`,
      );
  };
  const prerequisites = await preflight(
    root,
    selected,
    (spawned) => {
      group = spawned;
    },
    ["checks"],
  );
  requireStopped(
    "A prerequisite probe",
    prerequisites.at(-1)?.process.error ?? null,
  );
  requireUnchanged("A prerequisite probe");
  if (prerequisites.some((probe) => probe.code))
    throw new ProductError(
      "PREREQUISITES_BLOCKED",
      "Resolve the reported executable and version problems; prerequisites are never installed automatically.",
      prerequisites,
    );
  safeDirectory(root, logs);
  rmSync(join(root, logs), { recursive: true, force: true });
  const checks: CheckResult[] = [];
  for (const operation of operations(selected, "checks")) {
    const actor = `Check ${operation.declaration}/${operation.operation.id}`;
    const evidence = await execute(
      root,
      operation,
      selection,
      resolved,
      (spawned) => {
        group = spawned;
      },
    );
    const log = `${logs}/${checks.length}`;
    const keepLogs = () => {
      write(root, `${log}.stdout`, file(evidence.stdout));
      write(root, `${log}.stderr`, file(evidence.stderr));
    };
    // Observe before keeping the logs, so a change the check made is
    // reported as its change; its logs are then kept where possible.
    try {
      requireStopped(actor, evidence.process.error);
      requireUnchanged(actor);
    } catch (error) {
      try {
        keepLogs();
      } catch {
        /* Report the check's change, not the logs. */
      }
      throw error;
    }
    keepLogs();
    const status = evidence.result
      ? (evidence.result.status as CheckResult["status"])
      : "error";
    checks.push({
      declaration: operation.declaration,
      id: operation.operation.id,
      status,
      message:
        evidence.result?.message ??
        `The check did not return a successful process and protocol result (${[evidence.error, evidence.process.error].filter(Boolean).join(": ")}). Read its logs.`,
      error: evidence.error,
      rules:
        status === "passed" ? null : (cited.get(operation.declaration) ?? null),
      stdout: `${log}.stdout`,
      stderr: `${log}.stderr`,
    });
  }
  return checks;
}

// A message or profile on one line, so it cannot pass for another line.
function oneLine(text: string) {
  return text.replace(/\s*(?:\r\n|[\n\v\f\r\x85\u2028\u2029])\s*/g, " ").trim();
}

// The readable form of a check report: one line per check after a count. The
// JSON report keeps the profile and each message as they are.
export function checkSummary(report: CheckReport) {
  const { standards, profile } = report.selection;
  const counts = (["passed", "failed", "blocked", "error"] as const)
    .map(
      (status) =>
        [
          status,
          report.checks.filter((result) => result.status === status).length,
        ] as const,
    )
    .filter(([, count]) => count)
    .map(
      ([status, count]) =>
        `${count} ${status === "error" ? (count === 1 ? "error" : "errors") : status}`,
    );
  const lines = [
    `Checks of ${standards.repository} ${standards.version}, profile ${oneLine(profile)}: ${counts.length ? counts.join(", ") : "none declared"}.`,
    ...report.checks.map(
      (result) =>
        `${result.status.padEnd(7)} ${result.declaration}/${result.id}: ${oneLine(result.message)}${result.rules ? ` Rules: ${result.rules}` : ""}${result.status === "passed" ? "" : ` Output: ${result.stdout}, ${result.stderr}`}`,
    ),
  ];
  return lines.join("\n") + "\n";
}
