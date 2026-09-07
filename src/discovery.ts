import { realpathSync } from 'node:fs';
import { acquireSource, github, isStableVersion } from './acquisition.js';
import { ProductError } from './errors.js';
import { validateSource } from './resolver.js';

async function stableRelease(repository: string) {
  for (let page = 1; ; page++) {
    const releases = await github(`/repos/${repository}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases)) throw new ProductError('INVALID_SOURCE', 'GitHub did not return a release list.');
    const release = releases.find(item => item?.draft === false && item.prerelease === false && isStableVersion(item.tag_name));
    if (release) {
      if (typeof release.published_at !== 'string' || !Number.isFinite(Date.parse(release.published_at)) ||
          (release.name !== null && typeof release.name !== 'string')) throw new ProductError('INVALID_SOURCE', 'GitHub returned invalid stable release metadata.');
      return { version: release.tag_name as string, name: release.name as string | null,
        url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`, publishedAt: release.published_at as string };
    }
    if (releases.length < 100) throw new ProductError('NO_STABLE_RELEASE', 'Publish a non-draft GitHub release with a stable SemVer tag to make this source discoverable.');
  }
}

export async function searchSources(cliVersion: string, page: number) {
  const result = await github(`/search/repositories?q=topic%3Arepo-standards%20is%3Apublic&per_page=30&page=${page}`);
  if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(result.total_count) || result.total_count < 0 || typeof result.incomplete_results !== 'boolean') {
    throw new ProductError('INVALID_SEARCH_RESPONSE', 'GitHub did not return a complete search response. Retry discovery or inspect a known source directly.');
  }
  const candidates = [];
  const rejected = [];
  for (const item of result.items) {
    const repository = typeof item?.full_name === 'string' ? `https://github.com/${item.full_name}` : null;
    let release: Awaited<ReturnType<typeof stableRelease>> | undefined;
    try {
      if (item?.private !== false || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(item?.full_name ?? '') || ['.', '..'].includes(item.full_name.split('/')[1])) {
        throw new ProductError('UNSUPPORTED_SOURCE', 'The candidate must identify a public GitHub repository.');
      }
      if (item.description !== null && typeof item.description !== 'string') throw new ProductError('INVALID_SOURCE', 'GitHub returned an invalid repository description.');
      release = await stableRelease(item.full_name);
      const source = await acquireSource(repository!, release.version, realpathSync('.'));
      try {
        const validation = validateSource(source.root, cliVersion, source.paths);
        if (!validation.valid) throw new ProductError('INVALID_STANDARDS', 'The released source is invalid or incompatible with this CLI.', validation.errors.map(error => ({ ...error, file: 'standards.yaml' })));
        candidates.push({ repository: source.identity.repository, description: item.description, commit: source.identity.commit,
          release,
          source: { name: validation.source!.name, description: validation.source!.description, requires: validation.source!.requires },
          profiles: Object.keys(validation.profiles),
        });
      } finally { source.close(); }
    } catch (error) {
      if (!(error instanceof ProductError)) throw error;
      rejected.push({ repository, ...(release ? { release } : {}), code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) });
    }
  }
  return { cliVersion, topic: 'repo-standards', notice: 'Discovery is not an endorsement. Choose a source, stable version and profile yourself, then inspect before confirming adoption.',
    page, totalCount: result.total_count, incompleteResults: result.incomplete_results, searchLimitReached: result.total_count > 1000,
    candidates, rejected, nextPage: page * 30 < Math.min(result.total_count, 1000) ? page + 1 : null };
}
