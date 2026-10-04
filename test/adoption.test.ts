import type { Diagnostic, DirectoryInventory, ErrorReport, FileInventory, Inspection, PackageManifest, Run, State, Status } from './json-reports.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { embeddedContent, installCli, installedTree, sha256, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';

const cli = installCli();
after(() => cli.close());
const yaml = `format: repo-standards/v2
name: exact-standards
description: Exact adoption
requires: {repo-standards: ">=1.0.0"}
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
  assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, 'CONFIRMATION_REQUIRED');
  assert.deepEqual(snapshot(project.root), before);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Existing');
});

test('a fresh checkout restores the exact runtime and inspects retained standards after the source disappears', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected', LICENSE: 'Source license' });
  const project = sourceFixture('');
  const checkout = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); checkout.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
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
  assert.equal(execFileSync(pinned, ['--version'], { cwd: checkout.root, encoding: 'utf8' }).trim(), cli.version);
  const before = snapshot(checkout.root);
  const retained = spawnSync(pinned, ['inspect', '--json'], { cwd: checkout.root, env, encoding: 'utf8' });
  assert.equal(retained.status, 0, retained.stdout + retained.stderr);
  const report = (JSON.parse(retained.stdout) as Inspection);
  assert.equal(report.selection.standards.commit, remote.sha);
  assert.equal(report.exact[0]!.action, 'match');
  assert.equal(report.retained, true);
  assert.deepEqual(report.systemSkills.map(({ action }: { action: string }) => action), ['match', 'match']);
  assert.deepEqual(report.discardedEdits, []);
  assert.deepEqual(snapshot(checkout.root), before);
});

test('confirmed exact adoption installs whole skills, claims matching files and leaves durable pins uncommitted', async t => {
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
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const head = git(project.root, 'rev-parse', 'HEAD');
  const stat = lstatSync(join(project.root, 'AGENTS.md'));
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as Run);
  assert.equal(report.outcome, 'complete');
  assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
  assert.equal(git(project.root, 'diff', '--cached', '--name-only'), '');
  assert.equal(lstatSync(join(project.root, 'AGENTS.md')).mtimeMs, stat.mtimeMs);
  assert.equal(readFileSync(join(project.root, 'CONTRIBUTING.md'), 'utf8'), 'Employer content');
  assert.equal(readFileSync(join(project.root, '.agents/skills/review/resources/check.txt'), 'utf8'), 'Skill resource');
  // Both system skills install, each stating its invocation in Claude Code's
  // frontmatter and in Codex's agents/openai.yaml alike.
  for (const [name, manual] of [['adopt-standards', true], ['standards-updates', false]] as const) {
    const frontmatter = parse(readFileSync(join(project.root, `.agents/skills/${name}/SKILL.md`), 'utf8').match(/^---\n([\s\S]*?)\n---\n/)![1]!) as { name: string; 'disable-model-invocation': boolean };
    assert.equal(frontmatter.name, name);
    assert.equal(frontmatter['disable-model-invocation'], manual);
    assert.equal(readFileSync(join(project.root, `.agents/skills/${name}/agents/openai.yaml`), 'utf8'),
      `policy:\n  allow_implicit_invocation: ${!manual}\n`);
  }
  assert.deepEqual(inspection.systemSkills, [
    { name: 'adopt-standards', target: '.agents/skills/adopt-standards', action: 'create', link: { target: '.claude/skills/adopt-standards', action: 'create' } },
    { name: 'standards-updates', target: '.agents/skills/standards-updates', action: 'create', link: { target: '.claude/skills/standards-updates', action: 'create' } }]);
  assert.deepEqual(inspection.exact.find((entry: { id: string }) => entry.id === 'review')!.link, { target: '.claude/skills/review', action: 'create' });
  assert.equal(inspection.exact.find((entry: { id: string }) => entry.id === 'instructions')!.link, undefined);
  // Every installed skill, system and author, gets a relative link that
  // resolves to its directory; nothing else is linked.
  const links = { '.claude/skills/adopt-standards': '../../.agents/skills/adopt-standards', '.claude/skills/review': '../../.agents/skills/review',
    '.claude/skills/standards-updates': '../../.agents/skills/standards-updates' };
  assert.deepEqual(readdirSync(join(project.root, '.claude/skills')).sort(), ['adopt-standards', 'review', 'standards-updates']);
  for (const [path, text] of Object.entries(links)) {
    assert.ok(lstatSync(join(project.root, path)).isSymbolicLink(), path);
    assert.equal(readlinkSync(join(project.root, path)), text);
    assert.equal(realpathSync(join(project.root, path)), realpathSync(join(project.root, path.replace('.claude/skills', '.agents/skills'))));
  }
  assert.deepEqual(report.changes.filter((path: string) => path.startsWith('.claude/')), Object.keys(links));
  assert.deepEqual(readdirSync(join(project.root, '.agents/skills/adopt-standards/references')).sort(),
    ['assessment.md', 'discovery.md', 'recovery.md', 'review.md']);
  assert.equal(existsSync(join(project.root, '.agents/skills/author-standards')), false);
  const manifest = (JSON.parse(readFileSync(join(project.root, '.repo-standards/runtime/package.json'), 'utf8')) as PackageManifest);
  assert.deepEqual(manifest.dependencies, { '@lutzseverino/repo-standards': cli.version });
  assert.equal(readFileSync(join(project.root, 'package.json'), 'utf8'), '{"private":true,"packageManager":"yarn@4.0.0"}\n');
  const state = (JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8')) as State);
  assert.equal(state.lastComplete.inspection, inspection.identity);
  assert.equal(state.baselines['AGENTS.md']!.sha256, 'ca99b7f1b14ee2c04f7aaefde89858fc947fa88de518c2e6d4b6132892175218');
  assert.deepEqual(state.skills['.agents/skills/review'], ['SKILL.md', 'resources/check.txt']);
  assert.deepEqual(state.skills['.agents/skills/standards-updates'], ['SKILL.md', 'agents/openai.yaml']);
  assert.equal(state.skills['.agents/skills/author-standards'], undefined);
  assert.equal(state.format, 'repo-standards/state/v7');
  assert.deepEqual(state.links, links);
  assert.deepEqual(state.changeSet.filter(({ path }: { path: string }) => path.startsWith('.claude/')), Object.keys(links).map(path => ({ path, phases: ['installation'] })));
  assert.equal(readFileSync(join(project.root, '.repo-standards/inputs/source/LICENSE'), 'utf8'), 'Source license');
  assert.equal(existsSync(join(project.root, '.repo-standards/inputs/source/unrelated.txt')), false);
  assert.equal(existsSync(join(project.root, '.repo-standards/inputs/source/excluded.md')), false);
  const status = (JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status);
  assert.equal(status.selection!.cli.version, cli.version);
  assert.equal(status.lastComplete.inspection, inspection.identity);
  assert.equal(status.evidence, 'historical');
  assert.deepEqual(status.links, links);
  // Git records each link as a symbolic link, so a clone exposes the skills too.
  commit(project.root);
  for (const path of Object.keys(links)) assert.match(git(project.root, 'ls-files', '--stage', path), /^120000 /);
});

test('fresh adoption over previously installed content claims byte-identical skills once product state is removed', async t => {
  const remote = remoteFixture(yaml.replace('profiles:', `    review:
      kind: skill
      name: review
      source: skills/review
