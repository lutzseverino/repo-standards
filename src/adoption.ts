import { assessmentSnapshot, projectSnapshot, validateAssessment } from './assessment.js';
import type { Assessment } from './assessment.js';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { externalPath, hash } from './acquisition.js';
import { allowedTargets, execute, operations, preflight } from './execution.js';
import type { OperationEvidence, PrerequisiteEvidence } from './execution.js';
import { acquireWorker, executing, processGroupAlive, processIdentity } from './run-lock.js';
import { ProductError } from './errors.js';
import { git, hiddenIndexPaths, inspect, observe, targetBoundaryObservation, targetObservation } from './inspection.js';
import type { Blocker, Content, InspectOptions, Observation } from './inspection.js';

type Inspection = Awaited<ReturnType<typeof inspect>>;
type Baseline = Pick<Content, 'sha256' | 'executable'>;
type Files = Record<string, Content>;
interface Run {
  format: 'repo-standards/run/v1'; id: string; inspection: string;
  selection: Inspection['selection'];
  affected: Record<string, Observation>;
  prerequisites: PrerequisiteEvidence[]; operations: OperationEvidence[];
  outcome: 'complete' | 'incomplete'; phase: string; reason: string;
  workRequest?: WorkRequest; continuation?: string; assessments: Assessment[];
  installation?: { files: string[]; runtime: boolean; trees?: string[] };
  retryHistory?: { phase: string; reason: string; uncertain: string[]; assessments: Assessment[]; report?: string; archivedFiles?: Record<string, string> }[];
  completion?: { state: Content; lock: Content };
  previousComplete?: { selection: Inspection['selection']; lastComplete: { run: string; inspection: string; completedAt: string; head: string } };
  processGroup?: number; processGroupIdentity?: string; archivedFiles?: Record<string, string>; options?: InspectOptions; retained?: boolean; abandoned?: boolean;
  changes: string[]; completed: string[]; uncertain: string[]; nextAction: string;
}

interface WorkRequest {
  format: 'repo-standards/work-request/v1'; run: string; selection: string; snapshot: string;
  declarations: { id: string; guidance: Inspection['guidance'][number]; allowedTargets: { paths: string[]; directories: string[] } }[];
  requiredEvidence: string[];
}
function workRequest(root: string, run: Run, report: Pick<Inspection, 'guidance' | 'resolved'>): WorkRequest {
  return { format: 'repo-standards/work-request/v1', run: run.id, selection: `sha256:${hash(json(run.selection))}`,
    snapshot: assessmentSnapshot(root, run.retryHistory?.length),
    declarations: report.guidance.map(guidance => ({ id: guidance.id, guidance,
      allowedTargets: allowedTargets(report.resolved.declarations.find(declaration => declaration.id === guidance.id)!) })),
    requiredEvidence: ['status', 'explanation', 'changedPaths', 'evidence'] };
}

const packageName = '@lutzseverino/repo-standards';
const systemTarget = '.agents/skills/adopt-standards';
const ignore = '/runtime/node_modules/\n/local/\n/cache/\n';

function json(value: unknown) { return JSON.stringify(value, null, 2) + '\n'; }
function file(text: string): Content { return { sha256: hash(text), executable: false, encoding: 'utf8', content: text }; }
function baselines(files: Files): Record<string, Baseline> {
  return Object.fromEntries(Object.entries(files).map(([path, value]) => [path, { sha256: value.sha256, executable: value.executable }]));
}
function flatten(path: string, value: Observation, files: Files) {
  if (value.type === 'file') files[path] = value;
  else if (value.type === 'directory') for (const [name, child] of Object.entries(value.entries)) flatten(`${path}/${name}`, child, files);
  else throw new ProductError('UNSAFE_CONTENT', `Expected regular source material at ${path}.`);
}

function relativePath(path: string) {
  if (path.split('/').some(part => !part || part === '.' || part === '..') || /[\\\p{Cc}]/u.test(path)) throw new ProductError('STATE_INTEGRITY', `Invalid repository-relative product path: ${path}.`);
}

function safe(root: string, path: string) {
  relativePath(path);
  const blockers: Blocker[] = [];
  const value = targetObservation(root, path, blockers);
  if (blockers.length) throw new ProductError('UNSAFE_TARGET', `Target is no longer safe: ${path}.`, blockers);
  return value;
}

function safeDirectory(root: string, path: string) {
  relativePath(path);
  const blockers: Blocker[] = [];
  const value = targetBoundaryObservation(root, path, blockers);
  if (blockers.length || (value.type !== 'directory' && value.type !== 'missing')) throw new ProductError('UNSAFE_TARGET', `Directory boundary is no longer safe: ${path}.`, blockers);
  return value;
}

function stagedPath(path: string, installationId?: string) {
  return join(dirname(path), `.repo-standards-${installationId ? `${installationId}-${hash(path)}` : randomUUID()}.tmp`);
}

// Rename a new inode so replacing a tracked hard link never overwrites its
// other names. Recheck target ancestors immediately before each mutation.
function write(root: string, path: string, value: Content, installationId?: string) {
  const before = safe(root, path);
  if (before.type === 'file' && before.sha256 === value.sha256 && before.executable === value.executable) return;
  if (!['file', 'missing'].includes(before.type)) throw new ProductError('TARGET_TYPE', `Expected a regular file at ${path}.`);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  safe(root, path);
  const temporary = join(root, stagedPath(path, installationId));
  try {
    writeFileSync(temporary, Buffer.from(value.content, value.encoding), { flag: 'wx', mode: value.executable ? 0o755 : 0o644 });
    chmodSync(temporary, value.executable ? 0o755 : 0o644);
    safe(root, path);
    renameSync(temporary, join(root, path));
  } finally { rmSync(temporary, { force: true }); }
}

