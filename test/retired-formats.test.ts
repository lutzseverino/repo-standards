import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { committedScopeHistory, committedState, rewriteCommittedState, rewriteRetainedInput } from './committed-evidence.ts';
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
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(source, {
    'guidance.md': 'Keep every maintained project README useful.',
    'discovery.md': 'Include the README of every maintained project.',
    'agents.md': 'Pinned instructions\n',
  });
  const project = sourceFixture('', { 'apps/docs/README.md': '# Documented project\n' });
  commit(project.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => { const result = cli.run(args, project.root, env); return { result, report: JSON.parse(result.stdout) }; };
  const request = run(inspectionArgs).report;
  const evidence = request.discovery.evidence.find((entry: { kind: string; path: string }) => entry.kind === 'file' && entry.path === 'apps/docs/README.md');
  const scopeFile = join(remote.support.root, 'scope.json');
  writeFileSync(scopeFile, JSON.stringify({ format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: [{
    id: 'docs', paths: ['apps/docs/README.md'], coverage: 'The only maintained project.', evidence: [evidence],
    candidates: [{ path: 'apps/docs/README.md', decision: 'include', reason: 'A maintained project README.', evidence: [evidence] }], unresolved: [] }] }));
  const inspection = run([...inspectionArgs, '--scope', scopeFile]).report;
  const started = run(['start', ...inspectionArgs.slice(1), '--scope', scopeFile, '--confirm', inspection.identity]).report;
  assert.equal(started.phase, 'contextual');
  const work = started.workRequest;
  const review = { status: 'valid', explanation: 'The confirmed project still matches.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
  const assessment = join(remote.support.root, 'assessment.json');
  writeFileSync(assessment, JSON.stringify({ format: 'repo-standards/assessment/v2', run: work.run, selection: work.selection, snapshot: work.snapshot,
    scope: { inspection: work.scope.inspection, afterFixes: work.scope.afterFixes },
    declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The README already satisfies the guidance.', changedPaths: [], evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }] }));
  const completed = run(['resume', '--assessment', assessment, '--json']);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  commit(project.root);
  return { project, run };
}

test('a retired state, scope evidence, or run record format is rejected with the fresh-adoption diagnostic and nothing is written', async t => {
  const f = await adoptedProject(t);
  const root = f.project.root;
  const state = committedState(root);
  const history = committedScopeHistory(root);
  assert.equal(state.format, 'repo-standards/state/v5');
  assert.equal(history.format, 'repo-standards/scope-history/v3');
  assert.equal(f.run(['status', '--json']).report.format, 'repo-standards/status/v5');
  const retainedInspection = f.run(['inspect', '--json']).report;
  assert.equal(retainedInspection.format, 'repo-standards/inspection/v4');
  assert.equal(retainedInspection.historicalScope.format, 'repo-standards/scope-history/v3');

  const runRecord = join(root, git(root, 'rev-parse', '--git-path', 'repo-standards-run.lock'));
  const committed = ['.repo-standards/state.json', '.repo-standards/lock.json', '.repo-standards/inputs/scope-history.json']
    .map(path => [path, readFileSync(join(root, path))] as const);
  const restore = () => {
    for (const [path, bytes] of committed) writeFileSync(join(root, path), bytes);
    rmSync(runRecord, { force: true });
  };
  const retired = [
    ...['v1', 'v2', 'v3', 'v4'].map(version => ({ format: `repo-standards/state/${version}`, current: 'repo-standards/state/v5',
      plant: (format: string) => rewriteCommittedState(root, { ...state, format }) })),
    ...['v1', 'v2'].map(version => ({ format: `repo-standards/scope-history/${version}`, current: 'repo-standards/scope-history/v3',
      plant: (format: string) => rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { ...history, format }) })),
    ...['v1', 'v2', 'v3', 'v4'].map(version => ({ format: `repo-standards/run/${version}`, current: 'repo-standards/run/v5',
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
  assert.equal(f.run(['status', '--json']).report.format, 'repo-standards/status/v5');

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

test('the single committed formats are validated on read', async t => {
  const f = await adoptedProject(t);
  const root = f.project.root;
  const state = committedState(root);
  const history = committedScopeHistory(root);
  // Work evidence carries observation identities, never observation maps.
  rewriteCommittedState(root, { ...state, observations: state.observations!.map(interval => ({ ...interval, before: { files: {} } })) });
  assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  assert.equal(f.run(['status', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
  // Retained scope evidence stores each run once, never spread over the file.
  rewriteCommittedState(root, state);
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { ...history, ...history.runs[0] });
  assert.equal(f.run(['inspect', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
});
