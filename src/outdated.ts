import { compare, gt } from 'semver';
import { parse } from 'yaml';
import { githubHeaders, isStableVersion } from './acquisition.js';
import { file, json, projectRoot, safe, write } from './adoption-files.js';
import type { RecordedSelection } from './recorded-state.js';
import { ProductError } from './errors.js';
import { git } from './inspection.js';
import type { Observation } from './inspection.js';

// Availability of a published CLI or standards version newer than each pin.
// The command only reads the selection and writes its own ignored cache; any
// failure to answer a pin degrades that pin to `unknown` instead of an error.
const format = 'repo-standards/outdated/v1';
const packageName = '@lutzseverino/repo-standards';
const cachePath = '.repo-standards/cache/outdated.json';
const cacheFormat = 'repo-standards/outdated-cache/v1';
const cacheValidity = 24 * 60 * 60 * 1000;
const lookupTimeout = 10_000;

interface Reason { code: string; message: string }
// One lookup's answer: every stable version it published, and when it was read.
interface Lookup { key: string; checkedAt: string; versions: string[] }
type Answer = { lookup: Lookup; cached: boolean } | { reason: Reason };

function selectionOf(project: string) {
  let root: string;
  try { root = projectRoot(project); }
  catch { throw new ProductError('NO_SELECTION', 'The project is not a Git working tree, so it has no adoption selection.'); }
  let observed: Observation;
  try { observed = safe(root, '.repo-standards/selection.yaml'); }
  catch { throw new ProductError('INVALID_SELECTION', 'The adoption selection path .repo-standards/selection.yaml is unsafe to read. Restore the committed product state.'); }
  if (observed.type === 'missing') throw new ProductError('NO_SELECTION', 'The project has no adoption selection at .repo-standards/selection.yaml.');
  let selection: RecordedSelection | undefined;
  try { if (observed.type === 'file') selection = parse(Buffer.from(observed.content, observed.encoding).toString('utf8')); }
  catch { /* Rejected below with every other unreadable selection. */ }
  if (selection?.cli?.package !== packageName || !isStableVersion(selection.cli.version)
    || typeof selection.standards?.repository !== 'string' || !githubRepository(selection.standards.repository) || !isStableVersion(selection.standards.version)) {
    throw new ProductError('INVALID_SELECTION', 'The adoption selection at .repo-standards/selection.yaml cannot be read. Restore the committed product state.');
  }
  return { root, selection };
}

function githubRepository(repository: string) {
  return /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)$/.exec(repository)?.[1];
}

async function request(url: string, headers: Record<string, string>, code: string, service: string) {
  try { return await fetch(url, { headers, signal: AbortSignal.timeout(lookupTimeout) }); }
  catch { throw new ProductError(code, `Cannot reach ${service} at ${url}. Check the connection and retry later.`); }
}

