import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { valid, prerelease } from "semver";
import {
  connect,
  PlatformError,
  type ReleaseSource,
} from "@lutzseverino/postern";
import { foldPath, isRootLicense } from "./paths.js";
import { ProductError } from "./errors.js";
import { record } from "./records.js";

export interface StandardsIdentity {
  repository: string;
  version: string;
  commit: string;
}
export function isStableVersion(version: unknown): version is string {
  return (
    typeof version === "string" &&
    /^v?\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(version) &&
    valid(version) !== null &&
    prerelease(version) === null
  );
}

const shaPattern = /^[a-f0-9]{40}$/;

export function hash(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Resolve existing ancestors so an environment override cannot redirect writes
// into the adopting project through a symlink.
export function externalPath(path: string, project?: string): string {
  path = resolve(path);
  let ancestor = path;
  const missing: string[] = [];
  while (true) {
    try {
      path = join(realpathSync(ancestor), ...missing);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.unshift(relative(parent, ancestor));
      ancestor = parent;
    }
  }
  if (project === undefined) return path;
  const within = relative(project, path);
  if (
    within === "" ||
    (within !== ".." && !within.startsWith("../") && !isAbsolute(within))
  ) {
    throw new ProductError(
      "UNSAFE_CACHE",
      "Temporary storage, XDG_CACHE_HOME, and the npm cache must be outside the adopting project. Configure external directories and retry.",
    );
  }
  return path;
}

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "repo-standards",
};
const githubOrigin = "https://api.github.com";

// GitHub refused a request it received: the quota is exhausted, or it
// rejected the token. Unlike an unreachable source, the same request fails
// again until the quota resets or the token changes. Its code stays the
// documented one.
export class GithubRefusal extends ProductError {}

interface GithubRequestOptions {
  timeoutMs?: number;
  connectionMessage?: string;
  httpMessage?: (status: number) => string;
  invalidJsonMessage?: string;
}

function quotaRetry(headers: Headers): string {
  const now = Date.now();
  const retry = headers.get("retry-after");
  if (retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry)))
    return ` Retry after ${Number(retry)} seconds.`;
  if (retry) {
    const time = new Date(retry);
    if (time.getTime() > now) return ` Retry at ${time.toISOString()}.`;
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset && /^\d+$/.test(reset)) {
    const time = new Date(Number(reset) * 1000);
    if (time.getTime() > now) return ` Retry at ${time.toISOString()}.`;
  }
  return "";
}

