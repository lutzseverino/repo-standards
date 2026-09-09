import assert from 'node:assert/strict';
import { inc } from 'semver';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';

const cli = installCli();
const candidateVersion = inc(cli.version, 'minor')!;
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
  const runtimePaths = ['.repo-standards/runtime/package.json', '.repo-standards/runtime/package-lock.json', '.agents/skills/adopt-standards/SKILL.md'];
  const originalRuntime = runtimePaths.map(path => readFileSync(join(project.root, path), 'utf8'));
  registry.close();

  rmSync(join(remote.source.root, 'review/obsolete.txt'));
  const published = remote.addVersion('v1.1.0', v2, {
    'agents.md': 'Version two', 'review/SKILL.md': '# Review v2', 'review/current.txt': 'current',
  });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const inspectionResult = cli.run(updateArgs, project.root, env);
  assert.equal(inspectionResult.status, 0, inspectionResult.stdout + inspectionResult.stderr);
  const inspection = JSON.parse(inspectionResult.stdout);
  assert.equal(inspection.update, 'standards');
  assert.equal(inspection.selection.cli.version, cli.version);
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
  const selection = parse(readFileSync(join(project.root, '.repo-standards/selection.yaml'), 'utf8'));
  assert.equal(selection.standards.version, 'v1.1.0');
  assert.equal(selection.cli.version, cli.version);
  const state = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(state.baselines['RETIRED.md'], undefined);
  assert.equal(state.baselines['EXCLUDED.md'], undefined);
  assert.deepEqual(runtimePaths.map(path => readFileSync(join(project.root, path), 'utf8')), originalRuntime);
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
  const registry = await registryFixture(cli.root, [cli.version, candidateVersion]);
  t.after(() => { registry.close(); remote.close(); project.close(); checkout.close(); candidate.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env).status, 0);
  commit(project.root);
  const originalSelection = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout).selection;
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
  const candidateBin = join(candidate.root, 'node_modules/.bin/repo-standards');
  const runCandidate = (args: string[], cwd = project.root) => spawnSync(candidateBin, args, { cwd, env, encoding: 'utf8' });
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();

  const inspectionResult = runCandidate(['inspect', '--json']);
  assert.equal(inspectionResult.status, 0, inspectionResult.stdout + inspectionResult.stderr);
  const inspection = JSON.parse(inspectionResult.stdout);
  assert.equal(inspection.update, 'cli');
  assert.equal(inspection.retained, true);
  assert.equal(inspection.selection.cli.version, candidateVersion);
  assert.deepEqual(inspection.selection.standards, originalSelection.standards);
  assert.equal(inspection.selection.profile, originalSelection.profile);
  const oldHead = git(project.root, 'rev-parse', 'HEAD');
  const result = runCandidate(['start', '--confirm', inspection.identity, '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Pinned standards');
  assert.equal(JSON.parse(readFileSync(join(project.root, '.repo-standards/runtime/package.json'), 'utf8')).dependencies['@lutzseverino/repo-standards'], candidateVersion);
  assert.ok(readFileSync(join(project.root, '.agents/skills/adopt-standards/SKILL.md'), 'utf8').includes(`Fixture CLI ${candidateVersion}.`));
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), oldHead);
  commit(project.root);

  rmSync(checkout.root, { recursive: true });
  execFileSync('git', ['clone', '--quiet', project.root, checkout.root]);
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', '.repo-standards/runtime'], { cwd: checkout.root, env, stdio: 'pipe' });
  const restored = join(checkout.root, '.repo-standards/runtime/node_modules/.bin/repo-standards');
  assert.equal(execFileSync(restored, ['--version'], { cwd: checkout.root, encoding: 'utf8' }).trim(), candidateVersion);
  assert.ok(readFileSync(join(checkout.root, '.agents/skills/adopt-standards/SKILL.md'), 'utf8').includes(`Fixture CLI ${candidateVersion}.`));
  const status = JSON.parse(spawnSync(restored, ['status', '--json'], { cwd: checkout.root, env, encoding: 'utf8' }).stdout);
  assert.equal(status.selection.cli.version, candidateVersion);
  assert.deepEqual(status.selection.standards, originalSelection.standards);
});

