import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { hash } from "./acquisition.js";
import { ProductError } from "./errors.js";
import { invoke, probePrerequisite, processError } from "./execution.js";
import { formats } from "./formats.js";
import type { Script } from "./model.js";
import { processGroupAlive } from "./run-lock.js";
import {
  parseScope,
  scopeEntryRejection,
  type ScopeProposal,
} from "./scope.js";
import { readStable, type ScopeObservation } from "./scope-observation.js";

type Entry = ScopeProposal["declarations"][number];

// A discovery script drafts one declaration's scope proposal entry for review;
// it never decides scope. It runs in a copy of the files and directories the
// discovery observation holds, so the project stays unchanged, and a script
// that changes that copy fails like one that times out. A symbolic link whose
// target leaves the copy is omitted, so writing through it cannot reach the
// project.

function unstable(): never {
  throw new ProductError(
    "OBSERVATION_UNSTABLE",
    "Discovery evidence changed during inspection. Inspect again.",
  );
}

// Rereads an observed file as the observation read it, so one replaced since
// then fails as unstable instead of being followed or blocking.
function reread(path: string) {
  try {
    const before = lstatSync(path);
    if (before.isFile()) return readStable(path, before).content;
  } catch (error) {
    if (error instanceof ProductError) throw error;
  }
  unstable();
}

// Each entry's change time is recorded once the copy is complete, so a change
// to anything about it, timestamps included, is seen.
type Copied = { ctime: bigint } & (
  | { type: "directory"; mode: number }
  | { type: "symlink"; target: string }
  | { type: "file"; size: number; sha256: string; mode: number }
);
const status = (path: string) => {
  const stat = lstatSync(path, { bigint: true });
  return { stat, ctime: stat.ctimeNs, mode: Number(stat.mode & 0o7777n) };
};

// Copies the observed files and returns what the copy holds, by path, with
// the root as ".".
function copyObserved(root: string, observation: ScopeObservation, to: string) {
  const copied = new Map<string, Copied>();
  const directory = (path: string) => {
    mkdirSync(join(to, path), { recursive: true });
    for (let at = path; !copied.has(at); at = dirname(at)) {
      copied.set(at, { type: "directory", mode: 0, ctime: 0n });
      if (at === ".") break;
    }
  };
  for (const path of [".", ...Object.keys(observation.inventories)])
    directory(path);
  for (const [path, state] of Object.entries(observation.files)) {
    const target = join(to, path);
    directory(dirname(path));
    if (state.type === "symlink") {
      const within = relative(to, resolve(dirname(target), state.target));
      if (within.split(sep)[0] !== ".." && !isAbsolute(within)) {
        symlinkSync(state.target, target);
        copied.set(path, { type: "symlink", target: state.target, ctime: 0n });
      }
    } else if (state.type === "file") {
      const bytes = reread(join(root, path));
      if (hash(bytes) !== state.sha256) unstable();
      writeFileSync(target, bytes, { mode: state.executable ? 0o755 : 0o644 });
      copied.set(path, {
        type: "file",
        size: bytes.length,
        sha256: state.sha256,
        mode: 0,
        ctime: 0n,
      });
    }
  }
  for (const [path, copy] of copied) {
    const { ctime, mode } = status(join(to, path));
    if (copy.type !== "symlink") copy.mode = mode;
    copy.ctime = ctime;
  }
  return copied;
}

// Whether the script changed its copy, permissions and timestamps included. The scan stops
// at the first entry the copy did not hold, so it reads no more than was
// copied, and an entry it cannot read is a change.
function changed(to: string, copied: Map<string, Copied>) {
  let seen = 1;
  const differs = (directory: string): boolean =>
    readdirSync(join(to, directory)).some((name) => {
      const path = directory === "." ? name : `${directory}/${name}`;
      const copy = copied.get(path);
      if (!copy) return true;
      seen++;
      const { stat, ctime, mode } = status(join(to, path));
      if (ctime !== copy.ctime) return true;
      if (copy.type === "directory")
        return !stat.isDirectory() || mode !== copy.mode || differs(path);
      if (copy.type === "symlink")
        return (
          !stat.isSymbolicLink() || readlinkSync(join(to, path)) !== copy.target
        );
      return (
        !stat.isFile() ||
        stat.size !== BigInt(copy.size) ||
        mode !== copy.mode ||
        hash(readFileSync(join(to, path))) !== copy.sha256
      );
    });
  try {
    const root = copied.get(".") as Copied & { mode: number };
    const { ctime, mode } = status(to);
    return (
      ctime !== root.ctime ||
      mode !== root.mode ||
      differs(".") ||
      seen !== copied.size
    );
  } catch {
    return true;
  }
}

