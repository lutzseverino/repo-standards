import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { directoryFixture, installCli, sha256 } from "./installed-cli.ts";
import { commit, git } from "./remote-fixture.ts";
import { parse, stringify } from "yaml";
import {
  discoveryFixture,
  judgments,
  source,
  untilStarted,
} from "./adopt-fixture.ts";
import {
  committedScopeEvidence,
  rewriteRetainedInput,
} from "./committed-evidence.ts";
import type { Lock, Run, Status } from "./json-reports.ts";

const cli = installCli();
after(() => cli.close());
const { readCommittedScopeProposal } = (await import(
  pathToFileURL(
    join(
      cli.root,
      "node_modules/@lutzseverino/repo-standards/dist/recorded-state.js",
    ),
  ).href
)) as typeof import("../src/recorded-state.ts");

const inspection = "sha256:previous-complete";
const scopePath = ".repo-standards/inputs/scope-history.json";
const lockPath = ".repo-standards/lock.json";

// The issue's two-file reproduction: only committed bytes, their hash and the
// previous inspection are needed to read historical scope without an active run.
function committedProposal(t: TestContext, format: string) {
  const f = directoryFixture("repo-standards-committed-proposal-");
  t.after(() => f.close());
  git(f.root, "init", "--quiet", "--initial-branch=main");
  mkdirSync(join(f.root, ".repo-standards/inputs"), { recursive: true });
  const scope = {
    format: "repo-standards/scope-history/v6",
    evidence: "historical",
    inspection,
    resolved: { declarations: [] },
    scopeChanges: [],
  };
  const bytes = JSON.stringify(scope) + "\n";
  const lock = {
    format,
    inspection,
    files: { [scopePath]: { sha256: sha256(bytes), executable: false } },
  };
  const save = (scopeBytes = bytes, lockBytes = JSON.stringify(lock)) => {
    writeFileSync(join(f.root, scopePath), scopeBytes);
    writeFileSync(join(f.root, lockPath), lockBytes);
    commit(f.root);
    return git(f.root, "rev-parse", "HEAD");
  };
  return { ...f, scope, bytes, lock, save };
}

for (const version of [1, 2]) {
  test(`committed lock/v${version} accepts matching historical v6 evidence without a proposal`, (t) => {
    const f = committedProposal(t, `repo-standards/lock/v${version}`);
    assert.equal(
      readCommittedScopeProposal(f.root, f.save(), inspection),
      null,
    );
  });

  test(`committed lock/v${version} returns a verified discovery proposal from v6 evidence`, (t) => {
    const f = committedProposal(t, `repo-standards/lock/v${version}`);
    const proposal = {
      format: "repo-standards/scope/v2",
      declarations: [
        {
          id: "docs",
          coverage: "The project README.",
          candidates: [
            {
              path: "README.md",
              decision: "include",
              reason: "Project documentation.",
              evidence: ["README.md"],
            },
          ],
          unresolved: [],
        },
      ],
    };
    const declarations = [
      { id: "docs", kind: "repository", discovery: "discovery.md" },
    ];
    const bytes = JSON.stringify({
      ...f.scope,
      resolved: { declarations },
      sourceResolved: { declarations },
      discovery: {
        identity: "sha256:discovery",
        proposal,
        declarations,
        drafts: [],
        observation: {
          files: {
            "README.md": {
              type: "file",
              sha256: sha256("# Project\n"),
              executable: false,
            },
          },
          inventories: {},
          boundaries: {},
          targets: { paths: ["README.md"], directories: [] },
          settings: {},
          ignores: {},
          limits: {},
        },
      },
    });
    f.lock.files[scopePath].sha256 = sha256(bytes);
    assert.deepEqual(
      readCommittedScopeProposal(f.root, f.save(bytes), inspection),
      proposal,
    );
  });

  for (const corruption of [
    "scope JSON",
    "missing files",
    "missing scope file",
    "scope format",
    "scope hash",
    "lock inspection",
    "scope inspection",
  ]) {
    test(`committed lock/v${version} rejects corrupt ${corruption}`, (t) => {
      const f = committedProposal(t, `repo-standards/lock/v${version}`);
      let bytes = f.bytes;
      switch (corruption) {
        case "scope JSON":
          bytes = "{malformed JSON\n";
          f.lock.files[scopePath].sha256 = sha256(bytes);
          break;
        case "missing files":
          Reflect.deleteProperty(f.lock, "files");
          break;
        case "scope format":
          f.scope.format = "repo-standards/scope-history/vnext";
          bytes = JSON.stringify(f.scope);
          f.lock.files[scopePath].sha256 = sha256(bytes);
          break;
        case "scope hash":
          bytes += " ";
          break;
        case "lock inspection":
          f.lock.inspection = "sha256:other";
          break;
        case "scope inspection":
          f.scope.inspection = "sha256:other";
          bytes = JSON.stringify(f.scope);
          f.lock.files[scopePath].sha256 = sha256(bytes);
          break;
      }
      let head = f.save(bytes);
      if (corruption === "missing scope file") {
        rmSync(join(f.root, scopePath));
        commit(f.root);
        head = git(f.root, "rev-parse", "HEAD");
      }
      assert.throws(
        () => readCommittedScopeProposal(f.root, head, inspection),
        { code: "STATE_INTEGRITY" },
      );
    });
  }
}

