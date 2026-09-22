import { permits } from './work-observation.js';
import { ProductError } from './errors.js';
import { targetObservation } from './inspection.js';

export interface ScopeConfirmation { inspection: string; afterFixes: string }
interface ScopeReview { status: 'valid' | 'blocked'; explanation: string; evidence: string[]; additionalPaths: string[] }
export interface Assessment {
  format: 'repo-standards/assessment/v2';
  scope?: ScopeConfirmation; run: string; selection: string; snapshot: string;
  declarations: { id: string; status: 'satisfied' | 'blocked'; explanation: string; changedPaths: string[]; evidence: string[]; scopeValidity?: { afterFixes: ScopeReview; current: ScopeReview } }[];
}
export interface WorkRequest {
  scope?: ScopeConfirmation;
  run: string; selection: string; snapshot: string;
  declarations: { id: string; discovery?: unknown; allowedTargets: { paths: string[]; directories: string[] } }[];
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text) && new Set(value).size === value.length; }
function path(value: string) { return !/^[A-Za-z]:|[\\\p{Cc}]/u.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..'); }

export function validateAssessment(root: string, run: { workRequest?: WorkRequest }, input: unknown, observation: { snapshot: string; changedPaths: string[] }): Assessment {
  const request = run.workRequest!;
  const discovery = request.scope !== undefined;
  const format = 'repo-standards/assessment/v2';
  if (!object(input) || !keys(input, ['format', 'run', 'selection', 'snapshot', 'declarations', ...(discovery ? ['scope'] : [])]) || input.format !== format
    || !text(input.run) || !text(input.selection) || !text(input.snapshot) || !Array.isArray(input.declarations)) {
    throw new ProductError('ASSESSMENT_FORMAT', `Expected a ${format} submission with run, selection, snapshot, declarations${discovery ? ' and scope' : ''}.`);
  }
  if (discovery && (!object(input.scope) || !keys(input.scope, ['inspection', 'afterFixes'])
    || input.scope.inspection !== request.scope!.inspection || input.scope.afterFixes !== request.scope!.afterFixes)) throw new ProductError('ASSESSMENT_SCOPE_MISMATCH', 'Copy the confirmed scope and post-fix snapshot identities from the current work request.');
  if (input.run !== request.run || input.selection !== request.selection) throw new ProductError('ASSESSMENT_MISMATCH', 'Assessment identifies another adoption run or selection. Use the current work request.');
  if (input.snapshot !== request.snapshot || input.snapshot !== observation.snapshot) throw new ProductError('STALE_ASSESSMENT', 'Project content changed. Refresh the work request with resume, reassess, and submit its snapshot.');
  const ids = new Set<string>();
  const reported = new Set<string>();
  const changed = new Set(observation.changedPaths);
  for (const entry of input.declarations) {
    const discovered = object(entry) && request.declarations.some(declaration => declaration.id === entry.id && declaration.discovery !== undefined);
    if (!object(entry) || !keys(entry, ['id', 'status', 'explanation', 'changedPaths', 'evidence', ...(discovered ? ['scopeValidity'] : [])]) || !text(entry.id)
      || (entry.status !== 'satisfied' && entry.status !== 'blocked') || !text(entry.explanation) || !strings(entry.changedPaths)
      || !entry.changedPaths.every(path) || !strings(entry.evidence) || entry.evidence.length === 0) {
      throw new ProductError('ASSESSMENT_FORMAT', 'Each declaration needs an ID, satisfied or blocked status, explanation, unique repository-relative changedPaths, and nonempty supporting evidence.');
    }
    if (discovered) {
      if (!object(entry.scopeValidity) || !keys(entry.scopeValidity, ['afterFixes', 'current'])) throw new ProductError('ASSESSMENT_FORMAT', 'Discovery requires scopeValidity reviews afterFixes and current.');
      for (const review of Object.values(entry.scopeValidity)) {
        if (!object(review) || !keys(review, ['status', 'explanation', 'evidence', 'additionalPaths'])
          || (review.status !== 'valid' && review.status !== 'blocked') || !text(review.explanation) || !strings(review.evidence) || !review.evidence.length
          || !strings(review.additionalPaths) || !review.additionalPaths.every(path)
          || (review.status === 'valid' && review.additionalPaths.length)) throw new ProductError('ASSESSMENT_FORMAT', 'Each scope review needs valid or blocked status, explanation, evidence, and additionalPaths. Additional files require blocked status and grant no authority.');
      }
    }
    const declaration = request.declarations.find(declaration => declaration.id === entry.id);
    if (!declaration || ids.has(entry.id)) throw new ProductError('ASSESSMENT_DECLARATIONS', `Unexpected or repeated contextual declaration: ${entry.id}.`);
    ids.add(entry.id);
    for (const path of entry.changedPaths) {
      const targets = declaration.allowedTargets;
      if (!permits(targets, path)) throw new ProductError('ASSESSMENT_SCOPE', `Path ${path} is outside declaration ${entry.id}'s allowed targets.`);
      if (!changed.has(path)) throw new ProductError('ASSESSMENT_PATHS', `Reported path did not change during contextual work: ${path}.`);
      reported.add(path);
    }
  }
  if (ids.size !== request.declarations.length) throw new ProductError('ASSESSMENT_DECLARATIONS', 'Submit evidence for every contextual declaration.');
  for (const path of changed) {
    const inScope = request.declarations.some(({ allowedTargets }) => permits(allowedTargets, path));
    if (!inScope) throw new ProductError('ASSESSMENT_SCOPE', `Observed contextual change is outside allowed targets: ${path}. Preserve and reconcile that work before resubmission.`);
    if (!reported.has(path)) throw new ProductError('ASSESSMENT_PATHS', `Observed contextual change was omitted: ${path}.`);
    const blockers: Parameters<typeof targetObservation>[2] = [];
    targetObservation(root, path, blockers);
    if (blockers.length) throw new ProductError('UNSAFE_TARGET', `Contextual path is unsafe: ${path}.`, blockers);
  }
  return input as unknown as Assessment;
}
