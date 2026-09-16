import { observationIdentity } from './scope-observation.js';
import type { Scope } from './scope.js';
import type { WorkInterval, WorkObservation } from './work-observation.js';

// Work evidence is the durable record of observation intervals and operation
// outcomes for one adoption run. This module owns that slice of durable state:
// what a completion commits, how every earlier format is read, and how a prior
// complete run is carried forward. Full observation maps stay in memory and in
// the local run report; the committed record keeps observation identities and
// the delta between them, so adoption pull requests remain reviewable and later
// runs add only their own evidence.

type FileState = WorkObservation['files'][string];
interface Delta { before: unknown; after: unknown }

export interface CommittedInterval {
  phase: WorkInterval['phase'];
  scope: Scope;
  operation?: WorkInterval['operation'];
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
  observations: CommittedInterval[];
  operations: unknown[];
  retryHistory: unknown[];
  checks: unknown[];
  assessments: unknown[];
  scopeRevision?: number;
  amendments?: unknown[];
}

export interface ExecutionEvidence {
  format: string;
  observations?: unknown[];
  operations?: unknown[];
  retryHistory?: unknown[];
  scopeRevision?: number;
  amendments?: unknown[];
  history?: CommittedRun[];
}

const committedStateFormat = 'repo-standards/state/v5';
const initialStateFormat = 'repo-standards/state/v1';
const committedStatusFormats: Record<string, string> = {
  'repo-standards/state/v4': 'repo-standards/status/v4',
  [committedStateFormat]: 'repo-standards/status/v5',
};

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

export function intervalsIdentity(intervals: readonly WorkInterval[]) {
  return observationIdentity(intervals);
}

