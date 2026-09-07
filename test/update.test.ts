import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

const source = (version: string, declarations: string) => `format: repo-standards/v1
name: update-standards
description: Update fixture ${version}
requires: {repo-standards: ">=1.0.0 <2.0.0"}
defaults:
  declarations:
${declarations}
profiles:
  work:
    description: Work
    declarations: {}
`;

test('a confirmed standards update advances only the standards pin, replaces whole owned skills, and preserves retired content', async t => {
  const v1 = source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    review:
      kind: skill
      name: review
      source: review
    retired:
      kind: file
      target: RETIRED.md
      exact: retired.md
    excluded:
      kind: file
      target: EXCLUDED.md
      exact: excluded.md`);
  const v2 = source('v2', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    review:
      kind: skill
      name: review
      source: review
    excluded:
      kind: file
      target: EXCLUDED.md
      exact: excluded.md`).replace('    declarations: {}', '    declarations: {excluded: {exclude: true}}');
  const remote = remoteFixture(v1, {
    'agents.md': 'Version one', 'review/SKILL.md': '# Review v1',
    'review/obsolete.txt': 'obsolete', 'retired.md': 'Keep retired content', 'excluded.md': 'Keep excluded content',
  });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const initial = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env);
  assert.equal(initial.status, 0, initial.stdout + initial.stderr);
  commit(project.root);
  const oldHead = git(project.root, 'rev-parse', 'HEAD');

  rmSync(join(remote.source.root, 'review/obsolete.txt'));
  const published = remote.addVersion('v1.1.0', v2, {
    'agents.md': 'Version two', 'review/SKILL.md': '# Review v2', 'review/current.txt': 'current',
  });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const inspectionResult = cli.run(updateArgs, project.root, env);
  assert.equal(inspectionResult.status, 0, inspectionResult.stdout + inspectionResult.stderr);
  const inspection = JSON.parse(inspectionResult.stdout);
  assert.equal(inspection.update, 'standards');
  assert.equal(inspection.selection.cli.version, '1.0.0');
  assert.equal(inspection.selection.standards.commit, published.sha);
  assert.deepEqual(inspection.retired.map((entry: { id: string }) => entry.id), ['excluded', 'retired']);

  const result = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Version two');
  assert.equal(readFileSync(join(project.root, '.agents/skills/review/current.txt'), 'utf8'), 'current');
  assert.equal(existsSync(join(project.root, '.agents/skills/review/obsolete.txt')), false);
  assert.equal(readFileSync(join(project.root, 'RETIRED.md'), 'utf8'), 'Keep retired content');
  assert.equal(readFileSync(join(project.root, 'EXCLUDED.md'), 'utf8'), 'Keep excluded content');
  const selection = readFileSync(join(project.root, '.repo-standards/selection.yaml'), 'utf8');
  assert.match(selection, /version: v1\.1\.0/);
  assert.match(selection, /version: 1\.0\.0/);
  const state = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(state.baselines['RETIRED.md'], undefined);
  assert.equal(state.baselines['EXCLUDED.md'], undefined);
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), oldHead);
  assert.notEqual(git(project.root, 'status', '--porcelain=v1'), '');
});

