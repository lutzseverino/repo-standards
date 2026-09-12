import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';

// Exercise maintainer commands, replacing only external executables and HTTP.
// These simulations are never public-acquisition or publication evidence.
function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-standards-maintainer-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  function executable(name: string, body: string) {
    writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  }
  executable('npm', `if (process.argv[2] !== '--version') process.exit(77); console.log('11.19.0');`);
  executable('git', `console.log(process.argv[2] === '--version' ? 'git version 2.50.0' : '${'a'.repeat(40)}\\trefs/tags/v1.1.0');`);
  const preload = join(root, 'http.mjs');
  const evidence = join(root, 'evidence.json');
  return { root, executable, preload, evidence,
    run(script: string, args: string[] = ['1.1.0', evidence]) {
      const env: NodeJS.ProcessEnv = { ...process.env, PATH: bin, TMPDIR: root };
      delete env.NODE_OPTIONS;
      return spawnSync(process.execPath, ['--import', preload, resolve(script), ...args],
        { env, encoding: 'utf8', timeout: 20_000 });
    },
  };
}

test('public author acquisition retains quota diagnostics and a recovery action without the response body', t => {
  const f = fixture(t);
  writeFileSync(f.preload, `globalThis.fetch = async () => new Response('PRIVATE_RESPONSE_BODY', {
    status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1789232918',
      'x-github-request-id': 'example-request', 'set-cookie': 'PRIVATE_COOKIE' } });`);
  const result = f.run('acceptance/prepare-author.ts');
  assert.equal(result.status, 1, result.stderr);
  const bytes = readFileSync(f.evidence, 'utf8');
  const evidence = JSON.parse(bytes);
  assert.equal(evidence.passed, false);
  assert.equal(evidence.downloads[0].headers['x-ratelimit-remaining'], '0');
  assert.match(evidence.failure, /HTTP 403/);
  assert.match(evidence.nextAction, /2026-09-12T17:08:38.000Z/);
  assert.match(evidence.nextAction, /prepare-author\.ts/);
  assert.doesNotMatch(bytes + result.stderr, /PRIVATE_RESPONSE_BODY|PRIVATE_COOKIE/);
});

test('public author acquisition retains the failed URL when no HTTP response arrives', t => {
  const f = fixture(t);
  writeFileSync(f.preload, `globalThis.fetch = async () => { throw new Error('PRIVATE_TRANSPORT_DETAIL'); };`);
  assert.equal(f.run('acceptance/prepare-author.ts').status, 1);
  const bytes = readFileSync(f.evidence, 'utf8');
  const evidence = JSON.parse(bytes);
  assert.equal(evidence.downloads[0].status, null);
  assert.match(evidence.downloads[0].url, /releases\/tags\/v1\.1\.0$/);
  assert.match(evidence.failure, /Cannot reach/);
  assert.doesNotMatch(bytes, /PRIVATE_TRANSPORT_DETAIL/);
});

test('public author acquisition does not classify an unexplained HTTP 403 as quota exhaustion', t => {
  const f = fixture(t);
  writeFileSync(f.preload, `globalThis.fetch = async () => new Response('Unavailable', { status: 403 });`);
  assert.equal(f.run('acceptance/prepare-author.ts').status, 1);
  const evidence = JSON.parse(readFileSync(f.evidence, 'utf8'));
  assert.match(evidence.failure, /HTTP 403/);
  assert.doesNotMatch(evidence.nextAction, /quota exhausted|Wait until/);
});

