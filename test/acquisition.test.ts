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
