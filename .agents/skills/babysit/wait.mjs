#!/usr/bin/env node

// Waits for a pull request's checks and Codex's review of its head commit,
// polling GitHub with `gh`. It prints nothing while waiting and one line when
// it exits, starting with the head's full SHA, plus one line per failing
// check, and its exit code names the outcome:
//
//   0  checks settled and Codex reviewed the head
//   1  usage or `gh` error
//   2  one or more checks failed
//   3  checks settled and Codex is unavailable
//   4  checks settled and Codex did not review this head
//   5  still waiting at the invocation limit; run it again
//
// Checks settled means checks passed or no check arrived within 5 minutes
// of a push GitHub recorded and no workflow run for the head is unfinished.
//
// Usage: node wait.mjs <number> [--repo <owner/name>] [--limit <seconds>]
//        [--interval <seconds>]
//
// The default limit, 540 seconds, keeps one invocation inside Claude Code's
// 10-minute foreground limit, with each look at GitHub bounded to 45 seconds.
// One invocation covers 9 minutes waited: a typical wait takes one, and the
// worst case, the 30-minute review bound plus checks, takes at most four.
// A head with no recorded push and no check or run never settles its checks.
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";

const codexBot = "chatgpt-codex-connector[bot]";
const summaryMarker = "<!-- codex-pull-request-review-summary -->";
const unavailableReply = "create an environment for this repo";
const reviewRequest = /@codex (security )?review\b/i;
const responseBoundMs = 5 * 60_000;
const reviewBoundMs = 30 * 60_000;
const checksBoundMs = 5 * 60_000;

const settledCodes = {
  reviewed: 0,
  unavailable: 3,
  "not requested": 4,
  "no response": 4,
  "not reviewing": 4,
};

// The time of the latest review request: the pull request's opening, or a
// later `@codex review` comment from anyone but Codex. A push is no request.
export const reviewRequestedAt = (openedAt, comments) =>
  Math.max(
    openedAt,
    ...comments
      .filter(
        (comment) =>
          comment.login !== codexBot && reviewRequest.test(comment.body),
      )
      .map((comment) => Date.parse(comment.createdAt)),
  );

// Reads the Status and Commit cells of each row of Codex's summary table,
// with the completion time a Completed status carries; without one it is NaN,
// which is never at or after a request.
const summaryRows = (body) => {
  const rows = body
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
  const header = rows[0] ?? [];
  const status = header.indexOf("Status");
  const commit = header.indexOf("Commit");
  if (status < 0 || commit < 0) return [];
  return rows.slice(1).flatMap((row) => {
    const sha = /`([0-9a-f]{7,40})`/.exec(row[commit] ?? "")?.[1];
    if (!sha) return [];
    const completed = /\bCompleted\b/.test(row[status]);
    const datetime = /<relative-time\b[^>]*\bdatetime="([^"]+)"/.exec(row[status])?.[1];
    return [
      {
        completed,
        completedAt: completed && datetime ? Date.parse(datetime) : NaN,
        sha,
      },
    ];
  });
};

const codexState = ({ head, requestedAt, pushedAt, comments, now }) => {
  const codexComments = comments.filter(
    (comment) => comment.login === codexBot,
  );
  const headRows = codexComments
    .filter((comment) => comment.body.includes(summaryMarker))
    .flatMap((comment) => summaryRows(comment.body))
    .filter((row) => head.startsWith(row.sha));
  if (headRows.some((row) => row.completedAt >= requestedAt)) {
    return "reviewed";
  }
  if (
    codexComments.some(
      (comment) =>
        comment.body.includes(unavailableReply) &&
        Date.parse(comment.createdAt) >= requestedAt,
    )
  ) {
    return "unavailable";
  }
  if (pushedAt > requestedAt) return "not requested";
  const waited = now - requestedAt;
  if (codexComments.length === 0 && waited >= responseBoundMs) {
    return "no response";
  }
  if (waited >= reviewBoundMs) return "not reviewing";
  if (headRows.some((row) => !row.completed)) return "reviewing";
  return "pending";
};

