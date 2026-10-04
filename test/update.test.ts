import assert from 'node:assert/strict';
import { inc } from 'semver';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { installCli, installedTree, sha256, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';
import { committedState, rewriteCommittedState } from './committed-evidence.ts';

const cli = installCli();
const candidateVersion = inc(cli.version, 'minor')!;
after(() => cli.close());

const source = (version: string, declarations: string) => `format: repo-standards/v2
name: update-standards
description: Update fixture ${version}
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
${declarations}
profiles:
  work:
    description: Work
    declarations: {}
`;

test('a confirmed standards update advances only the standards pin, replaces whole owned skills, and removes retired and excluded content', async t => {
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
  assert.deepEqual(inspection.update, ['standards']);
  assert.equal(inspection.selection.cli.version, cli.version);
  assert.equal(inspection.selection.standards.commit, published.sha);
  assert.deepEqual(inspection.retired.map((entry: { id: string }) => entry.id), ['excluded', 'retired']);
  assert.deepEqual(inspection.removed.map(({ id, target }: { id: string; target: string }) => ({ id, target })), [
    { id: 'excluded', target: 'EXCLUDED.md' }, { id: 'retired', target: 'RETIRED.md' }]);
  assert.deepEqual(inspection.discardedEdits, []);

  const result = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Version two');
  assert.equal(readFileSync(join(project.root, '.agents/skills/review/current.txt'), 'utf8'), 'current');
  assert.equal(existsSync(join(project.root, '.agents/skills/review/obsolete.txt')), false);
  assert.equal(existsSync(join(project.root, 'RETIRED.md')), false);
  assert.equal(existsSync(join(project.root, 'EXCLUDED.md')), false);
  const selection = parse(readFileSync(join(project.root, '.repo-standards/selection.yaml'), 'utf8'));
  assert.equal(selection.standards.version, 'v1.1.0');
  assert.equal(selection.cli.version, cli.version);
  const state = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(state.baselines['RETIRED.md'], undefined);
  assert.equal(state.baselines['EXCLUDED.md'], undefined);
  assert.deepEqual(runtimePaths.map(path => readFileSync(join(project.root, path), 'utf8')), originalRuntime);
  assert.equal(existsSync(join(project.root, '.agents/skills/author-standards')), false);
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), oldHead);
  assert.notEqual(git(project.root, 'status', '--porcelain=v1'), '');
});

test('an update replaces each committed edit to installed content and lists it as a discarded edit', async t => {
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
  for (const [name, mutate, target] of [
    ['changed bytes', (root: string) => writeFileSync(join(root, 'AGENTS.md'), 'Maintainer edit'), 'AGENTS.md'],
    ['changed executable state', (root: string) => chmodSync(join(root, 'AGENTS.md'), 0o755), 'AGENTS.md'],
    ['added skill resource', (root: string) => writeFileSync(join(root, '.agents/skills/review/added.txt'), 'Maintainer resource'), '.agents/skills/review'],
    ['removed skill resource', (root: string) => rmSync(join(root, '.agents/skills/review/resource.txt')), '.agents/skills/review'],
    ['changed skill resource', (root: string) => writeFileSync(join(root, '.agents/skills/review/resource.txt'), 'Maintainer edit'), '.agents/skills/review'],
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
    assert.deepEqual(inspection.start.blockers, []);
    assert.deepEqual(inspection.discardedEdits, [target]);
    const result = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).outcome, 'complete');
    assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Version two');
    assert.equal(lstatSync(join(project.root, 'AGENTS.md')).mode & 0o111, 0);
    assert.deepEqual(installedTree(join(project.root, '.agents/skills/review')), installedTree(join(remote.source.root, 'review')));
  });
});

test('the first update of an adoption made without the update notice installs standards-updates as exact content', async t => {
  const remote = remoteFixture(source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`), { 'agents.md': 'Version one' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  // An adoption by a CLI that installed no update notice records no skill,
  // link, baseline, or lock entry for it.
  const notice = '.agents/skills/standards-updates';
  const noticeLink = '.claude/skills/standards-updates';
  rmSync(join(project.root, notice), { recursive: true });
  unlinkSync(join(project.root, noticeLink));
  const statePath = join(project.root, '.repo-standards/state.json');
  const lockPath = join(project.root, '.repo-standards/lock.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  delete state.skills[notice];
  delete state.links[noticeLink];
  for (const record of [state.baselines, lock.files]) for (const path of Object.keys(record)) if (path.startsWith(`${notice}/`)) delete record[path];
  const stateText = `${JSON.stringify(state, null, 2)}\n`;
  writeFileSync(statePath, stateText);
  lock.state.sha256 = sha256(stateText);
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  commit(project.root);

  const inspected = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
  const inspection = JSON.parse(inspected.stdout);
  assert.equal(inspection.updateClass, 'exact');
  assert.deepEqual(inspection.systemSkills, [
    { name: 'adopt-standards', target: '.agents/skills/adopt-standards', action: 'match', link: { target: '.claude/skills/adopt-standards', action: 'match' } },
    { name: 'standards-updates', target: notice, action: 'create', link: { target: noticeLink, action: 'create' } }]);
  assert.deepEqual(inspection.start.blockers, []);
  assert.deepEqual(inspection.discardedEdits, []);
  const summary = cli.run(['inspect', '--summary'], project.root, env);
  assert.equal(summary.status, 0, summary.stdout + summary.stderr);
  assert.match(summary.stdout, /^\| `standards-updates` \| `\.agents\/skills\/standards-updates` \| created \|$/m);
  assert.doesNotMatch(summary.stdout, /`adopt-standards` \|/);
  const started = cli.run(['start', '--confirm', inspection.identity, '--json'], project.root, env);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.equal(JSON.parse(started.stdout).outcome, 'complete');
  assert.deepEqual(installedTree(join(project.root, notice)), installedTree(join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills/standards-updates')));
  assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')).skills[notice], ['SKILL.md', 'agents/openai.yaml']);
  assert.deepEqual(git(project.root, 'status', '--porcelain', '--untracked-files=all', '--', '.agents', '.claude').split('\n').sort(),
    [`?? ${notice}/SKILL.md`, `?? ${notice}/agents/openai.yaml`, `?? ${noticeLink}`]);
});

test('the first update of an adoption made without skill links creates them as exact content', async t => {
  const remote = remoteFixture(source('v1', `    review:
      kind: skill
      name: review
      source: skills/review`), { 'skills/review/SKILL.md': 'Review' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  // An adoption by a CLI that installed no skill links records none.
  rmSync(join(project.root, '.claude'), { recursive: true });
  const statePath = join(project.root, '.repo-standards/state.json');
  const lockPath = join(project.root, '.repo-standards/lock.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  state.links = {};
  state.changeSet = state.changeSet.filter(({ path }: { path: string }) => !path.startsWith('.claude/'));
  const stateText = `${JSON.stringify(state, null, 2)}\n`;
  writeFileSync(statePath, stateText);
  lock.state.sha256 = sha256(stateText);
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  commit(project.root);

  const inspected = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
  const inspection = JSON.parse(inspected.stdout);
  assert.equal(inspection.updateClass, 'exact');
  assert.deepEqual(inspection.contextualChanges, []);
  assert.deepEqual(inspection.systemSkills.map(({ action, link }: { action: string; link: unknown }) => ({ action, link })), [
    { action: 'match', link: { target: '.claude/skills/adopt-standards', action: 'create' } },
    { action: 'match', link: { target: '.claude/skills/standards-updates', action: 'create' } }]);
  assert.deepEqual(inspection.exact.map(({ action, link }: { action: string; link: unknown }) => ({ action, link })), [{ action: 'match', link: { target: '.claude/skills/review', action: 'create' } }]);
  assert.deepEqual(inspection.start.blockers, []);
  assert.deepEqual(inspection.discardedEdits, []);
  const summary = cli.run(['inspect', '--summary'], project.root, env);
  assert.equal(summary.status, 0, summary.stdout + summary.stderr);
  assert.match(summary.stdout, /^Exact update: /m);
  for (const [owner, name] of [['adopt-standards', 'adopt-standards'], ['review', 'review'], ['standards-updates', 'standards-updates']]) {
    assert.match(summary.stdout, new RegExp(`^\\| \`${owner}\` \\| \`\\.claude/skills/${name}\` \\| created \\|$`, 'm'));
  }
  const started = cli.run(['start', '--confirm', inspection.identity, '--json'], project.root, env);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.equal(JSON.parse(started.stdout).outcome, 'complete');
  const links = Object.fromEntries(['adopt-standards', 'review', 'standards-updates'].map(name => [`.claude/skills/${name}`, `../../.agents/skills/${name}`]));
  for (const [path, text] of Object.entries(links)) assert.equal(readlinkSync(join(project.root, path)), text);
  const updated = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.deepEqual(Object.fromEntries(Object.entries(updated.links).sort()), links);
  assert.deepEqual(git(project.root, 'status', '--porcelain', '--untracked-files=all', '--', '.agents', '.claude').split('\n').sort(),
    Object.keys(links).map(path => `?? ${path}`));
});

