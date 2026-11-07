import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { join, resolve } from "node:path";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { installCli, snapshot, sourceFixture } from "./installed-cli.ts";
import { adoptionFixture } from "./adoption-fixture.ts";
import {
  commit,
  git,
  inspectionArgs,
  startArgs,
  versionArgs,
} from "./remote-fixture.ts";
import type { ErrorReport } from "./json-reports.ts";

const cli = installCli();
after(() => cli.close());

const source = `format: repo-standards/v2
name: submodule-fixture
description: Submodule adoption
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
    instructions:
      kind: file
      target: AGENTS.md
      exact: content.md
profiles:
  work:
    description: Work
    declarations: {}
`;

function addSubmodule(root: string, path: string, from: string) {
  git(
    root,
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "--quiet",
    from,
    path,
  );
}

for (const initialized of [true, false]) {
  test(`targets cannot cross ${initialized ? "initialized" : "uninitialized"} gitlinks or change .gitmodules`, async (t) => {
    const f = await fixture(t);
    if (!initialized) {
      git(f.root, "submodule", "deinit", "--force", "--", "vendor/protocol");
      assert.equal(
        lstatSync(join(f.child, ".git"), { throwIfNoEntry: false }),
        undefined,
      );
    }
    const before = snapshot(f.root);
    for (const [index, target] of [
      "vendor/protocol",
      "vendor/protocol/new.md",
      "vendor",
      ".gitmodules",
    ].entries()) {
      const tag = `v1.0.${index + 1}`;
      f.remote.addVersion(
        tag,
        source.replace("target: AGENTS.md", `target: ${target}`),
      );
      const args = versionArgs(tag);
      const inspection = f.inspect(args);
      assert.ok(
        inspection.start.blockers.some(
          (b) => b.code === "UNSAFE_TARGET" && b.path === target,
        ),
        JSON.stringify(inspection.start),
      );
      const start = f.run(
        startArgs(inspection.identity, args, inspection.confirmation.required),
      );
      assert.equal(start.status, 1, start.stdout + start.stderr);
      assert.deepEqual(snapshot(f.root), before);
    }
  });
}

const discoverySource = source.replace(
  "kind: file\n      target: AGENTS.md\n      exact: content.md",
  "kind: repository\n      guidance: content.md\n      discovery: discover.md",
);

test("discovery excludes initialized submodule contents and rejects named gitlink boundaries", async (t) => {
  const f = await fixture(t, true, discoverySource);
  const before = snapshot(f.root);
  const report = f.inspect();
  assert.ok(report.discovery);
  assert.ok(
    !Object.keys(report.discovery.observation.files).some((path) =>
      path.startsWith("vendor/protocol/"),
    ),
  );
  assert.ok(
    !report.discovery.evidence.some((entry) =>
      entry.path.startsWith("vendor/protocol/"),
    ),
  );
  for (const path of [
    "vendor/protocol",
    "vendor/protocol/inner/tracked.txt",
    "vendor",
    ".gitmodules",
  ]) {
    const proposal = join(f.remote.support.root, "scope.json");
    writeFileSync(
      proposal,
      JSON.stringify({
        format: "repo-standards/scope/v2",
        declarations: [
          {
            id: "instructions",
            coverage: "Boundary regression",
            candidates: [
              {
                path,
                decision: "include",
                reason: "Test boundary",
                evidence: [],
              },
            ],
            unresolved: [],
          },
        ],
      }),
    );
    const result = f.run([...inspectionArgs, "--scope", proposal]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /UNSAFE_TARGET/);
    assert.deepEqual(snapshot(f.root), before);
  }
});

