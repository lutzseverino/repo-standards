import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { externalPath, hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { git, inspect, observe, targetObservation } from './inspection.js';
import type { Blocker, Content, InspectOptions, Observation } from './inspection.js';

type Inspection = Awaited<ReturnType<typeof inspect>>;
type Baseline = Pick<Content, 'sha256' | 'executable'>;
type Files = Record<string, Content>;
interface Run {
  format: 'repo-standards/run/v1'; id: string; inspection: string;
  selection: Inspection['selection'];
  affected: Record<string, Observation>;
  outcome: 'complete' | 'incomplete'; phase: string; reason: string;
  changes: string[]; completed: string[]; uncertain: string[]; nextAction: string;
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

// Rename a new inode so replacing a tracked hard link never overwrites its
// other names. Recheck target ancestors immediately before each mutation.
function write(root: string, path: string, value: Content) {
  const before = safe(root, path);
  if (before.type === 'file' && before.sha256 === value.sha256 && before.executable === value.executable) return;
  if (!['file', 'missing'].includes(before.type)) throw new ProductError('TARGET_TYPE', `Expected a regular file at ${path}.`);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  safe(root, path);
  const temporary = join(dirname(join(root, path)), `.repo-standards-${randomUUID()}.tmp`);
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
  if (report.guidance.length || report.operations.length) throw new ProductError('UNSUPPORTED_ADOPTION', 'This CLI slice supports exact content without contextual guidance, fixes, or checks. No author requirements were executed or skipped.');
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

export async function start(options: InspectOptions, cliVersion: string, confirmation: string) {
  if (existsSync(lockPath(projectRoot(options.project)))) throw new ProductError('ACTIVE_RUN', 'An adoption run is active or incomplete. Read status and preserve its work before recovery.');
  const initial = await inspect(options, cliVersion);
  const root = initial.project.root;
  const lock = lockPath(root);
  if (existsSync(lock)) throw new ProductError('ACTIVE_RUN', 'An adoption run is active or incomplete. Read status and preserve its work before recovery.');
  verifyConfirmation(initial, confirmation);
  const run: Run = { format: 'repo-standards/run/v1', id: randomUUID(), inspection: confirmation, selection: initial.selection,
    affected: { ...initial.project.affected, [systemTarget]: initial.project.systemSkill }, outcome: 'incomplete',
    phase: 'runtime', reason: 'Run in progress or interrupted.', changes: [], completed: [], uncertain: ['runtime acquisition'],
    nextAction: 'Read status, review actual changes, and preserve the run report before reconciling an interrupted run.' };
  try { writeFileSync(lock, json(run), { flag: 'wx' }); }
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
  function save() {
    const temporaryLock = `${lock}.${run.id}.tmp`;
    try { writeFileSync(temporaryLock, json(run), { flag: 'wx' }); renameSync(temporaryLock, lock); }
    finally { rmSync(temporaryLock, { force: true }); }
    if (localReportReady) write(root, '.repo-standards/local/run.json', file(json(run)));
  }
  try {
    temporary = mkdtempSync(join(externalPath(tmpdir(), root), 'repo-standards-runtime-'));
    const systemSkill = prepareRuntime(temporary, cliVersion, root);
    const runtime = observe(join(temporary, 'node_modules'));
    // Network/package acquisition can take time. Repeat all Git, source and
    // target checks under the lock before creating any project material.
    const report = await inspect(options, cliVersion);
    verifyConfirmation(report, confirmation);
    for (const exact of report.exact) for (const change of exact.files) flatten(change.path, change.after, files);
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
    run.phase = 'installation'; run.uncertain = ['exact content and durable product state installation'];
    // Persist progress before writing exact targets. The Git-directory lock is
    // also an interruption report if local state cannot be written.
    save();
    mutated = true;
    write(root, '.repo-standards/.gitignore', file(ignore)); localReportReady = true; run.changes.push('.repo-standards/.gitignore'); save();
    for (const [path, value] of Object.entries(files)) {
      const before = safe(root, path);
      write(root, path, value);
      if (before.type !== 'file' || before.sha256 !== value.sha256 || before.executable !== value.executable) run.changes.push(path);
      run.completed.push(path); save();
    }
    safe(root, '.repo-standards/runtime/node_modules');
    cpSync(join(temporary, 'node_modules'), join(root, '.repo-standards/runtime/node_modules'), { recursive: true, verbatimSymlinks: true });
    run.completed.push('isolated runtime'); run.phase = 'verification'; run.uncertain = ['final integrity verification']; save();
    verifyFiles(root, files);
    if (json(observe(join(root, '.repo-standards/runtime/node_modules'))) !== json(runtime)) throw new ProductError('FINAL_INTEGRITY', 'The installed runtime dependencies changed.');
    if (json(productInventory(root).sort()) !== json(Object.keys(files).filter(path => path.startsWith('.repo-standards/')).sort())) throw new ProductError('FINAL_INTEGRITY', 'The product state inventory changed.');
    for (const [path, expected] of Object.entries(skills)) if (json(inventory(root, path)) !== json(expected)) throw new ProductError('FINAL_INTEGRITY', `Skill inventory changed: ${path}.`);
    if (json(inventory(root, '.repo-standards/inputs')) !== json(Object.keys(inputs).map(path => path.slice('.repo-standards/inputs/'.length)).sort())) throw new ProductError('FINAL_INTEGRITY', 'Retained input inventory changed.');
    if (git(root, ['rev-parse', 'HEAD']).stdout.trim() !== report.project.head || git(root, ['ls-files', '--stage', '-z']).stdout !== report.project.index) throw new ProductError('FINAL_INTEGRITY', 'HEAD or the index changed during adoption.');
    verifyCommittable(root, [...Object.keys(files), '.repo-standards/state.json']);
    completing = true;
    const completedAt = new Date().toISOString();
    const state = file(json({ format: 'repo-standards/state/v1', lastComplete: { run: run.id, inspection: confirmation, completedAt, head: report.project.head }, baselines: exactBaselines, skills, checks: [], assessments: [] }));
    files['.repo-standards/lock.json'] = file(json({ format: 'repo-standards/lock/v1', selection: report.selection, inspection: confirmation, files: durable, state: { sha256: state.sha256, executable: state.executable } }));
    write(root, '.repo-standards/lock.json', files['.repo-standards/lock.json']!);
    write(root, '.repo-standards/state.json', state);
    verifyFiles(root, { ...files, '.repo-standards/state.json': state });
    run.changes = actualChanges(root, run.affected);
    run.outcome = 'complete'; run.phase = 'complete'; run.reason = 'Exact installation, runtime, retained inputs and durable state verified.';
    run.uncertain = []; run.nextAction = 'Review and commit the uncommitted adoption changes through the project’s normal workflow.'; save();
    return run;
  } catch (error) {
    run.outcome = 'incomplete';
    run.reason = error instanceof ProductError ? `${error.code}: ${error.message}` : (error as Error).message;
    if (completing) {
      run.phase = 'completion';
      run.uncertain = ['Durable completion and final run-report persistence did not both succeed.'];
      run.nextAction = 'Read status, review actual changes, and preserve the run report before reconciling this incomplete adoption. Do not commit it as a complete adoption.';
      try {
        if (safe(root, '.repo-standards/state.json').type !== 'missing') {
          safe(root, '.repo-standards/local/incomplete-state.json');
          renameSync(join(root, '.repo-standards/state.json'), join(root, '.repo-standards/local/incomplete-state.json'));
        }
      } catch { run.uncertain.push('Candidate completion state could not be moved to local/incomplete-state.json; preserve it during manual recovery.'); }
    }
    if (mutated) {
      try { run.changes = actualChanges(root, run.affected); }
      catch { run.uncertain.push('The full set of actual changes could not be read; review the working tree manually.'); }
    }
    if (!mutated) { run.uncertain = []; run.nextAction = 'Resolve the reported problem, inspect again, and confirm the new inspection before retrying.'; }
    try { save(); } catch { /* The original lock still records the interrupted phase. */ }
    return run;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
    if (!mutated || run.outcome === 'complete') rmSync(lock, { force: true });
  }
}

export function status(project: string) {
  const root = projectRoot(project);
  const lock = lockPath(root);
  const active = existsSync(lock) ? JSON.parse(readFileSync(lock, 'utf8')) as Run : null;
  if (active) {
    try { active.changes = actualChanges(root, active.affected); } catch { active.uncertain.push('Current project changes could not be fully read.'); }
    return { format: 'repo-standards/status/v1', selection: active.selection, lastComplete: null, active, evidence: 'historical' };
  }
  if (!existsSync(join(root, '.repo-standards/state.json'))) return { format: 'repo-standards/status/v1', selection: null, lastComplete: null, active, evidence: 'historical' };
  const { state, pinned } = recordedState(root);
  return { format: 'repo-standards/status/v1', selection: pinned.selection, lastComplete: state.lastComplete, baselines: state.baselines as Record<string, Baseline>, skills: state.skills, checks: state.checks, assessments: state.assessments, active, evidence: 'historical' };
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
  if (lock.selection.cli.version !== cliVersion) throw new ProductError('CLI_PIN_MISMATCH', `Use the project-pinned CLI ${lock.selection.cli.version}. Restore it with npm ci --ignore-scripts --prefix .repo-standards/runtime.`);
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
