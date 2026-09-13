import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inc } from 'semver';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
const candidateVersion = inc(cli.version, 'minor')!;
after(() => cli.close());

const source = `format: repo-standards/v1
name: re-adoption-standards
description: Re-adoption fixture
requires: {repo-standards: ">=1.0.0 <2.0.0"}
defaults:
  declarations:
    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
profiles:
  work:
    description: Work
    declarations: {}
`;

test('explicit re-adoption starts unchanged retained v1 standards without the original source', async t => {
  const remote = remoteFixture(source, { 'agents.md': 'Pinned standards' });
  const project = sourceFixture('');
  const candidate = sourceFixture('');
  const registry = await registryFixture(cli.root, [cli.version, candidateVersion]);
  t.after(() => { registry.close(); remote.close(); project.close(); candidate.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };

  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const adopted = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env);
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
  commit(project.root);
  const previous = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);

  writeFileSync(join(project.root, 'uncommitted.txt'), 'Dirty project');
  let blocked = JSON.parse(cli.run(['inspect', '--readopt', '--json'], project.root, env).stdout);
  assert.ok(blocked.start.blockers.some((blocker: { code: string }) => blocker.code === 'DIRTY_PROJECT'));
  rmSync(join(project.root, 'uncommitted.txt'));
  writeFileSync(join(project.root, 'AGENTS.md'), 'Edited installed content');
  blocked = JSON.parse(cli.run(['inspect', '--readopt', '--json'], project.root, env).stdout);
  assert.ok(blocked.start.blockers.some((blocker: { code: string }) => blocker.code === 'INSTALLED_CONTENT_EDITED'));
  writeFileSync(join(project.root, 'AGENTS.md'), 'Pinned standards');

  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();

  const ordinary = JSON.parse(cli.run(['inspect', '--json'], project.root, env).stdout);
  assert.ok(ordinary.start.blockers.some((blocker: { code: string }) => blocker.code === 'NO_UPDATE'));
  const inspectedResult = cli.run(['inspect', '--readopt', '--json'], project.root, env);
  assert.equal(inspectedResult.status, 0, inspectedResult.stdout + inspectedResult.stderr);
  const inspected = JSON.parse(inspectedResult.stdout);
  assert.equal(inspected.action, 'readopt');
  assert.equal(inspected.retained, true);
  assert.equal(inspected.start.eligible, true);
  assert.deepEqual(inspected.selection, previous.selection);
  assert.notEqual(inspected.identity, ordinary.identity);

  for (const [args, identity] of [
    [['start', '--confirm'], inspected.identity],
    [['start', '--readopt', '--confirm'], ordinary.identity],
  ] as const) {
    const mismatch = cli.run([...args, identity, '--json'], project.root, env);
    assert.equal(mismatch.status, 1);
    assert.equal(JSON.parse(mismatch.stdout).errors[0].code, 'STALE_INSPECTION');
  }
  const switched = cli.run(['inspect', '--readopt', ...inspectionArgs.slice(1)], project.root, env);
  assert.equal(switched.status, 1);
  assert.equal(JSON.parse(switched.stdout).errors[0].code, 'SELECTION_SWITCH');
  const combined = cli.run(['inspect', '--readopt', '--amend-scope', '--json'], project.root, env);
  assert.equal(combined.status, 2);
  assert.equal(JSON.parse(combined.stdout).errors[0].code, 'USAGE');
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
  const changedCli = spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), ['inspect', '--readopt', '--json'], { cwd: project.root, env, encoding: 'utf8' });
  assert.equal(changedCli.status, 0, changedCli.stdout + changedCli.stderr);
  assert.ok(JSON.parse(changedCli.stdout).start.blockers.some((blocker: { code: string }) => blocker.code === 'SELECTION_SWITCH'));

  const result = cli.run(['start', '--readopt', '--confirm', inspected.identity, '--json'], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const completed = JSON.parse(result.stdout);
  assert.equal(completed.outcome, 'complete');
  assert.equal(completed.previousComplete.lastComplete.run, previous.lastComplete.run);
  assert.deepEqual(completed.selection, previous.selection);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Pinned standards');
  const current = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  assert.notEqual(current.lastComplete.run, previous.lastComplete.run);
  assert.deepEqual(current.selection, previous.selection);
});