// A script may take permissions away from its copy; give them back so the copy
// can be removed.
function release(directory: string) {
  chmodSync(directory, 0o700);
  for (const entry of readdirSync(directory, { withFileTypes: true }))
    if (entry.isDirectory()) release(join(directory, entry.name));
}

function remove(work: string) {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    release(work);
    rmSync(work, { recursive: true, force: true });
  }
}

// A process the script left running would outlive the copy it works in, so
// the group is killed and awaited; whether it is gone is returned.
async function stop(group: number) {
  try {
    process.kill(-group, "SIGKILL");
  } catch {
    return true;
  }
  for (let tries = 0; tries < 100; tries++) {
    if (!processGroupAlive(group)) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return !processGroupAlive(group);
}

function unavailable(
  declaration: string,
  reason: string,
  output: { stdout: string; stderr: string },
): never {
  throw new ProductError(
    "DISCOVERY_SCRIPT_FAILED",
    `The discovery script of ${declaration} cannot run: its prerequisite probe reports ${reason}. Install the prerequisite, then inspect again.`,
    { declaration, reason, ...output },
  );
}

function failed(
  declaration: string,
  reason: string,
  output: { stdout: string; stderr: string },
  cause = "",
): never {
  throw new ProductError(
    "DISCOVERY_SCRIPT_FAILED",
    `The discovery script of ${declaration} failed with ${reason}, and the project is unchanged.${cause ? ` ${cause}` : ""} Report the script to its standards source.`,
    { declaration, reason, ...output },
  );
}

export async function draftScope(options: {
  root: string;
  observation: ScopeObservation;
  sourceRoot: string;
  declaration: string;
  // Whether the declaration is optional, so its draft may propose no scope.
  optional: boolean;
  script: Script;
  selection: { standards: unknown; profile: string; platform: string };
}): Promise<Entry> {
  const { declaration, script, observation } = options;
  const work = mkdtempSync(join(tmpdir(), "repo-standards-discovery-"));
  // A copy a surviving process may still use is left in place.
  let kept = false;
  try {
    const project = join(work, "project");
    const copied = copyObserved(options.root, observation, project);
    let group = 0;
    const spawned = (spawnedGroup: number) => {
      group = spawnedGroup;
    };
    const settle = async (error: string | null) => {
      if (error !== "AUTHOR_PROCESS_ACTIVE" && error !== "PROCESS_STATE")
        return;
      // Until the group is known to be gone, a process may still use the
      // copy, so it is kept if stopping fails, PROCESS_STATE included.
      kept = true;
      if (await stop(group)) {
        kept = false;
        return;
      }
      throw new ProductError(
        "AUTHOR_PROCESS_ACTIVE",
        `The discovery script of ${declaration} left author process group ${group} running after it was killed. Stop it, remove ${work}, then inspect again.`,
        { declaration, group, copy: work },
      );
    };
    const prerequisite = await probePrerequisite(project, script, spawned);
    await settle(prerequisite.process.error);
    if (prerequisite.code)
      unavailable(declaration, prerequisite.code, {
        stdout: prerequisite.stdout,
        stderr: prerequisite.stderr,
      });
    const input = {
      format: formats.discovery,
      declaration,
      projectRoot: project,
      standards: options.selection.standards,
      profile: options.selection.profile,
      platform: options.selection.platform,
    };
    const { outcome, stdout, stderr } = await invoke(
      script.run.executable,
      [join(options.sourceRoot, script.run.script), ...script.run.arguments],
      project,
      script["timeout-seconds"],
      JSON.stringify(input) + "\n",
      spawned,
    );
    await settle(outcome.error);
    const output = { stdout, stderr };
    const reason =
      processError(outcome) ??
      (changed(project, copied) ? "PROJECT_WRITE" : null);
    if (reason) failed(declaration, reason, output);
    const invalid = (cause: string) =>
      failed(declaration, "PROTOCOL_ERROR", output, cause);
    let entries: Entry[] = [];
    try {
      entries = parseScope(stdout).declarations;
    } catch (error) {
      if (!(error instanceof ProductError)) throw error;
      invalid(error.message);
    }
    const [entry] = entries;
    if (entries.length !== 1 || entry!.id !== declaration)
      invalid(`Its proposal must hold exactly one entry, for ${declaration}.`);
    if (entry!.noScope && !options.optional)
      invalid(
        `Its entry proposes no scope, but ${declaration} is not optional.`,
      );
    const rejection = scopeEntryRejection(options.root, observation, entry!);
    if (rejection) invalid(rejection);
    return entry!;
  } finally {
    if (!kept) remove(work);
  }
}
