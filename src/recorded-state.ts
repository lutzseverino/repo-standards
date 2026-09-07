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
  checks: unknown[]; assessments: unknown[];
}

export function decodeRecordedState(lock: Observation, observed: Observation) {
  if (lock.type !== 'file' || observed.type !== 'file') throw new ProductError('STATE_INTEGRITY', 'Complete adoption state or integrity lock is missing.');
  let pinned: RecordedLock;
  let state: RecordedState;
  try {
    pinned = JSON.parse(Buffer.from(lock.content, lock.encoding).toString('utf8'));
    state = JSON.parse(Buffer.from(observed.content, observed.encoding).toString('utf8'));
  } catch { throw new ProductError('STATE_INTEGRITY', 'Recorded adoption state cannot be read. Restore the committed product state.'); }
  if (pinned?.format !== 'repo-standards/lock/v1' || state?.format !== 'repo-standards/state/v1'
    || pinned.state?.sha256 !== observed.sha256 || pinned.state.executable !== observed.executable
    || !pinned.selection || !pinned.files || !state.lastComplete || !state.baselines || !state.skills
    || !Array.isArray(state.checks) || !Array.isArray(state.assessments)) {
    throw new ProductError('STATE_INTEGRITY', 'Recorded adoption state failed integrity validation. Restore the committed product state.');
  }
  return { pinned, state };
}