async function registryVersions(registry: string) {
  const url = `${registry.endsWith('/') ? registry : `${registry}/`}${packageName.replace('/', '%2f')}`;
  const response = await request(url, { Accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8' }, 'REGISTRY_UNAVAILABLE', 'the npm registry');
  if (!response.ok) throw new ProductError('REGISTRY_UNAVAILABLE', `The npm registry returned HTTP ${response.status} for ${packageName}.`);
  const document = await response.json().catch(() => undefined);
  if (typeof document?.versions !== 'object' || document.versions === null) throw new ProductError('REGISTRY_UNAVAILABLE', `The npm registry did not return the published versions of ${packageName}.`);
  return Object.keys(document.versions);
}

async function releaseVersions(repository: string) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${githubRepository(repository)}/releases?per_page=100`;
  const response = await request(url, { ...githubHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, 'SOURCE_UNAVAILABLE', 'public GitHub');
  if (response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) {
    throw new ProductError('QUOTA_EXHAUSTED', 'The GitHub API quota is exhausted. Retry later, or provide a token in GH_TOKEN or GITHUB_TOKEN.');
  }
  if (!response.ok) throw new ProductError('SOURCE_UNAVAILABLE', `Public GitHub returned HTTP ${response.status} for the releases of ${repository}.`);
  const releases = await response.json().catch(() => undefined);
  if (!Array.isArray(releases)) throw new ProductError('SOURCE_UNAVAILABLE', `Public GitHub did not return a release list for ${repository}.`);
  return releases.filter(release => release?.draft === false && release.prerelease === false).map(release => release.tag_name);
}

function readCache(root: string): Record<string, Lookup> {
  try {
    const observed = safe(root, cachePath);
    if (observed.type !== 'file') return {};
    const cache = JSON.parse(Buffer.from(observed.content, observed.encoding).toString('utf8'));
    return cache?.format === cacheFormat && typeof cache.lookups === 'object' && cache.lookups !== null ? cache.lookups : {};
  } catch { return {}; }
}

function fresh(lookup: Lookup | undefined, key: string, now: number): lookup is Lookup {
  const age = now - Date.parse(lookup?.checkedAt ?? '');
  return lookup?.key === key && Array.isArray(lookup.versions) && lookup.versions.every(isStableVersion) && age >= 0 && age < cacheValidity;
}

async function answer(cached: Lookup | undefined, key: string, now: number, lookup: () => Promise<string[]>): Promise<Answer> {
  if (fresh(cached, key, now)) return { lookup: cached, cached: true };
  try {
    const versions = [...new Set((await lookup()).filter(isStableVersion))].sort(compare);
    if (!versions.length) throw new ProductError('NO_STABLE_RELEASE', 'No stable version has been published.');
    return { lookup: { key, checkedAt: new Date(now).toISOString(), versions }, cached: false };
  } catch (error) {
    return { reason: error instanceof ProductError ? { code: error.code, message: error.message } : { code: 'LOOKUP_FAILED', message: (error as Error).message } };
  }
}

function pin(pinned: string, result: Answer) {
  if ('reason' in result) return { pinned, update: 'unknown', reason: result.reason };
  const newer = result.lookup.versions.filter(version => gt(version, pinned));
  return { pinned, update: newer.length ? 'available' : 'none', newest: result.lookup.versions.at(-1)!,
    newerStableReleases: newer.length, checkedAt: result.lookup.checkedAt, cached: result.cached };
}

// Write only inside the ignored product cache directory; a cache that cannot
// be written safely is skipped rather than reported.
function writeCache(root: string, lookups: Record<string, Lookup>) {
  try {
    const ignored = git(root, ['check-ignore', '--quiet', cachePath]);
    if (ignored.status === 0) write(root, cachePath, file(json({ format: cacheFormat, lookups })));
  } catch { /* The answer stands without a cache. */ }
}

export async function outdated(project: string) {
  let root: string;
  let selection: RecordedSelection;
  try { ({ root, selection } = selectionOf(project)); }
  catch (error) {
    const reason = error instanceof ProductError ? { code: error.code, message: error.message } : { code: 'INVALID_SELECTION', message: (error as Error).message };
    return { format, cli: { package: packageName, pinned: null, update: 'unknown', reason },
      standards: { repository: null, pinned: null, update: 'unknown', reason } };
  }
  const registry = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org/';
  const cache = readCache(root);
  const now = Date.now();
  const [cli, standards] = await Promise.all([
    answer(cache.cli, `${registry}\n${packageName}`, now, () => registryVersions(registry)),
    answer(cache.standards, selection.standards.repository, now, () => releaseVersions(selection.standards.repository)),
  ]);
  if ([cli, standards].some(result => 'lookup' in result && !result.cached)) {
    writeCache(root, Object.fromEntries(Object.entries({ cli, standards }).flatMap(([name, result]) => 'lookup' in result ? [[name, result.lookup]] : [])));
  }
  return { format,
    cli: { package: packageName, ...pin(selection.cli.version, cli) },
    standards: { repository: selection.standards.repository, ...pin(selection.standards.version, standards) } };
}