test('re-adoption requires fresh v1 contextual assessment and checks for newly committed project content', async t => {
  const operation = { id: 'documentation', run: { executable: process.execPath, script: 'check.mjs', resources: [], arguments: [] },
    prerequisite: { 'version-arguments': ['--version'], version: '>=24 <25' }, 'timeout-seconds': 5 };
  const remote = remoteFixture(stringify({ format: 'repo-standards/v1', name: 're-adoption-context', description: 'Project documentation',
    requires: { 'repo-standards': '^1' }, defaults: { declarations: {
      documentation: { kind: 'repository', guidance: 'guidance.md', targets: { paths: [], directories: ['projects'] }, checks: [operation] },
    } }, profiles: { work: { description: 'Work', declarations: {} } } }), {
    'guidance.md': 'Explain every maintained project.',
    'check.mjs': `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Reviewed project documentation'}));`,
  });
  const project = sourceFixture('', { 'projects/existing/README.md': 'Existing project' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };

  function assess() {
    const refreshed = JSON.parse(cli.run(['resume', '--json'], project.root, env).stdout);
    const request = refreshed.workRequest;
    const path = join(remote.support.root, 'assessment.json');
    writeFileSync(path, JSON.stringify({ format: 'repo-standards/assessment/v1', run: request.run, selection: request.selection, snapshot: request.snapshot,
      declarations: [{ id: 'documentation', status: 'satisfied', explanation: 'Every maintained project is documented.', changedPaths: [], evidence: ['Reviewed every file under projects.'] }] }));
    return cli.run(['resume', '--assessment', path, '--json'], project.root, env);
  }

  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const initialStart = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env);
  assert.equal(initialStart.status, 1);
  assert.equal(JSON.parse(initialStart.stdout).phase, 'contextual');
  const firstCompletion = assess();
  assert.equal(firstCompletion.status, 0, firstCompletion.stdout + firstCompletion.stderr);
  const first = JSON.parse(firstCompletion.stdout);
  assert.equal(first.operations.at(-1).result.status, 'passed');
  commit(project.root);

  mkdirSync(join(project.root, 'projects/new-service'));
  writeFileSync(join(project.root, 'projects/new-service/README.md'), 'New maintained project');
  commit(project.root);
  const previousState = readFileSync(join(project.root, '.repo-standards/state.json'));
  const inspected = JSON.parse(cli.run(['inspect', '--readopt', '--json'], project.root, env).stdout);
  const secondStart = cli.run(['start', '--readopt', '--confirm', inspected.identity, '--json'], project.root, env);
  assert.equal(secondStart.status, 1);
  const incomplete = JSON.parse(secondStart.stdout);
  assert.equal(incomplete.phase, 'contextual');
  assert.equal(incomplete.previousComplete.lastComplete.run, first.id);
  assert.deepEqual(readFileSync(join(project.root, '.repo-standards/state.json')), previousState);
  assert.equal(JSON.parse(cli.run(['status', '--json'], project.root, env).stdout).lastComplete.run, first.id);

  const secondCompletion = assess();
  assert.equal(secondCompletion.status, 0, secondCompletion.stdout + secondCompletion.stderr);
  const second = JSON.parse(secondCompletion.stdout);
  assert.equal(second.operations.at(-1).result.status, 'passed');
  assert.notEqual(second.id, first.id);
});

test('explicit re-adoption leaves retained v2 selections for the later discovery lifecycle', async t => {
  const remote = remoteFixture(source.replace('repo-standards/v1', 'repo-standards/v2'), { 'agents.md': 'Pinned standards' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };

  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const adopted = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env);
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
  commit(project.root);

  const inspected = JSON.parse(cli.run(['inspect', '--readopt', '--json'], project.root, env).stdout);
  assert.ok(inspected.start.blockers.some((blocker: { code: string }) => blocker.code === 'READOPTION_UNAVAILABLE'));
  const rejected = cli.run(['start', '--readopt', '--confirm', inspected.identity, '--json'], project.root, env);
  assert.equal(rejected.status, 1);
  assert.equal(JSON.parse(rejected.stdout).errors[0].code, 'START_BLOCKED');
});
