import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { allowedTargets } from './execution.js';
import type { ResolvedProfile, SourceProfile } from './model.js';
import { Paths, type Target } from './paths.js';
import { Fields, readYaml, type Diagnostic } from './yaml.js';
import { observeScope, type Evidence } from './scope-observation.js';

type Reference = Evidence | { kind: 'absence'; path: string };
interface Candidate { path: string; decision: 'include' | 'exclude'; reason: string; evidence: Reference[] }
interface Entry { id: string; paths: string[]; coverage: string; evidence: Reference[]; candidates: Candidate[]; unresolved: string[] }
export interface ScopeProposal { format: 'repo-standards/scope/v1'; request: string; declarations: Entry[] }
interface ScopeTargets { paths: string[]; directories: string[] }
type ConcreteScope = Record<string, ScopeTargets>;
interface ScopeBlocker { code: string; message: string }
interface ScopeValidationBase {
  root: string;
  sourceResolved: SourceProfile;
  request: string | undefined;
  proposalPath?: string;
  observationOptions?: Parameters<typeof observeScope>[2];
}
type ScopeValidationInput = ScopeValidationBase & (
  | { phase: 'inspection' }
  | { phase: 'amendment'; currentResolved: ResolvedProfile; existingScope: ConcreteScope }
);
function invalid(message: string): never { throw new ProductError('INVALID_SCOPE', message); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected a scope object.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !(key in record))) invalid(`Expected exactly these scope fields: ${keys.join(', ')}.`);
  return record;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) invalid('Expected nonempty scope text without NUL bytes.');
  return value;
}
function list<T>(value: unknown, parse: (item: unknown) => T, key: (item: T) => string): T[] {
  if (!Array.isArray(value)) invalid('Expected a scope list.');
  const result = value.map(parse);
  if (new Set(result.map(key)).size !== result.length) invalid('Duplicate scope entries or references are not allowed.');
  return result.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}
function reference(value: unknown): Reference {
  const absence = !!value && typeof value === 'object' && 'kind' in value && value.kind === 'absence';
  const ref = object(value, absence ? ['kind', 'path'] : ['kind', 'path', 'identity']);
  if (!['file', 'directory', 'absence'].includes(text(ref.kind))) invalid('Unsupported evidence kind.');
  const path = text(ref.path);
  return absence ? { kind: 'absence', path } : { kind: ref.kind as 'file' | 'directory', path, identity: text(ref.identity) };
}
const refKey = (ref: Reference) => `${ref.kind}:${ref.path}`;
const refs = (value: unknown) => list(value, reference, refKey);

function readScope(path: string, root: string): ScopeProposal {
  const location = realpathSync(resolve(path));
  const within = relative(root, location);
  if (!within || (!within.startsWith('../') && !isAbsolute(within))) invalid('Keep temporary proposal files outside the adopting project.');
  if (!lstatSync(location).isFile() || lstatSync(location).size > 2 * 1024 * 1024) invalid('Scope proposal must be a regular JSON file of at most 2 MiB.');
  const input = readFileSync(location, 'utf8');
  let value: unknown;
  try { value = JSON.parse(input); } catch { invalid('Scope proposal must be valid JSON.'); }
  const diagnostics: Diagnostic[] = [];
  readYaml(input, 'scope.json', diagnostics);
  if (diagnostics.length) invalid('Scope proposal contains duplicate keys or invalid structure.');
  const proposal = object(value, ['format', 'request', 'declarations']);
  if (proposal.format !== 'repo-standards/scope/v1') invalid('Unsupported scope proposal format.');
  return { format: proposal.format, request: text(proposal.request), declarations: list(proposal.declarations, value => {
    const entry = object(value, ['id', 'paths', 'coverage', 'evidence', 'candidates', 'unresolved']);
    return { id: text(entry.id), paths: list(entry.paths, text, text), coverage: text(entry.coverage), evidence: refs(entry.evidence),
      candidates: list(entry.candidates, value => {
        const candidate = object(value, ['path', 'decision', 'reason', 'evidence']);
        if (candidate.decision !== 'include' && candidate.decision !== 'exclude') invalid('Candidate decision must be include or exclude.');
        return { path: text(candidate.path), decision: candidate.decision, reason: text(candidate.reason), evidence: refs(candidate.evidence) };
      }, candidate => candidate.path), unresolved: list(entry.unresolved, text, text) };
  }, entry => entry.id) };
}

