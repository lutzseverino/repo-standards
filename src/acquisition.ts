import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { valid, prerelease } from "semver";
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

interface GithubRequestOptions {
  timeoutMs?: number;
  connectionMessage?: string;
  httpMessage?: (status: number) => string;
  invalidJsonMessage?: string;
}

function quotaRetry(headers: Headers): string {
  const reset = headers.get("x-ratelimit-reset");
  if (reset && /^\d+$/.test(reset)) {
    const time = new Date(Number(reset) * 1000);
    if (Number.isFinite(time.getTime()))
      return ` Retry at ${time.toISOString()}.`;
  }
  const retry = headers.get("retry-after");
  if (retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry)))
    return ` Retry after ${Number(retry)} seconds.`;
  if (retry) {
    const time = new Date(retry);
    if (Number.isFinite(time.getTime()))
      return ` Retry at ${time.toISOString()}.`;
  }
  return "";
}

// Every GitHub REST call uses this boundary. Credentials are request headers
// only, never part of a source identity or a diagnostic. Git object fetches
// below use their separate, anonymous smart-protocol path.
export async function github(
  path: string,
  options: GithubRequestOptions = {},
): Promise<unknown> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers: {
        ...githubHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
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
    throw new ProductError(
      "QUOTA_EXHAUSTED",
      `The GitHub API quota is exhausted.${quotaRetry(response.headers)} Retry later, or provide a token in GH_TOKEN or GITHUB_TOKEN.`,
    );
  if (response.status === 401 && token)
    throw new ProductError(
      "SOURCE_UNAVAILABLE",
      "GitHub rejected the token in GH_TOKEN or GITHUB_TOKEN. Check the token and retry.",
    );
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
  const credentials = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN].filter(
    (value): value is string => !!value,
  );
  function containsCredential(value: unknown): boolean {
    if (typeof value === "string")
      return credentials.some((credential) => value.includes(credential));
    if (value && typeof value === "object")
      return Object.entries(value).some(
        ([key, child]) => containsCredential(key) || containsCredential(child),
      );
    return false;
  }
  if (credentials.length && containsCredential(document))
    throw new ProductError(
      "SOURCE_UNAVAILABLE",
      "GitHub returned a response containing credentials. Retry later.",
    );
  return document;
}

function git(
  directory: string,
  args: string[],
  binary = false,
): string | Buffer {
  const result = spawnSync("git", [`--git-dir=${directory}`, ...args], {
    encoding: binary ? "buffer" : "utf8",
    env: {
      ...process.env,
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

export async function acquireSource(
  repository: string,
  version: string,
  project?: string,
) {
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      repository,
    );
  if (!match || match[2] === "." || match[2] === "..")
    throw new ProductError(
      "UNSUPPORTED_SOURCE",
      "Use a public https://github.com/owner/repository URL. Local paths, SSH, other hosts, and URL references are unsupported.",
    );
  if (!isStableVersion(version)) {
    throw new ProductError(
      "INVALID_STANDARDS_VERSION",
      "Choose an exact stable SemVer tag, such as v1.2.3. Branches, ranges, and prereleases are unsupported.",
    );
  }
  const metadata = record(await github(`/repos/${match[1]}/${match[2]}`));
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
  const ref = record(
    await github(`${api}/git/ref/tags/${encodeURIComponent(version)}`),
  );
  if (ref.ref !== `refs/tags/${version}`)
    throw new ProductError(
      "INVALID_SOURCE",
      "GitHub did not return the requested exact tag.",
    );
  let object = record(ref.object);
  for (let depth = 0; object.type === "tag" && depth < 10; depth++) {
    if (typeof object.sha !== "string" || !shaPattern.test(object.sha))
      throw new ProductError(
        "INVALID_SOURCE",
        "Invalid annotated tag identity.",
      );
    object = record(
      record(await github(`${api}/git/tags/${object.sha}`)).object,
    );
  }
  if (
    object.type !== "commit" ||
    typeof object.sha !== "string" ||
    !shaPattern.test(object.sha)
  )
    throw new ProductError(
      "INVALID_SOURCE",
      "The stable version tag must identify a Git commit.",
    );
  const identity: StandardsIdentity = {
    repository: canonical,
    version,
    commit: object.sha,
  };
  const cache = externalPath(
    join(
      process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
      "repo-standards",
      "tags",
    ),
    project,
  );
  mkdirSync(cache, { recursive: true });
  const observation = join(
    cache,
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
  const temporary = mkdtempSync(
    join(externalPath(tmpdir(), project), "repo-standards-source-"),
  );
  const root = join(temporary, "snapshot");
  const objects = join(temporary, "objects");
  try {
    mkdirSync(root);
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
    const advertisedEntries: GitTreeEntry[] = [];
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
      advertisedEntries.push({ mode, type, sha, path });
    }
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
    const symlinks = new Set<string>();
    for (const entry of fetchedEntries) {
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
      const oid = createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex");
      if (oid !== entry.sha)
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
    rmSync(objects, { recursive: true, force: true });
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
