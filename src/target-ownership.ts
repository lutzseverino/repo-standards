import type { Baseline } from './adoption-files.js';
import { matchesInventory, type Blocker, type Observation } from './observation.js';

// Target ownership: the product's standing over each installation target. From
// a target's one current observation, its installed baseline when one exists,
// its candidate content when one exists, whether that content is tracked, and
// whether an adoption is established, it decides the action a run would take
// on the target and the ownership blockers that leave it to the maintainer.
// It reads nothing itself; inspection observes each target once and is its
// only caller.

export type TargetKind = 'file' | 'skill' | 'system-skill';

export interface OwnedTarget {
  path: string; kind: TargetKind;
  current: Observation; candidate?: Observation;
  // The recorded file baselines at or under the target, and a skill's recorded
  // inventory relative to it.
  baseline?: { files: Record<string, Baseline>; inventory?: string[] };
}

// A target with only a baseline, such as a retired declaration's, has no action.
export interface TargetOwnership { path: string; kind: TargetKind; action?: 'match' | 'create' | 'replace'; blockers: Blocker[] }

// An existing target whose complete observation (inventory, bytes and modes)
// equals the supplied content is claimed without rewriting.
function plannedAction(current: Observation, desired: Observation) {
  return JSON.stringify(current) === JSON.stringify(desired) ? 'match' : current.type === 'missing' ? 'create' : 'replace';
}

// The observation at a path relative to a target's observation; '' is the target itself.
function observed(value: Observation, relative: string): Observation {
  let current = value;
  for (const name of relative ? relative.split('/') : []) {
    if (current.type !== 'directory' || !Object.hasOwn(current.entries, name)) return { type: 'missing' };
    current = current.entries[name]!;
  }
  return current;
}

function ownership(target: OwnedTarget, established: boolean, tracked: ReadonlySet<string>): TargetOwnership {
  const { path, kind, current, candidate, baseline } = target;
  const blockers: Blocker[] = [];
  const action = candidate ? plannedAction(current, candidate) : undefined;
  if (kind === 'skill' && action === 'replace' && baseline?.inventory === undefined) blockers.push({ code: 'SKILL_CONFLICT', path, message: 'An existing skill differs from the supplied skill and has no established installed baseline for this selection. Reconcile the unrelated skill before adoption.' });
  if (kind === 'system-skill' && action === 'replace' && !established) blockers.push({ code: 'SYSTEM_SKILL_CONFLICT', path, message: 'Existing reserved system-skill content differs from the skill packaged with this exact CLI and has no established product ownership.' });
  // Known edits to installed content block the entire update before mutation.
  if (baseline) {
    for (const file of Object.keys(baseline.files).sort()) {
      const expected = baseline.files[file]!;
      const actual = observed(current, file === path ? '' : file.slice(path.length + 1));
      if (actual.type !== 'file' || actual.sha256 !== expected.sha256 || actual.executable !== expected.executable) blockers.push({ code: 'INSTALLED_CONTENT_EDITED', path: file, message: 'Installed exact content differs from its last-complete baseline. Reconcile it before updating.' });
    }
    if (baseline.inventory && !matchesInventory(current, baseline.inventory)) blockers.push({ code: 'INSTALLED_CONTENT_EDITED', path, message: 'The installed skill inventory differs from its last-complete baseline. Reconcile added or removed resources before updating.' });
  }
  // Content a run would replace must be recoverable from Git. An established
  // adoption owns the system skill it installed.
  function checkTracked(at: string, value: Observation) {
    if (value.type === 'directory') {
      if (Object.keys(value.entries).length === 0) blockers.push({ code: 'UNTRACKED_REPLACEMENT', path: at, message: 'An existing empty directory has no recoverable Git baseline.' });
      for (const name of Object.keys(value.entries).sort()) checkTracked(`${at}/${name}`, value.entries[name]!);
    } else if (value.type !== 'missing' && !tracked.has(at)) blockers.push({ code: 'UNTRACKED_REPLACEMENT', path: at, message: 'Existing replacement content is ignored or untracked. Commit or reconcile it before adoption.' });
  }
  if (candidate && !(kind === 'system-skill' && established)) checkTracked(path, current);
  return { path, kind, ...(action ? { action } : {}), blockers };
}

export function judgeTargetOwnership(input: { established: boolean; tracked: ReadonlySet<string>; targets: OwnedTarget[] }): TargetOwnership[] {
  return input.targets.map(target => ownership(target, input.established, input.tracked));
}
