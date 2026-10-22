import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  previousStableVersion,
  requestCount,
  verifyPublicUpdate,
  type CommandResult,
} from "../acceptance/public-update.ts";

test("the previous published npm release is the highest stable SemVer below the candidate", () => {
  assert.equal(
    previousStableVersion(
      [
        "9.1.0-next.1",
        "8.9.9",
        "9.0.0",
        "10.0.0",
        "not-a-version",
        "8.10.0",
        "10.1.0",
      ],
      "10.0.0",
    ),
    "9.0.0",
  );
  assert.equal(
    previousStableVersion(["9.9.0", "9.10.0", "9.8.0"], "10.0.0"),
    "9.10.0",
  );
  assert.throws(
    () => previousStableVersion(["10.0.0", "10.1.0", "9.0.0-next.1"], "10.0.0"),
    /No published stable npm release/,
  );
  assert.throws(
    () => previousStableVersion(["9.0.0"], "10.0.0-next.1"),
    /stable SemVer/,
  );
});

test("stable predecessor selection validates build metadata and ignores it for precedence", () => {
  assert.equal(
    previousStableVersion(
      ["10.0.0+other", "9.0.0+build.02", "9.1.0-rc.1", "9.2.0+"],
      "10.0.0+release.0",
    ),
    "9.0.0+build.02",
  );
  assert.equal(
    previousStableVersion(["9.0.0+alpha", "9.0.0+000"], "9.0.1"),
    "9.0.0+000",
  );
  assert.equal(previousStableVersion([" v9.0.0 "], "10.0.0"), " v9.0.0 ");
  assert.throws(
    () =>
      previousStableVersion(
        [
          "9.01.0",
          "8.0.0+one..two",
          "8.0.0+",
          "8.9007199254740992.0",
          "8.0.0+" + "a".repeat(251),
          "10.0.0+same-core",
          "9.1.0-next.1+build",
        ],
        "10.0.0",
      ),
    /No published stable npm release/,
  );
});

