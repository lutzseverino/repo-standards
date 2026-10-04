import { cpSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { hash } from './acquisition.js';
import { baselines, file, flatten, ignore, inventory, json, lockPath, remove, safe, safeDirectory, stagedFiles, verifyFiles, write, writeLink } from './adoption-files.js';
import type { Baseline, Files } from './adoption-files.js';
import type { AdoptionRunSession, Run } from './adoption-run.js';
import { ProductError } from './errors.js';
import { formats } from './formats.js';
import { hiddenIndexPaths, observeProductState, productInventory, type inspectForStart } from './inspection.js';
import { git, hashInventory, inventoryPaths, matchesInventory, observe, plannedInventory, type Content, type HashInventory, type Observation } from './observation.js';
import { committedScopeEvidence, type ScopeRun } from './scope-evidence.js';
import type { Scope } from './scope.js';
import { installedSystemSkills, linkTextAt, skillTarget } from './targets.js';
import { completedEvidence, type Delta } from './work-evidence.js';
import { dictionary, record } from './records.js';

// Installation is the confirmed plan of an adoption run's exact content,
// retained inputs, durable product state and runtime, planned from one
// confirmed inspection. It installs itself over interruptions, verifies itself
// at run time, and produces the durable state and lock a completion writes.
// Final integrity is this run-time check of the run's planned installation; the
// recorded adoption reader separately verifies the committed baseline a run
// starts from. The run session saves the value with the run and hands it back
// on resume, leaving interpreting the plan to this module.

type StartInspection = Awaited<ReturnType<typeof inspectForStart>>;
const retainedSource = '.repo-standards/inputs/source';
const lockFile = '.repo-standards/lock.json';
const stateFile = '.repo-standards/state.json';
const incompleteState = '.repo-standards/local/incomplete-state.json';
const productState = '.repo-standards';

export interface Installation {
  report: StartInspection['report']; git: StartInspection['git']; files: Files; skills: Record<string, string[]>;
  // The skill link of every installed skill, and each recorded link the run
  // removes, by path, with its text.
  links: Record<string, string>; removedLinks: Record<string, string>;
  exactBaselines: Record<string, Baseline>; durable: Record<string, Baseline>;
  runtimeHash: string; scopeAfterFixes?: string; before: Record<string, HashInventory>;
  // Paths the run removes whole before installing the planned files under
  // them: the retired product state directory, an update's retained inputs,
  // each skill or skill link the inspection replaces, and each target it
  // removes, which may be a single file or link.
  replaceTrees: string[];
  // The durable state of the last complete adoption, which an update keeps in
  // place until its completion replaces it.
  previousState?: Content;
}

// Plans the installation of a confirmed inspection. A replaced runtime was
// prepared in its directory, with the system skills it packages, by target;
// otherwise the installed runtime is kept, and the system skills are the ones
// the inspecting CLI, which is the pinned one, packages.
export function planInstallation(root: string, inspected: StartInspection, confirmation: string, runtime?: { directory: string; skills: Record<string, Observation> }): Installation {
  const { report, materials, recorded } = inspected;
  const files: Files = dictionary();
  const skills: Record<string, string[]> = dictionary();
  const installedRuntime = runtime ? observe(join(runtime.directory, 'node_modules')) : safeDirectory(root, '.repo-standards/runtime/node_modules');
  for (const [target, desired] of Object.entries(materials.exact)) if (desired.type !== 'missing') flatten(target, desired, files);
  for (const { target } of installedSystemSkills) flatten(target, (runtime?.skills ?? materials.systemSkills)[target]!, files);
  const skillTargets = [...report.resolved.declarations.flatMap(declaration => declaration.kind === 'skill' ? [skillTarget(declaration.name)] : []), ...installedSystemSkills.map(({ target }) => target)];
  for (const target of skillTargets) skills[target] = Object.keys(files).filter(path => path.startsWith(target + '/')).map(path => path.slice(target.length + 1)).sort();
  const linked = [...report.systemSkills, ...report.exact].flatMap(entry => 'link' in entry && entry.link ? [entry.link] : []);
  const links: Record<string, string> = Object.fromEntries(linked.map(({ target }) => [target, linkTextAt(target)!]));
  const recordedLinks = recorded?.state.links ?? {};
  const removedLinks: Record<string, string> = Object.fromEntries((report.removed ?? []).flatMap(({ target }) => Object.hasOwn(recordedLinks, target) ? [[target, recordedLinks[target]!]] : []));
  const exactBaselines = baselines(files);
  const inputs: Files = dictionary();
  for (const [path, value] of Object.entries(materials.inputs)) flatten(`${retainedSource}/${path}`, value, inputs);
  inputs['.repo-standards/inputs/standards.yaml'] = file(materials.manifest);
  inputs['.repo-standards/inputs/metadata.json'] = file(json(report.source));
  inputs['.repo-standards/inputs/resolved.json'] = file(json(report.resolved));
  // Scope evidence retains this run and its scope change against the run that
  // confirmed the recorded scope, once any run has discovered scope. The change
  // is derived here from the same confirmed selection and recorded adoption the
  // inspection compared, because an inspection reports none for an initial
  // adoption, where every discovered path is an addition.
  const previousScope = recorded?.scopeEvidence;
  if (report.discovery || previousScope) {
    const current: ScopeRun = { inspection: confirmation, resolved: report.resolved,
      ...(report.discovery ? { sourceResolved: report.sourceResolved!, discovery: report.discovery } : {}) };
    inputs['.repo-standards/inputs/scope-history.json'] = file(json(committedScopeEvidence(current, previousScope)));
  }
  Object.assign(files, inputs);
  files['.repo-standards/selection.yaml'] = file(stringify(report.selection));
  files['.repo-standards/.gitignore'] = file(ignore);
  for (const name of ['package.json', 'package-lock.json']) {
    const value = observe(runtime ? join(runtime.directory, name) : join(root, `.repo-standards/runtime/${name}`));
    flatten(`.repo-standards/runtime/${name}`, value, files);
  }
  const durable = baselines(files);
  files[lockFile] = file(json({ format: formats.lock, selection: report.selection, inspection: confirmation, files: durable }));
  // An update replaces its retained inputs as a whole tree. A replaced skill,
  // including a system skill, is replaced as a whole tree, removing
  // resources the candidate lacks, and so is whatever a replaced skill link
  // replaces. A removed target is removed whole, and so is retired product
  // state.
  const replaceTrees = [...report.retiredState ? [productState] : [], ...report.update !== undefined ? ['.repo-standards/inputs'] : [],
    ...[...report.exact, ...report.systemSkills].filter(({ target, action }) => action === 'replace' && skillTargets.includes(target)).map(({ target }) => target),
    ...linked.filter(({ action }) => action === 'replace').map(({ target }) => target),
    ...(report.removed ?? []).map(({ target }) => target)];
  return { report, git: inspected.git, files, skills, links, removedLinks, exactBaselines, durable, runtimeHash: hash(json(installedRuntime)), replaceTrees,
    ...(recorded ? { previousState: recorded.stateFile } : {}),
    before: Object.fromEntries([...new Set([...Object.keys(files).filter(path => !replaceTrees.some(tree => path.startsWith(tree + '/'))), ...replaceTrees, ...Object.keys(links)])]
      .map(path => [path, hashInventory(safePlanned(root, { links, removedLinks }, path))])) };
}

// A planned path observed safely, as the skill link the plan installs or removes
// there. Retired product state is observed as inspection bound it, without its
// generated directories.
function safePlanned(root: string, installation: Pick<Installation, 'links' | 'removedLinks'>, path: string) {
  return path === productState ? observeProductState(root) : safe(root, path, installation.links[path] ?? installation.removedLinks[path]);
}

// Whether an observed tree is the confirmed one, or, after an interrupted
// removal, part of it: every remaining file unchanged and no entry added.
function confirmedRemainder(actual: Observation, confirmed: HashInventory, partial: boolean) {
  if (!partial) return json(hashInventory(actual)) === json(confirmed);
  if (actual.type === 'missing') return true;
  const remaining: Files = dictionary();
  const expected: Record<string, Baseline> = dictionary();
  flatten('', actual, remaining);
  if (confirmed.type !== 'missing') flatten('', confirmed, expected);
  const paths = new Set(inventoryPaths(confirmed));
  return inventoryPaths(actual).every(path => paths.has(path))
    && Object.entries(remaining).every(([path, value]) => expected[path]?.sha256 === value.sha256 && expected[path].executable === value.executable);
}

// Whether the run has yet to remove the retired product state, which holds the
// earlier CLI's local reports rather than this run's.
export function retiredStatePending(installation: Installation, trees: Record<string, 'removing' | 'installing'> = {}) {
  return installation.replaceTrees.includes(productState) && trees[productState] !== 'installing';
}

// The files the product state holds while the run installs and verifies.
function plannedFiles(installation: Installation): Files {
  return { ...installation.files, ...(installation.previousState ? { [stateFile]: installation.previousState } : {}) };
}

// The Git state start observed binds the run, not the inspection identity: the
// product never commits, so HEAD or the index changing mid-run is not its work.
function verifyGit(root: string, expected: Installation['git']) {
  if (git(root, ['rev-parse', 'HEAD']).stdout.trim() !== expected.head || hash(git(root, ['ls-files', '--stage', '-z']).stdout) !== expected.index) throw new ProductError('FINAL_INTEGRITY', 'HEAD or the index changed during adoption.');
  const hidden = hiddenIndexPaths(root);
  if (json(hidden) !== json(expected.hidden)) throw new ProductError('FINAL_INTEGRITY', `The hidden index flags changed during adoption: ${hidden.join(', ')}. Reconcile skip-worktree and assume-unchanged flags before recovery.`);
}

function verifyCommittable(root: string, paths: string[]) {
  const result = git(root, ['check-ignore', '-z', '--stdin'], paths.join('\0') + '\0');
  if (result.status !== 0 && result.status !== 1) throw new ProductError('PROJECT_READ', 'Cannot establish whether adoption outputs can be committed.');
  if (result.stdout) throw new ProductError('IGNORED_OUTPUT', `Adoption outputs are ignored by Git: ${result.stdout.split('\0').filter(Boolean).join(', ')}. Reconcile ignore rules before completing adoption.`);
}

// Installs whatever the run's recorded progress has not, after verifying that
// installed and pending content still matches the plan.
export function install(root: string, session: Pick<AdoptionRunSession, 'record' | 'observation'>, installation: Installation) {
  session.record({ type: 'installation-verification' });
  const run = session.observation;
  const progress = () => session.observation.installation!;
  const { files, before, report, replaceTrees } = installation;
  const treeProgress = progress().trees!;
  verifyGit(root, installation.git);
  const observedTrees = Object.fromEntries(replaceTrees.map(tree => [tree, safePlanned(root, installation, tree)]));
  const unchangedTrees = replaceTrees.filter(tree => json(hashInventory(observedTrees[tree]!)) === json(before[tree]));
  const temporaries = stagedFiles(root, Object.fromEntries(Object.entries(files).filter(([path]) => !replaceTrees.some(tree => path.startsWith(tree + '/') && treeProgress[tree] !== 'installing'))), run.id);
  for (const tree of replaceTrees) {
    const actual = observedTrees[tree]!;
    if (unchangedTrees.includes(tree)) continue;
    if (!treeProgress[tree]) throw new ProductError('INSTALLATION_CHANGED', `Owned tree changed before replacement: ${tree}. Reconcile it before retry.`);
    // A replaced skill link may already be installed in the tree's place.
    if (actual.type === 'missing' || (actual.type === 'symlink' && treeProgress[tree] === 'installing' && actual.target === installation.links[tree])) continue;
    const observed: Files = dictionary();
    flatten(tree, actual, observed);
    const expected: Record<string, Baseline> = treeProgress[tree] === 'removing' ? dictionary() : files;
    if (treeProgress[tree] === 'removing' && before[tree]?.type !== 'missing') flatten(tree, before[tree]!, expected);
    if (Object.entries(observed).some(([path, value]) => !temporaries.includes(path) && (expected[path]?.sha256 !== value.sha256 || expected[path]?.executable !== value.executable))) {
      throw new ProductError('INSTALLATION_CHANGED', `Owned tree changed during replacement: ${tree}. Preserve and reconcile added or modified resources before retry.`);
    }
    const expectedPaths = treeProgress[tree] === 'removing'
      ? new Set([...inventoryPaths(before[tree]!).map(path => `${tree}/${path}`), ...plannedInventory(temporaries)])
      : plannedInventory([...Object.keys(files), ...temporaries]);
    if (inventoryPaths(actual).some(path => !expectedPaths.has(`${tree}/${path}`))) throw new ProductError('INSTALLATION_CHANGED', `Owned tree inventory changed during replacement: ${tree}. Preserve added resources before retry.`);
  }
  // Validate the entire remaining plan before writing any part of it. An
  // unrecorded atomic write may contain either the inspected or expected bytes.
  for (const [path, expected] of Object.entries(files)) {
    // Whole-tree verification covers descendants, including old file ancestors
    // that will become directories only after the tree has been removed.
    if (replaceTrees.some(tree => path.startsWith(tree + '/')) && !progress().files.includes(path)) continue;
    const actual = safe(root, path);
    const matches = actual.type === 'file' && actual.sha256 === expected.sha256 && actual.executable === expected.executable;
    if (!matches && (progress().files.includes(path) || json(hashInventory(actual)) !== json(before[path]))) throw new ProductError('INSTALLATION_CHANGED', `Installed or pending content changed: ${path}. Reconcile it before retry; recovery will not overwrite edits.`);
  }
  for (const [path, text] of Object.entries(installation.links)) {
    if (replaceTrees.includes(path) && !progress().files.includes(path)) continue;
    const actual = safe(root, path, text);
    if (actual.type !== 'symlink' && (progress().files.includes(path) || json(hashInventory(actual)) !== json(before[path]))) throw new ProductError('INSTALLATION_CHANGED', `Installed or pending skill link changed: ${path}. Reconcile it before retry; recovery will not overwrite edits.`);
  }
  const plannedPaths = plannedInventory([...Object.keys(files), ...temporaries]);
  for (const skill of Object.keys(installation.skills).filter(skill => !replaceTrees.includes(skill))) {
    const current = safe(root, skill);
    if (current.type === 'missing') continue;
    if (inventoryPaths(current).some(path => !plannedPaths.has(`${skill}/${path}`))) throw new ProductError('INSTALLATION_CHANGED', `Skill inventory changed: ${skill}. Preserve added resources before retry.`);
  }
  const productPaths = plannedInventory([...Object.keys(plannedFiles(installation)), ...temporaries]);
  if (safeDirectory(root, '.repo-standards').type !== 'missing' && productInventory(root).some(path => !productPaths.has(path) && !replaceTrees.some(tree => path.startsWith(tree + '/')))) throw new ProductError('INSTALLATION_CHANGED', 'Product state inventory changed. Reconcile additions before retry.');
  const runtimePath = '.repo-standards/runtime/node_modules';
  const runtime = safeDirectory(root, runtimePath);
  function partial(actual: Observation, expected: Observation): boolean {
    if (actual.type === 'missing') return true;
    if (actual.type === 'directory' && expected.type === 'directory') return Object.entries(actual.entries).every(([name, child]) => expected.entries[name] !== undefined && partial(child, expected.entries[name]));
    return json(actual) === json(expected);
  }
  if (progress().runtime) {
    if (hash(json(runtime)) !== installation.runtimeHash) throw new ProductError('INSTALLATION_CHANGED', 'Runtime content changed. Reconcile it before retry.');
  } else {
    const staged = observe(`${lockPath(root)}.runtime`);
    if (hash(json(staged)) !== installation.runtimeHash) throw new ProductError('STATE_INTEGRITY', 'The saved runtime installation changed. Preserve the run and restore its recorded runtime.');
    // A runtime in retired product state goes with it.
    if (report.update === undefined && !retiredStatePending(installation, treeProgress) && !partial(runtime, staged)) throw new ProductError('INSTALLATION_CHANGED', 'Runtime content changed. Reconcile it before retry.');
  }
  for (const path of temporaries) { safe(root, path); rmSync(join(root, path)); }
  session.record({ type: 'installation-writing' });
  const removeTree = (tree: string) => {
    if (treeProgress[tree] === 'installing') return;
    session.record({ type: 'tree-removing', path: tree });
    const current = safePlanned(root, installation, tree);
    // Retired product state is removed only as confirmed, observed once more
    // after its removal is recorded: unchanged, or after an interrupted
    // removal, what remains of it.
    if (tree === productState && !confirmedRemainder(current, before[tree]!, treeProgress[tree] === 'removing')) {
      throw new ProductError('INSTALLATION_CHANGED', `Retired product state changed before removal: ${tree}. Nothing was removed. Restore its committed content and remove additions before retry, or abandon the run.`);
    }
    remove(join(root, tree));
    session.record({ type: 'tree-installing', path: tree });
  };
  // Retired product state goes first, so that the run's own product files,
  // from the ignore file on, are written into a new directory.
  if (replaceTrees.includes(productState)) removeTree(productState);
  const ignorePath = '.repo-standards/.gitignore';
  write(root, ignorePath, files[ignorePath]!, run.id);
  session.record({ type: 'file-installed', path: ignorePath });
  for (const tree of replaceTrees) if (tree !== productState) removeTree(tree);
  for (const [path, value] of Object.entries(files)) {
    if (progress().files.includes(path)) continue;
    write(root, path, value, run.id);
    session.record({ type: 'file-installed', path });
  }
  for (const [path, text] of Object.entries(installation.links)) {
    if (progress().files.includes(path)) continue;
    writeLink(root, path, text, run.id);
    session.record({ type: 'link-installed', path });
  }
  if (!progress().runtime) {
    safeDirectory(root, runtimePath);
    const runtimeStage = '.repo-standards/local/runtime-stage';
    safeDirectory(root, runtimeStage);
    rmSync(join(root, runtimeStage), { recursive: true, force: true });
    cpSync(`${lockPath(root)}.runtime`, join(root, runtimeStage), { recursive: true, verbatimSymlinks: true });
    if (hash(json(observe(join(root, runtimeStage)))) !== installation.runtimeHash) throw new ProductError('FINAL_INTEGRITY', 'Runtime staging did not finish correctly.');
    safeDirectory(root, runtimePath);
    rmSync(join(root, runtimePath), { recursive: true, force: true });
    renameSync(join(root, runtimeStage), join(root, runtimePath));
    session.record({ type: 'runtime-installed' });
  }
  session.record({ type: 'installation-finished' });
}

// Final integrity: the installed content and skill links, runtime, product
// state and skill inventories, retained inputs and Git state still match the
// plan. Verifying
// after an interrupted completion also accepts its files wherever the
// completion wrote them, including their staged temporaries, which are then
// removed.
export function verifyInstallation(root: string, installation: Installation, completion?: { runId: string; lock: Content; state: Content }) {
  const { files, skills, runtimeHash } = installation;
  const expectedFiles = plannedFiles(installation);
  let temporaries: string[] = [];
  if (completion) {
    const written: Files = { [lockFile]: completion.lock, [stateFile]: completion.state };
    temporaries = stagedFiles(root, written, completion.runId, expectedFiles);
    for (const path of temporaries) flatten(path, safe(root, path), expectedFiles);
    for (const [path, value] of Object.entries(written)) {
      const actual = safe(root, path);
      if (actual.type === 'file' && actual.sha256 === value.sha256) expectedFiles[path] = value;
    }
  }
  verifyFiles(root, expectedFiles);
  for (const [path, text] of Object.entries(installation.links)) {
    if (safe(root, path, text).type !== 'symlink') throw new ProductError('FINAL_INTEGRITY', `Expected skill link changed: ${path}.`);
  }
  if (hash(json(safeDirectory(root, '.repo-standards/runtime/node_modules'))) !== runtimeHash) throw new ProductError('FINAL_INTEGRITY', 'The installed runtime dependencies changed.');
  if (!matchesInventory(observeProductState(root), Object.keys(expectedFiles).filter(path => path.startsWith('.repo-standards/')).map(path => path.slice('.repo-standards/'.length)))) throw new ProductError('FINAL_INTEGRITY', 'The product state inventory changed.');
  for (const [path, expected] of Object.entries(skills)) if (!matchesInventory(safe(root, path), expected)) throw new ProductError('FINAL_INTEGRITY', `Skill inventory changed: ${path}.`);
  if (json(inventory(root, '.repo-standards/inputs')) !== json(Object.keys(expectedFiles).filter(path => path.startsWith('.repo-standards/inputs/')).map(path => path.slice('.repo-standards/inputs/'.length)).sort())) throw new ProductError('FINAL_INTEGRITY', 'Retained input inventory changed.');
  verifyGit(root, installation.git);
  verifyCommittable(root, [...Object.keys(files), ...Object.keys(installation.links), stateFile]);
  for (const path of temporaries) { safe(root, path); rmSync(join(root, path)); }
}

// The installed exact content and skill links, which verified recovery may
// restore without the restoration counting as agent work.
export function exactContent(installation: Installation): Scope[string] {
  return { paths: [...Object.keys(installation.exactBaselines), ...Object.keys(installation.links)], directories: Object.keys(installation.skills) };
}

// The project paths the installation plans, each with its state before the run
// and as installed: exact files, every file of an installed or replaced skill
// tree, including the system skills, each skill link and what it replaces, and
// every file of a removed target. The
// change set ignores those the installation leaves unchanged. Product state
// under `.repo-standards/` is the product's own, not a project path the run
// changes. Only the leaves of a tree are compared: an empty directory has
// none, and as untracked content it never reaches a start.
function installationDeltas(installation: Installation): Record<string, Delta> {
  const before: Record<string, HashInventory> = dictionary();
  const leaves = (path: string, value: HashInventory) => {
    if (value.type === 'directory') for (const [name, child] of Object.entries(value.entries)) leaves(`${path}/${name}`, child);
    else if (value.type !== 'missing') before[path] = value;
  };
  for (const [path, value] of Object.entries(installation.before)) leaves(path, value);
  const after: Record<string, HashInventory> = Object.fromEntries([...Object.entries(installation.files)
    .map(([path, value]): [string, HashInventory] => [path, { type: 'file', sha256: value.sha256, executable: value.executable }]),
    ...Object.entries(installation.links).map(([path, target]): [string, HashInventory] => [path, { type: 'symlink', target }])]);
  return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => !path.startsWith('.repo-standards/'))
    .map(path => [path, { before: before[path] ?? { type: 'missing' }, after: after[path] ?? { type: 'missing' } }]));
}

