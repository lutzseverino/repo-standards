import { hash } from './acquisition.js';
import type { Installation, Run } from './adoption-run.js';
import { ProductError } from './errors.js';
import { git, hiddenIndexPaths, type Blocker } from './inspection.js';
import { materializeScope, readScope, validateScopeEvidence } from './scope.js';
import { observeScope } from './scope-observation.js';
import { concreteScope, finishInterval, observeContinuation, requireValidIntervals } from './work-observation.js';

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

  const capture = () => {
    const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']);
    const head = git(root, ['rev-parse', '--verify', 'HEAD']);
    const index = git(root, ['ls-files', '--stage', '-z']);
    if (status.status !== 0 || head.status !== 0 || index.status !== 0) throw new ProductError('OBSERVATION_READ', 'Cannot completely observe amendment Git state.');
    return { root, head: head.stdout.trim(), index: index.stdout, hidden: hiddenIndexPaths(root), status: status.stdout,
      observation: observeScope(root, [], { execution: true }) };
  };
  const project = capture();
  const request = identity({ action: 'amend-scope', run, installation: run.continuation, revision: run.inspection, existingScope, observations, project });
  const proposal = scope ? readScope(scope, root) : undefined;
  if (proposal && proposal.request !== request) throw new ProductError('STALE_SCOPE', 'The amendment proposal does not match the active run and current observation. Inspect --amend-scope again and review fresh evidence.');
  const resolved = proposal ? materializeScope(root, sourceResolved, proposal) : previous.resolved;
  const proposedScope = proposal ? concreteScope(resolved) : undefined;
  if (proposedScope) for (const declaration of sourceResolved.declarations) {
    const before = existingScope[declaration.id]!;
    const after = proposedScope[declaration.id]!;
    if ('discovery' in declaration) {
      if (before.paths.some(path => !after.paths.includes(path))) throw new ProductError('SCOPE_RECONCILIATION_REQUIRED', `Cannot remove or transfer previously authorized targets from ${declaration.id}. Withdrawing a mistaken target requires reconciliation outside this active run; leave the run incomplete, preserve work, and abandon and reconcile before a new clean adoption.`);
    } else if (JSON.stringify(before) !== JSON.stringify(after)) throw new ProductError('SELECTION_SWITCH', 'Scope amendment cannot change explicit targets or the selected declarations.');
  }
  const named = proposal?.declarations.flatMap(entry => entry.paths) ?? [];
  const namedObservation = proposal ? observeScope(root, named, { execution: true }) : undefined;
  const absence = proposal ? validateScopeEvidence(proposal, namedObservation!) : [];
  const blockers: Blocker[] = [];
  if (!proposal) blockers.push({ code: 'DISCOVERY_REQUIRED', message: 'Review current evidence and submit a complete repo-standards/scope/v1 proposal with inspect --amend-scope --scope <file>, retaining every previously authorized target per declaration.' });
  if (proposal?.declarations.some(entry => entry.unresolved.length)) blockers.push({ code: 'UNRESOLVED_SCOPE', message: 'Resolve discovery questions and inspect a revised amendment proposal before confirmation.' });
  const report = {
    format: 'repo-standards/inspection/v3', action: 'amend-scope', selection: previous.selection,
    source: previous.source, sourceResolved, resolved,
    guidance: previous.guidance.map(guidance => ({ ...guidance, targets: [...(proposedScope ?? existingScope)[guidance.id]!.paths, ...(proposedScope ?? existingScope)[guidance.id]!.directories] })),
    operations: previous.operations,
    discovery: { identity: request, declarations: previous.discovery!.declarations, evidence: project.observation.evidence,
      observation: project.observation, ...(proposal ? { proposal, absence, namedObservation } : {}) },
    project,
    amendment: { eligible: blockers.length === 0, blockers, run: run.id, revision: run.inspection,
      existingScope, ...(proposedScope ? { proposedScope, additions: Object.fromEntries(sourceResolved.declarations.filter(declaration => 'discovery' in declaration)
        .map(declaration => [declaration.id, proposedScope[declaration.id]!.paths.filter(path => !existingScope[declaration.id]!.paths.includes(path))])) } : {}),
      observations, operations: run.operations, assessments: run.assessments,
      nextAction: blockers.length ? 'Resolve amendment blockers and inspect the complete proposal again. No new paths are authorized.'
        : 'Review the complete amendment preview. Confirmed amendment execution with resume --amend-scope is not yet available; preserve the incomplete run and do not write to added paths.' },
    start: { eligible: false, blockers: [{ code: 'AMENDMENT_ONLY', message: 'This identity previews continuation of the active run and cannot start a new adoption or accept scope.' }] },
  };
  if (JSON.stringify(project) !== JSON.stringify(capture())
    || (namedObservation && JSON.stringify(namedObservation) !== JSON.stringify(observeScope(root, named, { execution: true })))
    || JSON.stringify(observations) !== JSON.stringify(validateWork())) {
    throw new ProductError('OBSERVATION_UNSTABLE', 'Project evidence changed during amendment inspection. Inspect again.');
  }
  return { ...report, identity: identity({ report, request }) };
}