// Committing an interval keeps its authority, its identities and its delta.
// An interval already stored in the compact form is retained unchanged, so a
// legacy state compacts losslessly for the retained fields at the next
// completion instead of needing a separate migration command. The two forms are
// told apart by `before`: an observation map in every legacy format, an
// identity string in the committed one.
function committedInterval(interval: WorkInterval | CommittedInterval): CommittedInterval {
  if (typeof interval.before === 'string') return structuredClone(interval as CommittedInterval);
  const observed = interval as WorkInterval;
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

function committedIntervals(intervals: readonly (WorkInterval | CommittedInterval)[]): CommittedInterval[] {
  return intervals.map(committedInterval);
}

// One retained run in the committed order, so a carried entry and a newly
// promoted one are written the same way and later completions leave the
// earlier entries byte-identical.
function carriedRun(run: Record<string, unknown>): CommittedRun {
  return {
    lastComplete: structuredClone(run.lastComplete) as CommittedRun['lastComplete'],
    observations: committedIntervals((run.observations ?? []) as WorkInterval[]),
    operations: structuredClone(run.operations ?? []) as unknown[],
    retryHistory: structuredClone(run.retryHistory ?? []) as unknown[],
    checks: structuredClone(run.checks ?? []) as unknown[],
    assessments: structuredClone(run.assessments ?? []) as unknown[],
    ...(run.scopeRevision !== undefined
      ? { scopeRevision: run.scopeRevision as number, amendments: structuredClone(run.amendments) as unknown[] }
      : {}),
  };
}

// A completion moves the previous complete run's evidence into the ordered
// history, keeping the correlation fields the retained-selection reader uses.
export function carriedRuns(previous: unknown): CommittedRun[] {
  if (!previous || typeof previous !== 'object') return [];
  const state = previous as Record<string, unknown>;
  const history = (Array.isArray(state.history) ? state.history : [])
    .map(run => carriedRun((run ?? {}) as Record<string, unknown>));
  if (!Array.isArray(state.observations) || !Array.isArray(state.operations) || !Array.isArray(state.retryHistory)
    || !Array.isArray(state.checks) || !Array.isArray(state.assessments) || !state.lastComplete) return history;
  return [...history, carriedRun(state)];
}

// The execution-evidence slice a completion writes. Last-complete, installed
// baselines, skills, checks and assessments stay with their own owners.
export function completedEvidence(run: { observations?: WorkInterval[]; operations: unknown[]; retryHistory?: unknown[];
  scopeRevision?: number; amendments?: unknown[] }, history: CommittedRun[]) {
  const retained = run.observations !== undefined || history.length > 0;
  return {
    format: retained ? committedStateFormat : initialStateFormat,
    ...(retained ? { history } : {}),
    ...(run.observations ? { observations: committedIntervals(run.observations),
      operations: structuredClone(run.operations), retryHistory: structuredClone(run.retryHistory ?? []) } : {}),
    ...(run.amendments?.length ? { scopeRevision: run.scopeRevision!, amendments: structuredClone(run.amendments) } : {}),
  };
}

// Status echoes the committed slice under the status format that matches the
// committed state format, so automation can distinguish the shapes.
export function committedEvidenceReport(state: ExecutionEvidence) {
  return {
    ...(state.observations ? { observations: state.observations, operations: state.operations, retryHistory: state.retryHistory } : {}),
    ...(state.history ? { history: state.history } : {}),
    ...(state.amendments?.length ? { scopeRevision: state.scopeRevision, amendments: state.amendments } : {}),
  };
}

export function committedStatusFormat(state: ExecutionEvidence): string | undefined {
  return committedStatusFormats[state.format];
}

function validRevision(run: Record<string, unknown>) {
  return (run.scopeRevision === undefined || (Number.isSafeInteger(run.scopeRevision) && (run.scopeRevision as number) >= 0))
    && (run.amendments === undefined || Array.isArray(run.amendments));
}

// The committed guarantee: no interval carries an observation map, and every
// closed interval carries both identities.
const observationMaps = ['files', 'boundaries', 'settings', 'ignores'];
function compactIntervals(observations: unknown[]) {
  return observations.every(value => {
    const interval = value as Record<string, unknown> | null;
    return !!interval && typeof interval === 'object' && typeof interval.before === 'string'
      && (interval.after === undefined || typeof interval.after === 'string')
      && !observationMaps.some(key => Object.hasOwn(interval, key));
  });
}

function validHistory(history: unknown, compact: boolean) {
  return Array.isArray(history) && history.every(value => {
    const run = value as Record<string, unknown> | null;
    return !!run && !!run.lastComplete
      && Array.isArray(run.observations) && Array.isArray(run.operations) && Array.isArray(run.retryHistory)
      && Array.isArray(run.checks) && Array.isArray(run.assessments)
      && (run.scopeRevision === undefined || (Number.isSafeInteger(run.scopeRevision) && (run.scopeRevision as number) >= 0 && Array.isArray(run.amendments)))
      && (!compact || compactIntervals(run.observations));
  });
}

// The read-side version union for the execution-evidence slice. Every earlier
// committed format stays readable; only the current one is written.
export function validExecutionEvidence(value: ExecutionEvidence) {
  const state = value as unknown as Record<string, unknown>;
  const execution = [state.observations, state.operations, state.retryHistory];
  const present = execution.every(field => Array.isArray(field));
  switch (state.format) {
    case initialStateFormat:
      return true;
    case 'repo-standards/state/v2':
      return present && validRevision(state);
    case 'repo-standards/state/v3':
      return present && validRevision(state) && !!state.scopeRevision && !!(state.amendments as unknown[] | undefined)?.length;
    case 'repo-standards/state/v4':
    case committedStateFormat: {
      const compact = state.format === committedStateFormat;
      if (!present && !execution.every(field => field === undefined)) return false;
      if (!present && (state.scopeRevision !== undefined || state.amendments !== undefined)) return false;
      if (compact && present && !compactIntervals(state.observations as unknown[])) return false;
      return validRevision(state) && validHistory(state.history, compact);
    }
    default:
      return false;
  }
}
