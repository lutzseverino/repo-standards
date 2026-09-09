import { assessmentSnapshot, projectSnapshot, validateAssessment } from './assessment.js';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { externalPath, hash } from './acquisition.js';
import { allowedTargets, execute, operations, preflight } from './execution.js';
import { ProductError } from './errors.js';
import { git, hiddenIndexPaths, inspect, observe, productInventory } from './inspection.js';
import type { InspectOptions, Observation } from './inspection.js';
import { baselines, file, flatten, ignore, json, lockPath, projectRoot, safe, safeDirectory, stagedFiles, systemTarget, verifyFiles, write } from './adoption-files.js';
import type { Files } from './adoption-files.js';
import { recordedState, withStartRun, withResumedRun } from './adoption-run.js';
import type { AdoptionRunSession, Installation, Run, StartInput, WorkRequest } from './adoption-run.js';
export { abandon, status } from './adoption-run.js';
type Inspection = Awaited<ReturnType<typeof inspect>>;
const packageName = '@lutzseverino/repo-standards';

function workRequest(root: string, run: Run, report: Pick<Inspection, 'guidance' | 'resolved'>): WorkRequest {
  return { format: 'repo-standards/work-request/v1', run: run.id, selection: `sha256:${hash(json(run.selection))}`,
    snapshot: assessmentSnapshot(root, run.retryHistory?.length),
    declarations: report.guidance.map(guidance => ({ id: guidance.id, guidance,
      allowedTargets: allowedTargets(report.resolved.declarations.find(declaration => declaration.id === guidance.id)!) })),
    requiredEvidence: ['status', 'explanation', 'changedPaths', 'evidence'] };
}

function verifyConfirmation(report: Inspection, confirmation: string) {
  if (report.identity !== confirmation) throw new ProductError('STALE_INSPECTION', 'Selection or project state changed. Inspect again and obtain confirmation of the new identity.');
  if (report.start.blockers.length) throw new ProductError('START_BLOCKED', 'Resolve all inspection blockers before starting adoption.', report.start.blockers);
}

