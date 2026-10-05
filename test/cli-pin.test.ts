import type {
  ErrorReport,
  Inspection,
  Lock,
  OutdatedReport,
  PackageManifest,
  Run,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import type { TestContext } from "node:test";
import { inc } from "semver";
import { filesystemFault, kill } from "./adoption-faults.ts";
import { adoptionFixture } from "./adoption-fixture.ts";
import { installCli, snapshot } from "./installed-cli.ts";
import { installCandidate } from "./registry-fixture.ts";
import {
  commit,
  git,
  inspectionArgs,
  manifest,
  startArgs,
} from "./remote-fixture.ts";

const cli = installCli();
const candidateVersion = inc(cli.version, "minor")!;
after(() => cli.close());

const reinstall = "npm ci --ignore-scripts --prefix .repo-standards/runtime";

// A project adopted with the installed CLI, and a candidate exact CLI of
// another version installed outside it from the registry fixture.
async function fixture(
  t: TestContext,
  declarations: Record<string, unknown>,
  files: Record<string, string>,
) {
  const f = await adoptionFixture(t, cli, manifest(declarations), {
    files,
    recordRequests: true,
    project: { "README.md": "# Project\n" },
    versions: [cli.version, candidateVersion],
  });
  const { project, remote, env } = f;
  const candidate = installCandidate(candidateVersion, env);
  t.after(() => candidate.close());
  return {
    project,
    remote,
    env,
    pinned: (args: string[]) => f.run(args),
    candidate: (
      args: string[],
      environment: NodeJS.ProcessEnv = env,
      cwd = project.root,
    ) => candidate.run(args, cwd, environment),
    adopt() {
      return f.run(startArgs(f.inspect().identity));
    },
  };
}

function rejected(result: ReturnType<typeof spawnSync>, pinned: string) {
  assert.equal(
    result.status,
    1,
    `${String(result.stdout)}${String(result.stderr)}`,
  );
  const [error] = (JSON.parse(String(result.stdout)) as ErrorReport).errors;
  assert.equal(error!.code, "CLI_PIN_MISMATCH");
  assert.ok(error!.message.includes(` ${pinned}`), error!.message);
  assert.ok(error!.message.includes(reinstall), error!.message);
  return error!.message;
}

test("status and outdated reject a CLI other than the pin, while inspect and start take it as a CLI pin change", async (t) => {
  const f = await fixture(
    t,
    { instructions: { kind: "file", target: "AGENTS.md", exact: "agents.md" } },
    { "agents.md": "Instructions" },
  );
  const adopted = f.adopt();
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
  commit(f.project.root);
  const before = snapshot(f.project.root);
  const requests = f.remote.requestLog().length;

  // A CLI other than the pin answers neither status nor outdated, makes no
  // lookup, and writes no cache.
  for (const args of [
    ["status", "--json"],
    ["outdated", "--json"],
  ]) {
    const message = rejected(f.candidate(args), cli.version);
    assert.ok(message.includes(candidateVersion), message);
  }
  for (const args of [["status"], ["status", "--summary"], ["outdated"]]) {
    const result = f.candidate(args);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^\[CLI_PIN_MISMATCH\] /);
    assert.ok(result.stderr.includes(` ${cli.version}`), result.stderr);
    assert.ok(result.stderr.includes(reinstall), result.stderr);
  }
  // The reinstall is anchored to the project root, wherever the CLI runs.
  for (const command of ["status", "outdated"]) {
    const message = rejected(
      f.candidate(
        [command, "--project", f.project.root, "--json"],
        f.env,
        f.remote.support.root,
      ),
      cli.version,
    );
    assert.ok(
      message.includes(`From the project root ${f.project.root}, `),
      message,
    );
  }
  assert.deepEqual(f.remote.requestLog().slice(requests), []);
  assert.equal(
    existsSync(join(f.project.root, ".repo-standards/cache")),
    false,
  );
  assert.deepEqual(snapshot(f.project.root), before);

  // The same candidate still inspects and starts a CLI pin change.
  const inspected = f.candidate(["inspect", "--json"]);
  assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
  const inspection = JSON.parse(inspected.stdout) as Inspection;
  assert.deepEqual(inspection.update, ["cli"]);
  assert.equal(inspection.selection.cli.version, candidateVersion);
  assert.equal(
    inspection.start.eligible,
    true,
    JSON.stringify(inspection.start.blockers),
  );
  const started = f.candidate([
    "start",
    "--confirm",
    inspection.identity,
    "--json",
  ]);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.equal((JSON.parse(started.stdout) as Run).outcome, "complete");
  commit(f.project.root);

  // The candidate is now the pin, and the former CLI is the stale one.
  const status = f.candidate(["status", "--json"]);
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.equal(
    (JSON.parse(status.stdout) as Status).selection!.cli.version,
    candidateVersion,
  );
  const outdated = f.candidate(["outdated", "--json"]);
  assert.equal(outdated.status, 0, outdated.stdout + outdated.stderr);
  assert.equal(
    (JSON.parse(outdated.stdout) as OutdatedReport).cli.pinned,
    candidateVersion,
  );
  for (const args of [
    ["status", "--json"],
    ["outdated", "--json"],
  ])
    rejected(f.pinned(args), candidateVersion);
  assert.equal(
    execFileSync(
      join(
        f.project.root,
        ".repo-standards/runtime/node_modules/.bin/repo-standards",
      ),
      ["--version"],
      { encoding: "utf8" },
    ).trim(),
    candidateVersion,
  );
});

