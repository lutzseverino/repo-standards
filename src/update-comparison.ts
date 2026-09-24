import { ProductError } from './errors.js';
import type { Declaration, Operation, SourceDeclaration } from './model.js';
import { matchesInventory, targetObservation, type Blocker, type Observation } from './observation.js';
import type { RecordedAdoption, RecordedSelection } from './recorded-state.js';

// The update comparison: what inspecting a candidate against an established
// adoption changes. It takes the verified recorded adoption, the candidate
// selection and materials, and the observed project, and returns the whole
// update part of an inspection report together with the blockers the recorded
// baselines raise. It rejects a moved tag.
//
// An update's class says whether anything an adopter reviews in context
// changes. It is exact only when every declaration's guidance, discovery
// guidance, operations (definition, script, arguments and resources), and
// confirmed scope are hash-identical to the retained inputs and no declaration
// retires; any difference makes it contextual. Exact content, skills and the
// selection itself never affect the class.
type UpdateClass = 'exact' | 'contextual';
type ContextualChange = 'guidance' | 'discovery' | 'operations' | 'scope' | 'retired';
interface DeclarationChanges { id: string; changes: ContextualChange[] }

type FileHashes = Record<string, { sha256: string; executable: boolean }>;
type Targets = { paths: string[]; directories: string[] };

// What the candidate would adopt: its selection, its source-resolved
// declarations, the declarations whose scope is confirmed, and each referenced
// source path's observation.
interface UpdateCandidate {
  selection: RecordedSelection;
  declarations: readonly SourceDeclaration[];
  resolved: readonly Declaration[];
  inputs: Readonly<Record<string, Observation>>;
}

// The project the update would change: its root and the observed product state
// directory.
interface ObservedProject { root: string; productState: Observation }

// The selection components an update can change, in reporting order.
const selectionComponents = ['cli', 'standards', 'source', 'profile'] as const;
type SelectionComponent = typeof selectionComponents[number];

const retainedSource = '.repo-standards/inputs/source/';

function sorted(files: FileHashes): FileHashes {
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

// A referenced path's files, keyed relative to it: '' for a file, '/name' for
// the files of a directory tree.
function retainedFiles(recorded: RecordedAdoption, path: string): FileHashes {
  const base = retainedSource + path;
  return sorted(Object.fromEntries(Object.entries(recorded.files)
    .filter(([name]) => name === base || name.startsWith(base + '/'))
    .map(([name, { sha256, executable }]) => [name.slice(base.length), { sha256, executable }])));
}

function candidateFiles(candidate: UpdateCandidate, path: string): FileHashes {
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

// The contextual changes of one declaration the candidate declares, against
// the discovery guidance each retained declaration's confirmed scope was
// discovered with.
function declarationChanges(recorded: RecordedAdoption, discovery: Readonly<Record<string, string>>, candidate: UpdateCandidate, next: SourceDeclaration): ContextualChange[] {
  const previous = recorded.resolved.declarations.find(declaration => declaration.id === next.id);
  const before = previous
    ? material(previous, discovery[next.id], targets(previous), path => retainedFiles(recorded, path))
    : material({}, undefined, undefined, () => ({}));
  const after = material(next, 'discovery' in next ? next.discovery : undefined,
    targets(candidate.resolved.find(declaration => declaration.id === next.id)), path => candidateFiles(candidate, path));
  // A guided declaration whose scope is not confirmed yet cannot match.
  if ('guidance' in next && after.scope === null) after.scope = 'unconfirmed';
  return (['guidance', 'discovery', 'operations', 'scope'] as const).filter(field => before[field] !== after[field]);
}

// Known edits to installed content, and any change to the durable product-state
// inventory, block the entire update before mutation.
function baselineBlockers(recorded: RecordedAdoption, project: ObservedProject) {
  const blockers: Blocker[] = [];
  for (const [path, expected] of Object.entries(recorded.state.baselines)) {
    const actual = targetObservation(project.root, path, blockers);
    if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) blockers.push({ code: 'INSTALLED_CONTENT_EDITED', path, message: 'Installed exact content differs from its last-complete baseline. Reconcile it before updating.' });
  }
  for (const [path, expected] of Object.entries(recorded.state.skills)) {
    const actual = targetObservation(project.root, path, blockers);
    if (!matchesInventory(actual, expected)) blockers.push({ code: 'INSTALLED_CONTENT_EDITED', path, message: 'The installed skill inventory differs from its last-complete baseline. Reconcile added or removed resources before updating.' });
  }
  const expectedProductFiles = [...Object.keys(recorded.files).filter(path => path.startsWith('.repo-standards/')), '.repo-standards/lock.json', '.repo-standards/state.json'].sort();
  if (!matchesInventory(project.productState, expectedProductFiles.map(path => path.slice('.repo-standards/'.length)))) {
    blockers.push({ code: 'STATE_INTEGRITY', path: '.repo-standards', message: 'The durable product-state inventory changed. Reconcile added or removed material before updating.' });
  }
  return blockers;
}

export function compareUpdate(recorded: RecordedAdoption, candidate: UpdateCandidate, project: ObservedProject) {
  const [before, after] = [recorded.selection.standards, candidate.selection.standards];
  const sameSource = after.repository.toLowerCase() === before.repository.toLowerCase();
  if (sameSource && after.version === before.version && after.commit !== before.commit) {
    throw new ProductError('MOVED_TAG', `The recorded ${after.version} tag previously resolved to ${before.commit}; it now resolves to ${after.commit}. Choose a new immutable version.`);
  }
  // Every changed selection component is named together; an unchanged
  // selection is re-applied.
  const changed: Record<SelectionComponent, boolean> = {
    cli: candidate.selection.cli.version !== recorded.selection.cli.version,
    standards: after.version !== before.version || after.commit !== before.commit,
    source: !sameSource,
    profile: candidate.selection.profile !== recorded.selection.profile,
  };
  const blockers = baselineBlockers(recorded, project);
  // Retirement compares source declarations: an active discovery declaration
  // awaiting its scope proposal is still declared.
  const retired = recorded.resolved.declarations.filter(old => !candidate.declarations.some(declaration => declaration.id === old.id));
  const discovery: Record<string, string> = Object.fromEntries((recorded.scopeHistory?.at(-1)?.sourceResolved?.declarations ?? [])
    .flatMap(declaration => declaration.discovery ? [[declaration.id, declaration.discovery]] : []));
  const contextualChanges: DeclarationChanges[] = [
    ...retired.map(({ id }): DeclarationChanges => ({ id, changes: ['retired'] })),
    ...candidate.declarations.flatMap(declaration => {
      const changes = declarationChanges(recorded, discovery, candidate, declaration);
      return changes.length ? [{ id: declaration.id, changes }] : [];
    }),
  ].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    report: {
      update: selectionComponents.filter(component => changed[component]),
      previousSelection: recorded.selection,
      retired,
      updateClass: (contextualChanges.length ? 'contextual' : 'exact') as UpdateClass,
      contextualChanges,
    },
    blockers,
  };
}