function releaseFixture(t: TestContext, options: { registry?: 'absent' | 'mismatch'; tag?: 'mismatch'; github?: 'published' | 'unavailable' | 'partial' } = {}) {
  const f = fixture(t);
  const original = join(f.root, 'original');
  mkdirSync(original);
  const tarball = 'lutzseverino-repo-standards-1.1.0.tgz';
  const tarBytes = 'original validated tarball';
  const integrity = `sha512-${createHash('sha512').update(tarBytes).digest('base64')}`;
  const artifacts = [{ file: tarball, bytes: tarBytes }, { file: 'repo-standards-bootstrap', bytes: 'original bootstrap' }]
    .map(({ file, bytes }) => {
      writeFileSync(join(original, file), bytes);
      return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
  writeFileSync(join(original, 'release.json'), JSON.stringify({ package: '@lutzseverino/repo-standards', version: '1.1.0', tarball, integrity, artifacts }));
  writeFileSync(join(original, 'SHA256SUMS'), artifacts.map(a => `${a.sha256}  ${a.file}\n`).join(''));
  f.executable('git', `console.log('feat/reliability');`);
  f.executable('gh', `
    const fs = require('node:fs'), path = require('node:path');
    const args = process.argv.slice(2);
    fs.appendFileSync(${JSON.stringify(join(f.root, 'commands.jsonl'))}, JSON.stringify(args) + '\\n');
    if (args[0] === 'run' && args[1] === 'download') {
      fs.cpSync(${JSON.stringify(original)}, args[args.indexOf('--dir') + 1], { recursive: true });
    } else if (args[0] === 'api') {
      const endpoint = args[1];
      if (endpoint.endsWith('/jobs?per_page=100')) console.log(JSON.stringify({ jobs: [
        { name: 'validate (ubuntu-latest)', conclusion: 'success' }, { name: 'validate (macos-latest)', conclusion: 'success' }] }));
      else if (endpoint.endsWith('/actions/runs/123')) console.log(JSON.stringify({ path: '.github/workflows/release.yml', head_sha: '${'a'.repeat(40)}' }));
      else if (endpoint.includes('/git/ref/')) console.log(JSON.stringify({ object: { type: 'commit', sha: '${(options.tag === 'mismatch' ? 'b' : 'a').repeat(40)}' } }));
      else if (endpoint.includes('/releases/tags/')) {
        if (['published', 'partial'].includes(${JSON.stringify(options.github)})) console.log(JSON.stringify({ draft: false, prerelease: false, tag_name: 'v1.1.0', assets: fs.readdirSync(${JSON.stringify(original)}).filter(name => ${JSON.stringify(options.github)} !== 'partial' || name !== 'repo-standards-bootstrap').map(name => ({ name })) }));
        else { console.error(${JSON.stringify(options.github === 'unavailable' ? 'gh: Unavailable (HTTP 503)' : 'gh: Not Found (HTTP 404)')}); process.exit(1); }
      } else process.exit(78);
    } else process.exit(79);
  `);
  writeFileSync(f.preload, `import { readFileSync } from 'node:fs';
    globalThis.fetch = async url => {
      if (String(url).startsWith('https://registry.npmjs.org/')) return new Response(JSON.stringify({ dist: { integrity: ${JSON.stringify(options.registry === 'mismatch' ? 'different' : integrity)} } }), { status: ${options.registry === 'absent' ? 404 : 200} });
      if (String(url).startsWith('https://github.com/lutzseverino/repo-standards/releases/download/v1.1.0/')) return new Response(readFileSync(${JSON.stringify(original)} + '/' + String(url).split('/').at(-1)));
      throw new Error('Unexpected network request');
    };`);
  const output = join(f.root, 'status');
  return { ...f, original, output, runStatus: () => f.run('scripts/release-status.ts', ['123', output]) };
}

test('release status verifies the original bundle and prints the missing GitHub release action without publishing', t => {
  const f = releaseFixture(t);
  const result = f.runStatus();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(join(f.output, 'status.json'), 'utf8'));
  assert.equal(report.state, 'github-release-missing');
  assert.match(report.nextAction, /gh.*release.*create.*v1\.1\.0/);
  assert.ok(report.nextAction.includes('a'.repeat(40)));
  assert.ok(report.nextAction.includes(join(f.output, 'bundle')));
  assert.doesNotMatch(report.nextAction, /npm.*publish/);
  const commands = readFileSync(join(f.root, 'commands.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.ok(commands.every(args => args[0] === 'api' || (args[0] === 'run' && args[1] === 'download')));
});

test('release status verifies published assets before recommending verification-only acceptance', t => {
  const f = releaseFixture(t, { github: 'published' });
  const result = f.runStatus();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(join(f.output, 'status.json'), 'utf8'));
  assert.equal(report.state, 'published');
  assert.match(report.nextAction, /workflow.*run.*release\.yml/);
  assert.match(report.nextAction, /verify_published=true/);
  assert.match(report.nextAction, /feat\/reliability/);
  assert.deepEqual(report.assets, { matched: ['lutzseverino-repo-standards-1.1.0.tgz', 'repo-standards-bootstrap', 'SHA256SUMS', 'release.json'], missing: [] });
});

test('release status recommends only the original tarball when npm confirms the version is absent', t => {
  const f = releaseFixture(t, { registry: 'absent' });
  assert.equal(f.runStatus().status, 0);
  const report = JSON.parse(readFileSync(join(f.output, 'status.json'), 'utf8'));
  assert.equal(report.state, 'npm-version-missing');
  assert.match(report.nextAction, /npm.*publish/);
  assert.ok(report.nextAction.includes(join(f.output, 'bundle', 'lutzseverino-repo-standards-1.1.0.tgz')));
  assert.doesNotMatch(report.nextAction, /release:pack|workflow.*run/);
});

test('release status verifies existing assets and recommends uploading only the missing original asset', t => {
  const f = releaseFixture(t, { github: 'partial' });
  assert.equal(f.runStatus().status, 0);
  const report = JSON.parse(readFileSync(join(f.output, 'status.json'), 'utf8'));
  assert.equal(report.state, 'github-assets-missing');
  assert.match(report.nextAction, /release.*upload/);
  assert.ok(report.nextAction.includes(join(f.output, 'bundle', 'repo-standards-bootstrap')));
  assert.doesNotMatch(report.nextAction, /clobber|\.tgz/);
});

test('release status rejects a damaged original bundle before contacting npm', t => {
  const f = releaseFixture(t);
  writeFileSync(join(f.original, 'repo-standards-bootstrap'), 'damaged bootstrap');
  writeFileSync(f.preload, `globalThis.fetch = async () => { throw new Error('Unexpected registry request'); };`);
  assert.equal(f.runStatus().status, 1);
  const report = JSON.parse(readFileSync(join(f.output, 'status.json'), 'utf8'));
  assert.equal(report.state, 'unknown');
  assert.match(report.failure, /Original bundle hash mismatch/);
  assert.doesNotMatch(report.nextAction, /'gh'|'npm'/);
});

test('release status refuses to overwrite an earlier inspection', t => {
  const f = releaseFixture(t);
  mkdirSync(f.output);
  writeFileSync(join(f.output, 'status.json'), 'original observation');
  assert.equal(f.runStatus().status, 1);
  assert.equal(readFileSync(join(f.output, 'status.json'), 'utf8'), 'original observation');
});

for (const [name, options] of [
  ['different npm integrity', { registry: 'mismatch' }],
  ['a moved tag', { tag: 'mismatch' }],
  ['GitHub unavailable', { github: 'unavailable' }],
] as const) {
  test(`release status refuses recovery with ${name}`, t => {
    const f = releaseFixture(t, options);
    assert.equal(f.runStatus().status, 1);
    const report = JSON.parse(readFileSync(join(f.output, 'status.json'), 'utf8'));
    assert.equal(report.state, 'unknown');
    assert.ok(report.failure);
    assert.doesNotMatch(report.nextAction, /'gh'|'npm'/);
  });
}

test('public CLI acceptance records an assertion failure even when every external command exited successfully', t => {
  const f = fixture(t);
  f.executable('npm', `
    const fs = require('node:fs'), path = require('node:path');
    if (process.argv[2] === '--version') console.log('11.19.0');
    else if (process.argv[2] === 'view') console.log(JSON.stringify({ integrity: 'example' }));
    else if (process.argv[2] === 'install') {
      const bin = path.join(process.argv[process.argv.indexOf('--prefix') + 1], 'node_modules/.bin');
      fs.mkdirSync(bin, { recursive: true });
      fs.writeFileSync(path.join(bin, 'repo-standards'), '#!${process.execPath}\\nconsole.log("1.0.0");', { mode: 0o755 });
    } else process.exit(77);
  `);
  writeFileSync(f.preload, `globalThis.fetch = async () => { throw new Error('Unexpected network request'); };`);
  const result = f.run('acceptance/public-installation.ts');
  assert.equal(result.status, 1, result.stderr);
  const evidence = JSON.parse(readFileSync(f.evidence, 'utf8'));
  assert.equal(evidence.passed, false);
  assert.ok(evidence.commands.every((command: { status: number }) => command.status === 0));
  assert.match(evidence.failure, /1\.0\.0/);
  assert.match(evidence.nextAction, /public-installation\.ts/);
});
