// With no arguments, prepare a local candidate. With a version and evidence
// path, acquire the public release. Neither mode creates author decisions.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const args = process.argv.slice(2);
const [version, evidencePath] = args;
if (args.length !== 0 && (args.length !== 2 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version!))) {
  throw new Error('Usage: node acceptance/prepare-author.ts [<published-version> <evidence.json>]');
}
if (process.env.NODE_OPTIONS) throw new Error('Run author acceptance without NODE_OPTIONS or acquisition fixtures.');
// npm lockfile keys depend on a canonical prefix (macOS /var aliases /private/var).
const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-standards-author-')));
const isolatedHome = join(root, 'home');
const workspace = join(root, 'workspace');
const catalog = join(root, 'candidate');
for (const directory of [isolatedHome, workspace]) mkdirSync(directory);
const configuration = join(root, 'empty.npmrc');
const globalConfiguration = join(root, 'global.npmrc');
writeFileSync(configuration, '');
writeFileSync(globalConfiguration, '');
// These settings apply only to child processes, isolating global destinations.
const env = { ...process.env, HOME: isolatedHome, CODEX_HOME: join(isolatedHome, '.codex'),
  XDG_CONFIG_HOME: join(isolatedHome, '.config'), XDG_CACHE_HOME: join(root, 'cache'),
  npm_config_userconfig: configuration, npm_config_globalconfig: globalConfiguration,
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_cache: join(root, 'npm-cache'),
  DISABLE_TELEMETRY: '1', NO_COLOR: '1' };
const commands: { executable: string; args: string[]; status: number | null; stdout: string; stderr: string }[] = [];
const downloads: { url: string; status: number | null; sha256?: string; headers: Record<string, string> }[] = [];
const retry = ['node', 'acceptance/prepare-author.ts', ...(version ? [version, `${resolve(evidencePath!)}.retry-${Date.now()}.json`] : [])]
  .map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ');
