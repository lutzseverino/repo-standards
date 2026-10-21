import { spawn } from "node:child_process";
import { formats } from "./formats.js";
import { join } from "node:path";
import semver from "semver";
import { processGroupAlive } from "./run-lock.js";
import type { ResolvedProfile, Script } from "./model.js";
import { declarationTargets } from "./targets.js";
import { record } from "./records.js";

export function operations(
  resolved: Pick<ResolvedProfile, "declarations">,
  phase: "fixes" | "checks",
) {
  return resolved.declarations.flatMap((declaration) =>
    declaration[phase].map((operation) => ({
      declaration: declaration.id,
      phase,
      operation,
    })),
  );
}
// A remote setup fix's readiness probe runs as its fix's operation in the
// probes phase.
type SelectedOperation =
  | ReturnType<typeof operations>[number]
  | {
      declaration: string;
      phase: "probes";
      operation: Script & { id: string };
    };
export interface PrerequisiteEvidence {
  declaration: string;
  phase: "fixes" | "checks";
  operation: string;
  executable: string;
  version: string | null;
  code: string | null;
  process: OperationEvidence["process"];
}
export async function preflight(
  root: string,
  resolved: Pick<ResolvedProfile, "declarations">,
  onSpawn?: (group: number) => void,
  phases: ("fixes" | "checks")[] = ["fixes", "checks"],
): Promise<PrerequisiteEvidence[]> {
  const evidence: PrerequisiteEvidence[] = [];
  for (const { declaration, phase, operation } of phases.flatMap((phase) =>
    operations(resolved, phase),
  )) {
    const { version, code, process } = await probePrerequisite(
      root,
      operation,
      onSpawn,
    );
    evidence.push({
      declaration,
      phase,
      operation: operation.id,
      executable: operation.run.executable,
      version,
      code,
      process,
    });
    if (
      process.error === "AUTHOR_PROCESS_ACTIVE" ||
      process.error === "PROCESS_STATE"
    )
      break;
  }
  return evidence;
}

// Invokes a script's executable with its version arguments and compares the
// first version either output stream reports with the declared range; the
// output explains a code.
export async function probePrerequisite(
  root: string,
  script: Script,
  onSpawn?: (group: number) => void,
) {
  const result = await invoke(
    script.run.executable,
    script.prerequisite["version-arguments"],
    root,
    script["timeout-seconds"],
    "",
    onSpawn,
  );
  const candidates = (["stdout", "stderr"] as const).flatMap((stream) => {
    const token = result[stream].match(
      /(?<![\w.])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?![\w.])/,
    );
    if (!token) return [];
    const end = Buffer.byteLength(
      result[stream].slice(0, token.index! + token[0].length),
    );
    let bytes = 0;
    const event = result.output.findIndex(
      (chunk) => chunk.stream === stream && (bytes += chunk.bytes) >= end,
    );
    return [{ version: semver.valid(token[1]), event }];
  });
  const version =
    candidates.sort((a, b) => a.event - b.event)[0]?.version ?? null;
  const code =
    result.outcome.error === "ENOENT"
      ? "EXECUTABLE_MISSING"
      : result.outcome.error ||
          result.outcome.timedOut ||
          result.outcome.signal ||
          result.outcome.exitCode !== 0
        ? "PROBE_FAILED"
        : !version
          ? "VERSION_UNREADABLE"
          : !semver.satisfies(version, script.prerequisite.version)
            ? "VERSION_INCOMPATIBLE"
            : null;
  const { stdout, stderr } = result;
  return { version, code, process: result.outcome, stdout, stderr };
}

export interface OperationEvidence {
  operation: {
    declaration: string;
    phase: "fixes" | "checks" | "probes";
    id: string;
  };
  process: {
    exitCode: number | null;
    signal: string | null;
    error: string | null;
    timedOut: boolean;
  };
  result: {
    format: typeof formats.result;
    status: string;
    message: string;
  } | null;
  error: string | null;
  stdout: string;
  stderr: string;
}
// Why an author process did not complete successfully, or null when it did.
export function processError(outcome: OperationEvidence["process"]) {
  return outcome.timedOut
    ? "TIMEOUT"
    : outcome.error
      ? "PROCESS_ERROR"
      : outcome.signal
        ? "SIGNAL"
        : outcome.exitCode !== 0
          ? "NONZERO_EXIT"
          : null;
}

