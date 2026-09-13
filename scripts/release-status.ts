// Read-only remote inspection. Download the original bundle locally and print
// one recovery action; never execute publication, tagging, uploads or dispatch.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [runId, destination, ...extra] = process.argv.slice(2);
if (!runId || !/^\d+$/.test(runId) || !destination || extra.length) {
  throw new Error('Usage: node scripts/release-status.ts <original-release-run-id> <fresh-output-directory>');
}
const repository = 'lutzseverino/repo-standards';
const packageName = '@lutzseverino/repo-standards';
const output = resolve(destination);
mkdirSync(output); // Preserve prior reports and bundles by refusing reuse.
const bundleDirectory = join(output, 'bundle');
const report: Record<string, unknown> = {
  run: `https://github.com/${repository}/actions/runs/${runId}`,
  observedAt: new Date().toISOString(), state: 'unknown',
  nextAction: 'Resolve the reported uncertainty, then rerun release-status with a fresh output directory. Do not publish or overwrite artifacts while identity is unknown.',
};
function command(args: string[]) {
  return args.map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ');
}
function gh(args: string[], allowMissing = false) {
  const result = spawnSync('gh', [...args, ...(args[0] === 'api' ? [] : ['--repo', repository])],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    if (allowMissing && result.status === 1 && /\(HTTP 404\)/.test(result.stderr ?? '')) return undefined;
    throw new Error(`Cannot inspect GitHub (${args[0]} ${args[1]}). Check gh authentication, connectivity and run/artifact availability.`);
  }
  return result.stdout;
}
function github(path: string, allowMissing = false): any {
  const bytes = gh(['api', `repos/${repository}/${path}`], allowMissing);
  return bytes === undefined ? undefined : JSON.parse(bytes);
}
async function request(url: string) {
  try { return await fetch(url, { signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error(`Cannot reach ${url}; publication state is unknown.`); }
}

try {
  const run = github(`actions/runs/${runId}`);
  assert.equal(run.path, '.github/workflows/release.yml', 'The original run must use release.yml');
  assert.match(run.head_sha, /^[a-f0-9]{40}$/, 'The original run must identify its commit');
  const { jobs } = github(`actions/runs/${runId}/jobs?per_page=100`);
  for (const name of ['validate (ubuntu-latest)', 'validate (macos-latest)']) {
    assert.ok(jobs.some((job: { name: string; conclusion: string }) => job.name === name && job.conclusion === 'success'),
      `Original ${name} must have passed; verification-only runs cannot supply a validated bundle`);
  }
  report.commit = run.head_sha;
  gh(['run', 'download', runId, '--name', 'release-bundle', '--dir', bundleDirectory]);
  const bundle = JSON.parse(readFileSync(join(bundleDirectory, 'release.json'), 'utf8'));
  assert.equal(bundle.package, packageName);
  assert.match(bundle.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.equal(bundle.tarball, `lutzseverino-repo-standards-${bundle.version}.tgz`);
  const files = [bundle.tarball, 'repo-standards-bootstrap', 'SHA256SUMS', 'release.json'];
  assert.deepEqual(readdirSync(bundleDirectory).sort(), [...files].sort(), 'The original bundle must contain exactly four release files');
  assert.deepEqual(bundle.artifacts.map((a: { file: string }) => a.file).sort(), [bundle.tarball, 'repo-standards-bootstrap'].sort());
  for (const artifact of bundle.artifacts) {
    assert.equal(createHash('sha256').update(readFileSync(join(bundleDirectory, artifact.file))).digest('hex'), artifact.sha256,
      `Original bundle hash mismatch: ${artifact.file}`);
  }
  assert.equal(readFileSync(join(bundleDirectory, 'SHA256SUMS'), 'utf8'),
    bundle.artifacts.map((a: { file: string; sha256: string }) => `${a.sha256}  ${a.file}\n`).join(''));
  assert.equal(`sha512-${createHash('sha512').update(readFileSync(join(bundleDirectory, bundle.tarball))).digest('base64')}`, bundle.integrity,
    'Original tarball does not match its npm integrity');
  report.version = bundle.version;
  report.bundle = bundleDirectory;
  report.integrity = bundle.integrity;

  const registry = await request(`https://registry.npmjs.org/@lutzseverino%2Frepo-standards/${bundle.version}`);
  assert.ok([200, 404].includes(registry.status), `npm returned HTTP ${registry.status}; publication state is unknown`);
  if (registry.status === 200) {
    assert.equal((await registry.json()).dist?.integrity, bundle.integrity, 'Published npm integrity differs from the original bundle');
  }
  report.npm = registry.status === 200 ? 'matches' : 'absent';
  const tag = `v${bundle.version}`;
  const ref = github(`git/ref/tags/${tag}`, true);
  let object = ref?.object;
  for (let depth = 0; object?.type === 'tag' && depth < 10; depth++) {
    assert.match(object.sha, /^[a-f0-9]{40}$/);
    object = github(`git/tags/${object.sha}`).object;
  }
  if (ref) {
    assert.equal(object?.type, 'commit', 'Release tag must resolve to a commit');
    assert.equal(object.sha, run.head_sha, 'Release tag differs from the original validated commit');
  }
  report.tag = ref ? 'matches' : 'absent';
  const release = github(`releases/tags/${tag}`, true);
  if (registry.status === 404) {
    assert.equal(release, undefined, 'GitHub release exists while npm version is absent; resolve the inconsistent publication state');
    report.state = 'npm-version-missing';
    report.prerequisite = 'Complete interactive npm authentication and publication approval as described in docs/release.md. Reinspect state after publication.';
    report.nextAction = command(['npm', 'publish', join(bundleDirectory, bundle.tarball), '--ignore-scripts', '--access', 'public', '--registry=https://registry.npmjs.org']);
  } else if (!release) {
    report.state = 'github-release-missing';
    report.nextAction = command(['gh', 'release', 'create', tag, ...files.map(file => join(bundleDirectory, file)),
      '--repo', repository, '--target', run.head_sha, '--title', `Repository Standards ${bundle.version}`,
      '--notes', 'Published artifacts; release acceptance is tracked separately.']);
  } else {
    assert.ok(ref, 'A published release must have a matching Git tag');
    assert.equal(release.tag_name, tag);
    assert.equal(release.draft, false);
    assert.equal(release.prerelease, false);
    const matched: string[] = [];
    const missing: string[] = [];
    for (const file of files) {
      if (!release.assets.some((asset: { name: string }) => asset.name === file)) {
        missing.push(file);
        continue;
      }
      const response = await request(`https://github.com/${repository}/releases/download/${tag}/${file}`);
      assert.equal(response.status, 200, `Cannot inspect release asset ${file}: HTTP ${response.status}`);
      assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),
        createHash('sha256').update(readFileSync(join(bundleDirectory, file))).digest('hex'), `Published asset differs from original bundle: ${file}`);
      matched.push(file);
    }
    report.assets = { matched, missing };
    if (missing.length) {
      report.state = 'github-assets-missing';
      report.nextAction = command(['gh', 'release', 'upload', tag, ...missing.map(file => join(bundleDirectory, file)), '--repo', repository]);
    } else {
      const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', timeout: 10_000 });
      assert.ok(branch.status === 0 && branch.stdout.trim(), 'Use a checkout of the reviewed workflow branch to select verification code');
      report.state = 'published';
      report.nextAction = command(['gh', 'workflow', 'run', 'release.yml', '--repo', repository,
        '--ref', branch.stdout.trim(), '-f', `version=${bundle.version}`, '-F', 'verify_published=true']);
    }
  }
} catch (error) {
  report.failure = error instanceof Error ? error.message : 'Release inspection failed';
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, 'status.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
