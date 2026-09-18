import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inc } from 'semver';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { assertCompactScopeEvidence, assertCompactWorkEvidence, committedScopeHistory, committedState, growCommittedState, legacyScopeHistory, rewriteRetainedInput } from './committed-evidence.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

const source = stringify({
  format: 'repo-standards/v2',
  name: 'growing-projects',
  description: 'Documentation for maintained projects',
  requires: { 'repo-standards': '>=1 <2' },
  defaults: { declarations: {
    docs: { kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md' },
    instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
  } },
  profiles: { work: { description: 'Work', declarations: {} } },
});

async function fixture(t: TestContext, versions?: string[]) {
  const registry = await registryFixture(cli.root, versions);
  const remote = remoteFixture(source, {
    'guidance.md': 'Keep every maintained project README useful.',
    'discovery.md': 'Use project ownership and manifests; explain excluded former projects.',
    'agents.md': 'Pinned instructions\n',
  });
  const project = sourceFixture('', { 'apps/old/README.md': '# Old project\n' });
  commit(project.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => {
    const result = cli.run(args, project.root, env);
    return { result, report: JSON.parse(result.stdout) };
  };
  const scopeFile = join(remote.support.root, 'scope.json');
  function proposal(request: any, included: string | string[], excluded?: string) {
    const includedPaths = Array.isArray(included) ? included : [included];
    const evidence = [...includedPaths, excluded].filter(Boolean).map(path =>
      request.discovery.evidence.find((entry: { kind: string; path: string }) => entry.kind === 'file' && entry.path === path));
    writeFileSync(scopeFile, JSON.stringify({
      format: 'repo-standards/scope/v1',
      request: request.discovery.identity,
      declarations: [{
        id: 'docs',
        paths: includedPaths,
        coverage: excluded ? 'The new project is maintained; the former project no longer meets the retained criteria.' : 'The old project is the only maintained project.',
        evidence,
        candidates: [
          ...includedPaths.map((path, index) => ({ path, decision: 'include', reason: 'This is a maintained project README.', evidence: [evidence[index]] })),
          ...(excluded ? [{ path: excluded, decision: 'exclude', reason: 'This project is no longer maintained, so its content remains project-owned.', evidence: [evidence.at(-1)] }] : []),
        ],
        unresolved: [],
      }],
    }));
  }
  function complete(started: any, runner = run) {
    const request = started.workRequest;
    const review = { status: 'valid', explanation: 'The confirmed projects still match the discovery criteria.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
    const assessmentFile = join(remote.support.root, 'assessment.json');
    writeFileSync(assessmentFile, JSON.stringify({
      format: 'repo-standards/assessment/v2',
      run: request.run,
      selection: request.selection,
      snapshot: request.snapshot,
      scope: { inspection: request.scope.inspection, afterFixes: request.scope.afterFixes },
      declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The existing README already satisfies the guidance.', changedPaths: [], evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }],
    }));
    return runner(['resume', '--assessment', assessmentFile, '--json']);
  }
  return { remote, project, env, run, scopeFile, proposal, complete };
}

test('same-pin v2 re-adoption recomputes retained discovery and reports scope changes without deleting former content', async t => {
  const f = await fixture(t);
  mkdirSync(join(f.project.root, 'apps/amended'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/amended/README.md'), '# Amended project\n');
  commit(f.project.root);
  const firstRequest = f.run(inspectionArgs).report;
  f.proposal(firstRequest, 'apps/old/README.md');
  const firstInspection = f.run([...inspectionArgs, '--scope', f.scopeFile]).report;
  const firstStartResult = f.run(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]);
  assert.equal(firstStartResult.result.status, 1, firstStartResult.result.stdout + firstStartResult.result.stderr);
  const firstStart = firstStartResult.report;
  assert.equal(firstStart.phase, 'contextual', firstStartResult.result.stdout);
  const amendmentRequest = f.run(['inspect', '--amend-scope', '--json']).report;
  f.proposal(amendmentRequest, ['apps/old/README.md', 'apps/amended/README.md']);
  const amendment = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report;
  const amended = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', amendment.identity, '--json']);
  assert.equal(amended.result.status, 1, amended.result.stdout + amended.result.stderr);
  const reconfirmRequest = f.run(['inspect', '--amend-scope', '--json']).report;
  f.proposal(reconfirmRequest, ['apps/old/README.md', 'apps/amended/README.md']);
  const reconfirmation = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report;
  const reconfirmed = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', reconfirmation.identity, '--json']);
  assert.equal(reconfirmed.result.status, 1, reconfirmed.result.stdout + reconfirmed.result.stderr);
  const firstComplete = f.complete(reconfirmed.report);
  assert.equal(firstComplete.result.status, 0);
  const firstState = JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8'));
  commit(f.project.root);

  writeFileSync(join(f.project.root, 'AGENTS.md'), 'Drifted instructions\n');
  const drifted = f.run(['inspect', '--readopt', '--json']).report;
  assert.ok(drifted.start.blockers.some((blocker: { code: string }) => blocker.code === 'DIRTY_PROJECT'));
  assert.ok(drifted.start.blockers.some((blocker: { code: string }) => blocker.code === 'INSTALLED_CONTENT_EDITED'));
  writeFileSync(join(f.project.root, 'AGENTS.md'), 'Pinned instructions\n');

  mkdirSync(join(f.project.root, 'apps/new'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/new/README.md'), '# New project\n');
  commit(f.project.root);
  for (const key of Object.keys(f.remote.responses)) delete f.remote.responses[key];
  f.remote.save();

  const ordinary = f.run(['inspect', '--json']).report;
  assert.equal(ordinary.historicalScope.inspection, firstInspection.identity);
  assert.equal(ordinary.action, undefined);
  assert.ok(ordinary.start.blockers.some((blocker: { code: string }) => blocker.code === 'NO_UPDATE'));

  const request = f.run(['inspect', '--readopt', '--json']).report;
  assert.equal(request.action, 'readopt');
  assert.notEqual(request.discovery.identity, ordinary.discovery.identity);
  f.proposal(firstRequest, 'apps/old/README.md');
  const stale = f.run(['inspect', '--readopt', '--scope', f.scopeFile, '--json']);
  assert.equal(stale.result.status, 1);
  assert.equal(stale.report.errors[0].code, 'STALE_SCOPE');
  f.proposal(request, 'apps/new/README.md', 'apps/old/README.md');
  const inspected = f.run(['inspect', '--readopt', '--scope', f.scopeFile, '--json']).report;
  assert.deepEqual(inspected.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: ['apps/amended/README.md', 'apps/old/README.md'] }]);
  assert.deepEqual(inspected.start.blockers, []);

  const started = f.run(['start', '--readopt', '--scope', f.scopeFile, '--confirm', inspected.identity, '--json']).report;
  assert.equal(started.phase, 'contextual');
  assert.equal(started.previousComplete.lastComplete.run, firstComplete.report.id);
  assert.equal(JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8')).lastComplete.run, firstComplete.report.id);
  assert.equal(f.complete(started).result.status, 0);
  assert.equal(git(f.project.root, 'show', 'HEAD:apps/old/README.md'), '# Old project');
  commit(f.project.root);
  const retainedInspection = f.run(['inspect', '--json']).report;
  assert.equal(retainedInspection.format, 'repo-standards/inspection/v3');
  const retained = retainedInspection.historicalScope;
  assert.equal(retained.format, 'repo-standards/scope-history/v3');
  assertCompactScopeEvidence(committedScopeHistory(f.project.root));
  assert.deepEqual(retained.runs.map((run: { inspection: string }) => run.inspection), [firstInspection.identity, inspected.identity]);
  const secondState = JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(secondState.format, 'repo-standards/state/v5');
  // A later completion adds only its own run's compact evidence.
  assertCompactWorkEvidence(committedState(f.project.root));
  assert.equal(secondState.history.length, 1);
  assert.deepEqual(secondState.history, [{
    lastComplete: firstState.lastComplete,
    observations: firstState.observations,
    operations: firstState.operations,
    retryHistory: firstState.retryHistory,
    checks: firstState.checks,
    assessments: firstState.assessments,
    scopeRevision: firstState.scopeRevision,
    amendments: firstState.amendments,
  }]);
  assert.deepEqual(retained.runs[0].discovery.proposal, firstInspection.discovery.proposal);
  assert.equal(retained.runs[0].scopeRevision, firstState.scopeRevision);
  assert.equal(retained.runs[0].amendments[0].confirmation, amendment.identity);
  assert.equal(retained.runs[0].amendments[1].confirmation, reconfirmation.identity);
  assert.equal(retained.runs[0].amendments[1].previousInspection, amendment.identity);
  assert.deepEqual(retained.runs[0].amendments[0].outgoingObservation, firstState.amendments[0].outgoingObservation);
  assert.deepEqual(retained.runs[0].amendments[0].assessments, firstState.amendments[0].assessments);
  const historicalExecution = f.run(['status', '--json']).report.history[0];
  assert.equal(historicalExecution.lastComplete.inspection, firstState.lastComplete.inspection);
  assert.deepEqual(historicalExecution.observations, firstState.observations);
  assert.deepEqual(historicalExecution.operations, firstState.operations);
  const emptyInstalledDirectory = join(f.project.root, '.agents/skills/adopt-standards/added-directory');
  mkdirSync(emptyInstalledDirectory);
  const inventoryDrift = f.run(['inspect', '--readopt', '--json']).report;
  assert.ok(inventoryDrift.start.blockers.some((blocker: { code: string }) => blocker.code === 'INSTALLED_CONTENT_EDITED'));
  rmSync(emptyInstalledDirectory, { recursive: true });

  const checkout = join(f.remote.support.root, 'readopt-checkout');
  git(f.project.root, 'clone', '--quiet', f.project.root, checkout);
  const runCheckout = (args: string[]) => {
    const result = cli.run(args, checkout, f.env);
    return { result, report: JSON.parse(result.stdout) };
  };
  const checkoutRetainedInspection = runCheckout(['inspect', '--json']).report;
  assert.equal(checkoutRetainedInspection.format, 'repo-standards/inspection/v3');
  const checkoutRetained = checkoutRetainedInspection.historicalScope;
  assert.deepEqual(checkoutRetained.runs[0], retained.runs[0]);
  assert.deepEqual(runCheckout(['status', '--json']).report.history[0], historicalExecution);
  const checkoutRequest = runCheckout(['inspect', '--readopt', '--json']).report;
  f.proposal(checkoutRequest, 'apps/new/README.md', 'apps/old/README.md');
  const checkoutInspection = runCheckout(['inspect', '--readopt', '--scope', f.scopeFile, '--json']).report;
  assert.deepEqual(checkoutInspection.start.blockers, []);
  const checkoutStart = runCheckout(['start', '--readopt', '--scope', f.scopeFile, '--confirm', checkoutInspection.identity, '--json']);
  assert.equal(checkoutStart.result.status, 1, checkoutStart.result.stdout + checkoutStart.result.stderr);
  assert.equal(f.complete(checkoutStart.report, runCheckout).result.status, 0);
  const checkoutState = JSON.parse(readFileSync(join(checkout, '.repo-standards/state.json'), 'utf8'));
  assert.equal(checkoutState.history.length, 2);
  assert.deepEqual(checkoutState.history[0], secondState.history[0]);
});

test('a committed scope history v2 projects the same historical scope and is compacted by the next complete adoption', async t => {
  const f = await fixture(t);
  mkdirSync(join(f.project.root, 'apps/amended'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/amended/README.md'), '# Amended project\n');
  commit(f.project.root);
  const firstRequest = f.run(inspectionArgs).report;
  f.proposal(firstRequest, 'apps/old/README.md');
  const firstInspection = f.run([...inspectionArgs, '--scope', f.scopeFile]).report;
  const firstStart = f.run(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]);
  assert.equal(firstStart.report.phase, 'contextual', firstStart.result.stdout);
  const amendmentRequest = f.run(['inspect', '--amend-scope', '--json']).report;
  f.proposal(amendmentRequest, ['apps/old/README.md', 'apps/amended/README.md']);
  const amendment = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report;
  const amended = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', amendment.identity, '--json']);
  assert.equal(f.complete(amended.report).result.status, 0);
  commit(f.project.root);

  // The completion stores the run once, as the observation without its derived
  // evidence and the named observation as its delta.
  const compacted = committedScopeHistory(f.project.root);
  assertCompactScopeEvidence(compacted);
  assert.deepEqual(compacted.runs.map(run => run.inspection), [firstInspection.identity]);
  const stored = compacted.runs[0]!.discovery!;
  assert.deepEqual(Object.keys(stored.named!), ['targets']);
  assert.deepEqual(Object.keys(stored.named!.targets!), ['apps/old/README.md']);
  assert.deepEqual(stored.proposal, firstInspection.discovery.proposal);
  const committedSize = readFileSync(join(f.project.root, '.repo-standards/inputs/scope-history.json'), 'utf8').length;

  // A project adopted before compaction retains every observation in full.
  const legacyRun = { inspection: firstInspection.identity, resolved: firstInspection.resolved,
    sourceResolved: firstInspection.sourceResolved, discovery: firstInspection.discovery };
  const projection = f.run(['inspect', '--json']).report.historicalScope;
  assert.equal(projection.format, 'repo-standards/scope-history/v3');
  assert.equal(projection.scopeRevision, 1);
  assert.equal(projection.amendments[0].confirmation, amendment.identity);
  rewriteRetainedInput(f.project.root, '.repo-standards/inputs/scope-history.json', legacyScopeHistory([legacyRun]));
  commit(f.project.root);
  assert.ok(committedSize < readFileSync(join(f.project.root, '.repo-standards/inputs/scope-history.json'), 'utf8').length);
  const legacyProjection = f.run(['inspect', '--json']).report.historicalScope;
  assert.equal(legacyProjection.format, 'repo-standards/scope-history/v2');
  assert.deepEqual({ ...legacyProjection, format: projection.format }, projection);

  // The next complete adoption rewrites the file, carrying the earlier run
  // forward exactly once and in the form a completion writes directly.
  const readopt = f.run(['inspect', '--readopt', '--json']).report;
  f.proposal(readopt, ['apps/old/README.md', 'apps/amended/README.md']);
  const inspected = f.run(['inspect', '--readopt', '--scope', f.scopeFile, '--json']).report;
  assert.deepEqual(inspected.start.blockers, []);
  const started = f.run(['start', '--readopt', '--scope', f.scopeFile, '--confirm', inspected.identity, '--json']).report;
  assert.equal(f.complete(started).result.status, 0);
  const rewritten = committedScopeHistory(f.project.root);
  assertCompactScopeEvidence(rewritten);
  assert.deepEqual(rewritten.runs.map(run => run.inspection), [firstInspection.identity, inspected.identity]);
  assert.deepEqual(rewritten.runs[0], compacted.runs[0]);
  commit(f.project.root);
  const laterProjection = f.run(['inspect', '--json']).report.historicalScope;
  assert.deepEqual(laterProjection.runs[0], projection.runs[0]);
  assert.equal(laterProjection.runs[0].scopeRevision, 1);
  assert.equal(laterProjection.scopeRevision, undefined);

  // The committed guarantee is enforced on read, not only when writing.
  rewriteRetainedInput(f.project.root, '.repo-standards/inputs/scope-history.json', { ...rewritten, ...rewritten.runs[0] });
  commit(f.project.root);
  assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
});

test('compatible standards updates preserve v2 evidence through discovery retirement and source-format changes', async t => {
  const f = await fixture(t);
  const firstRequest = f.run(inspectionArgs).report;
  f.proposal(firstRequest, 'apps/old/README.md');
  const firstInspection = f.run([...inspectionArgs, '--scope', f.scopeFile]).report;
  const firstStart = f.run(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]).report;
  assert.equal(f.complete(firstStart).result.status, 0);
  commit(f.project.root);

  mkdirSync(join(f.project.root, 'apps/new'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/new/README.md'), '# New project\n');
  commit(f.project.root);
  f.remote.addVersion('v1.1.0', source, { 'guidance.md': 'Keep every maintained project README useful after this standards update.' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const request = f.run(updateArgs).report;
  assert.equal(request.update, 'standards');
  assert.ok(request.start.blockers.some((blocker: { code: string }) => blocker.code === 'DISCOVERY_REQUIRED'));
  f.proposal(request, 'apps/new/README.md', 'apps/old/README.md');
  const inspected = f.run([...updateArgs, '--scope', f.scopeFile]).report;
  assert.deepEqual(inspected.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: ['apps/old/README.md'] }]);
  assert.deepEqual(inspected.start.blockers, []);

  const started = f.run(['start', ...updateArgs.slice(1), '--scope', f.scopeFile, '--confirm', inspected.identity]).report;
  assert.equal(f.complete(started).result.status, 0);
  assert.equal(readFileSync(join(f.project.root, 'apps/old/README.md'), 'utf8'), '# Old project\n');
  assert.equal(f.run(['status', '--json']).report.selection.standards.version, 'v1.1.0');
  commit(f.project.root);

  const withoutDiscovery = stringify({
    format: 'repo-standards/v1', name: 'growing-projects', description: 'Documentation for maintained projects',
    requires: { 'repo-standards': '>=1 <2' }, defaults: { declarations: {
      instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
    } }, profiles: { work: { description: 'Work', declarations: {} } },
  });
  f.remote.addVersion('v1.2.0', withoutDiscovery);
  const retirementArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.2.0' : argument);
  const retirement = f.run(retirementArgs).report;
  assert.deepEqual(retirement.scopeChanges, [{ id: 'docs', additions: [], removals: ['apps/new/README.md'] }]);
  const retired = f.run(['start', ...retirementArgs.slice(1), '--confirm', retirement.identity]);
  assert.equal(retired.result.status, 0, retired.result.stdout + retired.result.stderr);
  commit(f.project.root);
  const retiredState = JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(retiredState.format, 'repo-standards/state/v5');
  assert.equal('observations' in retiredState, false);
  assert.equal(retiredState.history.length, 2);
  const retiredStatus = f.run(['status', '--json']).report;
  assert.equal(retiredStatus.format, 'repo-standards/status/v5');
  assert.equal(retiredStatus.history.length, 2);
  const noDiscoveryHistory = f.run(['inspect', '--json']).report.historicalScope;
  assert.equal(noDiscoveryHistory.runs.at(-1).discovery, undefined);

  f.remote.addVersion('v1.3.0', source);
  const reintroducedArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.3.0' : argument);
  const reintroducedRequest = f.run(reintroducedArgs).report;
  f.proposal(reintroducedRequest, 'apps/new/README.md');
  const reintroduced = f.run([...reintroducedArgs, '--scope', f.scopeFile]).report;
  assert.deepEqual(reintroduced.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: [] }]);
  const reintroducedRun = f.run(['start', ...reintroducedArgs.slice(1), '--scope', f.scopeFile, '--confirm', reintroduced.identity]).report;
  assert.equal(f.complete(reintroducedRun).result.status, 0);
  const reintroducedState = JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(reintroducedState.format, 'repo-standards/state/v5');
  assert.equal(reintroducedState.history.length, 2);
});

test('a compatible CLI update uses retained v2 guidance and fresh scope without the original source', async t => {
  const candidateVersion = inc(cli.version, 'minor')!;
  const f = await fixture(t, [cli.version, candidateVersion]);
  const candidate = sourceFixture('');
  t.after(() => candidate.close());
  const firstRequest = f.run(inspectionArgs).report;
  f.proposal(firstRequest, 'apps/old/README.md');
  const firstInspection = f.run([...inspectionArgs, '--scope', f.scopeFile]).report;
  const firstStart = f.run(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]).report;
  assert.equal(f.complete(firstStart).result.status, 0);
  commit(f.project.root);

  mkdirSync(join(f.project.root, 'apps/new'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/new/README.md'), '# New project\n');
  commit(f.project.root);
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`],
    { cwd: candidate.root, env: f.env, stdio: 'pipe' });
  for (const key of Object.keys(f.remote.responses)) delete f.remote.responses[key];
  f.remote.save();
  const binary = join(candidate.root, 'node_modules/.bin/repo-standards');
  const runCandidate = (args: string[]) => {
    const result = spawnSync(binary, args, { cwd: f.project.root, env: f.env, encoding: 'utf8' });
    return { result, report: JSON.parse(result.stdout) };
  };

  const request = runCandidate(['inspect', '--json']).report;
  assert.equal(request.update, 'cli');
  assert.equal(request.selection.cli.version, candidateVersion);
  assert.ok(request.start.blockers.some((blocker: { code: string }) => blocker.code === 'DISCOVERY_REQUIRED'));
  f.proposal(request, 'apps/new/README.md', 'apps/old/README.md');
  const inspected = runCandidate(['inspect', '--scope', f.scopeFile, '--json']).report;
  assert.deepEqual(inspected.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: ['apps/old/README.md'] }]);
  assert.deepEqual(inspected.start.blockers, []);

  const started = runCandidate(['start', '--scope', f.scopeFile, '--confirm', inspected.identity, '--json']).report;
  assert.equal(started.phase, 'contextual');
  assert.equal(f.complete(started, runCandidate).result.status, 0);
  assert.equal(readFileSync(join(f.project.root, 'apps/old/README.md'), 'utf8'), '# Old project\n');
  const status = runCandidate(['status', '--json']).report;
  assert.equal(status.selection.cli.version, candidateVersion);
  assert.equal(status.selection.standards.version, 'v1.0.0');
  assert.equal(existsSync(join(f.project.root, '.agents/skills/author-standards')), false);
});

test('durable product state over the per-file limit leaves discovery inspectable and separately verified', async t => {
  const f = await fixture(t);
  const firstRequest = f.run(inspectionArgs).report;
  f.proposal(firstRequest, 'apps/old/README.md');
  const firstInspection = f.run([...inspectionArgs, '--scope', f.scopeFile]).report;
  const started = f.run(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]).report;
  assert.equal(f.complete(started).result.status, 0);
  commit(f.project.root);

  // An established adopter accumulates durable state until one committed file
  // passes the per-file observation limit.
  assert.ok(growCommittedState(f.project.root, 8 * 1024 * 1024 + 1) > 8 * 1024 * 1024);
  commit(f.project.root);

  // Every inspection route that takes a discovery observation: retained
  // inspection without source flags, re-adoption, source-flag inspection, and
  // a standards update.
  f.remote.addVersion('v1.1.0', source, { 'guidance.md': 'Keep every maintained project README useful after this standards update.' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const reserved = (path: string) => path === '.repo-standards' || path.startsWith('.repo-standards/');
  for (const args of [['inspect', '--json'], ['inspect', '--readopt', '--json'], inspectionArgs, updateArgs]) {
    const inspection = f.run(args);
    assert.equal(inspection.result.status, 0, inspection.result.stdout + inspection.result.stderr);
    assert.equal(inspection.report.format, 'repo-standards/inspection/v2');
    const { evidence, observation } = inspection.report.discovery;
    assert.ok(evidence.some((entry: { path: string }) => entry.path === 'apps/old/README.md'));
    assert.deepEqual(evidence.filter((entry: { path: string }) => reserved(entry.path)), []);
    for (const record of [observation.files, observation.inventories, observation.boundaries]) {
      assert.deepEqual(Object.keys(record).filter(reserved), []);
    }
    assert.deepEqual(Object.values(observation.inventories as Record<string, string[]>).flat().filter(reserved), []);
    const productState = inspection.report.project.productState;
    assert.equal(productState.type, 'directory');
    assert.equal(productState.entries['state.json'].type, 'file');
    assert.ok(Object.keys(productState.entries).includes('inputs'));
    if (args === updateArgs) assert.equal(inspection.report.update, 'standards');
  }

  // Product state stays verified separately: its inventory still rejects
  // additions, and an oversized project-owned file still fails closed.
  const unexpected = join(f.project.root, '.repo-standards/unexpected.json');
  writeFileSync(unexpected, '{}\n');
  const drifted = f.run(['inspect', '--json']).report;
  assert.ok(drifted.start.blockers.some((blocker: { code: string; path: string }) =>
    blocker.code === 'STATE_INTEGRITY' && blocker.path === '.repo-standards'), JSON.stringify(drifted.start.blockers));
  rmSync(unexpected);
  const oversizedProjectFile = join(f.project.root, 'apps/old/large.bin');
  writeFileSync(oversizedProjectFile, Buffer.alloc(8 * 1024 * 1024 + 1));
  const limited = f.run(['inspect', '--json']);
  assert.equal(limited.result.status, 1, limited.result.stdout);
  assert.equal(limited.report.errors[0].code, 'OBSERVATION_LIMIT');
  rmSync(oversizedProjectFile);
});