test('durable state records only the skill link of a recorded skill', async t => {
  const remote = remoteFixture(source('v1', `    review:
      kind: skill
      name: review
      source: skills/review`), { 'skills/review/SKILL.md': 'Review' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  const state = committedState(project.root) as unknown as { links: Record<string, string> };
  for (const links of [{ '.claude/skills/..': '../../.agents/skills/..' }, { '.claude/skills/ghost': '../../.agents/skills/ghost' },
    { '.claude/skills/review': '../../.agents/skills/other' }, { '.claude/review': '../.agents/skills/review' }]) {
    rewriteCommittedState(project.root, { ...state, links: { ...state.links, ...links } });
    const before = snapshot(project.root);
    for (const command of ['inspect', 'status']) {
      const result = cli.run([command, '--json'], project.root, env);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).errors[0].code, 'STATE_INTEGRITY', JSON.stringify(links));
    }
    assert.deepEqual(snapshot(project.root), before);
  }
});

test('retiring a skill removes its link, and an update leaves the project its own skills', async t => {
  const review = `    review:
      kind: skill
      name: review
      source: skills/review`;
  const instructions = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`;
  const remote = remoteFixture(source('v1', `${review}\n${instructions}`), { 'skills/review/SKILL.md': 'Review', 'agents.md': 'Agents' });
  const project = sourceFixture('', { '.agents/skills/mine/SKILL.md': 'Mine', '.claude/skills/notes.md': 'Notes' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  remote.addVersion('v2.0.0', source('v2', instructions));
  const args = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v2.0.0' : argument);
  const inspection = JSON.parse(cli.run(args, project.root, env).stdout);
  assert.deepEqual(inspection.start.blockers, []);
  assert.deepEqual(inspection.removed.map(({ id, target, files }: { id: string; target: string; files: { path: string; after: unknown }[] }) => ({ id, target, files: files.map(({ path, after }) => ({ path, after })) })), [
    { id: 'review', target: '.agents/skills/review', files: [{ path: '.agents/skills/review/SKILL.md', after: { type: 'missing' } }] },
    { id: 'review', target: '.claude/skills/review', files: [{ path: '.claude/skills/review', after: { type: 'missing' } }] }]);
  assert.deepEqual(inspection.removed[1].files[0].before, { type: 'symlink', target: '../../.agents/skills/review' });
  assert.deepEqual(inspection.discardedEdits, []);
  const summary = cli.run(args.filter(argument => argument !== '--json').concat('--summary'), project.root, env).stdout;
  assert.match(summary, /^\| `review` \| `\.agents\/skills\/review\/SKILL\.md` \| deleted \|\n\| `review` \| `\.claude\/skills\/review` \| deleted \|$/m);
  const started = cli.run(['start', ...args.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.equal(existsSync(join(project.root, '.agents/skills/review')), false);
  assert.equal(lstatSync(join(project.root, '.claude/skills/review'), { throwIfNoEntry: false }), undefined);
  const state = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  assert.deepEqual(Object.keys(state.links).sort(), ['.claude/skills/adopt-standards', '.claude/skills/standards-updates']);
  assert.ok(state.changeSet.some(({ path }: { path: string }) => path === '.claude/skills/review'));
  assert.equal(lstatSync(join(project.root, '.claude/skills/mine'), { throwIfNoEntry: false }), undefined);
  assert.equal(git(project.root, 'status', '--porcelain', '--', '.agents/skills/mine', '.claude/skills/notes.md'), '');
});

test('a skill link changed after confirmation makes start stale', async t => {
  const remote = remoteFixture(source('v1', `    review:
      kind: skill
      name: review
      source: skills/review`), { 'skills/review/SKILL.md': 'Review' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  const inspection = JSON.parse(cli.run(['inspect', '--json'], project.root, env).stdout);
  assert.equal(inspection.exact[0].link.action, 'match');
  // A committed hand-made copy in the link's place is tracked and clean, so
  // only the identity can tell.
  unlinkSync(join(project.root, '.claude/skills/review'));
  mkdirSync(join(project.root, '.claude/skills/review'));
  writeFileSync(join(project.root, '.claude/skills/review/SKILL.md'), 'Review');
  commit(project.root);
  const before = snapshot(project.root);
  const started = cli.run(['start', '--confirm', inspection.identity, '--json'], project.root, env);
  assert.equal(started.status, 1, started.stdout + started.stderr);
  assert.equal(JSON.parse(started.stdout).errors[0].code, 'STALE_INSPECTION');
  assert.deepEqual(snapshot(project.root), before);
  const renewed = JSON.parse(cli.run(['inspect', '--json'], project.root, env).stdout);
  assert.deepEqual(renewed.exact[0].link, { target: '.claude/skills/review', action: 'replace' });
  assert.deepEqual(renewed.discardedEdits, ['.claude/skills/review']);
});

test('update inspections match candidate-equal content and list each discarded edit, including a retired target they remove', async t => {
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
  const retired = `
    retired:
      kind: file
      target: RETIRED.md
      exact: retired.md
    legacy:
      kind: skill
      name: legacy
      source: legacy`;
  const v1Files = { 'agents.md': 'Version one', 'review/SKILL.md': '# Review v1', 'review/resource.txt': 'Owned resource', 'retired.md': 'Retired content', 'legacy/SKILL.md': '# Legacy' };
  const v2Files = { 'agents.md': 'Version two', 'review/SKILL.md': '# Review v2' };
  const system = '.agents/skills/adopt-standards';
  const untracked = (path: string) => ({ code: 'UNTRACKED_REPLACEMENT', path });
  for (const { name, mutate, blockers = [], discarded, actions } of [
    { name: 'an edited retired exact file', mutate: (root: string) => writeFileSync(join(root, 'RETIRED.md'), 'Maintainer edit'),
      discarded: ['RETIRED.md'] },
    { name: 'an edited retired skill', mutate: (root: string) => writeFileSync(join(root, '.agents/skills/legacy/notes.md'), 'Maintainer notes'),
      discarded: ['.agents/skills/legacy'] },
    { name: 'an ignored resource in a retired skill', mutate: (root: string) => {
      writeFileSync(join(root, '.gitignore'), '/.agents/skills/legacy/local.md\n');
      writeFileSync(join(root, '.agents/skills/legacy/local.md'), 'Ignored notes');
    }, blockers: [untracked('.agents/skills/legacy/local.md')], discarded: ['.agents/skills/legacy'] },
    { name: 'an ignored retired exact file', mutate: (root: string) => {
      writeFileSync(join(root, '.gitignore'), '/RETIRED.md\n');
      git(root, 'rm', '--cached', '--quiet', 'RETIRED.md');
    }, blockers: [untracked('RETIRED.md')], discarded: [] },
    { name: 'an exact file whose bytes equal the candidate but not the baseline', mutate: (root: string) => writeFileSync(join(root, 'AGENTS.md'), 'Version two'),
      discarded: [], actions: { instructions: 'match', review: 'replace' } },
    { name: 'a skill whose bytes equal the candidate but not the baseline', mutate: (root: string) => writeFileSync(join(root, '.agents/skills/review/SKILL.md'), '# Review v2'),
      discarded: [], actions: { instructions: 'replace', review: 'match' } },
    { name: 'an edited system skill', mutate: (root: string) => writeFileSync(join(root, system, 'SKILL.md'), 'Maintainer edit'),
      discarded: [system] },
    { name: 'a removed skill file', mutate: (root: string) => rmSync(join(root, '.agents/skills/review/resource.txt')),
      discarded: ['.agents/skills/review'] },
    { name: 'a skill link replaced by a copy', mutate: (root: string) => { unlinkSync(join(root, '.claude/skills/review')); writeFileSync(join(root, '.claude/skills/review'), '# Review v1'); },
      discarded: ['.claude/skills/review'] },
    { name: 'a retired skill link replaced by a copy', mutate: (root: string) => { unlinkSync(join(root, '.claude/skills/legacy')); writeFileSync(join(root, '.claude/skills/legacy'), '# Legacy'); },
      discarded: ['.claude/skills/legacy'] },
  ]) await t.test(name, () => {
    const remote = remoteFixture(source('v1', declarations + retired), v1Files);
    const project = sourceFixture('');
    t.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
    assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env).status, 0);
    commit(project.root);
    mutate(project.root);
    commit(project.root);
    remote.addVersion('v1.1.0', source('v2', declarations), v2Files);
    const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
    const result = cli.run(updateArgs, project.root, env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const inspection = JSON.parse(result.stdout);
    assert.deepEqual(inspection.start.blockers.map(({ code, path }: { code: string; path?: string }) => ({ code, path })), blockers);
    assert.deepEqual(inspection.discardedEdits, discarded);
    assert.deepEqual(inspection.removed.map(({ id, target }: { id: string; target: string }) => ({ id, target })), [
      { id: 'legacy', target: '.agents/skills/legacy' }, { id: 'legacy', target: '.claude/skills/legacy' }, { id: 'retired', target: 'RETIRED.md' }]);
    if (actions) assert.deepEqual(Object.fromEntries(inspection.exact.map(({ id, action }: { id: string; action: string }) => [id, action])), actions);
    const started = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    if (blockers.length) {
      assert.equal(started.status, 1, started.stdout + started.stderr);
      assert.equal(JSON.parse(started.stdout).errors[0].code, 'START_BLOCKED');
      for (const { path } of blockers) assert.ok(existsSync(join(project.root, path)), path);
      return;
    }
    assert.equal(started.status, 0, started.stdout + started.stderr);
    assert.equal(JSON.parse(started.stdout).outcome, 'complete');
    assert.equal(existsSync(join(project.root, 'RETIRED.md')), false);
    assert.equal(existsSync(join(project.root, '.agents/skills/legacy')), false);
    assert.equal(lstatSync(join(project.root, '.claude/skills/legacy'), { throwIfNoEntry: false }), undefined);
    assert.equal(readlinkSync(join(project.root, '.claude/skills/review')), '../../.agents/skills/review');
    assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Version two');
    assert.equal(readFileSync(join(project.root, '.agents/skills/review/SKILL.md'), 'utf8'), '# Review v2');
    assert.deepEqual(installedTree(join(project.root, system)), installedTree(join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills/adopt-standards')));
  });
});

test('update inspections report each declared target block and discarded edit before baseline-only targets sorted by path', async t => {
  const instructions = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`;
  const remote = remoteFixture(source('v1', `${instructions}
    alpha:
      kind: file
      target: Z-RETIRED.md
      exact: z.md
    beta:
      kind: file
      target: A-RETIRED.md
      exact: a.md`), { 'agents.md': 'Version one', 'z.md': 'Retired Z', 'a.md': 'Retired A' });
  const project = sourceFixture('', { 'README.md': 'Project README' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initialInspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initialInspection.identity], project.root, env).status, 0);
  commit(project.root);
  const baselines = Object.keys(JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8')).baselines);
  assert.ok(baselines.indexOf('Z-RETIRED.md') < baselines.indexOf('A-RETIRED.md'), JSON.stringify(baselines));
  rmSync(join(project.root, 'AGENTS.md'));
  symlinkSync('README.md', join(project.root, 'AGENTS.md'));
  writeFileSync(join(project.root, 'Z-RETIRED.md'), 'Maintainer edit');
  writeFileSync(join(project.root, 'A-RETIRED.md'), 'Maintainer edit');
  commit(project.root);
  remote.addVersion('v1.1.0', source('v2', instructions), { 'agents.md': 'Version two' });
  const result = cli.run(inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument), project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const inspection = JSON.parse(result.stdout);
  assert.deepEqual(inspection.start.blockers.map(({ code, path }: { code: string; path?: string }) => ({ code, path })), [
    { code: 'UNSAFE_TARGET', path: 'AGENTS.md' },
  ]);
  assert.deepEqual(inspection.discardedEdits, ['AGENTS.md', 'A-RETIRED.md', 'Z-RETIRED.md']);
});