test("nested observation executes no hooks, filters, fsmonitor or submodule acquisition", async (t) => {
  const f = await fixture(t, true);
  const sentinel = join(f.remote.support.root, "EXECUTED");
  const script = join(f.remote.support.root, "hostile");
  writeFileSync(script, `#!/bin/sh\nprintf executed > '${sentinel}'\ncat\n`);
  chmodSync(script, 0o755);
  for (const root of [f.root, join(f.root, "vendor/protocol"), f.child]) {
    for (const key of [
      "filter.hostile.clean",
      "filter.hostile.smudge",
      "filter.hostile.process",
      "core.fsmonitor",
    ])
      git(root, "config", key, script);
    git(root, "config", "filter.hostile.required", "true");
    const hooks = join(f.remote.support.root, "hooks");
    mkdirSync(hooks, { recursive: true });
    for (const name of ["post-index-change", "post-checkout", "pre-auto-gc"]) {
      writeFileSync(join(hooks, name), readFileSync(script));
      chmodSync(join(hooks, name), 0o755);
    }
    git(root, "config", "core.hooksPath", hooks);
    git(root, "config", "submodule.recurse", "true");
    git(root, "config", "fetch.recurseSubmodules", "true");
    git(root, "config", "remote.origin.url", `ext::${script}`);
    git(root, "config", "protocol.ext.allow", "always");
  }
  // Force Git to hash tracked content, exercising its filter/fsmonitor paths.
  utimesSync(join(f.child, "tracked.txt"), new Date(0), new Date(0));
  const before = snapshot(f.root);
  assert.equal(f.inspect().start.eligible, true);
  assert.deepEqual(snapshot(f.root), before);
  writeFileSync(join(f.child, "tracked.txt"), "modified");
  const dirty = snapshot(f.root);
  const blocked = f.inspect();
  assert.equal(blocked.start.eligible, false);
  assert.equal(f.run(startArgs(blocked.identity)).status, 1);
  assert.deepEqual(snapshot(f.root), dirty);
  assert.equal(lstatSync(sentinel, { throwIfNoEntry: false }), undefined);
});

for (const nested of [false, true]) {
  test(`${nested ? "nested" : "single"} missing promisor objects block without executing a transport or acquiring objects`, async (t) => {
    const f = await fixture(t, nested);
    writeFileSync(join(f.child, "tracked.txt"), "local loose commit");
    commit(f.child);
    if (nested) commit(join(f.root, "vendor/protocol"));
    commit(f.root);
    const eligible = f.inspect();
    assert.equal(eligible.start.eligible, true);
    const object = git(f.child, "rev-parse", "HEAD");
    const objectPath = resolve(
      f.child,
      git(
        f.child,
        "rev-parse",
        "--git-path",
        `objects/${object.slice(0, 2)}/${object.slice(2)}`,
      ),
    );
    const sentinel = join(f.remote.support.root, "TRANSPORT_EXECUTED");
    const script = join(f.remote.support.root, "transport");
    writeFileSync(
      script,
      `#!/bin/sh\nprintf executed > '${sentinel}'\nexit 99\n`,
    );
    chmodSync(script, 0o755);
    git(f.child, "config", "remote.origin.promisor", "true");
    git(f.child, "config", "extensions.partialClone", "origin");
    git(f.child, "config", "remote.origin.url", `ext::${script}`);
    git(f.child, "config", "protocol.ext.allow", "always");
    rmSync(objectPath);
    // Prove that this local fixture triggers Git's implicit acquisition path.
    const unguarded: NodeJS.ProcessEnv = { ...f.env };
    delete unguarded.GIT_ALLOW_PROTOCOL;
    delete unguarded.GIT_NO_LAZY_FETCH;
    const raw = spawnSync(
      "git",
      ["-C", f.child, "rev-parse", "--verify", "HEAD^{commit}"],
      { env: unguarded },
    );
    assert.notEqual(raw.status, 0);
    assert.equal(readFileSync(sentinel, "utf8"), "executed");
    rmSync(sentinel);
    const before = snapshot(f.root);
    const inspection = f.inspect();
    assert.equal(inspection.start.eligible, false);
    assert.ok(
      inspection.start.blockers.some(
        (b) => b.code === "SUBMODULE_STATE" && b.path === f.path,
      ),
    );
    assert.equal(f.run(startArgs(eligible.identity)).status, 1);
    assert.deepEqual(snapshot(f.root), before);
    assert.equal(lstatSync(objectPath, { throwIfNoEntry: false }), undefined);
    assert.equal(lstatSync(sentinel, { throwIfNoEntry: false }), undefined);
  });
}

