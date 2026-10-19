import { ProductError } from "./errors.js";
import { declarationTargets } from "./targets.js";
import { formats } from "./formats.js";
import type { ResolvedProfile } from "./model.js";
import { concreteScope, type Scope } from "./scope.js";
import { observationIdentity } from "./scope-observation.js";
import {
  absent,
  changedBoundaries,
  observeWork,
  observedChanges,
  permits,
  restoreInstruction,
  type WorkObservation,
} from "./work-observation.js";

// Work evidence is the durable record of observation intervals and operation
// outcomes for one adoption run. This module is its journal: it opens, closes
// and continues intervals, records the gaps between them, checks their
// violations, and answers what the agent changed. It owns the recorded interval
// shape, which the run record and committed state share, and that slice of
// durable state: what a completion commits, including the run's net change
// set, and how its single format is validated on read. Committed state holds
// the current run only; earlier runs stay in Git history. An interval keeps
// observation identities and the delta between them, never observation maps,
// so neither record grows with the project and adoption pull requests remain
// reviewable. Full observations are held in memory while a command observes;
// the journal keeps only the one its last interval ends at, through an
// observation store, for the next command to compare.

type FileState = WorkObservation["files"][string];
export interface Delta {
  before: unknown;
  after: unknown;
}
type Operation = { declaration: string; phase: "fixes" | "checks"; id: string };

// An interval as a command holds it in memory, with its full observations.
// It is recorded as identities and a delta through recordedInterval.
interface WorkInterval {
  phase: "fixes" | "checks" | "agent";
  scope: Scope;
  before: WorkObservation;
  operation?: Operation;
  operationIndex?: number;
  after?: WorkObservation;
  changedPaths?: string[];
  boundaryChanges?: string[];
  violations?: string[];
  interrupted?: boolean;
  restoredExact?: WorkObservation["files"];
  restoredBoundaries?: WorkObservation["boundaries"];
}

export interface RecordedInterval {
  phase: WorkInterval["phase"];
  scope: Scope;
  operation?: Operation;
  operationIndex?: number;
  before: string;
  after?: string;
  changes?: Record<string, Delta>;
  boundaryChanges?: Record<string, Delta>;
  violations?: string[];
  restoredExact?: Record<string, FileState>;
  restoredBoundaries?: Record<string, FileState>;
  interrupted?: boolean;
}

// The phases that change project paths in a complete run. Checks never do: a
// check that changes content leaves the run incomplete.
const changePhases = ["installation", "fixes", "agent"] as const;
type ChangePhase = (typeof changePhases)[number];

// One entry of a run's net change set: a path whose state the run changed, and
// every phase that changed it.
export interface ChangedPath {
  path: string;
  phases: ChangePhase[];
}

// A change a replaced run left in the checkout, which the run replacing it in
// place carries: the path's state before the replaced run, its state as that
// run left it, and the phases that changed it.
export interface InheritedChange extends ChangedPath {
  before: unknown;
  after: unknown;
}

export interface ExecutionEvidence {
  format: typeof formats.state;
  observations: RecordedInterval[];
  operations: unknown[];
  retryHistory: unknown[];
  changeSet: ChangedPath[];
}

// Changed paths name project files, but also the external ignore inputs and
// observation settings that cannot be authorized as project paths. Each keeps
// the state the interval actually compared.
function changedState(observation: WorkObservation, path: string): unknown {
  if (path === "@git/observation-settings") return observation.settings;
  if (path.startsWith("@ignore/"))
    return observation.ignores[path.slice("@ignore/".length)] ?? null;
  if (Object.hasOwn(observation.files, path)) return observation.files[path];
  if (Object.hasOwn(observation.ignores, path))
    return observation.ignores[path];
  return { type: "missing" };
}

function boundaryState(observation: WorkObservation, path: string) {
  return observation.boundaries[path] ?? { type: "missing" };
}

