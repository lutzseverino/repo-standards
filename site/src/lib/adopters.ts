// Search discovers candidates; only a repository's current default-branch
// selection establishes adoption. Nothing from search's file text is counted.
import { parse } from "yaml";

export type AdoptionInput = {
  candidates(): AsyncIterable<string>;
  repository(repository: string): Promise<{
    private: boolean;
    fork: boolean;
    archived: boolean;
    default_branch: string;
  } | null>;
  selection(repository: string, branch: string): Promise<string | null>;
};

export async function countAdopters(
  sources: string[],
  input: AdoptionInput,
): Promise<Record<string, number>> {
  const counts = Object.fromEntries(
    sources.map((source) => [source.toLowerCase(), 0]),
  );
  const seen = new Set<string>();
  for await (const candidate of input.candidates()) {
    const repository = candidate.toLowerCase();
    if (seen.has(repository)) continue;
    seen.add(repository);
    const metadata = await input.repository(repository);
    if (!metadata || metadata.private || metadata.fork || metadata.archived)
      continue;
    const selection = await input.selection(
      repository,
      metadata.default_branch,
    );
    const source = selection === null ? undefined : selectedSource(selection);
    if (
      source !== undefined &&
      Object.hasOwn(counts, source) &&
      repository !== source
    )
      counts[source]++;
  }
  return counts;
}

function selectedSource(selection: string): string | undefined {
  try {
    const value: unknown = parse(selection);
    if (!value || typeof value !== "object" || !("standards" in value)) return;
    const standards = value.standards;
    if (
      !standards ||
      typeof standards !== "object" ||
      !("repository" in standards)
    )
      return;
    if (typeof standards.repository !== "string") return;
    const url = new URL(standards.repository);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return;
    const identity = url.pathname
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .replace(/\.git$/i, "");
    return /^[\w.-]+\/[\w.-]+$/.test(identity)
      ? identity.toLowerCase()
      : undefined;
  } catch {
    // An unrelated or malformed file does not record a source selection.
    return;
  }
}

type GitHubOptions = {
  token: string;
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  report?: (message: string) => void;
};

/** Only the supplied workflow token is used. All acquisition reads share a
 * fifteen-minute total wait budget, including primary and secondary limits. */
export function githubAdoptions(options: GitHubOptions): AdoptionInput {
  if (!options.token.trim())
    throw new Error("Public-adopter acquisition requires the workflow token.");
  const request = options.fetch ?? fetch;
  const wait =
    options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const report = options.report ?? console.error;
  let waited = 0;
  const waitCap = 15 * 60_000;
  async function get(path: string): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await request(`https://api.github.com${path}`, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${options.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new Error("Public-adopter GitHub request failed.");
      }
      if (response.ok || response.status === 404) {
        if (path.startsWith("/search/code?"))
          report(
            JSON.stringify({
              status: response.status,
              resource: response.headers.get("x-ratelimit-resource"),
              limit: response.headers.get("x-ratelimit-limit"),
              remaining: response.headers.get("x-ratelimit-remaining"),
              reset: response.headers.get("x-ratelimit-reset"),
            }),
          );
        return response;
      }
      const message = await response.text();
      const limited =
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" ||
            /rate limit|secondary|abuse/i.test(message)));
      if (!limited)
        throw new Error(
          `Public-adopter GitHub request refused: HTTP ${response.status}.`,
        );
      const retry = response.headers.get("retry-after");
      const reset = response.headers.get("x-ratelimit-reset");
      report(
        JSON.stringify({
          status: response.status,
          attempt,
          retryAfter: retry,
          limit: response.headers.get("x-ratelimit-limit"),
          remaining: response.headers.get("x-ratelimit-remaining"),
          reset,
          resource: response.headers.get("x-ratelimit-resource"),
          waitedMs: waited,
        }),
      );
      const retryAt =
        retry === null
          ? 0
          : /^\d+$/.test(retry)
            ? now() + Number(retry) * 1000
            : Date.parse(retry);
      const resetAt =
        reset !== null && response.headers.get("x-ratelimit-remaining") === "0"
          ? Number(reset) * 1000
          : 0;
      const delay = Math.max(
        60_000 * 2 ** (attempt - 1),
        Number.isFinite(retryAt) ? retryAt - now() + 1000 : 0,
        Number.isFinite(resetAt) ? resetAt - now() + 1000 : 0,
      );
      if (waited + delay > waitCap)
        throw new Error(
          "Public-adopter rate limit persisted; deployment must stop.",
        );
      waited += delay;
      await wait(delay);
    }
  }
  function repositoryPath(repository: string) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
      throw new Error("Invalid adopter repository identity.");
    return `/repos/${repository}`;
  }
  return {
    async *candidates() {
      // Every recorded GitHub selection contains its source's GitHub URL.
      // One query serves every listed source, then current selections decide
      // identity. Further queries are only pagination or rate-limit retries.
      const query = '"github.com" path:.repo-standards filename:selection.yaml';
      for (let page = 1; ; page++) {
        const response = await get(
          `/search/code?${new URLSearchParams({ q: query, per_page: "100", page: String(page) })}`,
        );
        if (!response.ok) throw new Error("Public-adopter code search failed.");
        const value = (await response.json()) as {
          total_count: number;
          incomplete_results: boolean;
          items: { path: string; repository: { full_name: string } }[];
        };
        if (
          !Number.isSafeInteger(value.total_count) ||
          value.total_count < 0 ||
          value.total_count > 1000 ||
          value.incomplete_results !== false ||
          !Array.isArray(value.items)
        )
          throw new Error(
            "Public-adopter code search is incomplete or malformed.",
          );
        for (const item of value.items) {
          if (
            typeof item.repository?.full_name !== "string" ||
            typeof item.path !== "string"
          )
            throw new Error("Public-adopter search candidate is malformed.");
          if (item.path === ".repo-standards/selection.yaml")
            yield item.repository.full_name;
        }
        if (page * 100 >= value.total_count) break;
        if (value.items.length === 0)
          throw new Error("Public-adopter search pagination is incomplete.");
      }
    },
    async repository(repository) {
      const response = await get(repositoryPath(repository));
      if (response.status === 404) return null;
      const value = (await response.json()) as {
        private: boolean;
        fork: boolean;
        archived: boolean;
        default_branch: string;
      };
      if (
        typeof value.private !== "boolean" ||
        typeof value.fork !== "boolean" ||
        typeof value.archived !== "boolean" ||
        typeof value.default_branch !== "string" ||
        !value.default_branch
      )
        throw new Error("Public-adopter repository metadata is malformed.");
      return value;
    },
    async selection(repository, branch) {
      const response = await get(
        `${repositoryPath(repository)}/contents/.repo-standards/selection.yaml?${new URLSearchParams({ ref: branch })}`,
      );
      if (response.status === 404) return null;
      const value = (await response.json()) as {
        type: string;
        encoding: string;
        content: string;
      };
      if (
        value.type !== "file" ||
        value.encoding !== "base64" ||
        typeof value.content !== "string"
      )
        throw new Error("Public-adopter selection response is malformed.");
      return Buffer.from(value.content, "base64").toString("utf8");
    },
  };
}