test('an update keeps a retired installed target that lies within contextual scope', async t => {
  const v1 = source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    policy:
      kind: file
      target: docs/policy.md
      exact: policy.md`);
  const v2 = source('v2', `    instructions:
      kind: file
      target: AGENTS.md
      guidance: agents-guide.md
    docs:
      kind: repository
      guidance: docs-guide.md
      targets: {paths: [], directories: [docs]}`);
  const remote = remoteFixture(v1, { 'agents.md': 'Pinned instructions', 'policy.md': 'Policy' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  writeFileSync(join(project.root, 'docs/policy.md'), 'Maintainer policy');
  commit(project.root);
  remote.addVersion('v1.1.0', v2, { 'agents-guide.md': 'Keep the instructions current.', 'docs-guide.md': 'Keep the documentation current.' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const result = cli.run(updateArgs, project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const inspection = JSON.parse(result.stdout);
  assert.deepEqual(inspection.retired.map((entry: { id: string }) => entry.id), ['policy']);
  assert.deepEqual(inspection.removed, []);
  assert.deepEqual(inspection.discardedEdits, []);
  assert.deepEqual(inspection.start.blockers, []);
  const started = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(JSON.parse(started.stdout).phase, 'contextual', started.stdout + started.stderr);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Pinned instructions');
  assert.equal(readFileSync(join(project.root, 'docs/policy.md'), 'utf8'), 'Maintainer policy');
});

test('an update leaves a retired installed target inside a still-installed skill to that skill', async t => {
  const v1 = source('v1', `    instructions:
      kind: file
      target: .agents/skills/review/SKILL.md
      exact: review.md`);
  const v2 = source('v2', `    review:
      kind: skill
      name: review
      source: review`);
  const remote = remoteFixture(v1, { 'review.md': '# Review v1' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  remote.addVersion('v1.1.0', v2, { 'review/SKILL.md': '# Review v2', 'review/notes.md': 'Notes' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const inspection = JSON.parse(cli.run(updateArgs, project.root, env).stdout);
  assert.deepEqual(inspection.retired.map((entry: { id: string }) => entry.id), ['instructions']);
  assert.deepEqual(inspection.removed, []);
  assert.deepEqual(inspection.start.blockers, []);
  assert.equal(inspection.exact[0].action, 'replace');
  const result = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  assert.deepEqual(installedTree(join(project.root, '.agents/skills/review')), installedTree(join(remote.source.root, 'review')));
});

test('an update removes a retired target beside contextual scope and one that contains a newly installed target', async t => {
  const v1 = source('v1', `    old-docs:
      kind: file
      target: docs-old.md
      exact: old.md
    legacy:
      kind: skill
      name: legacy
      source: legacy`);
  const v2 = source('v2', `    docs:
      kind: repository
      guidance: docs-guide.md
      targets: {paths: [], directories: [docs]}
    readme:
      kind: file
      target: .agents/skills/legacy/README.md
      exact: readme.md`);
  const remote = remoteFixture(v1, { 'old.md': 'Old docs', 'legacy/SKILL.md': '# Legacy' });
  const project = sourceFixture('', { 'docs/guide.md': 'Guide' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  remote.addVersion('v1.1.0', v2, { 'docs-guide.md': 'Keep the documentation current.', 'readme.md': 'Read me' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
  const inspection = JSON.parse(cli.run(updateArgs, project.root, env).stdout);
  // The retired skill's link goes with it: a file installed into its old
  // directory is no skill to link.
  assert.deepEqual(inspection.removed.map(({ target }: { target: string }) => target), ['.agents/skills/legacy', '.claude/skills/legacy', 'docs-old.md']);
  assert.deepEqual(inspection.discardedEdits, []);
  assert.deepEqual(inspection.start.blockers, []);
  const started = cli.run(['start', ...updateArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(JSON.parse(started.stdout).phase, 'contextual', started.stdout + started.stderr);
  assert.equal(existsSync(join(project.root, 'docs-old.md')), false);
  assert.equal(lstatSync(join(project.root, '.claude/skills/legacy'), { throwIfNoEntry: false }), undefined);
  assert.deepEqual(installedTree(join(project.root, '.agents/skills/legacy')), [['README.md', Buffer.from('Read me').toString('base64'), false]]);
  assert.equal(readFileSync(join(project.root, 'docs/guide.md'), 'utf8'), 'Guide');
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
  assert.deepEqual(inspection.update, ['cli']);
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
  assert.equal(existsSync(join(project.root, '.agents/skills/author-standards')), false);
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

test('a candidate CLI updates retained standards whose manifest range excludes it', async t => {
  const yaml = source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`).replace('>=1.0.0', `>=1.0.0 <${candidateVersion}`);
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
  const previous = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();
  const runCandidate = (args: string[]) => spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), args, { cwd: project.root, env, encoding: 'utf8' });
  const inspected = runCandidate(['inspect', '--json']);
  assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
  const update = JSON.parse(inspected.stdout);
  assert.deepEqual(update.update, ['cli']);
  assert.equal(update.source.requires['repo-standards'], `>=1.0.0 <${candidateVersion}`);
  assert.equal(update.start.eligible, true, JSON.stringify(update.start.blockers));
  const result = runCandidate(['start', '--confirm', update.identity, '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  const status = JSON.parse(runCandidate(['status', '--json']).stdout);
  assert.equal(status.selection.cli.version, candidateVersion);
  assert.deepEqual(status.selection.standards, previous.selection.standards);
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

test('a confirmed inspection of the unchanged selection starts a run that re-applies it from retained inputs', async t => {
  const remote = remoteFixture(source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
      checks:
        - id: verify
          run: {executable: ${JSON.stringify(process.execPath)}, script: check.mjs, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=24 <25"}
          timeout-seconds: 5`), {
    'agents.md': 'Pinned standards',
    'check.mjs': `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Ready'}));`,
  });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const adopted = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env);
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
  commit(project.root);
  const previous = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  const runtimePaths = ['.repo-standards/runtime/package.json', '.repo-standards/runtime/package-lock.json', '.agents/skills/adopt-standards/SKILL.md'];
  const runtime = runtimePaths.map(path => readFileSync(join(project.root, path), 'utf8'));
  const head = git(project.root, 'rev-parse', 'HEAD');
  // Neither the source nor the npm registry is reachable: an unchanged
  // selection re-applies retained inputs and keeps the installed runtime.
  registry.close();
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();

  for (const command of ['inspect', 'start']) {
    const rejected = cli.run([command, '--readopt', '--json'], project.root, env);
    assert.equal(rejected.status, 2, rejected.stdout + rejected.stderr);
    assert.equal(JSON.parse(rejected.stdout).errors[0].code, 'USAGE');
  }
  const inspectionResult = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(inspectionResult.status, 0, inspectionResult.stdout + inspectionResult.stderr);
  const inspection = JSON.parse(inspectionResult.stdout);
  assert.deepEqual(inspection.update, []);
  assert.deepEqual(inspection.previousSelection, previous.selection);
  assert.deepEqual(inspection.selection, previous.selection);
  assert.deepEqual(inspection.retired, []);
  assert.deepEqual(inspection.start.blockers, []);

  const result = cli.run(['start', '--confirm', inspection.identity, '--json'], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const completed = JSON.parse(result.stdout);
  assert.equal(completed.outcome, 'complete');
  assert.equal(completed.previousComplete.lastComplete.run, previous.lastComplete.run);
  assert.deepEqual(completed.operations.map((entry: { operation: { id: string }; result: { status: string } }) => [entry.operation.id, entry.result.status]), [['verify', 'passed']]);
  const current = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  assert.equal(current.lastComplete.run, completed.id);
  assert.deepEqual(current.selection, previous.selection);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Pinned standards');
  assert.deepEqual(runtimePaths.map(path => readFileSync(join(project.root, path), 'utf8')), runtime);
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
});

test('an unchanged selection with active discovery requires a proposal confirmed against the current project before it starts', async t => {
  const remote = remoteFixture(stringify({ format: 'repo-standards/v2', name: 'discovered-docs', description: 'Maintained project documentation',
    requires: { 'repo-standards': '>=1.0.0' }, defaults: { declarations: { docs: { kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md' } } },
    profiles: { work: { description: 'Work', declarations: {} } } }), {
    'guidance.md': 'Keep every maintained project README useful.', 'discovery.md': 'Include the README of every maintained project.',
  });
  const project = sourceFixture('', { 'apps/old/README.md': '# Old project\n' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => cli.run(args, project.root, env);
  const scopeFile = join(remote.support.root, 'scope.json');
  const propose = (path: string) => {
    writeFileSync(scopeFile, JSON.stringify({ format: 'repo-standards/scope/v2', declarations: [{ id: 'docs',
      coverage: 'Every maintained project README is included.',
      candidates: [{ path, decision: 'include', reason: 'This is a maintained project README.', evidence: [path] }], unresolved: [] }] }));
  };
  const complete = () => {
    const review = { status: 'valid', explanation: 'The confirmed README still matches the discovery guidance.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
    const assessmentFile = join(remote.support.root, 'assessment.json');
    writeFileSync(assessmentFile, JSON.stringify({ format: 'repo-standards/assessment/v3',
      declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The README already satisfies the guidance.', evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }] }));
    return run(['resume', '--assessment', assessmentFile, '--json']);
  };
  propose('apps/old/README.md');
  const first = JSON.parse(run([...inspectionArgs, '--scope', scopeFile]).stdout);
  run(['start', ...inspectionArgs.slice(1), '--scope', scopeFile, '--confirm', first.identity]);
  const firstComplete = complete();
  assert.equal(firstComplete.status, 0, firstComplete.stdout + firstComplete.stderr);
  commit(project.root);
  mkdirSync(join(project.root, 'apps/new'));
  writeFileSync(join(project.root, 'apps/new/README.md'), '# New project\n');
  commit(project.root);

  const request = JSON.parse(run(['inspect', '--json']).stdout);
  assert.deepEqual(request.update, []);
  assert.equal(request.start.eligible, false);
  assert.ok(request.start.blockers.some((blocker: { code: string }) => blocker.code === 'DISCOVERY_REQUIRED'), JSON.stringify(request.start.blockers));
  // The earlier proposal is judged against the current observation. Once the
  // project changes, the confirmation of that inspection is stale.
  const reused = JSON.parse(run(['inspect', '--scope', scopeFile, '--json']).stdout);
  assert.deepEqual(reused.start.blockers, []);
  assert.notEqual(reused.identity, first.identity);
  writeFileSync(join(project.root, 'apps/new/package.json'), '{"name":"new"}\n');
  commit(project.root);
  const stale = run(['start', '--scope', scopeFile, '--confirm', reused.identity, '--json']);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.equal(JSON.parse(stale.stdout).errors[0].code, 'STALE_INSPECTION');
  assert.match(JSON.parse(stale.stdout).errors[0].message, /review it against the fresh discovery evidence/);
  assert.equal(JSON.parse(run(['status', '--json']).stdout).active, null);
  propose('apps/new/README.md');
  const inspection = JSON.parse(run(['inspect', '--scope', scopeFile, '--json']).stdout);
  assert.deepEqual(inspection.start.blockers, []);
  assert.deepEqual(inspection.scopeChanges, [{ id: 'docs', additions: ['apps/new/README.md'], removals: ['apps/old/README.md'] }]);
  const started = JSON.parse(run(['start', '--scope', scopeFile, '--confirm', inspection.identity, '--json']).stdout);
  assert.equal(started.phase, 'contextual');
  const completed = complete();
  assert.equal(completed.status, 0, completed.stdout + completed.stderr);
  assert.equal(JSON.parse(completed.stdout).previousComplete.lastComplete.run, JSON.parse(firstComplete.stdout).id);
  assert.equal(readFileSync(join(project.root, 'apps/old/README.md'), 'utf8'), '# Old project\n');
});

test('a coordinated update changes the CLI and standards pins in one confirmed run when the new standards version requires the candidate', async t => {
  const declarations = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    review:
      kind: skill
      name: review
      source: review`;
  const remote = remoteFixture(source('v1', declarations), { 'agents.md': 'Version one', 'review/SKILL.md': '# Review v1' });
  const project = sourceFixture('');
  const candidate = sourceFixture('');
  const registry = await registryFixture(cli.root, [cli.version, candidateVersion]);
  t.after(() => { registry.close(); remote.close(); project.close(); candidate.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  const previous = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  const head = git(project.root, 'rev-parse', 'HEAD');
  remote.addVersion('v1.1.0', source('v2', declarations).replace('>=1.0.0', `>=${candidateVersion}`),
    { 'agents.md': 'Version two', 'review/SKILL.md': '# Review v2' });
  const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);

  // The author's range still gates selecting that version from its source.
  const pinned = cli.run(updateArgs, project.root, env);
  assert.equal(pinned.status, 1, pinned.stdout + pinned.stderr);
  const error = JSON.parse(pinned.stdout).errors[0];
  assert.equal(error.code, 'INVALID_STANDARDS');
  const incompatible = error.details.find((detail: { code: string }) => detail.code === 'INCOMPATIBLE_CLI');
  assert.match(incompatible.message, /open-ended minimum/);
  assert.match(incompatible.message, />=1\.3\.0/);
  assert.equal(git(project.root, 'status', '--porcelain=v1'), '');

  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
  const runCandidate = (args: string[]) => spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), args, { cwd: project.root, env, encoding: 'utf8' });
  const inspectionResult = runCandidate(updateArgs);
  assert.equal(inspectionResult.status, 0, inspectionResult.stdout + inspectionResult.stderr);
  const inspection = JSON.parse(inspectionResult.stdout);
  assert.deepEqual(inspection.update, ['cli', 'standards']);
  assert.deepEqual(inspection.previousSelection, previous.selection);
  assert.equal(inspection.selection.cli.version, candidateVersion);
  assert.equal(inspection.selection.standards.version, 'v1.1.0');
  assert.equal(inspection.start.eligible, true, JSON.stringify(inspection.start.blockers));

  const result = runCandidate(['start', ...updateArgs.slice(1), '--confirm', inspection.identity]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  const selection = parse(readFileSync(join(project.root, '.repo-standards/selection.yaml'), 'utf8'));
  assert.equal(selection.cli.version, candidateVersion);
  assert.equal(selection.standards.version, 'v1.1.0');
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Version two');
  assert.equal(readFileSync(join(project.root, '.agents/skills/review/SKILL.md'), 'utf8'), '# Review v2');
  assert.equal(JSON.parse(readFileSync(join(project.root, '.repo-standards/runtime/package.json'), 'utf8')).dependencies['@lutzseverino/repo-standards'], candidateVersion);
  assert.ok(readFileSync(join(project.root, '.agents/skills/adopt-standards/SKILL.md'), 'utf8').includes(`Fixture CLI ${candidateVersion}.`));
  assert.equal(JSON.parse(runCandidate(['status', '--json']).stdout).lastComplete.run, JSON.parse(result.stdout).id);
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
});

test('source and profile switches are updates that remove the installed content of retired declarations', async t => {
  const alice = remoteFixture(source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    legacy:
      kind: file
      target: LEGACY.md
      exact: legacy.md
    review:
      kind: skill
      name: review
      source: review`).replace('    declarations: {}', '    declarations: {}\n  lean:\n    description: Lean\n    declarations: {legacy: {exclude: true}}'), {
    'agents.md': 'Alice instructions', 'legacy.md': 'Keep legacy content', 'review/SKILL.md': '# Alice review',
  });
  const bob = remoteFixture(source('v1', `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    lint:
      kind: skill
      name: lint
      source: lint`).replace('  work:\n    description: Work', '  team:\n    description: Team'), {
    'agents.md': 'Bob instructions', 'lint/SKILL.md': '# Bob lint',
  }, [], 'bob/standards');
  const project = sourceFixture('');
  const candidate = sourceFixture('');
  const registry = await registryFixture(cli.root, [cli.version, candidateVersion]);
  t.after(() => { registry.close(); alice.close(); bob.close(); project.close(); candidate.close(); });
  commit(project.root);
  const env = { ...alice.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  const adopted = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  const runtimePaths = ['.repo-standards/runtime/package.json', '.repo-standards/runtime/package-lock.json', '.agents/skills/adopt-standards/SKILL.md'];
  const runtime = runtimePaths.map(path => readFileSync(join(project.root, path), 'utf8'));

  // A profile switch with the pinned CLI keeps the runtime.
  const profileArgs = inspectionArgs.map(argument => argument === 'work' ? 'lean' : argument);
  const profileSwitch = JSON.parse(cli.run(profileArgs, project.root, env).stdout);
  assert.deepEqual(profileSwitch.update, ['profile']);
  assert.deepEqual(profileSwitch.previousSelection, adopted.selection);
  assert.deepEqual(profileSwitch.retired.map((entry: { id: string }) => entry.id), ['legacy']);
  assert.equal(profileSwitch.start.eligible, true, JSON.stringify(profileSwitch.start.blockers));
  const switched = cli.run(['start', ...profileArgs.slice(1), '--confirm', profileSwitch.identity], project.root, env);
  assert.equal(switched.status, 0, switched.stdout + switched.stderr);
  assert.equal(existsSync(join(project.root, 'LEGACY.md')), false);
  let status = JSON.parse(cli.run(['status', '--json'], project.root, env).stdout);
  assert.equal(status.selection.profile, 'lean');
  assert.equal(status.baselines['LEGACY.md'], undefined);
  assert.deepEqual(runtimePaths.map(path => readFileSync(join(project.root, path), 'utf8')), runtime);
  commit(project.root);

  // A source switch can change every component at once, including the CLI pin.
  execFileSync('npm', ['install', '--prefix', candidate.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${candidateVersion}`], { cwd: candidate.root, env, stdio: 'pipe' });
  const bobEnv = { ...bob.env, ...registry.env };
  const runCandidate = (args: string[]) => spawnSync(join(candidate.root, 'node_modules/.bin/repo-standards'), args, { cwd: project.root, env: bobEnv, encoding: 'utf8' });
  const sourceArgs = inspectionArgs.map(argument => argument === 'https://github.com/alice/standards' ? 'https://github.com/bob/standards' : argument === 'work' ? 'team' : argument);
  const sourceResult = runCandidate(sourceArgs);
  assert.equal(sourceResult.status, 0, sourceResult.stdout + sourceResult.stderr);
  const sourceSwitch = JSON.parse(sourceResult.stdout);
  assert.deepEqual(sourceSwitch.update, ['cli', 'standards', 'source', 'profile']);
  assert.deepEqual(sourceSwitch.previousSelection, status.selection);
  assert.deepEqual(sourceSwitch.retired.map((entry: { id: string }) => entry.id), ['review']);
  assert.equal(sourceSwitch.start.eligible, true, JSON.stringify(sourceSwitch.start.blockers));
  const result = runCandidate(['start', ...sourceArgs.slice(1), '--confirm', sourceSwitch.identity]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'complete');
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Bob instructions');
  assert.equal(readFileSync(join(project.root, '.agents/skills/lint/SKILL.md'), 'utf8'), '# Bob lint');
  assert.equal(existsSync(join(project.root, '.agents/skills/review')), false);
  assert.equal(existsSync(join(project.root, 'LEGACY.md')), false);
  assert.ok(readFileSync(join(project.root, '.agents/skills/adopt-standards/SKILL.md'), 'utf8').includes(`Fixture CLI ${candidateVersion}.`));
  status = JSON.parse(runCandidate(['status', '--json']).stdout);
  assert.equal(status.selection.standards.repository, 'https://github.com/bob/standards');
  assert.equal(status.selection.profile, 'team');
  assert.equal(status.selection.cli.version, candidateVersion);
  assert.equal(status.skills['.agents/skills/review'], undefined);
  assert.equal(existsSync(join(project.root, '.repo-standards/inputs/source/legacy.md')), false);
  assert.equal(existsSync(join(project.root, '.repo-standards/inputs/source/review/SKILL.md')), false);
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
  assert.equal(remote.publish('v1.0.0').sha, moved.sha);
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
    // A candidate CLI only inspects and starts; the recorded adoption's status
    // needs its pinned CLI until a run under the candidate begins.
    pinned: (args: string[]) => cli.run(args, project.root, env),
    run };
}

test('a CLI pin-change retry completes after process death during runtime staging', async t => {
  const f = await pendingUpdate(t, 'cli');
  const lock = join(f.project.root, git(f.project.root, 'rev-parse', '--git-dir'), 'repo-standards-run.lock');
  const installed = join(f.project.root, '.repo-standards/runtime/node_modules');
  const previousRuntime = snapshot(installed);
  const env = filesystemFault(f.remote.support.root, f.env, 'runtime', `
const copy = fs.cpSync;
fs.cpSync = function(from, to, options) {
  if (String(to).endsWith('/repo-standards-run.lock.runtime')) {
    return copy.call(this, from, to, { ...options, filter(source, target) {
      if (fs.lstatSync(String(to) + '/.bin/repo-standards', { throwIfNoEntry: false })?.isSymbolicLink()) {
        process.kill(process.pid, 'SIGKILL');
      }
      return true;
    } });
  }
  return copy.call(this, from, to, options);
};
syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const interrupted = JSON.parse(readFileSync(lock, 'utf8'));
  assert.equal(interrupted.phase, 'runtime');
  assert.equal(interrupted.continuation, undefined);
  assert.equal(lstatSync(`${lock}.runtime/.bin/repo-standards`).isSymbolicLink(), true);
  assert.deepEqual(snapshot(installed), previousRuntime);

  // Keep the runtime bound to the recorded plan before retry installs it.
  // Completion performs the CLI's runtimeHash verification; the tree comparison
  // also checks every installed byte, mode and symbolic link against that stage.
  const recordedRuntime = join(f.remote.support.root, 'recorded-runtime');
  const retryEnv = filesystemFault(f.remote.support.root, f.env, 'installation', `
fs.cpSync(${JSON.stringify(`${lock}.runtime`)}, ${JSON.stringify(recordedRuntime)}, { recursive: true, verbatimSymlinks: true });`);
  const result = f.run(['resume', '--retry', '--json'], retryEnv);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const completed = JSON.parse(result.stdout);
  assert.equal(completed.id, interrupted.id);
  assert.equal(completed.outcome, 'complete');
  assert.equal(completed.selection.cli.version, candidateVersion);
  assert.deepEqual(snapshot(installed), snapshot(recordedRuntime));
  assert.equal(JSON.parse(f.run(['status', '--json']).stdout).lastComplete.run, completed.id);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
});

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

test('retry preserves runtime integrity failures after the installation is recorded', async t => {
  for (const point of ['staged', 'installed'] as const) await t.test(point, async t => {
    const f = await pendingUpdate(t, point === 'staged' ? 'cli' : 'standards');
    const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith(${JSON.stringify(`/.agents/skills/${point === 'staged' ? 'adopt-standards' : 'review'}/SKILL.md`)})) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
    assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
    const lock = join(f.project.root, git(f.project.root, 'rev-parse', '--git-dir'), 'repo-standards-run.lock');
    const interrupted = JSON.parse(readFileSync(lock, 'utf8'));
    assert.ok(interrupted.continuation);
    assert.equal(interrupted.installation.runtime, point === 'installed');
    const installed = join(f.project.root, '.repo-standards/runtime/node_modules');
    const target = join(point === 'staged' ? `${lock}.runtime` : installed, '@lutzseverino/repo-standards/package.json');
    const original = readFileSync(target);
    writeFileSync(target, 'Maintainer runtime edit');
    const preservedRuntime = snapshot(installed);
    const rejected = f.run(['resume', '--retry', '--json']);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(JSON.parse(rejected.stdout).reason, point === 'staged' ? /STATE_INTEGRITY.*saved runtime installation changed/ : /INSTALLATION_CHANGED.*Runtime content changed/);
    assert.equal(readFileSync(target, 'utf8'), 'Maintainer runtime edit');
    assert.deepEqual(snapshot(installed), preservedRuntime);
    writeFileSync(target, original);
    const recovered = f.run(['resume', '--retry', '--json']);
    assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).outcome, 'complete');
  });
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
      const status = JSON.parse(f.pinned(['status', '--json']).stdout);
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
          const status = JSON.parse(f.pinned(['status', '--json']).stdout);
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
    assert.equal(JSON.parse(f.pinned(['status', '--json']).stdout).active, null);
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
    const manifest = (active: object) => stringify({ format: 'repo-standards/v2', name: 'contextual-updates', description: 'Update lifecycle',
      requires: { 'repo-standards': '>=1' }, defaults: { declarations: active }, profiles: { work: { description: 'Work', declarations: {} } } });
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
      run(['resume', '--json']);
      const path = join(remote.support.root, 'assessment.json');
      writeFileSync(path, JSON.stringify({ format: 'repo-standards/assessment/v3',
        declarations: [{ id: 'readme', status: 'satisfied', explanation: 'Documented the queue worker.', evidence: ['Usage explains how to process jobs.'] }] }));
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
    if (kind === 'standards') {
      assert.equal(status.baselines['RETIRED.md'], undefined);
      assert.equal(existsSync(join(project.root, 'RETIRED.md')), false);
    } else assert.equal(readFileSync(join(project.root, 'RETIRED.md'), 'utf8'), 'Preserve retired content');
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

test('interrupted skill replacement preserves unexpected directories until reconciled', async t => {
  for (const phase of ['removing', 'installing']) await t.test(phase, async t => {
    const f = await pendingUpdate(t, 'standards');
    const env = filesystemFault(f.remote.support.root, f.env, 'installation', phase === 'removing' ? `
const remove = fs.rmSync;
fs.rmSync = function(path, ...args) {
  if (String(path).endsWith('/.agents/skills/review')) {
    remove.call(this, String(path) + '/obsolete.txt');
    process.kill(process.pid, 'SIGKILL');
  }
  return remove.call(this, path, ...args);
};
syncBuiltinESMExports();` : `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/.agents/skills/review/SKILL.md')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
    assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
    const addition = join(f.project.root, '.agents/skills/review/unexpected');
    mkdirSync(addition);
    const rejected = f.run(['resume', '--retry', '--json']);
    assert.equal(rejected.status, 1, rejected.stdout);
    assert.match(JSON.parse(rejected.stdout).reason, /INSTALLATION_CHANGED.*inventory/);
    assert.equal(existsSync(addition), true);
    assert.equal(existsSync(join(f.project.root, '.agents/skills/review/current.txt')), false);
    rmSync(addition, { recursive: true });
    const recovered = f.run(['resume', '--retry', '--json']);
    assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).outcome, 'complete');
  });
});

test('retry resumes an interrupted removal of retired targets and an interrupted initial skill or skill link replacement', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const kill = (suffix: string, before?: string) => `
const remove = fs.rmSync;
fs.rmSync = function(path, ...args) {
  if (String(path).endsWith(${JSON.stringify(suffix)})) {
    ${before ? `remove.call(this, String(path) + ${JSON.stringify(before)});` : ''}
    process.kill(process.pid, 'SIGKILL');
  }
  return remove.call(this, path, ...args);
};
syncBuiltinESMExports();`;
  const declarations = `    review:
      kind: skill
      name: review
      source: review`;
  // A staged link left before its rename.
  const killBeforeRename = (suffix: string) => `
const rename = fs.renameSync;
fs.renameSync = function(from, to, ...args) {
  if (String(to).endsWith(${JSON.stringify(suffix)})) process.kill(process.pid, 'SIGKILL');
  return rename.call(this, from, to, ...args);
};
syncBuiltinESMExports();`;
  const copy = { '.claude/skills/review/SKILL.md': '# Local copy', '.claude/skills/review/local.md': 'Local notes' };
  for (const { name, fault, initialFiles, discarded } of [
    { name: 'a retired exact file', fault: kill('/RETIRED.md') },
    { name: 'a retired skill', fault: kill('/.agents/skills/legacy', '/notes.md') },
    { name: 'a retired skill link', fault: kill('/.claude/skills/legacy') },
    { name: 'an initial replacement of a differing tracked skill', fault: kill('/.agents/skills/review', '/local.md'),
      initialFiles: { '.agents/skills/review/SKILL.md': '# Local review', '.agents/skills/review/local.md': 'Local notes' }, discarded: ['.agents/skills/review'] },
    { name: 'an initial replacement of a tracked copy at a skill link', fault: kill('/.claude/skills/review', '/local.md'), initialFiles: copy, discarded: ['.claude/skills/review'] },
    { name: 'a staged skill link replacing a tracked copy', fault: killBeforeRename('/.claude/skills/review'), initialFiles: copy, discarded: ['.claude/skills/review'] },
  ]) await t.test(name, () => {
    const remote = remoteFixture(source('v1', `${declarations}
    retired:
      kind: file
      target: RETIRED.md
      exact: retired.md
    legacy:
      kind: skill
      name: legacy
      source: legacy`), { 'review/SKILL.md': '# Review', 'retired.md': 'Retired', 'legacy/SKILL.md': '# Legacy', 'legacy/notes.md': 'Legacy notes' });
    const project = sourceFixture('', initialFiles ?? {});
    t.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    const run = (args: string[], environment: NodeJS.ProcessEnv = env) => cli.run(args, project.root, environment);
    const initial = JSON.parse(run(inspectionArgs).stdout);
    let startArgs = ['start', ...inspectionArgs.slice(1), '--confirm', initial.identity];
    if (!initialFiles) {
      assert.equal(run(startArgs).status, 0);
      commit(project.root);
      remote.addVersion('v1.1.0', source('v2', declarations), {});
      const updateArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument);
      const inspection = JSON.parse(run(updateArgs).stdout);
      assert.deepEqual(inspection.removed.map(({ target }: { target: string }) => target), ['.agents/skills/legacy', '.claude/skills/legacy', 'RETIRED.md']);
      startArgs = ['start', ...updateArgs.slice(1), '--confirm', inspection.identity];
    } else assert.deepEqual(initial.discardedEdits, discarded);
    assert.equal(run(startArgs, filesystemFault(remote.support.root, env, 'installation', fault)).signal, 'SIGKILL');
    const result = run(['resume', '--retry', '--json']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).outcome, 'complete');
    assert.deepEqual(installedTree(join(project.root, '.agents/skills/review')), installedTree(join(remote.source.root, 'review')));
    assert.equal(readlinkSync(join(project.root, '.claude/skills/review')), '../../.agents/skills/review');
    assert.deepEqual(readdirSync(join(project.root, '.claude/skills')).sort(), ['adopt-standards', ...initialFiles ? ['legacy'] : [], 'review', 'standards-updates']);
    if (!initialFiles) {
      assert.equal(existsSync(join(project.root, 'RETIRED.md')), false);
      assert.equal(existsSync(join(project.root, '.agents/skills/legacy')), false);
    }
  });
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