// Recording an interval keeps its authority, its identities and its delta.
function recordedInterval(observed: WorkInterval): RecordedInterval {
  const after = observed.after;
  return {
    phase: observed.phase,
    scope: structuredClone(observed.scope),
    ...(observed.operation
      ? { operation: structuredClone(observed.operation) }
      : {}),
    ...(observed.operationIndex !== undefined
      ? { operationIndex: observed.operationIndex }
      : {}),
    before: observationIdentity(observed.before),
    ...(after ? { after: observationIdentity(after) } : {}),
    ...(after && observed.changedPaths
      ? {
          changes: Object.fromEntries(
            observed.changedPaths.map((path) => [
              path,
              {
                before: changedState(observed.before, path),
                after: changedState(after, path),
              },
            ]),
          ),
        }
      : {}),
    ...(after && observed.boundaryChanges
      ? {
          boundaryChanges: Object.fromEntries(
            observed.boundaryChanges.map((path) => [
              path,
              {
                before: boundaryState(observed.before, path),
                after: boundaryState(after, path),
              },
            ]),
          ),
        }
      : {}),
    ...(observed.violations ? { violations: [...observed.violations] } : {}),
    ...(observed.restoredExact
      ? { restoredExact: structuredClone(observed.restoredExact) }
      : {}),
    ...(observed.restoredBoundaries
      ? { restoredBoundaries: structuredClone(observed.restoredBoundaries) }
      : {}),
    ...(observed.interrupted ? { interrupted: observed.interrupted } : {}),
  };
}

// Agent work is authorized by the contextual declarations' concrete scope.
function contextualScope(resolved: ResolvedProfile): Scope {
  return concreteScope({
    ...resolved,
    declarations: resolved.declarations.filter(
      (declaration) => "guidance" in declaration,
    ),
  });
}

// Closes an interval at an observation of the project at root made just now.
function finishInterval(
  interval: WorkInterval,
  after: WorkObservation,
  root: string,
) {
  interval.after = after;
  interval.changedPaths = observedChanges(interval.before, after);
  interval.boundaryChanges = changedBoundaries(interval.before, after);
  const scopes = Object.values(interval.scope);
  const changed = new Set(interval.changedPaths);
  const authorized = (path: string) =>
    interval.phase !== "checks" &&
    (!!interval.restoredExact?.[path] ||
      scopes.some((targets) => permits(targets, path)));
  const fileViolations = interval.changedPaths.filter(
    (path) => !authorized(path),
  );
  const boundaryViolations = interval.boundaryChanges.filter((path) => {
    if (interval.phase === "checks") return true;
    if (interval.restoredBoundaries?.[path]) return false;
    if (scopes.some((targets) => permits(targets, path))) return false;
    const before = interval.before.boundaries[path];
    // Named file authority includes creating its missing parent directories,
    // and removing a directory whose files the authorized changes removed. An
    // empty directory qualifies trivially. Changing an existing directory's
    // mode, or replacing it with a file, link or ignored entry, is never
    // authorized.
    if (!before || before.type === "missing")
      return !(
        after.boundaries[path]?.type === "directory" &&
        scopes.some((targets) =>
          [...targets.paths, ...targets.directories].some((target) =>
            target.startsWith(path + "/"),
          ),
        )
      );
    return !(
      before.type === "directory" &&
      [after.boundaries[path], after.files[path]].every(
        (state) => !state || state.type === "missing",
      ) &&
      absent(root, path) &&
      Object.entries(interval.before.files)
        .filter(
          ([file, state]) =>
            state.type !== "missing" && file.startsWith(path + "/"),
        )
        .every(([file]) => changed.has(file) && authorized(file))
    );
  });
  interval.violations = [
    ...new Set([...fileViolations, ...boundaryViolations]),
  ].sort();
}

// A path's net change over the run: its state before the earliest interval that
// changed it, and its state at the latest observation. Fixes, checks and agent
// work all count, in the namespace of files or of boundary directories.
function netChanges(
  intervals: readonly RecordedInterval[],
  key: "changes" | "boundaryChanges",
) {
  const net = new Map<string, Delta>();
  for (const interval of intervals)
    for (const [path, delta] of Object.entries(interval[key] ?? {}))
      net.set(path, {
        before: net.has(path) ? net.get(path)!.before : delta.before,
        after: delta.after,
      });
  return net;
}

function differs(delta: Delta) {
  return JSON.stringify(delta.before) !== JSON.stringify(delta.after);
}

