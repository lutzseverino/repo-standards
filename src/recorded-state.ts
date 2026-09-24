import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { acquireSource } from './acquisition.js';
import { inventory, json, lockPath, relativePath } from './adoption-files.js';
import { ProductError } from './errors.js';
import { formats, recordPath, requireFormat } from './formats.js';
import type { Declaration } from './model.js';
import { targetObservation, type Blocker, type Content, type Observation } from './observation.js';
import { retainedScopeRuns, type ScopeHistoryRun } from './scope-evidence.js';
import { validExecutionEvidence, type ExecutionEvidence } from './work-evidence.js';

// The one reader of a recorded adoption: everything the last complete adoption
// left under the product state directory, read and verified together, after the
// retired-record gate over those records and the run records in Git's
// directory. The lock binds the durable state and every retained product file
// by hash, so nothing recorded is interpreted before it matches, and any
// mismatch fails once with the state-integrity diagnostic whichever command is
// reading. Commands that act on an active run, whose recorded adoption an
// update may be replacing, run the retired-record gate alone.

export interface RecordedSelection {
  cli: { package: string; version: string };
  standards: { repository: string; version: string; commit: string };
  profile: string;
}

type Baseline = Pick<Content, 'sha256' | 'executable'>;
interface RecordedLock {
  format: string; selection: RecordedSelection; inspection: string;
  files: Record<string, Baseline>; state: Baseline;
}
// The execution-evidence slice and its validation belong to work evidence.
interface RecordedState extends ExecutionEvidence {
  lastComplete: { run: string; inspection: string; completedAt: string; head: string };
  baselines: Record<string, Baseline>; skills: Record<string, string[]>;
  checks: unknown[]; assessments: unknown[];
}
type RecordedFile = Extract<Observation, { type: 'file' }>;

// Retained standards used in place of an acquired source.
export type RetainedSource = Awaited<ReturnType<typeof acquireSource>> & { manifest: string };

export interface RecordedAdoption {
  selection: RecordedSelection;
  // Every file the last complete adoption installed or retained, by project path.
  files: Record<string, Baseline>;
  // Last-complete evidence, installed baselines, skills, checks, assessments
  // and execution evidence.
  state: RecordedState;
  // The verified bytes of durable state, which an update keeps until it completes.
  stateFile: RecordedFile;
  resolved: { declarations: Declaration[] };
  // Every retained discovery run, oldest first, when the adoption retains any.
  scopeHistory?: ScopeHistoryRun[];
  // The retained inputs as a standards source. It fails when the inputs
  // directory holds files the lock does not record.
  source(): RetainedSource;
}

const lockFile = '.repo-standards/lock.json';
const stateFile = '.repo-standards/state.json';
const inputs = '.repo-standards/inputs';
const retainedSource = `${inputs}/source`;
const resolvedFile = `${inputs}/resolved.json`;
const historyFile = `${inputs}/scope-history.json`;
const manifestFile = `${inputs}/standards.yaml`;

function unreadable(): never {
  throw new ProductError('STATE_INTEGRITY', 'Recorded adoption state cannot be read. Restore the committed product state.');
}

function invalid(): never {
  throw new ProductError('STATE_INTEGRITY', 'Recorded adoption state failed integrity validation. Restore the committed product state.');
}

function text(value: Pick<Content, 'content' | 'encoding'>) {
  return Buffer.from(value.content, value.encoding).toString('utf8');
}

// Decodes durable state in its single committed format. Completion decodes
// the durable state an update carries the same way.
export function decodeState(value: Pick<Content, 'content' | 'encoding'>): RecordedState {
  let state: RecordedState;
  try { state = JSON.parse(text(value)); }
  catch { unreadable(); }
  requireFormat(stateFile, state, formats.state);
  if (!state?.lastComplete || !state.baselines || !state.skills
    || !Array.isArray(state.checks) || !Array.isArray(state.assessments)
    || !validExecutionEvidence(state)) {
    invalid();
  }
  return state;
}

function decode(lock: Observation, observed: Observation) {
  if (lock.type !== 'file' || observed.type !== 'file') throw new ProductError('STATE_INTEGRITY', 'Complete adoption state or integrity lock is missing.');
  let pinned: RecordedLock;
  try { pinned = JSON.parse(text(lock)); }
  catch { unreadable(); }
  const state = decodeState(observed);
  if (pinned?.format !== formats.lock
    || pinned.state?.sha256 !== observed.sha256 || pinned.state.executable !== observed.executable
    || !pinned.selection || !pinned.files) {
    invalid();
  }
  return { pinned, state, stateFile: observed };
}