test("status, resume and abandon of an active run require the run's pinned CLI", async (t) => {
  const f = await fixture(
    t,
    { readme: { kind: "file", target: "README.md", guidance: "readme.md" } },
    { "readme.md": "Describe the project." },
  );
  const started = f.adopt();
  assert.equal(
    (JSON.parse(started.stdout) as Run).phase,
    "contextual",
    started.stdout + started.stderr,
  );
  const head = git(f.project.root, "rev-parse", "HEAD");
  const before = snapshot(f.project.root);
  for (const args of [
    ["status", "--json"],
    ["resume", "--json"],
    ["abandon", "--json"],
  ])
    rejected(f.candidate(args), cli.version);
  assert.deepEqual(snapshot(f.project.root), before);
  assert.equal(git(f.project.root, "rev-parse", "HEAD"), head);
  const status = f.pinned(["status", "--json"]);
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.equal(
    (JSON.parse(status.stdout) as Status).active!.phase,
    "contextual",
  );
});

test("an older CLI rejects the pin before record formats or integrity for status, resume and abandon", async (t) => {
  const f = await fixture(
    t,
    { instructions: { kind: "file", target: "AGENTS.md", exact: "agents.md" } },
    { "agents.md": "Instructions" },
  );
  const inspection = JSON.parse(
    f.candidate(inspectionArgs).stdout,
  ) as Inspection;
  const started = f.candidate(startArgs(inspection.identity));
  assert.equal(started.status, 0, started.stdout + started.stderr);
  commit(f.project.root);
  const root = f.project.root;
  const lock = JSON.parse(
    readFileSync(join(root, ".repo-standards/lock.json"), "utf8"),
  ) as Lock;
  const runRecord = join(
    root,
    git(root, "rev-parse", "--git-path", "repo-standards-run.lock"),
  );
  const reports = join(runRecord, "../repo-standards-reports");
  mkdirSync(reports, { recursive: true });
  const archived = join(reports, "c0ffee00-0000-4000-8000-000000000000.json");
  const records = [
    {
      path: join(root, ".repo-standards/state.json"),
      versions: ["v5", "v7"],
      artifact: "state",
    },
    {
      path: join(root, ".repo-standards/inputs/scope-history.json"),
      versions: ["v3", "v5"],
      artifact: "scope-history",
    },
    { path: runRecord, versions: ["v5", "v7"], artifact: "run" },
    { path: archived, versions: ["v5", "v7"], artifact: "run" },
    {
      path: join(root, ".repo-standards/lock.json"),
      versions: ["v0", "v2"],
      artifact: "lock",
    },
  ];
  const commands = [
    ["status", "--json"],
    ["status", "--summary"],
    ["resume", "--json"],
    ["resume", "--retry", "--json"],
    ["abandon", "--json"],
  ];
  for (const { path, versions, artifact } of records) {
    const original = existsSync(path) ? readFileSync(path) : undefined;
    for (const version of versions) {
      writeFileSync(
        path,
        JSON.stringify({
          format: `repo-standards/${artifact}/${version}`,
          selection: lock.selection,
        }),
      );
      const before = snapshot(root);
      const requests = f.remote.requestLog().length;
      for (const command of commands) {
        const result = f.pinned(command);
        if (command.includes("--json")) rejected(result, candidateVersion);
        else {
          assert.equal(result.status, 1, result.stdout + result.stderr);
          assert.equal(result.stdout, "");
          assert.match(result.stderr, /^\[CLI_PIN_MISMATCH\] /);
        }
        assert.deepEqual(
          snapshot(root),
          before,
          `${artifact}/${version} ${command[0]} must not write`,
        );
      }
      assert.deepEqual(f.remote.requestLog().slice(requests), []);
    }
    if (original) writeFileSync(path, original);
    else rmSync(path);
  }
});