// A recorded violation stands until the project is restored: it is reconciled
// once every namespace that changed its path is back at the state it had
// before the run first changed it. Recorded intervals keep their violations as
// observed; only the judgment of them follows the net change.
function standing(intervals: readonly RecordedInterval[]) {
  const nets = [
    netChanges(intervals, "changes"),
    netChanges(intervals, "boundaryChanges"),
  ];
  return (path: string) => {
    const deltas = nets.flatMap((net) => net.get(path) ?? []);
    return deltas.length === 0 || deltas.some(differs);
  };
}

function requireValidIntervals(intervals: RecordedInterval[]) {
  const stands = standing(intervals);
  for (const interval of intervals) {
    const paths = interval.violations?.filter(stands) ?? [];
    if (!paths.length) continue;
    const operation = interval.operation;
    const code =
      interval.phase === "agent"
        ? "ASSESSMENT_SCOPE"
        : interval.phase === "checks"
          ? "CHECK_MUTATION"
          : "OPERATION_SCOPE";
    throw new ProductError(
      code,
      `${operation ? `Operation ${operation.declaration}/${operation.id}` : "Agent work"} changed paths outside its authorized ${interval.phase} scope: ${paths.join(", ")}. Work and interval evidence are preserved. ${restoreInstruction}`,
    );
  }
}

// The identity of the observation the last interval ends at: its before while
// open, its after once closed.
export function keptIdentity(intervals: readonly RecordedInterval[]) {
  const last = intervals.at(-1);
  return last && (last.after ?? last.before);
}

// Recorded intervals keep only identities, so the journal keeps the full
// observation its last interval ends at in a store, addressed by identity.
// A run keeps it beside its journal; abandonment keeps it in memory, because
// an archived report is never continued.
export interface ObservationStore {
  read(identity: string): WorkObservation;
  keep(observation: WorkObservation): void;
}

// Keeps observations in memory only, reading any it was not given from the
// store an earlier command kept them in.
export function memoryStore(
  kept: Pick<ObservationStore, "read">,
): ObservationStore {
  const held = new Map<string, WorkObservation>();
  return {
    read: (identity) => held.get(identity) ?? kept.read(identity),
    keep: (observation) => {
      held.set(observationIdentity(observation), observation);
    },
  };
}

// The journal records into the run's intervals and reads its operation count.
export interface JournalRecord {
  observations: RecordedInterval[];
  readonly operations: readonly unknown[];
}

// Every interval is observed over the resolved profile's concrete scope. Opening
// and continuing persist the record through the caller's save; closing does not
// (see close). Opening a gap and each close check violations across the whole
// journal, so a detected violation is reported again until the project is
// restored to its state before the run; continuing leaves the check to its
// caller.
export class WorkEvidenceJournal {
  readonly #root: string;
  readonly #resolved: ResolvedProfile;
  readonly #run: JournalRecord;
  readonly #store: ObservationStore;
  readonly #save: () => void;
  readonly #inherited: readonly InheritedChange[];
  #kept: WorkObservation | undefined;

  // A run that replaces another in place inherits the changes that run left,
  // which its own intervals then continue from.
  constructor(
    root: string,
    resolved: ResolvedProfile,
    run: JournalRecord,
    store: ObservationStore,
    save: () => void = () => {},
    inherited: readonly InheritedChange[] = [],
  ) {
    this.#root = root;
    this.#resolved = resolved;
    this.#run = run;
    this.#store = store;
    this.#save = save;
    this.#inherited = inherited;
  }

  #observe() {
    return observeWork(this.#root, concreteScope(this.#resolved));
  }