profiles:`), { 'content.md': 'Expected', 'skills/review/SKILL.md': '# Review\nReview the code.', 'skills/review/scripts/run.sh': '#!/bin/sh\n' }, ['skills/review/scripts/run.sh']);
  const packagedSkill = readFileSync(join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills/adopt-standards/SKILL.md'), 'utf8');
  const project = sourceFixture('', { 'AGENTS.md': 'Expected', '.agents/skills/review/SKILL.md': '# Review\nReview the code.',
    '.agents/skills/review/scripts/run.sh': '#!/bin/sh\n', '.agents/skills/adopt-standards/SKILL.md': packagedSkill,
    '.repo-standards/selection.yaml': 'profile: work\n' });
  for (const name of ['adopt-standards', 'standards-updates']) cpSync(join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills', name),
    join(project.root, '.agents/skills', name), { recursive: true });
  chmodSync(join(project.root, '.agents/skills/review/scripts/run.sh'), 0o755);
  // The earlier adoption also left a skill link for each installed skill.
  const links = ['adopt-standards', 'review', 'standards-updates'].map(name => `.claude/skills/${name}`);
  mkdirSync(join(project.root, '.claude/skills'), { recursive: true });
  for (const link of links) symlinkSync(`../../.agents/skills/${link.slice('.claude/skills/'.length)}`, join(project.root, link));
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspect = () => {
    const result = cli.run(inspectionArgs, project.root, env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return (JSON.parse(result.stdout) as Inspection);
  };
  const blocked = inspect();
  assert.deepEqual(blocked.start.blockers.map((b: { code: string }) => b.code), ['EXISTING_ADOPTION']);
  assert.equal(blocked.exact.find((entry: { id: string }) => entry.id === 'review')!.action, 'match');
  assert.deepEqual(blocked.systemSkills, [
    { name: 'adopt-standards', target: '.agents/skills/adopt-standards', action: 'match', link: { target: '.claude/skills/adopt-standards', action: 'match' } },
    { name: 'standards-updates', target: '.agents/skills/standards-updates', action: 'match', link: { target: '.claude/skills/standards-updates', action: 'match' } }]);
  assert.deepEqual(blocked.exact.find((entry: { id: string }) => entry.id === 'review')!.link, { target: '.claude/skills/review', action: 'match' });

  rmSync(join(project.root, '.repo-standards'), { recursive: true });
  commit(project.root);
  const inspection = inspect();
  assert.deepEqual(inspection.start.blockers, []);
  assert.equal(inspection.start.eligible, true);
  assert.equal(inspection.exact.find((entry: { id: string }) => entry.id === 'review')!.action, 'match');
  assert.deepEqual(inspection.systemSkills.map(({ action }: { action: string }) => action), ['match', 'match']);
  const claimed = ['.agents/skills/review/SKILL.md', '.agents/skills/review/scripts/run.sh', ...cli.systemSkillFiles, ...links];
  const before = Object.fromEntries(claimed.map(path => [path, lstatSync(join(project.root, path))]));
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as Run).outcome, 'complete');
  for (const path of claimed) {
    const stat = lstatSync(join(project.root, path));
    assert.equal(stat.ino, before[path]!.ino, path);
    assert.equal(stat.mtimeMs, before[path]!.mtimeMs, path);
  }
  assert.equal(git(project.root, 'status', '--porcelain', '--', '.agents', '.claude', 'AGENTS.md'), '');
  const state = (JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8')) as State);
  assert.deepEqual(state.skills['.agents/skills/review'], ['SKILL.md', 'scripts/run.sh']);
  for (const system of ['.agents/skills/adopt-standards', '.agents/skills/standards-updates']) {
    assert.deepEqual(state.skills[system], cli.systemSkillFiles.filter(path => path.startsWith(`${system}/`)).map(path => path.slice(system.length + 1)));
  }
  assert.equal(state.baselines['.agents/skills/review/scripts/run.sh']!.executable, true);
  assert.ok(state.baselines['.agents/skills/adopt-standards/SKILL.md']);
});

test('start rejects every invalid initial project state without mutation', async t => {
  const skillSource = yaml.replace('kind: file\n      target: AGENTS.md\n      exact: content.md', 'kind: skill\n      name: review\n      source: skill');
  const packagedSkill = readFileSync(join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills/adopt-standards/SKILL.md'), 'utf8');
  const cases: { name: string; code: string; source?: string; sourceFiles?: Record<string, string>; files?: Record<string, string>; unborn?: boolean; setup?: (root: string) => void }[] = [
    { name: 'no commit', code: 'NO_COMMIT', unborn: true },
    { name: 'dirty working tree', code: 'DIRTY_PROJECT', setup: root => writeFileSync(join(root, 'AGENTS.md'), 'Dirty') },
    { name: 'dirty index', code: 'DIRTY_PROJECT', setup: root => { writeFileSync(join(root, 'AGENTS.md'), 'Staged'); git(root, 'add', '.'); } },
    { name: 'untracked content', code: 'DIRTY_PROJECT', setup: root => writeFileSync(join(root, 'untracked'), 'Local') },
    { name: 'ignored replacement', code: 'UNTRACKED_REPLACEMENT', files: { '.gitignore': 'ignored.md\n', 'ignored.md': 'Local' }, source: yaml.replace('target: AGENTS.md', 'target: ignored.md') },
    { name: 'unsafe target', code: 'UNSAFE_TARGET', setup: root => { rmSync(join(root, 'AGENTS.md')); symlinkSync('README.md', join(root, 'AGENTS.md')); commit(root); } },
    // Only a skill link the product would install is accepted as a link; one
    // shaped like it at an author target is not.
    { name: 'link at a target shaped like a skill link', code: 'UNSAFE_TARGET', source: yaml.replace('target: AGENTS.md', 'target: .claude/skills/notes'),
      setup: root => { mkdirSync(join(root, '.claude/skills'), { recursive: true }); symlinkSync('../../.agents/skills/notes', join(root, '.claude/skills/notes')); commit(root); } },
    { name: 'unsafe ancestor', code: 'UNSAFE_TARGET', source: yaml.replace('target: AGENTS.md', 'target: linked/AGENTS.md'), setup: root => { symlinkSync('folder', join(root, 'linked')); commit(root); } },
    { name: 'wrong target type', code: 'TARGET_TYPE', source: yaml.replace('target: AGENTS.md', 'target: folder') },
    { name: 'case conflict', code: 'CASE_CONFLICT', source: yaml.replace('target: AGENTS.md', 'target: agents.md') },
    { name: 'ignored matching system skill', code: 'UNTRACKED_REPLACEMENT', files: { '.gitignore': '/.agents/\n', '.agents/skills/adopt-standards/SKILL.md': packagedSkill },
      setup: root => cpSync(join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills/adopt-standards'), join(root, '.agents/skills/adopt-standards'), { recursive: true }) },
    { name: 'untracked author skill resource', code: 'UNTRACKED_REPLACEMENT', files: { '.agents/skills/review/SKILL.md': 'Review' }, source: skillSource, setup: root => writeFileSync(join(root, '.agents/skills/review/notes.md'), 'Untracked') },
    { name: 'ignored author skill', code: 'UNTRACKED_REPLACEMENT', files: { '.gitignore': '/.agents/skills/review/\n', '.agents/skills/review/SKILL.md': 'Unrelated review' }, source: skillSource },
    { name: 'ignored system skill resource', code: 'UNTRACKED_REPLACEMENT', files: { '.gitignore': '/.agents/skills/adopt-standards/notes.md\n', '.agents/skills/adopt-standards/notes.md': 'Local' } },
    { name: 'existing product state', code: 'EXISTING_ADOPTION', files: { '.repo-standards/unknown': 'Unrelated' } },
    { name: 'hidden index flags', code: 'HIDDEN_INDEX_STATE', setup: root => git(root, 'update-index', '--assume-unchanged', 'AGENTS.md') },
    { name: 'skip-worktree flags', code: 'HIDDEN_INDEX_STATE', setup: root => git(root, 'update-index', '--skip-worktree', 'AGENTS.md') },
  ];
  for (const example of cases) await t.test(example.name, st => {
    const remote = remoteFixture(example.source ?? yaml, { 'content.md': 'Expected', 'skill/SKILL.md': 'Review', ...example.sourceFiles });
    const project = sourceFixture('', { 'AGENTS.md': 'Original', 'README.md': 'Project', 'folder/file': 'File', ...example.files });
    st.after(() => { remote.close(); project.close(); });
    if (!example.unborn) commit(project.root);
    example.setup?.(project.root);
    const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
    assert.ok(inspection.start.blockers.some((b: { code: string }) => b.code === example.code));
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = (JSON.parse(result.stdout) as ErrorReport);
    assert.equal(report.errors[0]!.code, 'START_BLOCKED');
    assert.ok((report.errors[0]!.details as Diagnostic[]).some((b: { code: string }) => b.code === example.code));
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('initial adoption replaces differing tracked files, author skills, and the system skill, and lists each replacement', async t => {
  const skillSource = yaml.replace('kind: file\n      target: AGENTS.md\n      exact: content.md', 'kind: skill\n      name: review\n      source: skill');
  const packaged = join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills/adopt-standards');
  const packagedSkill = readFileSync(join(packaged, 'SKILL.md'), 'utf8');
  const review = '.agents/skills/review';
  const system = '.agents/skills/adopt-standards';
  const cases: { name: string; files: Record<string, string>; source?: string; sourceFiles?: Record<string, string>; setup?: (root: string) => void; discarded: string[] }[] = [
    { name: 'exact file with differing bytes', files: { 'AGENTS.md': 'Original' }, discarded: ['AGENTS.md'] },
    { name: 'skill with differing bytes', files: { [`${review}/SKILL.md`]: 'Unrelated review' }, source: skillSource, discarded: [review] },
    { name: 'skill with a differing mode', files: { [`${review}/SKILL.md`]: 'Review' }, source: skillSource, setup: root => chmodSync(join(root, review, 'SKILL.md'), 0o755), discarded: [review] },
    { name: 'skill with an additional resource', files: { [`${review}/SKILL.md`]: 'Review', [`${review}/notes.md`]: 'Local' }, source: skillSource, discarded: [review] },
    { name: 'skill missing a supplied resource', files: { [`${review}/SKILL.md`]: 'Review' }, source: skillSource, sourceFiles: { 'skill/notes.md': 'Supplied' }, discarded: [review] },
    { name: 'reserved system skill', files: { [`${system}/SKILL.md`]: 'Unrelated' }, source: skillSource, discarded: [system] },
    { name: 'system skill with a differing mode', files: { [`${system}/SKILL.md`]: packagedSkill }, source: skillSource,
      setup: root => { cpSync(packaged, join(root, system), { recursive: true }); chmodSync(join(root, system, 'SKILL.md'), 0o755); }, discarded: [system] },
    { name: 'system skill with an additional resource', files: { [`${system}/SKILL.md`]: packagedSkill, [`${system}/notes.md`]: 'Local' }, source: skillSource,
      setup: root => cpSync(packaged, join(root, system), { recursive: true }), discarded: [system] },
    { name: 'system skill and author skill together', files: { [`${system}/SKILL.md`]: 'Unrelated', [`${review}/SKILL.md`]: 'Unrelated review' }, source: skillSource, discarded: [system, review] },
  ];
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  for (const example of cases) await t.test(example.name, st => {
    const sourceFiles = { 'content.md': 'Expected', 'skill/SKILL.md': 'Review', ...example.sourceFiles };
    const remote = remoteFixture(example.source ?? yaml, sourceFiles);
    const project = sourceFixture('', { 'README.md': 'Project', ...example.files });
    st.after(() => { remote.close(); project.close(); });
    example.setup?.(project.root);
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    const inspected = cli.run(inspectionArgs, project.root, env);
    assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
    const inspection = (JSON.parse(inspected.stdout) as Inspection);
    assert.deepEqual(inspection.start.blockers, []);
    assert.equal(inspection.start.eligible, true);
    assert.deepEqual(inspection.discardedEdits, example.discarded);
    const summary = cli.run(inspectionArgs.filter(argument => argument !== '--json').concat('--summary'), project.root, env);
    assert.equal(summary.status, 0, summary.stdout + summary.stderr);
    assert.ok(summary.stdout.includes(['## Discarded edits', '',
      'Replacing or removing these targets discards content that is not their installed baseline:', '',
      example.discarded.map(path => `- \`${path}\``).join('\n')].join('\n')), summary.stdout);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal((JSON.parse(result.stdout) as Run).outcome, 'complete');
    // Each replaced target now holds exactly its candidate: bytes, modes, and inventory.
    if (example.source) assert.deepEqual(installedTree(join(project.root, review)), installedTree(join(remote.source.root, 'skill')));
    else assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Expected');
    assert.deepEqual(installedTree(join(project.root, system)), installedTree(packaged));
  });
});

