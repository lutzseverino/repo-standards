import type {
  CheckReport,
  ErrorReport,
  Inspection,
  Lock,
  Run,
  State,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { adoptionFixture } from "./adoption-fixture.ts";
import {
  discoveryFixture,
  judgments,
  source,
  untilStarted,
} from "./adopt-fixture.ts";
import { rewriteCommittedState } from "./committed-evidence.ts";
import {
  directoryFixture,
  installCli,
  sha256,
  snapshot,
} from "./installed-cli.ts";
import {
  commit,
  git,
  inspectionArgs,
  manifest,
  operation,
  startArgs,
} from "./remote-fixture.ts";

// One copy of installed exact content (ADR 0036): the retained inputs keep no
// copy of an installed exact file or skill file that nothing else retains,
// and the CLI reads the verified installed target, or the verified source
// snapshot for an edited one, in its place.

const cli = installCli();
after(() => cli.close());

// A check that passes only when the script and resource it runs are the
// standards' own: it reads its resource beside the retained script.
const checkScript = `import { readFileSync } from "node:fs";
const notes = readFileSync(new URL("../skills/review/notes.md", import.meta.url), "utf8");
const ok = notes === "Review notes\\n";
console.log(JSON.stringify({ format: "repo-standards/result/v2", status: ok ? "passed" : "failed", message: ok ? "Retained" : "Edited resource" }));
`;
const fixScript = `console.log(JSON.stringify({ format: "repo-standards/result/v2", status: "unchanged", message: "Nothing to fix" }));
`;
const declarations = {
  // Only installed.
  instructions: {
    kind: "file",
    target: "AGENTS.md",
    exact: "content.md",
    rules: "skills/review/rules.md",
  },
  // A skill whose notes are a check resource and whose rules file is a
  // declaration's rules: only SKILL.md is only installed.
  review: { kind: "skill", name: "review", source: "skills/review" },
  // Installed, and the script a check runs.
  tool: {
    kind: "file",
    target: "scripts/check.mjs",
    exact: "vendor/check.mjs",
    checks: [
      operation("retained", {
        script: "vendor/check.mjs",
        resources: ["skills/review/notes.md"],
      }),
    ],
  },
  // Installed, and a fix resource.
  data: {
    kind: "file",
    target: "data.txt",
    exact: "vendor/data.txt",
    fixes: [
      operation("prepare", {
        script: "fix.mjs",
        resources: ["vendor/data.txt"],
      }),
    ],
  },
  // Installed, and the source's root license.
  license: { kind: "file", target: "STANDARDS-LICENSE", exact: "LICENSE" },
};
const files = {
  "content.md": "Expected instructions\n",
  "skills/review/SKILL.md": "# Review\nReview the code.\n",
  "skills/review/notes.md": "Review notes\n",
  "skills/review/rules.md": "Review every change.\n",
  "vendor/check.mjs": checkScript,
  "vendor/data.txt": "Data\n",
  "fix.mjs": fixScript,
  LICENSE: "Source license\n",
};
const retained = ".repo-standards/inputs/source";
// Retained only because they are installed exact content.
const dropped = ["content.md", "skills/review/SKILL.md"];
// Also retained for another reason.
const kept = [
  "LICENSE",
  "fix.mjs",
  "skills/review/notes.md",
  "skills/review/rules.md",
  "vendor/check.mjs",
  "vendor/data.txt",
];

async function adopted(t: TestContext) {
  const f = await adoptionFixture(t, cli, manifest(declarations), {
    files,
    recordRequests: true,
  });
  f.adopt();
  const lock = () =>
    JSON.parse(
      readFileSync(join(f.root, ".repo-standards/lock.json"), "utf8"),
    ) as Lock;
  const state = () =>
    JSON.parse(
      readFileSync(join(f.root, ".repo-standards/state.json"), "utf8"),
    ) as State;
  // GitHub stops answering; the source's Git objects stay reachable.
  const saved = { ...f.remote.responses };
  const offline = (response?: (typeof saved)[string]) => {
    for (const url of Object.keys(saved))
      if (response) f.remote.responses[url] = response;
      else delete f.remote.responses[url];
    f.remote.save();
  };
  const online = () => {
    Object.assign(f.remote.responses, saved);
    f.remote.save();
  };
  return { ...f, lock, state, offline, online };
}

const githubRequests = (f: Awaited<ReturnType<typeof adopted>>) =>
  f.remote.requests().filter((url) => url.startsWith("https://api.github.com"));

test("an adoption retains no copy of installed exact content that nothing else retains, and the lock records its target", async (t) => {
  const f = await adopted(t);
  const lock = f.lock();
  assert.equal(lock.format, "repo-standards/lock/v3");
  for (const path of dropped) {
    assert.equal(existsSync(join(f.root, retained, path)), false, path);
    assert.equal(lock.files[`${retained}/${path}`], undefined, path);
  }
  for (const path of kept) {
    assert.equal(
      readFileSync(join(f.root, retained, path), "utf8"),
      files[path as keyof typeof files],
      path,
    );
    assert.equal(
      lock.files[`${retained}/${path}`]!.sha256,
      sha256(files[path as keyof typeof files]),
      path,
    );
  }
  // The installed targets remain recorded by hash in the lock and as
  // installation baselines in durable state.
  const state = f.state();
  for (const [target, source] of [
    ["AGENTS.md", "content.md"],
    [".agents/skills/review/SKILL.md", "skills/review/SKILL.md"],
    ["scripts/check.mjs", "vendor/check.mjs"],
    ["STANDARDS-LICENSE", "LICENSE"],
  ] as const) {
    const expected = { sha256: sha256(files[source]), executable: false };
    assert.deepEqual(lock.files[target], expected, target);
    assert.deepEqual(state.baselines[target], expected, target);
  }
  assert.deepEqual(state.skills[".agents/skills/review"], [
    "SKILL.md",
    "notes.md",
    "rules.md",
  ]);
  // Editing an installed copy of a check script or resource does not change
  // what check runs: it runs the retained copy.
  writeFileSync(join(f.root, "scripts/check.mjs"), "process.exit(3);\n");
  writeFileSync(join(f.root, ".agents/skills/review/notes.md"), "Edited\n");
  const checked = f.json<CheckReport>(["check", "--json"]);
  assert.equal(checked.result.status, 0, checked.result.stdout);
  assert.deepEqual(
    checked.report.checks.map(({ id, status, message }) => [
      id,
      status,
      message,
    ]),
    [["retained", "passed", "Retained"]],
  );
});

test("a fresh checkout with unedited targets inspects, starts and checks its retained standards without a network request", async (t) => {
  const f = await adopted(t);
  const checkout = directoryFixture("repo-standards-one-copy-");
  t.after(() => checkout.close());
  rmSync(checkout.root, { recursive: true });
  execFileSync("git", ["clone", "--quiet", f.root, checkout.root]);
  execFileSync(
    "npm",
    [
      "ci",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      ".repo-standards/runtime",
    ],
    { cwd: checkout.root, env: f.env, stdio: "pipe" },
  );
  f.offline();
  const before = githubRequests(f).length;
  const pinned = (args: string[]) => {
    const result = spawnSync(
      join(
        checkout.root,
        ".repo-standards/runtime/node_modules/.bin/repo-standards",
      ),
      [...args, "--json"],
      { cwd: checkout.root, env: f.env, encoding: "utf8" },
    );
    return { result, report: JSON.parse(result.stdout) as unknown };
  };
  const status = pinned(["status"]);
  assert.equal(status.result.status, 0, status.result.stdout);
  assert.equal((status.report as Status).stateError, undefined);
  const checked = pinned(["check"]);
  assert.equal(checked.result.status, 0, checked.result.stdout);
  const inspected = pinned(["inspect"]);
  assert.equal(inspected.result.status, 0, inspected.result.stdout);
  const inspection = inspected.report as Inspection;
  assert.equal(inspection.retained, true);
  assert.deepEqual(
    inspection.exact
      .map(({ target, action }) => [target, action])
      .sort(([a], [b]) => (a! < b! ? -1 : 1)),
    [
      [".agents/skills/review", "match"],
      ["AGENTS.md", "match"],
      ["STANDARDS-LICENSE", "match"],
      ["data.txt", "match"],
      ["scripts/check.mjs", "match"],
    ],
  );
  assert.deepEqual(inspection.discardedEdits, []);
  const started = pinned(["start", "--identity", inspection.identity]);
  assert.equal(started.result.status, 0, started.result.stdout);
  assert.equal((started.report as Run).outcome, "complete");
  assert.equal(githubRequests(f).length, before);
});

test("retained inspection of edited targets reads the source snapshot, reports the source's diffs, and its start replaces the edits", async (t) => {
  const f = await adopted(t);
  // A modified exact target, a removed one, and a skill with an added file.
  writeFileSync(join(f.root, "AGENTS.md"), "Local instructions\n");
  rmSync(join(f.root, "data.txt"));
  writeFileSync(join(f.root, ".agents/skills/review/extra.md"), "Extra\n");
  commit(f.root);
  const fromSource = f.inspect();
  const retainedReport = f.inspect(["inspect", "--json"]);
  assert.equal(retainedReport.retained, true);
  assert.deepEqual(retainedReport.exact, fromSource.exact);
  assert.deepEqual(retainedReport.inputs, fromSource.inputs);
  assert.deepEqual(
    retainedReport.discardedEdits.sort((a, b) => (a < b ? -1 : 1)),
    [".agents/skills/review", "AGENTS.md"],
  );
  assert.equal(
    retainedReport.exact.find(({ target }) => target === "data.txt")!.action,
    "create",
  );
  assert.equal(retainedReport.identity, fromSource.identity);
  const summary = (args: string[]) => {
    const result = f.run(
      args.map((arg) => (arg === "--json" ? "--summary" : arg)),
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.slice(result.stdout.indexOf("Repo Standards"));
  };
  assert.equal(summary(["inspect", "--json"]), summary(inspectionArgs));
  const started = f.json<Run>(
    startArgs(retainedReport.identity, ["inspect", "--json"], true),
  );
  assert.equal(started.result.status, 0, started.result.stdout);
  assert.equal(started.report.outcome, "complete", started.result.stdout);
  assert.equal(
    readFileSync(join(f.root, "AGENTS.md"), "utf8"),
    files["content.md"],
  );
  assert.equal(
    readFileSync(join(f.root, "data.txt"), "utf8"),
    files["vendor/data.txt"],
  );
  assert.equal(
    existsSync(join(f.root, ".agents/skills/review/extra.md")),
    false,
  );
});

test("retained inspection of an edited target fails with the source's outcome when the source is unreachable, and check still runs", async (t) => {
  const f = await adopted(t);
  writeFileSync(join(f.root, "AGENTS.md"), "Local instructions\n");
  commit(f.root);
  for (const [response, code] of [
    [undefined, "SOURCE_UNAVAILABLE"],
    [{ status: 429, body: {} }, "QUOTA_EXHAUSTED"],
  ] as const) {
    f.offline(response);
    const before = snapshot(f.root);
    for (const command of [
      ["inspect"],
      ["start", "--identity", "sha256:any"],
    ]) {
      const failed = f.json<ErrorReport>([...command, "--json"]);
      assert.equal(failed.result.status, 1, failed.result.stdout);
      const [error] = failed.report.errors;
      assert.equal(error!.code, code, `${command[0]} ${failed.result.stdout}`);
      assert.match(
        error!.message,
        /Edited installed target AGENTS\.md needs the recorded source https:\/\/github\.com\/alice\/standards v1\.0\.0/,
      );
      assert.deepEqual(snapshot(f.root), before);
    }
    // check verifies the retained inputs and runs the retained checks
    // without resolving exact content.
    const requests = githubRequests(f).length;
    const checked = f.json<CheckReport>(["check", "--json"]);
    assert.equal(checked.result.status, 0, checked.result.stdout);
    assert.deepEqual(
      checked.report.checks.map(({ id, status }) => [id, status]),
      [["retained", "passed"]],
    );
    assert.equal(githubRequests(f).length, requests);
  }
});

test("an edited target rejects a snapshot at another commit or with bytes other than its installed baseline", async (t) => {
  const f = await adopted(t);
  writeFileSync(join(f.root, "AGENTS.md"), "Local instructions\n");
  commit(f.root);
  const run = (env: NodeJS.ProcessEnv = f.env) => {
    const before = snapshot(f.root);
    const failed = f.json<ErrorReport>(["inspect", "--json"], env);
    assert.equal(failed.result.status, 1, failed.result.stdout);
    assert.deepEqual(snapshot(f.root), before);
    return failed.report.errors[0]!;
  };
  // Installed baselines that the recorded commit's bytes do not match.
  const state = f.state();
  state.baselines["AGENTS.md"] = {
    sha256: sha256("Another baseline\n"),
    executable: false,
  };
  const original = readFileSync(join(f.root, ".repo-standards/state.json"));
  const lockFile = join(f.root, ".repo-standards/lock.json");
  const lock = readFileSync(lockFile);
  rewriteCommittedState(f.root, state);
  const mismatch = run();
  assert.equal(mismatch.code, "STATE_INTEGRITY", mismatch.message);
  assert.match(mismatch.message, /installed baseline of AGENTS\.md/);
  writeFileSync(join(f.root, ".repo-standards/state.json"), original);
  writeFileSync(lockFile, lock);
  // The recorded tag now names another commit, observed without the
  // product's earlier tag observation.
  f.remote.addVersion("v1.0.0", manifest(declarations), {
    "content.md": "Moved instructions\n",
  });
  const cache = directoryFixture("repo-standards-one-copy-cache-");
  t.after(() => cache.close());
  mkdirSync(join(cache.root, "fresh"));
  for (const env of [
    f.env,
    { ...f.env, XDG_CACHE_HOME: join(cache.root, "fresh") },
  ]) {
    const moved = run(env);
    assert.equal(moved.code, "MOVED_TAG", moved.message);
  }
});

test("an extra file under the retained inputs fails integrity, including a leftover exact copy", async (t) => {
  const f = await adopted(t);
  for (const path of [
    `${retained}/content.md`,
    ".repo-standards/inputs/extra.txt",
  ]) {
    mkdirSync(join(f.root, path, ".."), { recursive: true });
    writeFileSync(join(f.root, path), files["content.md"]);
    const before = snapshot(f.root);
    for (const command of [["inspect"], ["check"]]) {
      const failed = f.json<ErrorReport>([...command, "--json"]);
      assert.equal(failed.result.status, 1, failed.result.stdout);
      assert.deepEqual(
        failed.report.errors.map(({ code, message }) => [code, message]),
        [["STATE_INTEGRITY", "Retained input inventory changed."]],
        `${path} ${command[0]}`,
      );
      assert.deepEqual(snapshot(f.root), before);
    }
    rmSync(join(f.root, path));
  }
  assert.equal(git(f.root, "status", "--porcelain"), "");
});

test("an abandoned update reads the installed targets of the commit it started from, and the snapshot for one edited there", async (t) => {
  for (const edited of [false, true])
    await t.test(edited ? "edited in that commit" : "unedited", async (t) => {
      const { f } = await discoveryFixture(t, cli, [], {
        declarations: {
          instructions: {
            kind: "file",
            target: "AGENTS.md",
            exact: "content.md",
          },
        },
        files: { "content.md": "Expected instructions\n" },
      });
      const initial = untilStarted(f, [source], {}, false);
      writeFileSync(join(f.root, "app/README.md"), "# App\n");
      const completed = f.adopt(
        f.answer(initial.answers, {
          "assessment:project-docs": judgments["assessment:project-docs"],
        }),
      );
      assert.equal(completed.report.outcome, "complete");
      if (edited) writeFileSync(join(f.root, "AGENTS.md"), "Local edit\n");
      commit(f.root);
      f.remote.addVersion(
        "v1.1.0",
        readFileSync(join(f.remote.source.root, "standards.yaml"), "utf8"),
        {
          "guidance.md": "Document each maintained project's purpose.",
          "content.md": "Updated instructions\n",
        },
      );
      f.releases("v1.1.0", "v1.0.0");
      let update = f.adopt(["--standards-version", "v1.1.0"]);
      if (edited)
        update = f.adopt(
          f.answer(update.report.answers, {
            confirmation: update.report.inspection!.identity,
          }),
        );
      assert.equal(update.report.outcome, "contextual", update.result.stdout);
      // The stopped update replaced the retained inputs and the target.
      assert.equal(
        readFileSync(join(f.root, "AGENTS.md"), "utf8"),
        "Updated instructions\n",
      );
      const abandoned = f.json<Run>(["abandon", "--json"]);
      assert.equal(abandoned.result.status, 0, abandoned.result.stdout);
      const saved = { ...f.remote.responses };
      for (const url of Object.keys(saved)) delete f.remote.responses[url];
      f.remote.save();
      // Retained inspection reads the last complete adoption from that
      // commit, with its target as the commit holds it.
      const before = snapshot(f.root);
      const offline = f.json<Inspection | ErrorReport>(["inspect", "--json"]);
      if (!edited) {
        assert.equal(offline.result.status, 0, offline.result.stdout);
        const report = offline.report as Inspection;
        assert.equal(report.selection.standards.version, "v1.0.0");
        return;
      }
      assert.equal(offline.result.status, 1, offline.result.stdout);
      const [error] = (offline.report as ErrorReport).errors;
      assert.equal(error!.code, "SOURCE_UNAVAILABLE");
      assert.match(error!.message, /Edited installed target AGENTS\.md needs/);
      assert.deepEqual(snapshot(f.root), before);
      Object.assign(f.remote.responses, saved);
      f.remote.save();
      const online = f.json<Inspection>(["inspect", "--json"]);
      assert.equal(online.result.status, 0, online.result.stdout);
      assert.equal(online.report.selection.standards.version, "v1.0.0");
    });
});
