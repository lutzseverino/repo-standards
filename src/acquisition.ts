import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { valid, prerelease } from 'semver';
import { foldPath } from './paths.js';
import { ProductError } from './errors.js';

export interface StandardsIdentity { repository: string; version: string; commit: string }
const shaPattern = /^[a-f0-9]{40}$/;

export function hash(bytes: string | Buffer) { return createHash('sha256').update(bytes).digest('hex'); }

// Resolve existing ancestors so an environment override cannot redirect writes
// into the adopting project through a symlink.
export function externalPath(path: string, project: string): string {
  path = resolve(path);
  let ancestor = path;
  const missing: string[] = [];
  while (true) {
    try { path = join(realpathSync(ancestor), ...missing); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.unshift(relative(parent, ancestor));
      ancestor = parent;
    }
  }
  const within = relative(project, path);
  if (within === '' || (within !== '..' && !within.startsWith('../') && !isAbsolute(within))) {
    throw new ProductError('UNSAFE_CACHE', 'Temporary storage and XDG_CACHE_HOME must be outside the adopting project. Set TMPDIR and XDG_CACHE_HOME to external directories.');
  }
  return path;
}

async function github(path: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'repo-standards' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new ProductError('SOURCE_UNAVAILABLE', `Cannot reach public GitHub: ${path}. Check your connection and retry.`); }
  if (!response.ok) throw new ProductError('SOURCE_UNAVAILABLE', `Public GitHub returned HTTP ${response.status} for ${path}. Check the public repository, version tag, and API rate limit.`);
  return response.json();
}

export async function acquireSource(repository: string, version: string, project: string) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(repository);
  if (!match || match[2] === '.' || match[2] === '..') throw new ProductError('UNSUPPORTED_SOURCE', 'Use a public https://github.com/owner/repository URL. Local paths, SSH, other hosts, and URL references are unsupported.');
  if (!/^v?\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(version) || !valid(version) || prerelease(version)) {
    throw new ProductError('INVALID_STANDARDS_VERSION', 'Choose an exact stable SemVer tag, such as v1.2.3. Branches, ranges, and prereleases are unsupported.');
  }
  const metadata = await github(`/repos/${match[1]}/${match[2]}`);
  if (metadata.private !== false || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(metadata.full_name)) throw new ProductError('UNSUPPORTED_SOURCE', 'The standards repository must be public on GitHub.');
  const canonical = `https://github.com/${metadata.full_name}`;
  const api = `/repos/${metadata.full_name}`;
  const ref = await github(`${api}/git/ref/tags/${encodeURIComponent(version)}`);
  if (ref.ref !== `refs/tags/${version}`) throw new ProductError('INVALID_SOURCE', 'GitHub did not return the requested exact tag.');
  let object = ref.object;
  for (let depth = 0; object?.type === 'tag' && depth < 10; depth++) {
    if (!shaPattern.test(object.sha)) throw new ProductError('INVALID_SOURCE', 'Invalid annotated tag identity.');
    object = (await github(`${api}/git/tags/${object.sha}`)).object;
  }
  if (object?.type !== 'commit' || !shaPattern.test(object.sha)) throw new ProductError('INVALID_SOURCE', 'The stable version tag must identify a Git commit.');
  const identity: StandardsIdentity = { repository: canonical, version, commit: object.sha };
  const cache = externalPath(join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'repo-standards', 'tags'), project);
  mkdirSync(cache, { recursive: true });
  const observation = join(cache, `${hash(`${canonical.toLowerCase()}\n${version}`)}.json`);
  try { writeFileSync(observation, JSON.stringify(identity), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let previous: StandardsIdentity;
    try { previous = JSON.parse(readFileSync(observation, 'utf8')) as StandardsIdentity; }
    catch { throw new ProductError('INVALID_OBSERVATION', 'Cannot read the previously observed tag identity; restore the external observation cache.'); }
    if (previous.commit !== identity.commit) throw new ProductError('MOVED_TAG', `Previously observed ${canonical} ${version} at ${previous.commit}; it now resolves to ${identity.commit}. Choose a new immutable version.`);
  }
  const commit = await github(`${api}/git/commits/${identity.commit}`);
  if (commit.sha !== identity.commit || !shaPattern.test(commit.tree?.sha)) throw new ProductError('INVALID_SOURCE', 'Invalid Git commit response.');
  const tree = await github(`${api}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.sha !== commit.tree.sha || tree.truncated !== false || !Array.isArray(tree.tree)) throw new ProductError('INVALID_SOURCE', 'GitHub must provide a complete source tree.');
  const root = mkdtempSync(join(externalPath(tmpdir(), project), 'repo-standards-snapshot-'));
  try {
    const paths = new Set<string>();
    const spellings = new Map<string, string>();
    for (const entry of tree.tree) {
      if (typeof entry.path !== 'string' || /[\\\p{Cc}]/u.test(entry.path) || /^[A-Za-z]:/.test(entry.path) ||
          entry.path.split('/').some((part: string) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
        throw new ProductError('UNSAFE_SOURCE', 'The source tree contains an unsafe path.');
      }
      const parts = entry.path.split('/');
      for (let length = 1; length <= parts.length; length++) {
        const path = parts.slice(0, length).join('/');
        const key = foldPath(path);
        const previous = spellings.get(key);
        if (previous !== undefined && previous !== path) throw new ProductError('UNSAFE_SOURCE', `Source paths alias on supported filesystems: ${previous} and ${path}.`);
        spellings.set(key, path);
        paths.add(path);
      }
    }
    for (const entry of tree.tree) {
      if (entry.type === 'tree' && entry.mode === '040000') continue;
      if (entry.mode === '120000') throw new ProductError('SOURCE_SYMLINK', `The selected source contains a symbolic link: ${entry.path}.`);
      if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || !shaPattern.test(entry.sha)) throw new ProductError('UNSAFE_SOURCE', `Unsupported source entry: ${entry.path}. Submodules and special files are unsupported.`);
      const blob = await github(`${api}/git/blobs/${entry.sha}`);
      if (blob.sha !== entry.sha || blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new ProductError('INVALID_SOURCE', `Invalid source blob: ${entry.path}.`);
      const bytes = Buffer.from(blob.content, 'base64');
      const oid = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (oid !== entry.sha) throw new ProductError('SOURCE_INTEGRITY', `Source bytes do not match Git identity: ${entry.path}.`);
      const target = join(root, entry.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes, { flag: 'wx' });
      chmodSync(target, entry.mode === '100755' ? 0o755 : 0o644);
    }
    return { root, identity, paths, close() { rmSync(root, { recursive: true, force: true }); } };
  } catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
}
