import assert from "node:assert/strict";
import { test } from "node:test";
import { githubForge } from "../action/github.ts";

const token = "SYNTHETIC_ACTION_CREDENTIAL";
const sensitive = `Authorization: Bearer ${token}\r\nhttps://url-user:url-password@host.invalid/path?credential=query-secret request-payload`;

const forge = () =>
  githubForge({
    api: "https://url-user:url-password@host.invalid/api/v3",
    repository: "alice/project",
    token,
    root: process.cwd(),
  });

const coded = (code: string) => Object.assign(new Error(sensitive), { code });

test("forge diagnostics retain nested transport codes without error text or credentials", async (t) => {
  const circular = coded("ECONNRESET");
  circular.cause = circular;
  const cases = [
    {
      error: new TypeError(sensitive, { cause: coded("ENOTFOUND") }),
      codes: ["TypeError", "ENOTFOUND"],
    },
    {
      error: new TypeError(sensitive, {
        cause: new AggregateError(
          [
            coded("ECONNREFUSED"),
            new Error(sensitive, { cause: coded("ETIMEDOUT") }),
          ],
          sensitive,
        ),
      }),
      codes: ["AggregateError", "ECONNREFUSED", "ETIMEDOUT"],
    },
    { error: coded("UND_ERR_SOCKET"), codes: ["UND_ERR_SOCKET"] },
    { error: circular, codes: ["ECONNRESET"] },
    { error: new Error(sensitive), codes: ["Error"] },
    {
      error: Object.assign(new Error(sensitive), { code: token }),
      codes: ["<REDACTED>"],
    },
  ];
  for (const [index, scenario] of cases.entries()) {
    await t.test(String(index), async (t) => {
      t.mock.method(globalThis, "fetch", () => Promise.reject(scenario.error));
      await assert.rejects(forge().defaultBranch(), (error: Error) => {
        assert.match(
          error.message,
          /GET \/api\/v3\/repos\/alice\/project failed during transport/,
        );
        for (const code of scenario.codes)
          assert.ok(error.message.includes(code), error.message);
        assert.doesNotMatch(
          error.message,
          /SYNTHETIC_ACTION_CREDENTIAL|Authorization|url-user|url-password|query-secret|request-payload/,
        );
        assert.doesNotMatch(error.message, /[\r\n]/);
        return true;
      });
    });
  }
});

test("interrupted response consumption preserves the HTTP status and cause", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(coded("UND_ERR_SOCKET"));
          },
        }),
        { status: 200 },
      ),
    ),
  );
  await assert.rejects(forge().defaultBranch(), (error: Error) => {
    assert.match(
      error.message,
      /GET \/api\/v3\/repos\/alice\/project.*response body consumption \(HTTP 200\).*UND_ERR_SOCKET/,
    );
    assert.doesNotMatch(
      error.message,
      /SYNTHETIC_ACTION_CREDENTIAL|Authorization|url-password|query-secret|request-payload/,
    );
    return true;
  });
});

test("invalid response JSON retains context without echoing its credential-bearing content", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    Promise.resolve(new Response(sensitive, { status: 200 })),
  );
  await assert.rejects(forge().defaultBranch(), (error: Error) => {
    assert.match(
      error.message,
      /GET \/api\/v3\/repos\/alice\/project.*response JSON parsing \(HTTP 200\).*SyntaxError/,
    );
    assert.doesNotMatch(
      error.message,
      /SYNTHETIC_ACTION_CREDENTIAL|Authorization|url-password|query-secret|request-payload/,
    );
    return true;
  });
});

test("an HTTP rejection remains confirmed even if its body cannot be consumed", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(coded("UND_ERR_SOCKET"));
          },
        }),
        { status: 403 },
      ),
    ),
  );
  await assert.rejects(
    forge().openPullRequest(
      "repo-standards/update",
      "main",
      "title",
      sensitive,
    ),
    (error: Error) => {
      assert.match(
        error.message,
        /POST \/api\/v3\/repos\/alice\/project\/pulls with HTTP 403 \(HTTP response\)/,
      );
      assert.doesNotMatch(
        error.message,
        /transport|Reconciliation|SYNTHETIC_ACTION_CREDENTIAL|url-password/,
      );
      return true;
    },
  );
  assert.equal(fetch.mock.callCount(), 1);
});
