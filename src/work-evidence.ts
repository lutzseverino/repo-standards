import { ProductError } from './errors.js';
import { allowedTargets } from './execution.js';
import { formats } from './formats.js';
import type { ResolvedProfile } from './model.js';
import { concreteScope, type Scope } from './scope.js';
import { observationIdentity } from './scope-observation.js';
import { changedBoundaries, observeWork, observedChanges, permits, type WorkObservation } from './work-observation.js';

// Work evidence is the durable record of observation intervals and operation
// outcomes for one adoption run. This module is its journal: it opens, closes
// and continues intervals, records the gaps between them, checks their
// violations, and answers what the agent changed. It owns the recorded interval
// shape, which the run record and committed state share, and that slice of
// durable state: what a completion commits, how its single format is validated
// on read, and how a prior complete run is carried forward. An interval keeps
// observation identities and the delta between them, never observation maps,
// so neither record grows with the project, adoption pull requests remain
// reviewable, and later runs add only their own evidence. Full observations
// are held in memory while a command observes; the journal keeps only the one
// its last interval ends at, through an observation store, for the next
// command to compare.

type FileState = WorkObservation['files'][string];
interface Delta { before: unknown; after: unknown }
type Operation = { declaration: string; phase: 'fixes' | 'checks'; id: string };

// An interval as a command holds it in memory, with its full observations.
// It is recorded as identities and a delta through recordedInterval.
interface WorkInterval {
  phase: 'fixes' | 'checks' | 'agent'; scope: Scope; before: WorkObservation;
  operation?: Operation; operationIndex?: number;
  after?: WorkObservation; changedPaths?: string[]; boundaryChanges?: string[]; violations?: string[]; interrupted?: boolean;
  restoredExact?: WorkObservation['files']; restoredBoundaries?: WorkObservation['boundaries'];
}