function prepareRuntime(directory: string, version: string, project: string) {
  // npm creates its cache even for `config get`. Override it while reading
  // config, then recover the last (highest-precedence) overridden cache value.
  // Never print the configuration listing: only the cache path is needed.
  const configured = spawnSync('npm', ['config', 'list', '--long', '--json=false', '--prefix', directory, '--cache', join(directory, 'config-cache'), '--logs-max=0', '--update-notifier=false'], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
  const cacheValue = [...configured.stdout?.matchAll(/^; cache = (.+) ; overridden by cli\s*$/gm) ?? []].at(-1)?.[1];
  if (configured.error || configured.status !== 0 || !cacheValue) throw new ProductError('NPM_CACHE', 'Cannot determine the configured npm cache. Check npm configuration and retry.');
  const cachePath: unknown = JSON.parse(cacheValue);
  if (typeof cachePath !== 'string' || !cachePath) throw new ProductError('NPM_CACHE', 'npm did not report a valid cache path.');
  const cache = externalPath(resolve(directory, cachePath), project);
  const contentCache = join(cache, '_cacache');
  const projectWithinCache = relative(contentCache, project);
  if (projectWithinCache === '' || (!projectWithinCache.startsWith('../') && projectWithinCache !== '..' && !isAbsolute(projectWithinCache))) throw new ProductError('UNSAFE_CACHE', 'The adopting project cannot be inside npm’s content cache. Configure an external cache.');
  function verifyCacheTree(path: string) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new ProductError('UNSAFE_CACHE', `npm content-cache paths cannot be symbolic links: ${path}. Configure an external cache without content-cache links.`);
    if (stat.isDirectory()) for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) verifyCacheTree(join(path, entry.name));
    }
  }
  verifyCacheTree(contentCache);
  writeFileSync(join(directory, 'package.json'), json({ private: true, dependencies: { [packageName]: version } }));
  const result = spawnSync('npm', ['install', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache, '--logs-dir', join(directory, 'npm-logs'), '--update-notifier=false'],
    { cwd: directory, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new ProductError('RUNTIME_INSTALL', 'Cannot install the exact CLI runtime. Check npm registry or cache availability and retry after a new inspection.', result.stderr);
  const installed = JSON.parse(readFileSync(join(directory, 'node_modules', packageName, 'package.json'), 'utf8'));
  if (installed.name !== packageName || installed.version !== version) throw new ProductError('RUNTIME_IDENTITY', 'The runtime package does not match the confirmed exact CLI version.');
  const expectedSkill = observe(fileURLToPath(new URL('../skills/adopt-standards', import.meta.url)));
  const installedSkill = observe(join(directory, 'node_modules', packageName, 'skills/adopt-standards'));
  if (expectedSkill.type !== 'directory' || JSON.stringify(installedSkill) !== JSON.stringify(expectedSkill)) throw new ProductError('RUNTIME_IDENTITY', 'The installed runtime does not contain the matching adoption skill.');
  return installedSkill;
}

function inventory(root: string, path: string) {
  const files: Files = Object.create(null);
  flatten(path, safe(root, path), files);
  return Object.keys(files).map(name => name.slice(path.length + 1)).sort();
}

function verifyCommittable(root: string, paths: string[]) {
  const result = git(root, ['check-ignore', '-z', '--stdin'], paths.join('\0') + '\0');
  if (result.status !== 0 && result.status !== 1) throw new ProductError('PROJECT_READ', 'Cannot establish whether adoption outputs can be committed.');
  if (result.stdout) throw new ProductError('IGNORED_OUTPUT', `Adoption outputs are ignored by Git: ${result.stdout.split('\0').filter(Boolean).join(', ')}. Reconcile ignore rules before completing adoption.`);
}

export async function start(options: InspectOptions, cliVersion: string, confirmation: string) {
  return withStartRun(options.project, session => startRun({ kind: 'public', options }, cliVersion, confirmation, session));
}

export async function startRetained(project: string, cliVersion: string, confirmation: string) {
  return withStartRun(project, session => startRun({ kind: 'retained', project }, cliVersion, confirmation, session));
}

async function startRun(input: StartInput, cliVersion: string, confirmation: string, session: AdoptionRunSession) {
  const inspectSelection = () => input.kind === 'retained' ? inspectRetained(input.project, cliVersion) : inspect(input.options, cliVersion);
  const initial = await inspectSelection();
  const root = initial.project.root;
  verifyConfirmation(initial, confirmation);
  const startInput: StartInput = input.kind === 'retained' ? { kind: 'retained', project: root } : { kind: 'public', options: { ...input.options, project: root } };
  session.begin(initial, confirmation, startInput);
  let temporary: string | undefined;
  const files: Files = Object.create(null);
  const skills: Record<string, string[]> = Object.create(null);
  const prerequisites = await session.prerequisites(onSpawn => preflight(root, initial.resolved, onSpawn));
  if (prerequisites.some(probe => probe.code)) throw new ProductError('PREREQUISITES_BLOCKED', 'Resolve the reported executable and version problems; prerequisites are never installed automatically.');
  const replaceRuntime = initial.update !== 'standards';
  let preparedSystemSkill: Observation | undefined;
  if (replaceRuntime) {
    const acquired = session.acquireRuntime(directory => prepareRuntime(directory, cliVersion, root));
    temporary = acquired.directory;
    preparedSystemSkill = acquired.skill;
  }
  // Network/package acquisition can take time. Repeat all Git, source and
  // target checks under the lock before creating any project material.
  const report = await inspectSelection();
  verifyConfirmation(report, confirmation);
  const systemSkill = preparedSystemSkill ?? report.project.systemSkill;
  const runtime = replaceRuntime ? observe(join(temporary!, 'node_modules')) : safeDirectory(root, '.repo-standards/runtime/node_modules');
  for (const exact of report.exact) for (const change of exact.files) if (change.after.type !== 'missing') flatten(change.path, change.after, files);
  flatten(systemTarget, systemSkill, files);
  for (const declaration of report.resolved.declarations) if (declaration.kind === 'skill') {
    const target = `.agents/skills/${declaration.name}`;
    skills[target] = Object.keys(files).filter(path => path.startsWith(target + '/')).map(path => path.slice(target.length + 1)).sort();
  }
  skills[systemTarget] = Object.keys(files).filter(path => path.startsWith(systemTarget + '/')).map(path => path.slice(systemTarget.length + 1)).sort();
  const exactBaselines = baselines(files);
  const inputs: Files = Object.create(null);
  for (const [path, value] of Object.entries(report.inputs)) flatten(`.repo-standards/inputs/source/${path}`, value, inputs);
  inputs['.repo-standards/inputs/standards.yaml'] = file(report.manifest);
  inputs['.repo-standards/inputs/metadata.json'] = file(json(report.source));
  inputs['.repo-standards/inputs/resolved.json'] = file(json(report.resolved));
  Object.assign(files, inputs);
  files['.repo-standards/selection.yaml'] = file(stringify(report.selection));
  files['.repo-standards/.gitignore'] = file(ignore);
  for (const name of ['package.json', 'package-lock.json']) {
    const value = observe(join(replaceRuntime ? temporary! : root, replaceRuntime ? name : `.repo-standards/runtime/${name}`));
    flatten(`.repo-standards/runtime/${name}`, value, files);
  }
  const durable = baselines(files);
  files['.repo-standards/lock.json'] = file(json({ format: 'repo-standards/lock/v1', selection: report.selection, inspection: confirmation, files: durable }));
  const replaceTrees = report.update === 'standards' ? ['.repo-standards/inputs', ...report.resolved.declarations
    .filter(declaration => declaration.kind === 'skill').map(declaration => `.agents/skills/${declaration.name}`)] : report.update === 'cli' ? [systemTarget] : [];
  const transitional: Files = Object.create(null);
  if (report.update) {
    const oldState = safe(root, '.repo-standards/state.json');
    if (oldState.type === 'file') transitional['.repo-standards/state.json'] = oldState;
  }
  const installation: Installation = { report, files, skills, exactBaselines, durable, runtimeHash: hash(json(runtime)), replaceTrees, transitional,
    before: Object.fromEntries([...Object.keys(files).filter(path => !replaceTrees.some(tree => path.startsWith(tree + '/'))), ...replaceTrees].map(path => [path, safe(root, path)])) };
  session.prepareInstallation(installation);
  install(root, session, installation);
  await advance(root, session, installation);
}

function verifyGit(root: string, report: Inspection) {
  if (git(root, ['rev-parse', 'HEAD']).stdout.trim() !== report.project.head || git(root, ['ls-files', '--stage', '-z']).stdout !== report.project.index) throw new ProductError('FINAL_INTEGRITY', 'HEAD or the index changed during adoption.');
  const hidden = hiddenIndexPaths(root);
  if (json(hidden) !== json(report.project.hidden)) throw new ProductError('FINAL_INTEGRITY', `The hidden index flags changed during adoption: ${hidden.join(', ')}. Reconcile skip-worktree and assume-unchanged flags before recovery.`);
}

function install(root: string, session: AdoptionRunSession, installation: Installation) {
  session.record({ type: 'installation-verification' });
  const run = session.observation;
  const progress = () => session.observation.installation!;
  const { files, before, report } = installation;
  const replaceTrees = installation.replaceTrees ?? [];
  const treeProgress = progress().trees!;
  verifyGit(root, report);
  const observedTrees = Object.fromEntries(replaceTrees.map(tree => [tree, safe(root, tree)]));
  const unchangedTrees = replaceTrees.filter(tree => json(observedTrees[tree]) === json(before[tree]));
  const temporaries = stagedFiles(root, Object.fromEntries(Object.entries(files).filter(([path]) => !replaceTrees.some(tree => path.startsWith(tree + '/') && treeProgress[tree] !== 'installing'))), run.id);
  for (const tree of replaceTrees) {
    const actual = observedTrees[tree]!;
    if (unchangedTrees.includes(tree)) continue;
    if (!treeProgress[tree]) throw new ProductError('INSTALLATION_CHANGED', `Owned tree changed before replacement: ${tree}. Reconcile it before retry.`);
    if (actual.type === 'missing') continue;
    const observed: Files = Object.create(null);
    flatten(tree, actual, observed);
    const expected: Files = treeProgress[tree] === 'removing' ? Object.create(null) : files;
    if (treeProgress[tree] === 'removing' && before[tree]?.type !== 'missing') flatten(tree, before[tree]!, expected);
    if (Object.entries(observed).some(([path, value]) => !temporaries.includes(path) && (expected[path]?.sha256 !== value.sha256 || expected[path]?.executable !== value.executable))) {
      throw new ProductError('INSTALLATION_CHANGED', `Owned tree changed during replacement: ${tree}. Preserve and reconcile added or modified resources before retry.`);
    }
  }
  // Validate the entire remaining plan before writing any part of it. An
  // unrecorded atomic write may contain either the inspected or expected bytes.
  for (const [path, expected] of Object.entries(files)) {
    // Whole-tree verification covers descendants, including old file ancestors
    // that will become directories only after the tree has been removed.
    if (replaceTrees.some(tree => path.startsWith(tree + '/')) && !progress().files.includes(path)) continue;
    const actual = safe(root, path);
    const matches = actual.type === 'file' && actual.sha256 === expected.sha256 && actual.executable === expected.executable;
    if (!matches && (progress().files.includes(path) || json(actual) !== json(before[path]))) throw new ProductError('INSTALLATION_CHANGED', `Installed or pending content changed: ${path}. Reconcile it before retry; recovery will not overwrite edits.`);
  }
  for (const skill of Object.keys(installation.skills).filter(skill => !replaceTrees.includes(skill))) {
    const current = safe(root, skill);
    if (current.type === 'missing') continue;
    const observed: Files = Object.create(null);
    flatten(skill, current, observed);
    if (Object.keys(observed).some(path => !Object.hasOwn(files, path) && !temporaries.includes(path))) throw new ProductError('INSTALLATION_CHANGED', `Skill inventory changed: ${skill}. Preserve added resources before retry.`);
  }
  const transitional = installation.transitional ?? {};
  if (safeDirectory(root, '.repo-standards').type !== 'missing' && productInventory(root).some(path => !Object.hasOwn(files, path) && !Object.hasOwn(transitional, path) && !replaceTrees.some(tree => path.startsWith(tree + '/')) && !temporaries.includes(path))) throw new ProductError('INSTALLATION_CHANGED', 'Product state inventory changed. Reconcile additions before retry.');
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
    if (!report.update && !partial(runtime, staged)) throw new ProductError('INSTALLATION_CHANGED', 'Runtime content changed. Reconcile it before retry.');
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

function verifyInstallation(root: string, installation: Installation, extra: Files = {}) {
  const { report, files, skills, runtimeHash } = installation;
  const expectedFiles = { ...files, ...(installation.transitional ?? {}), ...extra };
  verifyFiles(root, expectedFiles);
  if (hash(json(safeDirectory(root, '.repo-standards/runtime/node_modules'))) !== runtimeHash) throw new ProductError('FINAL_INTEGRITY', 'The installed runtime dependencies changed.');
  if (json(productInventory(root).sort()) !== json(Object.keys(expectedFiles).filter(path => path.startsWith('.repo-standards/')).sort())) throw new ProductError('FINAL_INTEGRITY', 'The product state inventory changed.');
  for (const [path, expected] of Object.entries(skills)) if (json(inventory(root, path)) !== json(expected)) throw new ProductError('FINAL_INTEGRITY', `Skill inventory changed: ${path}.`);
  if (json(inventory(root, '.repo-standards/inputs')) !== json(Object.keys(expectedFiles).filter(path => path.startsWith('.repo-standards/inputs/')).map(path => path.slice('.repo-standards/inputs/'.length)).sort())) throw new ProductError('FINAL_INTEGRITY', 'Retained input inventory changed.');
  verifyGit(root, report);
  verifyCommittable(root, [...Object.keys(files), '.repo-standards/state.json']);
}

async function advance(root: string, session: AdoptionRunSession, installation: Installation, resumed = false, assessment?: unknown) {
  const { report } = installation;
  const verifyInstalled = () => verifyInstallation(root, installation);
  verifyInstalled();
  if (resumed) {
    session.record({ type: 'assessment-started' });
    if (assessment === undefined) session.pauseForContext(workRequest(root, session.observation, report));
    const accepted = validateAssessment(root, session.observation, installation.contextualBaseline!, assessment);
    session.record({ type: 'assessment-submitted', assessment: accepted });
    if (accepted.declarations.some(entry => entry.status === 'blocked')) throw new ProductError('ASSESSMENT_BLOCKED', 'Agent reports blocked contextual work. Resolve the explanation and submit renewed evidence before checks.');
    session.record({ type: 'assessment-accepted' });
  }
  const operationStart = session.observation.operations.length;
  for (const phase of (resumed ? ['checks'] : ['fixes', 'checks']) as ('fixes' | 'checks')[]) {
    for (const selected of operations(report.resolved, phase)) {
      let before: string | null = null;
      const evidence = await session.authorProcess({ phase, declaration: selected.declaration, id: selected.operation.id }, onSpawn => {
        before = phase === 'checks' ? projectSnapshot(root) : null;
        return execute(root, selected, report.selection, report.resolved, onSpawn);
      }, () => {
        verifyInstalled();
        if (before !== null && projectSnapshot(root) !== before) throw new ProductError('CHECK_MUTATION', `Check ${selected.declaration}/${selected.operation.id} changed observed project content. Changes are preserved; checks must be read-only.`);
      });
      if (evidence.error) throw new ProductError(evidence.error, `Operation ${selected.declaration}/${selected.operation.id} did not return a successful process and protocol result. Read its logs and preserve changes.`);
      if (evidence.result?.status === 'blocked') throw new ProductError('OPERATION_BLOCKED', `Operation ${selected.declaration}/${selected.operation.id} is blocked: ${evidence.result.message}`);
      session.record({ type: 'operation-accepted', description: `${phase}: ${selected.declaration}/${selected.operation.id} (${evidence.result!.status})` });
    }
    if (phase === 'fixes' && report.guidance.length) {
      installation.contextualBaseline ??= projectSnapshot(root);
      session.pauseForContext(workRequest(root, session.observation, report), installation);
    }
  }
  const run = session.observation;
  if (run.operations.slice(operationStart).some(evidence => evidence.result?.status === 'failed')) throw new ProductError('CHECKS_FAILED', 'One or more standards checks failed. All remaining ordinary check evidence was collected.');
  session.record({ type: 'final-verification' });
  verifyInstalled();
  if (run.assessments.length && run.assessments[0]!.snapshot !== assessmentSnapshot(root, run.retryHistory?.length)) throw new ProductError('STALE_ASSESSMENT', 'Project content changed after assessment. Refresh the work request, reassess, and rerun checks.');
  session.complete(installation, operationStart);
}

export async function resume(project: string, cliVersion: string, assessmentPath?: string, retry = false) {
  return withResumedRun(project, cliVersion, retry, verifyInstallation, async (session, installation) => {
    if (!installation) {
      const run = session.observation;
      return startRun(run.startInput!, cliVersion, run.inspection, session);
    }
    const root = projectRoot(project);
    if (retry) {
      const prerequisites = await session.prerequisites(onSpawn => preflight(root, installation.report.resolved, onSpawn));
      if (prerequisites.some(probe => probe.code)) throw new ProductError('PREREQUISITES_BLOCKED', 'Resolve the reported prerequisite problems before retry.');
      session.record({ type: 'retry-verification' });
      const progress = session.observation.installation;
      if (progress && !progress.complete) install(root, session, installation);
      return advance(root, session, installation);
    }
    session.record({ type: 'assessment-reading' });
    let assessment: unknown;
    if (assessmentPath !== undefined) {
      try { assessment = JSON.parse(readFileSync(resolve(project, assessmentPath), 'utf8')); }
      catch { throw new ProductError('ASSESSMENT_FORMAT', 'Cannot read the assessment file as JSON. Correct the file and resubmit.'); }
    }
    await advance(root, session, installation, true, assessment);
  });
}

export async function inspectRetained(project: string, cliVersion: string) {
  const root = projectRoot(project);
  if (!existsSync(join(root, '.repo-standards/state.json'))) throw new ProductError('NO_SELECTION', 'No complete adoption is recorded. Inspect a public source with --source, --standards-version and --profile.');
  const { pinned: lock, state } = recordedState(root);
  const inputs = Object.entries(lock.files).filter(([path]) => path.startsWith('.repo-standards/inputs/'));
  for (const [path, expected] of [...inputs, ...Object.entries(lock.files).filter(([path]) => ['.repo-standards/selection.yaml', '.repo-standards/runtime/package.json', '.repo-standards/runtime/package-lock.json'].includes(path))]) {
    const actual = safe(root, path);
    if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) throw new ProductError('STATE_INTEGRITY', `Retained product material changed: ${path}. Restore it from the adopting project's committed baseline.`);
  }
  if (json(inventory(root, '.repo-standards/inputs')) !== json(inputs.map(([path]) => path.slice('.repo-standards/inputs/'.length)).sort())) throw new ProductError('STATE_INTEGRITY', 'Retained input inventory changed.');
  const sourceRoot = existsSync(join(root, '.repo-standards/inputs/source')) ? join(root, '.repo-standards/inputs/source') : join(root, '.repo-standards/inputs');
  const paths = new Set<string>();
  for (const [path] of inputs) if (path.startsWith('.repo-standards/inputs/source/')) {
    const parts = path.slice('.repo-standards/inputs/source/'.length).split('/');
    for (let length = 1; length <= parts.length; length++) paths.add(parts.slice(0, length).join('/'));
  }
  const report = await inspect({ project: root, source: lock.selection.standards.repository, standardsVersion: lock.selection.standards.version, profile: lock.selection.profile }, cliVersion,
    { root: sourceRoot, identity: lock.selection.standards, paths, manifest: readFileSync(join(root, '.repo-standards/inputs/standards.yaml'), 'utf8'), ownedSkills: new Set(Object.keys(state.skills)), close() {} });
  return { ...report, retained: true };
}