function projectRoot(project: string) {
  const result = git(resolve(project), ['rev-parse', '--show-toplevel']);
  if (result.status !== 0) throw new ProductError('GIT_REQUIRED', 'Use a Git working tree.');
  return result.stdout.trim();
}

function lockPath(root: string) {
  const result = git(root, ['rev-parse', '--git-path', 'repo-standards-run.lock']);
  if (result.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot locate the adoption run lock.');
  return resolve(root, result.stdout.trim());
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

function verifyFiles(root: string, files: Files) {
  for (const [path, expected] of Object.entries(files)) {
    const actual = safe(root, path);
    if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) throw new ProductError('FINAL_INTEGRITY', `Expected bytes or executable state changed: ${path}.`);
  }
}

function inventory(root: string, path: string) {
  const files: Files = Object.create(null);
  flatten(path, safe(root, path), files);
  return Object.keys(files).map(name => name.slice(path.length + 1)).sort();
}

function productInventory(root: string, path = '.repo-standards'): string[] {
  return readdirSync(join(root, path)).sort().flatMap(name => {
    const child = `${path}/${name}`;
    if (['.repo-standards/local', '.repo-standards/cache', '.repo-standards/runtime/node_modules'].includes(child)) return [];
    const stat = lstatSync(join(root, child));
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new ProductError('FINAL_INTEGRITY', `Unsafe product state: ${child}.`);
    return stat.isDirectory() ? productInventory(root, child) : [child];
  });
}

function actualChanges(root: string, affected: Record<string, Observation>) {
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']);
  if (status.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot report actual Git changes.');
  const records = status.stdout.split('\0').filter(Boolean);
  const paths = new Set<string>();
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    paths.add(record.slice(3));
    if (/^[RC]|^.[RC]/.test(record)) paths.add(records[++index]!);
  }
  // Git omits ignored material. List product storage and changed exact trees
  // independently, without following links or expanding installed dependencies.
  function collect(path: string) {
    const stat = lstatSync(join(root, path), { throwIfNoEntry: false });
    if (!stat) return;
    if (path === '.repo-standards/runtime/node_modules') { paths.add(path); return; }
    if (stat.isDirectory()) {
      const names = readdirSync(join(root, path));
      if (names.length === 0) paths.add(path);
      for (const name of names) collect(`${path}/${name}`);
    }
    else paths.add(path);
  }
  collect('.repo-standards');
  for (const [path, before] of Object.entries(affected)) {
    relativePath(path);
    const blockers: Blocker[] = [];
    if (json(targetObservation(root, path, blockers)) !== json(before)) {
      paths.add(path);
      if (blockers.length === 0) collect(path);
    }
  }
  return [...paths].sort();
}

function verifyCommittable(root: string, paths: string[]) {
  const result = git(root, ['check-ignore', '-z', '--stdin'], paths.join('\0') + '\0');
  if (result.status !== 0 && result.status !== 1) throw new ProductError('PROJECT_READ', 'Cannot establish whether adoption outputs can be committed.');
  if (result.stdout) throw new ProductError('IGNORED_OUTPUT', `Adoption outputs are ignored by Git: ${result.stdout.split('\0').filter(Boolean).join(', ')}. Reconcile ignore rules before completing adoption.`);
}

function saveRun(root: string, run: Run, localReportReady: boolean) {
  const lock = lockPath(root);
  const temporary = `${lock}.${run.id}.${randomUUID()}.tmp`;
  const mirror = () => { if (localReportReady) write(root, '.repo-standards/local/run.json', file(json(run))); };
  // Live execution ownership must reach the authoritative journal first.
  // Completion is committed only after its local report has also succeeded.
  if (run.outcome === 'complete') mirror();
  try { writeFileSync(temporary, json(run), { flag: 'wx' }); renameSync(temporary, lock); }
  finally { rmSync(temporary, { force: true }); }
  if (run.outcome !== 'complete') mirror();
}

function archiveEvidence(root: string, run: Run, name: string, value: Content) {
  const directory = join(dirname(lockPath(root)), 'repo-standards-reports', run.id);
  const path = join(directory, name);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, Buffer.from(value.content, value.encoding), { flag: 'wx', mode: value.executable ? 0o755 : 0o644 });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
  return relative(root, path);
}

function archiveLocalReport(root: string, run: Run) {
  const value = safe(root, '.repo-standards/local/run.json');
  if (value.type === 'missing') return undefined;
  if (value.type !== 'file') throw new ProductError('RECOVERY_BLOCKED', 'Preserve and reconcile the non-file local run report before recovery.');
  return archiveEvidence(root, run, `report-${value.sha256}.json`, value);
}

function archiveRunEvidence(root: string, run: Run) {
  const archived: Record<string, string> = {};
  const report = archiveLocalReport(root, run);
  if (report) archived['.repo-standards/local/run.json'] = report;
  const logsPath = '.repo-standards/local/operations';
  const logs = safe(root, logsPath);
  if (logs.type !== 'missing') {
    const files: Files = Object.create(null);
    flatten(logsPath, logs, files);
    for (const [path, value] of Object.entries(files)) {
      // An interrupted result may reuse its index on retry. Keep each distinct
      // version so later retries and abandonment cannot replace earlier bytes.
      archived[path] = archiveEvidence(root, run, `${path.slice('.repo-standards/local/'.length)}.${value.sha256}`, value);
    }
  }
  return archived;
}