test('skill links follow target ownership and leave the project its own skills', async t => {
  const skillSource = yaml.replace('kind: file\n      target: AGENTS.md\n      exact: content.md', 'kind: skill\n      name: review\n      source: skill');
  const link = '.claude/skills/review';
  const linkTo = (root: string, path: string, text: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); symlinkSync(text, join(root, path)); };
  // A linked ancestor makes each link unsafe, and, as for any target behind
  // one, leaves nothing tracked at its path.
  const behindLink = ['adopt-standards', 'standards-updates', 'review'].flatMap(name => ['UNSAFE_TARGET', 'UNTRACKED_REPLACEMENT'].map(code => ({ code, path: `.claude/skills/${name}` })));
  const blocked: { name: string; blockers: { code: string; path: string }[]; files?: Record<string, string>; setup: (root: string) => void }[] = [
    { name: 'untracked link', blockers: [{ code: 'DIRTY_PROJECT', path: '' }, { code: 'UNTRACKED_REPLACEMENT', path: link }],
      setup: root => linkTo(root, link, '../../.agents/skills/review') },
    { name: 'ignored file', files: { '.gitignore': `/${link}\n` }, blockers: [{ code: 'UNTRACKED_REPLACEMENT', path: link }],
      setup: root => { mkdirSync(join(root, '.claude/skills'), { recursive: true }); writeFileSync(join(root, link), 'Local'); } },
    { name: 'ignored copy', files: { '.gitignore': '/.claude/\n' }, blockers: [{ code: 'UNTRACKED_REPLACEMENT', path: `${link}/SKILL.md` }],
      setup: root => { mkdirSync(join(root, link), { recursive: true }); writeFileSync(join(root, link, 'SKILL.md'), 'Review'); } },
    { name: 'linked .claude', blockers: behindLink,
      files: { 'elsewhere/skills/notes.md': 'Elsewhere' }, setup: root => { symlinkSync('elsewhere', join(root, '.claude')); commit(root); } },
    { name: 'linked .claude/skills', blockers: behindLink,
      files: { 'elsewhere/notes.md': 'Elsewhere' }, setup: root => { linkTo(root, '.claude/skills', '../elsewhere'); commit(root); } },
    { name: 'link with other text', blockers: [{ code: 'UNSAFE_TARGET', path: link }],
      setup: root => { linkTo(root, link, '../../elsewhere'); commit(root); } },
  ];
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  for (const example of blocked) await t.test(example.name, st => {
    const remote = remoteFixture(skillSource, { 'skill/SKILL.md': 'Review' });
    const project = sourceFixture('', { 'README.md': 'Project', ...example.files });
    st.after(() => { remote.close(); project.close(); });
    commit(project.root);
    example.setup(project.root);
    const env = { ...remote.env, ...registry.env };
    const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
    assert.deepEqual(inspection.start.blockers.map(({ code, path }: { code: string; path?: string }) => ({ code, path: path ?? '' })), example.blockers);
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, 'START_BLOCKED');
    assert.deepEqual(snapshot(project.root), before);
  });

  await t.test('tracked content is replaced and listed, and the project keeps its own skills', st => {
    const remote = remoteFixture(skillSource, { 'skill/SKILL.md': 'Review' });
    const project = sourceFixture('', { 'README.md': 'Project', [`${link}/SKILL.md`]: 'Hand-made copy', '.claude/skills/adopt-standards': 'Placeholder',
      '.agents/skills/mine/SKILL.md': 'Mine', '.claude/skills/notes.md': 'Notes', '.claude/settings.json': '{}\n' });
    st.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const env = { ...remote.env, ...registry.env };
    const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
    assert.deepEqual(inspection.start.blockers, []);
    assert.deepEqual(inspection.systemSkills.map(({ link }: { link: unknown }) => link), [
      { target: '.claude/skills/adopt-standards', action: 'replace' }, { target: '.claude/skills/standards-updates', action: 'create' }]);
    assert.deepEqual(inspection.exact[0]!.link, { target: link, action: 'replace' });
    assert.deepEqual(inspection.discardedEdits, ['.claude/skills/adopt-standards', link]);
    const summary = cli.run(inspectionArgs.filter(argument => argument !== '--json').concat('--summary'), project.root, env).stdout;
    for (const row of ['| `instructions` | `.agents/skills/review/SKILL.md` | created |\n| `instructions` | `.claude/skills/review` | replaced |',
      '| `adopt-standards` | `.claude/skills/adopt-standards` | replaced |', '| `standards-updates` | `.claude/skills/standards-updates` | created |']) assert.ok(summary.includes(row), summary);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal((JSON.parse(result.stdout) as Run).outcome, 'complete');
    for (const name of ['adopt-standards', 'review', 'standards-updates']) assert.equal(readlinkSync(join(project.root, `.claude/skills/${name}`)), `../../.agents/skills/${name}`);
    assert.deepEqual(readdirSync(join(project.root, '.claude/skills')).sort(), ['adopt-standards', 'notes.md', 'review', 'standards-updates']);
    assert.equal(readFileSync(join(project.root, '.claude/skills/notes.md'), 'utf8'), 'Notes');
    assert.equal(readFileSync(join(project.root, '.agents/skills/mine/SKILL.md'), 'utf8'), 'Mine');
    const state = (JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8')) as State);
    assert.deepEqual(Object.keys(state.links), ['.claude/skills/adopt-standards', '.claude/skills/standards-updates', link]);
    assert.deepEqual(state.changeSet.map(({ path }: { path: string }) => path).filter((path: string) => path.startsWith('.claude/')),
      ['.claude/skills/adopt-standards', '.claude/skills/review', '.claude/skills/review/SKILL.md', '.claude/skills/standards-updates']);
    assert.equal(git(project.root, 'status', '--porcelain', '--', '.claude/settings.json', '.claude/skills/notes.md', '.agents/skills/mine'), '');
  });
});