function fixture(
  t: TestContext,
  options: {
    outcome?: string;
    exit?: number;
    stdout?: string;
    ready?: boolean;
    statusVersion?: string;
    action?: string | null;
    versions?: Record<string, object>;
    mutate?: (
      report: Record<string, unknown>,
      command: "adopt" | "status",
      phase: string,
    ) => void;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "repo-standards-public-update-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const requestLog = join(root, "requests.jsonl");
  writeFileSync(requestLog, "");
  const calls: { executable: string; args: string[]; phase: string }[] = [];
  const submitted: { questions: { id: string; answer: unknown }[] }[] = [];
  let baselineRounds = 0;
  let statuses = 0;
  const source = "https://github.com/lutzseverino/repo-standards-example";
  const selection = {
    cli: "9.0.0",
    source,
    version: "v3.0.0",
    profile: "work",
  };
  const success = (value: unknown): CommandResult => ({
    status: 0,
    stdout: typeof value === "string" ? value : JSON.stringify(value),
    stderr: "",
  });
  return {
    calls,
    submitted,
    run: () =>
      verifyPublicUpdate({
        version: "10.0.0",
        root,
        env: {},
        requestLog,
        fetch: (url, init) => {
          assert.match(
            url instanceof Request
              ? url.url
              : typeof url === "string"
                ? url
                : url.href,
            /^https:\/\/registry\.npmjs\.org\//,
          );
          assert.equal(new Headers(init?.headers).has("authorization"), false);
          return Promise.resolve(
            new Response(
              JSON.stringify({
                versions: options.versions ?? {
                  "9.0.0": {},
                  "10.0.0": {},
                  "9.1.0-next.1": {},
                },
              }),
            ),
          );
        },
        execute: (executable, args, cwd, env) => {
          const phase = env.REPO_STANDARDS_ACCEPTANCE_PHASE!;
          calls.push({ executable, args, phase });
          assert.equal(cwd, join(root, "update-project"));
          if (executable === "git")
            return success(args[0] === "rev-parse" ? "a".repeat(40) : "");
          if (executable === process.execPath)
            return success(args[0] === "src/cli.mjs" ? "6\n" : "tests pass\n");
          if (args.includes("adopt")) {
            appendFileSync(
              requestLog,
              JSON.stringify({ origin: "https://api.github.com", phase }) +
                "\n",
            );
            if (phase === "update") {
              assert.equal(
                calls.filter(
                  (call) =>
                    call.executable === "git" && call.args.includes("commit"),
                ).length,
                2,
              );
              const report = {
                format: "repo-standards/adopt/v2",
                outcome: options.outcome ?? "complete",
                selection: { ...selection, cli: "10.0.0", platform: "github" },
                missing: [],
                blockers: [],
              };
              options.mutate?.(report, "adopt", phase);
              return {
                status: options.exit ?? 0,
                stdout: options.stdout ?? JSON.stringify(report),
                stderr: "",
              };
            }
            if (args.includes("--answers"))
              submitted.push(
                JSON.parse(
                  readFileSync(args[args.indexOf("--answers") + 1]!, "utf8"),
                ) as (typeof submitted)[number],
              );
            baselineRounds++;
            const questions =
              baselineRounds === 1
                ? [
                    { id: "version", answer: "v3.0.0" },
                    { id: "profile", answer: "work" },
                    { id: "inspection", answer: null },
                  ]
                : baselineRounds === 2
                  ? [
                      { id: "assessment:readme", answer: null },
                      { id: "assessment:source-layout", answer: null },
                    ]
                  : [];
            const report = {
              format: "repo-standards/adopt/v1",
              outcome:
                baselineRounds === 1
                  ? "answers-required"
                  : baselineRounds === 2
                    ? "contextual"
                    : "complete",
              selection,
              inspection: { identity: "sha256:reviewed" },
              ...(baselineRounds === 2 ? { run: { id: "baseline" } } : {}),
              answers: {
                format: "repo-standards/answers/v1",
                source,
                questions,
              },
            };
            options.mutate?.(report, "adopt", phase);
            return success(report);
          }
          assert.deepEqual(args, ["status", "--json"]);
          statuses++;
          const report = {
            format:
              statuses === 1
                ? "repo-standards/status/v8"
                : "repo-standards/status/v9",
            readyToCommit: statuses === 1 ? true : (options.ready ?? true),
            selection: {
              cli: {
                version:
                  statuses === 1
                    ? "9.0.0"
                    : (options.statusVersion ?? "10.0.0"),
              },
              standards: {
                repository: source,
                version: "v3.0.0",
                commit: "b".repeat(40),
              },
              profile: "work",
              ...(statuses === 1 ? {} : { platform: "github" }),
            },
            impact:
              options.action === null
                ? undefined
                : {
                    derived:
                      options.action ??
                      "Exact update: nothing is needed beyond reviewing and committing the update.",
                  },
          };
          options.mutate?.(report, "status", phase);
          return success(report);
        },
      }),
  };
}

test("public update acceptance commits the previous adoption then completes exactly one unanswered candidate adopt", async (t) => {
  const f = fixture(t);
  const result = await f.run();
  assert.equal(result.passed, true, result.failure);
  assert.equal(result.previousVersion, "9.0.0");
  assert.equal(result.registry.requests, 1);
  assert.equal(result.registry.status, 200);
  assert.equal(result.sourceVersion, "v3.0.0");
  assert.equal(result.baseline.status!.readyToCommit, true);
  assert.equal(result.baseline.committedHead, "a".repeat(40));
  const update = f.calls.filter(
    (call) => call.phase === "update" && call.args.includes("adopt"),
  );
  assert.deepEqual(update, [
    {
      executable: "npx",
      args: ["--yes", "@lutzseverino/repo-standards@10.0.0", "adopt", "--json"],
      phase: "update",
    },
  ]);
  assert.ok(
    result.baseline.commands
      .at(-1)!
      .executable.endsWith(
        ".repo-standards/runtime/node_modules/.bin/repo-standards",
      ),
  );
  assert.equal(
    f.submitted[0]!.questions.find(({ id }) => id === "inspection")!.answer,
    "sha256:reviewed",
  );
  assert.equal(
    (f.submitted[1]!.questions[0]!.answer as { status: string }).status,
    "satisfied",
  );
  assert.equal(result.update!.status!.readyToCommit, true);
  assert.match(result.update!.adopterAction!, /^Exact update:/);
  assert.equal(result.requests!.githubRest, 4);
  assert.deepEqual(result.requests!.byPhase, { baseline: 3, update: 1 });
});

for (const outcome of [
  "answers-required",
  "blocked",
  "contextual",
  "incomplete",
]) {
  test(`one candidate adopt ending ${outcome} fails without another invocation or answers`, async (t) => {
    const f = fixture(t, { outcome });
    const result = await f.run();
    assert.equal(result.passed, false);
    assert.match(result.failure!, new RegExp(outcome));
    assert.equal(f.calls.filter(({ phase }) => phase === "update").length, 1);
    assert.equal(result.update!.report!.outcome, outcome);
  });
}

for (const [name, options] of [
  ["nonzero complete report", { exit: 1 }],
  [
    "retired format",
    {
      exit: 1,
      stdout: JSON.stringify({
        valid: false,
        errors: [{ code: "RETIRED_FORMAT" }],
      }),
    },
  ],
  ["command error", { exit: 2, stdout: "operation failed" }],
  ["malformed output", { stdout: "not JSON" }],
  ["missing outcome", { stdout: "{}" }],
  ["not ready", { ready: false }],
  ["stale pinned runtime", { statusVersion: "9.0.0" }],
  ["missing action", { action: null }],
] as const) {
  test(`public update acceptance rejects ${name} and retains failure evidence`, async (t) => {
    const f = fixture(t, options);
    const result = await f.run();
    assert.equal(result.passed, false);
    assert.ok(result.failure);
    assert.ok(result.update!.result);
    assert.equal(
      f.calls.filter(
        ({ phase, args }) => phase === "update" && args.includes("adopt"),
      ).length,
      1,
    );
  });
}

for (const [name, command, path, value, phase = "update"] of [
  ["missing adopt format", "adopt", ["format"], undefined],
  ["retired adopt format", "adopt", ["format"], "repo-standards/adopt/v0"],
  ["predecessor adopt format", "adopt", ["format"], "repo-standards/adopt/v1"],
  ["missing adopt selection", "adopt", ["selection"], undefined],
  ["predecessor adopt CLI", "adopt", ["selection", "cli"], "9.0.0"],
  [
    "different adopt source",
    "adopt",
    ["selection", "source"],
    "https://github.com/other/standards",
  ],
  ["different adopt profile", "adopt", ["selection", "profile"], "service"],
  [
    "different adopt source release",
    "adopt",
    ["selection", "version"],
    "v2.0.0",
  ],
  ["missing adopt source release", "adopt", ["selection", "version"], null],
  ["missing adopt platform", "adopt", ["selection", "platform"], undefined],
  ["different adopt platform", "adopt", ["selection", "platform"], "forgejo"],
  ["complete with questions", "adopt", ["missing"], ["inspection"]],
  ["complete with blockers", "adopt", ["blockers"], [{ code: "BLOCKED" }]],
  ["missing status format", "status", ["format"], undefined],
  [
    "predecessor status format",
    "status",
    ["format"],
    "repo-standards/status/v8",
  ],
  ["missing status selection", "status", ["selection"], undefined],
  ["missing status standards", "status", ["selection", "standards"], undefined],
  [
    "different status source",
    "status",
    ["selection", "standards", "repository"],
    "https://github.com/other/standards",
  ],
  ["different status profile", "status", ["selection", "profile"], "service"],
  [
    "different status release",
    "status",
    ["selection", "standards", "version"],
    "v2.0.0",
  ],
  [
    "different status commit",
    "status",
    ["selection", "standards", "commit"],
    "c".repeat(40),
  ],
  [
    "missing status commit",
    "status",
    ["selection", "standards", "commit"],
    undefined,
  ],
  [
    "invalid status commit",
    "status",
    ["selection", "standards", "commit"],
    "not-a-commit",
  ],
  ["different status platform", "status", ["selection", "platform"], "forgejo"],
  ["missing status platform", "status", ["selection", "platform"], undefined],
  [
    "different baseline adopt release",
    "adopt",
    ["selection", "version"],
    "v2.0.0",
    "baseline",
  ],
  [
    "missing baseline source release",
    "status",
    ["selection", "standards", "version"],
    undefined,
    "baseline",
  ],
  [
    "invalid baseline source release",
    "status",
    ["selection", "standards", "version"],
    "v3.0.0-next.1",
    "baseline",
  ],
  [
    "missing baseline commit",
    "status",
    ["selection", "standards", "commit"],
    undefined,
    "baseline",
  ],
  [
    "invalid baseline commit",
    "status",
    ["selection", "standards", "commit"],
    "not-a-commit",
    "baseline",
  ],
] as const) {
  test(`public update acceptance rejects ${name}`, async (t) => {
    const f = fixture(t, {
      mutate(report, reportedCommand, reportedPhase) {
        if (reportedCommand !== command || reportedPhase !== phase) return;
        let target = report;
        for (const key of path.slice(0, -1))
          target = target[key] as Record<string, unknown>;
        target[path.at(-1)!] = value;
      },
    });
    const result = await f.run();
    assert.equal(result.passed, false, name);
    assert.ok(result.failure);
    const updates = f.calls.filter(
      ({ phase, args }) => phase === "update" && args.includes("adopt"),
    );
    assert.equal(updates.length, phase === "baseline" ? 0 : 1);
    if (phase === "update") assert.ok(result.update!.report);
  });
}

test("a missing stable predecessor fails before project commands run", async (t) => {
  const f = fixture(t, { versions: { "10.0.0": {}, "11.0.0-next.1": {} } });
  const result = await f.run();
  assert.equal(result.passed, false);
  assert.match(result.failure!, /No published stable npm release/);
  assert.deepEqual(f.calls, []);
});

test("the public request observer preserves transport and response identity while counting anonymous requests", (t) => {
  const root = mkdtempSync(join(tmpdir(), "repo-standards-request-observer-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "requests.jsonl");
  writeFileSync(path, "");
  const observer = new URL(
    "../acceptance/observe-public-requests.ts",
    import.meta.url,
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    const response = new Response('untouched', { status: 201, headers: {'x-proof': 'original'} });
    let received;
    globalThis.fetch = async (...args) => { received = args; return response; };
    await import(${JSON.stringify(observer)});
    const input = new Request('https://api.github.com/repos/alice/standards?not-recorded=PRIVATE_QUERY');
    const init = {headers: {accept: 'application/json'}};
    assert.equal(await fetch(input, init), response);
    assert.equal(received[0], input);
    assert.equal(received[1], init);
    assert.equal(await response.text(), 'untouched');
    assert.equal(response.headers.get('x-proof'), 'original');
    assert.throws(() => fetch('https://api.github.com/repos/alice/standards', {headers: {authorization: 'PRIVATE_TOKEN'}}), /must not authenticate/);
  `,
    ],
    {
      env: {
        ...process.env,
        REPO_STANDARDS_ACCEPTANCE_REQUEST_LOG: path,
        REPO_STANDARDS_ACCEPTANCE_PHASE: "update",
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(requestCount(path).byPhase, { update: 1 });
  assert.equal(requestCount(path).githubRest, 1);
  assert.doesNotMatch(
    readFileSync(path, "utf8"),
    /PRIVATE_QUERY|PRIVATE_TOKEN|authorization/,
  );
});

test("public installation still refuses external NODE_OPTIONS before acquisition", (t) => {
  const root = mkdtempSync(join(tmpdir(), "repo-standards-external-options-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    ["acceptance/public-installation.ts", "9.0.0", join(root, "evidence.json")],
    {
      env: { ...process.env, NODE_OPTIONS: "--trace-warnings", TMPDIR: root },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Run public acceptance without NODE_OPTIONS or acquisition fixtures/,
  );
});

test("public installation reaches command setup in a clean checkout without node_modules", (t) => {
  const root = mkdtempSync(join(tmpdir(), "repo-standards-clean-acceptance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const checkout = join(root, "checkout");
  // Copy the actual standalone entrypoint and its transitive local modules,
  // without installing or making the product checkout's dependencies available.
  for (const path of [
    "acceptance/public-installation.ts",
    "acceptance/public-update.ts",
    "acceptance/observe-public-requests.ts",
    "test/installed-cli.ts",
    "scripts/pack-package.ts",
    "package.json",
  ]) {
    const target = join(checkout, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(new URL(`../${path}`, import.meta.url), target);
  }
  assert.equal(existsSync(join(checkout, "node_modules")), false);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "npm"),
    `#!${process.execPath}\nconsole.error('CLEAN_CHECKOUT_SETUP_REACHED'); process.exit(77);\n`,
    { mode: 0o755 },
  );
  const evidence = join(root, "evidence.json");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: bin,
    TMPDIR: root,
  };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const result = spawnSync(
    process.execPath,
    ["acceptance/public-installation.ts", "9.0.0", evidence],
    { cwd: checkout, env, encoding: "utf8", timeout: 20_000 },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
  const report = JSON.parse(readFileSync(evidence, "utf8")) as {
    passed: boolean;
    failure: string;
    commands: { executable: string; args: string[]; status: number }[];
  };
  assert.equal(report.passed, false);
  assert.match(report.failure, /CLEAN_CHECKOUT_SETUP_REACHED/);
  assert.deepEqual(
    report.commands.map(({ executable, args, status }) => ({
      executable,
      args,
      status,
    })),
    [{ executable: "npm", args: ["--version"], status: 77 }],
  );
});
