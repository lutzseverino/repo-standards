import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { foldPath } from './paths.js';
import { acquireSource, hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { validateSource } from './resolver.js';
import { stringify } from 'yaml';
import { decodeRecordedState } from './recorded-state.js';
import { latestRetainedScopeRun, type ScopeHistoryRun } from './scope-evidence.js';
import { observeScope } from './scope-observation.js';
import { validateScope } from './scope.js';
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

// The system skill this exact CLI installs. Start verifies that the acquired
// runtime package carries the same inventory.
export function packagedSystemSkill() {
  return observe(fileURLToPath(new URL('../skills/adopt-standards', import.meta.url)));
}

// An existing target whose complete observation (inventory, bytes and modes)
// equals the supplied content is claimed without rewriting.
function plannedAction(current: Observation, desired: Observation) {
  return JSON.stringify(current) === JSON.stringify(desired) ? 'match' : current.type === 'missing' ? 'create' : 'replace';
}

export interface InspectOptions { source: string; standardsVersion: string; profile: string; project: string; scope?: string }

// The selection components an update can change, in reporting order.
const selectionComponents = ['cli', 'standards', 'source', 'profile'] as const;
type SelectionComponent = typeof selectionComponents[number];

interface RecordedAdoption {
  selection: RecordedSelection;
  baselines: Record<string, Pick<Content, 'sha256' | 'executable'>>;
  skills: Record<string, string[]>;
  resolved: { declarations: { id: string; kind: string; target?: string; name?: string }[] };
  files: Record<string, Pick<Content, 'sha256' | 'executable'>>;
  historicalScope?: ScopeHistoryRun;
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
  let historicalScope: RecordedAdoption['historicalScope'];
  const historyPath = '.repo-standards/inputs/scope-history.json';
  if (Object.hasOwn(lock.files, historyPath)) {
    try {
      historicalScope = latestRetainedScopeRun(JSON.parse(readFileSync(join(root, historyPath), 'utf8')));
    } catch (error) {
      // The scope-evidence module reports its own integrity failures; only a
      // file this reader cannot parse becomes an unreadable history.
      if (error instanceof ProductError) throw error;
      throw new ProductError('STATE_INTEGRITY', 'Recorded discovery history cannot be read. Restore the committed product state.');
    }
  }
  return { selection: lock.selection, baselines: state.baselines, skills: state.skills, resolved, files: lock.files,
    ...(historicalScope ? { historicalScope } : {}) };
}

export function inventoryPaths(value: Observation): string[] {
  const result: string[] = [];
  function visit(prefix: string, child: Observation) {
    if (child.type === 'file') result.push(prefix);
    else if (child.type === 'directory') {
      if (prefix) result.push(prefix + '/');
      for (const [name, entry] of Object.entries(child.entries)) visit(prefix ? `${prefix}/${name}` : name, entry);
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

export function observeProductState(root: string) {
  const blockers: Blocker[] = [];
  const observed = productStateObservation(root, blockers);
  if (blockers.length) throw new ProductError('FINAL_INTEGRITY', 'Unsafe product state.', blockers);
  return observed;
}

export function productInventory(root: string): string[] {
  return inventoryPaths(observeProductState(root)).map(path => `.repo-standards/${path}`);
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
    function checkTracked(path: string, value: Observation) {
      if (value.type === 'directory') {
        if (Object.keys(value.entries).length === 0) blockers.push({ code: 'UNTRACKED_REPLACEMENT', path, message: 'An existing empty directory has no recoverable Git baseline.' });
        for (const [name, child] of Object.entries(value.entries)) checkTracked(`${path}/${name}`, child);
      } else if (value.type !== 'missing' && !tracked.has(path)) blockers.push({ code: 'UNTRACKED_REPLACEMENT', path, message: 'Existing replacement content is ignored or untracked. Commit or reconcile it before adoption.' });
    }
    for (const entry of index.stdout.split('\0').filter(entry => entry.startsWith('160000 '))) blockers.push({ code: 'SUBMODULE_STATE', path: entry.slice(entry.indexOf('\t') + 1), message: 'Initial inspection cannot establish clean nested submodule state without running nested Git behavior.' });
    const productState = previous ? productStateObservation(root, blockers) : targetObservation(root, '.repo-standards', blockers);
    const systemSkill = targetObservation(root, '.agents/skills/adopt-standards', blockers);
    if (!previous && productState.type !== 'missing') blockers.push({ code: 'EXISTING_ADOPTION', path: '.repo-standards', message: 'Existing product state blocks initial adoption. Inspect the current selection with the project-pinned CLI and no source flags.' });
    const systemSkillAction = plannedAction(systemSkill, packagedSystemSkill());
    if (!previous) {
      if (systemSkillAction === 'replace') blockers.push({ code: 'SYSTEM_SKILL_CONFLICT', path: '.agents/skills/adopt-standards', message: 'Existing reserved system-skill content differs from the skill packaged with this exact CLI and has no established product ownership.' });
      checkTracked('.agents/skills/adopt-standards', systemSkill);
    }
    const validation = validateSource(source.root, cliVersion, source.paths, retained?.manifest);
    if (!validation.valid) throw new ProductError('INVALID_STANDARDS', 'The standards source is invalid or incompatible with this CLI.', validation.errors.map(error => ({ ...error, file: 'standards.yaml' })));
    const profile = validation.profiles[options.profile];
    if (!profile) throw new ProductError('UNKNOWN_PROFILE', `Unknown profile ${options.profile}. Available profiles: ${Object.keys(validation.profiles).join(', ')}.`);
    const requestedAction = previous ? 'update' : 'adopt';
    const discoveryDeclarations = profile.declarations.filter(declaration => 'discovery' in declaration);
    const scopeObservation = discoveryDeclarations.length ? observeScope(root) : undefined;
    const requestIdentity = scopeObservation ? `sha256:${hash(JSON.stringify({ selection: { cliVersion, standards: source.identity, profile: options.profile }, action: requestedAction, root, head: head.stdout, index: index.stdout, hidden, observation: scopeObservation }))}` : undefined;
    const scope = validateScope({ root, sourceResolved: profile, request: requestIdentity,
      ...(options.scope ? { proposalPath: options.scope } : {}) });
    const { proposal, resolved, named, namedObservation, absence } = scope;
    blockers.push(...scope.blockers);
    const discovery = scopeObservation ? {
      identity: requestIdentity!,
      ...(proposal ? { proposal, absence, namedObservation } : {}),
      declarations: discoveryDeclarations.map(declaration => ({ id: declaration.id, source: declaration.discovery, ...content(join(source.root, declaration.discovery)) })),
      evidence: scopeObservation.evidence,
      observation: scopeObservation,
    } : undefined;
    // An update against an established adoption names every changed selection
    // component together; an unchanged selection is re-applied.
    let update: SelectionComponent[] | undefined;
    if (previous) {
      const sameSource = source.identity.repository.toLowerCase() === previous.selection.standards.repository.toLowerCase();
      if (sameSource && source.identity.version === previous.selection.standards.version && source.identity.commit !== previous.selection.standards.commit) {
        throw new ProductError('MOVED_TAG', `The recorded ${source.identity.version} tag previously resolved to ${previous.selection.standards.commit}; it now resolves to ${source.identity.commit}. Choose a new immutable version.`);
      }
      const changed: Record<SelectionComponent, boolean> = {
        cli: cliVersion !== previous.selection.cli.version,
        standards: source.identity.version !== previous.selection.standards.version || source.identity.commit !== previous.selection.standards.commit,
        source: !sameSource,
        profile: options.profile !== previous.selection.profile,
      };
      update = selectionComponents.filter(component => changed[component]);
      for (const [path, expected] of Object.entries(previous.baselines)) {
        const actual = targetObservation(root, path, blockers);
        if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) blockers.push({ code: 'INSTALLED_CONTENT_EDITED', path, message: 'Installed exact content differs from its last-complete baseline. Reconcile it before updating.' });
      }
      for (const [path, expected] of Object.entries(previous.skills)) {
        const actual = targetObservation(root, path, blockers);
        if (!matchesInventory(actual, expected)) blockers.push({ code: 'INSTALLED_CONTENT_EDITED', path, message: 'The installed skill inventory differs from its last-complete baseline. Reconcile added or removed resources before updating.' });
      }
      for (const [path, expected] of Object.entries(previous.files).filter(([path]) => path.startsWith('.repo-standards/'))) {
        const actual = targetObservation(root, path, blockers);
        if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) blockers.push({ code: 'STATE_INTEGRITY', path, message: 'Retained product material differs from its recorded baseline. Restore it before updating.' });
      }
      const expectedProductFiles = [...Object.keys(previous.files).filter(path => path.startsWith('.repo-standards/')), '.repo-standards/lock.json', '.repo-standards/state.json'].sort();
      if (!matchesInventory(productState, expectedProductFiles.map(path => path.slice('.repo-standards/'.length)))) {
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
        const action = plannedAction(current, desired);
        if (declaration.kind === 'skill' && action === 'replace' && !(retained?.ownedSkills ?? new Set(Object.keys(previous?.skills ?? {}))).has(target)) blockers.push({ code: 'SKILL_CONFLICT', path: target, message: 'An existing skill differs from the supplied skill and has no established installed baseline for this selection. Reconcile the unrelated skill before adoption.' });
        checkTracked(target, current);
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
    if (!proposal) for (const declaration of discoveryDeclarations) guidance.push({ id: declaration.id, targets: [], discoveryRequired: true, source: declaration.guidance, ...content(join(source.root, declaration.guidance)) });
    for (const phase of ['fixes', 'checks'] as const) for (const declaration of profile.declarations) {
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
      [options.profile]: { description: profile.description, declarations: Object.fromEntries(profile.declarations.map(({ id, ...declaration }) => [id, declaration])) },
    } });
    for (const declaration of profile.declarations) {
      const paths = [declaration.kind === 'skill' ? declaration.source : 'exact' in declaration ? declaration.exact : declaration.guidance,
        ...('discovery' in declaration ? [declaration.discovery] : []),
        ...[...declaration.fixes, ...declaration.checks].flatMap(operation => [operation.run.script, ...operation.run.resources])];
      for (const path of paths) inputs[path] = observe(join(source.root, path));
    }
    for (const name of readdirSync(source.root).sort()) if (/^licen[sc]e(?:[.-].*)?$/i.test(name)) inputs[name] = observe(join(source.root, name));
    const retired = previous ? previous.resolved.declarations.filter(old => !resolved.declarations.some(declaration => declaration.id === old.id)) : [];
    let scopeChanges: { id: string; additions: string[]; removals: string[] }[] | undefined;
    if (previous && (!discoveryDeclarations.length || proposal)) {
      const priorIds = previous.historicalScope?.sourceResolved?.declarations?.filter(declaration => declaration.discovery).map(declaration => declaration.id) ?? [];
      const currentIds = discoveryDeclarations.map(declaration => declaration.id);
      scopeChanges = [...new Set([...priorIds, ...currentIds])].sort().flatMap(id => {
        const oldDeclaration = previous.historicalScope?.resolved?.declarations?.find(declaration => declaration.id === id);
        const newDeclaration = resolved.declarations.find(declaration => declaration.id === id);
        const oldPaths = priorIds.includes(id) && oldDeclaration?.kind === 'repository' ? oldDeclaration.targets?.paths ?? [] : [];
        const newPaths = currentIds.includes(id) && newDeclaration?.kind === 'repository' ? newDeclaration.targets.paths : [];
        const additions = newPaths.filter(path => !oldPaths.includes(path)).sort();
        const removals = oldPaths.filter(path => !newPaths.includes(path)).sort();
        return additions.length || removals.length ? [{ id, additions, removals }] : [];
      });
    }
    const report = {
      format: discovery ? 'repo-standards/inspection/v2' : 'repo-standards/inspection/v1',
      ...(discovery ? { discovery, sourceResolved: profile } : {}),
      selection: { cli: { package: '@lutzseverino/repo-standards', version: cliVersion }, standards: source.identity, profile: options.profile },
      source: validation.source, resolved, exact, guidance, operations, inputs, manifest: normalized,
      project: { root, head: head.status === 0 ? head.stdout.trim() : null, status: status.stdout, index: index.stdout, hidden, affected, productState, systemSkill },
      systemSkill: { target: '.agents/skills/adopt-standards', action: systemSkillAction },
      start: { eligible: blockers.length ? false : operations.length ? null : true, blockers, prerequisites: operations.length ? 'not-checked' : 'none' },
      ...(update ? { update, previousSelection: previous!.selection, retired } : {}),
      ...(scopeChanges ? { scopeChanges } : {}),
    };
    if (scopeObservation) {
      const finalHead = git(root, ['rev-parse', '--verify', 'HEAD'], undefined, 30_000);
      const finalIndex = git(root, ['ls-files', '--stage', '-z'], undefined, 30_000);
      const finalStatus = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all'], undefined, 30_000);
      if (finalIndex.status !== 0 || finalStatus.status !== 0) throw new ProductError('OBSERVATION_READ', 'Cannot completely recheck Git project state.');
      if (finalHead.status !== head.status || finalHead.stdout !== head.stdout || finalIndex.stdout !== index.stdout || finalStatus.stdout !== status.stdout || JSON.stringify(hiddenIndexPaths(root)) !== JSON.stringify(hidden)) throw new ProductError('OBSERVATION_UNSTABLE', 'Git project state changed during discovery inspection. Inspect again.');
    }
    if (scopeObservation && JSON.stringify(scopeObservation) !== JSON.stringify(observeScope(root))) throw new ProductError('OBSERVATION_UNSTABLE', 'Discovery observation changed during inspection. Inspect again.');
    if (namedObservation && JSON.stringify(namedObservation) !== JSON.stringify(observeScope(root, named))) throw new ProductError('OBSERVATION_UNSTABLE', 'Named scope observations changed during inspection. Inspect again.');
    return { ...report, identity: `sha256:${hash(JSON.stringify(report))}` };
  } finally { source.close(); }
}
