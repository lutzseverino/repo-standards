import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, inspectionArgs, remoteFixture } from './remote-fixture.ts';

const cli = installCli();
after(() => cli.close());
const yaml = `format: repo-standards/v1
name: public-standards
description: Public standards
requires: {repo-standards: ">=1.0.0 <2.0.0"}
defaults:
  declarations:
    readme:
      kind: file
      target: README.md
      exact: readme.md
profiles:
  work:
    description: Work
    declarations: {}
`;

test('direct inspection resolves annotated tags and canonical repository identity, and rejects moved observations', (t) => {
  const remote = remoteFixture(yaml, { 'readme.md': 'Public standards README' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const annotation = 'a'.repeat(40);
  remote.responses['https://api.github.com/repos/Alice/Standards'] = remote.responses[remote.prefix]!;
  remote.responses[`${remote.prefix}/git/ref/tags/v1.0.0`] = { body: { ref: 'refs/tags/v1.0.0', object: { type: 'tag', sha: annotation } } };
  remote.responses[`${remote.prefix}/git/tags/${annotation}`] = { body: { object: { type: 'commit', sha: remote.sha } } };
  remote.save();
  const result = cli.run(inspectionArgs.map(arg => arg === 'https://github.com/alice/standards' ? 'https://github.com/Alice/Standards.git/' : arg), project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).selection.standards, { repository: 'https://github.com/alice/standards', version: 'v1.0.0', commit: remote.sha });
  remote.responses[`${remote.prefix}/git/tags/${annotation}`] = { body: { object: { type: 'commit', sha: 'b'.repeat(40) } } };
  remote.save();
  const moved = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(moved.status, 1);
  assert.equal(JSON.parse(moved.stdout).errors[0].code, 'MOVED_TAG');
});

test('inspection rejects unsupported sources, floating references and incompatible selections with structured diagnostics', (t) => {
  const remote = remoteFixture(yaml, { 'readme.md': 'README' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  for (const source of [remote.source.root, 'git@github.com:alice/standards.git', 'https://gitlab.com/alice/standards', 'https://github.com/alice/standards/tree/main', 'https://github.com/alice/standards?ref=v1.0.0']) {
    const result = cli.run(inspectionArgs.map(arg => arg === 'https://github.com/alice/standards' ? source : arg), project.root, remote.env);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'UNSUPPORTED_SOURCE', result.stdout);
  }
  for (const version of ['main', 'latest', '^1.0.0', 'v1.0.0-beta.1', '01.0.0', remote.sha]) {
    const result = cli.run(inspectionArgs.map(arg => arg === 'v1.0.0' ? version : arg), project.root, remote.env);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'INVALID_STANDARDS_VERSION');
  }
  const missing = cli.run(inspectionArgs.map(arg => arg === 'work' ? 'missing' : arg), project.root, remote.env);
  assert.equal(JSON.parse(missing.stdout).errors[0].code, 'UNKNOWN_PROFILE');
  const incompatible = remoteFixture(yaml.replace('>=1.0.0 <2.0.0', '>=2.0.0'), { 'readme.md': 'README' });
  t.after(() => incompatible.close());
  const result = cli.run(inspectionArgs, project.root, incompatible.env);
  assert.equal(JSON.parse(result.stdout).errors[0].details[0].code, 'INCOMPATIBLE_CLI');
});

test('private, missing, truncated, linked and corrupt remote snapshots are rejected', (t) => {
  const project = sourceFixture('');
  t.after(() => project.close());
  const cases: [string, (remote: ReturnType<typeof remoteFixture>) => void][] = [
    ['UNSUPPORTED_SOURCE', remote => { remote.responses[remote.prefix] = { body: { private: true, full_name: 'alice/standards' } }; }],
    ['SOURCE_UNAVAILABLE', remote => { remote.responses[remote.prefix] = { status: 404, body: {} }; }],
    ['INVALID_SOURCE', remote => { (remote.responses[`${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`]!.body as any).truncated = true; }],
    ['SOURCE_SYMLINK', remote => { (remote.responses[`${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`]!.body as any).tree.push({ type: 'blob', mode: '120000', path: 'unreferenced-link', sha: 'a'.repeat(40) }); }],
    ['UNSAFE_SOURCE', remote => { (remote.responses[`${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`]!.body as any).tree.push({ type: 'blob', mode: '100644', path: '../escape', sha: 'a'.repeat(40) }); }],
    ['SOURCE_INTEGRITY', remote => {
      const key = Object.keys(remote.responses).find(key => key.includes('/git/blobs/'))!;
      (remote.responses[key]!.body as any).content = Buffer.from('Corruption').toString('base64');
    }],
  ];
  for (const [code, mutate] of cases) {
    const remote = remoteFixture(yaml, { 'readme.md': 'README' });
    t.after(() => remote.close());
    mutate(remote);
    remote.save();
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).errors[0].code, code, result.stdout);
  }
  assert.equal(readFileSync(`${project.root}/standards.yaml`, 'utf8'), '');
});

