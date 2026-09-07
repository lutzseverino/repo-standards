import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';

const cli = installCli();
after(() => cli.close());
const yaml = `format: repo-standards/v1
name: exact-standards
description: Exact adoption
requires: {repo-standards: ">=1.0.0 <2.0.0"}
defaults:
  declarations:
    instructions:
      kind: file
      target: AGENTS.md
      exact: content.md
profiles:
  work:
    description: Work
    declarations: {}
`;

test('start requires explicit confirmation of an inspection before any project mutation', t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('', { 'AGENTS.md': 'Existing' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const before = snapshot(project.root);
  const result = cli.run(['start', ...inspectionArgs.slice(1)], project.root, remote.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'CONFIRMATION_REQUIRED');
  assert.deepEqual(snapshot(project.root), before);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Existing');
});

test('a fresh checkout restores the exact runtime and inspects retained standards after the source disappears', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml, { 'content.md': 'Expected', LICENSE: 'Source license' });
  const project = sourceFixture('');
  const checkout = sourceFixture('');
  t.after(() => { registry.close(); remote.close(); project.close(); checkout.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  commit(project.root);
  const tracked = git(project.root, 'ls-files');
  for (const name of ['selection.yaml', 'lock.json', 'state.json', 'runtime/package.json', 'runtime/package-lock.json']) assert.ok(tracked.includes(`.repo-standards/${name}`));
  assert.ok(!tracked.includes('node_modules/'));
  assert.ok(!tracked.includes('/local/'));
  rmSync(checkout.root, { recursive: true });
  execFileSync('git', ['clone', '--quiet', project.root, checkout.root]);
  assert.equal(existsSync(join(checkout.root, '.repo-standards/runtime/node_modules')), false);
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', '.repo-standards/runtime'], { cwd: checkout.root, env, stdio: 'pipe' });
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();
  const pinned = join(checkout.root, '.repo-standards/runtime/node_modules/.bin/repo-standards');
  assert.equal(execFileSync(pinned, ['--version'], { cwd: checkout.root, encoding: 'utf8' }).trim(), '1.0.0');
  const before = snapshot(checkout.root);
  const retained = spawnSync(pinned, ['inspect', '--json'], { cwd: checkout.root, env, encoding: 'utf8' });
  assert.equal(retained.status, 0, retained.stdout + retained.stderr);
  const report = JSON.parse(retained.stdout);
  assert.equal(report.selection.standards.commit, remote.sha);
  assert.equal(report.exact[0].action, 'match');
  assert.equal(report.retained, true);
  assert.ok(!report.start.blockers.some((b: { code: string }) => b.code === 'SYSTEM_SKILL_CONFLICT'));
  assert.deepEqual(snapshot(checkout.root), before);
});

test('confirmed exact adoption installs whole skills, claims matching files and leaves durable pins uncommitted', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml.replace('profiles:', `    review:
      kind: skill
      name: review
      source: skills/review
    employer:
      kind: file
      target: CONTRIBUTING.md
      exact: excluded.md
profiles:`).replace('    declarations: {}', '    declarations: {employer: {exclude: true}}'), {
    'content.md': 'Expected', 'skills/review/SKILL.md': '# Review\nReview the code.',
    'skills/review/resources/check.txt': 'Skill resource', 'excluded.md': 'Excluded',
    'LICENSE': 'Source license', 'unrelated.txt': 'Unrelated source material',
  });
  const project = sourceFixture('', { 'AGENTS.md': 'Expected', 'CONTRIBUTING.md': 'Employer content',
    'package.json': '{"private":true,"packageManager":"yarn@4.0.0"}\n', '.npmrc': 'registry=https://project.invalid/\n' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const head = git(project.root, 'rev-parse', 'HEAD');
  const stat = lstatSync(join(project.root, 'AGENTS.md'));
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, 'complete');
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
  assert.equal(git(project.root, 'diff', '--cached', '--name-only'), '');
  assert.equal(lstatSync(join(project.root, 'AGENTS.md')).mtimeMs, stat.mtimeMs);
  assert.equal(readFileSync(join(project.root, 'CONTRIBUTING.md'), 'utf8'), 'Employer content');
  assert.equal(readFileSync(join(project.root, '.agents/skills/review/resources/check.txt'), 'utf8'), 'Skill resource');
  assert.match(readFileSync(join(project.root, '.agents/skills/adopt-standards/SKILL.md'), 'utf8'), /name: adopt-standards/);
  const manifest = JSON.parse(readFileSync(join(project.root, '.repo-standards/runtime/package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, { '@lutzseverino/repo-standards': '1.0.0' });
  assert.equal(readFileSync(join(project.root, 'package.json'), 'utf8'), '{"private":true,"packageManager":"yarn@4.0.0"}\n');
  const state = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(state.lastComplete.inspection, inspection.identity);
  assert.equal(state.baselines['AGENTS.md'].sha256, 'ca99b7f1b14ee2c04f7aaefde89858fc947fa88de518c2e6d4b6132892175218');
  assert.deepEqual(state.skills['.agents/skills/review'], ['SKILL.md', 'resources/check.txt']);
  assert.equal(readFileSync(join(project.root, '.repo-standards/inputs/source/LICENSE'), 'utf8'), 'Source license');
  assert.equal(existsSync(join(project.root, '.repo-standards/inputs/source/unrelated.txt')), false);
  assert.equal(existsSync(join(project.root, '.repo-standards/inputs/source/excluded.md')), false);
  const status = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  assert.equal(status.selection.cli.version, '1.0.0');
  assert.equal(status.lastComplete.inspection, inspection.identity);
  assert.equal(status.evidence, 'historical');
});

test('start rejects every invalid initial project state without mutation', async t => {
  const cases: { name: string; code: string; source?: string; files?: Record<string, string>; unborn?: boolean; setup?: (root: string) => void }[] = [
    { name: 'no commit', code: 'NO_COMMIT', unborn: true },
    { name: 'dirty working tree', code: 'DIRTY_PROJECT', setup: root => writeFileSync(join(root, 'AGENTS.md'), 'Dirty') },
    { name: 'dirty index', code: 'DIRTY_PROJECT', setup: root => { writeFileSync(join(root, 'AGENTS.md'), 'Staged'); git(root, 'add', '.'); } },
    { name: 'untracked content', code: 'DIRTY_PROJECT', setup: root => writeFileSync(join(root, 'untracked'), 'Local') },
    { name: 'ignored replacement', code: 'UNTRACKED_REPLACEMENT', files: { '.gitignore': 'ignored.md\n', 'ignored.md': 'Local' }, source: yaml.replace('target: AGENTS.md', 'target: ignored.md') },
    { name: 'unsafe target', code: 'UNSAFE_TARGET', setup: root => { rmSync(join(root, 'AGENTS.md')); symlinkSync('README.md', join(root, 'AGENTS.md')); commit(root); } },
    { name: 'unsafe ancestor', code: 'UNSAFE_TARGET', source: yaml.replace('target: AGENTS.md', 'target: linked/AGENTS.md'), setup: root => { symlinkSync('folder', join(root, 'linked')); commit(root); } },
    { name: 'wrong target type', code: 'TARGET_TYPE', source: yaml.replace('target: AGENTS.md', 'target: folder') },
    { name: 'case conflict', code: 'CASE_CONFLICT', source: yaml.replace('target: AGENTS.md', 'target: agents.md') },
    { name: 'unrelated matching skill', code: 'SKILL_CONFLICT', files: { '.agents/skills/review/SKILL.md': 'Review' }, source: yaml.replace('kind: file\n      target: AGENTS.md\n      exact: content.md', 'kind: skill\n      name: review\n      source: skill') },
    { name: 'reserved system skill', code: 'SYSTEM_SKILL_CONFLICT', files: { '.agents/skills/adopt-standards/SKILL.md': 'Unrelated' } },
    { name: 'existing product state', code: 'EXISTING_ADOPTION', files: { '.repo-standards/unknown': 'Unrelated' } },
    { name: 'hidden index flags', code: 'HIDDEN_INDEX_STATE', setup: root => git(root, 'update-index', '--assume-unchanged', 'AGENTS.md') },
    { name: 'skip-worktree flags', code: 'HIDDEN_INDEX_STATE', setup: root => git(root, 'update-index', '--skip-worktree', 'AGENTS.md') },
  ];
  for (const example of cases) await t.test(example.name, st => {
    const remote = remoteFixture(example.source ?? yaml, { 'content.md': 'Expected', 'skill/SKILL.md': 'Review' });
    const project = sourceFixture('', { 'AGENTS.md': 'Original', 'README.md': 'Project', 'folder/file': 'File', ...example.files });
    st.after(() => { remote.close(); project.close(); });
    if (!example.unborn) commit(project.root);
    example.setup?.(project.root);
    const inspection = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
    assert.ok(inspection.start.blockers.some((b: { code: string }) => b.code === example.code));
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.errors[0].code, 'START_BLOCKED');
    assert.ok(report.errors[0].details.some((b: { code: string }) => b.code === example.code));
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('start rejects stale identities, HEAD, project content and profile selection', async t => {
  for (const change of ['identity', 'head', 'content', 'profile']) await t.test(change, st => {
    const remote = remoteFixture(yaml + '  other:\n    description: Other\n    declarations: {}\n', { 'content.md': 'Expected' });
    const project = sourceFixture('', { 'AGENTS.md': 'Original' });
    st.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const inspection = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
    if (change === 'head') git(project.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Changed HEAD');
    if (change === 'content') writeFileSync(join(project.root, 'AGENTS.md'), 'Changed');
    const before = snapshot(project.root);
    const args = change === 'profile' ? inspectionArgs.map(arg => arg === 'work' ? 'other' : arg) : inspectionArgs;
    const result = cli.run(['start', ...args.slice(1), '--confirm', change === 'identity' ? 'sha256:wrong' : inspection.identity], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'STALE_INSPECTION');
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('contextual declarations and author operations are rejected before mutation or prerequisite execution', async t => {
  for (const kind of ['contextual-file', 'repository', 'fixes', 'checks']) await t.test(kind, st => {
    let source = yaml;
    if (kind === 'contextual-file') source = source.replace('exact: content.md', 'guidance: content.md');
    else if (kind === 'repository') source = source.replace('kind: file\n      target: AGENTS.md\n      exact: content.md', 'kind: repository\n      guidance: content.md\n      targets: {paths: [AGENTS.md], directories: []}');
    else source = source.replace('      exact: content.md', `      exact: content.md
      ${kind}:
        - id: operation
          run: {executable: ./probe, script: operation.sh, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=1.0.0"}
          timeout-seconds: 10`);
    const remote = remoteFixture(source, { 'content.md': 'Expected', 'operation.sh': 'touch AUTHOR_RAN' });
    const project = sourceFixture('', { 'probe': '#!/bin/sh\ntouch PROBE_RAN\necho 1.0.0\n' });
    st.after(() => { remote.close(); project.close(); });
    chmodSync(join(project.root, 'probe'), 0o755);
    commit(project.root);
    const inspection = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'UNSUPPORTED_ADOPTION');
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('final integrity failures preserve work and report an incomplete locked run with no complete adoption', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  for (const mutation of ['exact bytes', 'executable bit', 'skill addition', 'retained input addition', 'retained input bytes', 'runtime manifest', 'runtime dependency', 'product addition']) await t.test(mutation, st => {
    const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
    const project = sourceFixture('');
    st.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
    const path = join(project.root, mutation === 'skill addition' ? '.agents/skills/adopt-standards/added.txt'
      : mutation === 'retained input addition' ? '.repo-standards/inputs/added.txt'
      : mutation === 'retained input bytes' ? '.repo-standards/inputs/source/content.md'
      : mutation === 'runtime manifest' ? '.repo-standards/runtime/package.json'
      : mutation === 'runtime dependency' ? '.repo-standards/runtime/node_modules/@lutzseverino/repo-standards/dist/cli.js'
      : mutation === 'product addition' ? '.repo-standards/unexpected.txt' : 'AGENTS.md');
    const fault = filesystemFault(remote.support.root, env, 'verification', mutation === 'executable bit'
      ? `fs.chmodSync(${JSON.stringify(path)}, 0o755);` : `write(${JSON.stringify(path)}, 'Unexpected');`);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, fault);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.outcome, 'incomplete');
    assert.equal(report.phase, 'verification');
    assert.match(report.reason, /FINAL_INTEGRITY/);
    assert.ok(report.changes.includes('AGENTS.md'));
    assert.ok(report.completed.includes('AGENTS.md'));
    assert.ok(report.uncertain.length > 0);
    if (['skill addition', 'retained input addition', 'product addition'].includes(mutation)) assert.ok(report.changes.includes(path.slice(project.root.length + 1)), 'Actual unexpected changes must appear in the incomplete report');
    assert.match(report.nextAction, /review|Review/);
    assert.equal(existsSync(join(project.root, '.repo-standards/state.json')), false);
    const status = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
    assert.equal(status.lastComplete, null);
    assert.equal(status.active.id, report.id);
    const before = snapshot(project.root);
    const another = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(another.status, 1);
    assert.equal(JSON.parse(another.stdout).errors[0].code, 'ACTIVE_RUN');
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('only one process can hold an active adoption run', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const args = ['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity];
  const competingResult = join(remote.support.root, 'competitor.json');
  const fault = filesystemFault(remote.support.root, env, 'runtime', `
    const result = spawnSync(${JSON.stringify(join(cli.root, 'node_modules/.bin/repo-standards'))}, ${JSON.stringify(args)}, {cwd: ${JSON.stringify(project.root)}, env: process.env, encoding: 'utf8'});
    write(${JSON.stringify(competingResult)}, JSON.stringify({status: result.status, report: JSON.parse(result.stdout)}));`);
  const result = cli.run(args, project.root, fault);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const competitor = JSON.parse(readFileSync(competingResult, 'utf8'));
  assert.equal(competitor.status, 1);
  assert.equal(competitor.report.errors[0].code, 'ACTIVE_RUN');
  assert.equal(JSON.parse(cli.run(['status', '--json'], project.root, env).stdout).active, null);
});

test('start rechecks freshness and unsafe or ignored targets after runtime acquisition before mutation', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  for (const change of ['content', 'symlink', 'ignored']) await t.test(change, st => {
    const target = change === 'ignored' ? 'ignored.md' : 'AGENTS.md';
    const remote = remoteFixture(yaml.replace('target: AGENTS.md', `target: ${target}`), { 'content.md': 'Expected' });
    const project = sourceFixture('', { 'README.md': 'Project', '.gitignore': 'ignored.md\n' });
    st.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
    const path = join(project.root, target);
    const fault = filesystemFault(remote.support.root, env, 'runtime', change === 'symlink'
      ? `fs.symlinkSync('README.md', ${JSON.stringify(path)});` : `write(${JSON.stringify(path)}, 'External change');`);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, fault);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.outcome, 'incomplete');
    assert.match(report.reason, /STALE_INSPECTION/);
    assert.deepEqual(report.changes, []);
    assert.equal(existsSync(join(project.root, '.repo-standards')), false);
    assert.equal(readFileSync(join(project.root, 'README.md'), 'utf8'), 'Project');
    assert.equal(JSON.parse(cli.run(['status', '--json'], project.root, env).stdout).active, null);
  });
});

test('unsafe targets introduced during installation are rechecked before each write', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml.replace('target: AGENTS.md', 'target: folder/AGENTS.md'), { 'content.md': 'Expected' });
  const project = sourceFixture('');
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const before = snapshot(remote.source.root);
  const fault = filesystemFault(remote.support.root, env, 'installation', `fs.symlinkSync(${JSON.stringify(remote.source.root)}, ${JSON.stringify(join(project.root, 'folder'))});`);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, fault);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(JSON.parse(result.stdout).reason, /UNSAFE_TARGET/);
  assert.deepEqual(snapshot(remote.source.root), before);
});

test('missing npm and unavailable exact runtime packages leave project content untouched', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
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
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    if (unavailable === 'npm') assert.equal(report.errors[0].code, 'NPM_REQUIRED');
    else { assert.equal(report.outcome, 'incomplete'); assert.match(report.reason, /RUNTIME_INSTALL/); }
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('exact installation preserves binary bytes and executable state and retains only the selected profile', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml + `  other:
    description: Other
    declarations:
      instructions:
        kind: file
        target: AGENTS.md
        exact: other.md
`, { 'content.md': Buffer.from([0xff, 0x00, 0x80, 0x0a]), 'other.md': 'Other profile material' }, ['content.md']);
  const project = sourceFixture('', { 'AGENTS.md': 'Old bytes' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readFileSync(join(project.root, 'AGENTS.md')), Buffer.from([0xff, 0x00, 0x80, 0x0a]));
  assert.equal(lstatSync(join(project.root, 'AGENTS.md')).mode & 0o111, 0o111);
  const state = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(state.baselines['AGENTS.md'].executable, true);
  assert.equal(existsSync(join(project.root, '.repo-standards/inputs/source/other.md')), false);
  assert.doesNotMatch(readFileSync(join(project.root, '.repo-standards/inputs/standards.yaml'), 'utf8'), /other/);
});

test('an empty exact profile remains inspectable from retained metadata', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml.replace('  declarations:\n    instructions:\n      kind: file\n      target: AGENTS.md\n      exact: content.md', '  declarations: {}'));
  const project = sourceFixture('');
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const retained = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(retained.status, 0, retained.stdout.slice(0, 2000) + retained.stderr);
  assert.deepEqual(JSON.parse(retained.stdout).exact, []);
});

test('retained inspection preserves selected source manifests and rejects altered retained or last-complete evidence', async t => {
  const registry = await registryFixture(cli.root);
  const source = yaml.replace('exact: content.md', 'exact: standards.yaml');
  const remote = remoteFixture(source);
  const project = sourceFixture('');
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), source);
  let retained = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(retained.status, 0, retained.stdout.slice(0, 2000) + retained.stderr);
  assert.equal(JSON.parse(retained.stdout).exact[0].files[0].after.content, source);
  writeFileSync(join(project.root, 'AGENTS.md'), 'Local edit after adoption');
  assert.equal(JSON.parse(cli.run(['status', '--json'], project.root, env).stdout).lastComplete.inspection, inspection.identity);
  assert.equal(JSON.parse(cli.run(['inspect', '--json'], project.root, env).stdout).exact[0].action, 'replace');
  const input = join(project.root, '.repo-standards/inputs/source/standards.yaml');
  writeFileSync(input, 'Corrupted retained content');
  const before = snapshot(project.root);
  retained = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(retained.status, 1);
  assert.equal(JSON.parse(retained.stdout).errors[0].code, 'STATE_INTEGRITY');
  assert.deepEqual(snapshot(project.root), before);
  writeFileSync(input, source);
  const statePath = join(project.root, '.repo-standards/state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.lastComplete.inspection = 'sha256:forged';
  writeFileSync(statePath, JSON.stringify(state));
  const status = cli.run(['status', '--json'], project.root, env);
  assert.equal(status.status, 1);
  assert.equal(JSON.parse(status.stdout).errors[0].code, 'STATE_INTEGRITY');
});

test('ignored adoption outputs cannot produce a complete adoption that disappears from a fresh checkout', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  for (const ignored of ['.repo-standards/', '.agents/', 'AGENTS.md']) await t.test(ignored, st => {
    const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
    const project = sourceFixture('', { '.gitignore': `${ignored}\n` });
    st.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.outcome, 'incomplete');
    assert.match(report.reason, /IGNORED_OUTPUT/);
    assert.equal(existsSync(join(project.root, '.repo-standards/state.json')), false);
  });
});

test('changes to unrelated tracked content during the final source acquisition invalidate confirmation before mutation', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('', { 'README.md': 'Project' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const loader = join(remote.support.root, 'acquisition-edit.mjs');
  writeFileSync(loader, `import { writeFileSync } from 'node:fs';
const fetch = globalThis.fetch;
let acquisitions = 0;
globalThis.fetch = async (url, options) => {
  if (String(url).includes('/git/trees/') && ++acquisitions === 2) writeFileSync(${JSON.stringify(join(project.root, 'README.md'))}, 'Changed during acquisition');
  return fetch(url, options);
};
`);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS} --import=${pathToFileURL(loader).href}` });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(JSON.parse(result.stdout).reason, /STALE_INSPECTION/);
  assert.equal(existsSync(join(project.root, '.repo-standards')), false);
  assert.equal(existsSync(join(project.root, 'AGENTS.md')), false);
});

test('incomplete status retains ignored exact files and complete author and system skill changes', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml.replace('profiles:', `    review:
      kind: skill
      name: review
      source: skill
profiles:`), { 'content.md': 'Expected', 'skill/SKILL.md': '# Review', 'skill/resources/check.txt': 'Resource' });
  const project = sourceFixture('', { '.gitignore': 'AGENTS.md\n.agents/\n' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.match(report.reason, /IGNORED_OUTPUT/);
  const expected = ['AGENTS.md', '.agents/skills/review/SKILL.md', '.agents/skills/review/resources/check.txt', '.agents/skills/adopt-standards/SKILL.md'];
  for (const path of expected) assert.ok(report.changes.includes(path), `start must report ${path}`);
  writeFileSync(join(project.root, '.agents/skills/review/resources/added.txt'), 'Added after interruption');
  const before = snapshot(project.root);
  const status = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  for (const path of [...expected, '.agents/skills/review/resources/added.txt']) assert.ok(status.active.changes.includes(path), `status must report ${path}`);
  assert.deepEqual(snapshot(project.root), before);
  rmSync(join(project.root, 'AGENTS.md'));
  const reconciled = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  assert.ok(!reconciled.active.changes.includes('AGENTS.md'), 'status must observe reconciliation rather than repeat stale path names');
});

test('runtime acquisition reuses a populated external npm cache with the registry unavailable', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  const support = sourceFixture('');
  t.after(() => { registry.close(); remote.close(); project.close(); support.close(); });
  commit(project.root);
  const cache = join(support.root, 'npm-cache');
  const env = { ...remote.env, ...registry.env, npm_config_cache: cache };
  execFileSync('npm', ['install', '--prefix', support.root, '--ignore-scripts', '--no-audit', '--no-fund', '@lutzseverino/repo-standards@1.0.0'], { cwd: support.root, env, stdio: 'pipe' });
  registry.close();
  const offline = { ...env, npm_config_offline: 'true' };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, offline).stdout);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, offline);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
});

test('runtime cache configuration cannot write inside the adopting project through direct or linked paths', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('', { '.gitignore': 'npm-cache/\n' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  const alias = join(remote.support.root, 'project-alias');
  symlinkSync(project.root, alias);
  for (const cache of [join(project.root, 'npm-cache'), join(alias, 'npm-cache')]) {
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, { ...remote.env, npm_config_cache: cache });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(JSON.parse(result.stdout).reason, /UNSAFE_CACHE/);
    assert.deepEqual(snapshot(project.root), before);
  }
});

test('a final report persistence failure retains incomplete evidence and recovery guidance', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const loader = join(remote.support.root, 'report-failure.mjs');
  writeFileSync(loader, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync;
let failed = false;
fs.writeFileSync = function(path, data, ...args) {
  let report;
  try { report = JSON.parse(String(data)); } catch {}
  if (!failed && String(path).includes('/.repo-standards/local/') && report?.format === 'repo-standards/run/v1' && report.outcome === 'complete') {
    failed = true;
    throw Object.assign(new Error('No space for final run report'), {code: 'ENOSPC'});
  }
  return write.call(this, path, data, ...args);
};
syncBuiltinESMExports();
`);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS} --import=${pathToFileURL(loader).href}` });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, 'incomplete');
  assert.equal(report.phase, 'completion');
  assert.ok(report.uncertain.length > 0);
  assert.match(report.nextAction, /incomplete adoption/);
  assert.equal(existsSync(join(project.root, '.repo-standards/state.json')), false);
  assert.equal(existsSync(join(project.root, '.repo-standards/local/incomplete-state.json')), true);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Expected');
  const status = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  assert.equal(status.lastComplete, null);
  assert.equal(status.active.outcome, 'incomplete');
});

test('npm cache child symlinks cannot redirect acquisition content or logs into the project', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  for (const child of ['_logs', '_cacache', '_cacache/index-v5/aa']) await t.test(child, () => {
    const cache = join(remote.support.root, child.replaceAll('/', '-') + '-cache');
    mkdirSync(join(cache, child, '..'), { recursive: true });
    symlinkSync(project.root, join(cache, child));
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, { ...remote.env, npm_config_cache: cache, npm_config_offline: 'true' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(JSON.parse(result.stdout).reason, child === '_logs' ? /RUNTIME_INSTALL/ : /UNSAFE_CACHE/);
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('a failed initial ignore-file write preserves the run without exposing local reports to Git', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const loader = join(remote.support.root, 'ignore-failure.mjs');
  writeFileSync(loader, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync;
let failed = false;
fs.writeFileSync = function(path, data, ...args) {
  if (!failed && String(path).includes('/.repo-standards/') && String(data).startsWith('/runtime/node_modules/')) {
    failed = true;
    throw Object.assign(new Error('No space for ignore rules'), {code: 'ENOSPC'});
  }
  return write.call(this, path, data, ...args);
};
syncBuiltinESMExports();
`);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS} --import=${pathToFileURL(loader).href}` });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, 'incomplete');
  assert.equal(existsSync(join(project.root, '.repo-standards/local/run.json')), false);
  assert.equal(JSON.parse(cli.run(['status', '--json'], project.root, env).stdout).active.id, report.id);
});

test('status recovers ignored installed targets after the adoption process is interrupted', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('', { '.gitignore': 'AGENTS.md\n.agents/\n' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const fault = filesystemFault(remote.support.root, { ...env, TMPDIR: remote.support.root }, 'verification', 'process.kill(process.pid, "SIGKILL");');
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, fault);
  assert.equal(result.signal, 'SIGKILL');
  const before = snapshot(project.root);
  const status = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  assert.equal(status.lastComplete, null);
  assert.equal(status.active.outcome, 'incomplete');
  for (const path of ['AGENTS.md', '.agents/skills/adopt-standards/SKILL.md']) assert.ok(status.active.changes.includes(path));
  assert.deepEqual(snapshot(project.root), before);
});
