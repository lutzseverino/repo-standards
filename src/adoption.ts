import { concreteScope } from './scope.js';
import { observeWork } from './work-observation.js';
import { validateAssessment } from './assessment.js';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { externalPath, hash } from './acquisition.js';
import { allowedTargets, execute, operations, preflight } from './execution.js';
import { ProductError } from './errors.js';
import { formats } from './formats.js';
import { inspect, inspectForStart, packagedSystemSkill } from './inspection.js';
import type { InspectOptions } from './inspection.js';
import { observe } from './observation.js';
import { json, projectRoot } from './adoption-files.js';
import { withStartRun, withResumedRun } from './adoption-run.js';
import { install, planInstallation, verifyInstallation, type Installation } from './installation.js';
import { readRecordedAdoption } from './recorded-state.js';
import { retainedScopeProjection } from './scope-evidence.js';
import type { AdoptionRunSession, Run, StartInput, WorkRequest } from './adoption-run.js';
export { abandon, status } from './adoption-run.js';
type Inspection = Awaited<ReturnType<typeof inspect>>;
const retainedSource = '.repo-standards/inputs/source';
const packageName = '@lutzseverino/repo-standards';

function workRequest(root: string, run: Run, installation: Installation): WorkRequest {
  const { report } = installation;
  const discovery = report.discovery;
  return { format: formats.workRequest,
    ...(discovery ? { scope: { inspection: run.inspection, afterFixes: installation.scopeAfterFixes!, proposal: discovery.proposal } } : {}), run: run.id, selection: `sha256:${hash(json(run.selection))}`,
    snapshot: workSnapshot(root, run, report.resolved),
    // Guidance is referenced by path and hash; its bytes are the retained input.
    declarations: report.guidance.map(guidance => {
      const discoveryGuidance = discovery?.declarations.find(entry => entry.id === guidance.id);
      return { id: guidance.id, guidance: { ...guidance, retained: `${retainedSource}/${guidance.source}` },
        ...(discoveryGuidance ? { discovery: { ...discoveryGuidance, retained: `${retainedSource}/${discoveryGuidance.source}` } } : {}),
        allowedTargets: allowedTargets(report.resolved.declarations.find(declaration => declaration.id === guidance.id)!) };
    }),
    requiredEvidence: ['status', 'explanation', 'changedPaths', 'evidence', ...(discovery ? ['scope', 'scopeValidity.afterFixes', 'scopeValidity.current'] : [])] };
}

function workSnapshot(root: string, run: Run, resolved: Inspection['resolved']) {
  return `sha256:${hash(json(observeWork(root, concreteScope(resolved))) + `retry:${run.retryHistory?.length ?? 0}`)}`;
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
  const expectedSkill = packagedSystemSkill();
  const installedSkill = observe(join(directory, 'node_modules', packageName, 'skills/adopt-standards'));
  if (expectedSkill.type !== 'directory' || JSON.stringify(installedSkill) !== JSON.stringify(expectedSkill)) throw new ProductError('RUNTIME_IDENTITY', 'The installed runtime does not contain the matching adoption skill.');
  return installedSkill;
}

export async function start(options: InspectOptions, cliVersion: string, confirmation: string) {
  return withStartRun(options.project, session => startRun({ kind: 'public', options }, cliVersion, confirmation, session));
}

export async function startRetained(project: string, cliVersion: string, confirmation: string, scope?: string) {
  return withStartRun(project, session => startRun({ kind: 'retained', project, ...(scope ? { scope } : {}) }, cliVersion, confirmation, session));
}

async function startRun(input: StartInput, cliVersion: string, confirmation: string, session: AdoptionRunSession) {
  const inspectSelection = () => input.kind === 'retained' ? retainedInspection(input.project, cliVersion, input.scope) : inspectForStart(input.options, cliVersion);
  const initial = await inspectSelection();
  const root = initial.report.project.root;
  verifyConfirmation(initial.report, confirmation);
  const proposalPath = input.kind === 'retained' ? input.scope : input.options.scope;
  const scope = proposalPath === undefined ? {} : { scope: realpathSync(resolve(proposalPath)) };
  const startInput: StartInput = input.kind === 'retained' ? { kind: 'retained', project: root, ...scope } : { kind: 'public', options: { ...input.options, project: root, ...scope } };
  session.begin(initial.report, initial.git.head, confirmation, startInput, initial.recorded);
  const prerequisites = await session.prerequisites(onSpawn => preflight(root, initial.report.resolved, onSpawn));
  if (prerequisites.some(probe => probe.code)) throw new ProductError('PREREQUISITES_BLOCKED', 'Resolve the reported executable and version problems; prerequisites are never installed automatically.');
  // Initial adoption installs the runtime; an update replaces it only when
  // the CLI pin changes and otherwise keeps the installed runtime.
  const replaceRuntime = initial.report.update === undefined || initial.report.update.includes('cli');
  const runtime = replaceRuntime ? session.acquireRuntime(directory => prepareRuntime(directory, cliVersion, root)) : undefined;
  // Network/package acquisition can take time. Repeat all Git, source and
  // target checks under the lock before creating any project material. The
  // materials come from this inspection, whose confirmed identity binds their
  // hashes.
  const inspected = await inspectSelection();
  verifyConfirmation(inspected.report, confirmation);
  const installation = planInstallation(root, inspected, confirmation, runtime);
  session.prepareInstallation(installation);
  install(root, session, installation);
  await advance(root, session, installation);
}

