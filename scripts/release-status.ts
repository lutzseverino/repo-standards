// Read-only remote inspection. Download the original bundle locally and print
// one recovery action; never execute publication, tagging, uploads or dispatch.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
    { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    if (allowMissing && result.status === 1 && /\(HTTP 404\)/.test(result.stderr?.toString('utf8') ?? '')) return undefined;
    throw new Error(`Cannot inspect GitHub (${args[0]} ${args[1]}). Check gh authentication, connectivity and run/artifact availability.`);
  }
  return result.stdout;
}
// The parts of GitHub and release responses this inspection reads.
interface GitObject { type: string; sha: string }
interface Release {
  tag_name: string; draft: boolean; prerelease: boolean; target_commitish: string; body: string | null;
  assets: { id: number; name: string }[];
}
interface Bundle { package: string; version: string; tarball: string; integrity: string; artifacts: { file: string; sha256: string }[] }

function github(path: string, allowMissing = false): unknown {
  const bytes = gh(['api', `repos/${repository}${path ? `/${path}` : ''}`], allowMissing);
  return bytes === undefined ? undefined : JSON.parse(bytes.toString('utf8'));
}
async function request(url: string) {
  try { return await fetch(url, { signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error(`Cannot reach ${url}; publication state is unknown.`); }
}

// The release body is the notes supplied when the original run was dispatched.
function originalNotes(runId: string) {
  const notesDirectory = join(output, 'notes');
  try {
    gh(['run', 'download', runId, '--name', 'release-notes', '--dir', notesDirectory]);
  } catch {
    throw new Error('Cannot download the original run\'s release-notes artifact. Check gh authentication and artifact availability. A run dispatched before the workflow took release notes has none; recover manually with notes written for it, as docs/development/release.md describes.');
  }
  const notes = join(notesDirectory, 'release-notes.md');
  assert.ok(existsSync(notes), 'The original run\'s release notes are missing from its release-notes artifact');
  const text = readFileSync(notes, 'utf8');
  assert.ok(text.trim(), 'The original run\'s release notes are empty');
  report.notes = notes;
  return { notes, text };
}

async function inspect(runId: string) {
  const run = github(`actions/runs/${runId}`) as { path: string; head_sha: string; status: string };
  assert.equal(run.path, '.github/workflows/release.yml', 'The original run must use release.yml');
  assert.match(run.head_sha, /^[a-f0-9]{40}$/, 'The original run must identify its commit');
  if (run.status !== 'completed') {
    // Publication and its recovery step may still be running; nothing is settled yet.
    report.state = 'in-progress';
    report.runStatus = run.status;
    report.nextAction = `Wait for the run to finish, for example with ${command(['gh', 'run', 'watch', runId, '--repo', repository])}, then rerun release-status with a fresh output directory. Do not publish, upload or dispatch while the run is in progress.`;
    return;
  }
  const { jobs } = github(`actions/runs/${runId}/jobs?per_page=100`) as { jobs: { name: string; conclusion: string }[] };
  for (const name of ['validate (ubuntu-latest)', 'validate (macos-latest)']) {
    assert.ok(jobs.some(job => job.name === name && job.conclusion === 'success'),
      `Original ${name} must have passed; verification-only runs cannot supply a validated bundle`);
  }
  report.commit = run.head_sha;
  gh(['run', 'download', runId, '--name', 'release-bundle', '--dir', bundleDirectory]);
  const bundle = JSON.parse(readFileSync(join(bundleDirectory, 'release.json'), 'utf8')) as Bundle;
  assert.equal(bundle.package, packageName);
  assert.match(bundle.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.equal(bundle.tarball, `lutzseverino-repo-standards-${bundle.version}.tgz`);
  const files = [bundle.tarball, 'repo-standards-bootstrap', 'SHA256SUMS', 'release.json'];
  assert.deepEqual(readdirSync(bundleDirectory).sort(), [...files].sort(), 'The original bundle must contain exactly four release files');
  assert.deepEqual(bundle.artifacts.map(a => a.file).sort(), [bundle.tarball, 'repo-standards-bootstrap'].sort());
  for (const artifact of bundle.artifacts) {
    assert.equal(createHash('sha256').update(readFileSync(join(bundleDirectory, artifact.file))).digest('hex'), artifact.sha256,
      `Original bundle hash mismatch: ${artifact.file}`);
  }
  assert.equal(readFileSync(join(bundleDirectory, 'SHA256SUMS'), 'utf8'),
    bundle.artifacts.map(a => `${a.sha256}  ${a.file}\n`).join(''));
  assert.equal(`sha512-${createHash('sha512').update(readFileSync(join(bundleDirectory, bundle.tarball))).digest('base64')}`, bundle.integrity,
    'Original tarball does not match its npm integrity');
  report.version = bundle.version;
  report.bundle = bundleDirectory;
  report.integrity = bundle.integrity;

  const registry = await request(`https://registry.npmjs.org/@lutzseverino%2Frepo-standards/${bundle.version}`);
  assert.ok([200, 404].includes(registry.status), `npm returned HTTP ${registry.status}; publication state is unknown`);
  if (registry.status === 200) {
    assert.equal((await registry.json() as { dist?: { integrity?: string } }).dist?.integrity, bundle.integrity, 'Published npm integrity differs from the original bundle');
  }
  report.npm = registry.status === 200 ? 'matches' : 'absent';
  const tag = `v${bundle.version}`;
  const ref = github(`git/ref/tags/${tag}`, true) as { object?: GitObject } | undefined;
  let object = ref?.object;
  for (let depth = 0; object?.type === 'tag' && depth < 10; depth++) {
    assert.match(object.sha, /^[a-f0-9]{40}$/);
    object = (github(`git/tags/${object.sha}`) as { object?: GitObject }).object;
  }
  if (ref) {
    assert.equal(object?.type, 'commit', 'Release tag must resolve to a commit');
    assert.equal(object?.sha, run.head_sha, 'Release tag differs from the original validated commit');
  }
  report.tag = ref ? 'matches' : 'absent';
  let release = github(`releases/tags/${tag}`, true) as Release | undefined;
  if (!release) {
    // The tag endpoint describes published releases. Check the authenticated
    // listing as well before treating a possibly unfinished draft as absent.
    assert.equal((github('') as { permissions?: { push?: boolean } }).permissions?.push, true, 'Push access is required to establish whether a draft release exists');
    const pages = JSON.parse(gh(['api', `repos/${repository}/releases?per_page=100`, '--paginate', '--slurp'])!.toString('utf8')) as Release[][];
    const matches = pages.flat().filter(candidate => candidate.tag_name === tag);
    assert.ok(matches.length <= 1, 'Multiple releases use the version tag; resolve the ambiguous publication state');
    release = matches[0];
  }
  if (registry.status === 404) {
    assert.equal(release, undefined, 'GitHub release exists while npm version is absent; resolve the inconsistent publication state');
    report.state = 'npm-version-missing';
    report.prerequisite = 'Complete interactive npm authentication and publication approval as described in docs/development/release.md. Reinspect state after publication.';
    report.nextAction = command(['npm', 'publish', join(bundleDirectory, bundle.tarball), '--ignore-scripts', '--access', 'public', '--registry=https://registry.npmjs.org']);
  } else if (!release) {
    const { notes } = originalNotes(runId);
    report.state = 'github-release-missing';
    report.nextAction = command(['gh', 'release', 'create', tag, ...files.map(file => join(bundleDirectory, file)),
      '--repo', repository, '--target', run.head_sha, '--title', `Repository Standards ${bundle.version}`,
      '--notes-file', notes]);
  } else {
    assert.equal(release.tag_name, tag);
    assert.equal(typeof release.draft, 'boolean');
    assert.equal(release.prerelease, false);
    if (!ref) {
      assert.equal(release.draft, true, 'A published release must have a matching Git tag');
      assert.equal(release.target_commitish, run.head_sha, 'A draft without a Git tag must target the exact original validated commit');
    }
    if (release.draft) {
      // Publishing a draft makes its body the durable release record.
      const normalized = (text: string) => text.replaceAll('\r\n', '\n').trim();
      assert.equal(normalized(String(release.body ?? '')), normalized(originalNotes(runId).text),
        'The draft release body differs from the original run\'s release notes');
    }
    report.release = release.draft ? 'draft' : 'published';
    const matched: string[] = [];
    const missing: string[] = [];
    for (const file of files) {
      const assets = release.assets.filter(asset => asset.name === file);
      assert.ok(assets.length <= 1, `Multiple release assets use the same name: ${file}`);
      const asset = assets[0];
      if (!asset) {
        missing.push(file);
        continue;
      }
      let bytes: Buffer;
      if (release.draft) {
        assert.ok(Number.isSafeInteger(asset.id) && asset.id > 0, `Invalid draft asset identity: ${file}`);
        bytes = gh(['api', `repos/${repository}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'])!;
      } else {
        const response = await request(`https://github.com/${repository}/releases/download/${tag}/${file}`);
        assert.equal(response.status, 200, `Cannot inspect release asset ${file}: HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
      }
      assert.equal(createHash('sha256').update(bytes).digest('hex'),
        createHash('sha256').update(readFileSync(join(bundleDirectory, file))).digest('hex'), `Release asset differs from original bundle: ${file}`);
      matched.push(file);
    }
    report.assets = { matched, missing };
    if (missing.length) {
      report.state = 'github-assets-missing';
      report.nextAction = command(['gh', 'release', 'upload', tag, ...missing.map(file => join(bundleDirectory, file)), '--repo', repository]);
    } else if (release.draft) {
      report.state = 'github-draft-ready';
      report.nextAction = command(['gh', 'release', 'edit', tag, '--draft=false', '--target', run.head_sha, '--repo', repository]);
    } else {
      const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', timeout: 10_000 });
      assert.ok(branch.status === 0 && branch.stdout.trim(), 'Use a checkout of the reviewed workflow branch to select verification code');
      report.state = 'published';
      report.nextAction = command(['gh', 'workflow', 'run', 'release.yml', '--repo', repository,
        '--ref', branch.stdout.trim(), '-f', `version=${bundle.version}`, '-F', 'verify_published=true']);
    }
  }
}

try {
  await inspect(runId);
} catch (error) {
  report.failure = error instanceof Error ? error.message : 'Release inspection failed';
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, 'status.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