test("committed proposal rejects malformed lock JSON", (t) => {
  const f = committedProposal(t, "repo-standards/lock/v2");
  assert.throws(
    () =>
      readCommittedScopeProposal(
        f.root,
        f.save(f.bytes, "{malformed JSON"),
        inspection,
      ),
    { code: "STATE_INTEGRITY" },
  );
});

for (const format of [
  "repo-standards/lock/v0",
  "repo-standards/lock/v3",
  "repo-standards/lock/vnext",
  "unrelated/v1",
]) {
  test(`committed proposal rejects unsupported lock marker ${format}`, (t) => {
    const f = committedProposal(t, format);
    assert.throws(
      () => readCommittedScopeProposal(f.root, f.save(), inspection),
      { code: "STATE_INTEGRITY" },
    );
  });
}

// CLI 10 wrote the same durable state/v8 and scope payload, without check
// locations. Construct those previous committed formats from a complete run.
async function stoppedUpdate(t: TestContext, legacy: boolean) {
  const { f } = await discoveryFixture(t, cli, []);
  if (!legacy) {
    const manifest = parse(
      readFileSync(join(f.remote.source.root, "standards.yaml"), "utf8"),
    ) as { profiles: { work: { "check-locations"?: string[] } } };
    manifest.profiles.work["check-locations"] = ["self-reported"];
    f.remote.addVersion("v1.0.1", stringify(manifest));
    f.releases("v1.0.1", "v1.0.0");
  }
  const initial = untilStarted(f, [source], {}, false);
  assert.equal(initial.outcome, "contextual", JSON.stringify(initial));
  writeFileSync(join(f.root, "app/README.md"), "# App\n");
  const completed = f.adopt(
    f.answer(initial.answers, {
      "assessment:project-docs": judgments["assessment:project-docs"],
    }),
  );
  assert.equal(completed.report.outcome, "complete", completed.result.stdout);
  const previousScope = committedScopeEvidence(f.root);
  assert.ok(previousScope.discovery?.proposal);
  const previousProposal = previousScope.discovery.proposal;
  if (legacy) {
    previousScope.format = "repo-standards/scope-history/v6";
    rewriteRetainedInput(f.root, scopePath, previousScope);
    const updatedLock = JSON.parse(
      readFileSync(join(f.root, lockPath), "utf8"),
    ) as Lock;
    const { checks: _checks, ...selection } = updatedLock.selection;
    selection.cli.version = "10.0.0";
    const selectionBytes = stringify(selection);
    writeFileSync(
      join(f.root, ".repo-standards/selection.yaml"),
      selectionBytes,
    );
    updatedLock.files[".repo-standards/selection.yaml"]!.sha256 =
      sha256(selectionBytes);
    updatedLock.format = "repo-standards/lock/v1";
    updatedLock.selection = selection as Lock["selection"];
    writeFileSync(join(f.root, lockPath), JSON.stringify(updatedLock));
  }
  commit(f.root);
  const head = git(f.root, "rev-parse", "HEAD");
  const committedLock = git(f.root, "show", `${head}:${lockPath}`);
  const manifest = readFileSync(
    join(f.remote.source.root, "standards.yaml"),
    "utf8",
  );
  f.remote.addVersion("v1.1.0", manifest, {
    "guidance.md": "Document each maintained project's purpose and usage.",
  });
  f.releases("v1.1.0", "v1.0.0");
  const started = f.adopt(["--standards-version", "v1.1.0"]);
  assert.equal(started.result.status, 1, started.result.stdout);
  assert.equal(started.report.outcome, "contextual", started.result.stdout);
  assert.deepEqual(started.report.missing, ["assessment:project-docs"]);
  const selection = {
    cli: cli.version,
    source,
    version: "v1.1.0",
    profile: "work",
    platform: "github",
    checks: legacy ? "github" : "self-reported",
  };
  assert.deepEqual(started.report.selection, selection);
  return {
    f,
    started: started.report,
    head,
    committedLock,
    previousProposal,
    selection,
  };
}

