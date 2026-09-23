import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync, readdirSync, lstatSync, writeFileSync, mkdirSync, symlinkSync, chmodSync, utimesSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { embeddedContent, installCli, sha256, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';

const cli = installCli();
after(() => cli.close());

const simpleSource = (target = 'AGENTS.md') => `format: repo-standards/v2
name: test-standards
description: Inspection fixture
requires: {repo-standards: ">=1.0.0"}
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
  assert.equal(report.selection.cli.version, cli.version);
  assert.deepEqual(report.selection.standards, { repository: 'https://github.com/alice/standards', version: 'v1.0.0', commit: remote.sha });
  assert.equal(report.selection.profile, 'work');
  assert.deepEqual(report.resolved.declarations.map((d: { id: string }) => d.id), ['agent-guidance', 'readme', 'review-skill', 'source-layout']);
  assert.equal(report.format, 'repo-standards/inspection/v4');
  assert.deepEqual(embeddedContent(report), [], 'Reports reference content by hash and carry changes as diffs');
  const agents = report.exact.find((d: { id: string }) => d.id === 'agent-guidance');
  assert.equal(agents.action, 'replace');
  assert.deepEqual(agents.files[0].before, { type: 'file', sha256: sha256('Old guidance'), executable: false });
  assert.deepEqual(agents.files[0].after, { type: 'file', sha256: sha256(files['profiles/work/files/AGENTS.md']!), executable: false });
  assert.match(agents.files[0].diff, /^--- a\/AGENTS\.md\n\+\+\+ b\/AGENTS\.md\n@@ -1 \+1(,\d+)? @@\n-Old guidance\n\\ No newline at end of file\n\+/);
  assert.deepEqual(report.guidance[0], { id: 'readme', targets: ['README.md'], source: 'defaults/guidance/readme.md', sha256: sha256(files['defaults/guidance/readme.md']!), executable: false });
  assert.equal(report.operations[0].run.executable, './probe');
  assert.equal(report.operations[0].prerequisite.status, 'not-checked');
  assert.deepEqual(report.operations[0].script, { path: 'defaults/checks/readme.py', sha256: sha256(files['defaults/checks/readme.py']!), executable: false });
  assert.deepEqual(report.operations[0].resources[0], { path: 'payload.json', type: 'file', sha256: sha256(files['payload.json']!), executable: false });
  assert.equal(report.operations[0].resources[1].entries['support.txt'].sha256, sha256(files['resources/support.txt']!));
  assert.equal(report.inputs['payload.json'].sha256, sha256(files['payload.json']!));
  assert.deepEqual(report.project.affected['README.md'], { type: 'file', sha256: sha256('Uncommitted project README'), executable: false });
  assert.equal(report.start.eligible, false);
  assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'DIRTY_PROJECT'));
  assert.deepEqual(Object.keys(report.project).sort(), ['affected', 'productState', 'root', 'systemSkill'], 'Git HEAD, index and status are not part of the report');
  assert.match(report.identity, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(snapshot(project.root), before);
  git(project.root, 'add', '.');
  commit(project.root);
  const pending = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  assert.equal(pending.start.eligible, null, 'Author prerequisites remain unverified even in a clean project');
});

test('validation and inspection reject reserved skills and targets in an unselected profile with their original locations', (t) => {
  const remote = remoteFixture(simpleSource() + `  other:
    description: Other
    declarations:
      competing:
        kind: skill
        name: author-standards
        source: skill
      competing-file:
        kind: file
        target: .agents/skills/author-standards/SKILL.md
        exact: content.md
`, { 'content.md': 'Standards material', 'skill/SKILL.md': '# Competing skill' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const before = snapshot(project.root);
  const validation = cli.run(['source', 'validate', '--json'], remote.source.root);
  assert.equal(validation.status, 1, validation.stdout + validation.stderr);
  const report = JSON.parse(validation.stdout);
  assert.deepEqual(report.profiles, {});
  const inspection = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(inspection.status, 1, inspection.stdout + inspection.stderr);
  const error = JSON.parse(inspection.stdout).errors[0];
  assert.equal(error.code, 'INVALID_STANDARDS');
  for (const errors of [report.errors, error.details]) {
    assert.deepEqual(errors.map(({ code, path, line, column, profile }: {
      code: string; path: string; line: number; column: number; profile?: string;
    }) => ({ code, path, line, column, profile })), [
      { code: 'RESERVED_NAME', path: '/profiles/other/declarations/competing/name', line: 20, column: 15, profile: undefined },
      { code: 'RESERVED_TARGET', path: '/profiles/other/declarations/competing/name', line: 20, column: 15, profile: undefined },
      { code: 'RESERVED_TARGET', path: '/profiles/other/declarations/competing-file/target', line: 24, column: 17, profile: undefined },
      { code: 'TARGET_OVERLAP', path: '/profiles/other/declarations/competing-file/target', line: 24, column: 17, profile: 'other' },
    ]);
  }
  assert.deepEqual(snapshot(project.root), before);
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
  const skillRemote = remoteFixture(skillSource, { 'skill/SKILL.md': 'Supplied skill' });
  t.after(() => skillRemote.close());
  const skillReport = JSON.parse(cli.run(inspectionArgs, project.root, skillRemote.env).stdout);
  assert.ok(skillReport.start.blockers.some((b: { code: string }) => b.code === 'SKILL_CONFLICT'));

  const ignoredRemote = remoteFixture(simpleSource('ignored.md'), { 'content.md': 'New content' });
  t.after(() => ignoredRemote.close());
  const ignoredReport = JSON.parse(cli.run(inspectionArgs, project.root, ignoredRemote.env).stdout);
  assert.ok(ignoredReport.start.blockers.some((b: { code: string }) => b.code === 'UNTRACKED_REPLACEMENT'));
});

test('inspection identity binds affected bytes, executable state and profile, not the index or HEAD', (t) => {
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
  const twice = inspect();
  assert.notEqual(twice.identity, changed.identity);
  chmodSync(join(project.root, 'AGENTS.md'), 0o755);
  const executable = inspect();
  assert.equal(executable.exact[0].files[0].before.executable, true);
  assert.notEqual(executable.identity, twice.identity);
  // Staging the same working bytes changes only the index, which the run
  // does not read: the dirty tree still blocks start either way.
  git(project.root, 'add', 'AGENTS.md');
  const staged = inspect();
  assert.equal(staged.identity, executable.identity);
  writeFileSync(join(project.root, 'AGENTS.md'), 'Index one');
  git(project.root, 'add', 'AGENTS.md');
  writeFileSync(join(project.root, 'AGENTS.md'), 'Working bytes');
  const indexOne = inspect();
  writeFileSync(join(project.root, 'AGENTS.md'), 'Index two');
  git(project.root, 'add', 'AGENTS.md');
  writeFileSync(join(project.root, 'AGENTS.md'), 'Working bytes');
  const indexTwo = inspect();
  assert.equal(indexOne.identity, indexTwo.identity);
  assert.ok(indexTwo.start.blockers.some((b: { code: string }) => b.code === 'DIRTY_PROJECT'));
  commit(project.root);
  const committed = inspect();
  assert.notEqual(committed.identity, indexTwo.identity, 'Committing removes the dirty-project blocker');
  // Unrelated commits touch nothing the run reads.
  writeFileSync(join(project.root, 'unrelated.txt'), 'Unrelated work');
  commit(project.root);
  git(project.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'Unrelated');
  assert.equal(inspect().identity, committed.identity);
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

test('inspection orders all fixes before checks, declarations by ID and operations by their declared order', (t) => {
  const operation = (id: string) => `        - id: ${id}
          run: {executable: ./probe, script: operation.sh, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=1.0.0"}
          timeout-seconds: 10`;
  const declaration = (id: string) => `    ${id}:
      kind: file
      target: ${id}.md
      exact: content.md
      fixes:
${operation('z-fix')}
${operation('a-fix')}
      checks:
${operation('z-check')}
${operation('a-check')}`;
  const yaml = simpleSource().replace('    instructions:\n      kind: file\n      target: AGENTS.md\n      exact: content.md', `${declaration('beta')}\n${declaration('alpha')}`);
  const remote = remoteFixture(yaml, { 'content.md': 'Expected', 'operation.sh': 'touch AUTHOR_RAN' });
  const project = sourceFixture('', { probe: '#!/bin/sh\ntouch PROBE_RAN\necho 1.0.0\n' });
  t.after(() => { remote.close(); project.close(); });
  chmodSync(join(project.root, 'probe'), 0o755);
  commit(project.root);
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.operations.map((op: {phase: string; declaration: string; id: string}) => `${op.phase}:${op.declaration}:${op.id}`), [
    'fixes:alpha:z-fix', 'fixes:alpha:a-fix', 'fixes:beta:z-fix', 'fixes:beta:a-fix',
    'checks:alpha:z-check', 'checks:alpha:a-check', 'checks:beta:z-check', 'checks:beta:a-check',
  ]);
  assert.deepEqual(snapshot(project.root), before);
});

test('exact changes carry a unified diff for text and before-and-after hashes for binary content', (t) => {
  const yaml = simpleSource().replace('profiles:', `    created:
      kind: file
      target: NEW.md
      exact: new.md
    logo:
      kind: file
      target: logo.bin
      exact: logo.bin
    unchanged:
      kind: file
      target: SAME.md
      exact: same.md
    empty:
      kind: file
      target: EMPTY.md
      exact: empty.md
profiles:`);
  const oldLogo = Buffer.from([0, 1, 2, 255]), newLogo = Buffer.from([0, 1, 3, 255]);
  const remote = remoteFixture(yaml, { 'content.md': 'one\n2\nthree\nfour', 'new.md': 'hello\n', 'logo.bin': newLogo, 'same.md': 'Same\n', 'empty.md': '' });
  const project = sourceFixture('', { 'AGENTS.md': 'one\ntwo\nthree\n', 'logo.bin': oldLogo, 'SAME.md': 'Same\n' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  const files = (id: string) => report.exact.find((entry: { id: string }) => entry.id === id).files;
  const text = (value: string) => ({ type: 'file', sha256: sha256(value), executable: false });
  assert.deepEqual(files('instructions'), [{ path: 'AGENTS.md', before: text('one\ntwo\nthree\n'), after: text('one\n2\nthree\nfour'),
    diff: '--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1,3 +1,4 @@\n one\n-two\n+2\n three\n+four\n\\ No newline at end of file\n' }]);
  assert.deepEqual(files('created'), [{ path: 'NEW.md', before: { type: 'missing' }, after: text('hello\n'),
    diff: '--- /dev/null\n+++ b/NEW.md\n@@ -0,0 +1 @@\n+hello\n' }]);
  assert.deepEqual(files('logo'), [{ path: 'logo.bin', before: { type: 'file', sha256: sha256(oldLogo), executable: false },
    after: { type: 'file', sha256: sha256(newLogo), executable: false }, binary: true }]);
  assert.deepEqual(files('unchanged'), [{ path: 'SAME.md', before: text('Same\n'), after: text('Same\n') }]);
  // A unified diff cannot express creating an empty file; its states do.
  assert.deepEqual(files('empty'), [{ path: 'EMPTY.md', before: { type: 'missing' }, after: text('') }]);
  assert.deepEqual(embeddedContent(report), []);
});

test('exact replacements preserve both root observations when files and directories conflict', (t) => {
  const project = sourceFixture('', { 'AGENTS.md/child.txt': 'Existing directory child', '.agents/skills/review': 'Existing file' });
  const fileRemote = remoteFixture(simpleSource(), { 'content.md': 'Desired file' });
  const skillRemote = remoteFixture(simpleSource().replace('kind: file\n      target: AGENTS.md\n      exact: content.md', 'kind: skill\n      name: review\n      source: skill'), { 'skill/SKILL.md': 'Desired skill' });
  t.after(() => { project.close(); fileRemote.close(); skillRemote.close(); });
  commit(project.root);
  const before = snapshot(project.root);
  const inspect = (remote: ReturnType<typeof remoteFixture>) => {
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.start.eligible, false);
    assert.ok(report.start.blockers.some((blocker: {code: string}) => blocker.code === 'TARGET_TYPE'));
    assert.equal(report.exact[0].action, 'replace');
    return report.exact[0].files;
  };
  const file = inspect(fileRemote).find((entry: {path: string}) => entry.path === 'AGENTS.md');
  assert.ok(file, 'The exact replacement must retain the root directory and desired file');
  assert.equal(file.before.type, 'directory');
  assert.deepEqual(file.before.entries['child.txt'], { type: 'file', sha256: sha256('Existing directory child'), executable: false });
  assert.deepEqual(file.after, { type: 'file', sha256: sha256('Desired file'), executable: false });
  assert.equal(file.diff, undefined, 'A type conflict has no text diff');
  const skill = inspect(skillRemote).find((entry: {path: string}) => entry.path === '.agents/skills/review');
  assert.ok(skill, 'The exact replacement must retain the existing file and desired skill directory');
  assert.deepEqual(skill.before, { type: 'file', sha256: sha256('Existing file'), executable: false });
  assert.equal(skill.after.type, 'directory');
  assert.equal(skill.after.entries['SKILL.md'].sha256, sha256('Desired skill'));
  assert.deepEqual(snapshot(project.root), before);
});


test('case conflicts retain the exact target hashes and bind them into inspection identity', (t) => {
  for (const nested of [false, true]) {
    const target = nested ? 'foo/AGENTS.md' : 'foo';
    const alias = nested ? 'FOO/AGENTS.md' : 'FOO';
    const project = sourceFixture('', { [target]: 'Tracked exact bytes', [alias]: 'Alias bytes' });
    t.after(() => project.close());
    if (!readdirSync(project.root).includes('foo') || !readdirSync(project.root).includes('FOO')) {
      t.skip('Requires a case-sensitive filesystem where both foo and FOO can exist');
      return;
    }
    const remote = remoteFixture(simpleSource(target), { 'content.md': 'Desired file' });
    t.after(() => remote.close());
    commit(project.root);
    writeFileSync(join(project.root, target), 'Dirty exact bytes one');
    const before = snapshot(project.root);
    const inspect = () => {
      const result = cli.run(inspectionArgs, project.root, remote.env);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return JSON.parse(result.stdout);
    };
    const first = inspect();
    assert.deepEqual(snapshot(project.root), before);
    assert.equal(first.start.eligible, false);
    assert.ok(first.start.blockers.some((blocker: {code: string}) => blocker.code === 'CASE_CONFLICT'));
    const obstacles = first.project.affected[target].obstacles;
    assert.ok(obstacles.foo, 'The exact component must be observed alongside its aliases');
    assert.equal(nested ? obstacles.foo.entries['AGENTS.md'].sha256 : obstacles.foo.sha256, sha256('Dirty exact bytes one'));
    assert.equal(nested ? obstacles.FOO.entries['AGENTS.md'].sha256 : obstacles.FOO.sha256, sha256('Alias bytes'));
    writeFileSync(join(project.root, target), 'Dirty exact bytes two');
    const second = inspect();
    assert.notEqual(second.identity, first.identity);
  }
});

test('selected discovery returns a blocked inspection and prevents start without author execution', (t) => {
  const yaml = simpleSource()
    .replace('profiles:', `    documentation:
      kind: repository
      guidance: guidance.md
      discovery: discovery.md
      fixes:
        - id: fix
          run: {executable: ./probe, script: script.js, resources: [], arguments: []}
          prerequisite: {version-arguments: ["--version"], version: ">=24.0.0"}
          timeout-seconds: 5
profiles:`) + `  explicit:
    description: Excludes discovery
    declarations:
      documentation: {exclude: true}
  replacement:
    description: Replaces discovery with explicit scope
    declarations:
      documentation:
        kind: repository
        guidance: guidance.md
        targets: {paths: [README.md], directories: []}
`;
  const remote = remoteFixture(yaml, { 'content.md': 'Exact content', 'guidance.md': 'Improve documentation.',
    'discovery.md': 'Find maintained projects.', 'script.js': 'process.exit(99);' });
  const project = sourceFixture('', { 'probe': '#!/bin/sh\ntouch SENTINEL\necho 24.0.0\n' });
  t.after(() => { remote.close(); project.close(); });
  chmodSync(join(project.root, 'probe'), 0o755);
  commit(project.root);
  const before = snapshot(project.root);
  const discoveryResult = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(discoveryResult.status, 0, discoveryResult.stdout + discoveryResult.stderr);
  const discoveryReport = JSON.parse(discoveryResult.stdout);
  assert.equal(discoveryReport.start.eligible, false);
  assert.ok(discoveryReport.start.blockers.some((blocker: { code: string }) => blocker.code === 'DISCOVERY_REQUIRED'));
  const startResult = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', discoveryReport.identity], project.root, remote.env);
  assert.equal(startResult.status, 1, startResult.stdout + startResult.stderr);
  assert.deepEqual(snapshot(project.root), before);
  for (const profile of ['explicit', 'replacement']) {
    const result = cli.run(inspectionArgs.map(arg => arg === 'work' ? profile : arg), project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.source.format, 'repo-standards/v2');
    assert.equal(report.start.eligible, true);
    assert.deepEqual(report.operations, [], 'Excluding or replacing discovery removes its fixes');
    assert.deepEqual(snapshot(project.root), before);
  }
});