for (const change of ["dirt", "initialization", "checkout", "target"]) {
  for (const command of ["inspect", "start"]) {
    test(`${command} rejects nested ${change} changes during observation without additional mutation`, async (t) => {
      const f = await fixture(t, true);
      const original = git(f.child, "rev-parse", "HEAD");
      writeFileSync(join(f.child, "tracked.txt"), "another commit");
      commit(f.child);
      const other = git(f.child, "rev-parse", "HEAD");
      git(f.child, "checkout", "--quiet", "--detach", original);
      const eligible = f.inspect();
      assert.equal(eligible.start.eligible, true);
      const realGit = execFileSync("which", ["git"], {
        encoding: "utf8",
      }).trim();
      const bin = join(f.remote.support.root, "bin");
      mkdirSync(bin);
      const marker = join(f.remote.support.root, "changed.json");
      writeFileSync(
        join(bin, "git"),
        `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const result = spawnSync(${JSON.stringify(realGit)}, args);
if (args[args.indexOf('-C') + 1] === ${JSON.stringify(f.child)} && args.includes('status') && !lstatSync(${JSON.stringify(marker)}, {throwIfNoEntry: false})) {
  const child = ${JSON.stringify(f.child)};
  const change = ${JSON.stringify(change)};
  if (change === 'dirt') writeFileSync(join(child, 'tracked.txt'), 'racing change');
  if (change === 'initialization') { rmSync(child, {recursive: true}); mkdirSync(child); }
  if (change === 'checkout' || change === 'target') {
    const mutate = spawnSync(${JSON.stringify(realGit)}, change === 'checkout'
      ? ['-C', child, 'checkout', '--quiet', '--detach', ${JSON.stringify(other)}]
      : ['-C', ${JSON.stringify(f.root)}, 'update-index', '--add', '--cacheinfo', '160000', ${JSON.stringify(original)}, 'AGENTS.md']);
    if (mutate.status !== 0) throw new Error('Fixture mutation failed');
  }
  function snapshot(root) {
    return readdirSync(root).sort().map(name => {
      const path = join(root, name), stat = lstatSync(path);
      return [name, stat.mode, stat.isSymbolicLink() ? readlinkSync(path) : stat.isDirectory() ? snapshot(path) : readFileSync(path).toString('base64')];
    });
  }
  writeFileSync(${JSON.stringify(marker)}, JSON.stringify(snapshot(${JSON.stringify(f.root)})));
}

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
`,
      );
      chmodSync(join(bin, "git"), 0o755);
      const env = { ...f.env, PATH: `${bin}:${process.env.PATH}` };
      const result = f.run(
        command === "inspect" ? inspectionArgs : startArgs(eligible.identity),
        env,
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(
        (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
        "OBSERVATION_UNSTABLE",
      );
      // Start's temporary run lock is removed on exit; exclude it from the
      // injected snapshot, which was taken while start owned that lock.
      const expected = JSON.parse(readFileSync(marker, "utf8")) as unknown[];
      const gitEntry = expected.find(
        (entry) => (entry as unknown[])[0] === ".git",
      ) as [string, number, [string, number, unknown][]];
      gitEntry[2] = gitEntry[2].filter(
        ([name]) =>
          name !== "repo-standards-run.lock" &&
          name !== "repo-standards-run.lock.workers",
      );
      assert.deepEqual(snapshot(f.root), expected);
    });
  }
}

test("a failed final recursive Git read cannot return an eligible inspection from unchanged snapshots", async (t) => {
  const f = await fixture(t, true);
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const bin = join(f.remote.support.root, "bin");
  const counter = join(f.remote.support.root, "index-reads");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "git"),
    `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[args.indexOf('-C') + 1] === ${JSON.stringify(f.child)} && args.includes('ls-files') && args.includes('--stage')) {
  const file = ${JSON.stringify(counter)};
  const count = (existsSync(file) ? Number(readFileSync(file, 'utf8')) : 0) + 1;
  writeFileSync(file, String(count));
  // Fail recursive enumeration after the final sample captured index/status.
  if (count === 4) process.exit(128);
}
const result = spawnSync(${JSON.stringify(realGit)}, args, {stdio: 'inherit'});
process.exit(result.status ?? 1);
`,
  );
  chmodSync(join(bin, "git"), 0o755);
  const before = snapshot(f.root);
  const result = f.run(inspectionArgs, {
    ...f.env,
    PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(readFileSync(counter, "utf8"), "4");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(
    (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
    "OBSERVATION_UNSTABLE",
  );
  assert.deepEqual(snapshot(f.root), before);
});

test("start rejects a new target gitlink after an eligible inspection", async (t) => {
  const f = await fixture(t, true);
  const eligible = f.inspect();
  git(
    f.root,
    "update-index",
    "--add",
    "--cacheinfo",
    "160000",
    git(f.child, "rev-parse", "HEAD"),
    "AGENTS.md",
  );
  git(
    f.root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "new gitlink",
  );
  const before = snapshot(f.root);
  const report = f.inspect();
  assert.ok(
    report.start.blockers.some(
      (b) => b.code === "UNSAFE_TARGET" && b.path === "AGENTS.md",
    ),
  );
  assert.equal(f.run(startArgs(eligible.identity)).status, 1);
  assert.deepEqual(snapshot(f.root), before);
});

test("a clean unrelated submodule commit does not become a confirmation binding", async (t) => {
  const f = await fixture(t);
  const eligible = f.inspect();
  writeFileSync(join(f.child, "tracked.txt"), "new clean commit");
  commit(f.child);
  commit(f.root);
  const next = f.inspect();
  assert.equal(next.start.eligible, true);
  assert.equal(next.identity, eligible.identity);
  const started = f.run(startArgs(eligible.identity));
  assert.equal(started.status, 0, started.stdout + started.stderr);
});

test("update cannot replace or remove a recorded target that has become an uninitialized gitlink", async (t) => {
  const f = await fixture(
    t,
    false,
    source.replace("target: AGENTS.md", "target: vendor/legacy"),
  );
  f.adopt();
  rmSync(join(f.root, "vendor/legacy"));
  git(
    f.root,
    "update-index",
    "--add",
    "--cacheinfo",
    "160000",
    git(f.child, "rev-parse", "HEAD"),
    "vendor/legacy",
  );
  mkdirSync(join(f.root, "vendor/legacy"));
  git(
    f.root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "Replace target with gitlink",
  );
  const before = snapshot(f.root);
  for (const [tag, yaml] of [
    ["v1.0.1", source.replace("target: AGENTS.md", "target: vendor/legacy")],
    ["v1.0.2", source],
  ]) {
    f.remote.addVersion(tag!, yaml!, { "content.md": "Updated instructions" });
    const args = versionArgs(tag!);
    const report = f.inspect(args);
    assert.ok(
      report.start.blockers.some(
        (b) => b.code === "UNSAFE_TARGET" && b.path === "vendor/legacy",
      ),
    );
    assert.equal(
      f.run(startArgs(report.identity, args, report.confirmation.required))
        .status,
      1,
    );
    assert.deepEqual(snapshot(f.root), before);
  }
});

async function fixture(t: TestContext, nested = false, yaml = source) {
  const leaf = sourceFixture("", {
    "tracked.txt": "original",
    ".gitignore": "ignored.txt\n",
    ".gitattributes": "tracked.txt filter=hostile\n",
  });
  const outer = sourceFixture("", { "outer.txt": "outer" });
  t.after(() => {
    leaf.close();
    outer.close();
  });
  commit(leaf.root);
  commit(outer.root);
  if (nested) {
    addSubmodule(outer.root, "inner", leaf.root);
    commit(outer.root);
  }
  const f = await adoptionFixture(t, cli, yaml, {
    files: {
      "content.md": "Instructions",
      "discover.md": "Find instruction files.",
    },
  });
  addSubmodule(f.root, "vendor/protocol", nested ? outer.root : leaf.root);
  if (nested)
    git(
      f.root,
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "update",
      "--init",
      "--recursive",
    );
  commit(f.root);
  const path = nested ? "vendor/protocol/inner" : "vendor/protocol";
  return { ...f, path, child: join(f.root, path) };
}

test("clean initialized submodules permit unrelated adoption and remain unchanged", async (t) => {
  const child = sourceFixture("", { "tracked.txt": "original" });
  t.after(() => child.close());
  commit(child.root);
  const f = await adoptionFixture(t, cli, source, {
    files: { "content.md": "Instructions" },
  });
  for (const path of ["protocol", "other"])
    addSubmodule(f.root, path, child.root);
  commit(f.root);
  const before = snapshot(f.root);
  const inspection = f.inspect();
  assert.equal(
    inspection.start.eligible,
    true,
    JSON.stringify(inspection.start),
  );
  assert.deepEqual(snapshot(f.root), before);
  const submodules = ["protocol", "other"].map((path) =>
    snapshot(join(f.root, path)),
  );
  const modules = snapshot(join(f.root, ".git/modules"));
  const gitmodules = git(f.root, "show", "HEAD:.gitmodules");
  f.adopt();
  assert.deepEqual(
    ["protocol", "other"].map((path) => snapshot(join(f.root, path))),
    submodules,
  );
  assert.deepEqual(snapshot(join(f.root, ".git/modules")), modules);
  assert.equal(git(f.root, "show", "HEAD:.gitmodules"), gitmodules);
});

for (const nested of [false, true]) {
  test(`clean ${nested ? "nested" : "single"} submodules preserve ignored-file treatment`, async (t) => {
    const f = await fixture(t, nested);
    writeFileSync(join(f.child, "ignored.txt"), "ignored");
    const before = snapshot(f.root);
    assert.equal(f.inspect().start.eligible, true);
    assert.deepEqual(snapshot(f.root), before);
    const child = snapshot(f.child);
    const modules = snapshot(join(f.root, ".git/modules"));
    f.adopt();
    assert.deepEqual(snapshot(f.child), child);
    assert.deepEqual(snapshot(join(f.root, ".git/modules")), modules);
  });

  const scenarios: Record<string, (child: string, root: string) => void> = {
    "unstaged tracked changes": (child) =>
      writeFileSync(join(child, "tracked.txt"), "changed"),
    "staged tracked changes": (child) => {
      writeFileSync(join(child, "tracked.txt"), "staged");
      git(child, "add", "tracked.txt");
    },
    "untracked files": (child) =>
      writeFileSync(join(child, "untracked.txt"), "untracked"),
    "checkout mismatch": (child) => {
      writeFileSync(join(child, "tracked.txt"), "different commit");
      commit(child);
    },
    "assume-unchanged files": (child) => {
      git(child, "update-index", "--assume-unchanged", "tracked.txt");
      writeFileSync(join(child, "tracked.txt"), "hidden");
    },
    "skip-worktree files": (child) => {
      git(child, "update-index", "--skip-worktree", "tracked.txt");
      writeFileSync(join(child, "tracked.txt"), "hidden");
    },
    "deinitialized submodule": (child) => {
      // Deinitialization leaves the parent gitlink intact and an empty worktree.
      rmSync(child, { recursive: true });
      mkdirSync(child);
    },
    "unreadable index": (child) => {
      const index = resolve(
        child,
        git(child, "rev-parse", "--git-path", "index"),
      );
      // A directory cannot be read as an index, even by a privileged runner.
      rmSync(index);
      mkdirSync(index);
      const failed = spawnSync("git", ["-C", child, "ls-files", "--stage"]);
      assert.notEqual(
        failed.status,
        0,
        "Fixture must establish a real Git read failure",
      );
    },
    "invalid Git metadata": (child) =>
      writeFileSync(join(child, ".git"), "invalid gitfile\n"),
    "missing HEAD": (child) =>
      rmSync(resolve(child, git(child, "rev-parse", "--git-path", "HEAD"))),
    "invalid HEAD": (child) =>
      writeFileSync(
        resolve(child, git(child, "rev-parse", "--git-path", "HEAD")),
        "invalid HEAD\n",
      ),
    "missing worktree": (child) => rmSync(child, { recursive: true }),
    "symbolic worktree": (child, root) => {
      const moved = join(root, "elsewhere");
      renameSync(child, moved);
      symlinkSync(moved, child);
    },
    "symbolic worktree ancestor": (child, root) => {
      const ancestor = nested
        ? join(root, "vendor/protocol")
        : join(root, "vendor");
      const moved = join(root, "elsewhere");
      renameSync(ancestor, moved);
      symlinkSync(moved, ancestor);
    },
    "symbolic Git metadata": (child) => {
      const metadata = join(child, ".git");
      renameSync(metadata, join(child, "saved-gitfile"));
      symlinkSync("saved-gitfile", metadata);
    },
  };
  for (const [name, change] of Object.entries(scenarios)) {
    test(`${nested ? "nested" : "single"} submodule ${name} block inspection and start without mutation`, async (t) => {
      const f = await fixture(t, nested);
      // Neither parent nor child ignore-submodule configuration may hide dirt.
      git(f.root, "config", "submodule.vendor/protocol.ignore", "all");
      git(f.child, "config", "diff.ignoreSubmodules", "all");
      const eligible = f.inspect();
      assert.equal(eligible.start.eligible, true);
      change(f.child, f.root);
      const before = snapshot(f.root);
      const inspection = f.inspect();
      assert.equal(inspection.start.eligible, false);
      const blocker = inspection.start.blockers.find(
        (b) => b.code === "SUBMODULE_STATE",
      );
      assert.ok(blocker, JSON.stringify(inspection.start));
      assert.ok(
        blocker.path && f.path.startsWith(blocker.path),
        JSON.stringify(blocker),
      );
      if (name === "deinitialized submodule" || name === "missing worktree")
        assert.match(
          blocker.message,
          /git submodule update --init --recursive/,
        );
      const started = f.run(startArgs(eligible.identity));
      assert.equal(started.status, 1, started.stdout + started.stderr);
      assert.match(started.stdout, /STALE_INSPECTION|START_BLOCKED/);
      assert.deepEqual(snapshot(f.root), before);
      const adopted = f.run([
        "adopt",
        "https://github.com/alice/standards",
        "--standards-version",
        "v1.0.0",
        "--profile",
        "work",
        "--json",
      ]);
      assert.equal(adopted.status, 1, adopted.stdout + adopted.stderr);
      assert.match(adopted.stdout, /SUBMODULE_STATE/);
      assert.deepEqual(snapshot(f.root), before);
    });
  }
}