function preserveIncompleteState(root: string, run: Run) {
  try {
    const state = safe(root, '.repo-standards/state.json');
    if (state.type === 'file' && JSON.parse(Buffer.from(state.content, state.encoding).toString('utf8')).lastComplete?.run === run.id) {
      safe(root, '.repo-standards/local/incomplete-state.json');
      renameSync(join(root, '.repo-standards/state.json'), join(root, '.repo-standards/local/incomplete-state.json'));
    }
  } catch {
    run.uncertain.push('Candidate completion state could not be moved to local/incomplete-state.json; preserve it during manual recovery.');
    return false;
  }
  return true;
}

function recordProcessGroup(root: string, run: Run, group: number) {
  run.processGroup = group;
  run.processGroupIdentity = processIdentity(group) ?? 'exited';
  saveRun(root, run, false);
}

function clearStoppedProcess(run: Run) {
  if (run.processGroup && processGroupAlive(run.processGroup, run.processGroupIdentity)) throw new ProductError('AUTHOR_PROCESS_ACTIVE', `Author process group ${run.processGroup} still has live processes. Stop them before retry or abandonment.`);
  delete run.processGroup;
  delete run.processGroupIdentity;
}

export async function start(options: InspectOptions, cliVersion: string, confirmation: string) {
  const release = acquireWorker(lockPath(projectRoot(options.project)));
  try { return await startRun(options, cliVersion, confirmation); } finally { release(); }
}

export async function startRetained(project: string, cliVersion: string, confirmation: string) {
  const options = { source: '', standardsVersion: '', profile: '', project };
  const release = acquireWorker(lockPath(projectRoot(project)));
  try { return await startRun(options, cliVersion, confirmation, undefined, true); } finally { release(); }
}

