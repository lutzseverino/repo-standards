import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync, lstatSync, writeFileSync, mkdirSync, symlinkSync, chmodSync, utimesSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';

const cli = installCli();
after(() => cli.close());

const simpleSource = (target = 'AGENTS.md') => `format: repo-standards/v1
name: test-standards
description: Inspection fixture
requires: {repo-standards: ">=1.0.0 <2.0.0"}
defaults:
  declarations:
    instructions:
      kind: file
      target: ${target}
      exact: content.md
profiles:
  work:
    description: Work
    declarations: {}
`;

test('inspection reports the pinned complete profile without changing a dirty project or executing author code', (t) => {
  const yaml = readFileSync('examples/alice/standards.yaml', 'utf8').replace('executable: python3', 'executable: ./probe').replace('resources: []', 'resources: [payload.json, resources]');
  const files: Record<string, string> = { 'payload.json': '{"key": 42}', 'resources/support.txt': 'Operation resource' };
  for (const path of ['defaults/files/AGENTS.md', 'defaults/files/CONTRIBUTING.md', 'defaults/guidance/readme.md', 'defaults/guidance/source-layout.md', 'defaults/checks/readme.py', 'defaults/skills/review/SKILL.md', 'profiles/work/files/AGENTS.md']) {
    files[path] = readFileSync(join('examples/alice', path), 'utf8');
  }
  const remote = remoteFixture(yaml, files);
  const project = sourceFixture('', { 'README.md': 'Project README', 'CONTRIBUTING.md': 'Employer content', 'AGENTS.md': 'Old guidance', 'probe': '#!/bin/sh\ntouch SENTINEL\necho 3.12.0\n' });
  t.after(() => { remote.close(); project.close(); });
  chmodSync(join(project.root, 'probe'), 0o755);
  commit(project.root);
  writeFileSync(join(project.root, 'README.md'), 'Uncommitted project README');
  writeFileSync(join(project.root, 'untracked'), 'Untracked content');
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.selection.cli.version, '1.0.0');
  assert.deepEqual(report.selection.standards, { repository: 'https://github.com/alice/standards', version: 'v1.0.0', commit: remote.sha });
  assert.equal(report.selection.profile, 'work');
  assert.deepEqual(report.resolved.declarations.map((d: { id: string }) => d.id), ['agent-guidance', 'readme', 'review-skill', 'source-layout']);
  assert.equal(report.exact.find((d: { id: string }) => d.id === 'agent-guidance').action, 'replace');
  assert.equal(report.exact.find((d: { id: string }) => d.id === 'agent-guidance').files[0].after.content, files['profiles/work/files/AGENTS.md']);
  assert.equal(report.guidance[0].content, files['defaults/guidance/readme.md']);
  assert.equal(report.operations[0].run.executable, './probe');
  assert.equal(report.operations[0].prerequisite.status, 'not-checked');
  assert.equal(report.operations[0].script.content, files['defaults/checks/readme.py']);
  assert.equal(report.operations[0].resources[0].content.content, files['payload.json']);
  assert.equal(report.operations[0].resources[1].content.entries['support.txt'].content, files['resources/support.txt']);
  assert.equal(report.start.eligible, false);
  assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'DIRTY_PROJECT'));
  assert.equal(report.project.head, git(project.root, 'rev-parse', 'HEAD'));
  assert.match(report.identity, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(snapshot(project.root), before);
  git(project.root, 'add', '.');
  commit(project.root);
  const pending = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  assert.equal(pending.start.eligible, null, 'Author prerequisites remain unverified even in a clean project');
});

test('unsafe ancestors, skill ownership and ignored replacement content block start without following links', (t) => {
  const remote = remoteFixture(simpleSource('linked/AGENTS.md') + '', { 'content.md': 'Expected' });
  const project = sourceFixture('', { '.gitignore': 'ignored.md\n', 'ignored.md': 'Ignored private content', '.agents/skills/review/SKILL.md': 'Unrelated skill' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  symlinkSync(remote.source.root, join(project.root, 'linked'));
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'UNSAFE_TARGET'), result.stdout);
  assert.equal(report.project.affected['linked/AGENTS.md'].type, 'unsafe');
  assert.deepEqual(snapshot(project.root), before);
  unlinkSync(join(project.root, 'linked'));
  symlinkSync(remote.support.root, join(project.root, 'linked'));
  assert.notEqual(JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout).identity, report.identity);

  const skillSource = simpleSource().replace('kind: file\n      target: AGENTS.md\n      exact: content.md', 'kind: skill\n      name: review\n      source: skill');
  const skillRemote = remoteFixture(skillSource, { 'skill/SKILL.md': 'Unrelated skill' });
  t.after(() => skillRemote.close());
  const skillReport = JSON.parse(cli.run(inspectionArgs, project.root, skillRemote.env).stdout);
  assert.ok(skillReport.start.blockers.some((b: { code: string }) => b.code === 'SKILL_CONFLICT'));

  const ignoredRemote = remoteFixture(simpleSource('ignored.md'), { 'content.md': 'New content' });
  t.after(() => ignoredRemote.close());
  const ignoredReport = JSON.parse(cli.run(inspectionArgs, project.root, ignoredRemote.env).stdout);
  assert.ok(ignoredReport.start.blockers.some((b: { code: string }) => b.code === 'UNTRACKED_REPLACEMENT'));
});