// A fix may overwrite an existing setting with a different value only when the
// maintainer confirmed that overwrite; otherwise it reports
// `confirmation-required` without changing anything. A check or probe never
// may. Scripts run from the retained inputs, except a probe inspection runs
// before anything is retained, from the acquired source. Only a check's
// request says what invoked it: an adoption run (the default) or `check`.
export async function execute(
  root: string,
  selected: SelectedOperation,
  selection: { standards: unknown; profile: string; platform: string },
  resolved: Pick<ResolvedProfile, "declarations">,
  onSpawn?: (group: number) => void,
  {
    overwriteAllowed = false,
    sourceRoot = join(root, ".repo-standards/inputs/source"),
    invocation = "run",
  }: {
    overwriteAllowed?: boolean;
    sourceRoot?: string;
    invocation?: "run" | "check";
  } = {},
) {
  const { declaration, phase, operation } = selected;
  const identity = { declaration, phase, id: operation.id };
  const input = {
    format: formats.operation,
    operation: identity,
    projectRoot: root,
    standards: selection.standards,
    profile: selection.profile,
    platform: selection.platform,
    declarations: resolved.declarations,
    allowedTargets: declarationTargets(
      resolved.declarations.find((item) => item.id === declaration)!,
    ),
    overwriteAllowed,
    ...(phase === "checks" && { invocation }),
  };
  const process = await invoke(
    operation.run.executable,
    [join(sourceRoot, operation.run.script), ...operation.run.arguments],
    root,
    operation["timeout-seconds"],
    JSON.stringify(input) + "\n",
    onSpawn,
  );
  const evidence: OperationEvidence = {
    operation: identity,
    process: process.outcome,
    result: null,
    error: processError(process.outcome),
    stdout: process.stdout,
    stderr: process.stderr,
  };
  if (!evidence.error) {
    try {
      const result = record(JSON.parse(process.stdout));
      const { format, status, message } = result;
      const statuses =
        phase === "fixes"
          ? [
              "unchanged",
              "changed",
              "blocked",
              ...(overwriteAllowed ? [] : ["confirmation-required"]),
            ]
          : phase === "probes"
            ? ["ready", "not-ready"]
            : ["passed", "failed", "blocked"];
      if (
        format !== formats.result ||
        typeof status !== "string" ||
        !statuses.includes(status) ||
        typeof message !== "string" ||
        Object.keys(result).some(
          (key) => !["format", "status", "message"].includes(key),
        )
      )
        throw new Error("Invalid result");
      // Spreading the result first keeps the author's key order.
      evidence.result = { ...result, format, status, message };
    } catch {
      evidence.error = "PROTOCOL_ERROR";
    }
  }
  return evidence;
}

// Use a process group so a timed-out interpreter and its children cannot keep
// adoption waiting on inherited pipes. Author processes still have host access;
// PWD names their working directory, not the CLI's.
export function invoke(
  executable: string,
  args: string[],
  cwd: string,
  seconds: number,
  input: string,
  onSpawn?: (group: number) => void,
) {
  return new Promise<{
    outcome: OperationEvidence["process"];
    stdout: string;
    stderr: string;
    output: { stream: "stdout" | "stderr"; bytes: number }[];
  }>((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, PWD: cwd },
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const outcome: OperationEvidence["process"] = {
      exitCode: null,
      signal: null,
      error: null,
      timedOut: false,
    };
    const chunks: { stdout: Buffer[]; stderr: Buffer[] } = {
      stdout: [],
      stderr: [],
    };
    const sizes = { stdout: 0, stderr: 0 };
    const output: { stream: "stdout" | "stderr"; bytes: number }[] = [];
    function kill() {
      if (child.pid)
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
    }
    const deadline = Date.now() + seconds * 1000;
    let timer: NodeJS.Timeout;
    function armTimeout() {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        outcome.timedOut = true;
        kill();
      } else timer = setTimeout(armTimeout, Math.min(remaining, 2_147_483_647));
    }
    armTimeout();
    for (const stream of ["stdout", "stderr"] as const)
      child[stream].on("data", (data: Buffer) => {
        const remaining = 1024 * 1024 - sizes[stream];
        const captured = data.subarray(0, Math.max(0, remaining));
        if (captured.length) {
          chunks[stream].push(captured);
          output.push({ stream, bytes: captured.length });
        }
        sizes[stream] += data.length;
        if (sizes[stream] > 1024 * 1024) {
          outcome.error = "OUTPUT_LIMIT";
          kill();
        }
      });
    child.on("error", (error) => {
      outcome.error = (error as NodeJS.ErrnoException).code ?? error.message;
    });
    child.stdin.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "EPIPE") {
        outcome.error = error.message;
        kill();
      }
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      outcome.exitCode = code;
      outcome.signal = signal;
      try {
        if (child.pid && processGroupAlive(child.pid))
          outcome.error = "AUTHOR_PROCESS_ACTIVE";
      } catch {
        outcome.error = "PROCESS_STATE";
      }
      resolve({
        outcome,
        stdout: Buffer.concat(chunks.stdout).toString("utf8"),
        stderr: Buffer.concat(chunks.stderr).toString("utf8"),
        output,
      });
    });
    try {
      if (child.pid) onSpawn?.(child.pid);
      child.stdin.end(input);
    } catch {
      outcome.error = "PROGRESS_WRITE";
      kill();
    }
  });
}
