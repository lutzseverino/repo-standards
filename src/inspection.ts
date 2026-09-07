import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { foldPath } from './paths.js';
import { acquireSource, hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { validateSource } from './resolver.js';
import { stringify } from 'yaml';
import { decodeRecordedState } from './recorded-state.js';
import type { RecordedSelection } from './recorded-state.js';

export interface Blocker { code: string; message: string; path?: string }
export interface Content { sha256: string; executable: boolean; encoding: 'utf8' | 'base64'; content: string }
export type Observation = { type: 'missing' } | ({ type: 'file' } & Content) | { type: 'directory'; entries: Record<string, Observation> } | { type: 'symlink'; target: string } | { type: 'unsafe'; obstacles?: Record<string, Observation> };

function content(path: string): Content {
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

export function git(project: string, args: string[], input?: string) {
  const base = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', project];
  const options = { encoding: 'utf8' as const, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 32 * 1024 * 1024, ...(input === undefined ? {} : { input }) };
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

export function hiddenIndexPaths(root: string) {
  const flags = git(root, ['ls-files', '-v', '-z']);
  if (flags.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot inspect Git index flags.');
  return flags.stdout.split('\0').filter(entry => /^[a-zS] /.test(entry)).map(entry => entry.slice(2));
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

export interface InspectOptions { source: string; standardsVersion: string; profile: string; project: string }

interface RecordedAdoption {
  selection: RecordedSelection;
  baselines: Record<string, Pick<Content, 'sha256' | 'executable'>>;
  skills: Record<string, string[]>;
  resolved: { declarations: { id: string; kind: string; target?: string; name?: string }[] };
  files: Record<string, Pick<Content, 'sha256' | 'executable'>>;
}

function recordedAdoption(root: string): RecordedAdoption | undefined {
  const lockValue = targetObservation(root, '.repo-standards/lock.json', []);
  const stateValue = targetObservation(root, '.repo-standards/state.json', []);
  if (lockValue.type === 'missing' && stateValue.type === 'missing') return undefined;
  const { pinned: lock, state } = decodeRecordedState(lockValue, stateValue);
  let resolved: RecordedAdoption['resolved'];
  try {
    resolved = JSON.parse(readFileSync(join(root, '.repo-standards/inputs/resolved.json'), 'utf8'));
  } catch { throw new ProductError('STATE_INTEGRITY', 'Recorded adoption state cannot be read. Restore the committed product state.'); }
  if (!Array.isArray(resolved?.declarations)) {
    throw new ProductError('STATE_INTEGRITY', 'Recorded adoption state failed integrity validation. Restore the committed product state.');
  }
  return { selection: lock.selection, baselines: state.baselines, skills: state.skills, resolved, files: lock.files };
}

function fileInventory(value: Observation): string[] {
  const result: string[] = [];
  function visit(prefix: string, child: Observation) {
    if (child.type === 'file') result.push(prefix);
    else if (child.type === 'directory') for (const [name, entry] of Object.entries(child.entries)) visit(prefix ? `${prefix}/${name}` : name, entry);
  }
  visit('', value);
  return result.sort();
}

function productStateObservation(root: string, blockers: Blocker[]) {
  const directories = ['local', 'cache', 'runtime/node_modules'].map(path => `.repo-standards/${path}`);
  const excluded = new Set(directories.map(path => join(root, path)));
  // Generated descendants do not bind confirmation, but each root must still
  // be a safe directory boundary. Missing ignored directories are allowed.
  for (const path of directories) {
    const value = targetBoundaryObservation(root, path, blockers, excluded);
    if (value.type === 'file') blockers.push({ code: 'TARGET_TYPE', path, message: 'Generated product state requires a directory at this path.' });
  }
  return targetObservation(root, '.repo-standards', blockers, excluded);
}

export function productInventory(root: string): string[] {
  const blockers: Blocker[] = [];
  const observed = productStateObservation(root, blockers);
  if (blockers.length) throw new ProductError('FINAL_INTEGRITY', 'Unsafe product state.', blockers);
  return fileInventory(observed).map(path => `.repo-standards/${path}`);
}

export async function inspect(options: InspectOptions, cliVersion: string, retained?: Awaited<ReturnType<typeof acquireSource>> & { manifest: string; ownedSkills: ReadonlySet<string> }) {
  if (process.versions.node.split('.')[0] !== '24') throw new ProductError('NODE_REQUIRED', 'Node.js 24 is required. Select Node.js 24 with your version manager or install it from https://nodejs.org/en/download, then retry.');
  const npm = spawnSync('npm', ['--version'], { cwd: homedir(), encoding: 'utf8', timeout: 10_000 });
  if (npm.error || npm.status !== 0 || !/^\d+\.\d+\.\d+/.test(npm.stdout.trim())) throw new ProductError('NPM_REQUIRED', 'npm is required. Reinstall the npm bundled with Node.js 24 from https://nodejs.org/en/download and ensure npm is on PATH.');
  const location = git(resolve(options.project), ['rev-parse', '--show-toplevel']);
  if (location.status !== 0) throw new ProductError('GIT_REQUIRED', 'Inspection requires a Git working tree. Run git init in your project first.');
  const root = realpathSync(location.stdout.trim());
  const previous = recordedAdoption(root);
  const source = retained ?? await acquireSource(options.source, options.standardsVersion, root);
  try {
    const head = git(root, ['rev-parse', '--verify', 'HEAD']);
    const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']);
    if (status.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot inspect Git status.');
    const blockers: Blocker[] = [];
    if (head.status !== 0) blockers.push({ code: 'NO_COMMIT', message: 'Create an initial commit before starting adoption.' });
    if (status.stdout) blockers.push({ code: 'DIRTY_PROJECT', message: 'Commit or reconcile all index, working tree, and untracked changes before starting adoption.' });
    const index = git(root, ['ls-files', '--stage', '-z']);
    if (index.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot inspect the Git index.');
    const hidden = hiddenIndexPaths(root);
    for (const path of hidden) blockers.push({ code: 'HIDDEN_INDEX_STATE', path, message: 'Clear assume-unchanged or skip-worktree flags and reconcile local content before adoption; Git status may hide changes.' });
    const tracked = new Set(index.stdout.split('\0').filter(Boolean).map(entry => entry.slice(entry.indexOf('\t') + 1)));
    for (const entry of index.stdout.split('\0').filter(entry => entry.startsWith('160000 '))) blockers.push({ code: 'SUBMODULE_STATE', path: entry.slice(entry.indexOf('\t') + 1), message: 'Initial inspection cannot establish clean nested submodule state without running nested Git behavior.' });
    const productState = previous ? productStateObservation(root, blockers) : targetObservation(root, '.repo-standards', blockers);
    const systemSkill = targetObservation(root, '.agents/skills/adopt-standards', blockers);
    if (!previous && productState.type !== 'missing') blockers.push({ code: 'EXISTING_ADOPTION', path: '.repo-standards', message: 'Existing product state blocks initial adoption. Inspect the current selection with the project-pinned CLI and no source flags.' });
    if (systemSkill.type !== 'missing' && !previous) blockers.push({ code: 'SYSTEM_SKILL_CONFLICT', path: '.agents/skills/adopt-standards', message: 'Existing reserved system-skill content requires established product ownership.' });
    const validation = validateSource(source.root, cliVersion, source.paths, retained?.manifest);
    if (!validation.valid) throw new ProductError('INVALID_STANDARDS', 'The standards source is invalid or incompatible with this CLI.', validation.errors.map(error => ({ ...error, file: 'standards.yaml' })));
    const resolved = validation.profiles[options.profile];
    if (!resolved) throw new ProductError('UNKNOWN_PROFILE', `Unknown profile ${options.profile}. Available profiles: ${Object.keys(validation.profiles).join(', ')}.`);
    let update: 'standards' | 'cli' | undefined;
    if (previous) {
      const sameSource = source.identity.repository.toLowerCase() === previous.selection.standards.repository.toLowerCase();
      if (sameSource && source.identity.version === previous.selection.standards.version && source.identity.commit !== previous.selection.standards.commit) {
        throw new ProductError('MOVED_TAG', `The recorded ${source.identity.version} tag previously resolved to ${previous.selection.standards.commit}; it now resolves to ${source.identity.commit}. Choose a new immutable version.`);
      }
      const standardsChanged = source.identity.version !== previous.selection.standards.version || source.identity.commit !== previous.selection.standards.commit;
      const cliChanged = cliVersion !== previous.selection.cli.version;
      if (!sameSource || options.profile !== previous.selection.profile) blockers.push({ code: 'SELECTION_SWITCH', message: 'Updates must preserve the current standards source and profile. Source and profile switching are unsupported.' });
      if (standardsChanged && cliChanged) blockers.push({ code: 'INDEPENDENT_UPDATE_REQUIRED', message: 'Update either the standards revision or the exact CLI version, then inspect the other change separately.' });
      else if (standardsChanged) update = 'standards';
      else if (cliChanged) {
        update = 'cli';
        if (!retained) blockers.push({ code: 'CLI_UPDATE_REQUIRES_RETAINED', message: 'CLI updates use the current retained standards. Omit source flags and inspect with the candidate exact CLI version.' });
      } else blockers.push({ code: 'NO_UPDATE', message: 'The inspected selection matches the current pins. Choose a new standards revision or inspect with a different exact CLI version.' });
      for (const [path, expected] of Object.entries(previous.baselines)) {
        const actual = targetObservation(root, path, blockers);
        if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) blockers.push({ code: 'INSTALLED_CONTENT_EDITED', path, message: 'Installed exact content differs from its last-complete baseline. Reconcile it before updating.' });
      }
      for (const [path, expected] of Object.entries(previous.skills)) {
        const actual = targetObservation(root, path, blockers);
        if (JSON.stringify(fileInventory(actual)) !== JSON.stringify(expected)) blockers.push({ code: 'INSTALLED_CONTENT_EDITED', path, message: 'The installed skill inventory differs from its last-complete baseline. Reconcile added or removed resources before updating.' });
      }
      for (const [path, expected] of Object.entries(previous.files).filter(([path]) => path.startsWith('.repo-standards/'))) {
        const actual = targetObservation(root, path, blockers);
        if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) blockers.push({ code: 'STATE_INTEGRITY', path, message: 'Retained product material differs from its recorded baseline. Restore it before updating.' });
      }
      const expectedProductFiles = [...Object.keys(previous.files).filter(path => path.startsWith('.repo-standards/')), '.repo-standards/lock.json', '.repo-standards/state.json'].sort();
      const actualProductFiles = fileInventory(productState).map(path => `.repo-standards/${path}`);
      if (JSON.stringify(actualProductFiles) !== JSON.stringify(expectedProductFiles)) {
        blockers.push({ code: 'STATE_INTEGRITY', path: '.repo-standards', message: 'The durable product-state inventory changed. Reconcile added or removed material before updating.' });
      }
    }
    const exact = [];
    const guidance = [];
    const operations = [];
    const affected: Record<string, Observation> = Object.create(null);
    for (const declaration of resolved.declarations) {
      const targets = declaration.kind === 'repository' ? [...declaration.targets.paths, ...declaration.targets.directories] : [declaration.kind === 'skill' ? `.agents/skills/${declaration.name}` : declaration.target];
      for (const target of targets) {
        const current = targetObservation(root, target, blockers);
        affected[target] = current;
        const expectsDirectory = declaration.kind === 'skill' || (declaration.kind === 'repository' && declaration.targets.directories.includes(target));
        if ((expectsDirectory && current.type === 'file') || (!expectsDirectory && current.type === 'directory')) blockers.push({ code: 'TARGET_TYPE', path: target, message: `This declaration requires a ${expectsDirectory ? 'directory' : 'file'} at its target.` });
      }
      if (declaration.kind === 'skill' || 'exact' in declaration) {
        const target = targets[0]!;
        const desired = observe(join(source.root, declaration.kind === 'skill' ? declaration.source : declaration.exact));
        const current = affected[target]!;
        if (declaration.kind === 'skill' && current.type !== 'missing' && !(retained?.ownedSkills ?? new Set(Object.keys(previous?.skills ?? {}))).has(target)) blockers.push({ code: 'SKILL_CONFLICT', path: target, message: 'An existing skill has no established installed baseline for this selection. Reconcile the unrelated skill before adoption.' });
        function checkTracked(path: string, value: Observation) {
          if (value.type === 'directory') {
            if (Object.keys(value.entries).length === 0) blockers.push({ code: 'UNTRACKED_REPLACEMENT', path, message: 'An existing empty directory has no recoverable Git baseline.' });
            for (const [name, child] of Object.entries(value.entries)) checkTracked(`${path}/${name}`, child);
          } else if (value.type !== 'missing' && !tracked.has(path)) blockers.push({ code: 'UNTRACKED_REPLACEMENT', path, message: 'Existing replacement content is ignored or untracked. Commit or reconcile it before adoption.' });
        }
        checkTracked(target, current);
        const action = JSON.stringify(current) === JSON.stringify(desired) ? 'match' : current.type === 'missing' ? 'create' : 'replace';
        const files: { path: string; before: Observation; after: Observation }[] = [];
        function changes(path: string, before: Observation, after: Observation) {
          if (before.type !== after.type && before.type !== 'missing' && after.type !== 'missing') {
            files.push({ path, before, after });
          } else if (before.type === 'directory' || after.type === 'directory') {
            const oldEntries = before.type === 'directory' ? before.entries : {};
            const newEntries = after.type === 'directory' ? after.entries : {};
            for (const name of [...new Set([...Object.keys(oldEntries), ...Object.keys(newEntries)])].sort()) changes(`${path}/${name}`, oldEntries[name] ?? { type: 'missing' }, newEntries[name] ?? { type: 'missing' });
          } else files.push({ path, before, after });
        }
        changes(target, current, desired);
        exact.push({ id: declaration.id, target, action, files });
      } else guidance.push({ id: declaration.id, targets, source: declaration.guidance, ...content(join(source.root, declaration.guidance)) });
    }
    for (const phase of ['fixes', 'checks'] as const) for (const declaration of resolved.declarations) {
      for (const operation of declaration[phase]) {
        operations.push({ declaration: declaration.id, phase, ...operation,
          prerequisite: { ...operation.prerequisite, status: 'not-checked' },
          script: content(join(source.root, operation.run.script)),
          resources: operation.run.resources.map(path => ({ path, content: observe(join(source.root, path)) })),
        });
      }
    }
    // Retain a normalized source with only the selected profile. The resolver
    // remains the sole interpreter when this source is used in a fresh checkout.
    const inputs: Record<string, Observation> = Object.create(null);
    const normalized = stringify({ ...validation.source, defaults: { declarations: {} }, profiles: {
      [options.profile]: { description: resolved.description, declarations: Object.fromEntries(resolved.declarations.map(({ id, ...declaration }) => [id, declaration])) },
    } });
    for (const declaration of resolved.declarations) {
      const paths = [declaration.kind === 'skill' ? declaration.source : 'exact' in declaration ? declaration.exact : declaration.guidance,
        ...[...declaration.fixes, ...declaration.checks].flatMap(operation => [operation.run.script, ...operation.run.resources])];
      for (const path of paths) inputs[path] = observe(join(source.root, path));
    }
    for (const name of readdirSync(source.root).sort()) if (/^licen[sc]e(?:[.-].*)?$/i.test(name)) inputs[name] = observe(join(source.root, name));
    const retired = previous ? previous.resolved.declarations.filter(old => !resolved.declarations.some(declaration => declaration.id === old.id)) : [];
    const report = {
      format: 'repo-standards/inspection/v1',
      selection: { cli: { package: '@lutzseverino/repo-standards', version: cliVersion }, standards: source.identity, profile: options.profile },
      source: validation.source, resolved, exact, guidance, operations, inputs, manifest: normalized,
      project: { root, head: head.status === 0 ? head.stdout.trim() : null, status: status.stdout, index: index.stdout, hidden, affected, productState, systemSkill },
      start: { eligible: blockers.length ? false : operations.length ? null : true, blockers, prerequisites: operations.length ? 'not-checked' : 'none' },
      ...(update ? { update, previousSelection: previous!.selection, retired } : {}),
    };
    return { ...report, identity: `sha256:${hash(JSON.stringify(report))}` };
  } finally { source.close(); }
}