test('start rejects stale identities, project content and profile selection', async t => {
  for (const change of ['identity', 'content', 'profile']) await t.test(change, st => {
    const remote = remoteFixture(yaml + '  other:\n    description: Other\n    declarations: {}\n', { 'content.md': 'Expected' });
    const project = sourceFixture('', { 'AGENTS.md': 'Original' });
    st.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
    if (change === 'content') writeFileSync(join(project.root, 'AGENTS.md'), 'Changed');
    const before = snapshot(project.root);
    const args = change === 'profile' ? inspectionArgs.map(arg => arg === 'work' ? 'other' : arg) : inspectionArgs;
    const result = cli.run(['start', ...args.slice(1), '--confirm', change === 'identity' ? 'sha256:wrong' : inspection.identity], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, 'STALE_INSPECTION');
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('a confirmation survives an unrelated commit and the run records HEAD at start', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('', { 'README.md': 'Project' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  writeFileSync(join(project.root, 'unrelated.txt'), 'Unrelated work');
  commit(project.root);
  const head = git(project.root, 'rev-parse', 'HEAD');
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const run = (JSON.parse(result.stdout) as Run);
  assert.equal(run.outcome, 'complete');
  assert.equal(run.inspection, inspection.identity);
  assert.equal(run.head, head);
  assert.equal((JSON.parse(readFileSync(join(project.root, '.repo-standards/local/run.json'), 'utf8')) as Run).head, head);
  assert.equal((JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status).lastComplete.head, head);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Expected');

  // On the established project, the identity binds retained inputs and the
  // product-state inventory, and still not HEAD.
  commit(project.root);
  const identity = () => (JSON.parse(cli.run(['inspect', '--json'], project.root, env).stdout) as Inspection).identity;
  const established = identity();
  writeFileSync(join(project.root, 'unrelated.txt'), 'More unrelated work');
  commit(project.root);
  assert.equal(identity(), established);
  const input = join(project.root, '.repo-standards/inputs/source/content.md');
  writeFileSync(input, 'Edited retained input');
  assert.notEqual(identity(), established);
  writeFileSync(input, 'Expected');
  assert.equal(identity(), established);
  writeFileSync(join(project.root, '.repo-standards/extra.txt'), 'Unexpected product state');
  assert.notEqual(identity(), established);
});

test('a source blob that changed between inspection and start is rejected before mutation', async t => {
  for (const observedTag of [true, false]) await t.test(observedTag ? 'observed tag' : 'fresh tag cache', st => {
    const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
    const project = sourceFixture('', { 'README.md': 'Project' });
    st.after(() => { remote.close(); project.close(); });
    commit(project.root);
    const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
    remote.addVersion('v1.0.0', yaml, { 'content.md': 'Changed after inspection' });
    const env = observedTag ? remote.env : { ...remote.env, XDG_CACHE_HOME: join(remote.support.root, 'fresh-cache') };
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, observedTag ? 'MOVED_TAG' : 'STALE_INSPECTION');
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('the report of an established project with a large tree carries hashes and stays under the capture limit', async t => {
  const references: Record<string, string> = Object.fromEntries(Array.from({ length: 300 }, (_, index) =>
    [`skills/large/references/${index}.md`, `# Reference ${index}\n${'Reference material. '.repeat(200)}\n`]));
  const remote = remoteFixture(yaml.replace('profiles:', `    large:
      kind: skill
      name: large
      source: skills/large
profiles:`), { 'content.md': 'Expected', 'skills/large/SKILL.md': '# Large\nUse the references.\n', ...references });
  const project = sourceFixture('', { 'README.md': 'Project' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const initial = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const adopted = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env);
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
  commit(project.root);
  const limit = 1024 * 1024;
  assert.ok(Object.values(references).reduce((total, text) => total + text.length, 0) > limit, 'One copy of the tree exceeds the capture limit');
  // Node's default capture buffer, as an agent's tool or script would use it.
  const capture = (args: string[]) => spawnSync(join(cli.root, 'node_modules/.bin/repo-standards'), args, { cwd: project.root, env, encoding: 'utf8' });
  const retained = capture(['inspect', '--json']);
  assert.equal(retained.error, undefined);
  assert.equal(retained.status, 0, retained.stderr);
  assert.ok(retained.stdout.length < limit, `${retained.stdout.length} bytes`);
  const report = (JSON.parse(retained.stdout) as Inspection);
  assert.deepEqual(embeddedContent(report), []);
  const skill = report.exact.find((entry: { id: string }) => entry.id === 'large');
  assert.equal(skill!.action, 'match');
  assert.deepEqual(skill!.files.find((file: { path: string }) => file.path === '.agents/skills/large/references/7.md'),
    { path: '.agents/skills/large/references/7.md', before: { type: 'file', sha256: sha256(references['skills/large/references/7.md']!), executable: false },
      after: { type: 'file', sha256: sha256(references['skills/large/references/7.md']!), executable: false } });
  assert.equal((((report.inputs['skills/large']! as DirectoryInventory).entries.references! as DirectoryInventory).entries['7.md']! as FileInventory).sha256, sha256(references['skills/large/references/7.md']!));
  assert.equal((((((((report.project.productState as DirectoryInventory).entries.inputs! as DirectoryInventory).entries.source! as DirectoryInventory).entries.skills! as DirectoryInventory).entries.large! as DirectoryInventory).entries.references! as DirectoryInventory).entries['7.md']! as FileInventory).sha256,
    sha256(references['skills/large/references/7.md']!));
  const started = capture(['start', '--confirm', report.identity, '--json']);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  const run = (JSON.parse(started.stdout) as Run);
  assert.equal(run.outcome, 'complete');
  assert.deepEqual(embeddedContent(run), []);
  assert.equal(readFileSync(join(project.root, '.agents/skills/large/references/7.md'), 'utf8'), references['skills/large/references/7.md']);
  const status = capture(['status', '--json']);
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(embeddedContent((JSON.parse(status.stdout) as Status)), []);
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
    const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
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
    const report = (JSON.parse(result.stdout) as Run);
    assert.equal(report.outcome, 'incomplete');
    assert.equal(report.phase, 'verification');
    assert.match(report.reason, /FINAL_INTEGRITY/);
    assert.ok(report.changes.includes('AGENTS.md'));
    assert.ok(report.completed.includes('AGENTS.md'));
    assert.ok(report.uncertain.length > 0);
    if (['skill addition', 'retained input addition', 'product addition'].includes(mutation)) assert.ok(report.changes.includes(path.slice(project.root.length + 1)), 'Actual unexpected changes must appear in the incomplete report');
    assert.match(report.nextAction, /review|Review/);
    assert.equal(existsSync(join(project.root, '.repo-standards/state.json')), false);
    const status = (JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status);
    assert.equal(status.lastComplete, null);
    assert.equal(status.active!.id, report.id);
    const before = snapshot(project.root);
    const another = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(another.status, 1);
    assert.equal((JSON.parse(another.stdout) as ErrorReport).errors[0]!.code, 'ACTIVE_RUN');
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('only one process can hold an active adoption run', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const args = ['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity];
  const competingResult = join(remote.support.root, 'competitor.json');
  const fault = filesystemFault(remote.support.root, env, 'runtime', `
    const result = spawnSync(${JSON.stringify(join(cli.root, 'node_modules/.bin/repo-standards'))}, ${JSON.stringify(args)}, {cwd: ${JSON.stringify(project.root)}, env: process.env, encoding: 'utf8'});
    write(${JSON.stringify(competingResult)}, JSON.stringify({status: result.status, report: JSON.parse(result.stdout)}));`);
  const result = cli.run(args, project.root, fault);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const competitor = (JSON.parse(readFileSync(competingResult, 'utf8')) as { status: number; report: ErrorReport });
  assert.equal(competitor.status, 1);
  assert.equal(competitor.report.errors[0]!.code, 'ACTIVE_RUN');
  assert.equal((JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status).active, null);
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
    const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
    const path = join(project.root, target);
    const fault = filesystemFault(remote.support.root, env, 'runtime', change === 'symlink'
      ? `fs.symlinkSync('README.md', ${JSON.stringify(path)});` : `write(${JSON.stringify(path)}, 'External change');`);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, fault);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = (JSON.parse(result.stdout) as Run);
    assert.equal(report.outcome, 'incomplete');
    assert.match(report.reason, /STALE_INSPECTION/);
    assert.deepEqual(report.changes, []);
    assert.equal(existsSync(join(project.root, '.repo-standards')), false);
    assert.equal(readFileSync(join(project.root, 'README.md'), 'utf8'), 'Project');
    assert.equal((JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status).active, null);
  });
});

test('unsafe targets introduced during installation are rechecked before each write', async t => {
  const remote = remoteFixture(yaml.replace('target: AGENTS.md', 'target: folder/AGENTS.md'), { 'content.md': 'Expected' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const before = snapshot(remote.source.root);
  const fault = filesystemFault(remote.support.root, env, 'installation', `fs.symlinkSync(${JSON.stringify(remote.source.root)}, ${JSON.stringify(join(project.root, 'folder'))});`);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, fault);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match((JSON.parse(result.stdout) as Run).reason, /UNSAFE_TARGET/);
  assert.deepEqual(snapshot(remote.source.root), before);
});

test('a link ancestor replaced just before a skill link is written is caught before any directory is created through it', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  const elsewhere = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); elsewhere.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  // The last filesystem call before a link's parent directories are created
  // probes its staged link; at that moment .claude becomes a link elsewhere.
  const fault = filesystemFault(remote.support.root, env, 'installation', `
const lstat = fs.lstatSync;
let swapped = false;
fs.lstatSync = function(path, ...args) {
  if (!swapped && String(path).startsWith(${JSON.stringify(join(project.root, '.claude/skills/.repo-standards-'))})) {
    swapped = true;
    fs.symlinkSync(${JSON.stringify(elsewhere.root)}, ${JSON.stringify(join(project.root, '.claude'))});
  }
  return lstat.call(this, path, ...args);
};
syncBuiltinESMExports();`);
  const before = snapshot(elsewhere.root);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, fault);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match((JSON.parse(result.stdout) as Run).reason, /UNSAFE_TARGET/);
  assert.ok(lstatSync(join(project.root, '.claude')).isSymbolicLink());
  assert.deepEqual(snapshot(elsewhere.root), before);
});

test('missing npm and unavailable exact runtime packages leave project content untouched', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
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
    const report = (JSON.parse(result.stdout) as ErrorReport);
    if (unavailable === 'npm') assert.equal(report.errors[0]!.code, 'NPM_REQUIRED');
    else { assert.equal((report as unknown as Run).outcome, 'incomplete'); assert.match((report as unknown as Run).reason, /RUNTIME_INSTALL/); }
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('exact installation preserves binary bytes and executable state and retains only the selected profile', async t => {
  const remote = remoteFixture(yaml + `  other:
    description: Other
    declarations:
      instructions:
        kind: file
        target: AGENTS.md
        exact: other.md
`, { 'content.md': Buffer.from([0xff, 0x00, 0x80, 0x0a]), 'other.md': 'Other profile material' }, ['content.md']);
  const project = sourceFixture('', { 'AGENTS.md': 'Old bytes' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readFileSync(join(project.root, 'AGENTS.md')), Buffer.from([0xff, 0x00, 0x80, 0x0a]));
  assert.equal(lstatSync(join(project.root, 'AGENTS.md')).mode & 0o111, 0o111);
  const state = (JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8')) as State);
  assert.equal(state.baselines['AGENTS.md']!.executable, true);
  assert.equal(existsSync(join(project.root, '.repo-standards/inputs/source/other.md')), false);
  assert.doesNotMatch(readFileSync(join(project.root, '.repo-standards/inputs/standards.yaml'), 'utf8'), /other/);
});

test('an empty exact profile remains inspectable from retained metadata', async t => {
  const remote = remoteFixture(yaml.replace('  declarations:\n    instructions:\n      kind: file\n      target: AGENTS.md\n      exact: content.md', '  declarations: {}'));
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const retained = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(retained.status, 0, retained.stdout.slice(0, 2000) + retained.stderr);
  assert.deepEqual((JSON.parse(retained.stdout) as Inspection).exact, []);
});

test('retained inspection preserves selected source manifests and rejects altered retained or last-complete evidence', async t => {
  const source = yaml.replace('exact: content.md', 'exact: standards.yaml');
  const remote = remoteFixture(source);
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), source);
  let retained = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(retained.status, 0, retained.stdout.slice(0, 2000) + retained.stderr);
  assert.equal(((JSON.parse(retained.stdout) as Inspection).exact[0]!.files[0]!.after as FileInventory).sha256, sha256(source));
  writeFileSync(join(project.root, 'AGENTS.md'), 'Local edit after adoption');
  assert.equal((JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status).lastComplete.inspection, inspection.identity);
  assert.equal((JSON.parse(cli.run(['inspect', '--json'], project.root, env).stdout) as Inspection).exact[0]!.action, 'replace');
  const input = join(project.root, '.repo-standards/inputs/source/standards.yaml');
  writeFileSync(input, 'Corrupted retained content');
  const before = snapshot(project.root);
  retained = cli.run(['inspect', '--json'], project.root, env);
  assert.equal(retained.status, 1);
  assert.equal((JSON.parse(retained.stdout) as ErrorReport).errors[0]!.code, 'STATE_INTEGRITY');
  assert.deepEqual(snapshot(project.root), before);
  writeFileSync(input, source);
  const statePath = join(project.root, '.repo-standards/state.json');
  const state = (JSON.parse(readFileSync(statePath, 'utf8')) as State);
  state.lastComplete.inspection = 'sha256:forged';
  writeFileSync(statePath, JSON.stringify(state));
  const status = cli.run(['status', '--json'], project.root, env);
  assert.equal(status.status, 1);
  assert.equal((JSON.parse(status.stdout) as ErrorReport).errors[0]!.code, 'STATE_INTEGRITY');
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
    const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = (JSON.parse(result.stdout) as Run);
    assert.equal(report.outcome, 'incomplete');
    assert.match(report.reason, /IGNORED_OUTPUT/);
    assert.equal(existsSync(join(project.root, '.repo-standards/state.json')), false);
  });
});

test('changes to unrelated tracked content during the final source acquisition invalidate confirmation before mutation', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('', { 'README.md': 'Project' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
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
  assert.match((JSON.parse(result.stdout) as Run).reason, /STALE_INSPECTION/);
  assert.equal(existsSync(join(project.root, '.repo-standards')), false);
  assert.equal(existsSync(join(project.root, 'AGENTS.md')), false);
});

test('incomplete status retains ignored exact files and complete author and system skill changes', async t => {
  const remote = remoteFixture(yaml.replace('profiles:', `    review:
      kind: skill
      name: review
      source: skill
profiles:`), { 'content.md': 'Expected', 'skill/SKILL.md': '# Review', 'skill/resources/check.txt': 'Resource' });
  const project = sourceFixture('', { '.gitignore': 'AGENTS.md\n.agents/\n' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  assert.equal(result.status, 1);
  const report = (JSON.parse(result.stdout) as Run);
  assert.match(report.reason, /IGNORED_OUTPUT/);
  const expected = ['AGENTS.md', '.agents/skills/review/SKILL.md', '.agents/skills/review/resources/check.txt', ...cli.systemSkillFiles];
  for (const path of expected) assert.ok(report.changes.includes(path), `start must report ${path}`);
  writeFileSync(join(project.root, '.agents/skills/review/resources/added.txt'), 'Added after interruption');
  const before = snapshot(project.root);
  const status = (JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status);
  for (const path of [...expected, '.agents/skills/review/resources/added.txt']) assert.ok(status.active!.changes.includes(path), `status must report ${path}`);
  assert.deepEqual(snapshot(project.root), before);
  rmSync(join(project.root, 'AGENTS.md'));
  const reconciled = (JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status);
  assert.ok(!reconciled.active!.changes.includes('AGENTS.md'), 'status must observe reconciliation rather than repeat stale path names');
});

test('runtime acquisition reuses a populated external npm cache with the registry unavailable', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  const support = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); support.close(); });
  commit(project.root);
  const cache = join(support.root, 'npm-cache');
  const env = { ...remote.env, ...registry.env, npm_config_cache: cache };
  execFileSync('npm', ['install', '--prefix', support.root, '--ignore-scripts', '--no-audit', '--no-fund', `@lutzseverino/repo-standards@${cli.version}`], { cwd: support.root, env, stdio: 'pipe' });
  registry.close();
  const offline = { ...env, npm_config_offline: 'true' };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, offline).stdout) as Inspection);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, offline);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as Run).outcome, 'complete');
});