test('every committed edit to installed exact baselines blocks the entire standards update before mutation', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const declarations = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    review:
      kind: skill
      name: review
      source: review`;
  for (const [name, mutate] of [
    ['changed bytes', (root: string) => writeFileSync(join(root, 'AGENTS.md'), 'Maintainer edit')],
    ['changed executable state', (root: string) => chmodSync(join(root, 'AGENTS.md'), 0o755)],
    ['added skill resource', (root: string) => writeFileSync(join(root, '.agents/skills/review/added.txt'), 'Maintainer resource')],
    ['removed skill resource', (root: string) => rmSync(join(root, '.agents/skills/review/resource.txt'))],
    ['changed skill resource', (root: string) => writeFileSync(join(root, '.agents/skills/review/resource.txt'), 'Maintainer edit')],
  ] as const) await t.test(name, () => {
    const remote = remoteFixture(source('v1', declarations), {
      'agents.md': 'Version one', 'review/SKILL.md': '# Review', 'review/resource.txt': 'Owned resource',
    });
    const project = sourceFixture('');
    t.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
    assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env).status, 0);
    commit(project.root);
    mutate(project.root);
    commit(project.root);
    remote.addVersion('v1.1.0', source('v2', declarations), {
      'agents.md': 'Version two', 'review/SKILL.md': '# Review v2', 'review/resource.txt': 'New resource',
    });
    const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
    const inspection = JSON.parse(cli.run(updateArgs, project.root, env).stdout);
    assert.ok(inspection.start.blockers.some((blocker: { code: string }) => blocker.code === 'INSTALLED_CONTENT_EDITED'), JSON.stringify(inspection.start.blockers));
    const before = git(project.root, 'status', '--porcelain=v1');
    const rejected = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(rejected.status, 1);
    assert.equal(JSON.parse(rejected.stdout).errors[0].code, 'START_BLOCKED');
    assert.equal(git(project.root, 'status', '--porcelain=v1'), before);
  });
});

test('a candidate CLI updates only the exact runtime pin from retained standards and restores without the source', async t => {
  const remote = remoteFixture(source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`), { 'agents.md': 'Pinned standards' });
  const project = sourceFixture('');
  const checkout = sourceFixture('');
  const candidate = sourceFixture('');
  const registry = await registryFixture(cli.root, ['1.0.0', '1.1.0']);
  t.after(() => { registry.close(); remote.close(); project.close(); checkout.close(); candidate.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env).status, 0);
  commit(project.root);
  const originalSelection = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout).selection;
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', '@lutzseverino/repo-standards@1.1.0'], { cwd: candidate.root, env, stdio: 'pipe' });
  const candidateBin = join(candidate.root, 'node_modules/.bin/repo-standards');
  const runCandidate = (args: string[], cwd = project.root) => spawnSync(candidateBin, args, { cwd, env, encoding: 'utf8' });
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();

  const inspectionResult = runCandidate(['inspect', '--json']);
  assert.equal(inspectionResult.status, 0, inspectionResult.stdout + inspectionResult.stderr);
  const inspection = JSON.parse(inspectionResult.stdout);
  assert.equal(inspection.update, 'cli');
  assert.equal(inspection.retained, true);
  assert.equal(inspection.selection.cli.version, '1.1.0');
  assert.deepEqual(inspection.selection.standards, originalSelection.standards);
  assert.equal(inspection.selection.profile, originalSelection.profile);
  const oldHead = git(project.root, 'rev-parse', 'HEAD');
  const result = runCandidate(['start', '--confirm', inspection.identity, '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Pinned standards');
  assert.match(readFileSync(join(project.root, '.repo-standards/runtime/package.json'), 'utf8'), /"1\.1\.0"/);
  assert.match(readFileSync(join(project.root, '.agents/skills/adopt-standards/SKILL.md'), 'utf8'), /Fixture CLI 1\.1\.0/);
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), oldHead);
  commit(project.root);

  rmSync(checkout.root, { recursive: true });
  execFileSync('git', ['clone', '--quiet', project.root, checkout.root]);
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', '.repo-standards/runtime'], { cwd: checkout.root, env, stdio: 'pipe' });
  const restored = join(checkout.root, '.repo-standards/runtime/node_modules/.bin/repo-standards');
  assert.equal(execFileSync(restored, ['--version'], { cwd: checkout.root, encoding: 'utf8' }).trim(), '1.1.0');
  assert.match(readFileSync(join(checkout.root, '.agents/skills/adopt-standards/SKILL.md'), 'utf8'), /Fixture CLI 1\.1\.0/);
  const status = JSON.parse(spawnSync(restored, ['status', '--json'], { cwd: checkout.root, env, encoding: 'utf8' }).stdout);
  assert.equal(status.selection.cli.version, '1.1.0');
  assert.deepEqual(status.selection.standards, originalSelection.standards);
});