test('a CLI update rejects an incompatible retained standards selection without mutation', async t => {
  const yaml = source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`).replace('>=1.0.0 <2.0.0', `>=1.0.0 <${candidateVersion}`);
  const remote = remoteFixture(yaml, { 'agents.md': 'Pinned standards' });
  const project = sourceFixture('');
  const candidate = sourceFixture('');
  const registry = await registryFixture(cli.root, [cli.version, candidateVersion]);
  t.after(() => { registry.close(); remote.close(); project.close(); candidate.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env).status, 0);
  commit(project.root);
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
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
  const abandoned = cli.run(['abandon', '--json'], project.root, env);
  assert.equal(JSON.parse(abandoned.stdout).abandoned, true);
  const afterAbandon = cli.run(['status', '--json'], project.root, env);
  assert.equal(afterAbandon.status, 0, afterAbandon.stdout + afterAbandon.stderr);
  const history = JSON.parse(afterAbandon.stdout);
  assert.equal(history.active, null);
  assert.equal(history.lastComplete.run, initial.id);
  assert.equal(history.abandoned[0].id, report.id);
  assert.equal(history.abandoned[0].outcome, 'incomplete');
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Version two');
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
  const registry = await registryFixture(cli.root, [cli.version, candidateVersion]);
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

  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
  const combined = JSON.parse(spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), updateArgs, { cwd: project.root, env, encoding: 'utf8' }).stdout);
  assert.ok(combined.start.blockers.some((blocker: { code: string }) => blocker.code === 'INDEPENDENT_UPDATE_REQUIRED'));
  assert.equal(git(project.root, 'status', '--porcelain=v1'), '');
});

test('an established selection rejects its moved current tag even without the external observation cache', async t => {
  const v1 = source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`);
  const remote = remoteFixture(v1, { 'agents.md': 'Version one' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env).status, 0);
  commit(project.root);
  const moved = remote.addVersion('v1.1.0', v1, { 'agents.md': 'Moved tag content' });
  remote.responses[`${remote.prefix}/git/ref/tags/v1.0.0`] = { body: { ref: 'refs/tags/v1.0.0', object: { type: 'commit', sha: moved.sha } } };
  remote.save();
  rmSync(join(remote.support.root, 'cache/repo-standards/tags'), { recursive: true, force: true });
  const result = cli.run(inspectionArgs, project.root, env);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'MOVED_TAG');
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Version one');
  assert.equal(git(project.root, 'status', '--porcelain=v1'), '');
});

test('whole-skill updates allow resources to change between files and directories', async t => {
  const yaml = source('v1', `    review:
      kind: skill
      name: review
      source: review`);
  const remote = remoteFixture(yaml, {
    'review/SKILL.md': '# Review', 'review/expand': 'Old file', 'review/collapse/old.txt': 'Old directory resource',
  });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  const head = git(project.root, 'rev-parse', 'HEAD');
  rmSync(join(remote.source.root, 'review/expand'));
  rmSync(join(remote.source.root, 'review/collapse'), { recursive: true });
  remote.addVersion('v1.1.0', yaml, { 'review/expand/new.txt': 'New directory resource', 'review/collapse': 'New file' });
  const args = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const inspection = JSON.parse(cli.run(args, project.root, env).stdout);
  assert.deepEqual(inspection.start.blockers, []);
  const result = cli.run(['start', ...args.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(project.root, '.agents/skills/review/expand/new.txt'), 'utf8'), 'New directory resource');
  assert.equal(readFileSync(join(project.root, '.agents/skills/review/collapse'), 'utf8'), 'New file');
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
});

async function pendingUpdate(t: TestContext, kind: 'standards' | 'cli' = 'standards') {
  const yaml = source('v1', `    review:
      kind: skill
      name: review
      source: review`);
  const remote = remoteFixture(yaml, { 'review/SKILL.md': '# Review v1', 'review/obsolete.txt': 'Old resource' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root, kind === 'cli' ? [cli.version, candidateVersion] : [cli.version]);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const adopted = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env);
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
  commit(project.root);
  const previous = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  let run = (args: string[], environment: NodeJS.ProcessEnv = env) => cli.run(args, project.root, environment);
  let args: string[];
  if (kind === 'standards') {
    rmSync(join(remote.source.root, 'review/obsolete.txt'));
    remote.addVersion('v1.1.0', yaml, { 'review/SKILL.md': '# Review v2', 'review/current.txt': 'New resource' });
    args = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  } else {
    const candidate = sourceFixture('');
    t.after(() => candidate.close());
    execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
    run = (args, environment = env) => spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), args, { cwd: project.root, env: environment, encoding: 'utf8' });
    for (const key of Object.keys(remote.responses)) delete remote.responses[key];
    remote.save();
    args = ['inspect', '--json'];
  }
  const inspection = JSON.parse(run(args).stdout);
  return { remote, project, env, previous, head: git(project.root, 'rev-parse', 'HEAD'),
    startArgs: ['start', ...args.slice(1), '--confirm', inspection.identity],
    run };
}

