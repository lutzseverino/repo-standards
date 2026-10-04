import { ProductError } from './errors.js';
import { formats, requireFormat } from './formats.js';
import { scopeEvidence, type Evidence, type FileState, type ScopeObservation } from './scope-observation.js';

// Scope evidence is the retained discovery observations behind the current
// confirmed scope. This module owns the retained scope-evidence file: what a
// run retains, how its single format is validated on read, and how it is
// projected for a report. The file holds the current run only, with its scope
// change against the previous run computed when the run is planned, so it does
// not grow with the number of runs and nothing reads an earlier run. The project
// observation is stored without the evidence array it implies, and the named
// observation as its delta from that observation. Evidence arrays and the full
// named observation are rebuilt on read with the product's existing derivation.

const evidencePath = '.repo-standards/inputs/scope-history.json';

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

// The retained run as its readers see it.
export interface ScopeRun {
  inspection: string;
  resolved: RetainedProfile;
  sourceResolved?: RetainedProfile;
  discovery?: RetainedDiscovery;
}

export interface ScopeChange { id: string; additions: string[]; removals: string[] }

// Retained scope evidence: the current run and its scope change against the
// previous run.
export interface RetainedScopeEvidence extends ScopeRun { scopeChanges: ScopeChange[] }

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

const strings = (value: unknown) => Array.isArray(value) && value.every(entry => typeof entry === 'string');

// The committed guarantee: the file holds the current run, stored once, and its
// scope change, and nothing else; a discovery run carries both its discovery
// and its source-resolved declarations, and its discovery carries neither a
// derived evidence array nor a full named observation.
const committedFields = ['format', 'evidence', 'inspection', 'resolved', 'sourceResolved', 'discovery', 'scopeChanges'];
function compactEvidence(stored: Record<string, unknown>) {
  if (Object.keys(stored).some(key => !committedFields.includes(key))) return false;
  if (stored.evidence !== 'historical' || typeof stored.inspection !== 'string' || !stored.resolved || typeof stored.resolved !== 'object') return false;
  if (!Array.isArray(stored.scopeChanges) || !stored.scopeChanges.every(value => {
    const change = value as Record<string, unknown> | null;
    return !!change && typeof change === 'object' && typeof change.id === 'string' && strings(change.additions) && strings(change.removals);
  })) return false;
  if ((stored.discovery === undefined) !== (stored.sourceResolved === undefined)) return false;
  if (stored.discovery === undefined) return true;
  const discovery = stored.discovery as Record<string, unknown> | null;
  if (!discovery || typeof discovery !== 'object') return false;
  const observation = discovery.observation as Record<string, unknown> | undefined;
  return !!observation && typeof observation === 'object'
    && !Object.hasOwn(discovery, 'evidence') && !Object.hasOwn(discovery, 'namedObservation') && !Object.hasOwn(observation, 'evidence');
}

// Retained scope evidence is read in its single committed format only.
function committedEvidence(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') unreadable();
  requireFormat(evidencePath, value, formats.scopeHistory);
  const evidence = value as Record<string, unknown>;
  if (evidence.format !== formats.scopeHistory || !compactEvidence(evidence)) invalid();
  return evidence;
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

// The retained scope evidence in the form its readers expect. The
// recorded-adoption reader parses the retained file once, through here.
export function retainedScopeEvidence(value: unknown): RetainedScopeEvidence {
  const evidence = committedEvidence(value);
  return {
    inspection: evidence.inspection as string,
    resolved: evidence.resolved as RetainedProfile,
    ...(evidence.sourceResolved ? { sourceResolved: evidence.sourceResolved } : {}),
    ...(evidence.discovery ? { discovery: retainedDiscovery(evidence.discovery) } : {}),
    scopeChanges: evidence.scopeChanges as ScopeChange[],
  };
}

type ScopeSelection = Pick<ScopeRun, 'resolved' | 'sourceResolved'>;

// Discovered-scope additions and removals by declaration from one confirmed
// selection to the next. A side without a discovery declaration has no
// discovered paths for it; without a prior selection every path is added.
export function scopeChanges(prior: ScopeSelection | undefined, current: ScopeSelection): ScopeChange[] {
  const discovered = (selection: ScopeSelection | undefined) => selection?.sourceResolved?.declarations?.filter(declaration => declaration.discovery).map(declaration => declaration.id) ?? [];
  const [priorIds, currentIds] = [discovered(prior), discovered(current)];
  const paths = (selection: ScopeSelection | undefined, ids: string[], id: string) => {
    const declaration = selection?.resolved?.declarations?.find(entry => entry.id === id);
    return ids.includes(id) && declaration?.kind === 'repository' ? declaration.targets?.paths ?? [] : [];
  };
  return [...new Set([...priorIds, ...currentIds])].sort().flatMap(id => {
    const [oldPaths, newPaths] = [paths(prior, priorIds, id), paths(current, currentIds, id)];
    const additions = newPaths.filter(path => !oldPaths.includes(path)).sort();
    const removals = oldPaths.filter(path => !newPaths.includes(path)).sort();
    return additions.length || removals.length ? [{ id, additions, removals }] : [];
  });
}

// The historical scope a retained inspection reports: the retained run and its
// scope change, as the file holds them, with derived evidence rebuilt.
export function retainedScopeProjection(evidence: RetainedScopeEvidence) {
  return { format: formats.scopeHistory, evidence: 'historical', ...evidence };
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

// The retained scope evidence a run writes: the current run and its scope
// change against the previous run, computed from the run that confirmed the
// previous scope. Earlier runs are not carried.
export function committedScopeEvidence(run: ScopeRun, previous: ScopeSelection | undefined) {
  return {
    format: formats.scopeHistory, evidence: 'historical',
    inspection: run.inspection,
    resolved: run.resolved,
    ...(run.sourceResolved ? { sourceResolved: run.sourceResolved } : {}),
    ...(run.discovery ? { discovery: committedDiscovery(run.discovery) } : {}),
    scopeChanges: scopeChanges(previous, run),
  };
}