// Every product file the lock records, observed without following links and
// matched against its recorded hash and mode before anything reads it.
function verifiedProductFiles(root: string, files: Record<string, Baseline>) {
  const verified: Record<string, RecordedFile> = Object.create(null);
  for (const [path, expected] of Object.entries(files).filter(([path]) => path.startsWith('.repo-standards/'))) {
    relativePath(path);
    const blockers: Blocker[] = [];
    const actual = targetObservation(root, path, blockers);
    if (blockers.length || actual.type !== 'file' || actual.sha256 !== expected?.sha256 || actual.executable !== expected.executable) {
      throw new ProductError('STATE_INTEGRITY', `Retained product material changed: ${path}. Restore it from the adopting project's committed baseline.`);
    }
    verified[path] = actual;
  }
  return verified;
}

function recordedResolution(value: RecordedFile | undefined) {
  if (!value) unreadable();
  let resolved: { declarations: Declaration[] };
  try { resolved = JSON.parse(text(value)); }
  catch { unreadable(); }
  if (!Array.isArray(resolved?.declarations)) invalid();
  return resolved;
}

function recordedScopeHistory(value: RecordedFile) {
  try { return retainedScopeRuns(JSON.parse(text(value))); }
  catch (error) {
    // The scope-evidence module reports its own integrity failures; only a
    // file this reader cannot parse becomes an unreadable history.
    if (error instanceof ProductError) throw error;
    throw new ProductError('STATE_INTEGRITY', 'Recorded discovery history cannot be read. Restore the committed product state.');
  }
}

// A record's JSON, read without verification, for its format alone.
function unverifiedRecord(path: string): unknown {
  try { return lstatSync(path, { throwIfNoEntry: false })?.isFile() ? JSON.parse(readFileSync(path, 'utf8')) : undefined; }
  catch { return undefined; }
}

// Every command that reads product records rejects a retired one before it
// reads or writes anything else, so the diagnostic is the same whichever record
// the command would have read first: committed state, retained scope evidence,
// the active run record, or a run report archived beside it by abandonment.
// Records that cannot be read are left to their owners.
export function rejectRetiredRecords(root: string, runRecord: string) {
  for (const [path, format] of [[stateFile, formats.state], [historyFile, formats.scopeHistory]] as const) {
    requireFormat(path, unverifiedRecord(join(root, path)), format);
  }
  const archive = join(dirname(runRecord), 'repo-standards-reports');
  const archived = lstatSync(archive, { throwIfNoEntry: false })?.isDirectory()
    ? readdirSync(archive).sort().filter(name => name.endsWith('.json')).map(name => join(archive, name)) : [];
  for (const path of [runRecord, ...archived]) requireFormat(recordPath(root, path), unverifiedRecord(path), formats.run);
}

// Reads the recorded adoption of the project at root, or nothing when neither
// the lock nor durable state exists. Retired record formats are rejected first.
export function readRecordedAdoption(root: string): RecordedAdoption | undefined {
  rejectRetiredRecords(root, lockPath(root));
  const lock = targetObservation(root, lockFile, []);
  const state = targetObservation(root, stateFile, []);
  if (lock.type === 'missing' && state.type === 'missing') return undefined;
  const decoded = decode(lock, state);
  const { pinned } = decoded;
  const verified = verifiedProductFiles(root, pinned.files);
  const resolved = recordedResolution(verified[resolvedFile]);
  const history = verified[historyFile];
  return {
    selection: pinned.selection, files: pinned.files, state: decoded.state, stateFile: decoded.stateFile, resolved,
    ...(history ? { scopeHistory: recordedScopeHistory(history) } : {}),
    source() {
      const recorded = Object.keys(pinned.files).filter(path => path.startsWith(`${inputs}/`));
      if (json(inventory(root, inputs)) !== json(recorded.map(path => path.slice(inputs.length + 1)).sort())) throw new ProductError('STATE_INTEGRITY', 'Retained input inventory changed.');
      const paths = new Set<string>();
      for (const path of recorded) if (path.startsWith(`${retainedSource}/`)) {
        const parts = path.slice(retainedSource.length + 1).split('/');
        for (let length = 1; length <= parts.length; length++) paths.add(parts.slice(0, length).join('/'));
      }
      const manifest = verified[manifestFile];
      if (!manifest) unreadable();
      return { root: join(root, existsSync(join(root, retainedSource)) ? retainedSource : inputs), identity: pinned.selection.standards, paths, manifest: text(manifest), close() {} };
    },
  };
}
