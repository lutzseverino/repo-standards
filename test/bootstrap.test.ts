import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, inspectionArgs, remoteFixture } from './remote-fixture.ts';

const cli = installCli();
after(() => cli.close());

test('the standalone bootstrap invokes the explicit CLI and resolves omitted latest stable only once outside the project', (t) => {
  const remote = remoteFixture(`format: repo-standards/v1
name: test-standards
description: Bootstrap fixture
requires: {repo-standards: ">=1.0.0 <2.0.0"}
defaults: {declarations: {}}
profiles:
  work:
    description: Work
    declarations: {}
`);
  const project = sourceFixture('', { 'package.json': '{"private":true,"packageManager":"yarn@4.0.0"}\n', '.npmrc': 'registry=https://project.invalid/\n' });
  const support = sourceFixture('');
  t.after(() => { remote.close(); project.close(); support.close(); });
  commit(project.root);
  const bin = join(support.root, 'bin');
  mkdirSync(bin);
  const log = join(support.root, 'npm-calls.jsonl');
  const versions = join(support.root, 'versions.json');
  writeFileSync(versions, JSON.stringify(['1.0.0', '1.1.0', '2.0.0-beta.1']));
  const packageDirectory = join(support.root, 'package');
  cpSync(join(cli.root, 'node_modules/@lutzseverino/repo-standards'), packageDirectory, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
  for (const version of ['1.0.0', '1.1.0']) {
    writeFileSync(join(packageDirectory, 'package.json'), JSON.stringify({ ...manifest, version, scripts: { postinstall: `node -e 'require("node:fs").writeFileSync(${JSON.stringify(join(support.root, 'AUTHOR_CODE_RAN'))}, "ran")'` } }));
    execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', support.root], { cwd: packageDirectory, stdio: 'pipe' });
  }
  const realNpm = execFileSync('/bin/sh', ['-c', 'command -v npm'], { encoding: 'utf8' }).trim();
  writeFileSync(join(bin, 'npm'), `#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify({args, cwd:process.cwd()}) + '\\n');
if (args[0] === 'view') {
  console.log(readFileSync(${JSON.stringify(versions)}, 'utf8'));
  writeFileSync(${JSON.stringify(versions)}, ' ["9.0.0"] ');
} else {
  const rewritten = args.map(arg => arg.startsWith('@lutzseverino/repo-standards@') ? ${JSON.stringify(support.root)} + '/lutzseverino-repo-standards-' + arg.split('@').at(-1) + '.tgz' : arg);
  const result = spawnSync(${JSON.stringify(realNpm)}, rewritten, {stdio:'inherit'});
  process.exit(result.status ?? 1);
}
`);
  chmodSync(join(bin, 'npm'), 0o755);
  const bootstrap = join(support.root, 'repo-standards');
  const artifact = join(cli.root, 'node_modules/@lutzseverino/repo-standards/bootstrap/repo-standards');
  assert.ok(existsSync(artifact), 'The npm artifact must ship the standalone bootstrap');
  cpSync(artifact, bootstrap);
  const env = { ...remote.env, PATH: `${bin}:${process.env.PATH}` };
  const before = snapshot(project.root);
  const explicit = spawnSync(bootstrap, ['--cli-version', '1.0.0', ...inspectionArgs, '--project', relative(support.root, project.root)], { cwd: support.root, env, encoding: 'utf8' });
  assert.equal(explicit.status, 0, explicit.stderr + explicit.stdout);
  assert.equal(JSON.parse(explicit.stdout).selection.cli.version, '1.0.0');
  assert.match(explicit.stderr, /CLI 1\.0\.0/);
  let calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.filter(call => call.args[0] === 'view').length, 0);
  const latest = spawnSync(bootstrap, inspectionArgs, { cwd: project.root, env, encoding: 'utf8' });
  assert.equal(latest.status, 0, latest.stderr + latest.stdout);
  assert.equal(JSON.parse(latest.stdout).selection.cli.version, '1.1.0');
  assert.match(latest.stderr, /CLI 1\.1\.0/);
  assert.notEqual(JSON.parse(latest.stdout).identity, JSON.parse(explicit.stdout).identity);
  assert.equal(existsSync(join(support.root, 'AUTHOR_CODE_RAN')), false);
  calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.filter(call => call.args[0] === 'view').length, 1);
  for (const call of calls.filter(call => call.args[0] === 'install')) {
    assert.notEqual(call.cwd, project.root);
    assert.ok(call.args.includes('--ignore-scripts'));
    assert.ok(call.args.includes('@lutzseverino/repo-standards@1.0.0') || call.args.includes('@lutzseverino/repo-standards@1.1.0'));
  }
  assert.deepEqual(readdirSync(project.root).sort(), ['.git', '.npmrc', 'package.json', 'standards.yaml']);
  assert.equal(readFileSync(join(project.root, 'package.json'), 'utf8'), '{"private":true,"packageManager":"yarn@4.0.0"}\n');
  assert.deepEqual(snapshot(project.root), before);
});

test('bootstrap prerequisite failures give setup instructions before package acquisition', (t) => {
  const support = sourceFixture('');
  t.after(() => support.close());
  const bin = join(support.root, 'bin');
  mkdirSync(bin);
  const bootstrap = join(cli.root, 'node_modules/@lutzseverino/repo-standards/bootstrap/repo-standards');
  const run = () => spawnSync('/bin/sh', [bootstrap, ...inspectionArgs], { cwd: support.root, env: { ...process.env, PATH: bin }, encoding: 'utf8' });
  assert.match(run().stderr, /Node\.js 24 and npm are required.*https:\/\/nodejs.org/);
  writeFileSync(join(bin, 'node'), '#!/bin/sh\necho 22\n');
  chmodSync(join(bin, 'node'), 0o755);
  assert.match(run().stderr, /Node\.js 24 is required/);
  writeFileSync(join(bin, 'node'), '#!/bin/sh\necho 24\n');
  assert.match(run().stderr, /npm is required.*PATH/);
});

test('the installed inspection command checks npm without executing author prerequisite probes', (t) => {
  const project = sourceFixture('');
  t.after(() => project.close());
  const bin = join(project.root, 'bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, 'node'));
  const result = cli.run(inspectionArgs, project.root, { ...process.env, PATH: bin });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.errors[0].code, 'NPM_REQUIRED');
  assert.match(report.errors[0].message, /Node\.js 24.*PATH/);
});
