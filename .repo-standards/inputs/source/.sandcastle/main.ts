// The factory: takes each ready issue on the frontier to a pull request that
// `babysit` merges. The factory host runs `node .sandcastle/main.ts` from the
// repository's checkout; it re-runs itself under a pinned `npx` of Sandcastle,
// so the repository needs no dependency.
import { execFile, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  claudeUsage,
  codexUsage,
  createFactory,
  createStandardsRunner,
  readSettings,
  type ImageBuild,
  type LaunchRequest,
} from "./adapter.ts";
import type { Provider } from "./factory.ts";

const sandcastleVersion = "0.12.0";
const root = fileURLToPath(new URL("..", import.meta.url));
const settings = readSettings(process.env);
const sandcastle = await loadSandcastle();

// Each provider's Sandcastle agent and usage reader.
const providers: Record<
  Provider,
  {
    agent(model: string, options: { effort: string }): unknown;
    readUsage(): Promise<number | null>;
  }
> = {
  "claude-code": {
    agent: (model, options) => sandcastle.claudeCode(model, options),
    readUsage: readClaudeUsage,
  },
  codex: {
    agent: (model, options) => sandcastle.codex(model, options),
    readUsage: readCodexUsage,
  },
};

// Sandcastle is resolved from the `npx` install on PATH. Without it, the
// factory runs itself again under `npx` with the pinned version.
async function loadSandcastle() {
  for (const bin of (process.env.PATH ?? "").split(delimiter)) {
    const directory = join(bin, "..", "@ai-hero", "sandcastle");
    let version;
    try {
      version = JSON.parse(
        readFileSync(join(directory, "package.json"), "utf8"),
      ).version;
    } catch {
      continue;
    }
    if (version !== sandcastleVersion) continue;
    const module = (path: string) =>
      import(pathToFileURL(join(directory, path)).href);
    const [core, docker] = await Promise.all([
      module("dist/index.js"),
      module("dist/sandboxes/docker.js"),
    ]);
    return { ...core, docker: docker.docker };
  }
  if (process.env.FACTORY_SANDCASTLE_EXEC)
    throw new Error(
      `npx did not provide @ai-hero/sandcastle@${sandcastleVersion}`,
    );
  const result = spawnSync(
    "npx",
    [
      "--yes",
      `--package=@ai-hero/sandcastle@${sandcastleVersion}`,
      "--",
      process.execPath,
      fileURLToPath(import.meta.url),
    ],
    { stdio: "inherit", env: { ...process.env, FACTORY_SANDCASTLE_EXEC: "1" } },
  );
  process.exit(result.status ?? 1);
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)("gh", args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

const standards = createStandardsRunner(root, async (executable, args) => {
  const { stdout } = await promisify(execFile)(executable, args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
});

async function launch(request: LaunchRequest): Promise<void> {
  await sandcastle.run({
    name:
      request.issue === undefined
        ? "standards-update"
        : `issue-${request.issue}`,
    cwd: root,
    agent: providers[request.provider].agent(request.model, {
      effort: request.effort,
    }),
    sandbox: sandcastle.docker({ imageName: request.image }),
    prompt: request.prompt,
    branchStrategy: { type: "branch", branch: request.branch },
    logging: { type: "file", path: request.log },
    idleTimeoutSeconds: settings.timeLimitMinutes * 60,
    signal: request.signal,
  });
}

// The Dockerfile arrives on standard input, so the build has no context, and
// the agent user takes the host user's IDs, as Sandcastle requires.
async function buildImage(request: ImageBuild): Promise<void> {
  const build = spawn(
    "docker",
    [
      "build",
      "--quiet",
      "--tag",
      request.image,
      "--build-arg",
      `AGENT_UID=${process.getuid?.() ?? 1000}`,
      "--build-arg",
      `AGENT_GID=${process.getgid?.() ?? 1000}`,
      "-",
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let errors = "";
  build.stderr.on("data", (chunk) => (errors += chunk));
  build.stdin.end(readFileSync(request.dockerfile));
  const [status] = await once(build, "close");
  if (status !== 0)
    throw new Error(`docker build exited with ${status}: ${errors.trim()}`);
}

// The Codex app-server's documented rate-limit read, over stdio JSONL.
async function readCodexUsage(): Promise<number | null> {
  const server = spawn("codex", ["app-server"], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  // One reader for the whole session: each reply settles its request by id.
  const pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  const abandon = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  server.on("error", abandon);
  createInterface({ input: server.stdout })
    .on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    })
    .on("close", () =>
      abandon(new Error("codex app-server closed before replying")),
    );
  const send = (message: object) =>
    server.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method: string, id: number, params?: object) => {
    const reply = new Promise((resolve, reject) =>
      pending.set(id, { resolve, reject }),
    );
    send({ method, id, params });
    return Promise.race([reply, sleep(30_000).then(timeout)]);
  };
  try {
    await request("initialize", 0, {
      clientInfo: { name: "factory", title: "Factory", version: "1.0.0" },
    });
    send({ method: "initialized", params: {} });
    return codexUsage(await request("account/rateLimits/read", 1));
  } finally {
    server.kill();
  }
}

function timeout(): never {
  throw new Error("timed out");
}

// Claude Code publishes no usage read; this one is best-effort.
async function readClaudeUsage(): Promise<number | null> {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) return null;
  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return response.ok ? claudeUsage(await response.json()) : null;
}

function report(line: string) {
  console.log(`${new Date().toISOString()} ${line}`);
}

const factory = createFactory(settings, {
  gh,
  standards,
  launch,
  buildImage,
  readUsage: (provider) => providers[provider].readUsage(),
  now: () => new Date(),
  root,
  report,
});

for (;;) {
  // Runs branch from the checkout, so it follows the default branch.
  const pull = spawnSync("git", ["pull", "--ff-only", "--quiet"], {
    cwd: root,
  });
  // A checkout that did not update would launch runs from stale guidance, so
  // the pass waits for the next one.
  if (pull.status !== 0)
    report(`git pull failed, so this pass is skipped: ${pull.stderr}`);
  else
    try {
      for (const decision of await factory.tick())
        if (decision.kind !== "skip") report(JSON.stringify(decision));
    } catch (error) {
      report(`tick failed: ${error}`);
    }
  await sleep(settings.pollSeconds * 1000);
}