for (const legacy of [true, false]) {
  test(`${legacy ? "CLI 10 lock/v1" : "current lock/v2"} update remains readable and completes after a contextual stop`, async (t) => {
    const { f, started, head, committedLock, previousProposal, selection } =
      await stoppedUpdate(t, legacy);
    const status = f.json<Status>(["status", "--json"]);
    assert.equal(status.result.status, 0, status.result.stdout);
    assert.equal(status.report.readyToCommit, false);
    assert.equal(status.report.stateError, undefined);
    assert.equal(status.report.active!.id, started.run!.id);
    assert.deepEqual(status.report.scopeProposal, previousProposal);
    const waiting = f.adopt([]);
    assert.equal(waiting.result.status, 1, waiting.result.stdout);
    assert.equal(waiting.report.outcome, "contextual", waiting.result.stdout);
    assert.equal(waiting.report.run!.id, started.run!.id);
    assert.deepEqual(waiting.report.missing, started.missing);
    assert.deepEqual(
      waiting.report.answers.questions,
      started.answers.questions,
    );
    const done = f.adopt(
      f.answer(waiting.report.answers, {
        "assessment:project-docs": judgments["assessment:project-docs"],
      }),
    );
    assert.equal(done.result.status, 0, done.result.stdout);
    assert.equal(done.report.outcome, "complete", done.result.stdout);
    assert.equal(done.report.run!.id, started.run!.id);
    assert.deepEqual(done.report.selection, selection);
    const final = f.json<Status>(["status", "--json"]);
    assert.equal(final.result.status, 0, final.result.stdout);
    assert.equal(final.report.readyToCommit, true, final.result.stdout);
    assert.equal(final.report.stateError, undefined);
    assert.equal(final.report.selection!.checks, selection.checks);
    assert.equal(
      (JSON.parse(readFileSync(join(f.root, lockPath), "utf8")) as Lock).format,
      "repo-standards/lock/v2",
    );
    assert.equal(
      committedScopeEvidence(f.root).format,
      "repo-standards/scope-history/v7",
    );
    assert.equal(git(f.root, "rev-parse", "HEAD"), head);
    assert.equal(git(f.root, "show", `${head}:${lockPath}`), committedLock);
  });
}

test("abandoned CLI 10 baseline update reports its recovery and previous non-null proposal", async (t) => {
  const { f, started, previousProposal } = await stoppedUpdate(t, true);
  const abandoned = f.json<Run>(["abandon", "--json"]);
  assert.equal(abandoned.result.status, 0, abandoned.result.stdout);
  const status = f.json<Status>(["status", "--json"]);
  assert.equal(status.result.status, 0, status.result.stdout);
  assert.equal(status.report.readyToCommit, false);
  assert.equal(status.report.active, null);
  assert.equal(status.report.abandoned[0]!.id, started.run!.id);
  assert.equal(status.report.stateError!.code, "STATE_INTEGRITY");
  assert.ok(
    status.report.stateError!.message.includes(
      `abandoned run ${started.run!.id}`,
    ),
  );
  assert.match(
    status.report.stateError!.message,
    /Run adopt in this checkout to adopt again in place/,
  );
  assert.deepEqual(status.report.scopeProposal, previousProposal);
});