let nextAction = `Inspect the failure evidence, correct the cause, then rerun with a new evidence path: ${retry}`;
function run(executable: string, commandArgs: string[]) {
  const result = spawnSync(executable, commandArgs, { cwd: workspace, env, encoding: 'utf8',
    timeout: 300_000, maxBuffer: 32 * 1024 * 1024 });
  commands.push({ executable, args: commandArgs, status: result.status,
    stdout: stripVTControlCharacters(result.stdout ?? ''), stderr: stripVTControlCharacters(result.stderr ?? '') });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout.trim();
}
function inventory(directory: string) {
  return readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    .map(entry => {
      const path = join(entry.parentPath, entry.name);
      return { path: path.slice(directory.length + 1), sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
    }).sort((a, b) => a.path.localeCompare(b.path));
}
async function downloadJson(url: string) {
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(60_000) }); }
  catch {
    downloads.push({ url, status: null, headers: {} });
    throw new Error(`Cannot reach public release metadata: ${url}`);
  }
  const headers = Object.fromEntries(['date', 'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining',
    'x-ratelimit-reset', 'x-ratelimit-resource', 'x-github-request-id']
    .flatMap(name => response.headers.has(name) ? [[name, response.headers.get(name)!]] : []));
  const download: (typeof downloads)[number] = { url, status: response.status, headers };
  downloads.push(download);
  if (response.status !== 200) {
    if ([403, 429].includes(response.status) && headers['x-ratelimit-remaining'] === '0' && /^\d{1,10}$/.test(headers['x-ratelimit-reset'] ?? '')) {
      const reset = new Date(Number(headers['x-ratelimit-reset']) * 1000).toISOString();
      nextAction = `Public API quota exhausted. Wait until ${reset}, then retry with a new evidence path: ${retry}. Shared runner capacity may still be unavailable.`;
    }
    throw new Error(`Cannot acquire public release metadata: HTTP ${response.status} for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  download.sha256 = createHash('sha256').update(bytes).digest('hex');
  return JSON.parse(bytes.toString('utf8'));
}
const skill = join(isolatedHome, '.agents/skills/author-standards');
const source = version
  ? `https://github.com/lutzseverino/repo-standards/tree/v${version}/skills/author-standards`
  : catalog;
const installArgs = ['exec', '--yes', '--registry=https://registry.npmjs.org', '--package=skills@1.5.25', '--',
  'skills', 'add', source, '--skill', 'author-standards', '--global', '--agent', 'codex', '--copy', '--yes'];
let passed = false;
let failure: string | undefined;
let skillRevision: string | undefined;
let cli: string | undefined;
let distribution: unknown;
let documents: ReturnType<typeof inventory> = [];
let npmVersion: string | undefined;
try {
  npmVersion = run('npm', ['--version']);
  run('git', ['--version']);
  if (version) {
    // Resolve both lightweight and annotated public release tags without a checkout.
    const tags = run('git', ['ls-remote', 'https://github.com/lutzseverino/repo-standards.git',
      `refs/tags/v${version}`, `refs/tags/v${version}^{}`]);
    skillRevision = tags.trim().split('\n').at(-1)?.split(/\s/)[0];
    assert.match(skillRevision ?? '', /^[a-f0-9]{40}$/, 'The published skill tag must resolve');
    const releaseInfo = await downloadJson(`https://api.github.com/repos/lutzseverino/repo-standards/releases/tags/v${version}`);
    assert.equal(releaseInfo.draft, false);
    assert.equal(releaseInfo.prerelease, false);
  } else {
    mkdirSync(catalog);
    cpSync(resolve('skills/author-standards'), join(catalog, 'author-standards'), { recursive: true });
  }
  run('npm', installArgs);
  writeFileSync(join(root, 'installation.txt'), commands.at(-1)!.stdout + '\n');
  if (!version) rmSync(catalog, { recursive: true });
  for (const resource of ['SKILL.md', 'references/cli.md', 'references/profiles.md', 'references/operations.md', 'references/revision.md']) {
    assert.ok(readFileSync(join(skill, resource)).length > 0, `Required standalone resource: ${resource}`);
  }
  assert.deepEqual(readdirSync(workspace), [], 'Skill installation must leave the authoring workspace empty');
  assert.equal(existsSync(join(isolatedHome, '.agents/skills/adopt-standards')), false);
  if (version) {
    // Follow the installed guide; the CLI/docs live outside both skill and workspace.
    const guide = readFileSync(join(skill, 'references/cli.md'), 'utf8');
    const compatibleVersion = /@lutzseverino\/repo-standards@(\d+\.\d+\.\d+)/.exec(guide)?.[1];
    assert.equal(compatibleVersion, version, 'The guide must acquire this release and matching contracts');
    const installation = join(root, 'cli');
    const metadata = JSON.parse(run('npm', ['view', `@lutzseverino/repo-standards@${version}`, 'dist', '--json']));
    distribution = metadata;
    run('npm', ['install', '--prefix', installation, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact',
      `@lutzseverino/repo-standards@${compatibleVersion}`]);
    cli = join(installation, 'node_modules/.bin/repo-standards');
    assert.equal(run(cli, ['--version']), version);
    const installed = join(installation, 'node_modules/@lutzseverino/repo-standards');
    const lock = JSON.parse(readFileSync(join(installation, 'package-lock.json'), 'utf8'));
    assert.equal(lock.packages['node_modules/@lutzseverino/repo-standards'].integrity, metadata.integrity);
    const bundle = await downloadJson(`https://github.com/lutzseverino/repo-standards/releases/download/v${version}/release.json`);
    assert.equal(bundle.version, version);
    assert.equal(bundle.integrity, metadata.integrity);
    assert.deepEqual(inventory(skill), inventory(join(installed, 'skills/author-standards')),
      'Conventional skill installation must match the published npm release');
    for (const document of ['author-format.md', 'script-protocol.md', 'authoring.md']) {
      assert.ok(readFileSync(join(installed, 'docs', document)).length > 0);
    }
    documents = inventory(join(installed, 'docs'));
    for (const author of ['alice', 'mira']) {
      assert.equal(JSON.parse(run(cli, ['source', 'validate', join(installed, 'examples', author), '--json'])).valid, true);
    }
    const tags = run('git', ['ls-remote', 'https://github.com/lutzseverino/repo-standards.git',
      `refs/tags/v${version}`, `refs/tags/v${version}^{}`]);
    assert.equal(tags.trim().split('\n').at(-1)?.split(/\s/)[0], skillRevision, 'Release tag changed during acquisition');
    assert.deepEqual(readdirSync(workspace), []);
  }
  passed = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  const session = join(root, 'journey.json');
  const evidence = { kind: version ? 'public author-standards release installation' : 'local author-standards candidate installation',
    passed, failure, nextAction: passed ? undefined : nextAction,
    root, workspace, skill, resources: existsSync(skill) ? inventory(skill) : [],
    installer: 'skills@1.5.25', command: ['npm', ...installArgs], skillRevision, version, cli, distribution, documents,
    platform: process.platform, arch: process.arch, osRelease: release(), node: process.version,
    npm: npmVersion, installedAt: new Date().toISOString(),
    commands, downloads,
    scope: 'Installation, resources, matching CLI/docs and example validation only. No real-agent or skills.sh listing claim. Telemetry disabled.',
  };
  writeFileSync(session, JSON.stringify(evidence, null, 2) + '\n');
  if (evidencePath) {
    const destination = resolve(evidencePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
  }
  console.log(session);
  if (!passed) console.error(nextAction);
}