test("a CLI pin change interrupted before its runtime is installed sends the former CLI to the candidate CLI instead of a reinstall", async (t) => {
  const f = await fixture(
    t,
    { instructions: { kind: "file", target: "AGENTS.md", exact: "agents.md" } },
    { "agents.md": "Instructions" },
  );
  assert.equal(f.adopt().status, 0);
  commit(f.project.root);
  const inspection = JSON.parse(
    f.candidate(["inspect", "--json"]).stdout,
  ) as Inspection;
  assert.deepEqual(inspection.update, ["cli"]);
  const env = filesystemFault(
    f.remote.support.root,
    f.env,
    "installation",
    kill,
  );
  const started = f.candidate(
    ["start", "--confirm", inspection.identity, "--json"],
    env,
  );
  assert.equal(started.signal, "SIGKILL", started.stdout + started.stderr);
  const runtime = JSON.parse(
    readFileSync(
      join(f.project.root, ".repo-standards/runtime/package.json"),
      "utf8",
    ),
  ) as PackageManifest;
  assert.equal(
    runtime.dependencies["@lutzseverino/repo-standards"],
    cli.version,
  );

  // The committed runtime still installs the former CLI, so the former CLI is
  // sent to the candidate that started the run instead of to a reinstall.
  for (const args of [
    ["status", "--json"],
    ["resume", "--json"],
    ["abandon", "--json"],
  ]) {
    const result = f.pinned(args);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const [error] = (JSON.parse(result.stdout) as ErrorReport).errors;
    assert.equal(error!.code, "CLI_PIN_MISMATCH");
    assert.ok(error!.message.includes(` ${candidateVersion}`), error!.message);
    assert.ok(
      error!.message.includes("installed outside the project"),
      error!.message,
    );
    assert.ok(!error!.message.includes(reinstall), error!.message);
  }
  // Installation writes the runtime manifest and its npm lock separately; a new
  // manifest beside the former lock cannot be reinstalled either.
  const manifest = join(f.project.root, ".repo-standards/runtime/package.json");
  writeFileSync(
    manifest,
    JSON.stringify({
      ...runtime,
      dependencies: { "@lutzseverino/repo-standards": candidateVersion },
    }),
  );
  const rejectedPartial = f.pinned(["status", "--json"]);
  assert.equal(
    rejectedPartial.status,
    1,
    rejectedPartial.stdout + rejectedPartial.stderr,
  );
  const partial = (JSON.parse(rejectedPartial.stdout) as ErrorReport).errors[0];
  assert.equal(partial!.code, "CLI_PIN_MISMATCH");
  assert.ok(
    partial!.message.includes("installed outside the project"),
    partial!.message,
  );
  assert.ok(!partial!.message.includes(reinstall), partial!.message);
  const status = f.candidate(["status", "--json"]);
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.equal(
    (JSON.parse(status.stdout) as Status).active!.selection.cli.version,
    candidateVersion,
  );

  // Even with unreadable formats, the active run's candidate pin takes
  // precedence over the former adoption's pin in the committed lock.
  const runRecord = join(
    f.project.root,
    git(f.project.root, "rev-parse", "--git-path", "repo-standards-run.lock"),
  );
  const run = JSON.parse(readFileSync(runRecord, "utf8")) as Run;
  writeFileSync(
    runRecord,
    JSON.stringify({ ...run, format: "repo-standards/run/v7" }),
  );
  const statePath = join(f.project.root, ".repo-standards/state.json");
  const state = readFileSync(statePath);
  writeFileSync(
    statePath,
    JSON.stringify({ format: "repo-standards/state/v6" }),
  );
  const before = snapshot(f.project.root);
  for (const command of ["status", "resume", "abandon"]) {
    const result = f.pinned([command, "--json"]);
    const error = (JSON.parse(result.stdout) as ErrorReport).errors[0];
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(error!.code, "CLI_PIN_MISMATCH");
    assert.ok(error!.message.includes(` ${candidateVersion}`), error!.message);
    assert.deepEqual(
      snapshot(f.project.root),
      before,
      `${command} must not write`,
    );
  }
  writeFileSync(statePath, state);
  const newerRun = snapshot(f.project.root);
  for (const command of ["status", "resume", "abandon"]) {
    const result = f.candidate([command, "--json"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      "NEWER_FORMAT",
    );
    assert.deepEqual(
      snapshot(f.project.root),
      newerRun,
      `${command} must not write`,
    );
  }
});
