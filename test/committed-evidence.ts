import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CommittedInterval {
  phase: string;
  scope: Record<string, { paths: string[]; directories: string[] }>;
  operation?: { declaration: string; phase: string; id: string };
  operationIndex?: number;
  before: unknown;
  after?: unknown;
  changes?: Record<string, { before: { type: string; sha256?: string }; after: { type: string; sha256?: string } }>;
  boundaryChanges?: Record<string, { before: { type: string }; after: { type: string } }>;
  violations?: string[];
  interrupted?: boolean;
}

export function committedState(root: string) {
  return JSON.parse(readFileSync(join(root, '.repo-standards/state.json'), 'utf8')) as {
    format: string; observations?: CommittedInterval[]; operations?: unknown[]; retryHistory?: unknown[];
    history?: { lastComplete: { run: string; inspection: string }; observations: CommittedInterval[];
      scopeRevision?: number; amendments?: unknown[] }[];
    lastComplete: { run: string; inspection: string; completedAt: string; head: string };
  };
}

export function localRunReport(root: string) {
  return JSON.parse(readFileSync(join(root, '.repo-standards/local/run.json'), 'utf8')) as {
    observations?: { before: { files: Record<string, unknown> }; after?: { files: Record<string, unknown> } }[];
  };
}

// The product's observation identity over an observation as the local run
// report retains it.
export function observationIdentity(observation: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(observation)).digest('hex')}`;
}

// Structural regression guard: no committed interval may carry an observation
// map, and every closed interval must carry both observation identities.
export function assertCompactWorkEvidence(state: ReturnType<typeof committedState>) {
  const runs = [...(state.observations ? [{ label: 'current', observations: state.observations }] : []),
    ...(state.history ?? []).map((run, index) => ({ label: `history[${index}]`, observations: run.observations }))];
  for (const run of runs) {
    assert.ok(Array.isArray(run.observations), `${run.label} must retain ordered intervals`);
    for (const [index, interval] of run.observations.entries()) {
      const where = `${run.label} interval ${index}`;
      assert.equal(typeof interval.before, 'string', `${where} must carry a before identity, not an observation map`);
      assert.match(interval.before as string, /^sha256:[0-9a-f]{64}$/, `${where} before identity`);
      if (interval.after !== undefined || interval.changes !== undefined || interval.violations !== undefined) {
        assert.equal(typeof interval.after, 'string', `${where} is closed and must carry an after identity`);
        assert.match(interval.after as string, /^sha256:[0-9a-f]{64}$/, `${where} after identity`);
      }
      for (const key of ['files', 'boundaries', 'settings', 'ignores', 'inventories', 'targets', 'evidence']) {
        assert.equal(Object.hasOwn(interval, key), false, `${where} must not carry an observation map: ${key}`);
      }
      for (const identity of [interval.before, interval.after]) {
        assert.equal(typeof identity === 'object' && identity !== null, false, `${where} identities must not be observation maps`);
      }
    }
  }
}
