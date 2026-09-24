import { cpSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { hash } from './acquisition.js';
import { baselines, file, flatten, ignore, inventory, json, lockPath, safe, safeDirectory, stagedFiles, systemTarget, verifyFiles, write } from './adoption-files.js';
import type { Baseline, Files } from './adoption-files.js';
import type { AdoptionRunSession, Run } from './adoption-run.js';
import { ProductError } from './errors.js';
import { formats } from './formats.js';
import { hiddenIndexPaths, observeProductState, productInventory, type inspectForStart } from './inspection.js';
import { git, hashInventory, inventoryPaths, matchesInventory, observe, plannedInventory, type Content, type HashInventory, type Observation } from './observation.js';
import { decodeState } from './recorded-state.js';
import { committedScopeHistory, type ScopeHistoryRun } from './scope-evidence.js';
import type { Scope } from './scope.js';
import { carriedRuns, completedEvidence } from './work-evidence.js';

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

export interface Installation {
  report: StartInspection['report']; git: StartInspection['git']; files: Files; skills: Record<string, string[]>;
  exactBaselines: Record<string, Baseline>; durable: Record<string, Baseline>;
  runtimeHash: string; scopeAfterFixes?: string; before: Record<string, HashInventory>;
  // An update replaces retained inputs, still-declared skills and, with the
  // runtime, the system skill as whole trees.
  replaceTrees: string[];
  // The durable state of the last complete adoption, which an update keeps in
  // place until its completion carries it into the ordered history.
  previousState?: Content;
}

// Plans the installation of a confirmed inspection. A replaced runtime was
// prepared in its directory, with the system skill it packages; otherwise the
// installed runtime is kept.
export function planInstallation(root: string, inspected: StartInspection, confirmation: string, runtime?: { directory: string; skill: Observation }): Installation {
  const { report, materials, recorded } = inspected;
  const files: Files = Object.create(null);
  const skills: Record<string, string[]> = Object.create(null);
  const installedRuntime = runtime ? observe(join(runtime.directory, 'node_modules')) : safeDirectory(root, '.repo-standards/runtime/node_modules');
  for (const [target, desired] of Object.entries(materials.exact)) if (desired.type !== 'missing') flatten(target, desired, files);
  flatten(systemTarget, runtime?.skill ?? materials.systemSkill, files);
  for (const declaration of report.resolved.declarations) if (declaration.kind === 'skill') {
    const target = `.agents/skills/${declaration.name}`;
    skills[target] = Object.keys(files).filter(path => path.startsWith(target + '/')).map(path => path.slice(target.length + 1)).sort();
  }
  skills[systemTarget] = Object.keys(files).filter(path => path.startsWith(systemTarget + '/')).map(path => path.slice(systemTarget.length + 1)).sort();
  const exactBaselines = baselines(files);
  const inputs: Files = Object.create(null);
  for (const [path, value] of Object.entries(materials.inputs)) flatten(`${retainedSource}/${path}`, value, inputs);
  inputs['.repo-standards/inputs/standards.yaml'] = file(materials.manifest);
  inputs['.repo-standards/inputs/metadata.json'] = file(json(report.source));
  inputs['.repo-standards/inputs/resolved.json'] = file(json(report.resolved));
  const previousHistory = recorded?.scopeHistory;
  if (report.discovery || previousHistory) {
    const current: ScopeHistoryRun = { inspection: confirmation, resolved: report.resolved,
      ...(report.discovery ? { sourceResolved: report.sourceResolved!, discovery: report.discovery } : {}) };
    inputs['.repo-standards/inputs/scope-history.json'] = file(json(committedScopeHistory([...previousHistory ?? [], current])));
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
  // An update replaces retained inputs and every still-declared skill as whole
  // trees, and the system skill with the runtime. Retired content stays.
  const replaceTrees = report.update !== undefined ? ['.repo-standards/inputs', ...report.resolved.declarations
    .filter(declaration => declaration.kind === 'skill').map(declaration => `.agents/skills/${declaration.name}`),
  ...(runtime ? [systemTarget] : [])] : [];
  return { report, git: inspected.git, files, skills, exactBaselines, durable, runtimeHash: hash(json(installedRuntime)), replaceTrees,
    ...(recorded ? { previousState: recorded.stateFile } : {}),
    before: Object.fromEntries([...Object.keys(files).filter(path => !replaceTrees.some(tree => path.startsWith(tree + '/'))), ...replaceTrees].map(path => [path, hashInventory(safe(root, path))])) };
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
  const observedTrees = Object.fromEntries(replaceTrees.map(tree => [tree, safe(root, tree)]));
  const unchangedTrees = replaceTrees.filter(tree => json(hashInventory(observedTrees[tree]!)) === json(before[tree]));
  const temporaries = stagedFiles(root, Object.fromEntries(Object.entries(files).filter(([path]) => !replaceTrees.some(tree => path.startsWith(tree + '/') && treeProgress[tree] !== 'installing'))), run.id);
  for (const tree of replaceTrees) {
    const actual = observedTrees[tree]!;
    if (unchangedTrees.includes(tree)) continue;
    if (!treeProgress[tree]) throw new ProductError('INSTALLATION_CHANGED', `Owned tree changed before replacement: ${tree}. Reconcile it before retry.`);
    if (actual.type === 'missing') continue;
    const observed: Files = Object.create(null);
    flatten(tree, actual, observed);
    const expected: Record<string, Baseline> = treeProgress[tree] === 'removing' ? Object.create(null) : files;
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
    if (actual.type === 'directory' && expected.type === 'directory') return Object.entries(actual.entries).every(([name, child]) => expected.entries[name] !== undefined && partial(child, expected.entries[name]!));
    return json(actual) === json(expected);
  }
  if (progress().runtime) {
    if (hash(json(runtime)) !== installation.runtimeHash) throw new ProductError('INSTALLATION_CHANGED', 'Runtime content changed. Reconcile it before retry.');
  } else {
    const staged = observe(`${lockPath(root)}.runtime`);
    if (hash(json(staged)) !== installation.runtimeHash) throw new ProductError('STATE_INTEGRITY', 'The saved runtime installation changed. Preserve the run and restore its recorded runtime.');
    if (report.update === undefined && !partial(runtime, staged)) throw new ProductError('INSTALLATION_CHANGED', 'Runtime content changed. Reconcile it before retry.');
  }
  for (const path of temporaries) { safe(root, path); rmSync(join(root, path)); }
  session.record({ type: 'installation-writing' });
  const ignorePath = '.repo-standards/.gitignore';
  write(root, ignorePath, files[ignorePath]!, run.id);
  session.record({ type: 'file-installed', path: ignorePath });
  for (const tree of replaceTrees) {
    if (treeProgress[tree] === 'installing') continue;
    session.record({ type: 'tree-removing', path: tree });
    safeDirectory(root, tree);
    rmSync(join(root, tree), { recursive: true, force: true });
    session.record({ type: 'tree-installing', path: tree });
  }
  for (const [path, value] of Object.entries(files)) {
    if (progress().files.includes(path)) continue;
    write(root, path, value, run.id);
    session.record({ type: 'file-installed', path });
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

// Final integrity: the installed content, runtime, product state and skill
// inventories, retained inputs and Git state still match the plan. Verifying
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
  if (hash(json(safeDirectory(root, '.repo-standards/runtime/node_modules'))) !== runtimeHash) throw new ProductError('FINAL_INTEGRITY', 'The installed runtime dependencies changed.');
  if (!matchesInventory(observeProductState(root), Object.keys(expectedFiles).filter(path => path.startsWith('.repo-standards/')).map(path => path.slice('.repo-standards/'.length)))) throw new ProductError('FINAL_INTEGRITY', 'The product state inventory changed.');
  for (const [path, expected] of Object.entries(skills)) if (!matchesInventory(safe(root, path), expected)) throw new ProductError('FINAL_INTEGRITY', `Skill inventory changed: ${path}.`);
  if (json(inventory(root, '.repo-standards/inputs')) !== json(Object.keys(expectedFiles).filter(path => path.startsWith('.repo-standards/inputs/')).map(path => path.slice('.repo-standards/inputs/'.length)).sort())) throw new ProductError('FINAL_INTEGRITY', 'Retained input inventory changed.');
  verifyGit(root, installation.git);
  verifyCommittable(root, [...Object.keys(files), stateFile]);
  for (const path of temporaries) { safe(root, path); rmSync(join(root, path)); }
}

// The installed exact content, which verified recovery may restore without
// the restoration counting as agent work.
export function exactContent(installation: Installation): Scope[string] {
  return { paths: Object.keys(installation.exactBaselines), directories: Object.keys(installation.skills) };
}

// The durable state and lock a completion writes. The previous durable state
// an update carries is decoded here, once, as the recorded adoption reader
// decodes committed state, and its evidence moves into the ordered history.
export function completionFiles(installation: Installation, run: Run, operationStart: number) {
  const state = file(json({ ...completedEvidence(run, carriedHistory(installation)),
    lastComplete: { run: run.id, inspection: run.inspection, completedAt: new Date().toISOString(), head: installation.git.head },
    baselines: installation.exactBaselines, skills: installation.skills,
    checks: run.operations.slice(operationStart).filter(evidence => evidence.operation.phase === 'checks'), assessments: run.assessments }));
  const lock = file(json({ format: formats.lock, selection: installation.report.selection, inspection: run.inspection, files: installation.durable, state: { sha256: state.sha256, executable: state.executable } }));
  return { state, lock };
}

function carriedHistory(installation: Installation) {
  if (!installation.previousState) return [];
  try { return carriedRuns(decodeState(installation.previousState)); }
  catch { throw new ProductError('FINAL_INTEGRITY', 'The durable state of the last complete adoption, carried by this update, failed integrity validation.'); }
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
// carries. The installation is read only when there is a candidate to move.
export function withdrawCompletionState(root: string, runId: string, installation: () => Installation) {
  const state = safe(root, stateFile);
  if (state.type !== 'file' || JSON.parse(Buffer.from(state.content, state.encoding).toString('utf8')).lastComplete?.run !== runId) return;
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