// The durable state and lock a completion writes. The state holds this run's
// evidence only; the previous durable state it replaces is not read.
export function completionFiles(installation: Installation, run: Run, operationStart: number) {
  const state = file(json({ ...completedEvidence(run, installationDeltas(installation)),
    lastComplete: { run: run.id, inspection: run.inspection, completedAt: new Date().toISOString(), head: installation.git.head },
    baselines: installation.exactBaselines, skills: installation.skills, links: installation.links,
    checks: run.operations.slice(operationStart).filter(evidence => evidence.operation.phase === 'checks'), assessments: run.assessments }));
  const lock = file(json({ format: formats.lock, selection: installation.report.selection, inspection: run.inspection, files: installation.durable, state: { sha256: state.sha256, executable: state.executable } }));
  return { state, lock };
}

// Writes a completion's durable state and lock, and verifies them together
// with the installed files.
export function writeCompletion(root: string, installation: Installation, completion: ReturnType<typeof completionFiles>, runId: string) {
  write(root, lockFile, completion.lock, runId);
  write(root, stateFile, completion.state, runId);
  verifyFiles(root, { ...installation.files, [lockFile]: completion.lock, [stateFile]: completion.state });
}

// Moves a candidate durable state the run's completion wrote to
// local/incomplete-state.json, restoring the previous durable state an update
// kept in place. The installation is read only when there is a candidate to move.
export function withdrawCompletionState(root: string, runId: string, installation: () => Installation) {
  const state = safe(root, stateFile);
  if (state.type !== 'file' || record(record(JSON.parse(Buffer.from(state.content, state.encoding).toString('utf8'))).lastComplete).run !== runId) return;
  safe(root, incompleteState);
  const previous = installation().previousState;
  if (previous) {
    write(root, incompleteState, state);
    write(root, stateFile, previous, runId);
  } else renameSync(join(root, stateFile), join(root, incompleteState));
}

// Rewrites the planned lock in place of a withdrawn completion's lock.
export function restorePlannedLock(root: string, installation: Installation, runId: string) {
  write(root, lockFile, installation.files[lockFile]!, runId);
}
