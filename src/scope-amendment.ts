import { hash } from './acquisition.js';
import { dirname } from 'node:path';
import type { Installation, Run } from './adoption-run.js';
import { ProductError } from './errors.js';
import { git, hiddenIndexPaths, type Blocker } from './inspection.js';
import { concreteScope, validateScope } from './scope.js';
import { observeScope } from './scope-observation.js';
import { finishInterval, observeContinuation, requireValidIntervals } from './work-observation.js';

const identity = (value: unknown) => `sha256:${hash(JSON.stringify(value))}`;

export function previewScopeAmendment(root: string, run: Run, installation: Installation, scope?: string) {
  const previous = installation.report;
  const sourceResolved = previous.sourceResolved!;
  const existingScope = concreteScope(previous.resolved);
  // Recompute validation using each recorded interval's outgoing authority,
  // including current agent work, before considering the proposed expansion.
  const validateWork = () => {
    const observations = structuredClone(run.observations!);
    for (const interval of observations) if (interval.after) finishInterval(interval, interval.after);
    observeContinuation(root, observations, previous.resolved);
    requireValidIntervals(observations);
    return observations;
  };
  const observations = validateWork();

  // Installed output has independent integrity evidence. Exclude its files
  // and whole skill inventories from discovery, including directory evidence.
  // Work-interval observations above still account for all original authority.
  const excluded = [...previous.exact.map(entry => entry.target), ...Object.keys(installation.skills)];
  const createdAncestors = new Set<string>();
  for (const path of excluded) for (let parent = dirname(path); parent !== '.'; parent = dirname(parent)) {
    if (!Object.hasOwn(previous.discovery!.observation.inventories, parent)) createdAncestors.add(parent);
  }
  const observationOptions = { execution: true, excluded, excludedEmptyDirectories: [...createdAncestors] };
  const observeDiscovery = (named: string[] = []) => observeScope(root, named, observationOptions);

  const capture = () => {
    const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']);
    const head = git(root, ['rev-parse', '--verify', 'HEAD']);
    const index = git(root, ['ls-files', '--stage', '-z']);
    if (status.status !== 0 || head.status !== 0 || index.status !== 0) throw new ProductError('OBSERVATION_READ', 'Cannot completely observe amendment Git state.');
    return { root, head: head.stdout.trim(), index: index.stdout, hidden: hiddenIndexPaths(root), status: status.stdout,
      observation: observeDiscovery() };
  };
  const project = capture();
  const request = identity({ action: 'amend-scope', run, installation: run.continuation, revision: run.inspection, existingScope, observations, project });
  const validated = validateScope({ phase: 'amendment', root, sourceResolved, request, currentResolved: previous.resolved, existingScope,
    observationOptions, ...(scope ? { proposalPath: scope } : {}) });
  const { proposal, resolved, proposedScope, additions, named, namedObservation, absence } = validated;
  const blockers: Blocker[] = validated.blockers;
  const report = {
    format: 'repo-standards/inspection/v3', action: 'amend-scope', selection: previous.selection,
    source: previous.source, sourceResolved, resolved,
    guidance: previous.guidance.map(guidance => ({ ...guidance, targets: [...(proposedScope ?? existingScope)[guidance.id]!.paths, ...(proposedScope ?? existingScope)[guidance.id]!.directories] })),
    operations: previous.operations,
    discovery: { identity: request, declarations: previous.discovery!.declarations, evidence: project.observation.evidence,
      observation: project.observation, ...(proposal ? { proposal, absence, namedObservation } : {}) },
    project,
    amendment: { eligible: blockers.length === 0, blockers, run: run.id, revision: run.inspection,
      existingScope, ...(proposedScope ? { proposedScope, additions: additions! } : {}),
      observations, operations: run.operations, assessments: run.assessments,
      nextAction: blockers.length ? 'Resolve amendment blockers and inspect the complete proposal again. No new paths are authorized.'
        : 'Review the complete amendment preview and obtain explicit maintainer confirmation of its identity. Then use resume --amend-scope with the same --scope proposal and --confirm identity. Do not write to added paths before acceptance succeeds.' },
    start: { eligible: false, blockers: [{ code: 'AMENDMENT_ONLY', message: 'This identity previews continuation of the active run and cannot start a new adoption or accept scope.' }] },
  };
  if (JSON.stringify(project) !== JSON.stringify(capture())
    || (namedObservation && JSON.stringify(namedObservation) !== JSON.stringify(observeDiscovery(named)))
    || JSON.stringify(observations) !== JSON.stringify(validateWork())) {
    throw new ProductError('OBSERVATION_UNSTABLE', 'Project evidence changed during amendment inspection. Inspect again.');
  }
  return { ...report, identity: identity({ report, request }) };
}
