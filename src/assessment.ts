import { permits } from './work-observation.js';
import { ProductError } from './errors.js';
import { formats } from './formats.js';
import { targetObservation } from './observation.js';

export interface ScopeConfirmation { inspection: string; afterFixes: string }
interface ScopeReview { status: 'valid' | 'blocked'; explanation: string; evidence: string[]; additionalPaths: string[] }
// An agent submits only its judgment of each declaration. The accepted
// assessment is that judgment bound by the CLI to the active run's request and
// snapshot, with each declaration's changed paths derived from the run's work
// evidence.
export interface Assessment {
  format: typeof formats.assessment;
  scope?: ScopeConfirmation; run: string; selection: string; snapshot: string;
  declarations: { id: string; status: 'satisfied' | 'blocked'; explanation: string; changedPaths: string[]; evidence: string[]; scopeValidity?: { afterFixes: ScopeReview; current: ScopeReview } }[];
}
export interface WorkRequest {
  scope?: ScopeConfirmation;
  run: string; selection: string; snapshot: string;
  declarations: { id: string; discovery?: unknown; allowedTargets: { paths: string[]; directories: string[] } }[];
}
type Judgment = Omit<Assessment['declarations'][number], 'changedPaths'>;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text) && new Set(value).size === value.length; }
function path(value: string) { return !/^[A-Za-z]:|[\\\p{Cc}]/u.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..'); }

export function validateAssessment(root: string, run: { workRequest?: WorkRequest }, input: unknown, observation: { snapshot: string; changedPaths: string[] }): Assessment {
  const request = run.workRequest!;
  const format = formats.assessment;
  if (!object(input) || !keys(input, ['format', 'declarations']) || input.format !== format || !Array.isArray(input.declarations)) {
    throw new ProductError('ASSESSMENT_FORMAT', `Expected a ${format} submission with only format and declarations. The CLI binds it to the active run and derives changed paths.`);
  }
  if (request.snapshot !== observation.snapshot) throw new ProductError('STALE_ASSESSMENT', 'Project content changed since the current work request. Refresh it with resume, reassess, and submit again.');
  const judgments = new Map<string, Judgment>();
  for (const entry of input.declarations) {
    const discovered = object(entry) && request.declarations.some(declaration => declaration.id === entry.id && declaration.discovery !== undefined);
    if (!object(entry) || !keys(entry, ['id', 'status', 'explanation', 'evidence', ...(discovered ? ['scopeValidity'] : [])]) || !text(entry.id)
      || (entry.status !== 'satisfied' && entry.status !== 'blocked') || !text(entry.explanation) || !strings(entry.evidence) || entry.evidence.length === 0) {
      throw new ProductError('ASSESSMENT_FORMAT', 'Each declaration needs only an ID, satisfied or blocked status, explanation, and nonempty supporting evidence, plus scopeValidity for a discovery declaration. The CLI derives changed paths.');
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
    if (!request.declarations.some(declaration => declaration.id === entry.id) || judgments.has(entry.id)) throw new ProductError('ASSESSMENT_DECLARATIONS', `Unexpected or repeated contextual declaration: ${entry.id}.`);
    judgments.set(entry.id, entry as unknown as Judgment);
  }
  const missing = request.declarations.filter(({ id }) => !judgments.has(id)).map(({ id }) => id);
  if (missing.length) throw new ProductError('ASSESSMENT_DECLARATIONS', `Submit evidence for every contextual declaration. Missing: ${missing.join(', ')}.`);
  const changed = [...new Set(observation.changedPaths)].sort();
  for (const path of changed) {
    if (!request.declarations.some(({ allowedTargets }) => permits(allowedTargets, path))) throw new ProductError('ASSESSMENT_SCOPE', `Observed contextual change is outside allowed targets: ${path}. Preserve and reconcile that work before resubmission.`);
    const blockers: Parameters<typeof targetObservation>[2] = [];
    targetObservation(root, path, blockers);
    if (blockers.length) throw new ProductError('UNSAFE_TARGET', `Contextual path is unsafe: ${path}.`, blockers);
  }
  return { format, ...(request.scope ? { scope: { inspection: request.scope.inspection, afterFixes: request.scope.afterFixes } } : {}),
    run: request.run, selection: request.selection, snapshot: request.snapshot,
    // A changed path is attributed to every declaration whose allowed targets permit it.
    declarations: request.declarations.map(({ id, allowedTargets }) => {
      const { status, explanation, evidence, scopeValidity } = judgments.get(id)!;
      return { id, status, explanation, changedPaths: changed.filter(path => permits(allowedTargets, path)), evidence, ...(scopeValidity ? { scopeValidity } : {}) };
    }) };
}
