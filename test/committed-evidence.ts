import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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

interface CommittedScopeRun {
  inspection: string;
  resolved: unknown;
  sourceResolved?: unknown;
  discovery?: { identity: string; proposal?: unknown; absence?: unknown; declarations?: unknown;
    named?: { targets?: Record<string, unknown>; boundaries?: Record<string, unknown>; observation?: unknown };
    observation?: { boundaries?: Record<string, unknown> } };
}

export function committedScopeHistory(root: string) {
  return JSON.parse(readFileSync(join(root, '.repo-standards/inputs/scope-history.json'), 'utf8')) as {
    format: string; evidence: string; runs: CommittedScopeRun[] };
}

// Structural regression guard: the retained file holds its ordered runs and
// nothing else, each discovery run appears once without the evidence arrays or
// the full named observation its stored observation already implies.
export function assertCompactScopeEvidence(history: ReturnType<typeof committedScopeHistory>) {
  assert.equal(history.format, 'repo-standards/scope-history/v3');
  assert.deepEqual(Object.keys(history), ['format', 'evidence', 'runs'], 'the newest run must not be spread over the file');
  assert.equal(new Set(history.runs.map(run => run.inspection)).size, history.runs.length, 'each run is stored once');
  for (const [index, run] of history.runs.entries()) {
    const where = `run ${index}`;
    assert.deepEqual(Object.keys(run).filter(key => !['inspection', 'resolved', 'sourceResolved', 'discovery'].includes(key)), [], `${where} fields`);
    const discovery = run.discovery;
    if (!discovery) continue;
    assert.equal(Object.hasOwn(discovery, 'evidence'), false, `${where} must not carry a derived evidence array`);
    assert.equal(Object.hasOwn(discovery, 'namedObservation'), false, `${where} must store the named observation as a delta`);
    assert.ok(discovery.observation, `${where} must retain its project observation`);
    assert.equal(Object.hasOwn(discovery.observation!, 'evidence'), false, `${where} observation must not carry a derived evidence array`);
    if (discovery.named) assert.deepEqual(Object.keys(discovery.named).filter(key => !['targets', 'boundaries'].includes(key)), [], `${where} named delta fields`);
  }
}

// The retained file an earlier release committed for the same runs: every run
// in full, with the newest one also spread over the top level.
export function legacyScopeHistory(runs: unknown[]) {
  return { format: 'repo-standards/scope-history/v2', evidence: 'historical', ...runs.at(-1) as object, runs };
}

// Replace a retained input with the bytes an earlier release would have
// committed and rebind the integrity lock to them.
export function rewriteRetainedInput(root: string, path: string, value: unknown) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(join(root, path), bytes);
  const lockPath = join(root, '.repo-standards/lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { files: Record<string, { sha256: string }> };
  lock.files[path]!.sha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

// Grow the committed durable state past a byte threshold, the way an adopter's
// accumulated evidence does, preserving everything the state records and
// rebinding the integrity lock to the new bytes.
export function growCommittedState(root: string, bytes: number) {
  const path = join(root, '.repo-standards/state.json');
  const state = readFileSync(path, 'utf8');
  assert.equal(state[0], '{');
  const grown = `{${' '.repeat(Math.max(0, bytes - state.length))}${state.slice(1)}`;
  writeFileSync(path, grown);
  const lockPath = join(root, '.repo-standards/lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { state: { sha256: string } };
  lock.state.sha256 = createHash('sha256').update(grown).digest('hex');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  return Buffer.byteLength(grown);
}
