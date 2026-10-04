import { randomUUID } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { git, hashInventory, targetBoundaryObservation, targetObservation } from './observation.js';
import type { Blocker, Content, HashInventory, Observation } from './observation.js';
export type Baseline = Pick<Content, 'sha256' | 'executable'>;
export type Files = Record<string, Content>;
export const ignore = '/runtime/node_modules/\n/local/\n/cache/\n';

export function json(value: unknown) { return JSON.stringify(value, null, 2) + '\n'; }
export function file(text: string): Content { return { sha256: hash(text), executable: false, encoding: 'utf8', content: text }; }
export function baselines(files: Files): Record<string, Baseline> {
  return Object.fromEntries(Object.entries(files).map(([path, value]) => [path, { sha256: value.sha256, executable: value.executable }]));
}
export function flatten(path: string, value: Observation, files: Files): void;
export function flatten(path: string, value: HashInventory, files: Record<string, Baseline>): void;
export function flatten(path: string, value: Observation | HashInventory, files: Record<string, Baseline>) {
  if (value.type === 'file') files[path] = value;
  else if (value.type === 'directory') for (const [name, child] of Object.entries<Observation | HashInventory>(value.entries)) flatten(`${path}/${name}`, child as HashInventory, files);
  else throw new ProductError('UNSAFE_CONTENT', `Expected regular source material at ${path}.`);
}

export function relativePath(path: string) {
  if (path.split('/').some(part => !part || part === '.' || part === '..') || /[\\\p{Cc}]/u.test(path)) throw new ProductError('STATE_INTEGRITY', `Invalid repository-relative product path: ${path}.`);
}

// A target observed safely, as a skill link with the given text when one is passed.
export function safe(root: string, path: string, link?: string) {
  relativePath(path);
  const blockers: Blocker[] = [];
  const value = targetObservation(root, path, blockers, undefined, link);
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

// The files of a product tree, relative to it.
export function inventory(root: string, path: string) {
  const files: Files = Object.create(null);
  flatten(path, safe(root, path), files);
  return Object.keys(files).map(name => name.slice(path.length + 1)).sort();
}

export function stagedPath(path: string, installationId?: string) {
  return join(dirname(path), `.repo-standards-${installationId ? `${installationId}-${hash(path)}` : randomUUID()}.tmp`);
}

// Removes an entry, a whole tree, or a link without following it. rmSync in
// the pinned Node.js follows a symbolic link: it refuses one to a directory and
// leaves a dangling one in place.
export function remove(path: string) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) unlinkSync(path);
  else if (stat) rmSync(path, { recursive: true, force: true });
}

// Rename a new inode so replacing a tracked hard link never overwrites its
// other names. Recheck target ancestors immediately before each mutation.
function place(root: string, path: string, temporary: string, create: (temporary: string) => void, link?: string) {
  safe(root, path, link);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  safe(root, path, link);
  try {
    create(temporary);
    safe(root, path, link);
    renameSync(temporary, join(root, path));
  } finally { remove(temporary); }
}

export function write(root: string, path: string, value: Content, installationId?: string) {
  const before = safe(root, path);
  if (before.type === 'file' && before.sha256 === value.sha256 && before.executable === value.executable) return;
  if (!['file', 'missing'].includes(before.type)) throw new ProductError('TARGET_TYPE', `Expected a regular file at ${path}.`);
  place(root, path, join(root, stagedPath(path, installationId)), temporary => {
    writeFileSync(temporary, Buffer.from(value.content, value.encoding), { flag: 'wx', mode: value.executable ? 0o755 : 0o644 });
    chmodSync(temporary, value.executable ? 0o755 : 0o644);
  });
}

// Installs a skill link the same way, never following it. A staged link an
// interrupted write left behind is replaced when it holds the same text.
export function writeLink(root: string, path: string, text: string, installationId: string) {
  const before = safe(root, path, text);
  if (before.type === 'symlink') return;
  if (before.type !== 'missing') throw new ProductError('TARGET_TYPE', `Expected no entry at ${path}.`);
  const staged = stagedPath(path, installationId);
  const stat = lstatSync(join(root, staged), { throwIfNoEntry: false });
  if (stat && !(stat.isSymbolicLink() && readlinkSync(join(root, staged)) === text)) throw new ProductError('INSTALLATION_CHANGED', `Staged installation content changed: ${staged}. Preserve and reconcile it before retry.`);
  place(root, path, join(root, staged), temporary => {
    remove(temporary);
    symlinkSync(text, temporary);
  }, text);
}

// Whether reinstalling the project runtime from its manifest and npm lock
// restores exactly this CLI. A run interrupted before or during installation
// can leave the former pair, or a new manifest beside the former lock.
function runtimeRestores(root: string, version: string) {
  const read = (name: string) => {
    const value = safe(root, `.repo-standards/runtime/${name}`);
    return value.type === 'file' ? JSON.parse(Buffer.from(value.content, value.encoding).toString('utf8')) : undefined;
  };
  const cli = '@lutzseverino/repo-standards';
  try {
    const manifest = read('package.json');
    const lock = read('package-lock.json');
    return manifest?.dependencies?.[cli] === version && lock?.packages?.['']?.dependencies?.[cli] === version
      && lock.packages[`node_modules/${cli}`]?.version === version;
  } catch { return false; }
}

// Status, outdated, resume and abandon act only under the pinned CLI; a
// different exact CLI is a candidate pin change only for inspect and start.
export function requirePinnedCli(root: string, pinned: string, running: string) {
  if (pinned === running) return;
  throw new ProductError('CLI_PIN_MISMATCH', runtimeRestores(root, pinned)
    ? `Use the project-pinned CLI ${pinned}, not ${running}. From the project root ${root}, reinstall the project runtime with npm ci --ignore-scripts --prefix .repo-standards/runtime and run .repo-standards/runtime/node_modules/.bin/repo-standards, or run an exact CLI ${pinned} installed elsewhere.`
    : `Use the pinned CLI ${pinned}, not ${running}. The project runtime manifest and npm lock do not both pin it, so reinstalling the runtime cannot restore it; run an exact CLI ${pinned} installed outside the project; if a run is active, the one that started it.`);
}

export function projectRoot(project: string) {
  const result = git(resolve(project), ['rev-parse', '--show-toplevel']);
  if (result.status !== 0) throw new ProductError('GIT_REQUIRED', 'Use a Git working tree.');
  return result.stdout.trim();
}

// The adoption run record lives at Git's path for this working tree, outside
// tracked content.
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

export function actualChanges(root: string, affected: Record<string, HashInventory>) {
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
    // Only a skill link was ever observed as a link; it is observed as one again.
    if (json(hashInventory(targetObservation(root, path, blockers, undefined, before.type === 'symlink' ? before.target : undefined))) !== json(before)) {
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