// Project scope reuses author target syntax/ownership validation; source
// declarations themselves remain unchanged and are retained independently.
function materializeScope(root: string, profile: SourceProfile, proposal?: ScopeProposal): ResolvedProfile {
  const discoveries = profile.declarations.filter(declaration => 'discovery' in declaration);
  if (proposal && JSON.stringify(proposal.declarations.map(entry => entry.id)) !== JSON.stringify(discoveries.map(declaration => declaration.id).sort())) invalid('Supply exactly one entry per active discovery declaration and none for explicit or excluded declarations.');
  const fields = new Fields((code, message) => { throw new ProductError(code, message); });
  const paths = new Paths(root, fields);
  for (const entry of proposal?.declarations ?? []) for (const candidate of entry.candidates) {
    if (!paths.explicit({ data: candidate.path, offset: 0, path: entry.id })) invalid('Invalid candidate path.');
  }
  const targets: Target[] = [];
  const resolved: ResolvedProfile = { ...profile, declarations: profile.declarations.flatMap(declaration => {
    if (!('discovery' in declaration)) return [declaration];
    const entry = proposal?.declarations.find(entry => entry.id === declaration.id);
    if (!entry) return [];
    const { discovery: _discovery, ...concrete } = declaration;
    return [{ ...concrete, targets: { paths: entry.paths, directories: [] } }];
  }) };
  for (const declaration of resolved.declarations) {
    const names = declaration.kind === 'repository' ? [...declaration.targets.paths, ...declaration.targets.directories] : [declaration.kind === 'skill' ? `.agents/skills/${declaration.name}` : declaration.target];
    for (const name of names) {
      const target = paths.target({ data: name, offset: 0, path: declaration.id });
      if (!target) invalid('Invalid discovered target.');
      targets.push(target);
    }
  }
  paths.conflicts(targets, 'scope');
  return resolved;
}

