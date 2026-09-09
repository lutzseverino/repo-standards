// Live public-distribution evidence, deliberately outside deterministic tests.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { snapshot } from '../test/installed-cli.ts';

const [version, evidencePath] = process.argv.slice(2);
if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || !evidencePath) {
  throw new Error('Usage: node acceptance/public-installation.ts <exact-version> <evidence.json>');
}
if (process.env.NODE_OPTIONS) throw new Error('Run public acceptance without NODE_OPTIONS or acquisition fixtures.');
const evidence = resolve(evidencePath);
const root = mkdtempSync(join(tmpdir(), 'repo-standards-public-'));
const project = join(root, 'project');
mkdirSync(project);
const configuration = join(root, 'empty.npmrc');
writeFileSync(configuration, '');
const env = { ...process.env, npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_userconfig: configuration, npm_config_cache: join(root, 'npm-cache'),
  XDG_CACHE_HOME: join(root, 'cache') };
const commands: { executable: string; args: string[]; status: number | null; stdout: string; stderr: string }[] = [];
const downloads: { url: string; status: number; sha256: string }[] = [];
let passed = false;
try {
  function run(executable: string, args: string[], cwd = root) {
    const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024 });
    commands.push({ executable, args, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.trim();
  }
  run('npm', ['--version']);
  const distribution = JSON.parse(run('npm', ['view', `@lutzseverino/repo-standards@${version}`, 'dist', '--json']));
  const installation = join(root, 'cli');
  run('npm', ['install', '--prefix', installation, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `@lutzseverino/repo-standards@${version}`]);
  const cli = join(installation, 'node_modules/.bin/repo-standards');
  const installed = join(installation, 'node_modules/@lutzseverino/repo-standards');
  assert.equal(run(cli, ['--version']), version);
  const lock = JSON.parse(readFileSync(join(installation, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages['node_modules/@lutzseverino/repo-standards'].integrity, distribution.integrity);
  async function download(file: string) {
    const url = `https://github.com/lutzseverino/repo-standards/releases/download/v${version}/${file}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    downloads.push({ url, status: response.status, sha256: createHash('sha256').update(bytes).digest('hex') });
    assert.equal(response.status, 200, `Cannot download ${url}`);
    return bytes;
  }
  const bundle = JSON.parse((await download('release.json')).toString('utf8'));
  assert.equal(bundle.version, version);
  assert.equal(bundle.package, '@lutzseverino/repo-standards');
  assert.equal(bundle.integrity, distribution.integrity);
  const bootstrapBytes = await download('repo-standards-bootstrap');
  assert.equal(downloads.at(-1)!.sha256, bundle.artifacts.find((artifact: { file: string }) => artifact.file === 'repo-standards-bootstrap').sha256);
  assert.deepEqual(bootstrapBytes, readFileSync(join(installed, 'bootstrap/repo-standards')));
  const bootstrap = join(root, 'repo-standards-bootstrap');
  writeFileSync(bootstrap, bootstrapBytes);
  chmodSync(bootstrap, 0o755);
  run(join(installation, 'node_modules/.bin/repo-standards-bootstrap'), ['--help']);
  for (const author of ['alice', 'mira']) {
    assert.equal(JSON.parse(run(cli, ['source', 'validate', join(installed, 'examples', author), '--json'])).valid, true);
  }
  const source = 'https://github.com/lutzseverino/repo-standards-example';
  const search = JSON.parse(run(cli, ['source', 'search', '--json']));
  assert.ok(search.candidates.some((candidate: { repository: string }) => candidate.repository === source), 'Public learning source must be discoverable');
  run('git', ['init', '--quiet'], project);
  run('git', ['config', 'maintenance.auto', 'false'], project);
  writeFileSync(join(project, 'README.md'), '# Public installation smoke project\n');
  run('git', ['add', '.'], project);
  run('git', ['-c', 'user.name=Release acceptance', '-c', 'user.email=release@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'test: initialize disposable project'], project);
  const before = snapshot(project);
  const args = ['inspect', '--source', source, '--standards-version', 'v1.0.0', '--profile', 'service', '--json'];
  const explicit = JSON.parse(run(bootstrap, ['--cli-version', version, ...args], project));
  assert.equal(explicit.selection.cli.version, version);
  assert.deepEqual(snapshot(project), before);
  const latest = JSON.parse(run(bootstrap, args, project));
  assert.match(latest.selection.cli.version, /^\d+\.\d+\.\d+$/);
  assert.ok(commands.at(-1)!.stderr.includes(`CLI ${latest.selection.cli.version} `));
  assert.deepEqual(snapshot(project), before);
  writeFileSync(join(root, 'identity.json'), JSON.stringify({ distribution,
    skillSha256: createHash('sha256').update(readFileSync(join(installed, 'skills/adopt-standards/SKILL.md'))).digest('hex'),
    explicitIdentity: explicit.identity, omittedIdentity: latest.identity,
    omittedVersion: latest.selection.cli.version, projectUnchanged: true,
  }));
  passed = true;
} finally {
  mkdirSync(dirname(evidence), { recursive: true });
  let identity: unknown;
  try { identity = JSON.parse(readFileSync(join(root, 'identity.json'), 'utf8')); } catch { /* Failure evidence still includes command output. */ }
  writeFileSync(evidence, JSON.stringify({ date: new Date().toISOString(),
    os: { platform: platform(), release: release(), arch: arch() }, node: process.version,
    version, passed, identity, commands, downloads,
    scope: 'Public installation, author validation, discovery and read-only bootstrap. No adoption or real-agent assessment.',
  }, null, 2) + '\n');
  rmSync(root, { recursive: true, force: true });
}