async function startRun(options: InspectOptions, cliVersion: string, confirmation: string, recovering?: Run, retained = recovering?.retained ?? false) {
  if (!recovering && existsSync(lockPath(projectRoot(options.project)))) throw new ProductError('ACTIVE_RUN', 'An adoption run is active or incomplete. Read status and preserve its work before recovery.');
  const inspectSelection = () => retained ? inspectRetained(options.project, cliVersion) : inspect(options, cliVersion);
  const initial = await inspectSelection();
  const root = initial.project.root;
  const previousComplete = initial.update ? recordedState(root) : undefined;
  const lock = lockPath(root);
  if (!recovering && existsSync(lock)) throw new ProductError('ACTIVE_RUN', 'An adoption run is active or incomplete. Read status and preserve its work before recovery.');
  verifyConfirmation(initial, confirmation);
  const run: Run = recovering ?? { format: 'repo-standards/run/v1', id: randomUUID(), inspection: confirmation, selection: initial.selection, options: { ...options, project: root }, ...(retained ? { retained: true } : {}),
    ...(previousComplete ? { previousComplete: { selection: previousComplete.pinned.selection, lastComplete: previousComplete.state.lastComplete } } : {}),
    affected: { ...initial.project.affected, [systemTarget]: initial.project.systemSkill }, outcome: 'incomplete',
    prerequisites: [], operations: [], assessments: [], phase: 'prerequisites', reason: 'Run in progress or interrupted.', changes: [], completed: [], uncertain: ['prerequisite probes'],
    nextAction: 'Read status, review actual changes, stop any surviving author process, then use resume --retry to recover this incomplete adoption, or abandon to preserve its work and report.' };
  try { if (recovering) saveRun(root, run, false); else writeFileSync(lock, json(run), { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ProductError('ACTIVE_RUN', 'Another adoption run holds the project lock. Read status.');
    throw error;
  }
  let temporary: string | undefined;
  let mutated = false;
  let localReportReady = false;
  let completing = false;
  const files: Files = Object.create(null);
  const skills: Record<string, string[]> = Object.create(null);
  const save = () => saveRun(root, run, localReportReady);
  try {
    run.prerequisites = await preflight(root, initial.resolved, group => recordProcessGroup(root, run, group));
    clearStoppedProcess(run);
    if (run.prerequisites.some(probe => probe.code)) throw new ProductError('PREREQUISITES_BLOCKED', 'Resolve the reported executable and version problems; prerequisites are never installed automatically.');
    run.phase = 'runtime'; run.uncertain = ['runtime acquisition']; save();
    temporary = mkdtempSync(join(externalPath(tmpdir(), root), 'repo-standards-runtime-'));
    const systemSkill = prepareRuntime(temporary, cliVersion, root);
    const runtime = observe(join(temporary, 'node_modules'));
    // Network/package acquisition can take time. Repeat all Git, source and
    // target checks under the lock before creating any project material.
    const report = await inspectSelection();
    verifyConfirmation(report, confirmation);
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
      const value = observe(join(temporary, name));
      flatten(`.repo-standards/runtime/${name}`, value, files);
    }
    const durable = baselines(files);
    files['.repo-standards/lock.json'] = file(json({ format: 'repo-standards/lock/v1', selection: report.selection, inspection: confirmation, files: durable }));
    const replaceTrees = report.update === 'standards' ? [systemTarget, '.repo-standards/inputs', ...report.resolved.declarations
      .filter(declaration => declaration.kind === 'skill').map(declaration => `.agents/skills/${declaration.name}`)] : report.update === 'cli' ? [systemTarget] : [];
    const transitional: Files = Object.create(null);
    if (report.update) {
      const oldState = safe(root, '.repo-standards/state.json');
      if (oldState.type === 'file') transitional['.repo-standards/state.json'] = oldState;
    }
    const installation: Installation = { report, files, skills, exactBaselines, durable, runtimeHash: hash(json(runtime)), replaceTrees, transitional,
      before: Object.fromEntries([...new Set([...Object.keys(files), ...replaceTrees])].map(path => [path, safe(root, path)])) };
    cpSync(join(temporary, 'node_modules'), `${lock}.runtime`, { recursive: true, verbatimSymlinks: true });
    run.installation = { files: [], runtime: false };
    persistInstallation(root, run, installation);
    run.phase = 'installation'; run.uncertain = ['exact content and durable product state installation'];
    save();
    mutated = true;
    install(root, run, installation, () => { localReportReady = true; }, save);
    return await advance(root, run, installation, save, () => { completing = true; });
  } catch (error) {
    run.outcome = 'incomplete';
    run.reason = error instanceof ProductError ? `${error.code}: ${error.message}` : (error as Error).message;
    if (completing) {
      run.phase = 'completion';
      run.uncertain = ['Durable completion and final run-report persistence did not both succeed.'];
      run.nextAction = 'Read status, review actual changes, and preserve the run report before reconciling this incomplete adoption. Do not commit it as a complete adoption.';
      preserveIncompleteState(root, run);
    }
    if (mutated) {
      try { run.changes = actualChanges(root, run.affected); }
      catch { run.uncertain.push('The full set of actual changes could not be read; review the working tree manually.'); }
    }
    if (!mutated && !run.processGroup) { run.uncertain = []; run.nextAction = 'Resolve the reported problem, inspect again, and confirm the new inspection before retrying.'; }
    try { save(); } catch { /* The original lock still records the interrupted phase. */ }
    return run;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
    if ((!mutated && !run.processGroup) || run.outcome === 'complete') cleanupRun(lock);
  }
}

interface Installation {
  report: Inspection; files: Files; skills: Record<string, string[]>;
  exactBaselines: Record<string, Baseline>; durable: Record<string, Baseline>;
  runtimeHash: string; contextualBaseline?: string; before: Record<string, Observation>;
  replaceTrees?: string[]; transitional?: Files;
}
function cleanupRun(lock: string) {
  rmSync(lock, { force: true });
  rmSync(`${lock}.runtime`, { recursive: true, force: true });
  for (const name of readdirSync(dirname(lock))) if (name.startsWith(lock.slice(dirname(lock).length + 1) + '.context')) rmSync(join(dirname(lock), name), { force: true });
}

function persistInstallation(root: string, run: Run, installation: Installation) {
  const content = json(installation);
  const identity = hash(content);
  const path = `${lockPath(root)}.context.${identity}`;
  if (!existsSync(path)) writeFileSync(path, content, { flag: 'wx' });
  run.continuation = identity;
}

function readInstallation(root: string, run: Run): Installation {
  if (!run.continuation) throw new ProductError('RESUME_UNAVAILABLE', 'Installation was not prepared. Abandon this run, inspect again, and confirm a new start.');
  const lock = lockPath(root);
  const path = `${lock}.context.${run.continuation}`;
  const content = readFileSync(existsSync(path) ? path : `${lock}.context`, 'utf8');
  if (hash(content) !== run.continuation) throw new ProductError('STATE_INTEGRITY', 'Saved installation changed. Preserve the run and restore its recorded state.');
  return JSON.parse(content) as Installation;
}

function verifyGit(root: string, report: Inspection) {
  if (git(root, ['rev-parse', 'HEAD']).stdout.trim() !== report.project.head || git(root, ['ls-files', '--stage', '-z']).stdout !== report.project.index) throw new ProductError('FINAL_INTEGRITY', 'HEAD or the index changed during adoption.');
  const hidden = hiddenIndexPaths(root);
  if (json(hidden) !== json(report.project.hidden)) throw new ProductError('FINAL_INTEGRITY', `The hidden index flags changed during adoption: ${hidden.join(', ')}. Reconcile skip-worktree and assume-unchanged flags before recovery.`);
}

function stagedFiles(root: string, files: Files, runId: string, alternatives: Files = {}) {
  const temporaries: string[] = [];
  for (const [path, expected] of Object.entries(files)) {
    const temporary = stagedPath(path, runId);
    const actual = safe(root, temporary);
    if (actual.type === 'missing') continue;
    const candidates = [expected, alternatives[path]].filter(value => value !== undefined);
    if (actual.type !== 'file' || !candidates.some(value => {
      const bytes = Buffer.from(actual.content, actual.encoding);
      return Buffer.from(value.content, value.encoding).subarray(0, bytes.length).equals(bytes);
    })) throw new ProductError('INSTALLATION_CHANGED', `Staged installation content changed: ${temporary}. Preserve and reconcile it before retry.`);
    temporaries.push(temporary);
  }
  return temporaries;
}

function install(root: string, run: Run, installation: Installation, localReady: () => void, save: () => void) {
  run.phase = 'installation'; run.uncertain = ['installed progress verification']; save();
  const progress = run.installation!;
  const { files, before, report } = installation;
  const replaceTrees = installation.replaceTrees ?? [];
  const progressedTrees = progress.trees ??= [];
  verifyGit(root, report);
  for (const tree of replaceTrees) {
    const actual = safe(root, tree);
    if (json(actual) === json(before[tree])) continue;
    if (!progressedTrees.includes(tree)) throw new ProductError('INSTALLATION_CHANGED', `Owned tree changed before replacement: ${tree}. Reconcile it before retry.`);
    if (actual.type === 'missing') continue;
    const observed: Files = Object.create(null);
    flatten(tree, actual, observed);
    if (Object.entries(observed).some(([path, value]) => files[path]?.sha256 !== value.sha256 || files[path]?.executable !== value.executable)) {
      throw new ProductError('INSTALLATION_CHANGED', `Owned tree changed during replacement: ${tree}. Preserve and reconcile added or modified resources before retry.`);
    }
  }
  // Validate the entire remaining plan before writing any part of it. An
  // unrecorded atomic write may contain either the inspected or expected bytes.
  for (const [path, expected] of Object.entries(files)) {
    const actual = safe(root, path);
    const matches = actual.type === 'file' && actual.sha256 === expected.sha256 && actual.executable === expected.executable;
    const replacing = replaceTrees.find(tree => path.startsWith(tree + '/'));
    const recoverableTreeState = replacing && progressedTrees.includes(replacing) && (actual.type === 'missing' || matches);
    if (!matches && !recoverableTreeState && (progress.files.includes(path) || json(actual) !== json(before[path]))) throw new ProductError('INSTALLATION_CHANGED', `Installed or pending content changed: ${path}. Reconcile it before retry; recovery will not overwrite edits.`);
  }
  const temporaries = stagedFiles(root, files, run.id);
  for (const skill of Object.keys(installation.skills).filter(skill => !replaceTrees.includes(skill))) {
    const current = safe(root, skill);
    if (current.type === 'missing') continue;
    const observed: Files = Object.create(null);
    flatten(skill, current, observed);
    if (Object.keys(observed).some(path => !Object.hasOwn(files, path) && !temporaries.includes(path))) throw new ProductError('INSTALLATION_CHANGED', `Skill inventory changed: ${skill}. Preserve added resources before retry.`);
  }
  const transitional = installation.transitional ?? {};
  if (safeDirectory(root, '.repo-standards').type !== 'missing' && productInventory(root).some(path => !Object.hasOwn(files, path) && !Object.hasOwn(transitional, path) && !replaceTrees.some(tree => path.startsWith(tree + '/')) && !temporaries.includes(path))) throw new ProductError('INSTALLATION_CHANGED', 'Product state inventory changed. Reconcile additions before retry.');
  const staged = observe(`${lockPath(root)}.runtime`);
  if (hash(json(staged)) !== installation.runtimeHash) throw new ProductError('STATE_INTEGRITY', 'The saved runtime installation changed. Preserve the run and restore its recorded runtime.');
  const runtimePath = '.repo-standards/runtime/node_modules';
  const runtime = safeDirectory(root, runtimePath);
  function partial(actual: Observation, expected: Observation): boolean {
    if (actual.type === 'missing') return true;
    if (actual.type === 'directory' && expected.type === 'directory') return Object.entries(actual.entries).every(([name, child]) => expected.entries[name] !== undefined && partial(child, expected.entries[name]!));
    return json(actual) === json(expected);
  }
  if (progress.runtime ? hash(json(runtime)) !== installation.runtimeHash : !report.update && !partial(runtime, staged)) throw new ProductError('INSTALLATION_CHANGED', 'Runtime content changed. Reconcile it before retry.');
  for (const path of temporaries) { safe(root, path); rmSync(join(root, path)); }
  run.phase = 'installation'; run.uncertain = ['exact content and durable product state installation']; save();
  const ignorePath = '.repo-standards/.gitignore';
  write(root, ignorePath, files[ignorePath]!, run.id); localReady();
  if (!progress.files.includes(ignorePath)) progress.files.push(ignorePath);
  save();
  for (const tree of replaceTrees) {
    if (!progressedTrees.includes(tree)) { progressedTrees.push(tree); save(); }
    progress.files = progress.files.filter(path => !path.startsWith(tree + '/'));
    safeDirectory(root, tree);
    rmSync(join(root, tree), { recursive: true, force: true });
  }
  for (const [path, value] of Object.entries(files)) {
    if (progress.files.includes(path)) continue;
    write(root, path, value, run.id);
    progress.files.push(path); run.completed.push(path); save();
  }
  if (!progress.runtime) {
    safeDirectory(root, runtimePath);
    const runtimeStage = '.repo-standards/local/runtime-stage';
    safeDirectory(root, runtimeStage);
    rmSync(join(root, runtimeStage), { recursive: true, force: true });
    cpSync(`${lockPath(root)}.runtime`, join(root, runtimeStage), { recursive: true, verbatimSymlinks: true });
    if (hash(json(observe(join(root, runtimeStage)))) !== installation.runtimeHash) throw new ProductError('FINAL_INTEGRITY', 'Runtime staging did not finish correctly.');
    safeDirectory(root, runtimePath);
    rmSync(join(root, runtimePath), { recursive: true, force: true });
    renameSync(join(root, runtimeStage), join(root, runtimePath));
    progress.runtime = true; run.completed.push('isolated runtime');
  }
  run.phase = 'verification'; run.uncertain = ['final integrity verification']; save();
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

async function advance(root: string, run: Run, installation: Installation, save: () => void, onCompleting: () => void, resumed = false, assessment?: unknown) {
  const { report, files, skills, exactBaselines, durable } = installation;
  const lock = lockPath(root);
  const verifyInstalled = () => verifyInstallation(root, installation);
  verifyInstalled();
  if (resumed) {
    run.phase = 'assessment'; run.uncertain = ['Agent assessment has not been accepted.'];
    if (assessment === undefined) {
      run.workRequest = workRequest(root, run, report);
      run.phase = 'contextual';
      throw new ProductError('CONTEXTUAL_REQUIRED', 'Review the refreshed work request and submit an assessment for its snapshot.');
    }
    run.assessments = [validateAssessment(root, run, installation.contextualBaseline!, assessment)];
    save();
    if (run.assessments[0]!.declarations.some(entry => entry.status === 'blocked')) throw new ProductError('ASSESSMENT_BLOCKED', 'Agent reports blocked contextual work. Resolve the explanation and submit renewed evidence before checks.');
    run.completed.push('agent assessment'); save();
  }
  const operationStart = run.operations.length;
  for (const phase of (resumed ? ['checks'] : ['fixes', 'checks']) as ('fixes' | 'checks')[]) {
    for (const selected of operations(report.resolved, phase)) {
      run.phase = phase; run.reason = 'Run in progress or interrupted.';
      run.uncertain = [`${selected.declaration}/${selected.operation.id}: process outcome uncertain until recorded`]; save();
      const persistedRun = file(json(run));
      const before = phase === 'checks' ? projectSnapshot(root) : null;
      // Author code may run as soon as spawn returns. Persist its ownership in
      // Git without overwriting the local report it might already have changed.
      const evidence = await execute(root, selected, report.selection, report.resolved, group => recordProcessGroup(root, run, group));
      const persistedLock = file(json(run));
      const log = `.repo-standards/local/operations/${run.operations.length}`;
      write(root, `${log}.stdout`, file(evidence.stdout));
      write(root, `${log}.stderr`, file(evidence.stderr));
      evidence.stdout = `${log}.stdout`; evidence.stderr = `${log}.stderr`;
      run.operations.push(evidence);
      clearStoppedProcess(run);
      run.uncertain = ['Post-operation integrity verification has not succeeded.'];
      const currentRun = safe(root, '.repo-standards/local/run.json');
      if (currentRun.type === 'file' && currentRun.sha256 !== persistedRun.sha256) write(root, `${log}.altered-run.json`, currentRun);
      verifyFiles(root, { '.repo-standards/local/run.json': persistedRun });
      const currentLock = observe(lock);
      if (currentLock.type !== 'file' || currentLock.sha256 !== persistedLock.sha256) throw new ProductError('FINAL_INTEGRITY', 'The active adoption run lock changed during author execution.');
      verifyInstalled();
      if (before !== null && projectSnapshot(root) !== before) throw new ProductError('CHECK_MUTATION', `Check ${selected.declaration}/${selected.operation.id} changed observed project content. Changes are preserved; checks must be read-only.`);
      run.uncertain = [];
      if (evidence.error) throw new ProductError(evidence.error, `Operation ${selected.declaration}/${selected.operation.id} did not return a successful process and protocol result. Read its logs and preserve changes.`);
      if (evidence.result?.status === 'blocked') throw new ProductError('OPERATION_BLOCKED', `Operation ${selected.declaration}/${selected.operation.id} is blocked: ${evidence.result.message}`);
      run.completed.push(`${phase}: ${selected.declaration}/${selected.operation.id} (${evidence.result!.status})`); save();
    }
    if (phase === 'fixes' && report.guidance.length) {
      installation.contextualBaseline ??= projectSnapshot(root);
      persistInstallation(root, run, installation);
      run.phase = 'contextual'; run.uncertain = ['Contextual work and assessment are required before checks.'];
      run.workRequest = workRequest(root, run, report);
      run.nextAction = 'Apply the selected guidance, refresh the work request with resume, and submit evidence using resume --assessment <file>.';
      throw new ProductError('CONTEXTUAL_REQUIRED', 'Exact installation and fixes succeeded; contextual guidance requires agent work and assessment before checks can run.');
    }
  }
  if (run.operations.slice(operationStart).some(evidence => evidence.result?.status === 'failed')) throw new ProductError('CHECKS_FAILED', 'One or more standards checks failed. All remaining ordinary check evidence was collected.');
  run.phase = 'verification'; run.uncertain = ['final integrity verification']; save();
  verifyInstalled();
  if (run.assessments.length && run.assessments[0]!.snapshot !== assessmentSnapshot(root, run.retryHistory?.length)) throw new ProductError('STALE_ASSESSMENT', 'Project content changed after assessment. Refresh the work request, reassess, and rerun checks.');
  onCompleting();
  const completedAt = new Date().toISOString();
  const state = file(json({ format: 'repo-standards/state/v1', lastComplete: { run: run.id, inspection: run.inspection, completedAt, head: report.project.head }, baselines: exactBaselines, skills, checks: run.operations.slice(operationStart).filter(evidence => evidence.operation.phase === 'checks'), assessments: run.assessments }));
  const completionLock = file(json({ format: 'repo-standards/lock/v1', selection: report.selection, inspection: run.inspection, files: durable, state: { sha256: state.sha256, executable: state.executable } }));
  run.completion = { state, lock: completionLock };
  run.phase = 'completion'; run.uncertain = ['Durable completion and final run-report persistence have not both succeeded.']; save();
  write(root, '.repo-standards/lock.json', completionLock, run.id);
  write(root, '.repo-standards/state.json', state, run.id);
  verifyFiles(root, { ...files, '.repo-standards/lock.json': completionLock, '.repo-standards/state.json': state });
  run.changes = actualChanges(root, run.affected);
  run.outcome = 'complete'; run.phase = 'complete'; run.reason = 'Exact installation, fixes, contextual assessment where required, checks, runtime, retained inputs and durable state verified.';
  run.uncertain = []; run.nextAction = 'Review and commit the uncommitted adoption changes through the project’s normal workflow.'; save();
  return run;
}

function canResumeAssessment(run: Run) {
  return !!run.continuation && (
    run.phase === 'contextual' || run.phase === 'assessment'
    || (run.phase === 'checks' && run.reason.startsWith('CHECKS_FAILED:') && run.uncertain.length === 0)
    || (run.phase === 'verification' && run.reason.startsWith('STALE_ASSESSMENT:'))
  );
}

export async function resume(project: string, cliVersion: string, assessmentPath?: string, retry = false) {
  const root = projectRoot(project);
  const lock = lockPath(root);
  const release = acquireWorker(lock);
  try {
    if (!existsSync(lock)) throw new ProductError('NO_ACTIVE_RUN', 'No incomplete adoption is available to resume.');
    const run = JSON.parse(readFileSync(lock, 'utf8')) as Run;
    if (run.selection.cli.version !== cliVersion) throw new ProductError('CLI_PIN_MISMATCH', `Use the project-pinned CLI ${run.selection.cli.version}.`);
    if (run.processGroup && processGroupAlive(run.processGroup, run.processGroupIdentity)) throw new ProductError('ACTIVE_RUN', `Author process group ${run.processGroup} is still running. Stop it before retry or abandonment.`);
    if (!retry && !canResumeAssessment(run)) throw new ProductError('RESUME_UNAVAILABLE', 'Explicit recovery is required. Review status and use resume --retry, or abandon to preserve the incomplete work and report.');
    if (retry && !run.continuation && run.options) return await startRun(run.options, cliVersion, run.inspection, run, run.retained);
    const installation = readInstallation(root, run);
    let completing = false;
    const ignoreFile = safe(root, '.repo-standards/.gitignore');
    let localReady = ignoreFile.type === 'file' && ignoreFile.sha256 === hash(ignore);
    const save = () => saveRun(root, run, localReady);
    // The last author process may have changed this mirror after the CLI died.
    // Preserve its actual bytes before any retry mutation or catch-path save;
    // failure to archive must leave both the mirror and journal untouched.
    const archivedFiles = retry && localReady ? archiveRunEvidence(root, run) : {};
    const interruptedReport = archivedFiles['.repo-standards/local/run.json'];
    try {
      if (retry) {
        if (run.completion) {
          const extra: Files = {};
          const temporaries = stagedFiles(root, { '.repo-standards/lock.json': run.completion.lock, '.repo-standards/state.json': run.completion.state }, run.id, installation.files);
          for (const path of temporaries) flatten(path, safe(root, path), extra);
          const lockFile = safe(root, '.repo-standards/lock.json');
          if (lockFile.type === 'file' && lockFile.sha256 === run.completion.lock.sha256) extra['.repo-standards/lock.json'] = run.completion.lock;
          if (safe(root, '.repo-standards/state.json').type !== 'missing') extra['.repo-standards/state.json'] = run.completion.state;
          verifyInstallation(root, installation, extra);
          for (const path of temporaries) { safe(root, path); rmSync(join(root, path)); }
          if (run.outcome === 'complete') return run;
          if (!preserveIncompleteState(root, run)) throw new ProductError('RECOVERY_BLOCKED', 'Cannot preserve candidate completion state. Resolve local/incomplete-state.json storage before retry; the run remains active.');
          write(root, '.repo-standards/lock.json', installation.files['.repo-standards/lock.json']!, run.id);
          delete run.completion;
        }
        (run.retryHistory ??= []).push({ phase: run.phase, reason: run.reason, uncertain: [...run.uncertain], assessments: run.assessments, archivedFiles, ...(interruptedReport ? { report: interruptedReport } : {}) });
        run.outcome = 'incomplete'; run.phase = 'prerequisites';
        clearStoppedProcess(run);
        run.assessments = [];
        delete run.workRequest;
        run.reason = 'Explicit retry in progress or interrupted.';
        run.nextAction = 'Review this incomplete adoption with status; use resume --retry after reconciliation, or abandon to preserve the work.';
        save();
        run.prerequisites = await preflight(root, installation.report.resolved, group => recordProcessGroup(root, run, group));
        clearStoppedProcess(run);
        if (run.prerequisites.some(probe => probe.code)) throw new ProductError('PREREQUISITES_BLOCKED', 'Resolve the reported prerequisite problems before retry.');
        run.phase = 'verification'; run.uncertain = ['installed progress verification']; save();
        if (run.installation && !run.installation.runtime) install(root, run, installation, () => { localReady = true; }, save);
        return await advance(root, run, installation, save, () => { completing = true; });
      }
      verifyFiles(root, { '.repo-standards/local/run.json': file(json(run)) });
      run.phase = 'assessment';
      let assessment: unknown;
      if (assessmentPath !== undefined) {
        try { assessment = JSON.parse(readFileSync(resolve(project, assessmentPath), 'utf8')); }
        catch { throw new ProductError('ASSESSMENT_FORMAT', 'Cannot read the assessment file as JSON. Correct the file and resubmit.'); }
      }
      return await advance(root, run, installation, save, () => { completing = true; }, true, assessment);
    } catch (error) {
      run.outcome = 'incomplete';
      run.reason = error instanceof ProductError ? `${error.code}: ${error.message}` : (error as Error).message;
      if (completing) {
        run.phase = 'completion'; run.uncertain = ['Durable completion and final run-report persistence did not both succeed.'];
        preserveIncompleteState(root, run);
      }
      try { run.changes = actualChanges(root, run.affected); }
      catch { run.uncertain.push('Current project changes could not be fully read.'); }
      run.nextAction = canResumeAssessment(run)
        ? 'Review the reported problem and preserved changes. Reconcile them, refresh with resume, and submit renewed evidence with resume --assessment <file>.'
        : 'Explicit recovery is required. Review this incomplete adoption, reconcile changes, then use resume --retry, or abandon to preserve the work and report.';
      try { save(); } catch { /* Preserve the original interruption record. */ }
      return run;
    } finally {
      if (run.outcome === 'complete') cleanupRun(lock);
    }
  } finally { release(); }
}

function abandonedReports(lock: string): Run[] {
  const directory = join(dirname(lock), 'repo-standards-reports');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).sort().filter(name => name.endsWith('.json')).map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')) as Run);
}

export function abandon(project: string, cliVersion: string) {
  const root = projectRoot(project);
  const lock = lockPath(root);
  const release = acquireWorker(lock);
  try {
    if (!existsSync(lock)) throw new ProductError('NO_ACTIVE_RUN', 'No incomplete adoption is available to abandon.');
    const run = JSON.parse(readFileSync(lock, 'utf8')) as Run;
    if (run.selection.cli.version !== cliVersion) throw new ProductError('CLI_PIN_MISMATCH', `Use the project-pinned CLI ${run.selection.cli.version}.`);
    if (run.processGroup && processGroupAlive(run.processGroup, run.processGroupIdentity)) throw new ProductError('ACTIVE_RUN', `Author process group ${run.processGroup} is still running. Stop it before abandonment.`);
    if (run.outcome === 'complete') throw new ProductError('ALREADY_COMPLETE', 'This adoption completed before interruption. Use resume --retry to verify and release its remaining progress record.');
    run.archivedFiles = archiveRunEvidence(root, run);
    for (const operation of run.operations) for (const stream of ['stdout', 'stderr'] as const) {
      const archived = run.archivedFiles[operation[stream]];
      if (!archived) throw new ProductError('RECOVERY_BLOCKED', `Cannot archive operation evidence: ${operation[stream]}. Restore the log before abandonment.`);
      operation[stream] = archived;
    }
    if (run.completion && !preserveIncompleteState(root, run)) throw new ProductError('RECOVERY_BLOCKED', 'Cannot preserve candidate completion state. Resolve local/incomplete-state.json storage before abandonment; the run remains active.');
    run.abandoned = true;
    run.reason = `ABANDONED: ${run.reason}`;
    run.changes = actualChanges(root, run.affected);
    run.nextAction = 'Review the archived report with status and reconcile the preserved project changes through the normal workflow. A new adoption needs a fresh confirmed inspection.';
    const directory = join(dirname(lock), 'repo-standards-reports');
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `${run.id}.json`);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, json(run), { flag: 'wx' }); renameSync(temporary, path); }
    finally { rmSync(temporary, { force: true }); }
    cleanupRun(lock);
    return run;
  } finally { release(); }
}