test('remote source references require exact Git path spelling for every material kind', (t) => {
  const operation = (field: string, path: string) => `kind: file
      target: README.md
      exact: README.md
      checks:
        - id: check
          run: {executable: node, script: check.js, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=24.0.0"}
          timeout-seconds: 10`.replace(field, path);
  const cases = [
    { declaration: 'kind: file\n      target: README.md\n      exact: readme.md', files: { 'README.md': 'Exact' }, location: '/exact' },
    { declaration: 'kind: file\n      target: README.md\n      guidance: readme.md', files: { 'README.md': 'Guidance' }, location: '/guidance' },
    { declaration: 'kind: repository\n      guidance: readme.md\n      targets: {paths: [README.md], directories: []}', files: { 'README.md': 'Guidance' }, location: '/guidance' },
    { declaration: 'kind: file\n      target: README.md\n      exact: docs/readme.md', files: { 'Docs/readme.md': 'Exact' }, location: '/exact' },
    { declaration: 'kind: skill\n      name: review\n      source: skill', files: { 'Skill/SKILL.md': 'Skill' }, location: '/source' },
    { declaration: 'kind: skill\n      name: review\n      source: skill', files: { 'skill/skill.md': 'Skill' }, location: '/source' },
    { declaration: operation('script: check.js', 'script: CHECK.js'), files: { 'README.md': 'Exact', 'check.js': 'throw new Error("Do not run")' }, location: '/checks/0/run/script' },
    { declaration: operation('resources: []', 'resources: [resource.json]'), files: { 'README.md': 'Exact', 'check.js': '', 'Resource.json': '{}' }, location: '/checks/0/run/resources/0' },
    { declaration: operation('resources: []', 'resources: [resources]'), files: { 'README.md': 'Exact', 'check.js': '', 'Resources/data.json': '{}' }, location: '/checks/0/run/resources/0' },
  ];
  const project = sourceFixture('');
  t.after(() => project.close());
  commit(project.root);
  for (const scenario of cases) {
    const source = yaml.replace('kind: file\n      target: README.md\n      exact: readme.md', scenario.declaration);
    const remote = remoteFixture(source, scenario.files as Record<string, string>);
    t.after(() => remote.close());
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1, `${scenario.location}: ${result.stdout}${result.stderr}`);
    const error = JSON.parse(result.stdout).errors[0];
    assert.equal(error.code, 'INVALID_STANDARDS');
    assert.ok(error.details.some((detail: {code: string; path: string; line: number}) =>
      detail.code === 'MISSING_REFERENCE' && detail.path === `/defaults/declarations/readme${scenario.location}` && detail.line > 0), result.stdout);
  }
});

test('remote snapshots reject path aliases before host extraction can conflate distinct Git entries', (t) => {
  const project = sourceFixture('');
  t.after(() => project.close());
  for (const [left, right] of [['Docs/a.md', 'docs/b.md'], ['README.md', 'readme.md'], ['Caf\u00e9/a.md', 'Cafe\u0301/b.md']]) {
    const remote = remoteFixture(yaml.replace('exact: readme.md', 'exact: seed.md'), { 'seed.md': 'README', 'first.txt': 'First', 'second.txt': 'Second' });
    t.after(() => remote.close());
    const tree = (remote.responses[`${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`]!.body as {tree: {path: string}[]}).tree;
    tree.find(entry => entry.path === 'first.txt')!.path = left!;
    tree.find(entry => entry.path === 'second.txt')!.path = right!;
    remote.save();
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'UNSAFE_SOURCE', result.stdout);
  }
});

test('the remote root entry point must be spelled standards.yaml in Git', (t) => {
  const remote = remoteFixture(yaml, { 'readme.md': 'README' });
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  const tree = (remote.responses[`${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`]!.body as {tree: {path: string}[]}).tree;
  tree.find(entry => entry.path === 'standards.yaml')!.path = 'Standards.yaml';
  remote.save();
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const error = JSON.parse(result.stdout).errors[0];
  assert.equal(error.code, 'INVALID_STANDARDS');
  assert.equal(error.details[0].code, 'SOURCE_READ');
});
