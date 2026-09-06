import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { foldPath } from './paths.js';
import { acquireSource, hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { validateSource } from './resolver.js';

interface Blocker { code: string; message: string; path?: string }
interface Content { sha256: string; executable: boolean; encoding: 'utf8' | 'base64'; content: string }
type Observation = { type: 'missing' } | ({ type: 'file' } & Content) | { type: 'directory'; entries: Record<string, Observation> } | { type: 'symlink'; target: string } | { type: 'unsafe'; obstacles?: Record<string, Observation> };

function content(path: string): Content {
  const bytes = readFileSync(path);
  const utf8 = bytes.toString('utf8');
  const encoding = Buffer.from(utf8).equals(bytes) ? 'utf8' : 'base64';
  return { sha256: hash(bytes), executable: (lstatSync(path).mode & 0o111) !== 0, encoding, content: encoding === 'utf8' ? utf8 : bytes.toString('base64') };
}

function observe(path: string): Observation {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return { type: 'symlink', target: readlinkSync(path) };
    if (stat.isFile()) return { type: 'file', ...content(path) };
    if (stat.isDirectory()) return { type: 'directory', entries: Object.fromEntries(readdirSync(path).sort().map(name => [name, observe(join(path, name))])) };
    return { type: 'unsafe' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { type: 'missing' };
    throw new ProductError('PROJECT_READ', `Cannot safely read project content: ${path}.`);
  }
}

function git(project: string, args: string[]) {
  const base = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', project];
  const options = { encoding: 'utf8' as const, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 32 * 1024 * 1024 };
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

function targetObservation(root: string, target: string, blockers: Blocker[]): Observation {
  let parent = root;
  const parts = target.split('/');
  for (const [index, part] of parts.entries()) {
    try {
      const aliases = readdirSync(parent).filter(name => foldPath(name) === foldPath(part) && name !== part);
      if (aliases.length) {
        blockers.push({ code: 'CASE_CONFLICT', path: target, message: `Target spelling conflicts with existing ${aliases.join(', ')}.` });
        return { type: 'unsafe', obstacles: Object.fromEntries(aliases.map(name => [name, observe(join(parent, name))])) };
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
  const observed = observe(parent);
  function unsafe(value: Observation): boolean {
    return value.type === 'symlink' || value.type === 'unsafe' || (value.type === 'directory' && Object.entries(value.entries).some(([name, child]) => name.toLowerCase() === '.git' || unsafe(child)));
  }
  if (unsafe(observed)) blockers.push({ code: 'UNSAFE_TARGET', path: target, message: 'Target tree contains a symbolic link, special file, or nested Git metadata.' });
  return observed;
}

export async function inspect(options: { source: string; standardsVersion: string; profile: string; project: string }, cliVersion: string) {
  if (process.versions.node.split('.')[0] !== '24') throw new ProductError('NODE_REQUIRED', 'Node.js 24 is required. Select Node.js 24 with your version manager or install it from https://nodejs.org/en/download, then retry.');
  const npm = spawnSync('npm', ['--version'], { cwd: homedir(), encoding: 'utf8', timeout: 10_000 });
  if (npm.error || npm.status !== 0 || !/^\d+\.\d+\.\d+/.test(npm.stdout.trim())) throw new ProductError('NPM_REQUIRED', 'npm is required. Reinstall the npm bundled with Node.js 24 from https://nodejs.org/en/download and ensure npm is on PATH.');
  const location = git(resolve(options.project), ['rev-parse', '--show-toplevel']);
  if (location.status !== 0) throw new ProductError('GIT_REQUIRED', 'Inspection requires a Git working tree. Run git init in your project first.');
  const root = realpathSync(location.stdout.trim());
  const head = git(root, ['rev-parse', '--verify', 'HEAD']);
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']);
  if (status.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot inspect Git status.');
  const blockers: Blocker[] = [];
  if (head.status !== 0) blockers.push({ code: 'NO_COMMIT', message: 'Create an initial commit before starting adoption.' });
  if (status.stdout) blockers.push({ code: 'DIRTY_PROJECT', message: 'Commit or reconcile all index, working tree, and untracked changes before starting adoption.' });
  const index = git(root, ['ls-files', '--stage', '-z']);
  if (index.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot inspect the Git index.');
  const flags = git(root, ['ls-files', '-v', '-z']);
  if (flags.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot inspect Git index flags.');
  const hidden = flags.stdout.split('\0').filter(entry => /^[a-zS] /.test(entry)).map(entry => entry.slice(2));
  for (const path of hidden) blockers.push({ code: 'HIDDEN_INDEX_STATE', path, message: 'Clear assume-unchanged or skip-worktree flags and reconcile local content before adoption; Git status may hide changes.' });
  const tracked = new Set(index.stdout.split('\0').filter(Boolean).map(entry => entry.slice(entry.indexOf('\t') + 1)));
  for (const entry of index.stdout.split('\0').filter(entry => entry.startsWith('160000 '))) blockers.push({ code: 'SUBMODULE_STATE', path: entry.slice(entry.indexOf('\t') + 1), message: 'Initial inspection cannot establish clean nested submodule state without running nested Git behavior.' });
  const productState = targetObservation(root, '.repo-standards', blockers);
  const systemSkill = targetObservation(root, '.agents/skills/adopt-standards', blockers);
  if (productState.type !== 'missing') blockers.push({ code: 'EXISTING_ADOPTION', path: '.repo-standards', message: 'This first-inspection command cannot establish ownership for existing product state. Use the project-pinned CLI when adoption support is available.' });
  if (systemSkill.type !== 'missing') blockers.push({ code: 'SYSTEM_SKILL_CONFLICT', path: '.agents/skills/adopt-standards', message: 'Existing reserved system-skill content requires established product ownership.' });
  const source = await acquireSource(options.source, options.standardsVersion, root);
  try {
    const validation = validateSource(source.root, cliVersion, source.paths);
    if (!validation.valid) throw new ProductError('INVALID_STANDARDS', 'The standards source is invalid or incompatible with this CLI.', validation.errors.map(error => ({ ...error, file: 'standards.yaml' })));
    const resolved = validation.profiles[options.profile];
    if (!resolved) throw new ProductError('UNKNOWN_PROFILE', `Unknown profile ${options.profile}. Available profiles: ${Object.keys(validation.profiles).join(', ')}.`);
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
        if (declaration.kind === 'skill' && current.type !== 'missing') blockers.push({ code: 'SKILL_CONFLICT', path: target, message: 'An existing skill has no established installed baseline for this selection. Reconcile the unrelated skill before adoption.' });
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
          if (before.type === 'directory' || after.type === 'directory') {
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
    const report = {
      format: 'repo-standards/inspection/v1',
      selection: { cli: { package: '@lutzseverino/repo-standards', version: cliVersion }, standards: source.identity, profile: options.profile },
      source: validation.source, resolved, exact, guidance, operations,
      project: { root, head: head.status === 0 ? head.stdout.trim() : null, status: status.stdout, index: index.stdout, hidden, affected, productState, systemSkill },
      start: { eligible: blockers.length ? false : operations.length ? null : true, blockers, prerequisites: operations.length ? 'not-checked' : 'none' },
    };
    return { ...report, identity: `sha256:${hash(JSON.stringify(report))}` };
  } finally { source.close(); }
}