// Decides the outcome from one look at the pull request. `checks` holds
// `{ name, state: "pass" | "fail" | "pending", link }`; `runs` holds the
// head's GitHub Actions workflow runs as `{ status }`;
// `requestedAt` is the latest review request; `pushedAt` is the head's push
// time or its committer-date fallback, and `pushRecorded` says whether GitHub
// recorded that push. The checks stay pending while the head has none and
// its push is unrecorded or less than 5 minutes old, or while any check or run
// is unfinished: a new head's checks and a queued rerun can be missing from
// the rollup while their runs are already
// listed. A failed check ends the wait unless Codex is reviewing, so its
// findings arrive with the failures. It
// returns `code: null` while the outcome is unsettled and the invocation limit
// is not reached.
export const decide = ({
  head,
  checks,
  runs = [],
  requestedAt,
  pushedAt,
  pushRecorded,
  comments,
  now,
  startedAt,
  limitMs,
}) => {
  const codex = codexState({ head, requestedAt, pushedAt, comments, now });
  const failing = checks.filter((check) => check.state === "fail");
  const checksPending =
    (checks.length === 0 &&
      (!pushRecorded || now - pushedAt < checksBoundMs)) ||
    checks.some((check) => check.state === "pending") ||
    runs.some((run) => run.status !== "completed");
  if (!checksPending && failing.length > 0 && codex !== "reviewing") {
    return { code: 2, codex, failing };
  }
  if (!checksPending && codex in settledCodes) {
    const outcome = { code: settledCodes[codex], codex, failing };
    if (checks.length === 0) outcome.noChecks = true;
    return outcome;
  }
  if (now - startedAt >= limitMs) {
    return { code: 5, codex, failing, checksPending };
  }
  return { code: null, codex, failing, checksPending };
};

const codexPhrases = {
  reviewed: "Codex reviewed",
  unavailable: "Codex unavailable",
  "not requested": "Codex review not requested for this head",
  "no response": "Codex did not respond within 5 minutes",
  "not reviewing": "Codex did not review within 30 minutes",
  pending: "Codex review pending",
};

// The lines the script prints for a decided outcome.
// A failing check is listed even while the script still waits.
export const report = (outcome, head) => {
  const count = outcome.failing.length;
  const failed = `${count} check${count === 1 ? "" : "s"} failed`;
  let line;
  if (outcome.code === 5) {
    const pending = [
      outcome.checksPending && "checks",
      !(outcome.codex in settledCodes) && "Codex",
    ].filter(Boolean);
    const waiting = `still waiting on ${pending.join(" and ")}; run again`;
    line = count === 0 ? waiting : `${failed}, ${waiting}`;
  } else {
    const checks = outcome.noChecks
      ? "no checks within 5 minutes of the push"
      : count === 0
        ? "checks passed"
        : failed;
    line = `${checks}, ${codexPhrases[outcome.codex]}`;
  }
  return [
    `${head}: ${line}`,
    ...outcome.failing.map((check) => `${check.name} ${check.link}`),
  ];
};

const failedConclusions = new Set([
  "ACTION_REQUIRED",
  "CANCELLED",
  "FAILURE",
  "STALE",
  "STARTUP_FAILURE",
  "TIMED_OUT",
  "ERROR",
]);

// Turns `gh pr view`'s status check rollup into check states. Any unfinished
// run keeps its check pending; otherwise the latest-started run wins.
export const checkStates = (rollup) => {
  const latest = new Map();
  for (const item of rollup ?? []) {
    const isRun = item.__typename === "CheckRun";
    const name = isRun ? item.name : item.context;
    const key = `${item.workflowName ?? ""}/${name}`;
    const known = latest.get(key);
    const result = isRun
      ? item.status === "COMPLETED"
        ? item.conclusion
        : "PENDING"
      : item.state;
    const pending = ["PENDING", "EXPECTED"].includes(result);
    if (known) {
      const knownPending = known.check.state === "pending";
      if (knownPending && !pending) continue;
      if (
        knownPending === pending &&
        (known.startedAt ?? "") > (item.startedAt ?? "")
      )
        continue;
    }
    latest.set(key, {
      startedAt: item.startedAt,
      check: {
        name,
        state: pending
          ? "pending"
          : failedConclusions.has(result)
            ? "fail"
            : "pass",
        link: isRun ? item.detailsUrl : item.targetUrl,
      },
    });
  }
  return [...latest.values()].map((entry) => entry.check);
};

class UsageError extends Error {}

