import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative } from "node:path";
import {
  acquireSource,
  gitEnvironment,
  github,
  isStableVersion,
} from "./acquisition.js";
import { ProductError } from "./errors.js";
import { validateSource } from "./resolver.js";
import { record } from "./records.js";

async function stableRelease(repository: string) {
  for (let page = 1; ; page++) {
    const releases = await github(
      `/repos/${repository}/releases?per_page=100&page=${page}`,
    );
    if (!Array.isArray(releases))
      throw new ProductError(
        "INVALID_SOURCE",
        "GitHub did not return a release list.",
      );
    for (const release of releases.map(record)) {
      const { tag_name: version, name, published_at: publishedAt } = release;
      if (
        release.draft !== false ||
        release.prerelease !== false ||
        !isStableVersion(version)
      )
        continue;
      if (
        typeof publishedAt !== "string" ||
        !Number.isFinite(Date.parse(publishedAt)) ||
        (name !== null && typeof name !== "string")
      )
        throw new ProductError(
          "INVALID_SOURCE",
          "GitHub returned invalid stable release metadata.",
        );
      return {
        version,
        name,
        url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(version)}`,
        publishedAt,
      };
    }
    if (releases.length < 100)
      throw new ProductError(
        "NO_STABLE_RELEASE",
        "Publish a non-draft GitHub release with a stable SemVer tag to make this source discoverable.",
      );
  }
}

export async function searchSources(cliVersion: string, page: number) {
  const result = record(
    await github(
      `/search/repositories?q=topic%3Arepo-standards%20is%3Apublic&per_page=30&page=${page}`,
    ),
  );
  const {
    items,
    total_count: totalCount,
    incomplete_results: incompleteResults,
  } = result;
  if (
    !Array.isArray(items) ||
    typeof totalCount !== "number" ||
    !Number.isSafeInteger(totalCount) ||
    totalCount < 0 ||
    typeof incompleteResults !== "boolean"
  ) {
    throw new ProductError(
      "INVALID_SEARCH_RESPONSE",
      "GitHub did not return a complete search response. Retry discovery or inspect a known source directly.",
    );
  }
  const location = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    env: gitEnvironment(),
  });
  const project =
    location.status === 0 ? realpathSync(location.stdout.trim()) : undefined;
  const candidates = [];
  const rejected = [];
  for (const item of items.map(record)) {
    const repository =
      typeof item.full_name === "string"
        ? `https://github.com/${item.full_name}`
        : null;
    let release: Awaited<ReturnType<typeof stableRelease>> | undefined;
    try {
      if (
        item.private !== false ||
        typeof item.full_name !== "string" ||
        !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(item.full_name) ||
        [".", ".."].includes(item.full_name.split("/")[1]!)
      ) {
        throw new ProductError(
          "UNSUPPORTED_SOURCE",
          "The candidate must identify a public GitHub repository.",
        );
      }
      if (item.description !== null && typeof item.description !== "string")
        throw new ProductError(
          "INVALID_SOURCE",
          "GitHub returned an invalid repository description.",
        );
      release = await stableRelease(item.full_name);
      const source = await acquireSource(repository!, release.version, project);
      try {
        const validation = validateSource(source.root, cliVersion, source);
        if (!validation.valid)
          throw new ProductError(
            "INVALID_STANDARDS",
            "The released source is invalid or incompatible with this CLI.",
            validation.errors.map((error) => ({
              ...error,
              file: relative(source.root, error.file),
            })),
          );
        candidates.push({
          repository: source.identity.repository,
          description: item.description,
          commit: source.identity.commit,
          release,
          source: {
            name: validation.source!.name,
            description: validation.source!.description,
            requires: validation.source!.requires,
          },
          profiles: Object.keys(validation.profiles),
        });
      } finally {
        source.close();
      }
    } catch (error) {
      if (!(error instanceof ProductError) || error.code === "QUOTA_EXHAUSTED")
        throw error;
      rejected.push({
        repository,
        ...(release ? { release } : {}),
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      });
    }
  }
  return {
    cliVersion,
    topic: "repo-standards",
    notice:
      "Discovery is not an endorsement. Choose a source, stable version and profile yourself, then inspect before confirming adoption.",
    page,
    totalCount,
    incompleteResults,
    searchLimitReached: totalCount > 1000,
    candidates,
    rejected,
    nextPage: page * 30 < Math.min(totalCount, 1000) ? page + 1 : null,
  };
}