test('a CLI update rejects an incompatible retained standards selection without mutation', async t => {
  const yaml = source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`).replace('>=1.0.0 <2.0.0', '>=1.0.0 <1.1.0');
  const remote = remoteFixture(yaml, { 'agents.md': 'Pinned standards' });
  const project = sourceFixture('');
  const candidate = sourceFixture('');
  const registry = await registryFixture(cli.root, ['1.0.0', '1.1.0']);
  t.after(() => { registry.close(); remote.close(); project.close(); candidate.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env).status, 0);
  commit(project.root);
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', '@lutzseverino/repo-standards@1.1.0'], { cwd: candidate.root, env, stdio: 'pipe' });
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();
  const before = git(project.root, 'status', '--porcelain=v1');
  const result = spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), ['inspect', '--json'], { cwd: project.root, env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stdout).errors[0];
  assert.equal(error.code, 'INVALID_STANDARDS');
  assert.ok(error.details.some((detail: { code: string }) => detail.code === 'INCOMPATIBLE_CLI'));
  assert.equal(git(project.root, 'status', '--porcelain=v1'), before);
});

test('an update failure preserves actual work and the previous last-complete evidence', async t => {
  const v1 = source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`);
  const v2 = source('v2', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
      checks:
        - id: verify
          run: {executable: ${JSON.stringify(process.execPath)}, script: check.mjs, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=24 <25"}
          timeout-seconds: 5`);
  const remote = remoteFixture(v1, { 'agents.md': 'Version one' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const initial = JSON.parse(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env).stdout);
  commit(project.root);
  remote.addVersion('v1.1.0', v2, { 'agents.md': 'Version two', 'check.mjs': `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'failed',message:'Not ready'}));` });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const inspection = JSON.parse(cli.run(updateArgs, project.root, env).stdout);
  const result = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, 'incomplete');
  assert.match(report.reason, /CHECKS_FAILED/);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Version two');
  assert.ok(report.changes.includes('AGENTS.md'));
  const state = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(state.lastComplete.run, initial.id);
  const status = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  assert.equal(status.active.id, report.id);
  assert.equal(status.lastComplete.run, initial.id);
  assert.equal(status.selection.standards.version, 'v1.1.0');
});

test('update inspection rejects source or profile switching and changing both pins together', async t => {
  const v1 = source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`);
  const remote = remoteFixture(v1, { 'agents.md': 'Version one' });
  const other = remoteFixture(v1, { 'agents.md': 'Other source' }, [], 'bob/standards');
  const project = sourceFixture('');
  const candidate = sourceFixture('');
  const registry = await registryFixture(cli.root, ['1.0.0', '1.1.0']);
  t.after(() => { registry.close(); remote.close(); other.close(); project.close(); candidate.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env).status, 0);
  commit(project.root);
  const v2 = v1.replace('description: Work\n    declarations: {}', 'description: Work\n    declarations: {}\n  other:\n    description: Other\n    declarations: {}');
  remote.addVersion('v1.1.0', v2, { 'agents.md': 'Version two' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const switchedProfile = JSON.parse(cli.run(updateArgs.map(argument => argument === 'work' ? 'other' : argument), project.root, env).stdout);
  assert.ok(switchedProfile.start.blockers.some((blocker: { code: string }) => blocker.code === 'SELECTION_SWITCH'));
  const switchedSource = JSON.parse(cli.run(inspectionArgs.map(argument => argument === 'https://github.com/alice/standards' ? 'https://github.com/bob/standards' : argument), project.root, { ...other.env, ...registry.env }).stdout);
  assert.ok(switchedSource.start.blockers.some((blocker: { code: string }) => blocker.code === 'SELECTION_SWITCH'));

  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', '@lutzseverino/repo-standards@1.1.0'], { cwd: candidate.root, env, stdio: 'pipe' });
  const combined = JSON.parse(spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), updateArgs, { cwd: project.root, env, encoding: 'utf8' }).stdout);
  assert.ok(combined.start.blockers.some((blocker: { code: string }) => blocker.code === 'INDEPENDENT_UPDATE_REQUIRED'));
  assert.equal(git(project.root, 'status', '--porcelain=v1'), '');
});