test('inspection identity is stable and changes with affected bytes, executable state, index content, HEAD and profile', (t) => {
  const remote = remoteFixture(simpleSource() + '  other:\n    description: Other\n    declarations: {}\n', { 'content.md': 'Expected' });
  const project = sourceFixture('', { 'AGENTS.md': 'Expected' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const inspect = (args = inspectionArgs) => {
    const result = cli.run(args, project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout);
  };
  const first = inspect();
  assert.equal(first.start.eligible, true);
  assert.equal(first.exact[0].action, 'match');
  assert.equal(inspect().identity, first.identity);
  assert.notEqual(inspect(inspectionArgs.map(arg => arg === 'work' ? 'other' : arg)).identity, first.identity);
  writeFileSync(join(project.root, 'AGENTS.md'), 'Changed once');
  const changed = inspect();
  assert.notEqual(changed.identity, first.identity);
  writeFileSync(join(project.root, 'AGENTS.md'), 'Changed twice');
  assert.notEqual(inspect().identity, changed.identity);
  chmodSync(join(project.root, 'AGENTS.md'), 0o755);
  const executable = inspect();
  assert.equal(executable.exact[0].files[0].before.executable, true);
  git(project.root, 'add', 'AGENTS.md');
  const staged = inspect();
  assert.notEqual(staged.identity, executable.identity);
  // The same working bytes and porcelain status can conceal different index bytes.
  writeFileSync(join(project.root, 'AGENTS.md'), 'Index one');
  git(project.root, 'add', 'AGENTS.md');
  writeFileSync(join(project.root, 'AGENTS.md'), 'Working bytes');
  const indexOne = inspect();
  writeFileSync(join(project.root, 'AGENTS.md'), 'Index two');
  git(project.root, 'add', 'AGENTS.md');
  writeFileSync(join(project.root, 'AGENTS.md'), 'Working bytes');
  const indexTwo = inspect();
  assert.equal(indexOne.project.status, indexTwo.project.status);
  assert.notEqual(indexOne.identity, indexTwo.identity);
  commit(project.root);
  assert.notEqual(inspect().identity, indexTwo.identity);
});

test('inspection reports unborn Git state and type, case, reserved-state and untracked conflicts', (t) => {
  const remote = remoteFixture(simpleSource('agents.md'), { 'content.md': 'Expected' });
  const project = sourceFixture('', { 'AGENTS.md': 'Existing' });
  t.after(() => { remote.close(); project.close(); });
  const report = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'NO_COMMIT'));
  assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'CASE_CONFLICT'));
  const directoryRemote = remoteFixture(simpleSource('folder'), { 'content.md': 'Expected' });
  t.after(() => directoryRemote.close());
  mkdirSync(join(project.root, 'folder'));
  mkdirSync(join(project.root, '.repo-standards'));
  const directoryReport = JSON.parse(cli.run(inspectionArgs, project.root, directoryRemote.env).stdout);
  for (const code of ['TARGET_TYPE', 'UNTRACKED_REPLACEMENT', 'EXISTING_ADOPTION']) assert.ok(directoryReport.start.blockers.some((b: { code: string }) => b.code === code));
});

test('Git flags that hide local changes cannot make an unsafe replacement start-eligible', (t) => {
  const remote = remoteFixture(simpleSource(), { 'content.md': 'Expected' });
  const project = sourceFixture('', { 'AGENTS.md': 'Tracked baseline' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  git(project.root, 'update-index', '--assume-unchanged', 'AGENTS.md');
  writeFileSync(join(project.root, 'AGENTS.md'), 'Hidden local changes');
  assert.equal(git(project.root, 'status', '--porcelain'), '');
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.start.eligible, false);
  assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'HIDDEN_INDEX_STATE'));
});

test('contextual path names cannot disappear from the inspection identity', (t) => {
  const remote = remoteFixture(simpleSource('__proto__').replace('exact: content.md', 'guidance: content.md'), { 'content.md': 'Adapt this project-owned file' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  writeFileSync(join(project.root, '__proto__'), 'First');
  commit(project.root);
  writeFileSync(join(project.root, '__proto__'), 'Dirty content one');
  const first = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  writeFileSync(join(project.root, '__proto__'), 'Dirty content two');
  const second = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  assert.notEqual(first.identity, second.identity);
});

test('inspection never executes Git clean filters while observing dirty tracked content', (t) => {
  const remote = remoteFixture(simpleSource(), { 'content.md': 'Expected' });
  const project = sourceFixture('', { '.gitattributes': 'filtered.txt filter=side-effect\n', 'filtered.txt': 'original' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  git(project.root, 'config', 'filter.side-effect.clean', 'touch INSPECTION_MUTATED; cat');
  const path = join(project.root, 'filtered.txt');
  const stat = lstatSync(path);
  writeFileSync(path, 'modified');
  utimesSync(path, stat.atime, new Date(0));
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(snapshot(project.root), before);
});

test('contextual files and repository directory trees reject incompatible existing target types', (t) => {
  const project = sourceFixture('', { 'README.md/child.txt': 'Directory content', 'src': 'A file' });
  t.after(() => project.close());
  commit(project.root);
  for (const declaration of [
    'kind: file\n      target: README.md\n      guidance: content.md',
    'kind: repository\n      guidance: content.md\n      targets: {paths: [], directories: [src]}',
  ]) {
    const remote = remoteFixture(simpleSource().replace('kind: file\n      target: AGENTS.md\n      exact: content.md', declaration), { 'content.md': 'Guidance' });
    t.after(() => remote.close());
    const report = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
    assert.equal(report.start.eligible, false);
    assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'TARGET_TYPE'));
  }
});
