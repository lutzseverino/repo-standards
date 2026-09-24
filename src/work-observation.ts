import { ProductError } from './errors.js';
import type { Scope } from './scope.js';
import { observeScope } from './scope-observation.js';

// A work observation is the project state one command observed, and what
// changed between two of them. Intervals, their authority and their evidence
// belong to the work-evidence journal.
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
export function changedBoundaries(before: WorkObservation, after: WorkObservation) {
  return [...new Set([...Object.keys(before.boundaries), ...Object.keys(after.boundaries)])]
    .filter(path => JSON.stringify(before.boundaries[path] ?? { type: 'missing' }) !== JSON.stringify(after.boundaries[path] ?? { type: 'missing' })).sort();
}
