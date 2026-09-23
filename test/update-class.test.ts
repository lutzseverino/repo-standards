import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

const check = (args: string[]) => ({ id: 'verify', run: { executable: process.execPath, script: 'check.mjs', resources: ['rules'], arguments: args },
  prerequisite: { 'version-arguments': ['--version'], version: '^24' }, 'timeout-seconds': 10 });
const declarations = {
  instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
  legacy: { kind: 'file', target: 'LEGACY.md', exact: 'legacy.md' },
  docs: { kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md', checks: [check(['--strict'])] },
};
const manifest = (active: object = declarations) => stringify({ format: 'repo-standards/v2', name: 'classified-updates', description: 'Update class fixture',
  requires: { 'repo-standards': '>=1' }, defaults: { declarations: active }, profiles: { work: { description: 'Work', declarations: {} } } });
const files = {
  'agents.md': 'Pinned instructions\n',
  'legacy.md': 'Legacy notes\n',
  'guidance.md': 'Keep every maintained project README useful.\n',
  'discovery.md': 'Include the README of every maintained project.\n',
  'check.mjs': `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Verified'}));\n`,
  'rules/style.txt': 'Headings use sentence case.\n',
};

// A complete discovery-backed adoption of v1.0.0 whose confirmed scope is the
// first project README, committed through the project's workflow.
async function adopted(t: TestContext) {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(manifest(), files);
  const project = sourceFixture('', { 'apps/a/README.md': '# Project A\n', 'apps/b/README.md': '# Project B\n' });
  commit(project.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => { const result = cli.run(args, project.root, env); return { result, report: JSON.parse(result.stdout) }; };
  const scopeFile = join(remote.support.root, 'scope.json');
  // Inspect with a fresh proposal for the discovery request the first pass returns.
  function inspect(args: string[], paths = ['apps/a/README.md']) {
    const request = run(args).report;
    const evidence = paths.map(path => request.discovery.evidence.find((entry: { kind: string; path: string }) => entry.kind === 'file' && entry.path === path));
    writeFileSync(scopeFile, JSON.stringify({ format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: [{
      id: 'docs', paths, coverage: 'The maintained projects.', evidence,
      candidates: paths.map((path, index) => ({ path, decision: 'include', reason: 'A maintained project README.', evidence: [evidence[index]] })), unresolved: [] }] }));
    const result = run([...args, '--scope', scopeFile]);
    assert.equal(result.result.status, 0, result.result.stdout + result.result.stderr);
    return result.report;
  }
  const inspection = inspect(inspectionArgs);
  assert.equal(inspection.updateClass, undefined);
  const started = run(['start', ...inspectionArgs.slice(1), '--scope', scopeFile, '--confirm', inspection.identity]).report;
  assert.equal(started.phase, 'contextual', JSON.stringify(started));
  const work = started.workRequest;
  const review = { status: 'valid', explanation: 'The confirmed project still matches.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
  const assessment = join(remote.support.root, 'assessment.json');
  writeFileSync(assessment, JSON.stringify({ format: 'repo-standards/assessment/v2', run: work.run, selection: work.selection, snapshot: work.snapshot,
    scope: { inspection: work.scope.inspection, afterFixes: work.scope.afterFixes },
    declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The README already satisfies the guidance.', changedPaths: [], evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }] }));
  const completed = run(['resume', '--assessment', assessment, '--json']);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  commit(project.root);
  return { remote, run, inspect };
}

const versionArgs = (tag: string) => inspectionArgs.map(argument => argument === 'v1.0.0' ? tag : argument);

test('an update is exact when only exact content or the selection changes, including an unchanged selection', async t => {
  const f = await adopted(t);
  const unchanged = f.inspect(['inspect', '--json']);
  assert.deepEqual(unchanged.update, []);
  assert.equal(unchanged.updateClass, 'exact');
  assert.deepEqual(unchanged.contextualChanges, []);
  assert.deepEqual(unchanged.start.blockers, []);

  f.remote.publish('v1.0.1');
  const selectionOnly = f.inspect(versionArgs('v1.0.1'));
  assert.deepEqual(selectionOnly.update, ['standards']);
  assert.equal(selectionOnly.updateClass, 'exact');
  assert.deepEqual(selectionOnly.contextualChanges, []);

  f.remote.addVersion('v1.1.0', manifest(), { ...files, 'agents.md': 'Revised instructions\n' });
  const exactContent = f.inspect(versionArgs('v1.1.0'));
  assert.equal(exactContent.exact.find((entry: { id: string }) => entry.id === 'instructions').action, 'replace');
  assert.equal(exactContent.updateClass, 'exact');
  assert.deepEqual(exactContent.contextualChanges, []);
});

test('each change to guidance, discovery guidance, operations, retired declarations, or confirmed scope makes the update contextual', async t => {
  const f = await adopted(t);
  // An active discovery declaration without a confirmed proposal has no scope
  // that can equal the retained one yet.
  const unconfirmed = f.run(['inspect', '--json']).report;
  assert.ok(unconfirmed.start.blockers.some((blocker: { code: string }) => blocker.code === 'DISCOVERY_REQUIRED'));
  assert.equal(unconfirmed.updateClass, 'contextual');
  assert.deepEqual(unconfirmed.contextualChanges, [{ id: 'docs', changes: ['scope'] }]);
  assert.deepEqual(unconfirmed.retired, []);

  const cases: [string, object, Record<string, string>, string[]][] = [
    ['guidance text', declarations, { 'guidance.md': 'Keep every maintained project README accurate.\n' }, ['guidance']],
    ['discovery guidance', declarations, { 'discovery.md': 'Include the README of every deployed project.\n' }, ['discovery']],
    ['script', declarations, { 'check.mjs': `// Revised.\n${files['check.mjs']}` }, ['operations']],
    ['argument', { ...declarations, docs: { ...declarations.docs, checks: [check(['--strict', '--all'])] } }, {}, ['operations']],
    ['resource', declarations, { 'rules/style.txt': 'Headings use title case.\n' }, ['operations']],
  ];
  let minor = 1;
  for (const [name, active, changed, expected] of cases) await t.test(name, () => {
    const tag = `v1.${minor++}.0`;
    f.remote.addVersion(tag, manifest(active), { ...files, ...changed });
    const report = f.inspect(versionArgs(tag));
    assert.deepEqual(report.update, ['standards']);
    assert.equal(report.updateClass, 'contextual');
    assert.deepEqual(report.contextualChanges, [{ id: 'docs', changes: expected }]);
  });

  await t.test('retired declaration set', () => {
    const { legacy: _legacy, ...remaining } = declarations;
    f.remote.addVersion('v2.0.0', manifest(remaining), files);
    const report = f.inspect(versionArgs('v2.0.0'));
    assert.deepEqual(report.retired.map((entry: { id: string }) => entry.id), ['legacy']);
    assert.equal(report.updateClass, 'contextual');
    assert.deepEqual(report.contextualChanges, [{ id: 'legacy', changes: ['retired'] }]);
  });

  await t.test('confirmed scope', () => {
    const report = f.inspect(['inspect', '--json'], ['apps/a/README.md', 'apps/b/README.md']);
    assert.deepEqual(report.update, []);
    assert.deepEqual(report.scopeChanges, [{ id: 'docs', additions: ['apps/b/README.md'], removals: [] }]);
    assert.equal(report.updateClass, 'contextual');
    assert.deepEqual(report.contextualChanges, [{ id: 'docs', changes: ['scope'] }]);
  });
});
