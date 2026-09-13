import { ProductError } from './errors.js';
import { allowedTargets } from './execution.js';
import type { ResolvedProfile } from './model.js';
import { observeScope } from './scope-observation.js';

type Scope = Record<string, { paths: string[]; directories: string[] }>;
export function concreteScope(resolved: ResolvedProfile): Scope {
  return Object.fromEntries(resolved.declarations.map(declaration => [declaration.id, allowedTargets(declaration)]));
}
export function contextualScope(resolved: ResolvedProfile): Scope {
  return concreteScope({ ...resolved, declarations: resolved.declarations.filter(declaration => 'guidance' in declaration) });
}
export function permits(targets: Scope[string], path: string) {
  return targets.paths.includes(path) || targets.directories.some(directory => path === directory || path.startsWith(directory + '/'));
}
export function observeWork(root: string, scope: Scope) {
  const named = Object.values(scope).flatMap(targets => targets.paths);
  const directories = Object.values(scope).flatMap(targets => targets.directories);
  function capture() {
    const { files, targets, boundaries, settings, ignores } = observeScope(root, named, { execution: true, directories });
    return { files: { ...files, ...targets }, boundaries, settings, ignores };
  }
  const first = capture();
  if (JSON.stringify(first) !== JSON.stringify(capture())) throw new ProductError('OBSERVATION_UNSTABLE', 'Project observation changed while recording adoption work. Preserve the work and retry after reconciliation.');
  return first;
}
export type WorkObservation = ReturnType<typeof observeWork>;
export function observedChanges(before: WorkObservation, after: WorkObservation) {
  const changed: string[] = [];
  for (const path of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
    const previous = before.files[path] ?? { type: 'missing' };
    const current = after.files[path] ?? { type: 'missing' };
    if (JSON.stringify(previous) !== JSON.stringify(current)) changed.push(path);
  }
  // Creating/removing an ancestor directory is accounted for by its file paths.
  // Changing an existing ancestor's mode is separate observed work.
  for (const [path, previous] of Object.entries(before.boundaries)) {
    const current = after.boundaries[path];
    if (previous.type === 'directory' && current?.type === 'directory' && previous.mode !== current.mode) changed.push(path);
  }
  for (const key of new Set([...Object.keys(before.ignores), ...Object.keys(after.ignores)])) {
    if (key === 'global' || key === 'info') {
      if (JSON.stringify(before.ignores[key]) !== JSON.stringify(after.ignores[key])) changed.push(`@ignore/${key}`);
    } else if (JSON.stringify(before.ignores[key]?.state ?? { type: 'missing' }) !== JSON.stringify(after.ignores[key]?.state ?? { type: 'missing' })) changed.push(key);
  }
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) changed.push('@git/observation-settings');
  return [...new Set(changed)].sort();
}
export interface WorkInterval {
  phase: 'fixes' | 'checks' | 'agent'; scope: Scope; before: WorkObservation;
  operation?: { declaration: string; phase: 'fixes' | 'checks'; id: string };
  after?: WorkObservation; changedPaths?: string[]; violations?: string[]; interrupted?: boolean;
}
export function finishInterval(interval: WorkInterval, after: WorkObservation) {
  interval.after = after;
  interval.changedPaths = observedChanges(interval.before, after);
  interval.violations = interval.changedPaths.filter(path => interval.phase === 'checks'
    || !Object.values(interval.scope).some(targets => permits(targets, path)));
}
export function requireValidIntervals(intervals: WorkInterval[]) {
  const invalid = intervals.find(interval => interval.violations?.length);
  if (!invalid) return;
  const operation = invalid.operation;
  const code = invalid.phase === 'agent' ? 'ASSESSMENT_SCOPE' : invalid.phase === 'checks' ? 'CHECK_MUTATION' : 'OPERATION_SCOPE';
  throw new ProductError(code, `${operation ? `Operation ${operation.declaration}/${operation.id}` : 'Agent work'} changed paths outside its authorized ${invalid.phase} scope: ${invalid.violations!.join(', ')}. Work and interval evidence are preserved; abandon and reconcile before a new adoption.`);
}

// Recovery closes an interrupted operation under its original authority. Work
// after a recorded operation belongs to a separate agent interval, never replay.
export function observeContinuation(root: string, intervals: WorkInterval[], resolved: ResolvedProfile, interrupted = false) {
  const last = intervals.at(-1);
  if (!last) return;
  const after = observeWork(root, concreteScope(resolved));
  const interval: WorkInterval = last.after ? { phase: 'agent', scope: contextualScope(resolved), before: last.after } : last;
  if (last.after) intervals.push(interval);
  finishInterval(interval, after);
  if (interrupted && interval.operation) interval.interrupted = true;
}
