import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { stringify } from "yaml";
import { directoryFixture, sourceFixture } from "./installed-cli.ts";

export function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

export function commit(root: string) {
  git(root, "add", ".");
  git(
    root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  );
}

// Replace GitHub API responses at the process boundary; the installed CLI still
// resolves tags, acquires Git objects, validates, and inspects real repositories.
// Other requests, such as those to a local registry fixture, reach their server.
export function remoteFixture(
  yaml: string,
  files: Record<string, string | Buffer> = {},
  executables: string[] = [],
  repository = "alice/standards",
  recordRequests = false,
) {
  const source = sourceFixture(yaml, files);
  for (const path of executables) chmodSync(join(source.root, path), 0o755);
  commit(source.root);
  const support = sourceFixture("");
  const dataFile = join(support.root, "responses.json");
  const requestLog = join(support.root, "requests.log");
  const loader = join(support.root, "https-fixture.mjs");
  writeFileSync(requestLog, "");
  const readRequests = () =>
    readFileSync(requestLog, "utf8")
      .split("\n")
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            url: string;
            authorization:
              "absent" | "GH_TOKEN" | "GITHUB_TOKEN" | "unexpected";
          },
      );
  writeFileSync(
    loader,
    `import { appendFileSync, readFileSync } from 'node:fs';
const unmocked = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const authorization = new Headers(init?.headers).get('authorization');
  ${recordRequests ? `appendFileSync(${JSON.stringify(requestLog)}, JSON.stringify({url: String(url), authorization: authorization === null ? 'absent' : process.env.GH_TOKEN && authorization === 'Bearer ' + process.env.GH_TOKEN ? 'GH_TOKEN' : process.env.GITHUB_TOKEN && authorization === 'Bearer ' + process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : 'unexpected'}) + '\\n');` : ""}
  if (!String(url).startsWith('https://api.github.com/')) return unmocked(url, init);
  const responses = JSON.parse(readFileSync(${JSON.stringify(dataFile)}, 'utf8'));
  const entry = responses[String(url)];
  if (!entry) throw new Error('Unexpected remote request: ' + url);
  return new Response(JSON.stringify(entry.body), {status: entry.status ?? 200, headers: entry.headers});
};\n`,
  );
  const prefix = `https://api.github.com/repos/${repository}`;
  const sha = git(source.root, "rev-parse", "HEAD");
  const treeSha = git(source.root, "rev-parse", "HEAD^{tree}");
  const responses: Record<
    string,
    { body: unknown; status?: number; headers?: Record<string, string> }
  > = {
    [prefix]: {
      body: {
        private: false,
        full_name: repository,
        html_url: `https://github.com/${repository}`,
      },
    },
  };
  function publishVersion(tag: string) {
    const publishedSha = git(source.root, "rev-parse", "HEAD");
    const publishedTreeSha = git(source.root, "rev-parse", "HEAD^{tree}");
    git(
      source.root,
      "-c",
      "tag.gpgSign=false",
      "tag",
      "--force",
      tag,
      publishedSha,
    );
    const tree = git(source.root, "ls-tree", "-r", "-t", "HEAD")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [metadata, path] = line.split("\t");
        const [mode, type, blobSha] = metadata!.split(" ");
        return {
          mode,
          type,
          sha: blobSha,
          path: JSON.parse(
            path!.startsWith('"') ? path! : JSON.stringify(path),
          ) as string,
        };
      });
    responses[`${prefix}/git/ref/tags/${tag}`] = {
      body: {
        ref: `refs/tags/${tag}`,
        object: { type: "commit", sha: publishedSha },
      },
    };
    responses[`${prefix}/git/commits/${publishedSha}`] = {
      body: { sha: publishedSha, tree: { sha: publishedTreeSha } },
    };
    responses[`${prefix}/git/trees/${publishedTreeSha}?recursive=1`] = {
      body: { sha: publishedTreeSha, truncated: false, tree },
    };
    for (const entry of tree) {
      if (entry.type === "blob" && entry.mode !== "120000")
        responses[`${prefix}/git/blobs/${entry.sha}`] = {
          body: {
            sha: entry.sha,
            encoding: "base64",
            content: readFileSync(join(source.root, entry.path)).toString(
              "base64",
            ),
          },
        };
    }
    return { sha: publishedSha, treeSha: publishedTreeSha };
  }
  publishVersion("v1.0.0");
  const save = () => writeFileSync(dataFile, JSON.stringify(responses));
  save();
  const cache = join(support.root, "cache");
  mkdirSync(cache);
  // The CLI's own temporary directories, such as a runtime it acquired before a
  // test killed it, stay in a directory this fixture owns and removes at teardown.
  const temporary = directoryFixture("repo-standards-tmp-");
  return {
    source,
    support,
    prefix,
    sha,
    treeSha,
    repository,
    responses,
    save,
    requests: () => readRequests().map((request) => request.url),
    // Each recorded request's URL and the authorization it presented, if any.
    requestLog: readRequests,
    publish(tag: string) {
      const published = publishVersion(tag);
      save();
      return published;
    },
    addVersion(
      tag: string,
      nextYaml: string,
      nextFiles: Record<string, string | Buffer> = {},
      nextExecutables: string[] = [],
    ) {
      writeFileSync(join(source.root, "standards.yaml"), nextYaml);
      for (const [path, content] of Object.entries(nextFiles)) {
        const target = join(source.root, path);
        mkdirSync(join(target, ".."), { recursive: true });
        writeFileSync(target, content);
      }
      for (const path of nextExecutables)
        chmodSync(join(source.root, path), 0o755);
      commit(source.root);
      const published = publishVersion(tag);
      save();
      return published;
    },
    env: {
      ...process.env,
      GH_TOKEN: "",
      GITHUB_TOKEN: "",
      NODE_OPTIONS: `--import=${pathToFileURL(loader).href}`,
      XDG_CACHE_HOME: cache,
      TMPDIR: temporary.root,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(source.root).href}.insteadOf`,
      GIT_CONFIG_VALUE_0: `https://github.com/${repository}`,
      GIT_CONFIG_KEY_1: "protocol.file.allow",
      GIT_CONFIG_VALUE_1: "always",
    },
    close() {
      source.close();
      support.close();
      temporary.close();
    },
  };
}