// Reads not covered by Postern (search, metadata and commit/tree verification)
// use this GitHub-only boundary. Credentials are request headers
// only, never part of a source identity or a diagnostic. Git object fetches
// below use their separate, anonymous smart-protocol path.
export async function github(
  path: string,
  options: GithubRequestOptions = {},
): Promise<unknown> {
  const token =
    process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  const request = () =>
    fetch(`${githubOrigin}${path}`, {
      headers: {
        ...githubHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  let response: Response;
  try {
    try {
      response = await request();
    } catch (error) {
      // A pooled connection that GitHub closed while the process was busy,
      // such as during a runtime install, fails before any response. The GET
      // is sent once more, on a new connection.
      const code = ((error as Error).cause as NodeJS.ErrnoException)?.code;
      if (code !== "UND_ERR_SOCKET" && code !== "ECONNRESET") throw error;
      response = await request();
    }
  } catch {
    throw new ProductError(
      "SOURCE_UNAVAILABLE",
      options.connectionMessage ??
        `Cannot reach public GitHub: ${path}. Check your connection and retry.`,
    );
  }
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after")))
  )
    throw new GithubRefusal(
      "QUOTA_EXHAUSTED",
      `The GitHub API quota is exhausted.${quotaRetry(response.headers)} Retry later, or provide a token in GH_TOKEN or GITHUB_TOKEN.`,
    );
  if (response.status === 401 && token) {
    if (response.redirected && new URL(response.url).origin !== githubOrigin)
      throw new ProductError(
        "SOURCE_UNAVAILABLE",
        "The GitHub redirect target returned HTTP 401. Check the redirect target and retry.",
      );
    throw new GithubRefusal(
      "SOURCE_UNAVAILABLE",
      "GitHub rejected the token in GH_TOKEN or GITHUB_TOKEN. Check the token and retry.",
    );
  }
  if (!response.ok)
    throw new ProductError(
      "SOURCE_UNAVAILABLE",
      options.httpMessage?.(response.status) ??
        `Public GitHub returned HTTP ${response.status} for ${path}. Check the public repository, version tag, and API rate limit.`,
    );
  let document: unknown;
  try {
    document = await response.json();
  } catch (error) {
    if (options.invalidJsonMessage)
      throw new ProductError("SOURCE_UNAVAILABLE", options.invalidJsonMessage);
    // JSON parse errors may quote a response body that reflects authorization.
    // eslint-disable-next-line preserve-caught-error -- Retaining the original cause could retain credentials.
    if (token) throw new Error("GitHub returned invalid JSON.");
    throw error;
  }
  function containsCredential(value: unknown): boolean {
    if (typeof value === "string") return !!token && value.includes(token);
    if (value && typeof value === "object")
      return Object.entries(value).some(
        ([key, child]) => containsCredential(key) || containsCredential(child),
      );
    return false;
  }
  if (token && containsCredential(document))
    throw new ProductError(
      "SOURCE_UNAVAILABLE",
      "GitHub returned a response containing credentials. Retry later.",
    );
  return document;
}

// Postern owns release pagination, tag peeling and credential redaction. This
// boundary keeps the product's retry and actionable outcomes at every call site.
async function readReleaseSource<T>(
  repository: string,
  read: (source: ReleaseSource) => Promise<T>,
  path: string,
  options: GithubRequestOptions & { invalidResponseCode?: string } = {},
  tag = false,
): Promise<T> {
  const token =
    process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  try {
    const source = connect(`https://github.com/${repository}`, {
      ...(token ? { credential: token } : {}),
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
      fetch: globalThis.fetch,
    }).releaseSource;
    try {
      return await read(source);
    } catch (error) {
      if (
        !(error instanceof PlatformError) ||
        error.reason !== "unavailable" ||
        error.status !== undefined
      )
        throw error;
      return await read(source);
    }
  } catch (error) {
    if (!(error instanceof PlatformError)) throw error;
    switch (error.reason) {
      case "rateLimited":
        throw new GithubRefusal(
          "QUOTA_EXHAUSTED",
          `The GitHub API quota is exhausted.${error.retryAt ? ` Retry at ${error.retryAt}.` : ""} Retry later, or provide a token in GH_TOKEN or GITHUB_TOKEN.`,
        );
      case "unauthenticated":
        if (token)
          throw new GithubRefusal(
            "SOURCE_UNAVAILABLE",
            "GitHub rejected the token in GH_TOKEN or GITHUB_TOKEN. Check the token and retry.",
          );
        break;
      case "unsupported":
        throw new ProductError(
          "UNSUPPORTED_SOURCE",
          "The release source is unsupported. Use a public GitHub repository.",
        );
      case "notFound":
        if (tag && error.status === 200)
          throw new ProductError(
            "INVALID_SOURCE",
            "The stable version tag must identify a Git commit.",
          );
        break;
      case "invalidResponse":
        throw new ProductError(
          options.invalidResponseCode ?? "INVALID_SOURCE",
          options.invalidJsonMessage ?? "GitHub did not return a release list.",
        );
      case "forbidden":
      case "conflict":
      case "rejected":
      case "unavailable":
        break;
      default: {
        const reason: never = error.reason;
        throw new Error(`Unmapped platform error reason: ${String(reason)}`, {
          cause: error,
        });
      }
    }
    throw new ProductError(
      "SOURCE_UNAVAILABLE",
      error.status === undefined
        ? (options.connectionMessage ??
            `Cannot reach public GitHub: ${path}. Check your connection and retry.`)
        : (options.httpMessage?.(error.status) ??
            `Public GitHub returned HTTP ${error.status} for ${path}. Check the public repository, version tag, and API rate limit.`),
    );
  }
}

export function publishedReleases(
  repository: string,
  options: GithubRequestOptions & { invalidResponseCode?: string } = {},
) {
  return readReleaseSource(
    repository,
    (source) => source.releases(),
    `/repos/${repository}/releases`,
    options,
  );
}

// GitHub CLI credential helpers can read these variables from Git's inherited
// environment. REST credentials belong only to the REST request boundary.
export function gitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return env;
}

function git(
  directory: string,
  args: string[],
  binary = false,
): string | Buffer {
  const result = spawnSync("git", [`--git-dir=${directory}`, ...args], {
    encoding: binary ? "buffer" : "utf8",
    env: {
      ...gitEnvironment(),
      GIT_DEFAULT_HASH: "sha1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
    },
    timeout: 120_000,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (
    result.error &&
    (result.error as NodeJS.ErrnoException).code === "ENOENT"
  ) {
    throw new ProductError(
      "GIT_REQUIRED",
      "Install Git to acquire a public standards source.",
    );
  }
  if (result.error || result.status !== 0) {
    throw new ProductError(
      "SOURCE_UNAVAILABLE",
      "Cannot acquire the public Git source. Check the public repository, version tag, connection, and Git configuration.",
    );
  }
  return result.stdout;
}

interface GitTreeEntry {
  mode: string;
  type: string;
  sha: string;
  path: string;
}

function gitTree(directory: string, commit: string): GitTreeEntry[] {
  const output = git(
    directory,
    ["ls-tree", "-r", "-t", "-z", commit],
    true,
  ) as Buffer;
  const entries: GitTreeEntry[] = [];
  for (let start = 0; start < output.length;) {
    const end = output.indexOf(0, start);
    if (end < 0)
      throw new ProductError("INVALID_SOURCE", "Invalid Git tree data.");
    const record = output.subarray(start, end);
    const separator = record.indexOf(9);
    const metadata =
      separator < 0 ? "" : record.subarray(0, separator).toString("ascii");
    const match = /^(\d{6}) (blob|tree|commit) ([a-f0-9]{40})$/.exec(metadata);
    if (!match || separator === record.length - 1)
      throw new ProductError("INVALID_SOURCE", "Invalid Git tree data.");
    const pathBytes = record.subarray(separator + 1);
    const path = pathBytes.toString("utf8");
    if (!Buffer.from(path).equals(pathBytes))
      throw new ProductError(
        "UNSAFE_SOURCE",
        "The source tree contains a non-UTF-8 path.",
      );
    entries.push({ mode: match[1]!, type: match[2]!, sha: match[3]!, path });
    start = end + 1;
  }
  return entries;
}

// The owner and repository name a public GitHub source URL names.
export function githubSource(repository: string) {
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      repository,
    );
  if (!match || match[2] === "." || match[2] === "..")
    throw new ProductError(
      "UNSUPPORTED_SOURCE",
      "Use a public https://github.com/owner/repository URL. Local paths, SSH, other hosts, and URL references are unsupported.",
    );
  return { owner: match[1]!, name: match[2]! };
}

// A source's mutable observations: its public repository identity and the
// commit its version tag names. Acquisitions sharing one map, such as those of
// one guided adoption invocation, observe each source and tag once; a new map
// observes them again. Immutable material is reused through the snapshot cache
// instead, across processes.
export type SourceObservations = Map<string, Promise<TagObservation>>;

interface TagObservation {
  identity: StandardsIdentity;
  api: string;
}

// A directory of the external product cache, created on first use. The cache
// holds tag observations and verified source snapshots: public Git objects
// and identities, never credentials.
function cacheDirectory(name: string, project?: string) {
  const directory = externalPath(
    join(
      process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
      "repo-standards",
      name,
    ),
    project,
  );
  mkdirSync(directory, { recursive: true });
  return directory;
}

function objectId(type: string, bytes: Buffer) {
  return createHash("sha1")
    .update(`${type} ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

// A Git object's bytes, only once they hash to its identity.
function gitObject(directory: string, type: string, sha: string) {
  const bytes = git(directory, ["cat-file", type, sha], true) as Buffer;
  if (objectId(type, bytes) !== sha)
    throw new ProductError(
      "SOURCE_INTEGRITY",
      `Git object bytes do not match their identity: ${sha}.`,
    );
  return bytes;
}

async function observeTag(
  owner: string,
  name: string,
  version: string,
  project?: string,
): Promise<TagObservation> {
  const metadata = record(await github(`/repos/${owner}/${name}`));
  if (
    metadata.private !== false ||
    typeof metadata.full_name !== "string" ||
    !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(metadata.full_name)
  )
    throw new ProductError(
      "UNSUPPORTED_SOURCE",
      "The standards repository must be public on GitHub.",
    );
  const canonical = `https://github.com/${metadata.full_name}`;
  const api = `/repos/${metadata.full_name}`;
  const commit = await readReleaseSource(
    metadata.full_name,
    (source) => source.tagCommit(version),
    `${api}/git/ref/tags/${encodeURIComponent(version)}`,
    {
      invalidJsonMessage: "The stable version tag must identify a Git commit.",
    },
    true,
  );
  const identity: StandardsIdentity = {
    repository: canonical,
    version,
    commit,
  };
  const observation = join(
    cacheDirectory("tags", project),
    `${hash(`${canonical.toLowerCase()}\n${version}`)}.json`,
  );
  try {
    writeFileSync(observation, JSON.stringify(identity), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let previous: StandardsIdentity;
    try {
      previous = JSON.parse(
        readFileSync(observation, "utf8"),
      ) as StandardsIdentity;
    } catch {
      throw new ProductError(
        "INVALID_OBSERVATION",
        "Cannot read the previously observed tag identity; restore the external observation cache.",
      );
    }
    if (previous.commit !== identity.commit)
      throw new ProductError(
        "MOVED_TAG",
        `Previously observed ${canonical} ${version} at ${previous.commit}; it now resolves to ${identity.commit}. Choose a new immutable version.`,
      );
  }
  return { identity, api };
}

// The entries of a complete source tree listing, once each is a safe path of
// a supported kind, with every path and ancestor they name.
function sourceListing(listing: unknown[]) {
  const paths = new Set<string>();
  const spellings = new Map<string, string>();
  const listed = [];
  for (const value of listing) {
    const entry = record(value);
    if (
      typeof entry.path !== "string" ||
      /[\\\p{Cc}]/u.test(entry.path) ||
      /^[A-Za-z]:/.test(entry.path) ||
      entry.path
        .split("/")
        .some(
          (part) =>
            !part ||
            part === "." ||
            part === ".." ||
            part.toLowerCase() === ".git",
        )
    ) {
      throw new ProductError(
        "UNSAFE_SOURCE",
        "The source tree contains an unsafe path.",
      );
    }
    listed.push({
      mode: entry.mode,
      type: entry.type,
      sha: entry.sha,
      path: entry.path,
    });
    const parts = entry.path.split("/");
    for (let length = 1; length <= parts.length; length++) {
      const path = parts.slice(0, length).join("/");
      const key = foldPath(path);
      const previous = spellings.get(key);
      if (previous !== undefined && previous !== path)
        throw new ProductError(
          "UNSAFE_SOURCE",
          `Source paths alias on supported filesystems: ${previous} and ${path}.`,
        );
      spellings.set(key, path);
      paths.add(path);
    }
  }
  const entries: GitTreeEntry[] = [];
  for (const { mode, type, sha, path } of listed) {
    if (
      mode === "120000" &&
      (path === "standards.yaml" || isRootLicense(path.split("/")[0]!))
    )
      throw new ProductError(
        "SOURCE_SYMLINK",
        `The selected source contains a symbolic link: ${path}.`,
      );
    if (
      typeof mode !== "string" ||
      typeof type !== "string" ||
      typeof sha !== "string" ||
      (!(type === "tree" && mode === "040000") &&
        (type !== "blob" ||
          !["100644", "100755", "120000"].includes(mode) ||
          !shaPattern.test(sha)))
    ) {
      throw new ProductError(
        "UNSAFE_SOURCE",
        `Unsupported source entry: ${path}. Submodules and special files are unsupported.`,
      );
    }
    entries.push({ mode, type, sha, path });
  }
  return { entries, paths };
}

// Writes each blob of a verified tree under the snapshot root once its bytes
// hash to its Git identity, returning the paths of its symbolic links, which
// are never extracted.
function extract(objects: string, entries: GitTreeEntry[], root: string) {
  const symlinks = new Set<string>();
  for (const entry of entries) {
    if (entry.type === "tree") continue;
    let bytes: Buffer;
    try {
      bytes = git(objects, ["cat-file", "blob", entry.sha], true) as Buffer;
    } catch (error) {
      if (
        error instanceof ProductError &&
        error.code === "SOURCE_UNAVAILABLE"
      ) {
        throw new ProductError(
          "SOURCE_INTEGRITY",
          `The fetched Git source is missing the identified bytes: ${entry.path}.`,
        );
      }
      throw error;
    }
    if (objectId("blob", bytes) !== entry.sha)
      throw new ProductError(
        "SOURCE_INTEGRITY",
        `Source bytes do not match Git identity: ${entry.path}.`,
      );
    if (entry.mode === "120000") {
      symlinks.add(entry.path);
      // Keep ancestors visible when a selected tree contains only links.
      mkdirSync(dirname(join(root, entry.path)), { recursive: true });
      continue;
    }
    const target = join(root, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: "wx" });
    chmodSync(target, entry.mode === "100755" ? 0o755 : 0o644);
  }
  return symlinks;
}

// A cached snapshot supplies bytes only once every object it holds hashes to
// its Git identity, from the commit the tag observation resolved to each tree
// and blob, and its tree passes the same source checks as a fresh one. A
// missing, incomplete or damaged snapshot is discarded and acquired again.
function reuseSnapshot(
  cached: string,
  identity: StandardsIdentity,
  root: string,
) {
  if (!existsSync(cached)) return undefined;
  const objects = join(cached, "git");
  try {
    const provenance = record(
      JSON.parse(readFileSync(join(cached, "provenance.json"), "utf8")),
    );
    const commit = gitObject(objects, "commit", identity.commit).toString();
    const tree = /^tree ([a-f0-9]{40})\n/.exec(commit)?.[1];
    if (
      typeof provenance.repository !== "string" ||
      provenance.repository.toLowerCase() !==
        identity.repository.toLowerCase() ||
      provenance.commit !== identity.commit ||
      tree === undefined ||
      provenance.tree !== tree
    )
      throw new ProductError(
        "SOURCE_INTEGRITY",
        "The cached snapshot does not match its provenance.",
      );
    gitObject(objects, "tree", tree);
    const entries = gitTree(objects, identity.commit);
    for (const entry of entries)
      if (entry.type === "tree") gitObject(objects, "tree", entry.sha);
    const { paths } = sourceListing(entries);
    return { paths, symlinks: extract(objects, entries, root) };
  } catch (error) {
    if (error instanceof ProductError && error.code === "GIT_REQUIRED")
      throw error;
    // A fresh acquisition reports a source that is itself unsafe.
    rmSync(cached, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root);
    return undefined;
  }
}

// Resolves the tag's commit and tree through GitHub, fetches their objects
// through Git, verifies them against the tree listing, and keeps them in the
// snapshot cache.
async function fetchSnapshot(
  observed: TagObservation,
  cached: string,
  root: string,
) {
  const { identity, api } = observed;
  const { repository: canonical, version } = identity;
  const commit = record(await github(`${api}/git/commits/${identity.commit}`));
  const treeSha = record(commit.tree).sha;
  if (
    commit.sha !== identity.commit ||
    typeof treeSha !== "string" ||
    !shaPattern.test(treeSha)
  )
    throw new ProductError("INVALID_SOURCE", "Invalid Git commit response.");
  const tree = record(await github(`${api}/git/trees/${treeSha}?recursive=1`));
  const listing = tree.tree;
  if (
    tree.sha !== treeSha ||
    tree.truncated !== false ||
    !Array.isArray(listing)
  )
    throw new ProductError(
      "INVALID_SOURCE",
      "GitHub must provide a complete source tree.",
    );
  const staging = mkdtempSync(join(dirname(cached), ".staging-"));
  const objects = join(staging, "git");
  try {
    git(objects, ["init", "--bare", "--quiet"]);
    git(objects, [
      "-c",
      "protocol.version=2",
      "fetch",
      "--quiet",
      "--no-tags",
      "--depth=1",
      canonical,
      `+refs/tags/${version}:refs/tags/${version}`,
    ]);
    const fetchedCommit = String(
      git(objects, ["rev-parse", "--verify", `refs/tags/${version}^{commit}`]),
    ).trim();
    const fetchedTree = String(
      git(objects, ["rev-parse", "--verify", `${identity.commit}^{tree}`]),
    ).trim();
    if (fetchedCommit !== identity.commit || fetchedTree !== treeSha) {
      throw new ProductError(
        "INVALID_SOURCE",
        "The fetched Git tag does not match its observed commit and tree identity.",
      );
    }
    const { entries: advertisedEntries, paths } = sourceListing(listing);
    const fetchedEntries = gitTree(objects, identity.commit);
    const comparable = (entry: GitTreeEntry) =>
      `${entry.mode} ${entry.type} ${entry.sha}\t${entry.path}`;
    const advertised = advertisedEntries.map(comparable).sort();
    const fetched = fetchedEntries.map(comparable).sort();
    if (JSON.stringify(advertised) !== JSON.stringify(fetched)) {
      throw new ProductError(
        "SOURCE_INTEGRITY",
        "The GitHub tree listing does not match the fetched commit tree.",
      );
    }
    const symlinks = extract(objects, fetchedEntries, root);
    try {
      writeFileSync(
        join(staging, "provenance.json"),
        JSON.stringify({
          repository: canonical,
          commit: identity.commit,
          tree: treeSha,
        }),
      );
      renameSync(staging, cached);
    } catch {
      // Another acquisition cached the same snapshot first.
    }
    return { paths, symlinks };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// The verified snapshot of a stable version of a public GitHub source, from
// the snapshot cache when it holds the commit the tag names now, and otherwise
// acquired fresh. Each call observes the repository and tag unless its
// observations already hold them, and extracts its own copy, which close()
// removes.
export async function acquireSource(
  repository: string,
  version: string,
  project?: string,
  observations?: SourceObservations,
) {
  const { owner, name } = githubSource(repository);
  if (!isStableVersion(version)) {
    throw new ProductError(
      "INVALID_STANDARDS_VERSION",
      "Choose an exact stable SemVer tag, such as v1.2.3. Branches, ranges, and prereleases are unsupported.",
    );
  }
  const key = `${owner.toLowerCase()}/${name.toLowerCase()}\n${version}`;
  let observation = observations?.get(key);
  if (!observation) {
    observation = observeTag(owner, name, version, project);
    observations?.set(key, observation);
  }
  const observed = await observation;
  const { identity } = observed;
  const cached = join(
    cacheDirectory("snapshots", project),
    hash(`${identity.repository.toLowerCase()}\n${identity.commit}`),
  );
  const temporary = mkdtempSync(
    join(externalPath(tmpdir(), project), "repo-standards-source-"),
  );
  const root = join(temporary, "snapshot");
  try {
    mkdirSync(root);
    const { paths, symlinks } =
      reuseSnapshot(cached, identity, root) ??
      (await fetchSnapshot(observed, cached, root));
    return {
      root,
      identity,
      paths,
      symlinks,
      close() {
        rmSync(temporary, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}
