import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installCli, sourceFixture, fixtureFiles } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

test('Alice author example checks actual README headings through installed adoption', async t => {
  const files = fixtureFiles('examples/alice');
  const remote = remoteFixture(files['standards.yaml']!, files);
  const registry = await registryFixture(cli.root);
  const project = sourceFixture('', { 'README.md': '# Bob\nA delivery queue.\n', 'CONTRIBUTING.md': 'Employer review policy\n' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const head = git(project.root, 'rev-parse', 'HEAD');
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const started = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(JSON.parse(started.stdout).phase, 'contextual', started.stdout);
  const assessment = (request: { run: string; selection: string; snapshot: string }, changedPaths: string[]) => ({
    format: 'repo-standards/assessment/v1', run: request.run, selection: request.selection, snapshot: request.snapshot,
    declarations: [
      { id: 'readme', status: 'satisfied', explanation: 'Scripted protocol exercise.', changedPaths, evidence: ['README reviewed for this deterministic check exercise.'] },
      { id: 'source-layout', status: 'satisfied', explanation: 'No source changes needed in this minimal fixture.', changedPaths: [], evidence: ['The fixture has no source tree.'] },
    ],
  });
  const submission = join(remote.support.root, 'assessment.json');
  writeFileSync(submission, JSON.stringify(assessment(JSON.parse(started.stdout).workRequest, [])));
  const failed = cli.run(['resume', '--assessment', submission, '--json'], project.root, env);
  const report = JSON.parse(failed.stdout);
  assert.equal(failed.status, 1, failed.stdout);
  assert.match(report.reason, /CHECKS_FAILED/);
  assert.equal(report.operations.at(-1).result.status, 'failed');

  writeFileSync(join(project.root, 'README.md'), '# Bob\nA delivery queue.\n## Setup\nUse Node.js 24.\n## Usage\nRun the worker.\n## Development\nRun the queue tests.\n');
  const request = JSON.parse(cli.run(['resume', '--json'], project.root, env).stdout).workRequest;
  writeFileSync(submission, JSON.stringify(assessment(request, ['README.md'])));
  const completed = cli.run(['resume', '--assessment', submission, '--json'], project.root, env);
  assert.equal(completed.status, 0, completed.stdout + completed.stderr);
  assert.equal(JSON.parse(completed.stdout).operations.at(-1).result.status, 'passed');
  assert.equal(readFileSync(join(project.root, 'CONTRIBUTING.md'), 'utf8'), 'Employer review policy\n');
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
  assert.notEqual(git(project.root, 'status', '--porcelain'), '');
});

test('Mira service source retains check resources and preserves fix output on explicit retry', async t => {
  const files = fixtureFiles('examples/mira');
  const remote = remoteFixture(files['standards.yaml']!, files, [], 'mira/standards');
  const registry = await registryFixture(cli.root);
  const project = sourceFixture('', fixtureFiles('acceptance/projects/harbor'));
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const args = ['--source', 'https://github.com/mira/standards', '--standards-version', 'v1.0.0', '--profile', 'service', '--json'];
  const inspection = JSON.parse(cli.run(['inspect', ...args], project.root, env).stdout);
  const started = JSON.parse(cli.run(['start', ...args, '--confirm', inspection.identity], project.root, env).stdout);
  assert.equal(started.phase, 'contextual');
  assert.equal(started.operations[0].result.status, 'changed');
  const retry = JSON.parse(cli.run(['resume', '--retry', '--json'], project.root, env).stdout);
  assert.equal(retry.phase, 'contextual');
  assert.equal(retry.operations.at(-1).result.status, 'unchanged');
  assert.equal(readFileSync(join(project.root, 'docs/operating-status.json'), 'utf8'), '{\n  "status": "unverified"\n}\n');
  writeFileSync(join(project.root, 'docs/operations.md'), '# Harbor\n## Startup\nStart the service.\n## Health\nProbe loopback.\n## Recovery\nRestart loses in-memory state.\n');
  const request = JSON.parse(cli.run(['resume', '--json'], project.root, env).stdout).workRequest;
  const assessment = join(remote.support.root, 'assessment.json');
  writeFileSync(assessment, JSON.stringify({ format: 'repo-standards/assessment/v1',
    run: request.run, selection: request.selection, snapshot: request.snapshot,
    declarations: [{ id: 'operations-guide', status: 'satisfied', explanation: 'Scripted structural test.',
      changedPaths: ['docs/operations.md'], evidence: ['Startup, Health and Recovery sections present.'] }] }));
  const result = cli.run(['resume', '--assessment', assessment, '--json'], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).operations.at(-1).result.status, 'passed');
  const packageRoot = join(project.root, '.repo-standards/runtime/node_modules/@lutzseverino/repo-standards');
  for (const path of ['docs/authoring.md', 'docs/assessment-protocol.md', 'docs/adoption.md', 'examples/mira/standards.yaml']) {
    assert.ok(readFileSync(join(packageRoot, path), 'utf8').length);
  }
  assert.equal(readFileSync(join(project.root, '.agents/skills/adopt-standards/SKILL.md'), 'utf8'),
    readFileSync(join(packageRoot, 'skills/adopt-standards/SKILL.md'), 'utf8'));
});