  // The full observation the last interval ends at, read from the store when an
  // earlier command kept it.
  #last() {
    return (this.#kept ??= this.#store.read(
      keptIdentity(this.#run.observations)!,
    ));
  }

  // Intervals change only together with the observation they now end at, which
  // the store keeps before any saved record refers to it.
  #record(intervals: RecordedInterval[], observation: WorkObservation) {
    this.#store.keep(observation);
    this.#kept = observation;
    this.#run.observations = intervals;
  }

  // Opens an interval for an operation under its declaration's allowed targets,
  // or for agent work under the contextual scope. Work since the last closed
  // interval is first recorded as an agent gap interval and checked, so no
  // operation can accept an unattributed baseline.
  open(operation?: Operation) {
    const before = this.#observe();
    const previous = this.#run.observations.at(-1);
    if (previous && !previous.after)
      throw new ProductError(
        "OBSERVATION_INCOMPLETE",
        "The preceding observation interval must be closed before more work.",
      );
    const agentScope = contextualScope(this.#resolved);
    if (previous?.after && previous.after !== observationIdentity(before)) {
      const gap: WorkInterval = {
        phase: "agent",
        scope: agentScope,
        before: this.#last(),
      };
      finishInterval(gap, before, this.#root);
      this.#record([...this.#run.observations, recordedInterval(gap)], before);
      this.#save();
      requireValidIntervals(this.#run.observations);
    }
    const interval: WorkInterval = operation
      ? {
          phase: operation.phase,
          operation,
          operationIndex: this.#run.operations.length,
          before,
          scope: {
            [operation.declaration]: declarationTargets(
              this.#resolved.declarations.find(
                (declaration) => declaration.id === operation.declaration,
              )!,
            ),
          },
        }
      : { phase: "agent", scope: agentScope, before };
    this.#record(
      [...this.#run.observations, recordedInterval(interval)],
      before,
    );
    this.#save();
  }

  // Closes the open interval at the current observation, then runs the caller's
  // verification before checking violations: changed integrity outranks
  // attribution. The caller verifies an operation against the record it saved
  // while the operation ran, so closing keeps the observation but leaves saving
  // the record to the caller.
  close(verify: () => void) {
    const after = this.#observe();
    const last = this.#run.observations.at(-1);
    if (!last || last.after)
      throw new Error("No observation interval is open.");
    this.#advance(after, false);
    verify();
    requireValidIntervals(this.#run.observations);
  }

  // Continues after the last interval: an open interval is closed under its
  // original authority, and work after a closed one belongs to a new agent
  // interval, never replay. The record is saved; its intervals are not checked,
  // because each caller requires authorization where the invariant holds: a
  // resumed assessment after its own validation, recovery and final
  // verification at once, and abandonment never, since it preserves rather
  // than reports.
  continue() {
    this.#continue(false);
  }

  // Continues after an interruption, as continue does, marking an interrupted
  // operation, one without a recorded outcome. Restorable exact paths are
  // exempt from attribution once the caller has verified the immutable
  // installation.
  continueInterrupted(restorable?: Scope[string]) {
    this.#continue(true, restorable);
  }

  #continue(interrupted: boolean, restorable?: Scope[string]) {
    if (this.#run.observations.length)
      this.#advance(this.#observe(), interrupted, restorable);
    this.#save();
  }

  // Requires every recorded interval to have stayed within its authority,
  // reporting the first violation, and every inherited change that still
  // stands to lie within this run's authority for the phases that made it:
  // the contextual scope for agent work, and a declaration's targets for
  // fixes.
  requireAuthorized() {
    requireValidIntervals(this.#run.observations);
    const net = this.#net();
    const contextual = contextualScope(this.#resolved);
    const declared = concreteScope(this.#resolved);
    const within = (scope: Scope, path: string) =>
      Object.values(scope).some((targets) => permits(targets, path));
    for (const [phase, scope, code] of [
      ["agent", contextual, "ASSESSMENT_SCOPE"],
      ["fixes", declared, "OPERATION_SCOPE"],
    ] as const) {
      const paths = this.#inherited
        .filter(
          (change) =>
            change.phases.includes(phase) &&
            differs(net(change.path)) &&
            !within(scope, change.path),
        )
        .map(({ path }) => path);
      if (paths.length)
        throw new ProductError(
          code,
          `The replaced run's ${phase === "agent" ? "agent work" : "fixes"} changed paths outside this run's authorized ${phase} scope: ${paths.join(", ")}. ${restoreInstruction}`,
        );
    }
  }

  // A path's net change since before the run, or, for a run that replaces
  // another in place, since before the run it replaces.
  #net() {
    const net = netChanges(this.#run.observations, "changes");
    const inherited = new Map(
      this.#inherited.map((change) => [change.path, change]),
    );
    return (path: string): Delta => {
      const earlier = inherited.get(path);
      const own = net.get(path);
      return {
        before: earlier ? earlier.before : own?.before,
        after: own ? own.after : earlier?.after,
      };
    };
  }

  // The paths agent work changed, excluding verified restoration of exact
  // content, and only those whose state now differs from before the run: work
  // restored in place has nothing to attribute. A run that replaces another
  // in place also attributes the agent work it inherits.
  agentChanges() {
    const net = this.#net();
    return [
      ...new Set([
        ...this.#inherited
          .filter((change) => change.phases.includes("agent"))
          .map(({ path }) => path),
        ...this.#run.observations
          .filter((interval) => interval.phase === "agent")
          .flatMap((interval) =>
            Object.keys(interval.changes ?? {}).filter(
              (path) => !interval.restoredExact?.[path],
            ),
          ),
      ]),
    ].filter((path) => differs(net(path)));
  }

  // The paths and boundaries an operation's closed interval changed.
  operationChanges(operationIndex: number) {
    const interval = this.#run.observations.find(
      (entry) => entry.operation && entry.operationIndex === operationIndex,
    );
    return [
      ...new Set([
        ...Object.keys(interval?.changes ?? {}),
        ...Object.keys(interval?.boundaryChanges ?? {}),
      ]),
    ].sort();
  }

  #advance(
    after: WorkObservation,
    interrupted: boolean,
    restorable?: Scope[string],
  ) {
    const intervals = this.#run.observations;
    const last = intervals.at(-1)!;
    const interval: WorkInterval = last.after
      ? {
          phase: "agent",
          scope: contextualScope(this.#resolved),
          before: this.#last(),
        }
      : {
          phase: last.phase,
          scope: structuredClone(last.scope),
          ...(last.operation
            ? { operation: structuredClone(last.operation) }
            : {}),
          ...(last.operationIndex !== undefined
            ? { operationIndex: last.operationIndex }
            : {}),
          before: this.#last(),
        };
    if (last.after && restorable) {
      // Only restoration of those exact paths/inventories is exempt from
      // contextual attribution.
      interval.restoredExact = Object.fromEntries(
        observedChanges(interval.before, after)
          .filter((path) => permits(restorable, path))
          .map((path) => [path, after.files[path] ?? { type: "missing" }]),
      );
      interval.restoredBoundaries = Object.fromEntries(
        changedBoundaries(interval.before, after).flatMap((path) => {
          const before = interval.before.boundaries[path] ?? {
            type: "missing",
          };
          const current = after.boundaries[path] ?? { type: "missing" };
          const recreatingParent =
            before.type === "missing" &&
            current.type === "directory" &&
            Object.entries(interval.restoredExact!).some(
              ([file, state]) =>
                state.type === "file" && file.startsWith(path + "/"),
            );
          const removingExtra =
            before.type === "directory" &&
            current.type === "missing" &&
            restorable.directories.some((directory) =>
              path.startsWith(directory + "/"),
            ) &&
            !restorable.paths.some((file) => file.startsWith(path + "/"));
          return recreatingParent || removingExtra ? [[path, current]] : [];
        }),
      );
    }
    finishInterval(interval, after, this.#root);
    if (
      interval.operation &&
      interrupted &&
      interval.operationIndex === this.#run.operations.length
    )
      interval.interrupted = true;
    this.#record(
      [
        ...(last.after ? intervals : intervals.slice(0, -1)),
        recordedInterval(interval),
      ],
      after,
    );
  }
}

// The run's net change set: each path whose state at the end of the run differs
// from its state before it, once, with every phase that changed it, together
// with both states. The changes a replaced run left precede installation,
// which precedes the intervals, which are in order, so a path's first before
// and last after bound the run, or, for a run that replaces another in place,
// that run too. Verified restoration returns exact content to its installed
// state, so it undoes every attribution but installation's.
export function netChangeSet(
  inherited: readonly InheritedChange[],
  installed: Record<string, Delta>,
  intervals: readonly RecordedInterval[],
): InheritedChange[] {
  const paths = new Map<
    string,
    { before: unknown; after: unknown; phases: Set<ChangePhase> }
  >();
  for (const { path, before, after, phases } of inherited)
    paths.set(path, { before, after, phases: new Set(phases) });
  const change = (path: string, delta: Delta, phase?: ChangePhase) => {
    const entry = paths.get(path) ?? {
      before: delta.before,
      after: delta.after,
      phases: new Set<ChangePhase>(),
    };
    entry.after = delta.after;
    if (phase) entry.phases.add(phase);
    else
      entry.phases = new Set(
        entry.phases.has("installation") ? ["installation"] : [],
      );
    paths.set(path, entry);
  };
  for (const [path, delta] of Object.entries(installed))
    if (differs(delta)) change(path, delta, "installation");
  for (const interval of intervals) {
    if (interval.phase === "checks") continue;
    for (const [path, delta] of Object.entries(interval.changes ?? {}))
      change(
        path,
        delta,
        interval.restoredExact?.[path] ? undefined : interval.phase,
      );
  }
  return [...paths]
    .filter(([, entry]) => entry.phases.size && differs(entry))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, entry]) => ({
      path,
      phases: changePhases.filter((phase) => entry.phases.has(phase)),
      before: entry.before,
      after: entry.after,
    }));
}

// The execution-evidence slice a completion writes: this run's evidence only.
// The run already records its intervals in the committed shape, so they are
// carried without transformation, together with the run's net change set over
// the paths its installation plans, each with its state before and as
// installed, and its intervals, after any changes a replaced run left. The
// replaced run's own evidence stays in its archived report. Last-complete,
// installed baselines, skills, checks and assessments stay with their own
// owners.
export function completedEvidence(
  run: {
    observations: RecordedInterval[];
    operations: unknown[];
    retryHistory?: unknown[];
  },
  installed: Record<string, Delta>,
  inherited: readonly InheritedChange[] = [],
): ExecutionEvidence {
  return {
    format: formats.state,
    observations: structuredClone(run.observations),
    operations: structuredClone(run.operations),
    retryHistory: structuredClone(run.retryHistory ?? []),
    changeSet: netChangeSet(inherited, installed, run.observations).map(
      ({ path, phases }) => ({ path, phases }),
    ),
  };
}

// Status echoes the committed slice.
export function committedEvidenceReport(state: ExecutionEvidence) {
  return {
    observations: state.observations,
    operations: state.operations,
    retryHistory: state.retryHistory,
    changeSet: state.changeSet,
  };
}

// The recorded guarantee: no interval carries an observation map, and every
// closed interval carries both identities.
const observationMaps = ["files", "boundaries", "settings", "ignores"];
export function compactIntervals(observations: unknown[]) {
  return observations.every((value) => {
    const interval = value as Record<string, unknown> | null;
    return (
      !!interval &&
      typeof interval === "object" &&
      typeof interval.before === "string" &&
      (interval.after === undefined || typeof interval.after === "string") &&
      !observationMaps.some((key) => Object.hasOwn(interval, key))
    );
  });
}

// A change set holds one entry per path in path order, each with its phases in
// phase order.
function validChangeSet(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((entry, index) => {
      const changed = entry as Partial<ChangedPath> | null;
      const previous = index
        ? (value[index - 1] as Partial<ChangedPath> | null)?.path
        : undefined;
      return (
        !!changed &&
        typeof changed === "object" &&
        typeof changed.path === "string" &&
        changed.path !== "" &&
        (previous === undefined ||
          (typeof previous === "string" && previous < changed.path)) &&
        Array.isArray(changed.phases) &&
        changed.phases.length > 0 &&
        changed.phases.every(
          (phase, at) =>
            changePhases.includes(phase) &&
            (at === 0 ||
              changePhases.indexOf(changed.phases![at - 1]!) <
                changePhases.indexOf(phase)),
        )
      );
    })
  );
}

// The execution-evidence slice is read in its single committed format only,
// and holds the current run alone: a carried earlier run fails validation.
export function validExecutionEvidence(value: ExecutionEvidence) {
  const state = value as unknown as Record<string, unknown>;
  return (
    state.format === formats.state &&
    !Object.hasOwn(state, "history") &&
    Array.isArray(state.observations) &&
    Array.isArray(state.operations) &&
    Array.isArray(state.retryHistory) &&
    compactIntervals(state.observations) &&
    validChangeSet(state.changeSet)
  );
}
