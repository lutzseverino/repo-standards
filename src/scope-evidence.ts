import { ProductError } from './errors.js';
import { scopeEvidence, type Evidence, type FileState, type ScopeObservation } from './scope-observation.js';

// Scope evidence is the retained discovery observations behind each confirmed
// scope. This module owns the retained scope-history file: what a completion
// commits, how every earlier format is read, and how the historical scope is
// projected for a report. Each discovery run is stored once. The project
// observation is stored without the evidence array it implies, and the named
// observation as its delta from that observation, so retained inputs stay
// inspectable without carrying the same observation several times. Evidence
// arrays and the full named observation are rebuilt on read with the product's
// existing derivation, leaving the projection identical to the one an earlier
// format produced.

const committedFormat = 'repo-standards/scope-history/v3';

// The recorded selection fields the product interprets after reading. Anything
// else a stored profile carries travels verbatim.
export interface RetainedProfile {
  description?: string;
  declarations?: { id: string; kind?: string; discovery?: string; targets?: { paths?: string[]; directories?: string[] } }[];
}

export interface RetainedDiscovery {
  identity: string;
  proposal?: unknown;
  absence?: unknown;
  // A confirmed proposal carries one; the recorded value may be absent.
  namedObservation?: ScopeObservation | undefined;
  declarations: unknown;
  evidence: Evidence[];
  observation: ScopeObservation;
}

// One retained run as its readers see it.
export interface ScopeHistoryRun {
  inspection: string;
  resolved: RetainedProfile;
  sourceResolved?: RetainedProfile;
  discovery?: RetainedDiscovery;
}

type Boundaries = Record<string, FileState>;
type CommittedObservation = Omit<ScopeObservation, 'evidence'>;
// A named observation repeats the project observation except for its named
// targets and the boundaries that naming those paths adds. Naming a path Git
// ignores would also change the observed files and inventories; such an
// observation is retained whole instead, so a projection is always exactly what
// was observed.
type CommittedNamed = { targets: ScopeObservation['targets']; boundaries?: Boundaries } | { observation: CommittedObservation };

function unreadable(): never {
  throw new ProductError('STATE_INTEGRITY', 'Recorded discovery history cannot be read. Restore the committed product state.');
}

function invalid(): never {
  throw new ProductError('STATE_INTEGRITY', 'Recorded discovery history failed integrity validation. Restore the committed product state.');
}

// The committed guarantee: the file holds only its ordered runs, each stored
// once, and no run carries a derived evidence array or a full named
// observation.
function compactHistory(history: Record<string, unknown>, runs: unknown[]) {
  if (Object.hasOwn(history, 'inspection')) return false;
  return runs.every(value => {
    const discovery = (value as { discovery?: Record<string, unknown> }).discovery;
    if (discovery === undefined) return true;
    const observation = discovery.observation as Record<string, unknown> | undefined;
    return !!observation && typeof observation === 'object' && !Object.hasOwn(discovery, 'evidence')
      && !Object.hasOwn(discovery, 'namedObservation') && !Object.hasOwn(observation, 'evidence');
  });
}

// The read-side version union for retained scope evidence. Every earlier
// committed format stays readable; only the current one is written.
function storedRuns(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') unreadable();
  const history = value as Record<string, unknown>;
  const runs = Array.isArray(history.runs) ? history.runs
    : typeof history.inspection === 'string' && history.sourceResolved && history.resolved && history.discovery ? [history]
    : invalid();
  if (!runs.every(run => !!run && typeof run === 'object' && typeof (run as { inspection?: unknown }).inspection === 'string')) invalid();
  if (history.format === committedFormat && !compactHistory(history, runs)) invalid();
  return runs;
}

function derived(observation: CommittedObservation): ScopeObservation {
  return { ...observation, evidence: scopeEvidence(observation.files, observation.inventories) };
}