export function status(project: string) {
  const root = projectRoot(project);
  const lock = lockPath(root);
  const abandoned = abandonedReports(lock);
  const active = existsSync(lock) ? JSON.parse(readFileSync(lock, 'utf8')) as Run : null;
  if (active) {
    try { active.changes = actualChanges(root, active.affected); } catch { active.uncertain.push('Current project changes could not be fully read.'); }
    return { format: 'repo-standards/status/v1', selection: active.selection, lastComplete: active.previousComplete?.lastComplete ?? null, active,
      execution: executing(lock) || (active.processGroup && processGroupAlive(active.processGroup, active.processGroupIdentity)) ? 'active' : 'interrupted', abandoned, evidence: 'historical' };
  }
  if (!existsSync(join(root, '.repo-standards/state.json'))) return { format: 'repo-standards/status/v1', selection: null, lastComplete: null, active, abandoned, evidence: 'historical' };
  const { state, pinned } = recordedState(root);
  return { format: 'repo-standards/status/v1', selection: pinned.selection, lastComplete: state.lastComplete, baselines: state.baselines as Record<string, Baseline>, skills: state.skills, checks: state.checks, assessments: state.assessments, active, abandoned, evidence: 'historical' };
}

function recordedState(root: string) {
  const lock = safe(root, '.repo-standards/lock.json');
  const observed = safe(root, '.repo-standards/state.json');
  if (lock.type !== 'file' || observed.type !== 'file') throw new ProductError('STATE_INTEGRITY', 'Complete adoption state or integrity lock is missing.');
  const pinned = JSON.parse(Buffer.from(lock.content, lock.encoding).toString('utf8')) as {
    format: string; selection: Inspection['selection']; inspection: string; files: Record<string, Baseline>; state: Baseline;
  };
  if (pinned.format !== 'repo-standards/lock/v1' || pinned.state?.sha256 !== observed.sha256 || pinned.state.executable !== observed.executable) throw new ProductError('STATE_INTEGRITY', 'Last-complete state changed. Restore the committed product state before using its evidence.');
  const state = JSON.parse(Buffer.from(observed.content, observed.encoding).toString('utf8')) as {
    lastComplete: { run: string; inspection: string; completedAt: string; head: string }; baselines: Record<string, Baseline>; skills: Record<string, string[]>; checks: unknown[]; assessments: unknown[];
  };
  return { state, pinned };
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
