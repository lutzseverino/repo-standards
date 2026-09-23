import type { Declaration, Operation, SourceDeclaration } from './model.js';
import type { Observation } from './inspection.js';

// An update's class says whether anything an adopter reviews in context
// changes. It is exact only when every declaration's guidance, discovery
// guidance, operations (definition, script, arguments and resources), and
// confirmed scope are hash-identical to the retained inputs and no declaration
// retires; any difference makes it contextual. Exact content, skills and the
// selection itself never affect the class.
export type UpdateClass = 'exact' | 'contextual';
export type ContextualChange = 'guidance' | 'discovery' | 'operations' | 'scope' | 'retired';
export interface DeclarationChanges { id: string; changes: ContextualChange[] }

type FileHashes = Record<string, { sha256: string; executable: boolean }>;
type Targets = { paths: string[]; directories: string[] };

// What the last complete adoption retained: its resolved declarations with
// their confirmed scope, the discovery guidance of each discovery declaration,
// and the hashes of every retained input file by project path.
export interface RetainedMaterial {
  resolved: readonly Declaration[];
  discovery: Readonly<Record<string, string>>;
  files: Readonly<Record<string, { sha256: string; executable: boolean }>>;
}

// What the candidate would retain: its source-resolved declarations, the
// declarations whose scope is confirmed, and each referenced source path's
// observation.
export interface CandidateMaterial {
  declarations: readonly SourceDeclaration[];
  resolved: readonly Declaration[];
  inputs: Readonly<Record<string, Observation>>;
}

const retainedSource = '.repo-standards/inputs/source/';

function sorted(files: FileHashes): FileHashes {
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

// A referenced path's files, keyed relative to it: '' for a file, '/name' for
// the files of a directory tree.
function retainedFiles(retained: RetainedMaterial, path: string): FileHashes {
  const base = retainedSource + path;
  return sorted(Object.fromEntries(Object.entries(retained.files)
    .filter(([name]) => name === base || name.startsWith(base + '/'))
    .map(([name, { sha256, executable }]) => [name.slice(base.length), { sha256, executable }])));
}

function candidateFiles(candidate: CandidateMaterial, path: string): FileHashes {
  const files: FileHashes = {};
  function visit(prefix: string, value: Observation) {
    if (value.type === 'file') files[prefix] = { sha256: value.sha256, executable: value.executable };
    else if (value.type === 'directory') for (const [name, child] of Object.entries(value.entries)) visit(`${prefix}/${name}`, child);
  }
  const value = candidate.inputs[path];
  if (value) visit('', value);
  return sorted(files);
}

// The reviewable material of one declaration, built field by field so that
// the comparison does not depend on how either side was serialized.
function material(declaration: { guidance?: string; fixes?: Operation[]; checks?: Operation[] }, discovery: string | undefined, scope: Targets | undefined, files: (path: string) => FileHashes) {
  const operations = (list: Operation[] = []) => list.map(operation => ({
    id: operation.id, executable: operation.run.executable, script: operation.run.script, scriptFiles: files(operation.run.script),
    arguments: operation.run.arguments, resources: operation.run.resources.map(path => ({ path, files: files(path) })),
    versionArguments: operation.prerequisite['version-arguments'], version: operation.prerequisite.version, timeout: operation['timeout-seconds'],
  }));
  const guided = declaration.guidance !== undefined;
  return {
    guidance: guided ? JSON.stringify(files(declaration.guidance!)) : null,
    discovery: discovery === undefined ? null : JSON.stringify(files(discovery)),
    operations: JSON.stringify({ fixes: operations(declaration.fixes), checks: operations(declaration.checks) }),
    scope: guided && scope ? JSON.stringify({ paths: [...scope.paths].sort(), directories: [...scope.directories].sort() }) : null,
  };
}

function targets(declaration: Declaration | undefined): Targets | undefined {
  if (!declaration || !('guidance' in declaration)) return undefined;
  return declaration.kind === 'repository' ? declaration.targets : { paths: [declaration.target], directories: [] };
}

export function classifyUpdate(retained: RetainedMaterial, candidate: CandidateMaterial) {
  const ids = [...new Set([...retained.resolved.map(declaration => declaration.id), ...candidate.declarations.map(declaration => declaration.id)])].sort();
  const contextualChanges = ids.flatMap((id): DeclarationChanges[] => {
    const previous = retained.resolved.find(declaration => declaration.id === id);
    const next = candidate.declarations.find(declaration => declaration.id === id);
    if (!next) return [{ id, changes: ['retired'] }];
    const before = previous
      ? material(previous, retained.discovery[id], targets(previous), path => retainedFiles(retained, path))
      : material({}, undefined, undefined, () => ({}));
    const after = material(next, 'discovery' in next ? next.discovery : undefined,
      targets(candidate.resolved.find(declaration => declaration.id === id)), path => candidateFiles(candidate, path));
    // A guided declaration whose scope is not confirmed yet cannot match.
    if ('guidance' in next && after.scope === null) after.scope = 'unconfirmed';
    const changes = (['guidance', 'discovery', 'operations', 'scope'] as const).filter(field => before[field] !== after[field]);
    return changes.length ? [{ id, changes }] : [];
  });
  return { updateClass: (contextualChanges.length ? 'contextual' : 'exact') as UpdateClass, contextualChanges };
}
