import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { inc } from 'semver';
import { stringify } from 'yaml';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { registryFixture } from './registry-fixture.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';

const cli = installCli();
const candidateVersion = inc(cli.version, 'minor')!;
after(() => cli.close());

const reinstall = 'npm ci --ignore-scripts --prefix .repo-standards/runtime';

// A project adopted with the installed CLI, and a candidate exact CLI of
// another version installed outside it from the registry fixture.
async function fixture(t: TestContext, declarations: Record<string, unknown>, files: Record<string, string>) {
  const remote = remoteFixture(stringify({ format: 'repo-standards/v2', name: 'pin-standards', description: 'CLI pin fixture',
    requires: { 'repo-standards': '>=1.0.0' }, defaults: { declarations }, profiles: { work: { description: 'Work', declarations: {} } } }),
  files, [], 'alice/standards', true);
  const project = sourceFixture('', { 'README.md': '# Project\n' });
  const candidate = sourceFixture('');
  const registry = await registryFixture(cli.root, [cli.version, candidateVersion]);
  t.after(() => { registry.close(); remote.close(); project.close(); candidate.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
  const candidateBin = join(candidate.root, 'node_modules/.bin/repo-standards');
  return {
    project, remote, env,
    pinned: (args: string[]) => cli.run(args, project.root, env),
    candidate: (args: string[]) => spawnSync(candidateBin, args, { cwd: project.root, env, encoding: 'utf8' }),
    adopt() {
      const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
      return cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    },
  };
}

function rejected(result: ReturnType<typeof spawnSync>, pinned: string) {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  const [error] = JSON.parse(String(result.stdout)).errors;
  assert.equal(error.code, 'CLI_PIN_MISMATCH');
  assert.ok(error.message.includes(` ${pinned}`), error.message);
  assert.ok(error.message.includes(reinstall), error.message);
  return error.message as string;
}

test('status and outdated reject a CLI other than the pin, while inspect and start take it as a CLI pin change', async t => {
  const f = await fixture(t, { instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' } }, { 'agents.md': 'Instructions' });
  const adopted = f.adopt();
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
  commit(f.project.root);
  const before = snapshot(f.project.root);
  const requests = f.remote.requestLog().length;

  // A CLI other than the pin answers neither status nor outdated, makes no
  // lookup, and writes no cache.
  for (const args of [['status', '--json'], ['outdated', '--json']]) {
    const message = rejected(f.candidate(args), cli.version);
    assert.ok(message.includes(candidateVersion), message);
  }
  for (const args of [['status'], ['status', '--summary'], ['outdated']]) {
    const result = f.candidate(args);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^\[CLI_PIN_MISMATCH\] /);
    assert.ok(result.stderr.includes(reinstall), result.stderr);
  }
  assert.deepEqual(f.remote.requestLog().slice(requests), []);
  assert.equal(existsSync(join(f.project.root, '.repo-standards/cache')), false);
  assert.deepEqual(snapshot(f.project.root), before);

  // The same candidate still inspects and starts a CLI pin change.
  const inspected = f.candidate(['inspect', '--json']);
  assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
  const inspection = JSON.parse(inspected.stdout);
  assert.deepEqual(inspection.update, ['cli']);
  assert.equal(inspection.selection.cli.version, candidateVersion);
  assert.equal(inspection.start.eligible, true, JSON.stringify(inspection.start.blockers));
  const started = f.candidate(['start', '--confirm', inspection.identity, '--json']);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.equal(JSON.parse(started.stdout).outcome, 'complete');
  commit(f.project.root);

  // The candidate is now the pin, and the former CLI is the stale one.
  const status = f.candidate(['status', '--json']);
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.equal(JSON.parse(status.stdout).selection.cli.version, candidateVersion);
  const outdated = f.candidate(['outdated', '--json']);
  assert.equal(outdated.status, 0, outdated.stdout + outdated.stderr);
  assert.equal(JSON.parse(outdated.stdout).cli.pinned, candidateVersion);
  for (const args of [['status', '--json'], ['outdated', '--json']]) rejected(f.pinned(args), candidateVersion);
  assert.equal(execFileSync(join(f.project.root, '.repo-standards/runtime/node_modules/.bin/repo-standards'), ['--version'], { encoding: 'utf8' }).trim(), candidateVersion);
});

test('status, resume and abandon of an active run require the run\'s pinned CLI', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'readme.md' } }, { 'readme.md': 'Describe the project.' });
  const started = f.adopt();
  assert.equal(JSON.parse(started.stdout).phase, 'contextual', started.stdout + started.stderr);
  const head = git(f.project.root, 'rev-parse', 'HEAD');
  const before = snapshot(f.project.root);
  for (const args of [['status', '--json'], ['resume', '--json'], ['abandon', '--json']]) rejected(f.candidate(args), cli.version);
  assert.deepEqual(snapshot(f.project.root), before);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), head);
  const status = f.pinned(['status', '--json']);
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.equal(JSON.parse(status.stdout).active.phase, 'contextual');
});

test('without a recorded pin, status and outdated answer under any CLI', async t => {
  const f = await fixture(t, { instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' } }, { 'agents.md': 'Instructions' });
  const status = f.candidate(['status', '--json']);
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.equal(JSON.parse(status.stdout).selection, null);
  const outdated = f.candidate(['outdated', '--json']);
  assert.equal(outdated.status, 0, outdated.stdout + outdated.stderr);
  const report = JSON.parse(outdated.stdout);
  for (const pin of [report.cli, report.standards]) {
    assert.equal(pin.pinned, null);
    assert.equal(pin.reason.code, 'NO_SELECTION');
  }
});