async function advance(root: string, session: AdoptionRunSession, installation: Installation, resumed = false, assessment?: unknown) {
  const { report } = installation;
  const verifyInstalled = () => verifyInstallation(root, installation);
  // A resumed assessment is validated before the journal's violations are checked.
  if (resumed) session.journal.continue();
  verifyInstalled();
  if (resumed) {
    session.record({ type: 'assessment-started' });
    if (assessment === undefined) {
      session.journal.open();
      session.pauseForContext(workRequest(root, session.observation, installation));
    }
    const accepted = validateAssessment(root, session.observation, assessment, {
      snapshot: workSnapshot(root, session.observation, report.resolved),
      changedPaths: session.journal.agentChanges(),
    });
    session.record({ type: 'assessment-submitted', assessment: accepted });
    if (accepted.declarations.some(entry => entry.scopeValidity && Object.values(entry.scopeValidity).some(review => review.status === 'blocked'))) throw new ProductError('SCOPE_INCOMPLETE', 'Agent scope review reports incomplete coverage after fixes or at assessment. Additional files are not authorized; preserve work and reconcile the reported scope problem.');
    if (accepted.declarations.some(entry => entry.status === 'blocked')) throw new ProductError('ASSESSMENT_BLOCKED', 'Agent reports blocked contextual work. Resolve the explanation and submit renewed evidence before checks.');
    session.record({ type: 'assessment-accepted' });
    session.journal.requireAuthorized();
  }
  const operationStart = session.observation.operations.length;
  for (const phase of (resumed ? ['checks'] : ['fixes', 'checks']) as ('fixes' | 'checks')[]) {
    for (const selected of operations(report.resolved, phase)) {
      const evidence = await session.authorProcess({ phase, declaration: selected.declaration, id: selected.operation.id },
        onSpawn => execute(root, selected, report.selection, report.resolved, onSpawn), verifyInstalled);
      if (evidence.error) throw new ProductError(evidence.error, `Operation ${selected.declaration}/${selected.operation.id} did not return a successful process and protocol result. Read its logs and preserve changes.`);
      if (evidence.result?.status === 'blocked') throw new ProductError('OPERATION_BLOCKED', `Operation ${selected.declaration}/${selected.operation.id} is blocked: ${evidence.result.message}`);
      session.record({ type: 'operation-accepted', description: `${phase}: ${selected.declaration}/${selected.operation.id} (${evidence.result!.status})` });
    }
    if (phase === 'fixes' && report.guidance.length) {
      if (report.discovery) installation.scopeAfterFixes = workSnapshot(root, session.observation, report.resolved);
      session.journal.open();
      session.pauseForContext(workRequest(root, session.observation, installation), installation);
    }
  }
  const run = session.observation;
  if (run.operations.slice(operationStart).some(evidence => evidence.result?.status === 'failed')) throw new ProductError('CHECKS_FAILED', 'One or more standards checks failed. All remaining ordinary check evidence was collected.');
  session.record({ type: 'final-verification' });
  verifyInstalled();
  session.journal.continue();
  session.journal.requireAuthorized();
  if (run.assessments.length && run.assessments[0]!.snapshot !== workSnapshot(root, run, report.resolved)) throw new ProductError('STALE_ASSESSMENT', 'Project content changed after assessment. Refresh the work request, reassess, and rerun checks.');
  session.complete(installation, operationStart);
}

export async function resume(project: string, cliVersion: string, assessmentPath?: string, retry = false) {
  return withResumedRun(project, cliVersion, retry, async (session, installation) => {
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

export async function inspectRetained(project: string, cliVersion: string, scope?: string) {
  return (await retainedInspection(project, cliVersion, scope)).report;
}

async function retainedInspection(project: string, cliVersion: string, scope?: string) {
  const root = projectRoot(project);
  if (!existsSync(join(root, '.repo-standards/state.json'))) throw new ProductError('NO_SELECTION', 'No complete adoption is recorded. Inspect a public source with --source, --standards-version and --profile.');
  const recorded = readRecordedAdoption(root)!;
  const { selection, scopeHistory } = recorded;
  const inspected = await inspectForStart({ project: root, ...(scope ? { scope } : {}), source: selection.standards.repository, standardsVersion: selection.standards.version, profile: selection.profile }, cliVersion, recorded);
  return { ...inspected, report: { ...inspected.report, retained: true, ...(scopeHistory ? { historicalScope: retainedScopeProjection(scopeHistory) } : {}) } };
}
