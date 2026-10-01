import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { formats } from './formats.js';
import { allowedTargets } from './execution.js';
import type { ResolvedProfile, SourceProfile } from './model.js';
import { Paths, type Target } from './paths.js';
import { Fields, readYaml, type Diagnostic } from './yaml.js';
import { observeScope, type Evidence } from './scope-observation.js';

// A proposal holds only the agent's judgment: per active discovery
// declaration, its candidates with their evidence paths, its coverage, and
// unresolved questions. Everything mechanical is derived from the observation
// the proposal is inspected against.
interface Candidate { path: string; decision: 'include' | 'exclude'; reason: string; evidence: string[] }
interface Entry { id: string; coverage: string; candidates: Candidate[]; unresolved: string[] }
export interface ScopeProposal { format: typeof formats.scope; declarations: Entry[] }
interface ScopeTargets { paths: string[]; directories: string[] }
export type Scope = Record<string, ScopeTargets>;
interface ScopeBlocker { code: string; message: string }
interface ScopeValidationInput {
  root: string;
  sourceResolved: SourceProfile;
  proposalPath?: string;
}
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
  if (new Set(result.map(key)).size !== result.length) invalid('Duplicate scope entries or evidence paths are not allowed.');
  return result.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}
const byPath = (a: { path: string }, b: { path: string }) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
const included = (entry: Entry) => entry.candidates.filter(candidate => candidate.decision === 'include').map(candidate => candidate.path);

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
  // The format is checked first: a retired proposal format is never read.
  const format = value && typeof value === 'object' ? (value as { format?: unknown }).format : undefined;
  if (format !== formats.scope) invalid(`Scope proposal format must be ${formats.scope}; other proposal formats are not read. Write the proposal again in this format.`);
  const proposal = object(value, ['format', 'declarations']);
  return { format: formats.scope, declarations: list(proposal.declarations, value => {
    const entry = object(value, ['id', 'coverage', 'candidates', 'unresolved']);
    return { id: text(entry.id), coverage: text(entry.coverage),
      candidates: list(entry.candidates, value => {
        const candidate = object(value, ['path', 'decision', 'reason', 'evidence']);
        if (candidate.decision !== 'include' && candidate.decision !== 'exclude') invalid('Candidate decision must be include or exclude.');
        return { path: text(candidate.path), decision: candidate.decision, reason: text(candidate.reason), evidence: list(candidate.evidence, text, text) };
      }, candidate => candidate.path), unresolved: list(entry.unresolved, text, text) };
  }, entry => entry.id) };
}

// Project scope reuses author target syntax/ownership validation; source
// declarations themselves remain unchanged and are retained independently.
function materializeScope(root: string, profile: SourceProfile, proposal?: ScopeProposal): ResolvedProfile {
  const discoveries = profile.declarations.filter(declaration => 'discovery' in declaration).map(declaration => declaration.id);
  if (proposal && !discoveries.length) invalid('This selection has no active discovery declarations. Inspect it without --scope.');
  if (proposal) {
    const ids = proposal.declarations.map(entry => entry.id);
    const missing = discoveries.filter(id => !ids.includes(id)).sort();
    const unknown = ids.filter(id => !discoveries.includes(id));
    if (missing.length || unknown.length) invalid([
      ...missing.length ? [`Scope proposal is missing entries for the active discovery declarations: ${missing.join(', ')}.`] : [],
      ...unknown.length ? [`Scope proposal has entries for declarations that are not active discovery declarations of this selection: ${unknown.join(', ')}.`] : [],
      'Supply exactly one entry per active discovery declaration and none for explicit or excluded declarations.',
    ].join(' '));
  }
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
    return [{ ...concrete, targets: { paths: included(entry), directories: [] } }];
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

// Resolves every evidence path against the observation and derives the
// absence evidence of each included target the project does not have yet.
function validateScopeEvidence(proposal: ScopeProposal, observation: ReturnType<typeof observeScope>) {
  const eligible = new Map(observation.evidence.map(evidence => [evidence.path, evidence]));
  const absence: Evidence[] = [];
  for (const entry of proposal.declarations) for (const candidate of entry.candidates) {
    const evidence = candidate.evidence.map(path => {
      const actual = eligible.get(path);
      if (!actual) invalid(`Evidence path ${path} of candidate ${candidate.path} is not an eligible file or directory in the discovery observation. Cite a path from discovery.evidence, or inspect again if the project changed.`);
      return actual;
    });
    if (candidate.decision === 'include' && observation.targets[candidate.path]?.type === 'missing') {
      const path = candidate.path;
      absence.push({ kind: 'absence', path, identity: `sha256:${hash(JSON.stringify({ path, state: observation.targets[path], boundaries: observation.boundaries }))}` });
      if (/^readme(?:\.[^/]*)?$/i.test(path.split('/').at(-1)!)) {
        const parent = dirname(path);
        const member = (file: string) => file !== path && (parent === '.' || file.startsWith(`${parent}/`));
        if (!evidence.some(ref => ref.kind === 'file' ? member(ref.path) : ref.kind === 'directory' && (ref.path === parent || member(ref.path)) && Object.entries(observation.files).some(([file, state]) => state.type === 'file' && (ref.path === '.' || file.startsWith(`${ref.path}/`))))) invalid(`Missing project README requires positive membership evidence: cite a file or nonempty directory within its project directory: ${path}.`);
      }
    } else if (!evidence.length) invalid(`Candidate ${candidate.path} requires at least one evidence path from the discovery observation.`);
  }
  return absence.sort(byPath);
}

export function concreteScope(resolved: ResolvedProfile): Scope {
  return Object.fromEntries(resolved.declarations.map(declaration => [declaration.id, allowedTargets(declaration)]));
}

// The caller derives the request identity from the observation it inspects
// against and owns the freshness checks around this result.
export function validateScope(input: ScopeValidationInput) {
  const proposal = input.proposalPath ? readScope(input.proposalPath, input.root) : undefined;
  const resolved = materializeScope(input.root, input.sourceResolved, proposal);
  const named = proposal?.declarations.flatMap(included) ?? [];
  const namedObservation = proposal ? observeScope(input.root, named) : undefined;
  const absence = proposal ? validateScopeEvidence(proposal, namedObservation!) : [];
  const blockers: ScopeBlocker[] = [];
  if (input.sourceResolved.declarations.some(declaration => 'discovery' in declaration)) {
    if (!proposal) blockers.push({ code: 'DISCOVERY_REQUIRED', message: `Interpret the discovery guidance and submit an evidence-backed ${formats.scope} proposal with inspect --scope.` });
    if (proposal?.declarations.some(entry => entry.unresolved.length)) blockers.push({ code: 'UNRESOLVED_SCOPE', message: 'Resolve the reported discovery questions and inspect a revised proposal.' });
  }

  return {
    resolved, named, absence, blockers,
    ...(proposal ? { proposal, namedObservation } : {}),
  };
}