test('runtime cache configuration cannot write inside the adopting project through direct or linked paths', t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('', { '.gitignore': 'npm-cache/\n' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
  const alias = join(remote.support.root, 'project-alias');
  symlinkSync(project.root, alias);
  for (const cache of [join(project.root, 'npm-cache'), join(alias, 'npm-cache')]) {
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, { ...remote.env, npm_config_cache: cache });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match((JSON.parse(result.stdout) as Run).reason, /UNSAFE_CACHE/);
    assert.deepEqual(snapshot(project.root), before);
  }
});

test('a final report persistence failure retains incomplete evidence and recovery guidance', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const loader = join(remote.support.root, 'report-failure.mjs');
  writeFileSync(loader, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync;
let failed = false;
fs.writeFileSync = function(path, data, ...args) {
  let report;
  try { report = JSON.parse(String(data)); } catch {}
  if (!failed && String(path).includes('/.repo-standards/local/') && report?.format === 'repo-standards/run/v6' && report.outcome === 'complete') {
    failed = true;
    throw Object.assign(new Error('No space for final run report'), {code: 'ENOSPC'});
  }
  return write.call(this, path, data, ...args);
};
syncBuiltinESMExports();
`);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS} --import=${pathToFileURL(loader).href}` });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as Run);
  assert.equal(report.outcome, 'incomplete');
  assert.equal(report.phase, 'completion');
  assert.ok(report.uncertain.length > 0);
  assert.match(report.nextAction, /incomplete adoption/);
  assert.equal(existsSync(join(project.root, '.repo-standards/state.json')), false);
  assert.equal(existsSync(join(project.root, '.repo-standards/local/incomplete-state.json')), true);
  assert.equal(readFileSync(join(project.root, 'AGENTS.md'), 'utf8'), 'Expected');
  const status = (JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status);
  assert.equal(status.lastComplete, null);
  assert.equal(status.active!.outcome, 'incomplete');
});

