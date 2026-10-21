import { readFileSync } from "node:fs";
import { join } from "node:path";
import { archivedContext, archivedRuns, type Run } from "./adoption-run.js";
import { ProductError } from "./errors.js";
import {
  installationDeltas,
  verifyInstallation,
  type Installation,
} from "./installation.js";
import { git, uncommittedPaths, type Blocker } from "./observation.js";
import {
  readCommittedAdoption,
  type RecordedAdoption,
} from "./recorded-state.js";
import { record } from "./records.js";
import { concreteScope } from "./scope.js";
import { netChangeSet, type InheritedChange } from "./work-evidence.js";
import { observeWork, type WorkObservation } from "./work-observation.js";

// Preserved changes: what an abandoned or replaced run left in the checkout,
// which adopting again in place starts over instead of requiring them to be
// committed or discarded. A run is preserved while the checkout still holds
// exactly what it recorded: its HEAD and index, its verified installation, and,
// outside product state, each uncommitted path in the state the run's last
// observation recorded. A start over it exempts exactly those paths from the
// Git start blockers, reads the last complete adoption from the HEAD the run
// started from, and carries the run's changes into its own change set.

export interface PreservedRun {
  // The run's archived report, and its intervals up to the observation it
  // stopped at.
  run: Run;
  intervals: Run["observations"];
  installation: Installation;
  // The last complete adoption the run updated, read from its HEAD at start.
  previous?: RecordedAdoption;
  // The uncommitted paths outside product state that the run recorded, and
  // those it did not.
  recorded: string[];
  unrecorded: string[];
}

export interface PreservedLookup {
  preserved?: PreservedRun;
  // The abandoned run whose installation wrote the checkout's lock, and why
  // the checkout no longer holds what it left, when it does not.
  abandoned?: Run;
  mismatch?: string;
}

const productState = ".repo-standards";
const lockFile = `${productState}/lock.json`;

// The checkout's lock names the inspection of the run whose installation wrote
// it. It is read without verification only to find that run.
function lockInspection(root: string) {
  try {
    return record(JSON.parse(readFileSync(join(root, lockFile), "utf8")))
      .inspection;
  } catch {
    return undefined;
  }
}

export function findPreservedRun(root: string): PreservedLookup {
  const inspection = lockInspection(root);
  if (typeof inspection !== "string") return {};
  // An archived report that cannot be read preserves nothing; status reports
  // it.
  let archived: Run[];
  try {
    archived = archivedRuns(root);
  } catch {
    return {};
  }
  const candidates = archived.filter(
    (run) =>
      run.abandoned &&
      run.inspection === inspection &&
      run.installation?.complete,
  );
  let mismatch: string | undefined;
  for (const run of candidates) {
    const context = archivedContext(root, run);
    if (!context) {
      mismatch = `the context run ${run.id} archived to adopt again in place is missing or changed`;
      continue;
    }
    const { installation, observation, intervals } = context;
    const head = git(root, ["rev-parse", "--verify", "HEAD"]).stdout.trim();
    try {
      if (head !== run.head)
        throw new ProductError(
          "FINAL_INTEGRITY",
          "HEAD changed since the run.",
        );
      verifyInstallation(root, installation);
    } catch (error) {
      mismatch = (error as Error).message;
      continue;
    }
    const { recorded, unrecorded } = recordedPaths(
      root,
      installation,
      observation,
    );
    const previous = run.previousComplete
      ? readCommittedAdoption(root, head)
      : undefined;
    if (
      run.previousComplete &&
      previous?.state.lastComplete.run !== run.previousComplete.lastComplete.run
    )
      throw new ProductError(
        "STATE_INTEGRITY",
        `The commit run ${run.id} started from does not hold the adoption it updated. Restore the committed product state.`,
      );
    return {
      preserved: {
        run,
        intervals,
        installation,
        ...(previous ? { previous } : {}),
        recorded,
        unrecorded,
      },
    };
  }
  return candidates.length
    ? { abandoned: candidates[0]!, ...(mismatch ? { mismatch } : {}) }
    : {};
}

