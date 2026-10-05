import type { ErrorReport, Inspection, Run } from './json-reports.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { directoryFixture, installCli, snapshot } from './installed-cli.ts';
import { inspectionArgs, manifest, startArgs } from './remote-fixture.ts';
import { adoptionFixture } from './adoption-fixture.ts';

// A start acquires the exact CLI runtime into the project with npm, through a
// cache that stays outside the project.
const cli = installCli();
after(() => cli.close());
const yaml = manifest({ instructions: { kind: 'file', target: 'AGENTS.md', exact: 'content.md' } });
const files = { 'content.md': 'Expected' };

test('missing npm and unavailable exact runtime packages leave project content untouched', async t => {
  const f = await adoptionFixture(t, cli, yaml, { files });
  const { remote, project } = f;
  const inspection = f.inspect();
  const bin = join(remote.support.root, 'bin');
  mkdirSync(bin);
  const env = { ...remote.env, PATH: `${bin}:${process.env.PATH}` };
  for (const unavailable of ['npm', 'package']) await t.test(unavailable, () => {
    writeFileSync(join(bin, 'npm'), unavailable === 'npm' ? '#!/bin/sh\nexit 1\n' : `#!/bin/sh
case "$1" in
  --version) echo 11.0.0 ;;
  config) echo '; cache = "${join(remote.support.root, 'npm-cache')}" ; overridden by cli' ;;
  *) exit 1 ;;
esac
`);
    chmodSync(join(bin, 'npm'), 0o755);
    const before = snapshot(project.root);
    const result = f.run(startArgs(inspection.identity), env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    if (unavailable === 'npm') assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, 'NPM_REQUIRED');
    else {
      const report = JSON.parse(result.stdout) as Run;
      assert.equal(report.outcome, 'incomplete');
      assert.match(report.reason, /RUNTIME_INSTALL/);
    }
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('runtime acquisition reuses a populated external npm cache with the registry unavailable', async t => {
  const f = await adoptionFixture(t, cli, yaml, { files });
  const support = directoryFixture('repo-standards-npm-');
  t.after(() => support.close());
  const env = { ...f.env, npm_config_cache: join(support.root, 'npm-cache') };
  execFileSync('npm', ['install', '--prefix', support.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${cli.version}`], { cwd: support.root, env, stdio: 'pipe' });
  f.registry.close();
  const offline = { ...env, npm_config_offline: 'true' };
  const inspection = f.json<Inspection>(inspectionArgs, offline);
  assert.equal(inspection.result.status, 0, inspection.result.stdout + inspection.result.stderr);
  const result = f.run(startArgs(inspection.report.identity), offline);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as Run).outcome, 'complete');
});

test('runtime cache configuration cannot write inside the adopting project through direct or linked paths', async t => {
  const f = await adoptionFixture(t, cli, yaml, { files, project: { '.gitignore': 'npm-cache/\n' } });
  const { remote, project } = f;
  const inspection = f.inspect();
  const alias = join(remote.support.root, 'project-alias');
  symlinkSync(project.root, alias);
  for (const cache of [join(project.root, 'npm-cache'), join(alias, 'npm-cache')]) {
    const before = snapshot(project.root);
    const result = f.run(startArgs(inspection.identity), { ...remote.env, npm_config_cache: cache });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match((JSON.parse(result.stdout) as Run).reason, /UNSAFE_CACHE/);
    assert.deepEqual(snapshot(project.root), before);
  }
});

test('npm cache child symlinks cannot redirect acquisition content or logs into the project', async t => {
  const f = await adoptionFixture(t, cli, yaml, { files });
  const { remote, project } = f;
  const inspection = f.inspect();
  for (const child of ['_logs', '_cacache', '_cacache/index-v5/aa']) await t.test(child, () => {
    const cache = join(remote.support.root, child.replaceAll('/', '-') + '-cache');
    mkdirSync(join(cache, child, '..'), { recursive: true });
    symlinkSync(project.root, join(cache, child));
    const before = snapshot(project.root);
    const result = f.run(startArgs(inspection.identity), { ...remote.env, npm_config_cache: cache, npm_config_offline: 'true' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match((JSON.parse(result.stdout) as Run).reason, child === '_logs' ? /RUNTIME_INSTALL/ : /UNSAFE_CACHE/);
    assert.deepEqual(snapshot(project.root), before);
  });
});
