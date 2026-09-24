import type { WorkObservation } from './work-observation.js';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { externalPath, hash } from './acquisition.js';
import { tmpdir } from 'node:os';
import type { Assessment, ScopeConfirmation } from './assessment.js';
import type { OperationEvidence, PrerequisiteEvidence } from './execution.js';
import { ProductError } from './errors.js';
import { formats, recordPath, requireFormat } from './formats.js';
import { latestScopeChanges } from './scope-evidence.js';
import type { InspectOptions, inspect } from './inspection.js';
import { observe, type Content, type HashInventory, type Observation } from './observation.js';
import { readRecordedAdoption, rejectRetiredRecords, type RecordedAdoption } from './recorded-state.js';
import { committedEvidenceReport, compactIntervals, keptIdentity, memoryStore, WorkEvidenceJournal, type ObservationStore, type RecordedInterval } from './work-evidence.js';
import { acquireWorker, executing, processGroupAlive, processIdentity } from './run-lock.js';
import { actualChanges, file, flatten, ignore, json, lockPath, projectRoot, safe, systemTarget, verifyFiles, write } from './adoption-files.js';
import type { Baseline, Files } from './adoption-files.js';
import { completionFiles, exactContent, restorePlannedLock, verifyInstallation, withdrawCompletionState, writeCompletion, type Installation } from './installation.js';

// Persisted labels are shared by several producers. Keep their serialized
// values stable so existing incomplete runs remain readable.
const pendingWork = {
  contextual: 'Contextual work and assessment are required before checks.',
  assessment: 'Agent assessment has not been accepted.',
} as const;

type Inspection = Awaited<ReturnType<typeof inspect>>;
export type StartInput = { kind: 'public'; options: InspectOptions } | { kind: 'retained'; project: string; scope?: string };
export interface Run {
  format: typeof formats.run; id: string; inspection: string;
  selection: Inspection['selection'];
  // HEAD at start, recorded for provenance; the inspection identity does not bind it.
  head: string | null;
  affected: Record<string, HashInventory>;
  prerequisites: PrerequisiteEvidence[]; operations: OperationEvidence[];
  observations: RecordedInterval[];
  outcome: 'complete' | 'incomplete'; phase: string; reason: string;
  workRequest?: WorkRequest; continuation?: string; assessments: Assessment[];
  installation?: { files: string[]; runtime: boolean; complete?: boolean; trees?: Record<string, 'removing' | 'installing'> };
  retryHistory?: { phase: string; reason: string; uncertain: string[]; assessments: Assessment[]; report?: string; archivedFiles?: Record<string, string> }[];
  completion?: { state: Baseline; lock: Baseline };
  previousComplete?: { selection: Inspection['selection']; lastComplete: { run: string; inspection: string; completedAt: string; head: string } };
  processGroup?: number; processGroupIdentity?: string; archivedFiles?: Record<string, string>; startInput?: StartInput; abandoned?: boolean;
  changes: string[]; completed: string[]; uncertain: string[]; nextAction: string;
}

export interface WorkRequest {
  format: typeof formats.workRequest; run: string; selection: string; snapshot: string;
  scope?: ScopeConfirmation & { proposal: NonNullable<Inspection['discovery']>['proposal'] };
  declarations: { id: string; guidance: Inspection['guidance'][number] & RetainedReference; discovery?: NonNullable<Inspection['discovery']>['declarations'][number] & RetainedReference; allowedTargets: { paths: string[]; directories: string[] } }[];
  requiredEvidence: string[];
}
// The project path of a referenced source file's retained bytes.
interface RetainedReference { retained: string }
function cleanupRun(lock: string) {
  rmSync(lock, { force: true });
  rmSync(`${lock}.runtime`, { recursive: true, force: true });
  for (const name of readdirSync(dirname(lock))) if (name.startsWith(basename(lock) + '.context') || name.startsWith(basename(lock) + '.observation.')) rmSync(join(dirname(lock), name), { force: true });
}