export interface RecordedInterval {
  phase: WorkInterval['phase'];
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

export interface CommittedRun {
  lastComplete: { run: string; inspection: string; completedAt: string; head: string };
  observations: RecordedInterval[];
  operations: unknown[];
  retryHistory: unknown[];
  checks: unknown[];
  assessments: unknown[];
}

export interface ExecutionEvidence {
  format: typeof formats.state;
  observations: RecordedInterval[];
  operations: unknown[];
  retryHistory: unknown[];
  history: CommittedRun[];
}

// Changed paths name project files, but also the external ignore inputs and
// observation settings that cannot be authorized as project paths. Each keeps
// the state the interval actually compared.
function changedState(observation: WorkObservation, path: string): unknown {
  if (path === '@git/observation-settings') return observation.settings;
  if (path.startsWith('@ignore/')) return observation.ignores[path.slice('@ignore/'.length)] ?? null;
  if (Object.hasOwn(observation.files, path)) return observation.files[path];
  if (Object.hasOwn(observation.ignores, path)) return observation.ignores[path]!.state;
  return { type: 'missing' };
}

function boundaryState(observation: WorkObservation, path: string) {
  return observation.boundaries[path] ?? { type: 'missing' };
}

// Recording an interval keeps its authority, its identities and its delta.
function recordedInterval(observed: WorkInterval): RecordedInterval {
  const after = observed.after;
  return {
    phase: observed.phase,
    scope: structuredClone(observed.scope),
    ...(observed.operation ? { operation: structuredClone(observed.operation) } : {}),
    ...(observed.operationIndex !== undefined ? { operationIndex: observed.operationIndex } : {}),
    before: observationIdentity(observed.before),
    ...(after ? { after: observationIdentity(after) } : {}),
    ...(after && observed.changedPaths ? { changes: Object.fromEntries(observed.changedPaths
      .map(path => [path, { before: changedState(observed.before, path), after: changedState(after, path) }])) } : {}),
    ...(after && observed.boundaryChanges ? { boundaryChanges: Object.fromEntries(observed.boundaryChanges
      .map(path => [path, { before: boundaryState(observed.before, path), after: boundaryState(after, path) }])) } : {}),
    ...(observed.violations ? { violations: [...observed.violations] } : {}),
    ...(observed.restoredExact ? { restoredExact: structuredClone(observed.restoredExact) } : {}),
    ...(observed.restoredBoundaries ? { restoredBoundaries: structuredClone(observed.restoredBoundaries) } : {}),
    ...(observed.interrupted ? { interrupted: observed.interrupted } : {}),
  };
}

// Agent work is authorized by the contextual declarations' concrete scope.
function contextualScope(resolved: ResolvedProfile): Scope {
  return concreteScope({ ...resolved, declarations: resolved.declarations.filter(declaration => 'guidance' in declaration) });
}

function finishInterval(interval: WorkInterval, after: WorkObservation) {
  interval.after = after;
  interval.changedPaths = observedChanges(interval.before, after);
  interval.boundaryChanges = changedBoundaries(interval.before, after);
  const scopes = Object.values(interval.scope);
  const fileViolations = interval.changedPaths.filter(path => interval.phase === 'checks'
    || (!interval.restoredExact?.[path] && !scopes.some(targets => permits(targets, path))));
  const boundaryViolations = interval.boundaryChanges.filter(path => {
    if (interval.phase === 'checks') return true;
    if (interval.restoredBoundaries?.[path]) return false;
    if (scopes.some(targets => permits(targets, path))) return false;
    const before = interval.before.boundaries[path];
    // Named file authority includes creating its missing parent directories,
    // but does not authorize deleting or changing existing ancestors.
    return !((!before || before.type === 'missing') && after.boundaries[path]?.type === 'directory'
      && scopes.some(targets => [...targets.paths, ...targets.directories].some(target => target.startsWith(path + '/'))));
  });
  interval.violations = [...new Set([...fileViolations, ...boundaryViolations])].sort();
}

function requireValidIntervals(intervals: RecordedInterval[]) {
  const invalid = intervals.find(interval => interval.violations?.length);
  if (!invalid) return;
  const operation = invalid.operation;
  const code = invalid.phase === 'agent' ? 'ASSESSMENT_SCOPE' : invalid.phase === 'checks' ? 'CHECK_MUTATION' : 'OPERATION_SCOPE';
  throw new ProductError(code, `${operation ? `Operation ${operation.declaration}/${operation.id}` : 'Agent work'} changed paths outside its authorized ${invalid.phase} scope: ${invalid.violations!.join(', ')}. Work and interval evidence are preserved; abandon and reconcile before a new adoption.`);
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
export function memoryStore(kept: Pick<ObservationStore, 'read'>): ObservationStore {
  const held = new Map<string, WorkObservation>();
  return {
    read: identity => held.get(identity) ?? kept.read(identity),
    keep: observation => { held.set(observationIdentity(observation), observation); },
  };
}

// The journal records into the run's intervals and reads its operation count.
export interface JournalRecord { observations: RecordedInterval[]; readonly operations: readonly unknown[] }

// Every interval is observed over the resolved profile's concrete scope. Opening
// and continuing persist the record through the caller's save; closing does not
// (see close). Each close checks violations across the whole journal, so a
// detected violation is reported again until the run is abandoned.
export class WorkEvidenceJournal {
  readonly #root: string;
  readonly #resolved: ResolvedProfile;
  readonly #run: JournalRecord;
  readonly #store: ObservationStore;
  readonly #save: () => void;
  #kept: WorkObservation | undefined;

  constructor(root: string, resolved: ResolvedProfile, run: JournalRecord, store: ObservationStore, save: () => void = () => {}) {
    this.#root = root;
    this.#resolved = resolved;
    this.#run = run;
    this.#store = store;
    this.#save = save;
  }

  #observe() { return observeWork(this.#root, concreteScope(this.#resolved)); }

  // The full observation the last interval ends at, read from the store when an
  // earlier command kept it.
  #last() { return this.#kept ??= this.#store.read(keptIdentity(this.#run.observations)!); }

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
    if (previous && !previous.after) throw new ProductError('OBSERVATION_INCOMPLETE', 'The preceding observation interval must be closed before more work.');
    const agentScope = contextualScope(this.#resolved);
    if (previous?.after && previous.after !== observationIdentity(before)) {
      const gap: WorkInterval = { phase: 'agent', scope: agentScope, before: this.#last() };
      finishInterval(gap, before);
      this.#record([...this.#run.observations, recordedInterval(gap)], before);
      this.#save();
      requireValidIntervals(this.#run.observations);
    }
    const interval: WorkInterval = operation
      ? { phase: operation.phase, operation, operationIndex: this.#run.operations.length, before,
        scope: { [operation.declaration]: allowedTargets(this.#resolved.declarations.find(declaration => declaration.id === operation.declaration)!) } }
      : { phase: 'agent', scope: agentScope, before };
    this.#record([...this.#run.observations, recordedInterval(interval)], before);
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
    if (!last || last.after) throw new Error('No observation interval is open.');
    this.#advance(after, false);
    verify();
    requireValidIntervals(this.#run.observations);
  }

  // Continues after the last interval: an open interval is closed under its
  // original authority, and work after a closed one belongs to a new agent
  // interval, never replay. An interrupted operation, one without a recorded
  // outcome, is marked interrupted. Restorable exact paths are exempt from
  // attribution once the caller has verified the immutable installation. The
  // record is saved, then violations are checked unless the caller defers the
  // check: a resumed assessment reports its own validation first, and
  // abandonment preserves rather than reports.
  continue({ interrupted = false, restorable, check = true }: { interrupted?: boolean; restorable?: Scope[string] | undefined; check?: boolean } = {}) {
    if (this.#run.observations.length) this.#advance(this.#observe(), interrupted, restorable);
    this.#save();
    if (check) this.check();
  }

  // Requires every recorded interval to have stayed within its authority.
  check() { requireValidIntervals(this.#run.observations); }

  // The paths agent work changed, excluding verified restoration of exact content.
  agentChanges() {
    return [...new Set(this.#run.observations.filter(interval => interval.phase === 'agent')
      .flatMap(interval => Object.keys(interval.changes ?? {}).filter(path => !interval.restoredExact?.[path])))];
  }

  #advance(after: WorkObservation, interrupted: boolean, restorable?: Scope[string]) {
    const intervals = this.#run.observations;
    const last = intervals.at(-1)!;
    const interval: WorkInterval = last.after ? { phase: 'agent', scope: contextualScope(this.#resolved), before: this.#last() }
      : { phase: last.phase, scope: structuredClone(last.scope), ...(last.operation ? { operation: structuredClone(last.operation) } : {}),
        ...(last.operationIndex !== undefined ? { operationIndex: last.operationIndex } : {}), before: this.#last() };
    if (last.after && restorable) {
      // Only restoration of those exact paths/inventories is exempt from
      // contextual attribution.
      interval.restoredExact = Object.fromEntries(observedChanges(interval.before, after).filter(path => permits(restorable, path))
        .map(path => [path, after.files[path] ?? { type: 'missing' }]));
      interval.restoredBoundaries = Object.fromEntries(changedBoundaries(interval.before, after).flatMap(path => {
        const before = interval.before.boundaries[path] ?? { type: 'missing' };
        const current = after.boundaries[path] ?? { type: 'missing' };
        const recreatingParent = before.type === 'missing' && current.type === 'directory'
          && Object.entries(interval.restoredExact!).some(([file, state]) => state.type === 'file' && file.startsWith(path + '/'));
        const removingExtra = before.type === 'directory' && current.type === 'missing'
          && restorable.directories.some(directory => path.startsWith(directory + '/'))
          && !restorable.paths.some(file => file.startsWith(path + '/'));
        return recreatingParent || removingExtra ? [[path, current]] : [];
      }));
    }
    finishInterval(interval, after);
    if (interval.operation && interrupted && interval.operationIndex === this.#run.operations.length) interval.interrupted = true;
    this.#record([...(last.after ? intervals : intervals.slice(0, -1)), recordedInterval(interval)], after);
  }
}

// A completion moves the previous complete run's evidence into the ordered
// history, in the committed key order, so a carried entry and a newly promoted
// one are written the same way and later completions leave the earlier entries
// byte-identical. The previous state is already in the single committed format,
// so its evidence is carried without conversion.
export function carriedRuns(previous: ExecutionEvidence & Pick<CommittedRun, 'lastComplete' | 'checks' | 'assessments'>): CommittedRun[] {
  const { history, lastComplete, observations, operations, retryHistory, checks, assessments } = structuredClone(previous);
  return [...history, { lastComplete, observations, operations, retryHistory, checks, assessments }];
}

// The execution-evidence slice a completion writes. The run already records
// its intervals in the committed shape, so they are carried without
// transformation. Last-complete, installed baselines, skills, checks and
// assessments stay with their own owners.
export function completedEvidence(run: { observations: RecordedInterval[]; operations: unknown[]; retryHistory?: unknown[] }, history: CommittedRun[]): ExecutionEvidence {
  return {
    format: formats.state,
    history,
    observations: structuredClone(run.observations),
    operations: structuredClone(run.operations), retryHistory: structuredClone(run.retryHistory ?? []),
  };
}

// Status echoes the committed slice.
export function committedEvidenceReport(state: ExecutionEvidence) {
  return { observations: state.observations, operations: state.operations, retryHistory: state.retryHistory, history: state.history };
}

// The recorded guarantee: no interval carries an observation map, and every
// closed interval carries both identities.
const observationMaps = ['files', 'boundaries', 'settings', 'ignores'];
export function compactIntervals(observations: unknown[]) {
  return observations.every(value => {
    const interval = value as Record<string, unknown> | null;
    return !!interval && typeof interval === 'object' && typeof interval.before === 'string'
      && (interval.after === undefined || typeof interval.after === 'string')
      && !observationMaps.some(key => Object.hasOwn(interval, key));
  });
}

// The execution-evidence slice is read in its single committed format only.
export function validExecutionEvidence(value: ExecutionEvidence) {
  const state = value as unknown as Record<string, unknown>;
  return state.format === formats.state
    && Array.isArray(state.observations) && Array.isArray(state.operations) && Array.isArray(state.retryHistory)
    && compactIntervals(state.observations)
    && Array.isArray(state.history) && state.history.every(value => {
      const run = value as Record<string, unknown> | null;
      return !!run && !!run.lastComplete
        && Array.isArray(run.observations) && Array.isArray(run.operations) && Array.isArray(run.retryHistory)
        && Array.isArray(run.checks) && Array.isArray(run.assessments)
        && compactIntervals(run.observations);
    });
}
