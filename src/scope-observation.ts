import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync, readlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { git } from './inspection.js';
import { foldPath } from './paths.js';

const limits = { paths: 20_000, fileBytes: 8 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, depth: 128 };
export interface Evidence { kind: 'file' | 'directory' | 'absence'; path: string; identity: string }
type FileState = { type: 'missing' } | { type: 'file'; sha256: string; executable: boolean } | { type: 'directory'; mode: number } | { type: 'symlink'; target: string };
const identity = (value: unknown) => `sha256:${hash(JSON.stringify(value))}`;

// One bounded observation is compared with a second before issuing a report.
// Only eligible files and named boundaries are read, never ignored siblings.
export function observeScope(root: string, named: string[] = []) {
  let bytes = 0;
  let count = 0;
  const deadline = Date.now() + 30_000;
  function file(path: string): FileState {
    if (Date.now() > deadline) throw new ProductError('OBSERVATION_LIMIT', 'Discovery observation exceeded 30 seconds.');
    if (++count > limits.paths) throw new ProductError('OBSERVATION_LIMIT', 'Discovery observation exceeds the path limit.');
    let present = false;
    try {
      const before = lstatSync(path);
      present = true;
      if (before.isSymbolicLink()) return { type: 'symlink', target: readlinkSync(path) };
      if (before.isDirectory()) return { type: 'directory', mode: before.mode & 0o777 };
      if (!before.isFile()) throw new ProductError('OBSERVATION_UNSAFE', 'Discovery encountered a special file.');
      if (before.size > limits.fileBytes || (bytes += before.size) > limits.totalBytes) throw new ProductError('OBSERVATION_LIMIT', 'Discovery observation exceeds the byte limit.');
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw new ProductError('OBSERVATION_UNSTABLE', 'Discovery evidence changed while opening it.');
        const buffer = Buffer.alloc(Math.min(before.size + 1, limits.fileBytes + 1));
        let length = 0;
        while (length < buffer.length) {
          const read = readSync(fd, buffer, length, buffer.length - length, null);
          if (!read) break;
          length += read;
        }
        const content = buffer.subarray(0, length);
        const after = fstatSync(fd);
        if (content.length !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new ProductError('OBSERVATION_UNSTABLE', 'Discovery evidence changed while reading it.');
        return { type: 'file', sha256: hash(content), executable: (after.mode & 0o111) !== 0 };
      } finally { closeSync(fd); }
    } catch (error) {
      if (error instanceof ProductError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (present) throw new ProductError('OBSERVATION_UNSTABLE', 'An observed discovery file disappeared during reading.');
        return { type: 'missing' };
      }
      throw new ProductError('OBSERVATION_READ', 'Cannot completely read required discovery evidence or ignore inputs.');
    }
  }
  function command(args: string[], absent = false) {
    const result = git(root, args, undefined, Math.max(1, deadline - Date.now()));
    if (result.status !== 0 && !(absent && result.status === 1)) throw new ProductError('OBSERVATION_READ', 'Cannot completely observe Git discovery inputs.');
    return result.stdout;
  }
  function names(path: string): string[] {
    if (!lstatSync(path).isDirectory()) throw new ProductError('OBSERVATION_UNSTABLE', 'A discovery directory boundary changed.');
    const directory = opendirSync(path);
    const result: string[] = [];
    try {
      for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
        if (result.length >= limits.paths) throw new ProductError('OBSERVATION_LIMIT', 'Named directory observation exceeds the entry limit.');
        result.push(entry.name);
      }
    } finally { directory.closeSync(); }
    return result;
  }
  const settings = Object.fromEntries(['core.ignorecase', 'core.precomposeunicode', 'core.filemode', 'core.symlinks', 'core.sparsecheckout', 'core.sparsecheckoutcone']
    .map(key => [key, command(['config', '--bool', '--get', key], true).trim() || null]));
  const configuredExclude = command(['config', '--null', '--path', '--get', 'core.excludesfile'], true);
  const globalExclude = configuredExclude ? configuredExclude.slice(0, -1) : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'git/ignore');
  const infoExclude = command(['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude']).replace(/\n$/, '');
  const tracked = command(['ls-files', '--cached', '-z']).split('\0').filter(Boolean);
  const trackedParents = new Set<string>();
  for (const path of tracked) {
    let parent = dirname(path);
    while (parent !== '.') { trackedParents.add(parent); parent = dirname(parent); }
  }
  const known = new Set(tracked);
  const directories = new Set(['.']);
  let pending = ['.'];
  let visited = 0;
  // Git omits untracked special files and empty directories from ls-files.
  // Walk eligible directory entries too, applying Git's own ignore decision.
  while (pending.length) {
    if (Date.now() > deadline) throw new ProductError('OBSERVATION_LIMIT', 'Discovery observation exceeded 30 seconds.');
    const candidates = pending.flatMap(parent => names(join(root, parent))
      .filter(name => !(parent === '.' && name === '.git'))
      .map(name => parent === '.' ? name : `${parent}/${name}`));
    visited += candidates.length;
    if (visited > limits.paths) throw new ProductError('OBSERVATION_LIMIT', 'Discovery directory observation exceeds the entry limit.');
    const ignoredResult = candidates.length ? git(root, ['check-ignore', '--no-index', '--stdin', '-z'], candidates.join('\0') + '\0', Math.max(1, deadline - Date.now())) : undefined;
    if (ignoredResult && ignoredResult.status !== 0 && ignoredResult.status !== 1) throw new ProductError('OBSERVATION_READ', 'Cannot completely classify discovery entries.');
    const ignored = new Set(ignoredResult?.stdout.split('\0').filter(Boolean));
    pending = [];
    for (const path of candidates.sort()) {
      if (ignored.has(path) && !known.has(path) && !trackedParents.has(path)) continue;
      if (path.split('/').at(-1) === '.git') throw new ProductError('OBSERVATION_UNSAFE', 'Nested Git metadata prevents a complete discovery observation.');
      let stat;
      try { stat = lstatSync(join(root, path)); } catch { throw new ProductError('OBSERVATION_READ', 'A discovery directory entry cannot be observed.'); }
      if (stat.isDirectory()) {
        if (path.split('/').length > limits.depth) throw new ProductError('OBSERVATION_LIMIT', 'Discovery directory observation exceeds the depth limit.');
        // Gitlinks are reported as blockers by inspection; never traverse them.
        if (!known.has(path)) { directories.add(path); pending.push(path); }
      } else known.add(path);
    }
  }
  const paths = [...known].sort();
  if (paths.length + named.length > limits.paths) throw new ProductError('OBSERVATION_LIMIT', 'Discovery observation exceeds the path limit.');
  const files: Record<string, FileState> = Object.create(null);
  const boundaries: Record<string, FileState> = Object.create(null);
  function observePath(path: string, eligible: boolean) {
    const parts = path.split('/');
    if (parts.length > limits.depth || parts.some(part => !part || part === '..' || part === '.') || isAbsolute(path)) throw new ProductError('OBSERVATION_UNSAFE', 'Unsafe discovery observation path.');
    for (let length = 1; length < parts.length; length++) {
      const parent = parts.slice(0, length).join('/');
      const state = boundaries[parent] ??= file(join(root, parent));
      if (state.type !== 'directory' && state.type !== 'missing') throw new ProductError('OBSERVATION_UNSAFE', `Unsafe discovery ancestor: ${parent}.`);
      if (eligible && state.type === 'directory') directories.add(parent);
      if (state.type === 'missing') return { type: 'missing' } as const;
    }
    return file(join(root, path));
  }
  for (const directory of [...directories].filter(path => path !== '.').sort()) {
    boundaries[directory] = file(join(root, directory));
    if (boundaries[directory]!.type !== 'directory') throw new ProductError('OBSERVATION_UNSTABLE', 'A discovery directory boundary changed.');
  }
  for (const path of paths) files[path] = observePath(path, true);
  const targets: Record<string, FileState> = Object.create(null);
  for (const path of [...new Set(named)].sort()) {
    targets[path] = observePath(path, false);
    // Check spelling at every named boundary without reading sibling contents.
    const parts = path.split('/');
    for (let length = 0; length < parts.length; length++) {
      const parent = length ? parts.slice(0, length).join('/') : '.';
      if (parent !== '.' && boundaries[parent]?.type === 'missing') break;
      const matches = names(join(root, parent)).filter(name => foldPath(name) === foldPath(parts[length]!));
      if (matches.some(name => name !== parts[length])) throw new ProductError('CASE_CONFLICT', `Named scope path has a case-folded or Unicode alias: ${path}.`);
    }
    if (targets[path]!.type !== 'file' && targets[path]!.type !== 'missing') throw new ProductError('UNSAFE_TARGET', `Discovered targets must be individual regular files or absent files: ${path}.`);
  }
  const ignores: Record<string, { location: string; state: FileState | { type: 'disabled' } }> = Object.create(null);
  for (const [key, path] of [['global', globalExclude ? resolve(root, globalExclude) : ''], ['info', infoExclude]]) {
    if (path === '') { ignores[key!] = { location: '', state: { type: 'disabled' } }; continue; }
    const state = file(path!);
    if (state.type !== 'file' && state.type !== 'missing') throw new ProductError('OBSERVATION_UNSAFE', 'Ignore inputs must be regular files or absent.');
    ignores[key!] = { location: path!, state };
  }
  for (const directory of [...new Set([...directories, ...Object.keys(boundaries).filter(path => boundaries[path]!.type === 'directory')])].sort()) {
    const path = directory === '.' ? '.gitignore' : `${directory}/.gitignore`;
    const state = file(join(root, path));
    // Git does not follow a symbolic .gitignore; record the link, not its referent.
    if (state.type === 'directory') throw new ProductError('OBSERVATION_UNSAFE', `Cannot read ignore input: ${path}.`);
    ignores[path] = { location: path, state };
  }
  const inventories: Record<string, string[]> = Object.fromEntries([...directories].sort().map(directory => [directory, []]));
  for (const path of [...new Set([...paths, ...directories])].sort()) {
    if (path !== '.' && inventories[dirname(path)]) inventories[dirname(path)]!.push(path);
  }
  const evidence: Evidence[] = [
    ...Object.entries(files).filter(([, state]) => state.type === 'file').map(([path, state]) => ({ kind: 'file' as const, path, identity: identity(state) })),
    ...Object.entries(inventories).map(([path, entries]) => ({ kind: 'directory' as const, path, identity: identity(entries) })),
  ].sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { files, inventories, boundaries, targets, settings, ignores, limits, evidence };
}
