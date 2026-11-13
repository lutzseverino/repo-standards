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

interface PullRequest extends Issue {
  state: string;
  head: { ref: string; repo: { full_name: string } | null };
  base: { ref: string };
}

class RequestFailure extends Error {
  readonly uncertain: boolean;
  constructor(message: string, uncertain: boolean) {
    super(message);
    this.uncertain = uncertain;
  }
}

// Error messages can contain URLs, headers or payloads. Only retain symbolic
// cause codes and known error names, including nested/aggregate causes.
function causeDetails(error: unknown): string {
  const seen = new Set<object>();
  const details = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (
      value instanceof Error &&
      /^(Error|TypeError|SyntaxError|AggregateError|AbortError|TimeoutError)$/.test(
        value.name,
      )
    )
      details.add(value.name);
    if (
      "code" in value &&
      typeof value.code === "string" &&
      /^[A-Z][A-Z0-9_]+$/.test(value.code)
    )
      details.add(value.code);
    if ("cause" in value) visit(value.cause);
    if ("errors" in value && Array.isArray(value.errors))
      for (const cause of value.errors) visit(cause);
  };
  visit(error);
  return [...details].join(", ") || "no cause code available";
}

export function githubForge(options: GitHubOptions): Forge {
  const { api, repository, token, root } = options;
  const owner = repository.split("/")[0]!;
  const base = `${api.replace(/\/+$/, "")}/repos/${repository}`;
  const safe = (text: string) => {
    for (const secret of [token, encodeURIComponent(token)])
      if (secret) text = text.split(secret).join("<REDACTED>");
    return text;
  };

  async function request(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<{ status: number; data: unknown; link: string | null }> {
    const endpoint = safe(`${method} ${new URL(url).pathname}`);
    let response: Response;
    try {
      response = await fetch(url, {
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
    } catch (error) {
      throw new RequestFailure(
        safe(
          `GitHub ${endpoint} failed during transport: ${causeDetails(error)}.`,
        ),
        true,
      );
    }
    // An HTTP rejection is confirmed even if its body is unavailable. Do not
    // echo server text, which may contain credentials or request content.
    if (!response.ok && response.status !== 404)
      throw new RequestFailure(
        `GitHub answered ${endpoint} with HTTP ${response.status} (HTTP response).`,
        false,
      );
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw new RequestFailure(
        safe(
          `GitHub ${endpoint} failed during response body consumption (HTTP ${response.status}): ${causeDetails(error)}.`,
        ),
        response.ok,
      );
    }
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new RequestFailure(
        safe(
          `GitHub ${endpoint} failed during response JSON parsing (HTTP ${response.status}): ${causeDetails(error)}.`,
        ),
        response.ok,
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
      throw new RequestFailure(
        safe(
          `GitHub answered ${method} ${new URL(url).pathname} with HTTP 404 (HTTP response).`,
        ),
        false,
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

  async function rollingPullRequest(branch: string, baseBranch?: string) {
    const pulls = await list<PullRequest>(
      `${base}/pulls?state=open&per_page=100&head=${encodeURIComponent(`${owner}:${branch}`)}${baseBranch ? `&base=${encodeURIComponent(baseBranch)}` : ""}`,
    );
    const found = pulls.find(
      (pull) =>
        baseBranch === undefined ||
        (pull.state === "open" &&
          pull.head?.ref === branch &&
          pull.head.repo?.full_name === repository &&
          pull.base?.ref === baseBranch),
    );
    return found ? item(found) : null;
  }

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

    rollingPullRequest,

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
      try {
        return item(
          await required("POST", `${base}/pulls`, {
            head: branch,
            base: baseBranch,
            title,
            body,
          }),
        );
      } catch (error) {
        if (!(error instanceof RequestFailure) || !error.uncertain) throw error;
        // Seam (deferred): uncertain PR creation; consumers: 1; extract at 3.
        // A lookup's absence cannot prove that the POST never took effect.
        let reconciliation: string;
        try {
          const found = await rollingPullRequest(branch, baseBranch);
          if (found) return found;
          reconciliation = "Reconciliation found no matching open pull request";
        } catch (lookupError) {
          reconciliation = `Reconciliation could not establish the outcome: ${lookupError instanceof RequestFailure ? lookupError.message : "unrecognized lookup response"}`;
        }
        throw new Error(
          safe(
            `${error.message} ${reconciliation}. Inspect the already-pushed branch ${branch} against ${baseBranch} before another create attempt; the original POST may have taken effect. No additional create was sent.`,
          ),
          { cause: error },
        );
      }
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
