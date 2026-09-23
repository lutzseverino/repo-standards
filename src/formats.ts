import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { ProductError } from './errors.js';

// Each artifact has exactly one format, and it is the one this CLI both writes
// and reads. Retired formats are neither converted nor read: a record carrying
// one is rejected with the fresh-adoption procedure as the only path forward.
export const formats = {
  state: 'repo-standards/state/v5',
  lock: 'repo-standards/lock/v1',
  scopeHistory: 'repo-standards/scope-history/v3',
  run: 'repo-standards/run/v5',
  status: 'repo-standards/status/v5',
  inspection: 'repo-standards/inspection/v4',
  scope: 'repo-standards/scope/v1',
  workRequest: 'repo-standards/work-request/v3',
  assessment: 'repo-standards/assessment/v2',
  operation: 'repo-standards/operation/v1',
  result: 'repo-standards/result/v1',
  outdated: 'repo-standards/outdated/v1',
  outdatedCache: 'repo-standards/outdated-cache/v1',
} as const;

type RecordFormat = typeof formats.state | typeof formats.scopeHistory | typeof formats.run;

// The path a diagnostic names: project-relative when the record is inside the
// project, such as committed state, and absolute otherwise, such as a run record
// in a linked worktree's Git directory.
export function recordPath(root: string, path: string) {
  const local = relative(root, path);
  return local && !local.startsWith('..') && !isAbsolute(local) ? local : path;
}

// A record of the same artifact under another version is retired. Anything
// else that fails to match is left to the record's owner, which reports an
// integrity failure.
export function requireFormat(where: string, value: unknown, expected: RecordFormat) {
  const found = value && typeof value === 'object' ? (value as { format?: unknown }).format : undefined;
  if (found === expected || typeof found !== 'string' || !found.startsWith(expected.slice(0, expected.lastIndexOf('/') + 1))) return;
  const removal = expected === formats.run ? 'the .repo-standards directory and this run record' : 'the .repo-standards directory';
  throw new ProductError('RETIRED_FORMAT', `${where} carries the retired format ${found}; this CLI reads only ${expected}. Adopt fresh: remove ${removal}, commit, and adopt again.`,
    { path: where, format: found, expected });
}

function recorded(path: string): unknown {
  try { return lstatSync(path, { throwIfNoEntry: false })?.isFile() ? JSON.parse(readFileSync(path, 'utf8')) : undefined; }
  catch { return undefined; }
}

// Every command that reads product records rejects a retired one before it
// reads or writes anything else, so the diagnostic is the same whichever record
// the command would have read first: committed state, retained scope evidence,
// the active run record, or a run report archived beside it by abandonment.
// Records that cannot be read are left to their owners.
export function rejectRetiredRecords(root: string, runRecord: string) {
  for (const [path, format] of [['.repo-standards/state.json', formats.state], ['.repo-standards/inputs/scope-history.json', formats.scopeHistory]] as const) {
    requireFormat(path, recorded(join(root, path)), format);
  }
  const archive = join(dirname(runRecord), 'repo-standards-reports');
  const archived = lstatSync(archive, { throwIfNoEntry: false })?.isDirectory()
    ? readdirSync(archive).sort().filter(name => name.endsWith('.json')).map(name => join(archive, name)) : [];
  for (const path of [runRecord, ...archived]) requireFormat(recordPath(root, path), recorded(path), formats.run);
}
