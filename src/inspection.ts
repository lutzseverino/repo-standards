import { spawnSync } from 'node:child_process';
import { readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { acquireSource, hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { formats } from './formats.js';
import { content, git, hashInventory, inventoryPaths, observe, targetBoundaryObservation, targetObservation } from './observation.js';
import type { Blocker, HashInventory, Observation } from './observation.js';
import { validateSource } from './resolver.js';
import { stringify } from 'yaml';
import { readRecordedAdoption, type RecordedAdoption } from './recorded-state.js';
import { scopeChanges } from './scope-evidence.js';
import { observeScope } from './scope-observation.js';
import { validateScope } from './scope.js';
import { unifiedDiff } from './unified-diff.js';
import { compareUpdate } from './update-comparison.js';

// Guidance, discovery guidance and scripts are referenced by path and hash.
function fileReference(path: string) {
  const { sha256, executable } = content(path);
  return { sha256, executable };
}

// Text is lossless UTF-8 without NUL bytes; anything else is binary.
function text(value: Observation) {
  return value.type === 'file' && value.encoding === 'utf8' && !value.content.includes('\0') ? value.content : undefined;
}

// A changed exact file carries a unified diff when both sides are text, and
// only its before-and-after hashes when either side is binary.
function exactDelta(path: string, before: Observation, after: Observation) {
  if ((before.type !== 'file' && before.type !== 'missing') || (after.type !== 'file' && after.type !== 'missing')) return {};
  if (before.type === 'file' ? after.type === 'file' && after.sha256 === before.sha256 : after.type === 'missing') return {};
  const [oldText, newText] = [text(before), text(after)];
  if ((before.type === 'file' && oldText === undefined) || (after.type === 'file' && newText === undefined)) return { binary: true };
  const diff = unifiedDiff(path, oldText, newText);
  return diff === undefined ? {} : { diff };
}

export function hiddenIndexPaths(root: string) {
  const flags = git(root, ['ls-files', '-v', '-z']);
  if (flags.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot inspect Git index flags.');
  return flags.stdout.split('\0').filter(entry => /^[a-zS] /.test(entry)).map(entry => entry.slice(2));
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

export async function inspect(options: InspectOptions, cliVersion: string) {
  return (await inspectForStart(options, cliVersion)).report;
}

// Start reads the materials it installs from the same acquisition and
// observation as the report whose identity was confirmed, so the report itself
// needs no bytes. The Git state is recorded for provenance and for detecting
// Git changes during the run; it is not part of the identity. An inspection of
// retained standards passes the recorded adoption it read them from.
export async function inspectForStart(options: InspectOptions, cliVersion: string, retained?: RecordedAdoption) {
  if (process.versions.node.split('.')[0] !== '24') throw new ProductError('NODE_REQUIRED', 'Node.js 24 is required. Select Node.js 24 with your version manager or install it from https://nodejs.org/en/download, then retry.');
  const npm = spawnSync('npm', ['--version'], { cwd: homedir(), encoding: 'utf8', timeout: 10_000 });
  if (npm.error || npm.status !== 0 || !/^\d+\.\d+\.\d+/.test(npm.stdout.trim())) throw new ProductError('NPM_REQUIRED', 'npm is required. Reinstall the npm bundled with Node.js 24 from https://nodejs.org/en/download and ensure npm is on PATH.');
  const location = git(resolve(options.project), ['rev-parse', '--show-toplevel']);
  if (location.status !== 0) throw new ProductError('GIT_REQUIRED', 'Inspection requires a Git working tree. Run git init in your project first.');
  const root = realpathSync(location.stdout.trim());
  const previous = retained ?? readRecordedAdoption(root);
  const retainedSource = retained?.source();
  const source = retainedSource ?? await acquireSource(options.source, options.standardsVersion, root);
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
    const validation = validateSource(source.root, cliVersion, source.paths, retainedSource?.manifest);
    if (!validation.valid) throw new ProductError('INVALID_STANDARDS', 'The standards source is invalid or incompatible with this CLI.', validation.errors.map(error => ({ ...error, file: 'standards.yaml' })));
    const profile = validation.profiles[options.profile];
    if (!profile) throw new ProductError('UNKNOWN_PROFILE', `Unknown profile ${options.profile}. Available profiles: ${Object.keys(validation.profiles).join(', ')}.`);
    const discoveryDeclarations = profile.declarations.filter(declaration => 'discovery' in declaration);
    const scopeObservation = discoveryDeclarations.length ? observeScope(root) : undefined;
    // The request binds what discovery reads: the selection, the project
    // observation, and the durable product state it excludes from that
    // observation. Git HEAD and the index are not bound.
    const requestIdentity = scopeObservation ? `sha256:${hash(JSON.stringify({ selection: { cliVersion, standards: source.identity, profile: options.profile }, root, productState: hashInventory(productState), observation: scopeObservation }))}` : undefined;
    const scope = validateScope({ root, sourceResolved: profile, request: requestIdentity,
      ...(options.scope ? { proposalPath: options.scope } : {}) });
    const { proposal, resolved, named, namedObservation, absence } = scope;
    blockers.push(...scope.blockers);
    const discovery = scopeObservation ? {
      identity: requestIdentity!,
      ...(proposal ? { proposal, absence, namedObservation } : {}),
      declarations: discoveryDeclarations.map(declaration => ({ id: declaration.id, source: declaration.discovery, ...fileReference(join(source.root, declaration.discovery)) })),
      evidence: scopeObservation.evidence,
      observation: scopeObservation,
    } : undefined;
    const selection = { cli: { package: '@lutzseverino/repo-standards', version: cliVersion }, standards: source.identity, profile: options.profile };
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
    const comparison = previous ? compareUpdate(previous, { selection, declarations: profile.declarations, resolved: resolved.declarations, inputs }, { root, productState }) : undefined;
    if (comparison) blockers.push(...comparison.blockers);
    const exact = [];
    const guidance = [];
    const operations = [];
    const affected: Record<string, Observation> = Object.create(null);
    const desiredExact: Record<string, Observation> = Object.create(null);
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
        desiredExact[target] = desired;
        const current = affected[target]!;
        const action = plannedAction(current, desired);
        if (declaration.kind === 'skill' && action === 'replace' && !Object.hasOwn(previous?.state.skills ?? {}, target)) blockers.push({ code: 'SKILL_CONFLICT', path: target, message: 'An existing skill differs from the supplied skill and has no established installed baseline for this selection. Reconcile the unrelated skill before adoption.' });
        checkTracked(target, current);
        const files: { path: string; before: HashInventory; after: HashInventory; diff?: string; binary?: boolean }[] = [];
        function changes(path: string, before: Observation, after: Observation) {
          if (before.type !== after.type && before.type !== 'missing' && after.type !== 'missing') {
            files.push({ path, before: hashInventory(before), after: hashInventory(after) });
          } else if (before.type === 'directory' || after.type === 'directory') {
            const oldEntries = before.type === 'directory' ? before.entries : {};
            const newEntries = after.type === 'directory' ? after.entries : {};
            for (const name of [...new Set([...Object.keys(oldEntries), ...Object.keys(newEntries)])].sort()) changes(`${path}/${name}`, oldEntries[name] ?? { type: 'missing' }, newEntries[name] ?? { type: 'missing' });
          } else files.push({ path, before: hashInventory(before), after: hashInventory(after), ...exactDelta(path, before, after) });
        }
        changes(target, current, desired);
        exact.push({ id: declaration.id, target, action, files });
      } else guidance.push({ id: declaration.id, targets, source: declaration.guidance, ...fileReference(join(source.root, declaration.guidance)) });
    }
    if (!proposal) for (const declaration of discoveryDeclarations) guidance.push({ id: declaration.id, targets: [], discoveryRequired: true, source: declaration.guidance, ...fileReference(join(source.root, declaration.guidance)) });
    for (const phase of ['fixes', 'checks'] as const) for (const declaration of profile.declarations) {
      for (const operation of declaration[phase]) {
        operations.push({ declaration: declaration.id, phase, ...operation,
          prerequisite: { ...operation.prerequisite, status: 'not-checked' },
          script: { path: operation.run.script, ...fileReference(join(source.root, operation.run.script)) },
          resources: operation.run.resources.map(path => ({ path, ...hashInventory(observe(join(source.root, path))) })),
        });
      }
    }
    const changedScope = previous && (!discoveryDeclarations.length || proposal) ? scopeChanges(previous.scopeHistory?.at(-1), { sourceResolved: profile, resolved }) : undefined;
    const report = {
      format: formats.inspection,
      ...(discovery ? { discovery, sourceResolved: profile } : {}),
      selection,
      source: validation.source, resolved, exact, guidance, operations,
      inputs: Object.fromEntries(Object.entries(inputs).map(([path, value]) => [path, hashInventory(value)])),
      manifest: { sha256: hash(normalized), executable: false },
      project: { root, affected: Object.fromEntries(Object.entries(affected).map(([path, value]) => [path, hashInventory(value)])),
        productState: hashInventory(productState), systemSkill: hashInventory(systemSkill) },
      systemSkill: { target: '.agents/skills/adopt-standards', action: systemSkillAction },
      start: { eligible: blockers.length ? false : operations.length ? null : true, blockers, prerequisites: operations.length ? 'not-checked' : 'none' },
      ...comparison?.report,
      ...(changedScope ? { scopeChanges: changedScope } : {}),
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
    return {
      report: { ...report, identity: `sha256:${hash(JSON.stringify(report))}` },
      materials: { exact: desiredExact, inputs, manifest: normalized, systemSkill },
      git: { head: head.status === 0 ? head.stdout.trim() : null, index: hash(index.stdout), hidden },
      recorded: previous,
    };
  } finally { source.close(); }
}