// The named observation is rebuilt from the project observation it was stored
// against: its own targets, the boundaries naming them added, and the evidence
// the unchanged files and inventories imply.
function named(observation: ScopeObservation, delta: CommittedNamed): ScopeObservation {
  if ('observation' in delta) return derived(delta.observation);
  return {
    files: observation.files, inventories: observation.inventories,
    boundaries: { ...observation.boundaries, ...delta.boundaries }, targets: delta.targets,
    settings: observation.settings, ignores: observation.ignores, limits: observation.limits,
    evidence: observation.evidence,
  };
}

function retainedDiscovery(value: unknown): RetainedDiscovery {
  const discovery = value as Record<string, unknown>;
  const stored = discovery.observation as Record<string, unknown> | undefined;
  if (!stored || typeof stored !== 'object') invalid();
  // Every format before the committed one retains its arrays in full.
  if (Array.isArray(stored.evidence)) return discovery as unknown as RetainedDiscovery;
  const observation = derived(stored as unknown as CommittedObservation);
  const delta = discovery.named as CommittedNamed | undefined;
  return {
    identity: discovery.identity as string,
    ...(discovery.proposal !== undefined ? { proposal: discovery.proposal, absence: discovery.absence } : {}),
    ...(delta ? { namedObservation: named(observation, delta) } : {}),
    declarations: discovery.declarations,
    evidence: observation.evidence,
    observation,
  };
}

function retainedRun(value: unknown): ScopeHistoryRun {
  const run = value as Record<string, unknown>;
  return {
    inspection: run.inspection as string,
    resolved: run.resolved as RetainedProfile,
    ...(run.sourceResolved ? { sourceResolved: run.sourceResolved as RetainedProfile } : {}),
    ...(run.discovery ? { discovery: retainedDiscovery(run.discovery) } : {}),
  };
}

// Every retained discovery run, oldest first, in the form its readers expect
// whatever format the file uses.
export function retainedScopeRuns(value: unknown): ScopeHistoryRun[] {
  return storedRuns(value).map(retainedRun);
}

// The most recent retained run alone, for readers that need only the selection
// the last completion confirmed.
export function latestRetainedScopeRun(value: unknown): ScopeHistoryRun | undefined {
  const runs = storedRuns(value);
  return runs.length ? retainedRun(runs.at(-1)) : undefined;
}

// The historical scope a retained inspection reports: every run, with the
// newest one also spread at the top level as it has always been.
export function retainedScopeProjection(value: unknown) {
  const history = value as Record<string, unknown>;
  const runs = retainedScopeRuns(value);
  return {
    ...(typeof history.format === 'string' ? { format: history.format } : {}),
    evidence: 'historical', ...runs.at(-1), runs,
  };
}

function committedNamed(observation: ScopeObservation, value: ScopeObservation): CommittedNamed {
  const boundaries = Object.fromEntries(Object.entries(value.boundaries)
    .filter(([path, state]) => JSON.stringify(observation.boundaries[path]) !== JSON.stringify(state)));
  const { evidence: _evidence, ...whole } = value;
  const delta: CommittedNamed = { targets: value.targets, ...(Object.keys(boundaries).length ? { boundaries } : {}) };
  return JSON.stringify(named(observation, delta)) === JSON.stringify(value) ? delta : { observation: whole };
}

function committedDiscovery(discovery: RetainedDiscovery) {
  const { evidence: _evidence, ...observation } = discovery.observation;
  return {
    identity: discovery.identity,
    ...(discovery.proposal !== undefined ? { proposal: discovery.proposal, absence: discovery.absence } : {}),
    ...(discovery.namedObservation ? { named: committedNamed(discovery.observation, discovery.namedObservation) } : {}),
    declarations: discovery.declarations,
    observation,
  };
}

function committedRun(run: ScopeHistoryRun) {
  return {
    inspection: run.inspection,
    resolved: run.resolved,
    ...(run.sourceResolved ? { sourceResolved: run.sourceResolved } : {}),
    ...(run.discovery ? { discovery: committedDiscovery(run.discovery) } : {}),
  };
}

// The retained scope history a completion writes: the ordered runs and nothing
// else, so no run is stored twice and a later completion adds only its own run.
export function committedScopeHistory(runs: readonly ScopeHistoryRun[]) {
  return { format: committedFormat, evidence: 'historical', runs: runs.map(committedRun) };
}