// Saved run context lives beside the run record, addressed by its hash: the
// saved installation, and the completion bytes recovery may need to verify, so
// the run record itself carries only their hashes. The run's kept observation
// is saved the same way under its own name, so it can be replaced on its own.
type SavedKind = 'context' | 'observation';
function saveContext(root: string, content: string, kind: SavedKind = 'context') {
  const identity = hash(content);
  const path = `${lockPath(root)}.${kind}.${identity}`;
  if (!existsSync(path)) writeFileSync(path, content, { flag: 'wx' });
  return identity;
}

function readContext(root: string, identity: string, name: string, kind: SavedKind = 'context') {
  let content: string;
  try { content = readFileSync(`${lockPath(root)}.${kind}.${identity}`, 'utf8'); }
  catch { throw new ProductError('STATE_INTEGRITY', `${name} cannot be read. Preserve the run and restore its recorded state.`); }
  if (hash(content) !== identity) throw new ProductError('STATE_INTEGRITY', `${name} changed. Preserve the run and restore its recorded state.`);
  return content;
}

// The run records its intervals as identities and deltas only. While the run
// is active, the work-evidence journal's kept observation, which recovery, gap
// detection and the next interval compare with, is stored beside the run
// journal under its identity: written before the journal refers to it, and
// removed once it no longer does.
function keptObservations(root: string): ObservationStore {
  return {
    read: identity => JSON.parse(readContext(root, identity.slice('sha256:'.length), 'The observation the run last recorded', 'observation')) as WorkObservation,
    keep: observation => { saveContext(root, JSON.stringify(observation), 'observation'); },
  };
}

function pruneObservations(root: string, run: Run) {
  const lock = lockPath(root);
  const kept = `${basename(lock)}.observation.${keptIdentity(run.observations)?.slice('sha256:'.length)}`;
  for (const name of readdirSync(dirname(lock))) if (name.startsWith(basename(lock) + '.observation.') && name !== kept) rmSync(join(dirname(lock), name), { force: true });
}

function persistInstallation(root: string, run: Run, installation: Installation) {
  run.continuation = saveContext(root, json(installation));
}

