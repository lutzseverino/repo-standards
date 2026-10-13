import assert from "node:assert/strict";
import { after, test } from "node:test";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adoptionFixture } from "./adoption-fixture.ts";
import { installCli } from "./installed-cli.ts";
import type { Status } from "./json-reports.ts";
import { commit, git, manifest, versionArgs } from "./remote-fixture.ts";

const cli = installCli();
after(() => cli.close());

const standards = manifest({
  instructions: { kind: "file", target: "AGENTS.md", exact: "agents.md" },
});

test("status names a missing complete run and an active adoption as not ready to commit", async (t) => {
  const f = await adoptionFixture(
    t,
    cli,
    manifest({
      readme: { kind: "file", target: "README.md", guidance: "guidance.md" },
    }),
    {
      files: { "guidance.md": "Describe the project.\n" },
      project: { "README.md": "# Project\n" },
    },
  );
  const fresh = f.json<Status>(["status", "--json"]);
  assert.equal(fresh.result.status, 0, fresh.result.stdout);
  assert.equal(fresh.report.readyToCommit, false);
  assert.deepEqual(fresh.report.readinessReasons, [
    "No complete adoption run is recorded.",
  ]);
  assert.match(
    f.run(["status"]).stdout,
    /Ready to commit: no\.[\s\S]*No complete adoption run is recorded\./,
  );
  const started = f.start();
  assert.equal(started.report.phase, "contextual", started.result.stdout);
  const active = f.json<Status>(["status", "--json"]);
  assert.equal(active.result.status, 0, active.result.stdout);
  assert.equal(active.report.readyToCommit, false);
  assert.deepEqual(active.report.readinessReasons, [
    "An adoption run is active.",
    "No complete adoption run is recorded.",
  ]);
  assert.match(
    f.run(["status", "--summary"]).stdout,
    /Ready to commit: no\.[\s\S]*An adoption run is active\./,
  );
});

test("status reports a complete adoption ready to commit with unstaged or staged changes", async (t) => {
  const f = await adoptionFixture(t, cli, standards, {
    files: { "agents.md": "Adopted instructions\n" },
    project: { "AGENTS.md": "Previous instructions\n" },
  });
  const started = f.start();
  assert.equal(started.result.status, 0, started.result.stdout);
  for (const staged of [false, true]) {
    if (staged) git(f.root, "add", ".");
    const before = git(f.root, "status", "--porcelain=v1");
    const { result, report } = f.json<Status>(["status", "--json"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(report.readyToCommit, true);
    assert.deepEqual(report.readinessReasons, []);
    for (const args of [["status"], ["status", "--summary"]]) {
      const text = f.run(args);
      assert.equal(text.status, 0, text.stdout + text.stderr);
      assert.match(text.stdout, /Ready to commit: yes/);
    }
    assert.equal(git(f.root, "status", "--porcelain=v1"), before);
  }
});

test("status names a state error after an abandoned update as not ready to commit", async (t) => {
  const f = await adoptionFixture(t, cli, standards, {
    files: { "agents.md": "Adopted instructions\n" },
  });
  f.adopt();
  f.remote.addVersion(
    "v1.1.0",
    manifest({
      instructions: { kind: "file", target: "AGENTS.md", exact: "agents.md" },
      readme: { kind: "file", target: "README.md", guidance: "guidance.md" },
    }),
    { "guidance.md": "Describe the project.\n" },
  );
  const started = f.start(versionArgs("v1.1.0"));
  assert.equal(started.report.phase, "contextual", started.result.stdout);
  const active = f.json<Status>(["status", "--json"]).report;
  assert.ok(active.lastComplete);
  assert.equal(active.readyToCommit, false);
  assert.deepEqual(active.readinessReasons, ["An adoption run is active."]);
  const abandoned = f.json(["abandon", "--json"]);
  assert.equal(abandoned.report.abandoned, true, abandoned.result.stdout);
  const { result, report } = f.json<Status>(["status", "--json"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.stateError!.code, "STATE_INTEGRITY");
  assert.equal(report.readyToCommit, false);
  assert.match(
    report.readinessReasons.join("\n"),
    /Recorded adoption state has an error: STATE_INTEGRITY/,
  );
  assert.match(
    f.run(["status"]).stdout,
    /Ready to commit: no\.[\s\S]*Recorded adoption state has an error: STATE/,
  );
});

test("status names adoption paths already committed or reverted even with unrelated changes", async (t) => {
  const f = await adoptionFixture(t, cli, standards, {
    files: { "agents.md": "Adopted instructions\n" },
    project: { "AGENTS.md": "Previous instructions\n" },
  });
  assert.equal(f.start().result.status, 0);
  writeFileSync(join(f.root, "unrelated.txt"), "Other work\n");
  for (const action of ["reverted", "committed"]) {
    if (action === "reverted") git(f.root, "restore", "AGENTS.md");
    else {
      writeFileSync(join(f.root, "AGENTS.md"), "Adopted instructions\n");
      git(f.root, "add", "AGENTS.md");
      git(
        f.root,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "-m",
        "instructions",
      );
    }
    const { result, report } = f.json<Status>(["status", "--json"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(report.readyToCommit, false, action);
    assert.deepEqual(report.readinessReasons, [
      "Changed path is not among the uncommitted changes: AGENTS.md.",
    ]);
    assert.match(
      f.run(["status"]).stdout,
      /Ready to commit: no\.[\s\S]*Changed path is not among the uncommitted changes: AGENTS\.md\./,
    );
  }
  commit(f.root);
  assert.equal(
    f.json<Status>(["status", "--json"]).report.readyToCommit,
    false,
  );
});

test("status accounts for untracked paths, deleted paths and staged rename sources", async (t) => {
  const target = "docs/Adopted instructions.md";
  const f = await adoptionFixture(
    t,
    cli,
    manifest({
      instructions: { kind: "file", target, exact: "agents.md" },
    }),
    { files: { "agents.md": "Adopted instructions\n" } },
  );
  assert.equal(f.start().result.status, 0);
  assert.equal(f.json<Status>(["status", "--json"]).report.readyToCommit, true);
  unlinkSync(join(f.root, target));
  const reverted = f.json<Status>(["status", "--json"]).report;
  assert.equal(reverted.readyToCommit, false);
  assert.deepEqual(reverted.readinessReasons, [
    `Changed path is not among the uncommitted changes: ${target}.`,
  ]);
  writeFileSync(join(f.root, target), "Adopted instructions\n");
  commit(f.root);
  f.remote.addVersion("v1.1.0", manifest({}));
  assert.equal(f.start(versionArgs("v1.1.0")).result.status, 0);
  assert.equal(f.json<Status>(["status", "--json"]).report.readyToCommit, true);
  git(f.root, "restore", target);
  assert.equal(
    f.json<Status>(["status", "--json"]).report.readyToCommit,
    false,
  );
  git(f.root, "mv", target, "docs/Renamed instructions.md");
  assert.equal(f.json<Status>(["status", "--json"]).report.readyToCommit, true);
});

test("status accepts an empty change set after a complete unchanged adoption", async (t) => {
  const f = await adoptionFixture(t, cli, standards, {
    files: { "agents.md": "Adopted instructions\n" },
  });
  f.adopt();
  assert.equal(f.start(["inspect", "--json"]).result.status, 0);
  const status = f.json<Status>(["status", "--json"]).report;
  assert.deepEqual(status.changeSet, []);
  assert.equal(status.readyToCommit, true);
  assert.deepEqual(status.readinessReasons, []);
});
