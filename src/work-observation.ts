import { ProductError } from './errors.js';
import type { ResolvedProfile } from './model.js';
import { concreteScope, type Scope } from './scope.js';
import { observeScope } from './scope-observation.js';

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
  operation?: { declaration: string; phase: 'fixes' | 'checks'; id: string }; operationIndex?: number;
  after?: WorkObservation; changedPaths?: string[]; boundaryChanges?: string[]; violations?: string[]; interrupted?: boolean;
  restoredExact?: WorkObservation['files']; restoredBoundaries?: WorkObservation['boundaries'];
}
function changedBoundaries(before: WorkObservation, after: WorkObservation) {
  return [...new Set([...Object.keys(before.boundaries), ...Object.keys(after.boundaries)])]
    .filter(path => JSON.stringify(before.boundaries[path] ?? { type: 'missing' }) !== JSON.stringify(after.boundaries[path] ?? { type: 'missing' })).sort();
}
export function finishInterval(interval: WorkInterval, after: WorkObservation) {
  interval.after = after;
  interval.changedPaths = observedChanges(interval.before, after);
  interval.boundaryChanges = changedBoundaries(interval.before, after);
  const scopes = Object.values(interval.scope);
  const fileViolations = interval.changedPaths.filter(path => interval.phase === 'checks'
    || (!interval.restoredExact?.[path] && !scopes.some(targets => permits(targets, path))));
  const boundaryViolations = interval.boundaryChanges.filter(path => {
    if (interval.phase === 'checks') return true;
    if (interval.restoredBoundaries?.[path]) return false;
    if (scopes.some(targets => permits(targets, path))) return false;
    const before = interval.before.boundaries[path];
    // Named file authority includes creating its missing parent directories,
    // but does not authorize deleting or changing existing ancestors.
    return !((!before || before.type === 'missing') && after.boundaries[path]?.type === 'directory'
      && scopes.some(targets => [...targets.paths, ...targets.directories].some(target => target.startsWith(path + '/'))));
  });
  interval.violations = [...new Set([...fileViolations, ...boundaryViolations])].sort();
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
export function observeContinuation(root: string, intervals: WorkInterval[], resolved: ResolvedProfile, recordedOperations?: number, restorable?: Scope[string]) {
  const last = intervals.at(-1);
  if (!last) return;
  const after = observeWork(root, concreteScope(resolved));
  const interval: WorkInterval = last.after ? { phase: 'agent', scope: contextualScope(resolved), before: last.after } : last;
  if (last.after) intervals.push(interval);
  if (last.after && restorable) {
    // The caller verified the immutable installation first. Only restoration
    // of those exact paths/inventories is exempt from contextual attribution.
    interval.restoredExact = Object.fromEntries(observedChanges(interval.before, after).filter(path => permits(restorable, path))
      .map(path => [path, after.files[path] ?? { type: 'missing' }]));
    interval.restoredBoundaries = Object.fromEntries(changedBoundaries(interval.before, after).flatMap(path => {
      const before = interval.before.boundaries[path] ?? { type: 'missing' };
      const current = after.boundaries[path] ?? { type: 'missing' };
      const recreatingParent = before.type === 'missing' && current.type === 'directory'
        && Object.entries(interval.restoredExact!).some(([file, state]) => state.type === 'file' && file.startsWith(path + '/'));
      const removingExtra = before.type === 'directory' && current.type === 'missing'
        && restorable.directories.some(directory => path.startsWith(directory + '/'))
        && !restorable.paths.some(file => file.startsWith(path + '/'));
      return recreatingParent || removingExtra ? [[path, current]] : [];
    }));
  }
  finishInterval(interval, after);
  if (interval.operation && recordedOperations !== undefined && interval.operationIndex === recordedOperations) interval.interrupted = true;
}
