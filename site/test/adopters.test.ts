import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { countAdopters, githubAdoptions } from "../src/lib/adopters.ts";
import { recordedAdoptions } from "../src/lib/load-catalogue.ts";
import { countOutput, readCounts } from "../src/lib/adopter-counts.ts";

const canon = "lutzseverino/repo-canon";
const example = "lutzseverino/repo-standards-example";
const recording = fileURLToPath(
  new URL("../fixtures/search/", import.meta.url),
);

test("only deduplicated current default-branch selections count, with every approved exclusion", async () => {
  const input = recordedAdoptions(recording);
  const reads: string[] = [];
  const counts = await countAdopters([canon, example], {
    ...input,
    selection(repository, branch) {
      reads.push(`${repository}:${branch}`);
      return input.selection(repository, branch);
    },
  });
  assert.deepEqual(counts, { [canon]: 1, [example]: 2 });
  assert.equal(
    reads.filter((read) => read === "example/current:trunk").length,
    1,
  );
  for (const repository of ["private", "fork", "archived"])
    assert.ok(!reads.some((read) => read.startsWith(`example/${repository}:`)));
  assert.ok(
    reads.includes(`${canon}:main`),
    "self-adoption is identified from the current selection and excluded from the count",
  );
  assert.ok(reads.includes("example/other-branch:main"));
  assert.ok(reads.includes("example/historical:main"));
  assert.ok(reads.includes("example/changed:main"));
  assert.ok(!reads.some((read) => /feature|old-commit/.test(read)));
});

test("zero observed adopters is acquired data; incidental mentions and invalid YAML are not adoption", async () => {
  const input = recordedAdoptions(recording);
  for (const selection of [
    "# https://github.com/lutzseverino/repo-canon",
    "[invalid",
    "standards: null",
    "standards:\n  repository: https://github.com/example/other",
  ]) {
    assert.deepEqual(
      await countAdopters([canon], {
        ...input,
        async *candidates() {
          yield await Promise.resolve("example/current");
        },
        selection: () => Promise.resolve(selection),
      }),
      { [canon]: 0 },
    );
  }
});

test("count JSON rejects another run, another attempt, and malformed counts", () => {
  const run = { run: "100", attempt: "1" };
  const value = countOutput({ [canon]: 4 }, run);
  assert.deepEqual(readCounts(JSON.parse(JSON.stringify(value)), run), {
    [canon]: 4,
  });
  for (const other of [
    { run: "99", attempt: "1" },
    { run: "100", attempt: "2" },
  ])
    assert.throws(
      () => readCounts(value, other),
      /this build's workflow run and attempt/,
    );
  for (const count of [null, -1, 0.5, "4"])
    assert.throws(
      () => readCounts({ ...value, counts: { [canon]: count } }, run),
      /Invalid public-adopter count/,
    );
});

function response(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(value), { status, headers });
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return new URL(input instanceof Request ? input.url : input);
}

test("GitHub acquisition paginates candidates and reads the explicit current default branch", async () => {
  const requests: string[] = [];
  const input = githubAdoptions({
    token: "fixture-only",
    fetch: (url) => {
      const request = requestUrl(url);
      requests.push(`${request.pathname}${request.search}`);
      if (request.pathname === "/search/code") {
        assert.match(
          request.searchParams.get("q")!,
          /"github\.com" path:\.repo-standards filename:selection\.yaml/,
        );
        const first = request.searchParams.get("page") === "1";
        return Promise.resolve(
          response({
            total_count: 101,
            incomplete_results: false,
            items: [
              {
                path: first
                  ? "nested/.repo-standards/selection.yaml"
                  : ".repo-standards/selection.yaml",
                repository: {
                  full_name: first ? "example/nested" : "example/current",
                },
              },
            ],
          }),
        );
      }
      if (!request.pathname.includes("/contents/"))
        return Promise.resolve(
          response({
            private: false,
            fork: false,
            archived: false,
            default_branch: "current/branch",
          }),
        );
      assert.equal(request.searchParams.get("ref"), "current/branch");
      return Promise.resolve(
        response({
          type: "file",
          encoding: "base64",
          content: Buffer.from(
            `standards:\n  repository: https://github.com/${canon}`,
          ).toString("base64"),
        }),
      );
    },
  });
  assert.deepEqual(await countAdopters([canon], input), { [canon]: 1 });
  assert.equal(
    requests.filter((request) => request.startsWith("/search/code?")).length,
    2,
  );
  assert.ok(
    !requests.some((request) => request.includes("/repos/example/nested")),
  );
});

