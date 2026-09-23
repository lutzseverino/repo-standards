import { formats } from './formats.js';
import { observationIdentity } from './scope-observation.js';
import type { Scope } from './scope.js';
import type { WorkInterval, WorkObservation } from './work-observation.js';

// Work evidence is the durable record of observation intervals and operation
// outcomes for one adoption run. This module owns that slice of durable state:
// what a completion commits, how its single format is validated on read, and
// how a prior complete run is carried forward. Full observation maps stay in
// memory and in the local run report; the committed record keeps observation
// identities and the delta between them, so adoption pull requests remain
// reviewable and later runs add only their own evidence.

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
}

export interface ExecutionEvidence {
  format: typeof formats.state;
  observations: CommittedInterval[];
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

// Committing an interval keeps its authority, its identities and its delta.
function committedInterval(observed: WorkInterval): CommittedInterval {
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

// A completion moves the previous complete run's evidence into the ordered
// history, in the committed key order, so a carried entry and a newly promoted
// one are written the same way and later completions leave the earlier entries
// byte-identical. The previous state is already in the single committed format,
// so its evidence is carried without conversion.
export function carriedRuns(previous: ExecutionEvidence & Pick<CommittedRun, 'lastComplete' | 'checks' | 'assessments'>): CommittedRun[] {
  const { history, lastComplete, observations, operations, retryHistory, checks, assessments } = structuredClone(previous);
  return [...history, { lastComplete, observations, operations, retryHistory, checks, assessments }];
}

// The execution-evidence slice a completion writes. Last-complete, installed
// baselines, skills, checks and assessments stay with their own owners.
export function completedEvidence(run: { observations: WorkInterval[]; operations: unknown[]; retryHistory?: unknown[] }, history: CommittedRun[]): ExecutionEvidence {
  return {
    format: formats.state,
    history,
    observations: run.observations.map(committedInterval),
    operations: structuredClone(run.operations), retryHistory: structuredClone(run.retryHistory ?? []),
  };
}

// Status echoes the committed slice.
export function committedEvidenceReport(state: ExecutionEvidence) {
  return { observations: state.observations, operations: state.operations, retryHistory: state.retryHistory, history: state.history };
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
