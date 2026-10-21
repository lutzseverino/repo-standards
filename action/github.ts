import { spawnSync } from "node:child_process";
import type { Forge, ForgeItem, PushResult } from "./update.ts";

// Every GitHub-specific call of the action: the REST requests for pull
// requests, issues and the rolling branch's files, and the authenticated push.
// Another forge replaces this module behind the `Forge` interface.

export interface GitHubOptions {
  // The REST API root, such as `https://api.github.com`.
  api: string;
  // `owner/name`.
  repository: string;
  token: string;
  // The checkout whose `origin` the push targets.
  root: string;
}

interface Issue {
  number: number;
  html_url: string;
  body?: string | null;
  pull_request?: unknown;
}

export function githubForge(options: GitHubOptions): Forge {
  const { api, repository, token, root } = options;
  const owner = repository.split("/")[0]!;
  const base = `${api.replace(/\/+$/, "")}/repos/${repository}`;

  async function request(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<{ status: number; data: unknown; link: string | null }> {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "repo-standards-update-action",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : null;
    if (!response.ok && response.status !== 404) {
      const message =
        data && typeof data === "object" && "message" in data
          ? String(data.message)
          : text;
      throw new Error(
        `GitHub answered ${method} ${new URL(url).pathname} with HTTP ${response.status}: ${message}`,
      );
    }
    return {
      status: response.status,
      data,
      link: response.headers.get("link"),
    };
  }

  async function required(method: string, url: string, body?: unknown) {
    const response = await request(method, url, body);
    if (response.status === 404)
      throw new Error(
        `GitHub answered ${method} ${new URL(url).pathname} with HTTP 404.`,
      );
    return response.data;
  }

  // Every page of a list.
  async function list<T>(url: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | null = url;
    while (next) {
      const page = await request("GET", next);
      if (page.status === 404) break;
      items.push(...(page.data as T[]));
      next = /<([^>]+)>;\s*rel="next"/.exec(page.link ?? "")?.[1] ?? null;
    }
    return items;
  }

  const item = (data: unknown): ForgeItem => {
    const { number, html_url } = data as Issue;
    return { number, url: html_url };
  };

  // Git reads the token from its environment, never from its arguments: an
  // empty header first clears one a checkout persisted for the same host.
  function gitEnv() {
    const url = git(["remote", "get-url", "origin"]);
    const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C" };
    delete env.REPO_STANDARDS_TOKEN;
    if (token && /^https?:\/\//.test(url.stdout)) {
      const key = `http.${new URL(url.stdout).origin}/.extraheader`;
      const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
      Object.assign(env, {
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: key,
        GIT_CONFIG_VALUE_0: "",
        GIT_CONFIG_KEY_1: key,
        GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${basic}`,
      });
    }
    return env;
  }

  function git(args: string[], env?: NodeJS.ProcessEnv) {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      ...(env ? { env } : {}),
    });
    return {
      status: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  }

  return {
    async defaultBranch() {
      const data = (await required("GET", base)) as { default_branch: string };
      return data.default_branch;
    },

    async rollingPullRequest(branch) {
      const pulls = await list<Issue>(
        `${base}/pulls?state=open&per_page=100&head=${encodeURIComponent(`${owner}:${branch}`)}`,
      );
      return pulls[0] ? item(pulls[0]) : null;
    },

    async rollingIssue(marker) {
      const issues = await list<Issue>(
        `${base}/issues?state=open&per_page=100`,
      );
      const found = issues.find(
        (issue) => !issue.pull_request && issue.body?.includes(marker),
      );
      return found ? { ...item(found), body: found.body ?? "" } : null;
    },

    async branchFile(branch, path) {
      const response = await request(
        "GET",
        `${base}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
      );
      if (response.status === 404) return null;
      const { content, encoding } = response.data as {
        content?: string;
        encoding?: string;
      };
      return encoding === "base64" && content !== undefined
        ? Buffer.from(content, "base64").toString("utf8")
        : null;
    },

    push(branch): Promise<PushResult> {
      const result = git(
        ["push", "--force", "origin", `HEAD:refs/heads/${branch}`],
        gitEnv(),
      );
      if (result.status === 0) return Promise.resolve({ pushed: true });
      const reason = (result.stderr || `git push exited ${result.status}`)
        .split(token || "\u0000")
        .join("<REDACTED>");
      return Promise.resolve({ pushed: false, reason });
    },

    async openPullRequest(branch, baseBranch, title, body) {
      return item(
        await required("POST", `${base}/pulls`, {
          head: branch,
          base: baseBranch,
          title,
          body,
        }),
      );
    },

    async editPullRequest(number, title, body) {
      await required("PATCH", `${base}/pulls/${number}`, { title, body });
    },

    async openIssue(title, body) {
      return item(await required("POST", `${base}/issues`, { title, body }));
    },

    async editIssue(number, title, body) {
      await required("PATCH", `${base}/issues/${number}`, { title, body });
    },

    async close(kind, number, comment) {
      await required("POST", `${base}/issues/${number}/comments`, {
        body: comment,
      });
      await required(
        "PATCH",
        `${base}/${kind === "pull-request" ? "pulls" : "issues"}/${number}`,
        { state: "closed" },
      );
    },
  };
}