test("429 Retry-After and secondary 403 reset headers get bounded backoff with the same token", async () => {
  let now = 0;
  let calls = 0;
  const waits: number[] = [];
  const reports: string[] = [];
  const input = githubAdoptions({
    token: "fixture-only",
    now: () => now,
    wait: (ms) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
    report: (message) => reports.push(message),
    fetch: (_url, options) => {
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer fixture-only",
      );
      calls++;
      return Promise.resolve(
        calls === 1
          ? response({}, 429, { "retry-after": "90" })
          : calls === 2
            ? response({ message: "secondary rate limit" }, 403, {
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": "300",
              })
            : response({
                total_count: 0,
                incomplete_results: false,
                items: [],
              }),
      );
    },
  });
  assert.deepEqual(await countAdopters([canon], input), { [canon]: 0 });
  assert.deepEqual(waits, [91_000, 210_000]);
  assert.equal(calls, 3);
  assert.ok(reports.every((message) => !message.includes("fixture-only")));
});

test("persistent limits and server cooldowns beyond the window fail without a fallback", async () => {
  for (const headers of [{}, { "retry-after": "1800" }] as Record<
    string,
    string
  >[]) {
    let calls = 0;
    let now = 0;
    const input = githubAdoptions({
      token: "fixture-only",
      now: () => now,
      wait: (ms) => {
        now += ms;
        return Promise.resolve();
      },
      report: () => {},
      fetch: () => {
        calls++;
        return Promise.resolve(response({}, 429, headers));
      },
    });
    await assert.rejects(countAdopters([canon], input), /deployment must stop/);
    assert.equal(calls, "retry-after" in headers ? 1 : 5);
    assert.ok(now <= 15 * 60_000);
  }
});

test("one search serves all sources and repository reads are deduplicated across them", async () => {
  let searches = 0;
  const reads: string[] = [];
  const input = recordedAdoptions(recording);
  assert.deepEqual(
    await countAdopters([canon, example], {
      ...input,
      candidates() {
        searches++;
        return input.candidates();
      },
      repository(repository) {
        reads.push(repository);
        return input.repository(repository);
      },
    }),
    { [canon]: 1, [example]: 2 },
  );
  assert.equal(searches, 1);
  assert.equal(new Set(reads).size, reads.length);
});

test("an observed 733-second cooldown is honored and fits the total wait cap", async () => {
  let now = 0;
  let calls = 0;
  const input = githubAdoptions({
    token: "fixture-only",
    now: () => now,
    wait: (ms) => {
      now += ms;
      return Promise.resolve();
    },
    report: () => {},
    fetch: () =>
      Promise.resolve(
        ++calls === 1
          ? response({}, 429, { "retry-after": "733" })
          : response({ total_count: 0, incomplete_results: false, items: [] }),
      ),
  });
  assert.deepEqual(await countAdopters([canon], input), { [canon]: 0 });
  assert.equal(calls, 2);
  assert.equal(now, 734_000);
});

test("the fifteen-minute wait cap is shared by search and metadata reads", async () => {
  let now = 0;
  let searches = 0;
  let metadata = 0;
  const input = githubAdoptions({
    token: "fixture-only",
    now: () => now,
    wait: (ms) => {
      now += ms;
      return Promise.resolve();
    },
    report: () => {},
    fetch: (url) => {
      if (requestUrl(url).pathname === "/search/code")
        return Promise.resolve(
          ++searches === 1
            ? response({}, 429, { "retry-after": "600" })
            : response({
                total_count: 1,
                incomplete_results: false,
                items: [
                  {
                    path: ".repo-standards/selection.yaml",
                    repository: { full_name: "example/current" },
                  },
                ],
              }),
        );
      metadata++;
      return Promise.resolve(response({}, 429, { "retry-after": "400" }));
    },
  });
  await assert.rejects(countAdopters([canon], input), /deployment must stop/);
  assert.equal(searches, 2);
  assert.equal(metadata, 1);
  assert.equal(now, 601_000, "a second read cannot restart the wait budget");
});

test("incomplete, truncated, refused or malformed search fails acquisition", async () => {
  for (const reply of [
    response({}, 403),
    response({ total_count: 0, incomplete_results: true, items: [] }),
    response({ total_count: 1001, incomplete_results: false, items: [] }),
    response({}),
  ]) {
    await assert.rejects(
      countAdopters(
        [canon],
        githubAdoptions({
          token: "fixture-only",
          fetch: () => Promise.resolve(reply),
        }),
      ),
      /refused|incomplete or malformed/,
    );
  }
});

test("a vanished current selection is excluded; other content-read failures stop counting", async () => {
  for (const status of [404, 500]) {
    const input = githubAdoptions({
      token: "fixture-only",
      fetch: (url) =>
        Promise.resolve(
          requestUrl(url).pathname.includes("search/code")
            ? response({
                total_count: 1,
                incomplete_results: false,
                items: [
                  {
                    path: ".repo-standards/selection.yaml",
                    repository: { full_name: "example/current" },
                  },
                ],
              })
            : requestUrl(url).pathname.includes("/contents/")
              ? response({}, status)
              : response({
                  private: false,
                  fork: false,
                  archived: false,
                  default_branch: "main",
                }),
        ),
    });
    if (status === 404)
      assert.deepEqual(await countAdopters([canon], input), { [canon]: 0 });
    else await assert.rejects(countAdopters([canon], input), /HTTP 500/);
  }
});