function readInstallation(root: string, run: Run): Installation {
  if (!run.continuation) throw new ProductError('RESUME_UNAVAILABLE', 'Installation was not prepared. Abandon this run, inspect again, and confirm a new start.');
  return JSON.parse(readContext(root, run.continuation, 'Saved installation')) as Installation;
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
  pruneObservations(root, run);
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
  try { withdrawCompletionState(root, run.id, () => readInstallation(root, run)); }
  catch {
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

function canResumeAssessment(run: Run) {
  return !!run.continuation && (
    run.phase === 'contextual' || run.phase === 'assessment'
    || (run.phase === 'checks' && run.reason.startsWith('CHECKS_FAILED:') && run.uncertain.length === 0)
    || (run.phase === 'verification' && run.reason.startsWith('STALE_ASSESSMENT:'))
  );
}

// Run records, active or archived after abandonment, are read in their single
// format only.
function readRun(root: string, path: string): Run {
  const where = recordPath(root, path);
  let run: unknown;
  try { run = JSON.parse(readFileSync(path, 'utf8')); }
  catch { throw new ProductError('STATE_INTEGRITY', `The adoption run record ${where} cannot be read. Restore the recorded run.`); }
  requireFormat(where, run, formats.run);
  const recorded = run as Partial<Run> | null;
  if (recorded?.format !== formats.run || !Array.isArray(recorded.observations) || !compactIntervals(recorded.observations)) throw new ProductError('STATE_INTEGRITY', `The adoption run record ${where} failed integrity validation. Restore the recorded run.`);
  return run as Run;
}

function abandonedReports(root: string, lock: string): Run[] {
  const directory = join(dirname(lock), 'repo-standards-reports');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).sort().filter(name => name.endsWith('.json')).map(name => readRun(root, join(directory, name)));
}

export function abandon(project: string, cliVersion: string) {
  const root = projectRoot(project);
  const lock = lockPath(root);
  rejectRetiredRecords(root, lock);
  const release = acquireWorker(lock);
  try {
    if (!existsSync(lock)) throw new ProductError('NO_ACTIVE_RUN', 'No incomplete adoption is available to abandon.');
    const run = readRun(root, lock);
    if (run.selection.cli.version !== cliVersion) throw new ProductError('CLI_PIN_MISMATCH', `Use the project-pinned CLI ${run.selection.cli.version}.`);
    if (run.processGroup && processGroupAlive(run.processGroup, run.processGroupIdentity)) throw new ProductError('ACTIVE_RUN', `Author process group ${run.processGroup} is still running. Stop it before abandonment.`);
    if (run.outcome === 'complete') throw new ProductError('ALREADY_COMPLETE', 'This adoption completed before interruption. Use resume --retry to verify and release its remaining progress record.');
    try {
      // The archived report is never continued, so the journal keeps its final
      // observation in memory and neither saves nor checks it.
      const { resolved } = readInstallation(root, run).report;
      new WorkEvidenceJournal(root, resolved, run, memoryStore(keptObservations(root))).continueInterrupted();
    } catch { run.uncertain.push('The final abandoned observation could not be completed; earlier interval evidence is preserved.'); }
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
  rejectRetiredRecords(root, lock);
  const abandoned = abandonedReports(root, lock);
  const active = existsSync(lock) ? readRun(root, lock) : null;
  const format = formats.status;
  if (active) {
    try { active.changes = actualChanges(root, active.affected); } catch { active.uncertain.push('Current project changes could not be fully read.'); }
    // Recovery needs the observation the last interval ends at; report its loss now, not at the next resume.
    if (active.observations.length) try { keptObservations(root).read(keptIdentity(active.observations)!); } catch (error) { active.uncertain.push((error as Error).message); }
    return { format, selection: active.selection, lastComplete: active.previousComplete?.lastComplete ?? null, active,
      execution: executing(lock) || (active.processGroup && processGroupAlive(active.processGroup, active.processGroupIdentity)) ? 'active' : 'interrupted', abandoned, evidence: 'historical' };
  }
  if (!existsSync(join(root, '.repo-standards/state.json'))) return { format, selection: null, lastComplete: null, active, abandoned, evidence: 'historical' };
  try {
    const { state, selection, scopeHistory } = readRecordedAdoption(root)!;
    const changedScope = scopeHistory && latestScopeChanges(scopeHistory);
    return { format, ...committedEvidenceReport(state),
      selection, lastComplete: state.lastComplete, baselines: state.baselines as Record<string, Baseline>, skills: state.skills,
      checks: state.checks, assessments: state.assessments, ...(changedScope ? { scopeChanges: changedScope } : {}), active, abandoned, evidence: 'historical' };
  } catch (error) {
    if (!(error instanceof ProductError) || error.code !== 'STATE_INTEGRITY' || !abandoned.length) throw error;
    const lockFile = safe(root, '.repo-standards/lock.json');
    let inspection: unknown;
    try { if (lockFile.type === 'file') inspection = JSON.parse(Buffer.from(lockFile.content, lockFile.encoding).toString('utf8'))?.inspection; }
    catch { /* Archived reports remain available even if current state cannot be decoded. */ }
    // Only an abandoned run explains the failure: one whose installation or
    // completion wrote the lock, or one that began installing over the last
    // complete adoption the lock still names. Anything else is an integrity
    // failure of the recorded adoption itself.
    const incomplete = typeof inspection === 'string' ? abandoned.find(run => run.inspection === inspection
      || (run.installation && run.previousComplete?.lastComplete.inspection === inspection)) : undefined;
    if (!incomplete) throw error;
    return { format, selection: incomplete.selection,
      lastComplete: incomplete.previousComplete?.lastComplete ?? null, active, abandoned, evidence: 'historical',
      stateError: { code: error.code, message: error.message } };
  }
}

// These events describe confirmed work. Phase/outcome/uncertainty coupling and
// persistence ordering belong here, never in the execution callback.
type Progress =
  | { type: 'installation-verification' }
  | { type: 'installation-writing' }
  | { type: 'file-installed'; path: string }
  | { type: 'tree-removing'; path: string }
  | { type: 'tree-installing'; path: string }
  | { type: 'runtime-installed' }
  | { type: 'installation-finished' }
  | { type: 'assessment-reading' }
  | { type: 'assessment-started' }
  | { type: 'retry-verification' }
  | { type: 'assessment-submitted'; assessment: Assessment }
  | { type: 'assessment-accepted' }
  | { type: 'operation-accepted'; description: string }
  | { type: 'final-verification' };

export class AdoptionRunSession {
  #run: Run | undefined;
  #journal: WorkEvidenceJournal | undefined;
  #open = true;
  #reportFailures = false;
  #localReady = false;
  #mutated = false;
  #completing = false;
  #temporary: string | undefined;
  #mode: 'start' | 'resume';
  readonly #root: string;

  private constructor(root: string, mode: 'start' | 'resume') {
    this.#root = root;
    this.#mode = mode;
  }

  #assertOpen() {
    if (!this.#open) throw new Error('The adoption-run session has ended.');
  }

  #state(): Run {
    this.#assertOpen();
    if (!this.#run) throw new Error('The adoption-run session has not begun.');
    return this.#run;
  }

  get observation(): Run { return structuredClone(this.#state()); }

  // The run's work-evidence journal, available once its installation is prepared.
  get journal(): WorkEvidenceJournal {
    this.#state();
    if (!this.#journal) throw new Error('The adoption-run installation has not been prepared.');
    return this.#journal;
  }

  #openJournal(installation: Installation) {
    this.#journal = new WorkEvidenceJournal(this.#root, installation.report.resolved, this.#state(), keptObservations(this.#root), () => this.#save());
  }

  // An update begins from the recorded adoption its inspection read.
  begin(report: Inspection, head: string | null, confirmation: string, startInput: StartInput, previous?: RecordedAdoption) {
    this.#assertOpen();
    const root = this.#root;
    const recovering = this.#run;
    const run: Run = recovering ?? { format: formats.run, observations: [], id: randomUUID(), inspection: confirmation, selection: report.selection, head, startInput,
      ...(previous ? { previousComplete: { selection: previous.selection, lastComplete: previous.state.lastComplete } } : {}),
      affected: { ...report.project.affected, [systemTarget]: report.project.systemSkill }, outcome: 'incomplete',
      prerequisites: [], operations: [], assessments: [], phase: 'prerequisites', reason: 'Run in progress or interrupted.', changes: [], completed: [], uncertain: ['prerequisite probes'],
      nextAction: 'Read status, review actual changes, stop any surviving author process, then use resume --retry to recover this incomplete adoption, or abandon to preserve its work and report.' };
    try { if (recovering) saveRun(root, run, false); else writeFileSync(lockPath(root), json(run), { flag: 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ProductError('ACTIVE_RUN', 'Another adoption run holds the project lock. Read status.');
      throw error;
    }
    this.#run = structuredClone(run);
    this.#reportFailures = true;
  }

  #save() { saveRun(this.#root, this.#state(), this.#localReady); }

  record(event: Progress) {
    const run = this.#state();
    switch (event.type) {
      case 'installation-verification':
        run.phase = 'installation'; run.uncertain = ['installed progress verification'];
        this.#save();
        run.installation!.trees ??= {};
        return;
      case 'installation-writing': run.phase = 'installation'; run.uncertain = ['exact content and durable product state installation']; break;
      case 'file-installed':
        if (event.path === '.repo-standards/.gitignore') this.#localReady = true;
        if (!run.installation!.files.includes(event.path)) {
          run.installation!.files.push(event.path);
          if (event.path !== '.repo-standards/.gitignore') run.completed.push(event.path);
        }
        break;
      case 'tree-removing':
        run.installation!.files = run.installation!.files.filter(path => !path.startsWith(event.path + '/'));
        run.installation!.trees![event.path] = 'removing'; break;
      case 'tree-installing': run.installation!.trees![event.path] = 'installing'; break;
      case 'runtime-installed': run.installation!.runtime = true; run.completed.push('isolated runtime'); return;
      case 'installation-finished':
        run.installation!.complete = true;
        run.phase = 'verification'; run.uncertain = ['final integrity verification']; break;
      case 'assessment-reading': run.phase = 'assessment'; return;
      case 'assessment-started': run.phase = 'assessment'; run.uncertain = [pendingWork.assessment]; return;
      case 'retry-verification': run.phase = 'verification'; run.uncertain = ['installed progress verification']; break;
      case 'assessment-submitted':
        run.phase = 'assessment'; run.uncertain = [pendingWork.assessment];
        run.assessments = [structuredClone(event.assessment)]; break;
      case 'assessment-accepted': run.completed.push('agent assessment'); break;
      case 'operation-accepted': run.completed.push(event.description); break;
      case 'final-verification': run.phase = 'verification'; run.uncertain = ['final integrity verification']; break;
    }
    this.#save();
  }

  async prerequisites(probe: (onSpawn: (group: number) => void) => Promise<PrerequisiteEvidence[]>) {
    const run = this.#state();
    const evidence = await probe(group => { this.#assertOpen(); recordProcessGroup(this.#root, run, group); });
    this.#assertOpen();
    run.prerequisites = structuredClone(evidence);
    clearStoppedProcess(run);
    return structuredClone(evidence);
  }

  acquireRuntime(prepare: (directory: string) => Observation) {
    const run = this.#state();
    run.phase = 'runtime'; run.uncertain = ['runtime acquisition']; this.#save();
    this.#temporary = mkdtempSync(join(externalPath(tmpdir(), this.#root), 'repo-standards-runtime-'));
    return { directory: this.#temporary, skill: prepare(this.#temporary) };
  }

  prepareInstallation(installation: Installation) {
    const run = this.#state();
    if (this.#temporary) cpSync(join(this.#temporary, 'node_modules'), `${lockPath(this.#root)}.runtime`, { recursive: true, verbatimSymlinks: true });
    run.installation = { files: [], runtime: !this.#temporary };
    run.head = installation.git.head;
    persistInstallation(this.#root, run, installation);
    this.#openJournal(installation);
    this.record({ type: 'installation-writing' });
    this.#mutated = true;
  }

  async authorProcess(operation: { phase: 'fixes' | 'checks'; declaration: string; id: string },
    execute: (onSpawn: (group: number) => void) => Promise<OperationEvidence>, verify: () => void) {
    const run = this.#state();
    const root = this.#root;
    this.journal.open(operation);
    run.phase = operation.phase; run.reason = 'Run in progress or interrupted.';
    run.uncertain = [`${operation.declaration}/${operation.id}: process outcome uncertain until recorded`]; this.#save();
    const persistedRun = file(json(run));
    // The spawn callback is synchronous. The process need not wait for it:
    // journaling ownership must never overwrite a potentially altered mirror.
    const evidence = structuredClone(await execute(group => { this.#assertOpen(); recordProcessGroup(root, run, group); }));
    this.#assertOpen();
    const persistedLock = file(json(run));
    const log = `.repo-standards/local/operations/${run.operations.length}`;
    write(root, `${log}.stdout`, file(evidence.stdout));
    write(root, `${log}.stderr`, file(evidence.stderr));
    evidence.stdout = `${log}.stdout`; evidence.stderr = `${log}.stderr`;
    run.operations.push(evidence);
    clearStoppedProcess(run);
    run.uncertain = ['Post-operation integrity verification has not succeeded.'];
    // Observe before integrity verification, but persist only after checking the
    // author-visible journal: observation persistence must not conceal tampering.
    this.journal.close(() => {
      const currentRun = safe(root, '.repo-standards/local/run.json');
      if (currentRun.type === 'file' && currentRun.sha256 !== persistedRun.sha256) write(root, `${log}.altered-run.json`, currentRun);
      verifyFiles(root, { '.repo-standards/local/run.json': persistedRun });
      const currentLock = observe(lockPath(root));
      if (currentLock.type !== 'file' || currentLock.sha256 !== persistedLock.sha256) throw new ProductError('FINAL_INTEGRITY', 'The active adoption run lock changed during author execution.');
      verify();
      run.uncertain = [];
    });
    return structuredClone(evidence);
  }

  pauseForContext(request: WorkRequest, installation?: Installation): never {
    const run = this.#state();
    if (installation) persistInstallation(this.#root, run, installation);
    run.phase = 'contextual';
    run.uncertain = [installation ? pendingWork.contextual : pendingWork.assessment];
    run.workRequest = structuredClone(request);
    if (installation) run.nextAction = 'Apply the selected guidance, refresh the work request with resume, and submit evidence using resume --assessment <file>.';
    throw new ProductError('CONTEXTUAL_REQUIRED', installation
      ? 'Exact installation and fixes succeeded; contextual guidance requires agent work and assessment before checks can run.'
      : 'Review the refreshed work request and submit an assessment for its snapshot.');
  }

  complete(installation: Installation, operationStart: number) {
    const run = this.#state();
    const root = this.#root;
    this.#completing = true;
    const completion = completionFiles(installation, run, operationStart);
    const { state, lock } = completion;
    saveContext(root, state.content);
    saveContext(root, lock.content);
    run.completion = { state: { sha256: state.sha256, executable: state.executable }, lock: { sha256: lock.sha256, executable: lock.executable } };
    run.phase = 'completion'; run.uncertain = ['Durable completion and final run-report persistence have not both succeeded.']; this.#save();
    writeCompletion(root, installation, completion, run.id);
    run.changes = actualChanges(root, run.affected);
    run.outcome = 'complete'; run.phase = 'complete'; run.reason = 'Exact installation, fixes, contextual assessment where required, checks, runtime, retained inputs and durable state verified.';
    run.uncertain = []; run.nextAction = 'Review and commit the uncommitted adoption changes through the project’s normal workflow.'; this.#save();
  }

  #recover(installation: Installation, archivedFiles: Record<string, string>) {
    const run = this.#state();
    const root = this.#root;
    if (run.completion) {
      verifyInstallation(root, installation, { runId: run.id,
        lock: file(readContext(root, run.completion.lock.sha256, 'Saved completion lock')), state: file(readContext(root, run.completion.state.sha256, 'Saved completion state')) });
      if (run.outcome === 'complete') return;
      if (!preserveIncompleteState(root, run)) throw new ProductError('RECOVERY_BLOCKED', 'Cannot preserve candidate completion state. Resolve local/incomplete-state.json storage before retry; the run remains active.');
      restorePlannedLock(root, installation, run.id);
      delete run.completion;
    }
    const installed = run.installation?.complete;
    if (installed) verifyInstallation(root, installation);
    this.journal.continueInterrupted(installed ? exactContent(installation) : undefined);
    this.journal.requireAuthorized();
    const interruptedReport = archivedFiles['.repo-standards/local/run.json'];
    (run.retryHistory ??= []).push({ phase: run.phase, reason: run.reason, uncertain: [...run.uncertain], assessments: run.assessments, archivedFiles, ...(interruptedReport ? { report: interruptedReport } : {}) });
    run.outcome = 'incomplete'; run.phase = 'prerequisites';
    clearStoppedProcess(run);
    run.assessments = [];
    delete run.workRequest;
    run.reason = 'Explicit retry in progress or interrupted.';
    run.nextAction = 'Review this incomplete adoption with status; use resume --retry after reconciliation, or abandon to preserve the work.';
    this.#save();
  }

  #failure(error: unknown) {
    const run = this.#state();
    const root = this.#root;
    run.outcome = 'incomplete';
    run.reason = error instanceof ProductError ? `${error.code}: ${error.message}` : (error as Error).message;
    if (this.#completing) {
      run.phase = 'completion'; run.uncertain = ['Durable completion and final run-report persistence did not both succeed.'];
      if (this.#mode === 'start') run.nextAction = 'Read status, review actual changes, and preserve the run report before reconciling this incomplete adoption. Do not commit it as a complete adoption.';
      preserveIncompleteState(root, run);
    }
    if (this.#mode === 'resume' || this.#mutated) {
      try { run.changes = actualChanges(root, run.affected); }
      catch { run.uncertain.push(this.#mode === 'resume' ? 'Current project changes could not be fully read.' : 'The full set of actual changes could not be read; review the working tree manually.'); }
    }
    if (this.#mode === 'resume') run.nextAction = canResumeAssessment(run)
      ? 'Review the reported problem and preserved changes. Reconcile them, refresh with resume, and submit renewed evidence with resume --assessment <file>.'
      : 'Explicit recovery is required. Review this incomplete adoption, reconcile changes, then use resume --retry, or abandon to preserve the work and report.';
    else if (!this.#mutated && !run.processGroup) { run.uncertain = []; run.nextAction = 'Resolve the reported problem, inspect again, and confirm the new inspection before retrying.'; }
    if (error instanceof ProductError && error.code === 'SCOPE_INCOMPLETE') run.nextAction = 'Additional paths grant no authority, and an active run cannot change its confirmed scope. Preserve the work, abandon the run, commit or discard its changes, and adopt again with a new confirmed scope.';
    try { this.#save(); } catch { /* Preserve the original interruption record. */ }
  }

  // Only the scoped entry points below can invoke lifecycle machinery.
  static async scope(root: string, mode: 'start' | 'resume', callback: (session: AdoptionRunSession, installation?: Installation) => Promise<void>,
    resume?: { cliVersion: string; retry: boolean }) {
    const lock = lockPath(root);
    rejectRetiredRecords(root, lock);
    const release = acquireWorker(lock);
    const session = new AdoptionRunSession(root, mode);
    try {
      let installation: Installation | undefined;
      let archivedFiles: Record<string, string> = {};
      if (resume) {
        if (!existsSync(lock)) throw new ProductError('NO_ACTIVE_RUN', 'No incomplete adoption is available to resume.');
        const run = readRun(root, lock);
        session.#run = run;
        if (run.selection.cli.version !== resume.cliVersion) throw new ProductError('CLI_PIN_MISMATCH', `Use the project-pinned CLI ${run.selection.cli.version}.`);
        if (run.processGroup && processGroupAlive(run.processGroup, run.processGroupIdentity)) throw new ProductError('ACTIVE_RUN', `Author process group ${run.processGroup} is still running. Stop it before retry or abandonment.`);
        if (!resume.retry && !canResumeAssessment(run)) throw new ProductError('RESUME_UNAVAILABLE', 'Explicit recovery is required. Review status and use resume --retry, or abandon to preserve the incomplete work and report.');
        if (resume.retry && !run.continuation && run.startInput) session.#mode = 'start';
        else {
          installation = readInstallation(root, run);
          session.#openJournal(installation);
          const ignoreFile = safe(root, '.repo-standards/.gitignore');
          session.#localReady = ignoreFile.type === 'file' && ignoreFile.sha256 === hash(ignore);
          // Archive before enabling catch-path persistence: a failed archive
          // must leave the authoritative journal and actual report untouched.
          archivedFiles = resume.retry && session.#localReady ? archiveRunEvidence(root, run) : {};
          session.#reportFailures = true;
        }
      } else if (existsSync(lock)) throw new ProductError('ACTIVE_RUN', 'An adoption run is active or incomplete. Read status and preserve its work before recovery.');
      try {
        if (installation && resume) {
          if (resume.retry) session.#recover(installation, archivedFiles);
          else verifyFiles(root, { '.repo-standards/local/run.json': file(json(session.#state())) });
        }
        if (session.#run?.outcome !== 'complete') await callback(session, installation);
      } catch (error) {
        if (!session.#reportFailures) throw error;
        session.#failure(error);
      }
      return session.observation;
    } finally {
      session.#open = false;
      try {
        // Resource cleanup stays outside failure translation, as in start's
        // original finally block. A cleanup error must not redefine completion.
        if (session.#temporary) rmSync(session.#temporary, { recursive: true, force: true });
        if (session.#reportFailures && session.#run && ((session.#mode === 'start' && !session.#mutated && !session.#run.processGroup) || session.#run.outcome === 'complete')) cleanupRun(lock);
      } finally { release(); }
    }
  }
}

export function withStartRun(project: string, callback: (session: AdoptionRunSession) => Promise<void>) {
  return AdoptionRunSession.scope(projectRoot(project), 'start', callback);
}

export function withResumedRun(project: string, cliVersion: string, retry: boolean,
  callback: (session: AdoptionRunSession, installation?: Installation) => Promise<void>) {
  return AdoptionRunSession.scope(projectRoot(project), 'resume', callback, { cliVersion, retry });
}
