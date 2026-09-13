import { ProductError } from './errors.js';
import type { Content, Observation } from './inspection.js';

export interface RecordedSelection {
  cli: { package: string; version: string };
  standards: { repository: string; version: string; commit: string };
  profile: string;
}

type Baseline = Pick<Content, 'sha256' | 'executable'>;
interface RecordedLock {
  format: string; selection: RecordedSelection; inspection: string;
  files: Record<string, Baseline>; state: Baseline;
}
interface RecordedState {
  format: string;
  lastComplete: { run: string; inspection: string; completedAt: string; head: string };
  baselines: Record<string, Baseline>; skills: Record<string, string[]>;
  checks: unknown[]; assessments: unknown[]; observations?: unknown[]; operations?: unknown[]; retryHistory?: unknown[];
  scopeRevision?: number; amendments?: unknown[];
  history?: { lastComplete: unknown; observations: unknown[]; operations: unknown[]; retryHistory: unknown[]; checks: unknown[]; assessments: unknown[];
    scopeRevision?: number; amendments?: unknown[] }[];
}

export function decodeRecordedState(lock: Observation, observed: Observation) {
  if (lock.type !== 'file' || observed.type !== 'file') throw new ProductError('STATE_INTEGRITY', 'Complete adoption state or integrity lock is missing.');
  let pinned: RecordedLock;
  let state: RecordedState;
  try {
    pinned = JSON.parse(Buffer.from(lock.content, lock.encoding).toString('utf8'));
    state = JSON.parse(Buffer.from(observed.content, observed.encoding).toString('utf8'));
  } catch { throw new ProductError('STATE_INTEGRITY', 'Recorded adoption state cannot be read. Restore the committed product state.'); }
  if (pinned?.format !== 'repo-standards/lock/v1' || !['repo-standards/state/v1', 'repo-standards/state/v2', 'repo-standards/state/v3', 'repo-standards/state/v4'].includes(state?.format)
    || pinned.state?.sha256 !== observed.sha256 || pinned.state.executable !== observed.executable
    || !pinned.selection || !pinned.files || !state.lastComplete || !state.baselines || !state.skills
    || (['repo-standards/state/v2', 'repo-standards/state/v3', 'repo-standards/state/v4'].includes(state.format) && (!Array.isArray(state.observations) || !Array.isArray(state.operations) || !Array.isArray(state.retryHistory)
      || (state.scopeRevision !== undefined && (!Number.isSafeInteger(state.scopeRevision) || state.scopeRevision < 0))
      || (state.amendments !== undefined && !Array.isArray(state.amendments))))
    || (state.format === 'repo-standards/state/v3' && (!state.scopeRevision || !state.amendments?.length))
    || (state.format === 'repo-standards/state/v4' && (!Array.isArray(state.history) || state.history.some(run => !run?.lastComplete
      || !Array.isArray(run.observations) || !Array.isArray(run.operations) || !Array.isArray(run.retryHistory)
      || !Array.isArray(run.checks) || !Array.isArray(run.assessments)
      || (run.scopeRevision !== undefined && (!Number.isSafeInteger(run.scopeRevision) || run.scopeRevision < 0 || !Array.isArray(run.amendments))))))
    || !Array.isArray(state.checks) || !Array.isArray(state.assessments)) {
    throw new ProductError('STATE_INTEGRITY', 'Recorded adoption state failed integrity validation. Restore the committed product state.');
  }
  return { pinned, state };
}