function validateScopeEvidence(proposal: ScopeProposal, observation: ReturnType<typeof observeScope>) {
  const eligible = new Map(observation.evidence.map(evidence => [refKey(evidence), evidence]));
  const absence: Evidence[] = [];
  function validate(ref: Reference): Evidence {
    if (ref.kind === 'absence') {
      if (observation.targets[ref.path]?.type !== 'missing') invalid(`Absence evidence is not an observed absent target: ${ref.path}.`);
      const derived: Evidence = { kind: 'absence', path: ref.path, identity: `sha256:${hash(JSON.stringify({ path: ref.path, state: observation.targets[ref.path], boundaries: observation.boundaries }))}` };
      absence.push(derived);
      return derived;
    }
    const actual = eligible.get(refKey(ref));
    if (!actual || ref.identity !== actual.identity) invalid(`Unknown, stale, or ineligible evidence reference: ${ref.path}.`);
    return actual;
  }
  for (const entry of proposal.declarations) {
    if (!entry.evidence.length) invalid('Every declaration, including empty scope, requires eligible evidence.');
    entry.evidence.forEach(validate);
    for (const candidate of entry.candidates) {
      if (!candidate.evidence.length) invalid('Every candidate requires eligible evidence.');
      candidate.evidence.forEach(validate);
      if ((candidate.decision === 'include') !== entry.paths.includes(candidate.path)) invalid('Included candidates must correspond exactly to concrete scope paths.');
    }
    for (const path of entry.paths) {
      const candidate = entry.candidates.find(candidate => candidate.path === path && candidate.decision === 'include');
      if (!candidate) invalid(`Explain inclusion of every concrete target: ${path}.`);
      if (observation.targets[path]?.type === 'missing') {
        if (!candidate.evidence.some(ref => ref.kind === 'absence' && ref.path === path)) invalid(`Missing target requires absence evidence: ${path}.`);
        if (/^readme(?:\.[^/]*)?$/i.test(path.split('/').at(-1)!)) {
          const parent = dirname(path);
          const member = (file: string) => file !== path && (parent === '.' || file.startsWith(`${parent}/`));
          if (!candidate.evidence.some(ref => ref.kind === 'file' ? member(ref.path) : ref.kind === 'directory' && (ref.path === parent || member(ref.path)) && Object.entries(observation.files).some(([file, state]) => state.type === 'file' && (ref.path === '.' || file.startsWith(`${ref.path}/`))))) invalid(`Missing project README requires positive membership evidence as well as absence: ${path}.`);
        }
      }
    }
  }
  return [...new Map(absence.map(ref => [ref.path, ref])).values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function concreteScope(resolved: ResolvedProfile): ConcreteScope {
  return Object.fromEntries(resolved.declarations.map(declaration => [declaration.id, allowedTargets(declaration)]));
}

// Scope proposals have one validation sequence for initial inspection and
// active-run amendment. The caller still owns the request identity and the
// phase-specific freshness checks around this result.
export function validateScope(input: ScopeValidationInput) {
  const proposal = input.proposalPath ? readScope(input.proposalPath, input.root) : undefined;
  if (proposal && proposal.request !== input.request) {
    throw new ProductError('STALE_SCOPE', input.phase === 'inspection'
      ? 'Scope proposal does not match this discovery request. Inspect again and review fresh evidence.'
      : 'The amendment proposal does not match the active run and current observation. Inspect --amend-scope again and review fresh evidence.');
  }

  const resolved = proposal ? materializeScope(input.root, input.sourceResolved, proposal)
    : input.phase === 'amendment' ? input.currentResolved : materializeScope(input.root, input.sourceResolved);
  let proposedScope: ConcreteScope | undefined;
  let additions: Record<string, string[]> | undefined;
  if (proposal && input.phase === 'amendment') {
    proposedScope = concreteScope(resolved);
    for (const declaration of input.sourceResolved.declarations) {
      const before = input.existingScope[declaration.id]!;
      const after = proposedScope[declaration.id]!;
      if ('discovery' in declaration) {
        if (before.paths.some(path => !after.paths.includes(path))) {
          throw new ProductError('SCOPE_RECONCILIATION_REQUIRED', `Cannot remove or transfer previously authorized targets from ${declaration.id}. Withdrawing a mistaken target requires reconciliation outside this active run; leave the run incomplete, preserve work, and abandon and reconcile before a new clean adoption.`);
        }
      } else if (JSON.stringify(before) !== JSON.stringify(after)) {
        throw new ProductError('SELECTION_SWITCH', 'Scope amendment cannot change explicit targets or the selected declarations.');
      }
    }
    additions = Object.fromEntries(input.sourceResolved.declarations.filter(declaration => 'discovery' in declaration)
      .map(declaration => [declaration.id, proposedScope![declaration.id]!.paths.filter(path => !input.existingScope[declaration.id]!.paths.includes(path))]));
  }

  const named = proposal?.declarations.flatMap(entry => entry.paths) ?? [];
  const namedObservation = proposal ? observeScope(input.root, named, input.observationOptions) : undefined;
  const absence = proposal ? validateScopeEvidence(proposal, namedObservation!) : [];
  const blockers: ScopeBlocker[] = [];
  if (input.sourceResolved.declarations.some(declaration => 'discovery' in declaration)) {
    if (!proposal) blockers.push({ code: 'DISCOVERY_REQUIRED', message: input.phase === 'inspection'
      ? 'Interpret the discovery guidance and submit an evidence-backed repo-standards/scope/v1 proposal with inspect --scope.'
      : 'Review current evidence and submit a complete repo-standards/scope/v1 proposal with inspect --amend-scope --scope <file>, retaining every previously authorized target per declaration.' });
    if (proposal?.declarations.some(entry => entry.unresolved.length)) blockers.push({ code: 'UNRESOLVED_SCOPE', message: input.phase === 'inspection'
      ? 'Resolve the reported discovery questions and inspect a revised proposal.'
      : 'Resolve discovery questions and inspect a revised amendment proposal before confirmation.' });
  }

  return {
    resolved, named, absence, blockers,
    ...(proposal ? { proposal, namedObservation } : {}),
    ...(proposedScope ? { proposedScope, additions: additions! } : {}),
  };
}
