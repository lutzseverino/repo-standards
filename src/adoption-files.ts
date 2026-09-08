import { randomUUID } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { git, targetBoundaryObservation, targetObservation } from './inspection.js';
import type { Blocker, Content, Observation } from './inspection.js';
export type Baseline = Pick<Content, 'sha256' | 'executable'>;
export type Files = Record<string, Content>;
export const systemTarget = '.agents/skills/adopt-standards';
export const ignore = '/runtime/node_modules/\n/local/\n/cache/\n';

export function json(value: unknown) { return JSON.stringify(value, null, 2) + '\n'; }
export function file(text: string): Content { return { sha256: hash(text), executable: false, encoding: 'utf8', content: text }; }
export function baselines(files: Files): Record<string, Baseline> {
  return Object.fromEntries(Object.entries(files).map(([path, value]) => [path, { sha256: value.sha256, executable: value.executable }]));
}
export function flatten(path: string, value: Observation, files: Files) {
  if (value.type === 'file') files[path] = value;
  else if (value.type === 'directory') for (const [name, child] of Object.entries(value.entries)) flatten(`${path}/${name}`, child, files);
  else throw new ProductError('UNSAFE_CONTENT', `Expected regular source material at ${path}.`);
}

export function relativePath(path: string) {
  if (path.split('/').some(part => !part || part === '.' || part === '..') || /[\\\p{Cc}]/u.test(path)) throw new ProductError('STATE_INTEGRITY', `Invalid repository-relative product path: ${path}.`);
}

export function safe(root: string, path: string) {
  relativePath(path);
  const blockers: Blocker[] = [];
  const value = targetObservation(root, path, blockers);
  if (blockers.length) throw new ProductError('UNSAFE_TARGET', `Target is no longer safe: ${path}.`, blockers);
  return value;
}

export function safeDirectory(root: string, path: string) {
  relativePath(path);
  const blockers: Blocker[] = [];
  const value = targetBoundaryObservation(root, path, blockers);
  if (blockers.length || (value.type !== 'directory' && value.type !== 'missing')) throw new ProductError('UNSAFE_TARGET', `Directory boundary is no longer safe: ${path}.`, blockers);
  return value;
}

export function stagedPath(path: string, installationId?: string) {
  return join(dirname(path), `.repo-standards-${installationId ? `${installationId}-${hash(path)}` : randomUUID()}.tmp`);
}

// Rename a new inode so replacing a tracked hard link never overwrites its
// other names. Recheck target ancestors immediately before each mutation.
export function write(root: string, path: string, value: Content, installationId?: string) {
  const before = safe(root, path);
  if (before.type === 'file' && before.sha256 === value.sha256 && before.executable === value.executable) return;
  if (!['file', 'missing'].includes(before.type)) throw new ProductError('TARGET_TYPE', `Expected a regular file at ${path}.`);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  safe(root, path);
  const temporary = join(root, stagedPath(path, installationId));
  try {
    writeFileSync(temporary, Buffer.from(value.content, value.encoding), { flag: 'wx', mode: value.executable ? 0o755 : 0o644 });
    chmodSync(temporary, value.executable ? 0o755 : 0o644);
    safe(root, path);
    renameSync(temporary, join(root, path));
  } finally { rmSync(temporary, { force: true }); }
}

export function projectRoot(project: string) {
  const result = git(resolve(project), ['rev-parse', '--show-toplevel']);
  if (result.status !== 0) throw new ProductError('GIT_REQUIRED', 'Use a Git working tree.');
  return result.stdout.trim();
}

export function lockPath(root: string) {
  const result = git(root, ['rev-parse', '--git-path', 'repo-standards-run.lock']);
  if (result.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot locate the adoption run lock.');
  return resolve(root, result.stdout.trim());
}

export function verifyFiles(root: string, files: Files) {
  for (const [path, expected] of Object.entries(files)) {
    const actual = safe(root, path);
    if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) throw new ProductError('FINAL_INTEGRITY', `Expected bytes or executable state changed: ${path}.`);
  }
}

export function actualChanges(root: string, affected: Record<string, Observation>) {
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']);
  if (status.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot report actual Git changes.');
  const records = status.stdout.split('\0').filter(Boolean);
  const paths = new Set<string>();
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    paths.add(record.slice(3));
    if (/^[RC]|^.[RC]/.test(record)) paths.add(records[++index]!);
  }
  // Git omits ignored material. List product storage and changed exact trees
  // independently, without following links or expanding installed dependencies.
  function collect(path: string) {
    const stat = lstatSync(join(root, path), { throwIfNoEntry: false });
    if (!stat) return;
    if (path === '.repo-standards/runtime/node_modules') { paths.add(path); return; }
    if (stat.isDirectory()) {
      const names = readdirSync(join(root, path));
      if (names.length === 0) paths.add(path);
      for (const name of names) collect(`${path}/${name}`);
    }
    else paths.add(path);
  }
  collect('.repo-standards');
  for (const [path, before] of Object.entries(affected)) {
    relativePath(path);
    const blockers: Blocker[] = [];
    if (json(targetObservation(root, path, blockers)) !== json(before)) {
      paths.add(path);
      if (blockers.length === 0) collect(path);
    }
  }
  return [...paths].sort();
}

export function stagedFiles(root: string, files: Files, runId: string, alternatives: Files = {}) {
  const temporaries: string[] = [];
  for (const [path, expected] of Object.entries(files)) {
    const temporary = stagedPath(path, runId);
    const actual = safe(root, temporary);
    if (actual.type === 'missing') continue;
    const candidates = [expected, alternatives[path]].filter(value => value !== undefined);
    if (actual.type !== 'file' || !candidates.some(value => {
      const bytes = Buffer.from(actual.content, actual.encoding);
      return Buffer.from(value.content, value.encoding).subarray(0, bytes.length).equals(bytes);
    })) throw new ProductError('INSTALLATION_CHANGED', `Staged installation content changed: ${temporary}. Preserve and reconcile it before retry.`);
    temporaries.push(temporary);
  }
  return temporaries;
}