export function remoteEnvironment(
  ...remotes: {
    source: { root: string };
    repository: string;
    env: NodeJS.ProcessEnv;
  }[]
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...remotes[0]!.env,
    GIT_CONFIG_COUNT: String(remotes.length + 1),
  };
  remotes.forEach((remote, index) => {
    env[`GIT_CONFIG_KEY_${index}`] =
      `url.${pathToFileURL(remote.source.root).href}.insteadOf`;
    env[`GIT_CONFIG_VALUE_${index}`] =
      `https://github.com/${remote.repository}`;
  });
  env[`GIT_CONFIG_KEY_${remotes.length}`] = "protocol.file.allow";
  env[`GIT_CONFIG_VALUE_${remotes.length}`] = "always";
  return env;
}

export const inspectionArgs = [
  "inspect",
  "--source",
  "https://github.com/alice/standards",
  "--standards-version",
  "v1.0.0",
  "--profile",
  "work",
  "--json",
];

// The inspection arguments for another standards version of the same source.
export function versionArgs(tag: string, args = inspectionArgs) {
  return args.map((argument) => (argument === "v1.0.0" ? tag : argument));
}

// The start of an inspection made with the given arguments, bound to its
// identity, and confirmed by the maintainer when the inspection requires it.
export function startArgs(
  identity: string,
  args = inspectionArgs,
  confirmed = false,
) {
  return [
    "start",
    ...args.slice(1),
    "--identity",
    identity,
    ...(confirmed ? ["--confirmed"] : []),
  ];
}

// A standards source declaring the given defaults and profiles.
export function manifest(
  declarations: object,
  profiles: Record<string, object> = { work: {} },
  name = "test-standards",
) {
  return stringify({
    format: "repo-standards/v2",
    name,
    description: "Test standards",
    requires: { "repo-standards": ">=1.0.0" },
    defaults: { declarations },
    profiles: Object.fromEntries(
      Object.entries(profiles).map(([profile, declarations]) => [
        profile,
        { description: profile, declarations },
      ]),
    ),
  });
}

// A trusted operation, run by Node.js unless another executable is named,
// whose prerequisite the test process satisfies.
export interface OperationOptions {
  executable?: string;
  script?: string;
  resources?: string[];
  arguments?: string[];
  prerequisite?: { "version-arguments": string[]; version: string };
  "timeout-seconds"?: number;
}
export function operation(id: string, options: OperationOptions = {}) {
  const {
    executable = process.execPath,
    script = "run.mjs",
    resources = [],
    arguments: args = [],
    prerequisite = { "version-arguments": ["--version"], version: "^24" },
    "timeout-seconds": timeout = 5,
  } = options;
  return {
    id,
    run: { executable, script, resources, arguments: args },
    prerequisite,
    "timeout-seconds": timeout,
  };
}
