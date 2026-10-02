import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { git } from './remote-fixture.ts';

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
    changeSet?: { path: string; phases: string[] }[];
    lastComplete: { run: string; inspection: string; completedAt: string; head: string };
  };
}

export function localRunReport(root: string) {
  return JSON.parse(readFileSync(join(root, '.repo-standards/local/run.json'), 'utf8')) as { format: string; root: string; observations: CommittedInterval[] };
}

// Every interval, committed or in a run record, is identities plus delta.
const intervalFields = ['phase', 'scope', 'operation', 'operationIndex', 'before', 'after', 'changes', 'boundaryChanges',
  'violations', 'restoredExact', 'restoredBoundaries', 'interrupted'];
function assertCompactIntervals(label: string, observations: CommittedInterval[]) {
  assert.ok(Array.isArray(observations), `${label} must retain ordered intervals`);
  for (const [index, interval] of observations.entries()) {
    const where = `${label} interval ${index}`;
    assert.equal(typeof interval.before, 'string', `${where} must carry a before identity, not an observation map`);
    assert.match(interval.before as string, /^sha256:[0-9a-f]{64}$/, `${where} before identity`);
    if (interval.after !== undefined || interval.changes !== undefined || interval.violations !== undefined) {
      assert.equal(typeof interval.after, 'string', `${where} is closed and must carry an after identity`);
      assert.match(interval.after as string, /^sha256:[0-9a-f]{64}$/, `${where} after identity`);
    }
    for (const key of ['files', 'boundaries', 'settings', 'ignores', 'inventories', 'targets', 'evidence']) {
      assert.equal(Object.hasOwn(interval, key), false, `${where} must not carry an observation map: ${key}`);
    }
    assert.deepEqual(Object.keys(interval).filter(key => !intervalFields.includes(key)), [], `${where} carries only the committed interval fields`);
    for (const identity of [interval.before, interval.after]) {
      assert.equal(typeof identity === 'object' && identity !== null, false, `${where} identities must not be observation maps`);
    }
  }
}

// Structural regression guard: a run record, whether the journal, the local run
// report or an archived report, has the single run format and records its
// intervals in the committed shape, never with an observation map.
export function assertCompactRunRecord(record: { format: string; observations: CommittedInterval[] }, label = 'run record') {
  assert.equal(record.format, 'repo-standards/run/v6');
  assertCompactIntervals(label, record.observations);
}

// Structural regression guard: committed state has the single state format and
// holds the current run only, no committed interval may carry an observation
// map, and every closed interval must carry both observation identities.
export function assertCompactWorkEvidence(state: ReturnType<typeof committedState>) {
  assert.equal(state.format, 'repo-standards/state/v6');
  assert.equal(Object.hasOwn(state, 'history'), false, 'committed state must not carry earlier runs');
  assertCompactIntervals('current', state.observations!);
}

interface CommittedScopeRun {
  inspection: string;
  resolved: unknown;
  sourceResolved?: unknown;
  discovery?: { identity: string; proposal?: unknown; absence?: unknown; declarations?: unknown;
    named?: { targets?: Record<string, unknown>; boundaries?: Record<string, unknown>; observation?: unknown };
    observation?: { boundaries?: Record<string, unknown> } };
}

export function committedScopeEvidence(root: string) {
  return JSON.parse(readFileSync(join(root, '.repo-standards/inputs/scope-history.json'), 'utf8')) as CommittedScopeRun & {
    format: string; evidence: string; scopeChanges: { id: string; additions: string[]; removals: string[] }[] };
}

// Structural regression guard: the retained file holds the current run and its
// scope change against the previous run, and nothing else; its discovery
// carries neither the evidence arrays nor the full named observation its stored
// observation already implies.
export function assertCompactScopeEvidence(scope: ReturnType<typeof committedScopeEvidence>) {
  assert.equal(scope.format, 'repo-standards/scope-history/v4');
  assert.deepEqual(Object.keys(scope).filter(key => !['format', 'evidence', 'inspection', 'resolved', 'sourceResolved', 'discovery', 'scopeChanges'].includes(key)), [],
    'scope evidence must hold only the current run and its scope change');
  assert.equal(typeof scope.inspection, 'string');
  assert.ok(Array.isArray(scope.scopeChanges), 'scope evidence must record its scope change');
  const discovery = scope.discovery;
  if (!discovery) return;
  assert.equal(Object.hasOwn(discovery, 'evidence'), false, 'discovery must not carry a derived evidence array');
  assert.equal(Object.hasOwn(discovery, 'namedObservation'), false, 'discovery must store the named observation as a delta');
  assert.ok(discovery.observation, 'discovery must retain its project observation');
  assert.equal(Object.hasOwn(discovery.observation!, 'evidence'), false, 'the observation must not carry a derived evidence array');
  if (discovery.named) assert.deepEqual(Object.keys(discovery.named).filter(key => !['targets', 'boundaries'].includes(key)), [], 'named delta fields');
}

// Replace a retained input with other bytes and rebind the integrity lock to
// them, so only the content under test differs from a committed adoption.
export function rewriteRetainedInput(root: string, path: string, value: unknown) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(join(root, path), bytes);
  const lockPath = join(root, '.repo-standards/lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { files: Record<string, { sha256: string }> };
  lock.files[path]!.sha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

// Replace the committed durable state and rebind the integrity lock to it.
export function rewriteCommittedState(root: string, value: unknown) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(join(root, '.repo-standards/state.json'), bytes);
  const lockPath = join(root, '.repo-standards/lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { state: { sha256: string } };
  lock.state.sha256 = createHash('sha256').update(bytes).digest('hex');
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

// Committed evidence binds content, not location: no file the adoption leaves
// for the project's normal workflow to commit names an absolute path or a
// relative path with a parent segment, as a JSON key or string value, and none
// names a given machine location anywhere in its text. The parent-segment check
// is deliberately strict: the product writes only normalized paths. Absolute
// paths the standards source itself declares, such as an operation's
// executable, are retained source content and are passed as authored.
export function assertNoMachineLocation(root: string, locations: string[], authored: string[] = []) {
  const committed = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.repo-standards').split('\0').filter(Boolean);
  assert.ok(committed.includes('.repo-standards/state.json'), 'the adoption leaves committed state');
  const located: string[] = [];
  const location = (value: string) => isAbsolute(value) || value.split('/').includes('..');
  function visit(path: string, value: unknown) {
    if (typeof value === 'string' && location(value) && !authored.includes(value)) located.push(`${path}: ${value}`);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (location(key)) located.push(`${path}: ${key}`);
      visit(path, child);
    }
  }
  for (const path of committed) {
    const text = readFileSync(join(root, path), 'utf8');
    for (const machine of locations) if (text.includes(machine)) located.push(`${path}: ${machine}`);
    if (path.endsWith('.json')) visit(path, JSON.parse(text));
  }
  assert.deepEqual(located, [], 'committed evidence must not record an absolute path or a path outside the project');
  return committed;
}
