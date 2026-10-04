import { isAbsolute, relative } from 'node:path';
import { ProductError } from './errors.js';

// Each artifact has exactly one format, and it is the one this CLI both writes
// and reads. Retired formats are neither converted nor read: a record carrying
// one is rejected with the fresh-adoption procedure as the only path forward.
export const formats = {
  state: 'repo-standards/state/v7',
  lock: 'repo-standards/lock/v1',
  scopeHistory: 'repo-standards/scope-history/v5',
  run: 'repo-standards/run/v6',
  status: 'repo-standards/status/v7',
  inspection: 'repo-standards/inspection/v6',
  scope: 'repo-standards/scope/v2',
  workRequest: 'repo-standards/work-request/v3',
  assessment: 'repo-standards/assessment/v3',
  operation: 'repo-standards/operation/v1',
  result: 'repo-standards/result/v1',
  outdated: 'repo-standards/outdated/v1',
  outdatedCache: 'repo-standards/outdated-cache/v1',
} as const;

type RecordFormat = typeof formats.state | typeof formats.lock | typeof formats.scopeHistory | typeof formats.run;

// The path a diagnostic names: project-relative when the record is inside the
// project, such as committed state, and absolute otherwise, such as a run record
// in a linked worktree's Git directory.
export function recordPath(root: string, path: string) {
  const local = relative(root, path);
  return local && !local.startsWith('..') && !isAbsolute(local) ? local : path;
}

// Only an older version of the same artifact is retired. Newer versions need
// the pinned CLI; malformed or unrelated formats remain integrity failures
// reported by the record's owner.
export function requireFormat(where: string, value: unknown, expected: RecordFormat) {
  const found = value && typeof value === 'object' ? (value as { format?: unknown }).format : undefined;
  const prefix = expected.slice(0, expected.lastIndexOf('/') + 1);
  if (found === expected || typeof found !== 'string' || !found.startsWith(prefix)) return;
  const version = found.slice(prefix.length);
  if (!/^v(?:0|[1-9]\d*)$/.test(version)) return;
  if (Number(version.slice(1)) > Number(expected.slice(prefix.length + 1))) {
    throw new ProductError('NEWER_FORMAT', `${where} carries the newer format ${found}; this CLI reads only ${expected}. Use the pinned CLI to read this record.`,
      { path: where, format: found, expected });
  }
  const removal = expected === formats.run ? 'the .repo-standards directory and this run record' : 'the .repo-standards directory';
  throw new ProductError('RETIRED_FORMAT', `${where} carries the retired format ${found}; this CLI reads only ${expected}. Adopt fresh: remove ${removal}, commit, and adopt again.`,
    { path: where, format: found, expected });
}