test('npm cache child symlinks cannot redirect acquisition content or logs into the project', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
  for (const child of ['_logs', '_cacache', '_cacache/index-v5/aa']) await t.test(child, () => {
    const cache = join(remote.support.root, child.replaceAll('/', '-') + '-cache');
    mkdirSync(join(cache, child, '..'), { recursive: true });
    symlinkSync(project.root, join(cache, child));
    const before = snapshot(project.root);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, { ...remote.env, npm_config_cache: cache, npm_config_offline: 'true' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match((JSON.parse(result.stdout) as Run).reason, child === '_logs' ? /RUNTIME_INSTALL/ : /UNSAFE_CACHE/);
    assert.deepEqual(snapshot(project.root), before);
  });
});

test('a failed initial ignore-file write preserves the run without exposing local reports to Git', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
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
  const report = (JSON.parse(result.stdout) as Run);
  assert.equal(report.outcome, 'incomplete');
  assert.equal(existsSync(join(project.root, '.repo-standards/local/run.json')), false);
  assert.equal((JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status).active!.id, report.id);
});

test('status recovers ignored installed targets after the adoption process is interrupted', async t => {
  const remote = remoteFixture(yaml, { 'content.md': 'Expected' });
  const project = sourceFixture('', { '.gitignore': 'AGENTS.md\n.agents/\n' });
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = (JSON.parse(cli.run(inspectionArgs, project.root, env).stdout) as Inspection);
  const fault = filesystemFault(remote.support.root, { ...env, TMPDIR: remote.support.root }, 'verification', 'process.kill(process.pid, "SIGKILL");');
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, fault);
  assert.equal(result.signal, 'SIGKILL');
  const before = snapshot(project.root);
  const status = (JSON.parse(cli.run(['status', '--json'], project.root, env).stdout) as Status);
  assert.equal(status.lastComplete, null);
  assert.equal(status.active!.outcome, 'incomplete');
  for (const path of ['AGENTS.md', ...cli.systemSkillFiles]) assert.ok(status.active!.changes.includes(path), path);
  assert.deepEqual(snapshot(project.root), before);
});