test('a standards update resumes interrupted whole-skill installation while retaining its runtime', async t => {
  const f = await pendingUpdate(t);
  const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/.agents/skills/review/SKILL.md')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const interrupted = JSON.parse(f.run(['status', '--json']).stdout);
  assert.equal(interrupted.lastComplete.run, f.previous.lastComplete.run);
  const result = f.run(['resume', '--retry', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  assert.equal(readFileSync(join(f.project.root, '.agents/skills/review/current.txt'), 'utf8'), 'New resource');
  assert.equal(existsSync(join(f.project.root, '.agents/skills/review/obsolete.txt')), false);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
});

test('an update retries interrupted completion while preserving previous last-complete evidence', async t => {
  for (const kind of ['standards', 'cli'] as const) for (const name of ['lock.json', 'state.json']) await t.test(`${kind}: ${name}`, async t => {
    const f = await pendingUpdate(t, kind);
    const env = filesystemFault(f.remote.support.root, f.env, 'completion', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/.repo-standards/${name}')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
    assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
    const status = JSON.parse(f.run(['status', '--json']).stdout);
    assert.equal(status.lastComplete.run, f.previous.lastComplete.run);
    assert.equal(status.active.phase, 'completion');
    const result = f.run(['resume', '--retry', '--json']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const completed = JSON.parse(f.run(['status', '--json']).stdout);
    assert.equal(completed.lastComplete.run, status.active.id);
    assert.equal(completed.active, null);
    assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
  });
});

test('a standards update rejects added retained inputs before discarding any material', async t => {
  const f = await pendingUpdate(t);
  const added = join(f.project.root, '.repo-standards/inputs/source/extra.txt');
  writeFileSync(added, 'Preserve this added material');
  commit(f.project.root);
  const args = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const inspection = JSON.parse(f.run(args).stdout);
  assert.ok(inspection.start.blockers.some((blocker: { code: string }) => blocker.code === 'STATE_INTEGRITY'));
  const result = f.run(['start', ...args.slice(1), '--confirm', inspection.identity]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'START_BLOCKED');
  assert.equal(readFileSync(added, 'utf8'), 'Preserve this added material');
  assert.equal(git(f.project.root, 'status', '--porcelain=v1'), '');
});

test('both update inspections reject unexpected durable product files before creating a run', async t => {
  for (const kind of ['standards', 'cli'] as const) await t.test(kind, async t => {
    const f = await pendingUpdate(t, kind);
    const args = ['inspect', ...f.startArgs.slice(1, -2)];
    for (const path of ['.repo-standards/extra.txt', '.repo-standards/runtime/extra.txt', '.repo-standards/other/cache/extra.txt', '.repo-standards/other/local/extra.txt', '.repo-standards/other/runtime/node_modules/extra.txt']) {
      mkdirSync(dirname(join(f.project.root, path)), { recursive: true });
      writeFileSync(join(f.project.root, path), 'Preserve this unexpected file');
      commit(f.project.root);
      const result = f.run(args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const inspection = JSON.parse(result.stdout);
      assert.equal(inspection.start.eligible, false, path);
      assert.ok(inspection.start.blockers.some((blocker: { code: string }) => blocker.code === 'STATE_INTEGRITY'));
      const rejected = f.run(['start', ...args.slice(1), '--confirm', inspection.identity]);
      assert.equal(rejected.status, 1);
      assert.equal(JSON.parse(rejected.stdout).errors[0].code, 'START_BLOCKED');
      const status = JSON.parse(f.run(['status', '--json']).stdout);
      assert.equal(status.active, null);
      assert.equal(status.lastComplete.run, f.previous.lastComplete.run);
      assert.equal(git(f.project.root, 'status', '--porcelain=v1'), '');
      rmSync(join(f.project.root, path));
      commit(f.project.root);
    }
  });
});

test('an update rejects a committed file at the excluded local directory before creating a run', async t => {
  const f = await pendingUpdate(t);
  const local = join(f.project.root, '.repo-standards/local');
  rmSync(local, { recursive: true, force: true });
  writeFileSync(local, 'Preserve this file');
  commit(f.project.root);
  const args = ['inspect', ...f.startArgs.slice(1, -2)];
  const inspection = JSON.parse(f.run(args).stdout);
  const rejected = f.run(['start', ...args.slice(1), '--confirm', inspection.identity]);
  const status = JSON.parse(f.run(['status', '--json']).stdout);
  assert.equal(inspection.start.eligible, false);
  assert.equal(JSON.parse(rejected.stdout).errors[0].code, 'START_BLOCKED');
  assert.equal(status.active, null);
  assert.equal(status.lastComplete.run, f.previous.lastComplete.run);
  assert.equal(readFileSync(local, 'utf8'), 'Preserve this file');
  assert.equal(git(f.project.root, 'status', '--porcelain=v1'), '');
});

test('both updates validate excluded directory roots and reject changed boundaries before creating a run', async t => {
  for (const kind of ['standards', 'cli'] as const) await t.test(kind, async t => {
    const f = await pendingUpdate(t, kind);
    const args = ['inspect', ...f.startArgs.slice(1, -2)];
    const paths = ['.repo-standards/local', '.repo-standards/cache', '.repo-standards/runtime/node_modules'];
    // Ignore the entries themselves, including files and links, so Git status
    // cannot supply the freshness or safety signal under test.
    writeFileSync(join(f.project.root, '.git/info/exclude'), paths.join('\n') + '\n');
    for (const path of paths) {
      const target = join(f.project.root, path);
      const saved = join(f.remote.support.root, 'saved-directory');
      const hadDirectory = existsSync(target);
      if (hadDirectory) renameSync(target, saved);
      const before = JSON.parse(f.run(args).stdout);
      assert.equal(before.start.eligible, true, path);
      for (const type of ['file', 'directory-link', 'dangling-link', 'fifo']) await t.test(`${path}: ${type}`, () => {
        if (type === 'file') writeFileSync(target, 'Preserve this file');
        else if (type === 'fifo') execFileSync('mkfifo', [target]);
        else symlinkSync(type === 'directory-link' ? f.remote.support.root : join(f.remote.support.root, 'missing'), target);
        try {
          const result = f.run(args);
          assert.equal(result.status, 0, result.stdout + result.stderr);
          const inspection = JSON.parse(result.stdout);
          assert.equal(inspection.start.eligible, false);
          assert.ok(inspection.start.blockers.some((blocker: { code: string }) => blocker.code === (type === 'file' ? 'TARGET_TYPE' : 'UNSAFE_TARGET')));
          assert.notEqual(inspection.identity, before.identity);
          const stale = f.run(['start', ...args.slice(1), '--confirm', before.identity]);
          assert.equal(JSON.parse(stale.stdout).errors[0].code, 'STALE_INSPECTION');
          const rejected = f.run(['start', ...args.slice(1), '--confirm', inspection.identity]);
          assert.equal(JSON.parse(rejected.stdout).errors[0].code, 'START_BLOCKED');
          if (type === 'file') {
            assert.equal(readFileSync(target, 'utf8'), 'Preserve this file');
            writeFileSync(target, 'Changed file bytes');
            assert.notEqual(JSON.parse(f.run(args).stdout).identity, inspection.identity);
          } else if (type === 'fifo') assert.equal(lstatSync(target).isFIFO(), true);
          else assert.equal(readlinkSync(target), type === 'directory-link' ? f.remote.support.root : join(f.remote.support.root, 'missing'));
          const status = JSON.parse(f.run(['status', '--json']).stdout);
          assert.equal(status.active, null);
          assert.equal(status.lastComplete.run, f.previous.lastComplete.run);
          assert.equal(git(f.project.root, 'status', '--porcelain=v1'), '');
          assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
        } finally { unlinkSync(target); }
      });
      if (hadDirectory) renameSync(saved, target);
    }
  });
});

test('both updates allow absent excluded directories and ignore safe generated descendants', async t => {
  for (const kind of ['standards', 'cli'] as const) await t.test(kind, async t => {
    const f = await pendingUpdate(t, kind);
    const args = ['inspect', ...f.startArgs.slice(1, -2)];
    const before = JSON.parse(f.run(args).stdout);
    const paths = ['.repo-standards/local', '.repo-standards/cache', '.repo-standards/runtime/node_modules'];
    for (const path of paths) rmSync(join(f.project.root, path), { recursive: true, force: true });
    const absent = JSON.parse(f.run(args).stdout);
    assert.equal(absent.start.eligible, true);
    assert.equal(absent.identity, before.identity);
    for (const path of paths) {
      const target = join(f.project.root, path);
      mkdirSync(target);
      writeFileSync(join(target, 'noise'), 'Generated bytes');
      symlinkSync('missing-generated-target', join(target, 'generated-link'));
    }
    const generated = JSON.parse(f.run(args).stdout);
    assert.equal(generated.start.eligible, true);
    assert.equal(generated.identity, before.identity);
    for (const path of paths) rmSync(join(f.project.root, path), { recursive: true });
    const result = f.run(f.startArgs);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).outcome, 'complete');
    assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
  });
});

test('updates preserve incomplete work when excluded roots become invalid during installation or verification', async t => {
  for (const kind of ['standards', 'cli'] as const) for (const phase of ['installation', 'verification']) {
    for (const path of ['.repo-standards/local', '.repo-standards/cache', '.repo-standards/runtime/node_modules']) await t.test(`${kind}: ${phase}: ${path}`, async t => {
      const f = await pendingUpdate(t, kind);
      const target = join(f.project.root, path);
      const saved = join(f.remote.support.root, 'saved-directory');
      const env = filesystemFault(f.remote.support.root, f.env, phase, `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  fs.renameSync = rename;
  const target = ${JSON.stringify(target)};
  if (fs.existsSync(target)) rename(target, ${JSON.stringify(saved)});
  write(target, 'Preserve invalid root');
  process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
      assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
      assert.equal(JSON.parse(f.run(['status', '--json']).stdout).active.phase, phase);
      const tracked = git(f.project.root, 'diff', '--binary');
      const rejected = f.run(['resume', '--retry', '--json']);
      assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
      assert.match(rejected.stdout, /UNSAFE_TARGET|FINAL_INTEGRITY/);
      assert.equal(readFileSync(target, 'utf8'), 'Preserve invalid root');
      assert.equal(git(f.project.root, 'diff', '--binary'), tracked);
      const status = JSON.parse(f.run(['status', '--json']).stdout);
      assert.ok(status.active);
      assert.equal(status.lastComplete.run, f.previous.lastComplete.run);
      unlinkSync(target);
      if (existsSync(saved)) renameSync(saved, target);
      const resumed = f.run(['resume', '--retry', '--json']);
      assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
      assert.equal(JSON.parse(resumed.stdout).outcome, 'complete');
      assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
    });
  }
});

test('update identities bind unexpected durable bytes while excluding local state, caches, and dependencies', async t => {
  for (const kind of ['standards', 'cli'] as const) await t.test(kind, async t => {
    const f = await pendingUpdate(t, kind);
    const args = ['inspect', ...f.startArgs.slice(1, -2)];
    const before = JSON.parse(f.run(args).stdout);
    for (const path of ['.repo-standards/local/noise.txt', '.repo-standards/cache/noise.txt', '.repo-standards/runtime/node_modules/noise.txt']) {
      mkdirSync(dirname(join(f.project.root, path)), { recursive: true });
      writeFileSync(join(f.project.root, path), 'Generated local material');
    }
    const ignored = JSON.parse(f.run(args).stdout);
    assert.equal(ignored.start.eligible, true);
    assert.equal(ignored.identity, before.identity);

    // Keep Git status identical while changing an ignored durable file, so
    // freshness must come from the product-state observation itself.
    writeFileSync(join(f.project.root, '.git/info/exclude'), '.repo-standards/runtime/extra.txt\n');
    const extra = join(f.project.root, '.repo-standards/runtime/extra.txt');
    writeFileSync(extra, 'First unexpected bytes');
    const first = JSON.parse(f.run(args).stdout);
    assert.equal(first.start.eligible, false);
    writeFileSync(extra, 'Changed unexpected bytes');
    const changed = JSON.parse(f.run(args).stdout);
    assert.notEqual(changed.identity, first.identity);
    const stale = f.run(['start', ...args.slice(1), '--confirm', first.identity]);
    assert.equal(JSON.parse(stale.stdout).errors[0].code, 'STALE_INSPECTION');
    assert.equal(JSON.parse(f.run(['status', '--json']).stdout).active, null);
    assert.equal(git(f.project.root, 'status', '--porcelain=v1'), '');
  });
});

test('both update paths run fixes, contextual assessment, and checks with only active declarations', async t => {
  for (const kind of ['standards', 'cli'] as const) await t.test(kind, async t => {
    const operation = (id: string) => ({ id, run: { executable: process.execPath, script: 'operation.mjs', resources: [], arguments: [] },
      prerequisite: { 'version-arguments': ['--version'], version: '^24' }, 'timeout-seconds': 5 });
    const declarations = {
      readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare')], checks: [operation('verify')] },
      retired: { kind: 'file', target: 'RETIRED.md', exact: 'retired.md', fixes: [operation('old-fix')], checks: [operation('old-check')] },
    };
    const manifest = (active: object) => stringify({ format: 'repo-standards/v1', name: 'contextual-updates', description: 'Update lifecycle',
      requires: { 'repo-standards': '^1' }, defaults: { declarations: active }, profiles: { work: { description: 'Work', declarations: {} } } });
    const remote = remoteFixture(manifest(declarations), {
      'guide.md': 'Explain how to use this project.', 'retired.md': 'Preserve retired content',
      'operation.mjs': `import {readFileSync, writeFileSync} from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
let status = input.operation.phase === 'fixes' ? 'unchanged' : 'passed';
if (input.operation.id === 'prepare') { writeFileSync('README.md', '# Prepared README'); status = 'changed'; }
if (input.operation.id === 'verify' && !readFileSync('README.md', 'utf8').includes('## Usage')) status = 'failed';
console.log(JSON.stringify({format: 'repo-standards/result/v1', status, message: input.operation.id}));`,
    });
    const project = sourceFixture('', { 'README.md': '# Project', 'package.json': '{"private":true}\n', 'yarn.lock': '# Project dependencies\n' });
    const candidate = sourceFixture('');
    const registry = await registryFixture(cli.root, [cli.version, candidateVersion]);
    t.after(() => { registry.close(); remote.close(); project.close(); candidate.close(); });
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    let run = (args: string[]) => cli.run(args, project.root, env);
    const assess = () => {
      writeFileSync(join(project.root, 'README.md'), '# Queue service\n## Usage\nRun the worker to process queued jobs.\n');
      const request = JSON.parse(run(['resume', '--json']).stdout).workRequest;
      const path = join(remote.support.root, 'assessment.json');
      writeFileSync(path, JSON.stringify({ format: 'repo-standards/assessment/v1', run: request.run, selection: request.selection, snapshot: request.snapshot,
        declarations: [{ id: 'readme', status: 'satisfied', explanation: 'Documented the queue worker.', changedPaths: ['README.md'], evidence: ['Usage explains how to process jobs.'] }] }));
      return run(['resume', '--assessment', path, '--json']);
    };
    const initial = JSON.parse(run(inspectionArgs).stdout);
    assert.equal(JSON.parse(run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity]).stdout).phase, 'contextual');
    const adopted = assess();
    assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
    commit(project.root);
    const previous = JSON.parse(run(['status', '--json']).stdout);
    const head = git(project.root, 'rev-parse', 'HEAD');
    let args: string[];
    if (kind === 'standards') {
      remote.addVersion('v1.1.0', manifest({ readme: declarations.readme }), {});
      args = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
    } else {
      execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
      run = args => spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), args, { cwd: project.root, env, encoding: 'utf8' });
      for (const key of Object.keys(remote.responses)) delete remote.responses[key];
      remote.save();
      args = ['inspect', '--json'];
    }
    const inspection = JSON.parse(run(args).stdout);
    const handoff = JSON.parse(run(['start', ...args.slice(1), '--confirm', inspection.identity]).stdout);
    assert.equal(handoff.phase, 'contextual');
    assert.equal(handoff.operations[0].result.status, 'changed');
    assert.equal(readFileSync(join(project.root, 'README.md'), 'utf8'), '# Prepared README');
    assert.equal(JSON.parse(run(['status', '--json']).stdout).lastComplete.run, previous.lastComplete.run);
    const result = assess();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.outcome, 'complete');
    assert.deepEqual(report.operations.map((entry: { operation: { id: string } }) => entry.operation.id),
      kind === 'standards' ? ['prepare', 'verify'] : ['prepare', 'old-fix', 'verify', 'old-check']);
    const status = JSON.parse(run(['status', '--json']).stdout);
    assert.equal(status.assessments.length, 1);
    assert.equal(status.lastComplete.run, report.id);
    if (kind === 'standards') assert.equal(status.baselines['RETIRED.md'], undefined);
    assert.equal(readFileSync(join(project.root, 'RETIRED.md'), 'utf8'), 'Preserve retired content');
    assert.equal(readFileSync(join(project.root, 'package.json'), 'utf8'), '{"private":true}\n');
    assert.equal(readFileSync(join(project.root, 'yarn.lock'), 'utf8'), '# Project dependencies\n');
    assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
  });
});

test('a whole-skill update resumes a partially written resource without keeping its temporary file', async t => {
  const f = await pendingUpdate(t);
  const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
const writeResource = fs.writeFileSync;
fs.writeFileSync = function(path, data, ...args) {
  if (String(path).includes('/.agents/skills/review/.repo-standards-')) {
    writeResource.call(this, path, Buffer.from(data).subarray(0, 4), ...args);
    process.kill(process.pid, 'SIGKILL');
  }
  return writeResource.call(this, path, data, ...args);
};
syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const result = f.run(['resume', '--retry', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(f.project.root, '.agents/skills/review/SKILL.md'), 'utf8'), '# Review v2');
  assert.equal(readFileSync(join(f.project.root, '.agents/skills/review/current.txt'), 'utf8'), 'New resource');
  assert.deepEqual(JSON.parse(f.run(['status', '--json']).stdout).skills['.agents/skills/review'], ['SKILL.md', 'current.txt']);
});

test('retry preserves a maintainer deletion of a confirmed installed skill resource', async t => {
  const f = await pendingUpdate(t);
  const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/.agents/skills/review/current.txt')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const path = join(f.project.root, '.agents/skills/review/SKILL.md');
  rmSync(path);
  const result = f.run(['resume', '--retry', '--json']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(JSON.parse(result.stdout).reason, /INSTALLATION_CHANGED/);
  assert.equal(existsSync(path), false);
  writeFileSync(path, '# Review v2');
  const reconciled = f.run(['resume', '--retry', '--json']);
  assert.equal(reconciled.status, 0, reconciled.stdout + reconciled.stderr);
});

test('a whole-skill update resumes interrupted removal of obsolete resources', async t => {
  const f = await pendingUpdate(t);
  const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
const remove = fs.rmSync;
fs.rmSync = function(path, ...args) {
  if (String(path).endsWith('/.agents/skills/review')) {
    remove.call(this, String(path) + '/obsolete.txt');
    process.kill(process.pid, 'SIGKILL');
  }
  return remove.call(this, path, ...args);
};
syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const result = f.run(['resume', '--retry', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(f.project.root, '.agents/skills/review/current.txt'), 'utf8'), 'New resource');
  assert.equal(existsSync(join(f.project.root, '.agents/skills/review/obsolete.txt')), false);
});

test('retry continues installed skill progress without deleting the candidate resources again', async t => {
  const f = await pendingUpdate(t);
  const first = filesystemFault(f.remote.support.root, f.env, 'installation', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/.agents/skills/review/current.txt')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, first).signal, 'SIGKILL');
  const retry = filesystemFault(f.remote.support.root, f.env, 'installation', `
const remove = fs.rmSync;
fs.rmSync = function(path, ...args) {
  if (String(path).endsWith('/.agents/skills/review')) {
    remove.call(this, String(path) + '/current.txt');
    process.kill(process.pid, 'SIGKILL');
  }
  return remove.call(this, path, ...args);
};
syncBuiltinESMExports();`);
  const result = f.run(['resume', '--retry', '--json'], retry);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(f.project.root, '.agents/skills/review/current.txt'), 'utf8'), 'New resource');
});
