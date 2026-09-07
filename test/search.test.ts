import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { remoteFixture } from './remote-fixture.ts';

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
      checks:
        - id: never-run
          run: {executable: node, script: never-run.mjs, resources: [], arguments: []}
          prerequisite:
            version-arguments: [-e, "require('node:fs').writeFileSync('probe-ran', 'bad'); console.log('24.11.1')"]
            version: ">=24.0.0 <25.0.0"
          timeout-seconds: 10
profiles:
  work:
    description: Work
    declarations: {}
`;
const searchUrl = 'https://api.github.com/search/repositories?q=topic%3Arepo-standards%20is%3Apublic&per_page=30&page=1';
const release = { tag_name: 'v1.0.0', name: 'First stable', html_url: 'https://github.com/alice/standards/releases/tag/v1.0.0', published_at: '2026-09-07T00:00:00Z', draft: false, prerelease: false };

function discoverable() {
  const remote = remoteFixture(yaml, { 'readme.md': 'Exact README', 'never-run.mjs': "import { writeFileSync } from 'node:fs'; writeFileSync('script-ran', 'bad'); throw new Error('Author code must not run');" });
  remote.responses[searchUrl] = { body: { total_count: 1, incomplete_results: false, items: [{ full_name: 'alice/standards', private: false, description: 'Alice’s standards' }] } };
  remote.responses[`${remote.prefix}/releases?per_page=100&page=1`] = { body: [release] };
  remote.save();
  return remote;
}

test('source search returns validated public release candidates without selecting or changing a project', (t) => {
  const remote = discoverable();
  const project = sourceFixture('', { 'dirty.txt': 'Keep my untracked work' });
  t.after(() => { remote.close(); project.close(); });
  const before = snapshot(project.root);
  const result = cli.run(['source', 'search', '--json'], project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.candidates, [{
    repository: 'https://github.com/alice/standards', description: 'Alice’s standards', commit: remote.sha,
    release: { version: 'v1.0.0', name: 'First stable', url: release.html_url, publishedAt: release.published_at },
    source: { name: 'public-standards', description: 'Public standards', requires: { 'repo-standards': '>=1.0.0 <2.0.0' } },
    profiles: ['work'],
  }]);
  assert.deepEqual(report.rejected, []);
  assert.match(report.notice, /not.*endorsement/i);
  assert.equal(report.selection, undefined);
  assert.equal(report.nextPage, null);
  assert.deepEqual(snapshot(project.root), before);
});

test('search rejects unsupported and invalid candidates explicitly while keeping valid candidates', (t) => {
  const remote = discoverable();
  const others = [
    remoteFixture(yaml.replace('repo-standards/v1', 'repo-standards/v99'), { 'readme.md': 'README', 'never-run.mjs': '' }, [], 'invalid/standards'),
    remoteFixture(yaml.replace('>=1.0.0 <2.0.0', '>=2.0.0'), { 'readme.md': 'README', 'never-run.mjs': '' }, [], 'incompatible/standards'),
    remoteFixture(yaml, {}, [], 'missing/standards'),
    remoteFixture(yaml, { 'readme.md': 'README', 'never-run.mjs': '' }, [], 'rootless/standards'),
  ];
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); others.forEach(other => other.close()); });
  const search = remote.responses[searchUrl]!.body as any;
  for (const other of others) {
    Object.assign(remote.responses, other.responses);
    const repository = (other.responses[other.prefix]!.body as any).full_name;
    search.items.push({ full_name: repository, private: false, description: null });
    remote.responses[`${other.prefix}/releases?per_page=100&page=1`] = { body: [{ ...release, html_url: `https://github.com/${repository}/releases/tag/v1.0.0` }] };
  }
  const rootless = others[3]!;
  const tree = (remote.responses[`${rootless.prefix}/git/trees/${rootless.treeSha}?recursive=1`]!.body as any).tree;
  tree.find((entry: any) => entry.path === 'standards.yaml').path = 'Standards.yaml';
  search.items.push({ full_name: 'private/standards', private: true, description: null });
  search.items.push({ full_name: '../escape', private: false, description: null });
  search.total_count = search.items.length;
  remote.save();
  const result = cli.run(['source', 'search', '--json'], project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.candidates.length, 1);
  assert.deepEqual(report.rejected.map((entry: any) => entry.code), [
    'INVALID_STANDARDS', 'INVALID_STANDARDS', 'INVALID_STANDARDS', 'INVALID_STANDARDS', 'UNSUPPORTED_SOURCE', 'UNSUPPORTED_SOURCE',
  ]);
  for (const [index, code] of ['INVALID_FORMAT', 'INCOMPATIBLE_CLI', 'MISSING_REFERENCE', 'SOURCE_READ'].entries()) {
    assert.ok(report.rejected[index].details.some((detail: any) => detail.code === code && detail.file === 'standards.yaml'));
  }
});

