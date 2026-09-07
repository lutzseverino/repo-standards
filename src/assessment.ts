import { hash } from './acquisition.js';
import { ProductError } from './errors.js';
import { git, targetObservation } from './inspection.js';

export interface Assessment {
  format: 'repo-standards/assessment/v1'; run: string; selection: string; snapshot: string;
  declarations: { id: string; status: 'satisfied' | 'blocked'; explanation: string; changedPaths: string[]; evidence: string[] }[];
}
export interface WorkRequest {
  run: string; selection: string; snapshot: string;
  declarations: { id: string; allowedTargets: { paths: string[]; directories: string[] } }[];
}
export function projectSnapshot(root: string) {
  const result = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  if (result.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot observe tracked and non-ignored untracked project content.');
  const paths = [...new Set(result.stdout.split('\0').filter(path => path && path !== '.repo-standards' && !path.startsWith('.repo-standards/')))].sort();
  return JSON.stringify(paths.map(path => [path, targetObservation(root, path, [])]), null, 2) + '\n';
}
export function assessmentSnapshot(root: string, attempt = 0) {
  return `sha256:${hash(projectSnapshot(root) + (attempt ? `retry:${attempt}` : ''))}`;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text) && new Set(value).size === value.length; }
function path(value: string) { return !/^[A-Za-z]:|[\\\p{Cc}]/u.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..'); }

function allows(targets: WorkRequest['declarations'][number]['allowedTargets'], path: string) {
  return targets.paths.includes(path) || targets.directories.some(directory => path === directory || path.startsWith(directory + '/'));
}

export function validateAssessment(root: string, run: { workRequest?: WorkRequest; retryHistory?: unknown[] }, baseline: string, input: unknown): Assessment {
  if (!object(input) || !keys(input, ['format', 'run', 'selection', 'snapshot', 'declarations']) || input.format !== 'repo-standards/assessment/v1'
    || !text(input.run) || !text(input.selection) || !text(input.snapshot) || !Array.isArray(input.declarations)) {
    throw new ProductError('ASSESSMENT_FORMAT', 'Expected a repo-standards/assessment/v1 submission with run, selection, snapshot and declarations.');
  }
  const request = run.workRequest!;
  if (input.run !== request.run || input.selection !== request.selection) throw new ProductError('ASSESSMENT_MISMATCH', 'Assessment identifies another adoption run or selection. Use the current work request.');
  const current = projectSnapshot(root);
  if (input.snapshot !== request.snapshot || input.snapshot !== assessmentSnapshot(root, run.retryHistory?.length)) throw new ProductError('STALE_ASSESSMENT', 'Project content changed. Refresh the work request with resume, reassess, and submit its snapshot.');
  const ids = new Set<string>();
  const reported = new Set<string>();
  const before = new Map<string, unknown>(JSON.parse(baseline));
  const after = new Map<string, unknown>(JSON.parse(current));
  const changed = new Set([...before.keys(), ...after.keys()].filter(path => JSON.stringify(before.get(path)) !== JSON.stringify(after.get(path))));
  for (const entry of input.declarations) {
    if (!object(entry) || !keys(entry, ['id', 'status', 'explanation', 'changedPaths', 'evidence']) || !text(entry.id)
      || (entry.status !== 'satisfied' && entry.status !== 'blocked') || !text(entry.explanation) || !strings(entry.changedPaths)
      || !entry.changedPaths.every(path) || !strings(entry.evidence) || entry.evidence.length === 0) {
      throw new ProductError('ASSESSMENT_FORMAT', 'Each declaration needs an ID, satisfied or blocked status, explanation, unique repository-relative changedPaths, and nonempty supporting evidence.');
    }
    const declaration = request.declarations.find(declaration => declaration.id === entry.id);
    if (!declaration || ids.has(entry.id)) throw new ProductError('ASSESSMENT_DECLARATIONS', `Unexpected or repeated contextual declaration: ${entry.id}.`);
    ids.add(entry.id);
    for (const path of entry.changedPaths) {
      const targets = declaration.allowedTargets;
      if (!allows(targets, path)) throw new ProductError('ASSESSMENT_SCOPE', `Path ${path} is outside declaration ${entry.id}'s allowed targets.`);
      if (!changed.has(path)) throw new ProductError('ASSESSMENT_PATHS', `Reported path did not change during contextual work: ${path}.`);
      reported.add(path);
    }
  }
  if (ids.size !== request.declarations.length) throw new ProductError('ASSESSMENT_DECLARATIONS', 'Submit evidence for every contextual declaration.');
  for (const path of changed) {
    const inScope = request.declarations.some(({ allowedTargets }) => allows(allowedTargets, path));
    if (!inScope) throw new ProductError('ASSESSMENT_SCOPE', `Observed contextual change is outside allowed targets: ${path}. Preserve and reconcile that work before resubmission.`);
    if (!reported.has(path)) throw new ProductError('ASSESSMENT_PATHS', `Observed contextual change was omitted: ${path}.`);
    const blockers: Parameters<typeof targetObservation>[2] = [];
    targetObservation(root, path, blockers);
    if (blockers.length) throw new ProductError('UNSAFE_TARGET', `Contextual path is unsafe: ${path}.`, blockers);
  }
  return input as unknown as Assessment;
}
