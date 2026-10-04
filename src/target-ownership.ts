import type { Baseline } from './adoption-files.js';
import { matchesInventory, type Blocker, type Observation } from './observation.js';
import { linkedSkillTarget } from './targets.js';

// Target ownership: the product's standing over each installation target. From
// a target's one current observation, its installed baseline when one exists,
// its candidate content when one exists, and whether that content is tracked,
// it decides the action a run would take on the target, whether that action
// discards edits, and the ownership blockers that leave it to the maintainer.
// It reads nothing itself; inspection observes each target once and is its
// only caller.
//
// One rule holds for every target kind in every run: the product may replace
// tracked content, which Git can recover, and only untracked content blocks.
// A recorded target without a candidate, such as a retired declaration's,
// leaves the selection. One that still matches its installed baseline is
// removed: its candidate is missing, so removing it is replacing it with
// nothing. An edited one is kept: it stays in place with no action, and the
// project now owns it. An edit is tracked content, since Git records it, and
// content observed as unsafe is never kept, so its safety blockers stand. A
// skill directory is judged whole, and a kept skill keeps its link. One that overlaps contextual scope, at, under, or containing
// a contextual target, stays as project content and has no action, and so
// does one at or inside an installation target the selection still installs,
// whose own action covers it. One that contains such a target is removed, even
// when edited, and the run then installs the contained target.

export type TargetKind = 'file' | 'skill' | 'system-skill' | 'skill-link';

export interface OwnedTarget {
  path: string; kind: TargetKind;
  current: Observation; candidate?: Observation;
  // The recorded file baselines at or under the target, a skill's recorded
  // inventory relative to it, and a skill link's recorded text.
  baseline?: { files: Record<string, Baseline>; inventory?: string[]; link?: string };
  // Whether observing the target raised safety blockers.
  unsafe?: boolean;
}

// A replacement discards edits
// when the target's current content is not its installed baseline; without a
// baseline, as at an initial adoption, every replacement of existing content
// does. A kept target is edited content that leaves the selection.
export interface TargetOwnership { path: string; kind: TargetKind; action?: 'match' | 'create' | 'replace'; discardsEdits: boolean; kept: boolean; blockers: Blocker[] }

// An existing target whose complete observation (inventory, bytes and modes)
// equals the candidate is matched without rewriting.
function plannedAction(current: Observation, desired: Observation) {
  return JSON.stringify(current) === JSON.stringify(desired) ? 'match' : current.type === 'missing' ? 'create' : 'replace';
}

// The observation at a path relative to a target's observation; '' is the target itself.
function entryAt(value: Observation, relative: string): Observation {
  let current = value;
  for (const name of relative ? relative.split('/') : []) {
    if (current.type !== 'directory' || !Object.hasOwn(current.entries, name)) return { type: 'missing' };
    current = current.entries[name]!;
  }
  return current;
}

// Whether the target's current content is exactly its installed baseline:
// every recorded file's bytes and mode and, for a skill, its inventory, or a
// skill link's text.
function isBaseline(path: string, current: Observation, baseline: OwnedTarget['baseline']) {
  if (!baseline) return false;
  if (baseline.link !== undefined) return current.type === 'symlink' && current.target === baseline.link;
  const filesMatch = Object.entries(baseline.files).every(([file, expected]) => {
    const actual = entryAt(current, file === path ? '' : file.slice(path.length + 1));
    return actual.type === 'file' && actual.sha256 === expected.sha256 && actual.executable === expected.executable;
  });
  return filesMatch && (baseline.inventory === undefined || matchesInventory(current, baseline.inventory));
}

// The tracked part of a target's content, which is all an edit can be:
// ignored and other untracked content is not one.
function trackedContent(at: string, value: Observation, tracked: ReadonlySet<string>): Observation {
  if (value.type !== 'directory') return value.type === 'missing' || tracked.has(at) ? value : { type: 'missing' };
  const entries = Object.fromEntries(Object.entries(value.entries).flatMap(([name, child]) => {
    const content = trackedContent(`${at}/${name}`, child, tracked);
    return content.type === 'missing' ? [] : [[name, content]];
  }));
  return Object.keys(entries).length ? { type: 'directory', entries } : { type: 'missing' };
}

function judge(target: OwnedTarget, tracked: ReadonlySet<string>): TargetOwnership {
  const { path, kind, current, candidate, baseline } = target;
  const blockers: Blocker[] = [];
  const action = candidate ? plannedAction(current, candidate) : undefined;
  // Content a run would replace must be recoverable from Git.
  function checkTracked(at: string, value: Observation) {
    if (value.type === 'directory') {
      if (Object.keys(value.entries).length === 0) blockers.push({ code: 'UNTRACKED_REPLACEMENT', path: at, message: 'An existing empty directory has no recoverable Git baseline.' });
      for (const name of Object.keys(value.entries).sort()) checkTracked(`${at}/${name}`, value.entries[name]!);
    } else if (value.type !== 'missing' && !tracked.has(at)) blockers.push({ code: 'UNTRACKED_REPLACEMENT', path: at, message: 'Existing replacement content is ignored or untracked. Commit or reconcile it before adoption.' });
  }
  if (candidate) checkTracked(path, current);
  return { path, kind, ...(action ? { action } : {}), discardsEdits: action === 'replace' && !isBaseline(path, current, baseline), kept: false, blockers };
}

export function judgeTargetOwnership(input: { tracked: ReadonlySet<string>; contextual: readonly string[]; targets: OwnedTarget[] }): TargetOwnership[] {
  const within = (path: string, other: string) => other === path || path.startsWith(other + '/');
  const installed = input.targets.filter(target => target.candidate).map(target => target.path);
  const covered = (path: string) => input.contextual.some(other => within(path, other) || within(other, path)) || installed.some(other => within(path, other));
  // Recorded targets that leave the selection. One whose safe, tracked
  // content is not its installed baseline is kept, unless it contains a
  // target the selection still installs, and a kept skill keeps its link.
  const leaving = new Set(input.targets.filter(target => !target.candidate && target.baseline && !covered(target.path)));
  const trackedPart = (target: OwnedTarget) => target.unsafe ? { type: 'missing' as const } : trackedContent(target.path, target.current, input.tracked);
  const containsInstalled = (path: string) => installed.some(other => within(other, path));
  const edited = new Set([...leaving].filter(target => trackedPart(target).type !== 'missing' && !containsInstalled(target.path)
    && !isBaseline(target.path, trackedPart(target), target.baseline)).map(({ path }) => path));
  // A link that follows its kept skill needs only to be there and safe.
  const keeps = (target: OwnedTarget) => edited.has(target.path)
    || (target.kind === 'skill-link' && edited.has(linkedSkillTarget(target.path)!) && !target.unsafe && target.current.type !== 'missing');
  return input.targets.map(target => !leaving.has(target) ? judge(target, input.tracked)
    : keeps(target) ? { ...judge(target, input.tracked), kept: true }
    : judge({ ...target, candidate: { type: 'missing' } }, input.tracked));
}