// The uncommitted paths outside product state, split by whether the run's last
// observation recorded each in its current state. A run that recorded no
// interval left only its installation, which verification has matched.
function recordedPaths(
  root: string,
  installation: Installation,
  observation: WorkObservation | undefined,
) {
  const paths = [...uncommittedPaths(root)]
    .filter(
      (path) => path !== productState && !path.startsWith(`${productState}/`),
    )
    .sort();
  const current = observation
    ? observeWork(root, concreteScope(installation.report.resolved))
    : undefined;
  const state = (value: WorkObservation, path: string) =>
    JSON.stringify(value.files[path] ?? { type: "missing" });
  const installed = (path: string) =>
    Object.hasOwn(installation.files, path) ||
    Object.hasOwn(installation.links, path) ||
    installation.replaceTrees.some(
      (tree) => path === tree || path.startsWith(`${tree}/`),
    );
  const recorded: string[] = [];
  const unrecorded: string[] = [];
  for (const path of paths) {
    const kept = observation
      ? state(observation, path) === state(current!, path)
      : installed(path);
    (kept ? recorded : unrecorded).push(path);
  }
  return { recorded, unrecorded };
}

// The Git start blockers of a start over a preserved run: each uncommitted
// path it did not record. A checkout an abandoned run left changed otherwise
// says why adopting again in place does not apply.
export function preservedStartBlockers(
  blockers: Blocker[],
  lookup: PreservedLookup,
  preserved: PreservedRun | undefined,
): Blocker[] {
  if (preserved)
    return [
      ...blockers.filter(({ code }) => code !== "DIRTY_PROJECT"),
      ...preserved.unrecorded.map((path) => ({
        code: "DIRTY_PROJECT",
        path,
        message: `This uncommitted change is not one that run ${preserved.run.id} recorded, so adopting again in place over that run's preserved changes would take it as the run's. Commit or reconcile it first.`,
      })),
    ];
  const stopped = lookup.preserved?.run ?? lookup.abandoned;
  if (!stopped) return blockers;
  const why = lookup.preserved
    ? `Adopting again in place over them keeps that run's selection: CLI ${stopped.selection.cli.version}, ${stopped.selection.standards.repository} ${stopped.selection.standards.version}, profile ${stopped.selection.profile}, platform ${stopped.selection.platform}.`
    : `The checkout no longer holds them as the run recorded${lookup.mismatch ? `: ${lookup.mismatch}` : "."} Adopting again in place needs them as the run left them.`;
  return blockers.map((blocker) =>
    blocker.code === "DIRTY_PROJECT"
      ? {
          ...blocker,
          message: `${blocker.message} Run ${stopped.id} left its changes in this checkout when it stopped. ${why}`,
        }
      : blocker,
  );
}

// The changes a preserved run left, relative to the HEAD it, or the run it
// replaced in turn, started from.
export function preservedChanges(preserved: PreservedRun): InheritedChange[] {
  return netChangeSet(
    preserved.installation.inherited ?? [],
    installationDeltas(preserved.installation),
    preserved.intervals,
  );
}

// Whether a selection is the one a preserved run adopted: adopting again in
// place keeps the run's CLI, source, version, profile and platform. A
// selection that names no platform uses its profile's only one, which the
// run's same profile then used too.
export function preservesSelection(
  preserved: PreservedRun,
  selection: {
    cli: string;
    source: string;
    version: string;
    profile: string;
    platform?: string;
  },
): boolean {
  const key = (url: string) =>
    url
      .toLowerCase()
      .replace(/\/$/, "")
      .replace(/\.git$/, "");
  const { cli, standards, profile, platform } = preserved.run.selection;
  return (
    cli.version === selection.cli &&
    key(standards.repository) === key(selection.source) &&
    standards.version === selection.version &&
    profile === selection.profile &&
    (selection.platform === undefined || platform === selection.platform)
  );
}

// A preserved run's version still resolves to the commit it adopted.
export function requirePreservedCommit(
  preserved: PreservedRun,
  version: string,
  commit: string,
): void {
  const adopted = preserved.run.selection.standards.commit;
  if (adopted !== commit)
    throw new ProductError(
      "MOVED_TAG",
      `The ${version} tag resolved to ${adopted} for run ${preserved.run.id}, whose preserved changes this inspection adopts over in place; it now resolves to ${commit}. Choose a new immutable version.`,
    );
}
