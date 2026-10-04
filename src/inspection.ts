import { spawnSync } from 'node:child_process';
import { readdirSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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
import { judgeTargetOwnership, type OwnedTarget, type TargetKind } from './target-ownership.js';
import { declarationLink, declarationTargets, installationTarget, installedSystemSkills, linkTextAt } from './targets.js';
import { unifiedDiff } from './unified-diff.js';
import { compareUpdate } from './update-comparison.js';
import { dictionary } from './records.js';

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

// The file changes that turn a target's current content into its candidate,
// down to each differing file.
function changedFiles(target: string, current: Observation, desired: Observation) {
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
  return files;
}

export function hiddenIndexPaths(root: string) {
  const flags = git(root, ['ls-files', '-v', '-z']);
  if (flags.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot inspect Git index flags.');
  return flags.stdout.split('\0').filter(entry => /^[a-zS] /.test(entry)).map(entry => entry.slice(2));
}

// The system skills this exact CLI installs, by target. Start verifies that
// the acquired runtime package carries the same inventories.
export function packagedSystemSkills(): Record<string, Observation> {
  return Object.fromEntries(installedSystemSkills.map(({ name, target }) => [target, observe(fileURLToPath(new URL(`../skills/${name}`, import.meta.url)))]));
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
// needs no bytes. The project root and the Git state are recorded for
// provenance, and the Git state for detecting Git changes during the run;
// neither is part of the report or its identity, so an inspection made in any
// checkout of the same content confirms a start in another. An inspection of
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
    for (const entry of index.stdout.split('\0').filter(entry => entry.startsWith('160000 '))) blockers.push({ code: 'SUBMODULE_STATE', path: entry.slice(entry.indexOf('\t') + 1), message: 'Initial inspection cannot establish clean nested submodule state without running nested Git behavior.' });
    const productState = previous ? productStateObservation(root, blockers) : targetObservation(root, '.repo-standards', blockers);
    // Each target is observed once, keeping its safety blockers for its block;
    // a skill link is observed as a link with the text the product writes there.
    const observed = new Map<string, { value: Observation; safety: Blocker[] }>();
    function observeTarget(path: string, link?: string) {
      let target = observed.get(path);
      if (!target) {
        const safety: Blocker[] = [];
        target = { value: targetObservation(root, path, safety, undefined, link), safety };
        observed.set(path, target);
      }
      return target.value;
    }
    const systemSkills = Object.fromEntries(installedSystemSkills.map(({ target }) => [target, observeTarget(target)]));
    // The skill link of every installed skill, system or author, by path.
    const skillLinks: Record<string, Observation> = dictionary();
    const observeLink = (path: string) => { skillLinks[path] = observeTarget(path, linkTextAt(path)); };
    for (const { link } of installedSystemSkills) observeLink(link);
    if (!previous && productState.type !== 'missing') blockers.push({ code: 'EXISTING_ADOPTION', path: '.repo-standards', message: 'Existing product state blocks initial adoption. Inspect the current selection with the project-pinned CLI and no source flags.' });
    const validation = validateSource(source.root, cliVersion, source.paths, retainedSource?.manifest);
    if (!validation.valid) throw new ProductError('INVALID_STANDARDS', 'The standards source is invalid or incompatible with this CLI.', validation.errors.map(error => ({ ...error, file: relative(source.root, error.file) })));
    const profile = validation.profiles[options.profile];
    if (!profile) throw new ProductError('UNKNOWN_PROFILE', `Unknown profile ${options.profile}. Available profiles: ${Object.keys(validation.profiles).join(', ')}.`);
    const discoveryDeclarations = profile.declarations.filter(declaration => 'discovery' in declaration);
    const scopeObservation = discoveryDeclarations.length ? observeScope(root) : undefined;
    // The request binds what discovery reads: the selection, the project
    // observation, and the durable product state it excludes from that
    // observation. Git HEAD, the index, and the project root are not bound.
    const requestIdentity = scopeObservation ? `sha256:${hash(JSON.stringify({ selection: { cliVersion, standards: source.identity, profile: options.profile }, productState: hashInventory(productState), observation: scopeObservation }))}` : undefined;
    const scope = validateScope({ root, sourceResolved: profile, observation: scopeObservation, ...(options.scope ? { proposalPath: options.scope } : {}) });
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
    const inputs: Record<string, Observation> = dictionary();
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
    const comparison = previous ? compareUpdate(previous, { selection, declarations: profile.declarations, resolved: resolved.declarations, inputs }, productState) : undefined;
    if (comparison) blockers.push(...comparison.blockers);
    const guidance = [];
    const operations = [];
    const affected: Record<string, Observation> = dictionary();
    const desiredExact: Record<string, Observation> = dictionary();
    // Each declared target's type blockers, in resolved-declaration order.
    // Guidance targets are not installation targets and have no ownership.
    // A skill's link follows its skill.
    const declared: { path: string; typeBlockers: Blocker[]; owned: boolean }[] = [];
    const installed: { id: string; target: string; kind: 'file' | 'skill'; link?: string }[] = [];
    for (const declaration of resolved.declarations) {
      const { paths, directories } = declarationTargets(declaration);
      const targets = [...paths, ...directories];
      const installationPath = installationTarget(declaration);
      const link = declarationLink(declaration);
      for (const target of targets) {
        const current = observeTarget(target);
        affected[target] = current;
        const expectsDirectory = directories.includes(target);
        declared.push({ path: target, owned: installationPath !== undefined,
          typeBlockers: (expectsDirectory && current.type === 'file') || (!expectsDirectory && current.type === 'directory')
            ? [{ code: 'TARGET_TYPE', path: target, message: `This declaration requires a ${expectsDirectory ? 'directory' : 'file'} at its target.` }] : [] });
      }
      if (link) {
        observeLink(link);
        declared.push({ path: link, owned: true, typeBlockers: [] });
      }
      if (declaration.kind === 'skill' || 'exact' in declaration) {
        desiredExact[installationPath!] = observe(join(source.root, declaration.kind === 'skill' ? declaration.source : declaration.exact));
        installed.push({ id: declaration.id, target: installationPath!, kind: declaration.kind === 'skill' ? 'skill' : 'file', ...link ? { link } : {} });
      } else guidance.push({ id: declaration.id, targets, source: declaration.guidance, ...fileReference(join(source.root, declaration.guidance)) });
    }
    // Installation targets: the system skills, each exact file and skill the
    // selection declares, the skill link of each of those skills, and each
    // recorded target, merged by path. Target ownership decides what happens to
    // a recorded target the selection no longer installs.
    const ownedTargets = new Map<string, OwnedTarget>();
    const systemCandidates = packagedSystemSkills();
    for (const { target } of installedSystemSkills) ownedTargets.set(target, { path: target, kind: 'system-skill', current: systemSkills[target]!, candidate: systemCandidates[target]! });
    for (const { target, kind } of installed) ownedTargets.set(target, { path: target, kind, current: affected[target]!, candidate: desiredExact[target]! });
    for (const [path, current] of Object.entries(skillLinks)) ownedTargets.set(path, { path, kind: 'skill-link', current, candidate: { type: 'symlink', target: linkTextAt(path)! } });
    const recordedTargets: { path: string; kind: TargetKind; baseline: NonNullable<OwnedTarget['baseline']> }[] = [];
    if (previous) {
      const { baselines, skills, links } = previous.state;
      const directories = Object.keys(skills);
      for (const directory of directories) recordedTargets.push({ path: directory, kind: installedSystemSkills.some(({ target }) => target === directory) ? 'system-skill' : 'skill',
        baseline: { files: Object.fromEntries(Object.entries(baselines).filter(([path]) => path.startsWith(directory + '/'))), inventory: skills[directory]! } });
      for (const [path, value] of Object.entries(baselines)) if (!directories.some(directory => path.startsWith(directory + '/'))) recordedTargets.push({ path, kind: 'file', baseline: { files: { [path]: value } } });
      for (const [path, link] of Object.entries(links)) recordedTargets.push({ path, kind: 'skill-link', baseline: { files: {}, link } });
    }
    const baselineOnly = recordedTargets.filter(({ path }) => !ownedTargets.has(path)).map(({ path }) => path).sort();
    for (const { path, kind, baseline } of recordedTargets) {
      const target = ownedTargets.get(path);
      if (target) target.baseline = baseline;
      else ownedTargets.set(path, { path, kind, current: observeTarget(path, baseline.link), baseline });
    }
    const contextual = declared.filter(({ owned }) => !owned).map(({ path }) => path);
    const ownership = new Map(judgeTargetOwnership({ tracked, contextual, targets: [...ownedTargets.values()] }).map(verdict => [verdict.path, verdict]));
    // One block per target: its safety blockers, reported once for its path,
    // then its type blockers and its ownership blockers.
    // The targets whose replacement or removal discards edits are listed in
    // the same order.
    const reported = new Set<string>();
    const discardedEdits: string[] = [];
    for (const { path, typeBlockers, owned } of [...installedSystemSkills.flatMap(({ target, link }) => [target, link].map(path => ({ path, typeBlockers: [], owned: true }))), ...declared,
      ...baselineOnly.map(path => ({ path, typeBlockers: [], owned: true }))]) {
      if (!reported.has(path)) blockers.push(...observed.get(path)!.safety);
      const verdict = owned ? ownership.get(path) : undefined;
      if (verdict?.discardsEdits && !reported.has(path)) discardedEdits.push(path);
      reported.add(path);
      blockers.push(...typeBlockers, ...verdict?.blockers ?? []);
    }
    // Each skill's link is listed with its skill, by path and action.
    const linkAction = (link: string) => ({ target: link, action: ownership.get(link)!.action! });
    const exact = installed.map(({ id, target, link }) => ({ id, target, action: ownership.get(target)!.action!, files: changedFiles(target, affected[target]!, desiredExact[target]!), ...link ? { link: linkAction(link) } : {} }));
    // Each removed target, including a skill link, is attributed to the
    // declaration that installed it.
    const removed = previous ? baselineOnly.filter(path => ownership.get(path)!.action === 'replace').map(target => ({
      id: previous.resolved.declarations.find(declaration => installationTarget(declaration) === target || declarationLink(declaration) === target)!.id,
      target, files: changedFiles(target, observed.get(target)!.value, { type: 'missing' }),
    })) : undefined;
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
    const changedScope = previous && (!discoveryDeclarations.length || proposal) ? scopeChanges(previous.scopeEvidence, { sourceResolved: profile, resolved }) : undefined;
    const report = {
      format: formats.inspection,
      ...(discovery ? { discovery, sourceResolved: profile } : {}),
      selection,
      source: validation.source, resolved, exact, guidance, operations,
      inputs: Object.fromEntries(Object.entries(inputs).map(([path, value]) => [path, hashInventory(value)])),
      manifest: { sha256: hash(normalized), executable: false },
      project: { affected: Object.fromEntries(Object.entries(affected).map(([path, value]) => [path, hashInventory(value)])),
        productState: hashInventory(productState),
        systemSkills: Object.fromEntries(Object.entries(systemSkills).map(([path, value]) => [path, hashInventory(value)])),
        skillLinks: Object.fromEntries(Object.entries(skillLinks).map(([path, value]) => [path, hashInventory(value)])) },
      systemSkills: installedSystemSkills.map(({ name, target, link }) => ({ name, target, action: ownership.get(target)!.action!, link: linkAction(link) })),
      ...(removed ? { removed } : {}),
      discardedEdits,
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
      materials: { exact: desiredExact, inputs, manifest: normalized, systemSkills: systemCandidates },
      root,
      git: { head: head.status === 0 ? head.stdout.trim() : null, index: hash(index.stdout), hidden },
      recorded: previous,
    };
  } finally { source.close(); }
}