const gh = (args) =>
  new Promise((resolve, reject) => {
    execFile(
      "gh",
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 15_000 },
      (error, stdout, stderr) => {
        if (!error) return resolve(JSON.parse(stdout));
        const message =
          stderr.trim().split("\n").at(-1) || error.message.split("\n")[0];
        reject(new Error(`gh ${args[0]} ${args[1]}: ${message}`));
      },
    );
  });

const parseArguments = (argv) => {
  const options = { limit: 540, interval: 30 };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = /^--(repo|limit|interval)$/.exec(argv[index])?.[1];
    if (!flag) {
      positional.push(argv[index]);
      continue;
    }
    const value = argv[(index += 1)];
    if (value === undefined) throw new UsageError(`--${flag} needs a value`);
    options[flag] = flag === "repo" ? value : Number(value);
    if (flag !== "repo" && !(options[flag] > 0)) {
      throw new UsageError(`--${flag} must be a positive number of seconds`);
    }
  }
  if (positional.length !== 1 || !/^\d+$/.test(positional[0])) {
    throw new UsageError(
      "usage: wait.mjs <number> [--repo <owner/name>] [--limit <seconds>] [--interval <seconds>]",
    );
  }
  return { number: positional[0], ...options };
};

// Whether GitHub recorded the push of the pull request's head, with its time
// for Codex: the recorded time, else the committer date, never before opening.
const pushTime = async (pull) => {
  const head = pull.headRefOid;
  const activity = await gh([
    "api",
    `repos/{owner}/{repo}/activity?ref=${encodeURIComponent(`refs/heads/${pull.headRefName}`)}&per_page=100`,
  ]).catch(() => []);
  const recorded = activity.find((entry) => entry.after === head);
  const pushedAt =
    recorded?.timestamp ??
    (await gh(["api", `repos/{owner}/{repo}/commits/${head}`])).commit
      .committer.date;
  return {
    pushedAt: Math.max(Date.parse(pushedAt), Date.parse(pull.createdAt)),
    pushRecorded: Boolean(recorded),
  };
};

// Reads one look at the pull request. The head's workflow runs are read by
// its SHA, which also finds `pull_request_target` runs; its push time is
// cached per head only when GitHub recorded it.
const look = async (number, pushTimes) => {
  const [pull, pages] = await Promise.all([
    gh([
      "pr",
      "view",
      number,
      "--json",
      "headRefOid,headRefName,createdAt,statusCheckRollup",
    ]),
    gh([
      "api",
      `repos/{owner}/{repo}/issues/${number}/comments?per_page=100`,
      "--paginate",
      "--slurp",
    ]),
  ]);
  const comments = pages.flat().map((comment) => ({
    login: comment.user?.login,
    createdAt: comment.created_at,
    body: comment.body ?? "",
  }));
  const head = pull.headRefOid;
  const [runs, push] = await Promise.all([
    gh([
      "api",
      `repos/{owner}/{repo}/actions/runs?head_sha=${head}&per_page=100`,
      "--paginate",
      "--slurp",
    ]),
    pushTimes.get(head) ?? pushTime(pull),
  ]);
  if (push.pushRecorded) pushTimes.set(head, push);
  return {
    head,
    checks: checkStates(pull.statusCheckRollup),
    runs: runs
      .flatMap((page) => page.workflow_runs)
      .map(({ status }) => ({ status })),
    requestedAt: reviewRequestedAt(Date.parse(pull.createdAt), comments),
    ...push,
    comments,
  };
};

const main = async () => {
  const startedAt = Date.now();
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
  if (options.repo) process.env.GH_REPO = options.repo;
  const limitMs = options.limit * 1000;
  const pushTimes = new Map();
  for (;;) {
    let state;
    try {
      state = await look(options.number, pushTimes);
    } catch (error) {
      process.stderr.write(`wait.mjs: ${error.message}\n`);
      return 1;
    }
    const outcome = decide({ ...state, now: Date.now(), startedAt, limitMs });
    if (outcome.code !== null) {
      process.stdout.write(`${report(outcome, state.head).join("\n")}\n`);
      return outcome.code;
    }
    const remaining = startedAt + limitMs - Date.now();
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, Math.min(options.interval * 1000, remaining)),
      ),
    );
  }
};

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  process.exitCode = await main();
}
