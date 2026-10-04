import type { ScopeProposal, ErrorReport, Inspection, Run, State, Status } from './json-reports.ts';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inc } from 'semver';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { assertCompactScopeEvidence, assertCompactWorkEvidence, committedScopeEvidence, committedState, growCommittedState } from './committed-evidence.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';

const cli = installCli();
after(() => cli.close());

const source = stringify({
  format: 'repo-standards/v2',
  name: 'growing-projects',
  description: 'Documentation for maintained projects',
  requires: { 'repo-standards': '>=1' },
  defaults: { declarations: {
    docs: { kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md' },
    instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
  } },
  profiles: { work: { description: 'Work', declarations: {} } },
});

async function fixture(t: TestContext, versions?: string[]) {
  const remote = remoteFixture(source, {
    'guidance.md': 'Keep every maintained project README useful.',
    'discovery.md': 'Use project ownership and manifests; explain excluded former projects.',
    'agents.md': 'Pinned instructions\n',
  });
  const project = sourceFixture('', { 'apps/old/README.md': '# Old project\n' });
  commit(project.root);
  const registry = await registryFixture(cli.root, versions);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = <T = Run>(args: string[]) => {
    const result = cli.run(args, project.root, env);
    return { result, report: (JSON.parse(result.stdout) as T) };
  };
  const scopeFile = join(remote.support.root, 'scope.json');
  function proposal(included: string | string[], excluded?: string) {
    const includedPaths = Array.isArray(included) ? included : [included];
    writeFileSync(scopeFile, JSON.stringify({
      format: 'repo-standards/scope/v2',
      declarations: [{
        id: 'docs',
        coverage: excluded ? 'The new project is maintained; the former project no longer meets the retained criteria.' : 'The old project is the only maintained project.',
        candidates: [
          ...includedPaths.map(path => ({ path, decision: 'include', reason: 'This is a maintained project README.', evidence: [path] })),
          ...(excluded ? [{ path: excluded, decision: 'exclude', reason: 'This project is no longer maintained, so its content remains project-owned.', evidence: [excluded] }] : []),
        ],
        unresolved: [],
      }],
    }));
  }
  function complete(runner: (args: string[]) => { result: ReturnType<typeof cli.run>; report: Run | null } = run) {
    const review = { status: 'valid', explanation: 'The confirmed projects still match the discovery criteria.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
    const assessmentFile = join(remote.support.root, 'assessment.json');
    writeFileSync(assessmentFile, JSON.stringify({
      format: 'repo-standards/assessment/v3',
      declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The existing README already satisfies the guidance.', evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }],
    }));
    return runner(['resume', '--assessment', assessmentFile, '--json']);
  }
  return { remote, project, env, run, scopeFile, proposal, complete };
}

test('an unchanged v2 selection recomputes retained discovery and reports scope changes without deleting former content', async t => {
  const f = await fixture(t);
  f.proposal('apps/old/README.md');
  const firstInspection = f.run<Inspection>([...inspectionArgs, '--scope', f.scopeFile]).report;
  const firstStartResult = f.run<Run>(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]);
  assert.equal(firstStartResult.result.status, 1, firstStartResult.result.stdout + firstStartResult.result.stderr);
  const firstStart = firstStartResult.report;
  assert.equal(firstStart.phase, 'contextual', firstStartResult.result.stdout);
  assert.equal(f.run<Status>(['status', '--json']).report.scopeProposal, null);
  const firstComplete = f.complete();
  assert.equal(firstComplete.result.status, 0);
  const firstStatus = f.run<Status>(['status', '--json']).report;
  assert.equal(firstStatus.format, 'repo-standards/status/v7');
  assert.deepEqual(firstStatus.scopeProposal, firstInspection.discovery!.proposal);
  const firstState = (JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8')) as State);
  commit(f.project.root);

  writeFileSync(join(f.project.root, 'AGENTS.md'), 'Drifted instructions\n');
  const drifted = f.run<Inspection>(['inspect', '--json']).report;
  assert.ok(drifted.start.blockers.some((blocker: { code: string }) => blocker.code === 'DIRTY_PROJECT'));
  assert.ok(!drifted.start.blockers.some((blocker: { code: string }) => blocker.code === 'UNTRACKED_REPLACEMENT'));
  assert.deepEqual(drifted.discardedEdits, ['AGENTS.md']);
  writeFileSync(join(f.project.root, 'AGENTS.md'), 'Pinned instructions\n');

  mkdirSync(join(f.project.root, 'apps/new'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/new/README.md'), '# New project\n');
  commit(f.project.root);
  for (const key of Object.keys(f.remote.responses)) delete f.remote.responses[key];
  f.remote.save();

  const request = f.run<Inspection>(['inspect', '--json']).report;
  assert.equal(request.historicalScope!.inspection, firstInspection.identity);
  assert.deepEqual(request.update, []);
  assert.ok(request.start.blockers.some((blocker: { code: string }) => blocker.code === 'DISCOVERY_REQUIRED'));
  // The earlier proposal is judged against the fresh observation; the earlier
  // confirmation cannot start it.
  f.proposal('apps/old/README.md');
  const reused = f.run<Inspection>(['inspect', '--scope', f.scopeFile, '--json']).report;
  assert.notEqual(reused.identity, firstInspection.identity);
  const stale = f.run<ErrorReport>(['start', '--scope', f.scopeFile, '--confirm', firstInspection.identity, '--json']);
  assert.equal(stale.result.status, 1);
  assert.equal(stale.report.errors[0]!.code, 'STALE_INSPECTION');
  f.proposal('apps/new/README.md', 'apps/old/README.md');
  const inspected = f.run<Inspection>(['inspect', '--scope', f.scopeFile, '--json']).report;
  assert.deepEqual(inspected.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: ['apps/old/README.md'] }]);
  assert.deepEqual(inspected.start.blockers, []);

  const started = f.run<Run>(['start', '--scope', f.scopeFile, '--confirm', inspected.identity, '--json']).report;
  assert.equal(started.phase, 'contextual');
  assert.equal(started.previousComplete!.lastComplete.run, firstComplete.report!.id);
  assert.deepEqual(f.run<Status>(['status', '--json']).report.scopeProposal, firstInspection.discovery!.proposal);
  assert.equal((JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8')) as State).lastComplete.run, firstComplete.report!.id);
  assert.equal(f.complete().result.status, 0);
  assert.equal(git(f.project.root, 'show', 'HEAD:apps/old/README.md'), '# Old project');
  commit(f.project.root);
  const retainedInspection = f.run<Inspection>(['inspect', '--json']).report;
  assert.equal(retainedInspection.format, 'repo-standards/inspection/v6');
  const retained = retainedInspection.historicalScope;
  assert.equal(retained!.format, 'repo-standards/scope-history/v5');
  assertCompactScopeEvidence(committedScopeEvidence(f.project.root));
  // Retained scope evidence holds the current run and its change against the previous one.
  assert.equal(retained!.inspection, inspected.identity);
  assert.equal(Object.hasOwn(retained!, 'runs'), false);
  assert.deepEqual(retained!.discovery!.proposal, inspected.discovery!.proposal);
  assert.deepEqual(retained!.scopeChanges, inspected.scopeChanges);
  const secondState = (JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8')) as State);
  assert.equal(secondState.format, 'repo-standards/state/v7');
  // A later completion keeps only its own run's compact evidence.
  assertCompactWorkEvidence(committedState(f.project.root));
  assert.equal(secondState.lastComplete.inspection, inspected.identity);
  assert.notEqual(secondState.lastComplete.run, firstState.lastComplete.run);
  const secondStatus = f.run<Status>(['status', '--json']).report;
  assert.deepEqual(secondStatus.scopeProposal, inspected.discovery!.proposal);
  assert.equal(Object.hasOwn(secondStatus, 'history'), false);
  assert.deepEqual(secondStatus.observations, secondState.observations);
  assert.deepEqual(secondStatus.scopeChanges, inspected.scopeChanges);
  const emptyInstalledDirectory = join(f.project.root, '.agents/skills/adopt-standards/added-directory');
  mkdirSync(emptyInstalledDirectory);
  const inventoryDrift = f.run<Inspection>(['inspect', '--json']).report;
  assert.ok(inventoryDrift.start.blockers.some((blocker: { code: string; path?: string }) => blocker.code === 'UNTRACKED_REPLACEMENT' && blocker.path === '.agents/skills/adopt-standards/added-directory'));
  assert.deepEqual(inventoryDrift.discardedEdits, ['.agents/skills/adopt-standards']);
  rmSync(emptyInstalledDirectory, { recursive: true });

  const checkout = join(f.remote.support.root, 'unchanged-checkout');
  git(f.project.root, 'clone', '--quiet', f.project.root, checkout);
  const runCheckout = <T = Run>(args: string[]) => {
    const result = cli.run(args, checkout, f.env);
    return { result, report: (JSON.parse(result.stdout) as T) };
  };
  const checkoutRetainedInspection = runCheckout<Inspection>(['inspect', '--json']).report;
  assert.equal(checkoutRetainedInspection.format, 'repo-standards/inspection/v6');
  assert.deepEqual(checkoutRetainedInspection.historicalScope, retained);
  assert.deepEqual(runCheckout<Status>(['status', '--json']).report, secondStatus);
  f.proposal('apps/new/README.md', 'apps/old/README.md');
  const checkoutInspection = runCheckout<Inspection>(['inspect', '--scope', f.scopeFile, '--json']).report;
  assert.deepEqual(checkoutInspection.start.blockers, []);
  const checkoutStart = runCheckout<Run>(['start', '--scope', f.scopeFile, '--confirm', checkoutInspection.identity, '--json']);
  assert.equal(checkoutStart.result.status, 1, checkoutStart.result.stdout + checkoutStart.result.stderr);
  assert.equal(f.complete(runCheckout).result.status, 0);
  const checkoutState = (JSON.parse(readFileSync(join(checkout, '.repo-standards/state.json'), 'utf8')) as State);
  assertCompactWorkEvidence(checkoutState);
  assert.equal(checkoutState.lastComplete.inspection, checkoutInspection.identity);
  assert.equal(JSON.stringify(checkoutState).includes(secondState.lastComplete.run), false);
});

test('a completed discovery run reports its proposal even when cleanup was interrupted', async t => {
  const f = await fixture(t);
  for (const [round, args] of [inspectionArgs, ['inspect', '--json']].entries()) {
    f.proposal('apps/old/README.md');
    const proposal = (JSON.parse(readFileSync(f.scopeFile, 'utf8')) as ScopeProposal);
    proposal.declarations[0]!.coverage += ` Completion ${round + 1}.`;
    writeFileSync(f.scopeFile, JSON.stringify(proposal));
    const inspection = f.run<Inspection>([...args, '--scope', f.scopeFile]).report;
    f.run<Run>(['start', ...args.slice(1), '--scope', f.scopeFile, '--confirm', inspection.identity]);
    const env = filesystemFault(f.remote.support.root, f.env, 'complete', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/repo-standards-run.lock')) process.kill(process.pid, 'SIGKILL');
  return result;
}; syncBuiltinESMExports();`);
    const completed = f.complete(args => {
      const result = cli.run(args, f.project.root, env);
      return { result, report: result.stdout ? (JSON.parse(result.stdout) as Run) : null };
    });
    assert.equal(completed.result.signal, 'SIGKILL');
    const status = f.run<Status>(['status', '--json']).report;
    assert.equal(status.active!.outcome, 'complete');
    assert.deepEqual(status.scopeProposal, inspection.discovery!.proposal);
    assert.equal(f.run<Run>(['resume', '--retry', '--json']).result.status, 0);
    commit(f.project.root);
  }
});

test('an incomplete or abandoned standards update keeps the last complete proposal', async t => {
  const f = await fixture(t);
  f.proposal('apps/old/README.md');
  const first = f.run<Inspection>([...inspectionArgs, '--scope', f.scopeFile]).report;
  f.run<Run>(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', first.identity]);
  assert.equal(f.complete().result.status, 0);
  commit(f.project.root);
  const summary = cli.run(['status', '--summary'], f.project.root, f.env).stdout;

  f.remote.addVersion('v1.1.0', source, { 'guidance.md': 'Review documentation against the new standards.' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  f.proposal([], 'apps/old/README.md');
  const update = f.run<Inspection>([...updateArgs, '--scope', f.scopeFile]).report;
  assert.notDeepEqual(update.discovery!.proposal, first.discovery!.proposal);
  assert.deepEqual(f.run<Status>(['status', '--json']).report.scopeProposal, first.discovery!.proposal);
  assert.equal(cli.run(['status', '--summary'], f.project.root, f.env).stdout, summary);
  const started = f.run<Run>(['start', ...updateArgs.slice(1), '--scope', f.scopeFile, '--confirm', update.identity]);
  assert.equal(started.report.phase, 'contextual', started.result.stdout);
  assert.deepEqual(f.run<Status>(['status', '--json']).report.scopeProposal, first.discovery!.proposal);
  assert.equal(f.run<Run>(['abandon', '--json']).report.abandoned, true);
  const abandoned = f.run<Status>(['status', '--json']);
  assert.equal(abandoned.result.status, 0, abandoned.result.stdout);
  assert.equal(abandoned.report.stateError!.code, 'STATE_INTEGRITY');
  assert.deepEqual(abandoned.report.scopeProposal, first.discovery!.proposal);
});

test('repeated updates retain only the current run without growing, and status reports its scope change', async t => {
  const f = await fixture(t);
  mkdirSync(join(f.project.root, 'apps/new'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/new/README.md'), '# New project\n');
  commit(f.project.root);
  const statePath = join(f.project.root, '.repo-standards/state.json');
  const scopePath = join(f.project.root, '.repo-standards/inputs/scope-history.json');
  // Each run swaps the confirmed project, so every run after the first records
  // a scope change of the same size against the run before it.
  const adopt = (args: string[], included: string, excluded?: string) => {
    f.proposal(included, excluded);
    const inspected = f.run<Inspection>([...args, '--scope', f.scopeFile]).report;
    f.run<Run>(['start', ...args.slice(1), '--scope', f.scopeFile, '--confirm', inspected.identity]);
    const completed = f.complete();
    assert.equal(completed.result.status, 0, completed.result.stdout + completed.result.stderr);
    commit(f.project.root);
    return { run: completed.report!.id, inspection: inspected.identity,
      state: readFileSync(statePath, 'utf8'), scope: readFileSync(scopePath, 'utf8') };
  };
  const runs = [adopt(inspectionArgs, 'apps/old/README.md', 'apps/new/README.md')];
  for (const [included, excluded] of [['apps/new/README.md', 'apps/old/README.md'], ['apps/old/README.md', 'apps/new/README.md'], ['apps/new/README.md', 'apps/old/README.md']]) {
    runs.push(adopt(['inspect', '--json'], included!, excluded));
    const current = runs.at(-1)!;
    const state = committedState(f.project.root);
    assertCompactWorkEvidence(state);
    assert.equal(state.lastComplete.run, current.run);
    const scope = committedScopeEvidence(f.project.root);
    assertCompactScopeEvidence(scope);
    assert.equal(scope.inspection, current.inspection);
    assert.deepEqual(scope.scopeChanges, [{ id: 'docs', additions: [included], removals: [excluded] }]);
    // Nothing from an earlier run is carried.
    for (const earlier of runs.slice(0, -1)) {
      for (const identity of [earlier.run, earlier.inspection]) {
        assert.equal(current.state.includes(identity), false, `state carries ${identity}`);
        assert.equal(current.scope.includes(identity), false, `scope evidence carries ${identity}`);
      }
    }
    // The scope change is reported against the previous run from the stored change.
    const status = f.run<Status>(['status', '--json']).report;
    assert.deepEqual(status.scopeChanges, [{ id: 'docs', additions: [included], removals: [excluded] }]);
    const summary = cli.run(['status', '--summary'], f.project.root, f.env);
    assert.equal(summary.status, 0, summary.stderr);
    assert.ok(summary.stdout.includes(`\n## Scope changes\n\n| Declaration | Added | Removed |\n| --- | --- | --- |\n| \`docs\` | \`${included}\` | \`${excluded}\` |\n`), summary.stdout);
  }
  // Committed state and scope evidence do not grow with the number of runs.
  const sizes = runs.slice(1).map(run => [Buffer.byteLength(run.state), Buffer.byteLength(run.scope)]);
  assert.deepEqual(sizes.slice(1), sizes.slice(0, -1), JSON.stringify(sizes));
});

test('a discovery completion stores its run once with the named observation as a delta', async t => {
  const f = await fixture(t);
  f.proposal('apps/old/README.md');
  const firstInspection = f.run<Inspection>([...inspectionArgs, '--scope', f.scopeFile]).report;
  const firstStart = f.run<Run>(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]);
  assert.equal(firstStart.report.phase, 'contextual', firstStart.result.stdout);
  assert.equal(f.complete().result.status, 0);
  commit(f.project.root);

  // The completion stores the run once, as the observation without its derived
  // evidence and the named observation as its delta.
  const committed = committedScopeEvidence(f.project.root);
  assertCompactScopeEvidence(committed);
  assert.equal(committed.inspection, firstInspection.identity);
  assert.deepEqual(committed.scopeChanges, [{ id: 'docs', additions: ['apps/old/README.md'], removals: [] }]);
  const stored = committed.discovery!;
  assert.deepEqual(Object.keys(stored.named!), ['targets']);
  assert.deepEqual(Object.keys(stored.named!.targets!), ['apps/old/README.md']);
  assert.deepEqual(stored.proposal, firstInspection.discovery!.proposal);
  const projection = f.run<Inspection>(['inspect', '--json']).report.historicalScope;
  assert.equal(projection!.format, 'repo-standards/scope-history/v5');
  assert.equal(projection!.inspection, firstInspection.identity);
  assert.deepEqual(projection!.discovery!.namedObservation, firstInspection.discovery!.namedObservation);
});

test('compatible standards updates preserve discovery evidence through discovery retirement and reintroduction', async t => {
  const f = await fixture(t);
  f.proposal('apps/old/README.md');
  const firstInspection = f.run<Inspection>([...inspectionArgs, '--scope', f.scopeFile]).report;
  f.run<Run>(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]);
  assert.equal(f.complete().result.status, 0);
  commit(f.project.root);

  mkdirSync(join(f.project.root, 'apps/new'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/new/README.md'), '# New project\n');
  commit(f.project.root);
  f.remote.addVersion('v1.1.0', source, { 'guidance.md': 'Keep every maintained project README useful after this standards update.' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const request = f.run<Inspection>(updateArgs).report;
  assert.deepEqual(f.run<Status>(['status', '--json']).report.scopeProposal, firstInspection.discovery!.proposal);
  assert.deepEqual(request.update, ['standards']);
  assert.ok(request.start.blockers.some((blocker: { code: string }) => blocker.code === 'DISCOVERY_REQUIRED'));
  f.proposal('apps/new/README.md', 'apps/old/README.md');
  const inspected = f.run<Inspection>([...updateArgs, '--scope', f.scopeFile]).report;
  assert.deepEqual(inspected.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: ['apps/old/README.md'] }]);
  assert.deepEqual(inspected.start.blockers, []);

  f.run<Run>(['start', ...updateArgs.slice(1), '--scope', f.scopeFile, '--confirm', inspected.identity]);
  assert.equal(f.complete().result.status, 0);
  assert.equal(readFileSync(join(f.project.root, 'apps/old/README.md'), 'utf8'), '# Old project\n');
  assert.equal(f.run<Status>(['status', '--json']).report.selection!.standards.version, 'v1.1.0');
  assert.deepEqual(f.run<Status>(['status', '--json']).report.scopeProposal, inspected.discovery!.proposal);
  commit(f.project.root);

  const withoutDiscovery = stringify({
    format: 'repo-standards/v2', name: 'growing-projects', description: 'Documentation for maintained projects',
    requires: { 'repo-standards': '>=1' }, defaults: { declarations: {
      instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
    } }, profiles: { work: { description: 'Work', declarations: {} } },
  });
  f.remote.addVersion('v1.2.0', withoutDiscovery);
  const retirementArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.2.0' : argument);
  const retirement = f.run<Inspection>(retirementArgs).report;
  assert.deepEqual(retirement.scopeChanges, [{ id: 'docs', additions: [], removals: ['apps/new/README.md'] }]);
  const retired = f.run<Run>(['start', ...retirementArgs.slice(1), '--confirm', retirement.identity]);
  assert.equal(retired.result.status, 0, retired.result.stdout + retired.result.stderr);
  commit(f.project.root);
  const retiredState = (JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8')) as State);
  assert.equal(retiredState.format, 'repo-standards/state/v7');
  assert.ok(Array.isArray(retiredState.observations));
  assertCompactWorkEvidence(retiredState);
  const retiredStatus = f.run<Status>(['status', '--json']).report;
  assert.equal(retiredStatus.format, 'repo-standards/status/v7');
  assert.equal(retiredStatus.scopeProposal, null);
  // Retiring discovery keeps the stored removal against the previous run.
  assert.deepEqual(retiredStatus.scopeChanges, retirement.scopeChanges);
  const noDiscoveryScope = f.run<Inspection>(['inspect', '--json']).report.historicalScope;
  assert.equal(noDiscoveryScope!.inspection, retirement.identity);
  assert.equal(noDiscoveryScope!.discovery, undefined);
  assert.deepEqual(noDiscoveryScope!.scopeChanges, retirement.scopeChanges);
  // A later run without discovery changes no scope against the retired one.
  const reapplied = f.run<Inspection>(['inspect', '--json']).report;
  assert.equal(f.run<Run>(['start', '--confirm', reapplied.identity, '--json']).result.status, 0);
  commit(f.project.root);
  assert.deepEqual(f.run<Status>(['status', '--json']).report.scopeChanges, []);
  assert.equal(f.run<Inspection>(['inspect', '--json']).report.historicalScope!.inspection, reapplied.identity);

  f.remote.addVersion('v1.3.0', source);
  const reintroducedArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.3.0' : argument);
  f.proposal('apps/new/README.md');
  const reintroduced = f.run<Inspection>([...reintroducedArgs, '--scope', f.scopeFile]).report;
  assert.deepEqual(reintroduced.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: [] }]);
  f.run<Run>(['start', ...reintroducedArgs.slice(1), '--scope', f.scopeFile, '--confirm', reintroduced.identity]);
  assert.equal(f.complete().result.status, 0);
  const reintroducedState = (JSON.parse(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8')) as State);
  assert.equal(reintroducedState.format, 'repo-standards/state/v7');
  assertCompactWorkEvidence(reintroducedState);
  assert.deepEqual(f.run<Status>(['status', '--json']).report.scopeChanges, reintroduced.scopeChanges);
});

test('a compatible CLI update uses retained v2 guidance and fresh scope without the original source', async t => {
  const candidateVersion = inc(cli.version, 'minor')!;
  const f = await fixture(t, [cli.version, candidateVersion]);
  const candidate = sourceFixture('');
  t.after(() => candidate.close());
  f.proposal('apps/old/README.md');
  const firstInspection = f.run<Inspection>([...inspectionArgs, '--scope', f.scopeFile]).report;
  f.run<Run>(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]);
  assert.equal(f.complete().result.status, 0);
  commit(f.project.root);

  mkdirSync(join(f.project.root, 'apps/new'), { recursive: true });
  writeFileSync(join(f.project.root, 'apps/new/README.md'), '# New project\n');
  commit(f.project.root);
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`],
    { cwd: candidate.root, env: f.env, stdio: 'pipe' });
  for (const key of Object.keys(f.remote.responses)) delete f.remote.responses[key];
  f.remote.save();
  const binary = join(candidate.root, 'node_modules/.bin/repo-standards');
  const runCandidate = <T = Run>(args: string[]) => {
    const result = spawnSync(binary, args, { cwd: f.project.root, env: f.env, encoding: 'utf8' });
    return { result, report: (JSON.parse(result.stdout) as T) };
  };

  const request = runCandidate<Inspection>(['inspect', '--json']).report;
  assert.deepEqual(request.update, ['cli']);
  assert.equal(request.selection.cli.version, candidateVersion);
  assert.ok(request.start.blockers.some((blocker: { code: string }) => blocker.code === 'DISCOVERY_REQUIRED'));
  f.proposal('apps/new/README.md', 'apps/old/README.md');
  const inspected = runCandidate<Inspection>(['inspect', '--scope', f.scopeFile, '--json']).report;
  assert.deepEqual(inspected.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: ['apps/old/README.md'] }]);
  assert.deepEqual(inspected.start.blockers, []);

  const started = runCandidate<Run>(['start', '--scope', f.scopeFile, '--confirm', inspected.identity, '--json']).report;
  assert.equal(started.phase, 'contextual');
  assert.equal(f.complete(runCandidate).result.status, 0);
  assert.equal(readFileSync(join(f.project.root, 'apps/old/README.md'), 'utf8'), '# Old project\n');
  const status = runCandidate<Status>(['status', '--json']).report;
  assert.equal(status.selection!.cli.version, candidateVersion);
  assert.equal(status.selection!.standards.version, 'v1.0.0');
  assert.equal(existsSync(join(f.project.root, '.agents/skills/author-standards')), false);
});

test('durable product state over the per-file limit leaves discovery inspectable and separately verified', async t => {
  const f = await fixture(t);
  f.proposal('apps/old/README.md');
  const firstInspection = f.run<Inspection>([...inspectionArgs, '--scope', f.scopeFile]).report;
  f.run<Run>(['start', ...inspectionArgs.slice(1), '--scope', f.scopeFile, '--confirm', firstInspection.identity]);
  assert.equal(f.complete().result.status, 0);
  commit(f.project.root);

  // An established adopter accumulates durable state until one committed file
  // passes the per-file observation limit.
  assert.ok(growCommittedState(f.project.root, 8 * 1024 * 1024 + 1) > 8 * 1024 * 1024);
  commit(f.project.root);

  // Every inspection route that takes a discovery observation: retained
  // inspection without source flags, source-flag inspection of the unchanged
  // selection, and a standards update.
  f.remote.addVersion('v1.1.0', source, { 'guidance.md': 'Keep every maintained project README useful after this standards update.' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const reserved = (path: string) => path === '.repo-standards' || path.startsWith('.repo-standards/');
  for (const args of [['inspect', '--json'], inspectionArgs, updateArgs]) {
    const inspection = f.run<Inspection>(args);
    assert.equal(inspection.result.status, 0, inspection.result.stdout + inspection.result.stderr);
    assert.equal(inspection.report.format, 'repo-standards/inspection/v6');
    const { evidence, observation } = inspection.report.discovery!;
    assert.ok(evidence.some((entry: { path: string }) => entry.path === 'apps/old/README.md'));
    assert.deepEqual(evidence.filter((entry: { path: string }) => reserved(entry.path)), []);
    for (const record of [observation.files, observation.inventories, observation.boundaries]) {
      assert.deepEqual(Object.keys(record).filter(reserved), []);
    }
    assert.deepEqual(Object.values(observation.inventories).flat().filter(reserved), []);
    const productState = inspection.report.project.productState;
    assert.equal(productState.type, 'directory');
    assert.equal(productState.entries['state.json']!.type, 'file');
    assert.ok(Object.keys(productState.entries).includes('inputs'));
    if (args === updateArgs) assert.deepEqual(inspection.report.update, ['standards']);
  }

  // Product state stays verified separately: its inventory still rejects
  // additions, and an oversized project-owned file still fails closed.
  const unexpected = join(f.project.root, '.repo-standards/unexpected.json');
  writeFileSync(unexpected, '{}\n');
  const drifted = f.run<Inspection>(['inspect', '--json']).report;
  assert.ok(drifted.start.blockers.some((blocker) =>
    blocker.code === 'STATE_INTEGRITY' && blocker.path === '.repo-standards'), JSON.stringify(drifted.start.blockers));
  rmSync(unexpected);
  const oversizedProjectFile = join(f.project.root, 'apps/old/large.bin');
  writeFileSync(oversizedProjectFile, Buffer.alloc(8 * 1024 * 1024 + 1));
  const limited = f.run<ErrorReport>(['inspect', '--json']);
  assert.equal(limited.result.status, 1, limited.result.stdout);
  assert.equal(limited.report.errors[0]!.code, 'OBSERVATION_LIMIT');
  rmSync(oversizedProjectFile);
});