test('search finds stable published releases across pages and reports sources without one', (t) => {
  const remote = discoverable();
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  remote.responses[`${remote.prefix}/releases?per_page=100&page=1`] = { body: Array.from({ length: 100 }, (_, index) => ({ ...release, tag_name: `v2.0.0-beta.${index}`, prerelease: true })) };
  const unstable = [
    { ...release, tag_name: 'latest' }, { ...release, tag_name: 'v01.0.0' },
    { ...release, tag_name: 'v3.0.0-beta.1' }, { ...release, draft: true }, { ...release, prerelease: true },
  ];
  remote.responses[`${remote.prefix}/releases?per_page=100&page=2`] = { body: [...unstable, release] };
  remote.save();
  const result = cli.run(['source', 'search', '--json'], project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).candidates[0].release.version, 'v1.0.0');
  remote.responses[`${remote.prefix}/releases?per_page=100&page=1`] = { body: unstable };
  remote.save();
  const absent = JSON.parse(cli.run(['source', 'search', '--json'], project.root, remote.env).stdout);
  assert.deepEqual(absent.candidates, []);
  assert.equal(absent.rejected[0].code, 'NO_STABLE_RELEASE');
});

test('search paginates candidates and discloses incomplete GitHub results and the search cap', (t) => {
  const remote = discoverable();
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  (remote.responses[searchUrl]!.body as any).total_count = 45;
  (remote.responses[searchUrl]!.body as any).incomplete_results = true;
  remote.responses[searchUrl.replace('page=1', 'page=2')] = { body: { total_count: 45, incomplete_results: false, items: [] } };
  remote.responses[searchUrl.replace('page=1', 'page=34')] = { body: { total_count: 1200, incomplete_results: false, items: [] } };
  remote.save();
  const first = JSON.parse(cli.run(['source', 'search', '--json'], project.root, remote.env).stdout);
  assert.equal(first.page, 1);
  assert.equal(first.totalCount, 45);
  assert.equal(first.incompleteResults, true);
  assert.equal(first.nextPage, 2);
  const second = cli.run(['source', 'search', '--page', '2', '--json'], project.root, remote.env);
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(JSON.parse(second.stdout).page, 2);
  assert.equal(JSON.parse(second.stdout).nextPage, null);
  const capped = JSON.parse(cli.run(['source', 'search', '--page', '34', '--json'], project.root, remote.env).stdout);
  assert.equal(capped.searchLimitReached, true);
  assert.equal(capped.nextPage, null);
  for (const flags of [['--page', '0'], ['--page', '35'], ['--page', '1.5'], ['--page'], ['--page', '1', '--page', '2'], ['--json', '--json'], ['--profile', 'work']]) {
    const invalid = cli.run(['source', 'search', ...flags, ...(flags.includes('--json') ? [] : ['--json'])], project.root, remote.env);
    assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
    assert.equal(JSON.parse(invalid.stdout).errors[0].code, 'USAGE');
  }
});

test('discovery outages and malformed responses are explicit and do not prevent known-source inspection', (t) => {
  const remote = discoverable();
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  for (const response of [
    { status: 403, body: { message: 'API rate limit exceeded' } },
    { status: 503, body: {} },
    { body: { items: [] } },
    { body: null },
  ]) {
    remote.responses[searchUrl] = response;
    remote.save();
    const result = cli.run(['source', 'search', '--json'], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'status' in response ? 'SOURCE_UNAVAILABLE' : 'INVALID_SEARCH_RESPONSE');
  }
  const before = snapshot(project.root);
  const direct = cli.run(['inspect', '--source', 'https://github.com/alice/standards', '--standards-version', 'v1.0.0', '--profile', 'work', '--json'], project.root, remote.env);
  assert.equal(direct.status, 0, direct.stdout + direct.stderr);
  assert.equal(JSON.parse(direct.stdout).selection.standards.commit, remote.sha);
  assert.deepEqual(snapshot(project.root), before);
});

test('candidate failures remain explicit without falling back from an invalid newer stable release', (t) => {
  const remote = discoverable();
  const project = sourceFixture('');
  t.after(() => { remote.close(); project.close(); });
  remote.addVersion('v2.0.0', yaml.replace('repo-standards/v1', 'repo-standards/v99'));
  remote.responses[`${remote.prefix}/releases?per_page=100&page=1`] = { body: [{ ...release, tag_name: 'v2.0.0' }, release] };
  remote.save();
  const invalid = JSON.parse(cli.run(['source', 'search', '--json'], project.root, remote.env).stdout);
  assert.deepEqual(invalid.candidates, []);
  assert.equal(invalid.rejected[0].code, 'INVALID_STANDARDS');
  assert.equal(invalid.rejected[0].release.version, 'v2.0.0');
  for (const [response, code] of [
    [{ status: 429, body: {} }, 'SOURCE_UNAVAILABLE'],
    [{ body: {} }, 'INVALID_SOURCE'],
    [{ body: [{ ...release, published_at: null }] }, 'INVALID_SOURCE'],
  ] as const) {
    remote.responses[`${remote.prefix}/releases?per_page=100&page=1`] = response;
    remote.save();
    const result = cli.run(['source', 'search', '--json'], project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.candidates, []);
    assert.equal(report.rejected[0].code, code);
  }
});
