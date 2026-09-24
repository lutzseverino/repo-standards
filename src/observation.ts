import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { foldPath } from './paths.js';

// Read-only observation of the project: files and trees observed without
// following links, target boundaries validated on the way down, and Git run
// without optional locks or repository filters. Every module that reads the
// project, including the reader of a recorded adoption, observes through here.

export interface Blocker { code: string; message: string; path?: string }
export interface Content { sha256: string; executable: boolean; encoding: 'utf8' | 'base64'; content: string }
export type Observation = { type: 'missing' } | ({ type: 'file' } & Content) | { type: 'directory'; entries: Record<string, Observation> } | { type: 'symlink'; target: string } | { type: 'unsafe'; obstacles?: Record<string, Observation> };
// The reported form of an observation. Reports and run records carry each file
// as its SHA-256 hash and executable mode, never its bytes.
export type HashInventory = { type: 'missing' } | { type: 'file'; sha256: string; executable: boolean } | { type: 'directory'; entries: Record<string, HashInventory> } | { type: 'symlink'; target: string } | { type: 'unsafe'; obstacles?: Record<string, HashInventory> };

function hashEntries(entries: Record<string, Observation>) {
  return Object.fromEntries(Object.entries(entries).map(([name, child]) => [name, hashInventory(child)]));
}

export function hashInventory(value: Observation): HashInventory {
  if (value.type === 'file') return { type: 'file', sha256: value.sha256, executable: value.executable };
  if (value.type === 'directory') return { type: 'directory', entries: hashEntries(value.entries) };
  if (value.type === 'unsafe') return value.obstacles ? { type: 'unsafe', obstacles: hashEntries(value.obstacles) } : { type: 'unsafe' };
  return value;
}

export function content(path: string): Content {
  const bytes = readFileSync(path);
  const utf8 = bytes.toString('utf8');
  const encoding = Buffer.from(utf8).equals(bytes) ? 'utf8' : 'base64';
  return { sha256: hash(bytes), executable: (lstatSync(path).mode & 0o111) !== 0, encoding, content: encoding === 'utf8' ? utf8 : bytes.toString('base64') };
}

export function observe(path: string, excluded: ReadonlySet<string> = new Set()): Observation {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return { type: 'symlink', target: readlinkSync(path) };
    if (stat.isFile()) return { type: 'file', ...content(path) };
    if (stat.isDirectory()) return { type: 'directory', entries: excluded.has(path) ? {} : Object.fromEntries(readdirSync(path).sort()
      .flatMap(name => {
        const child = observe(join(path, name), excluded);
        return excluded.has(join(path, name)) && child.type === 'directory' ? [] : [[name, child]];
      })) };
    return { type: 'unsafe' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { type: 'missing' };
    throw new ProductError('PROJECT_READ', `Cannot safely read project content: ${path}.`);
  }
}

export function git(project: string, args: string[], input?: string, timeout?: number) {
  const base = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', project];
  const options = { encoding: 'utf8' as const, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 32 * 1024 * 1024, ...(timeout === undefined ? {} : { timeout }), ...(input === undefined ? {} : { input }) };
  if (args[0] === 'status') {
    // Status can run clean/process filters while refreshing tracked-file hashes.
    // Ask only for configuration names; never execute repository filter commands.
    const filters = spawnSync('git', [...base, 'config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$'], options);
    if (filters.error || (filters.status !== 0 && filters.status !== 1)) throw new ProductError('PROJECT_READ', 'Cannot disable Git filters for read-only observation.');
    for (const key of filters.stdout.split('\0').filter(Boolean)) base.push('-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`);
  }
  const result = spawnSync('git', [...base, ...args], options);
  if (result.error) throw new ProductError('GIT_REQUIRED', 'Install Git and inspect an existing Git working tree.');
  return result;
}

// Validate the target and its ancestors while observing descendants without
// following their links. Owned runtime trees validate those descendants against
// npm's recorded inventory instead of the author-target no-symlink contract.
export function targetBoundaryObservation(root: string, target: string, blockers: Blocker[], excluded?: ReadonlySet<string>): Observation {
  let parent = root;
  const parts = target.split('/');
  for (const [index, part] of parts.entries()) {
    try {
      const matches = readdirSync(parent).filter(name => foldPath(name) === foldPath(part)).sort();
      const aliases = matches.filter(name => name !== part);
      if (aliases.length) {
        blockers.push({ code: 'CASE_CONFLICT', path: target, message: `Target spelling conflicts with existing ${aliases.join(', ')}.` });
        return { type: 'unsafe', obstacles: Object.fromEntries(matches.map(name => [name, observe(join(parent, name))])) };
      }
      parent = join(parent, part);
      const stat = lstatSync(parent);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && index < parts.length - 1) || (!stat.isDirectory() && !stat.isFile())) {
        blockers.push({ code: 'UNSAFE_TARGET', path: target, message: 'A target or ancestor is a symbolic link, special file, or non-directory ancestor.' });
        return { type: 'unsafe', obstacles: { [parts.slice(0, index + 1).join('/')]: observe(parent) } };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { type: 'missing' };
      throw new ProductError('PROJECT_READ', `Cannot inspect target ${target}.`);
    }
  }
  return observe(parent, excluded);
}

export function targetObservation(root: string, target: string, blockers: Blocker[], excluded?: ReadonlySet<string>): Observation {
  const observed = targetBoundaryObservation(root, target, blockers, excluded);
  if (observed.type === 'unsafe' || observed.type === 'missing') return observed;
  function unsafe(value: Observation): boolean {
    return value.type === 'symlink' || value.type === 'unsafe' || (value.type === 'directory' && Object.entries(value.entries).some(([name, child]) => name.toLowerCase() === '.git' || unsafe(child)));
  }
  if (unsafe(observed)) blockers.push({ code: 'UNSAFE_TARGET', path: target, message: 'Target tree contains a symbolic link, special file, or nested Git metadata.' });
  return observed;
}

export function inventoryPaths(value: Observation | HashInventory): string[] {
  const result: string[] = [];
  function visit(prefix: string, child: Observation | HashInventory) {
    if (child.type === 'file') result.push(prefix);
    else if (child.type === 'directory') {
      if (prefix) result.push(prefix + '/');
      for (const [name, entry] of Object.entries<Observation | HashInventory>(child.entries)) visit(prefix ? `${prefix}/${name}` : name, entry);
    }
  }
  visit('', value);
  return result.sort();
}

// Installed trees have the directories implied by their materialized files.
// An extra empty directory changes that tree even when a file-only inventory
// omits it. Use the same comparison for skills and durable product state.
export function plannedInventory(files: string[]): Set<string> {
  const expected = new Set(files);
  for (const file of files) {
    const parts = file.split('/');
    for (let length = 1; length < parts.length; length++) expected.add(parts.slice(0, length).join('/') + '/');
  }
  return expected;
}

export function matchesInventory(value: Observation, files: string[]) {
  return JSON.stringify(inventoryPaths(value)) === JSON.stringify([...plannedInventory(files)].sort());
}
