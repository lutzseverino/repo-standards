import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { installCli, installedTree, snapshot, sourceFixture } from './installed-cli.ts';
import { committedScopeEvidence, committedState, rewriteCommittedState, rewriteRetainedInput } from './committed-evidence.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

const source = stringify({
  format: 'repo-standards/v2', name: 'documented-projects', description: 'Documentation for maintained projects',
  requires: { 'repo-standards': '>=1' },
  defaults: { declarations: {
    docs: { kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md' },
    instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
  } },
  profiles: { work: { description: 'Work', declarations: {} } },
});

// A complete, committed discovery adoption: its state, retained scope evidence
// and run records are all in the single format this CLI writes.
async function adoptedProject(t: import('node:test').TestContext) {
  const remote = remoteFixture(source, {
    'guidance.md': 'Keep every maintained project README useful.',
    'discovery.md': 'Include the README of every maintained project.',
    'agents.md': 'Pinned instructions\n',
  });
  const project = sourceFixture('', { 'apps/docs/README.md': '# Documented project\n' });
  commit(project.root);
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => { const result = cli.run(args, project.root, env); return { result, report: JSON.parse(result.stdout) }; };
  const scopeFile = join(remote.support.root, 'scope.json');
  writeFileSync(scopeFile, JSON.stringify({ format: 'repo-standards/scope/v2', declarations: [{
    id: 'docs', coverage: 'The only maintained project.',
    candidates: [{ path: 'apps/docs/README.md', decision: 'include', reason: 'A maintained project README.', evidence: ['apps/docs/README.md'] }], unresolved: [] }] }));
  const inspection = run([...inspectionArgs, '--scope', scopeFile]).report;
  const started = run(['start', ...inspectionArgs.slice(1), '--scope', scopeFile, '--confirm', inspection.identity]).report;
  assert.equal(started.phase, 'contextual');
  const review = { status: 'valid', explanation: 'The confirmed project still matches.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
  const assessment = join(remote.support.root, 'assessment.json');
  writeFileSync(assessment, JSON.stringify({ format: 'repo-standards/assessment/v3',
    declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The README already satisfies the guidance.', evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }] }));
  const completed = run(['resume', '--assessment', assessment, '--json']);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  commit(project.root);
  return { project, run };
}

test('a retired state, scope evidence, or run record format is rejected with the fresh-adoption diagnostic and nothing is written', async t => {
  const f = await adoptedProject(t);
  const root = f.project.root;
  const state = committedState(root);
  const scope = committedScopeEvidence(root);
  assert.equal(state.format, 'repo-standards/state/v6');
  assert.equal(scope.format, 'repo-standards/scope-history/v4');
  assert.equal(f.run(['status', '--json']).report.format, 'repo-standards/status/v7');
  const retainedInspection = f.run(['inspect', '--json']).report;
  assert.equal(retainedInspection.format, 'repo-standards/inspection/v5');
  assert.equal(retainedInspection.historicalScope.format, 'repo-standards/scope-history/v4');

  const runRecord = join(root, git(root, 'rev-parse', '--git-path', 'repo-standards-run.lock'));
  const committed = ['.repo-standards/state.json', '.repo-standards/lock.json', '.repo-standards/inputs/scope-history.json']
    .map(path => [path, readFileSync(join(root, path))] as const);
  const restore = () => {
    for (const [path, bytes] of committed) writeFileSync(join(root, path), bytes);
    rmSync(runRecord, { force: true });
  };
  const retired = [
    { format: 'repo-standards/lock/v0', current: 'repo-standards/lock/v1',
      plant: (format: string) => writeFileSync(join(root, '.repo-standards/lock.json'), JSON.stringify({ format })) },
    ...['v1', 'v2', 'v3', 'v4', 'v5'].map(version => ({ format: `repo-standards/state/${version}`, current: 'repo-standards/state/v6',
      plant: (format: string) => rewriteCommittedState(root, { ...state, format }) })),
    ...['v1', 'v2', 'v3'].map(version => ({ format: `repo-standards/scope-history/${version}`, current: 'repo-standards/scope-history/v4',
      plant: (format: string) => rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { ...scope, format }) })),
    ...['v1', 'v2', 'v3', 'v4', 'v5'].map(version => ({ format: `repo-standards/run/${version}`, current: 'repo-standards/run/v6',
      plant: (format: string) => writeFileSync(runRecord, JSON.stringify({ format, id: 'c0ffee00-0000-4000-8000-000000000000',
        selection: state, outcome: 'incomplete', phase: 'fixes' })) })),
  ];
  for (const { format, current, plant } of retired) {
    plant(format);
    const before = snapshot(root);
    for (const command of [['inspect'], ['status'], ['resume'], ['abandon']]) {
      const rejected = f.run([...command, '--json']);
      assert.equal(rejected.result.status, 1, `${format} ${command[0]}: ${rejected.result.stdout}`);
      assert.equal(rejected.report.errors.length, 1);
      const [diagnostic] = rejected.report.errors;
      assert.equal(diagnostic.code, 'RETIRED_FORMAT', `${format} ${command[0]}`);
      assert.ok(diagnostic.message.includes(`retired format ${format}; this CLI reads only ${current}.`), diagnostic.message);
      assert.match(diagnostic.message, /Adopt fresh: remove the \.repo-standards directory.*, commit, and adopt again\.$/);
      assert.deepEqual(snapshot(root), before, `${format} ${command[0]} must not write`);
    }
    restore();
  }
  assert.equal(f.run(['status', '--json']).report.format, 'repo-standards/status/v7');

  // An archived report of an abandoned run is a run record too.
  const reports = join(runRecord, '../repo-standards-reports');
  mkdirSync(reports, { recursive: true });
  writeFileSync(join(reports, 'c0ffee00-0000-4000-8000-000000000000.json'), JSON.stringify({ format: 'repo-standards/run/v1', id: 'c0ffee00-0000-4000-8000-000000000000' }));
  const before = snapshot(root);
  for (const command of [['inspect'], ['status'], ['resume'], ['abandon']]) {
    const archived = f.run([...command, '--json']);
    assert.equal(archived.result.status, 1, `archived ${command[0]}: ${archived.result.stdout}`);
    assert.equal(archived.report.errors[0].code, 'RETIRED_FORMAT', `archived ${command[0]}`);
    assert.match(archived.report.errors[0].message, /repo-standards-reports\/c0ffee00-0000-4000-8000-000000000000\.json carries the retired format repo-standards\/run\/v1/);
    assert.deepEqual(snapshot(root), before, `archived ${command[0]} must not write`);
  }
});

test('newer record formats require the pinned CLI without fresh-adoption advice or writes', async t => {
  const { project, run } = await adoptedProject(t);
  const root = project.root;
  const runRecord = join(root, git(root, 'rev-parse', '--git-path', 'repo-standards-run.lock'));
  const reports = join(runRecord, '../repo-standards-reports');
  mkdirSync(reports, { recursive: true });
  const archived = join(reports, 'c0ffee00-0000-4000-8000-000000000000.json');
  const records = [
    { path: join(root, '.repo-standards/state.json'), format: 'repo-standards/state/v7', expected: 'repo-standards/state/v6' },
    { path: join(root, '.repo-standards/state.json'), format: 'repo-standards/state/v10', expected: 'repo-standards/state/v6' },
    { path: join(root, '.repo-standards/inputs/scope-history.json'), format: 'repo-standards/scope-history/v5', expected: 'repo-standards/scope-history/v4' },
    { path: runRecord, format: 'repo-standards/run/v7', expected: 'repo-standards/run/v6' },
    { path: archived, format: 'repo-standards/run/v7', expected: 'repo-standards/run/v6' },
    { path: join(root, '.repo-standards/lock.json'), format: 'repo-standards/lock/v2', expected: 'repo-standards/lock/v1' },
  ];
  for (const { path, format, expected } of records) {
    const original = [runRecord, archived].includes(path) ? undefined : readFileSync(path);
    // A future schema need not carry the pin at any location this CLI knows.
    // Only the format can be interpreted, even for the pin-bearing records.
    writeFileSync(path, JSON.stringify({ format, futureSelection: {} }));
    const before = snapshot(root);
    for (const command of [['inspect'], ['start', '--confirm', 'sha256:unreadable'], ['status'], ['resume'], ['abandon']]) {
      const rejected = run([...command, '--json']);
      assert.equal(rejected.result.status, 1, rejected.result.stdout + rejected.result.stderr);
      assert.equal(rejected.report.errors.length, 1);
      const [diagnostic] = rejected.report.errors;
      assert.equal(diagnostic.code, 'NEWER_FORMAT', `${format} ${command[0]}`);
      assert.ok(diagnostic.message.includes(format), diagnostic.message);
      assert.ok(diagnostic.message.includes(expected), diagnostic.message);
      assert.match(diagnostic.message, /Use the (?:project-)?pinned CLI/);
      assert.doesNotMatch(diagnostic.message, /remove|removal|fresh|adopt again/i);
      assert.deepEqual(diagnostic.details, { path: path.startsWith(root + '/') ? path.slice(root.length + 1) : path, format, expected });
      assert.deepEqual(snapshot(root), before, `${format} ${command[0]} must not write`);
    }
    if (original) writeFileSync(path, original);
    else rmSync(path);
  }
  assert.equal(run(['status', '--json']).result.status, 0);
});

test('the single committed formats are validated on read', async t => {
  const f = await adoptedProject(t);
  const root = f.project.root;
  const state = committedState(root);
  const scope = committedScopeEvidence(root);
  for (const format of ['repo-standards/state/vnext', 'repo-standards/state/v7-extra', 'repo-standards/state/v-1', 'repo-standards/unrelated/v1']) {
    rewriteCommittedState(root, { ...state, format });
    for (const command of ['inspect', 'status']) {
      const before = snapshot(root);
      assert.equal(f.run([command, '--json']).report.errors[0].code, 'STATE_INTEGRITY', format);
      assert.deepEqual(snapshot(root), before);
    }
  }
  // Work evidence carries observation identities, never observation maps.
  rewriteCommittedState(root, { ...state, observations: state.observations!.map(interval => ({ ...interval, before: { files: {} } })) });
  assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  assert.equal(f.run(['status', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  // Committed evidence holds the current run only; a carried earlier run is
  // never read.
  rewriteCommittedState(root, { ...state, history: [] });
  assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  assert.equal(f.run(['status', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  // The net change set holds one entry per path, in path order, each with its
  // known phases in phase order.
  const { changeSet, ...withoutChangeSet } = state;
  for (const invalid of [withoutChangeSet, { ...state, changeSet: [{ path: 'AGENTS.md', phases: [] }] },
    { ...state, changeSet: [{ path: 'AGENTS.md', phases: ['checks'] }] }, { ...state, changeSet: [{ path: 'AGENTS.md', phases: ['agent', 'fixes'] }] },
    { ...state, changeSet: [{ path: 'b.md', phases: ['fixes'] }, { path: 'a.md', phases: ['fixes'] }] },
    { ...state, changeSet: [{ path: 'a.md', phases: ['fixes'] }, { path: 'a.md', phases: ['agent'] }] }]) {
    rewriteCommittedState(root, invalid);
    const label = JSON.stringify((invalid as { changeSet?: unknown }).changeSet ?? 'missing');
    assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY', label);
    assert.equal(f.run(['status', '--json']).report.errors[0].code, 'STATE_INTEGRITY', label);
  }
  assert.ok(changeSet?.length, 'the adopted project records its changed paths');
  rewriteCommittedState(root, state);
  const { format, evidence, scopeChanges, ...run } = scope;
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { ...scope, runs: [run] });
  assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  assert.equal(f.run(['status', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  // Retained scope evidence records its scope change against the previous run.
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { format, evidence, ...run });
  assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  // A discovery run keeps its discovery and source-resolved declarations together.
  const { discovery, sourceResolved, ...withoutDiscovery } = run;
  for (const unpaired of [{ ...withoutDiscovery, discovery }, { ...withoutDiscovery, sourceResolved }]) {
    rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { format, evidence, ...unpaired, scopeChanges });
    assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  }
  // It is historical evidence, marked as such.
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { format, ...run, scopeChanges });
  assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', scope);
  assert.equal(f.run(['status', '--json']).result.status, 0);
});

test('a project on a retired format completes remove, commit, and adopt again without an ownership blocker', async t => {
  const remote = remoteFixture(stringify({
    format: 'repo-standards/v2', name: 'exact-standards', description: 'Exact content and a skill',
    requires: { 'repo-standards': '>=1' },
    defaults: { declarations: {
      instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
      review: { kind: 'skill', name: 'review', source: 'review' },
    } },
    profiles: { work: { description: 'Work', declarations: {} } },
  }), { 'agents.md': 'Pinned instructions\n', 'review/SKILL.md': '# Review\n' });
  const project = sourceFixture('', { 'README.md': '# Project\n' });
  commit(project.root);
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => { const result = cli.run(args, project.root, env); return { result, report: JSON.parse(result.stdout) }; };
  const initial = run(inspectionArgs).report;
  assert.equal(run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity]).result.status, 0);
  commit(project.root);
  // An earlier CLI wrote a retired state format and its own system skill, and
  // the maintainer edited the installed author skill since.
  rewriteCommittedState(project.root, { ...committedState(project.root), format: 'repo-standards/state/v5' });
  writeFileSync(join(project.root, '.agents/skills/adopt-standards/SKILL.md'), '# System skill of an earlier CLI\n');
  writeFileSync(join(project.root, '.agents/skills/adopt-standards/earlier.md'), 'Earlier resource\n');
  writeFileSync(join(project.root, '.agents/skills/review/SKILL.md'), '# Review, edited\n');
  commit(project.root);
  assert.equal(run(['inspect', '--json']).report.errors[0].code, 'RETIRED_FORMAT');

  git(project.root, 'rm', '-r', '--quiet', '.repo-standards');
  rmSync(join(project.root, '.repo-standards'), { recursive: true, force: true });
  commit(project.root);
  const inspection = run(inspectionArgs).report;
  assert.deepEqual(inspection.start.blockers, []);
  assert.equal(inspection.start.eligible, true);
  assert.deepEqual(inspection.discardedEdits, ['.agents/skills/adopt-standards', '.agents/skills/review']);
  assert.equal(inspection.exact.find((entry: { id: string }) => entry.id === 'instructions').action, 'match');
  const started = run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity]);
  assert.equal(started.result.status, 0, started.result.stdout + started.result.stderr);
  assert.equal(started.report.outcome, 'complete');
  assert.deepEqual(installedTree(join(project.root, '.agents/skills/adopt-standards')), installedTree(join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills/adopt-standards')));
  assert.equal(readFileSync(join(project.root, '.agents/skills/review/SKILL.md'), 'utf8'), '# Review\n');
  assert.equal(committedState(project.root).format, 'repo-standards/state/v6');
});
