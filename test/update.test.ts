import type {
  Diagnostic,
  ErrorReport,
  Inspection,
  PackageManifest,
  Run,
  State,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { inc } from "semver";
import { after, test } from "node:test";
import type { TestContext } from "node:test";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import {
  directoryFixture,
  installCli,
  installedTree,
  snapshot,
} from "./installed-cli.ts";
import {
  commit,
  git,
  inspectionArgs,
  manifest,
  operation,
  remoteFixture,
  startArgs,
  versionArgs,
} from "./remote-fixture.ts";
import { installCandidate, registryFixture } from "./registry-fixture.ts";
import {
  filesystemFault,
  kill,
  killAfterRename,
  killBeforeRename,
  killDuringRemoval,
} from "./adoption-faults.ts";
import { adoptionFixture } from "./adoption-fixture.ts";

const cli = installCli();
const candidateVersion = inc(cli.version, "minor")!;
after(() => cli.close());

const source = (
  version: string,
  declarations: string,
) => `format: repo-standards/v2
name: update-standards
description: Update fixture ${version}
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
${declarations}
profiles:
  work:
    description: Work
    declarations: {}
`;

test("a confirmed standards update advances only the standards pin, replaces whole owned skills, and removes retired and excluded content", async (t) => {
  const v1 = source(
    "v1",
    `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    review:
      kind: skill
      name: review
      source: review
    retired:
      kind: file
      target: RETIRED.md
      exact: retired.md
    excluded:
      kind: file
      target: EXCLUDED.md
      exact: excluded.md`,
  );
  const v2 = source(
    "v2",
    `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    review:
      kind: skill
      name: review
      source: review
    excluded:
      kind: file
      target: EXCLUDED.md
      exact: excluded.md`,
  ).replace(
    "    declarations: {}",
    "    declarations: {excluded: {exclude: true}}",
  );
  const f = await adoptionFixture(t, cli, v1, {
    files: {
      "agents.md": "Version one",
      "review/SKILL.md": "# Review v1",
      "review/obsolete.txt": "obsolete",
      "retired.md": "Keep retired content",
      "excluded.md": "Keep excluded content",
    },
  });
  const { remote, project, env } = f;
  f.adopt();
  const oldHead = git(project.root, "rev-parse", "HEAD");
  const runtimePaths = [
    ".repo-standards/runtime/package.json",
    ".repo-standards/runtime/package-lock.json",
    ".agents/skills/adopt-standards/SKILL.md",
  ];
  const originalRuntime = runtimePaths.map((path) =>
    readFileSync(join(project.root, path), "utf8"),
  );
  f.registry.close();

  rmSync(join(remote.source.root, "review/obsolete.txt"));
  const published = remote.addVersion("v1.1.0", v2, {
    "agents.md": "Version two",
    "review/SKILL.md": "# Review v2",
    "review/current.txt": "current",
  });
  const updateArgs = versionArgs("v1.1.0");
  const inspection = f.inspect(updateArgs);
  assert.deepEqual(inspection.update, ["standards"]);
  assert.equal(inspection.selection.cli.version, cli.version);
  assert.equal(inspection.selection.standards.commit, published.sha);
  assert.deepEqual(
    inspection.retired!.map((entry: { id: string }) => entry.id),
    ["excluded", "retired"],
  );
  assert.deepEqual(
    inspection.removed!.map(
      ({ id, target }: { id: string; target: string }) => ({ id, target }),
    ),
    [
      { id: "excluded", target: "EXCLUDED.md" },
      { id: "retired", target: "RETIRED.md" },
    ],
  );
  assert.deepEqual(inspection.discardedEdits, []);

  const result = cli.run(
    startArgs(inspection.identity, updateArgs),
    project.root,
    env,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as Run).outcome, "complete");
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Version two",
  );
  assert.equal(
    readFileSync(
      join(project.root, ".agents/skills/review/current.txt"),
      "utf8",
    ),
    "current",
  );
  assert.equal(
    existsSync(join(project.root, ".agents/skills/review/obsolete.txt")),
    false,
  );
  assert.equal(existsSync(join(project.root, "RETIRED.md")), false);
  assert.equal(existsSync(join(project.root, "EXCLUDED.md")), false);
  const selection = parse(
    readFileSync(join(project.root, ".repo-standards/selection.yaml"), "utf8"),
  ) as Inspection["selection"];
  assert.equal(selection.standards.version, "v1.1.0");
  assert.equal(selection.cli.version, cli.version);
  const state = JSON.parse(
    readFileSync(join(project.root, ".repo-standards/state.json"), "utf8"),
  ) as State;
  assert.equal(state.baselines["RETIRED.md"], undefined);
  assert.equal(state.baselines["EXCLUDED.md"], undefined);
  assert.deepEqual(
    runtimePaths.map((path) => readFileSync(join(project.root, path), "utf8")),
    originalRuntime,
  );
  assert.equal(
    existsSync(join(project.root, ".agents/skills/author-standards")),
    false,
  );
  assert.equal(git(project.root, "rev-parse", "HEAD"), oldHead);
  assert.notEqual(git(project.root, "status", "--porcelain=v1"), "");
});

test("an update whose source adds a skill links it as exact content", async (t) => {
  const instructions = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`;
  const f = await adoptionFixture(t, cli, source("v1", instructions), {
    files: { "agents.md": "Instructions" },
  });
  f.adopt();
  f.remote.addVersion(
    "v1.1.0",
    source(
      "v2",
      `${instructions}
    review:
      kind: skill
      name: review
      source: skills/review`,
    ),
    { "skills/review/SKILL.md": "Review" },
  );
  const args = versionArgs("v1.1.0");
  const inspection = f.inspect(args);
  assert.deepEqual(inspection.update, ["standards"]);
  assert.equal(inspection.updateClass, "exact");
  assert.deepEqual(inspection.contextualChanges, []);
  assert.deepEqual(
    inspection.systemSkills.map(({ action, link }) => ({ action, link })),
    [
      {
        action: "match",
        link: { target: ".claude/skills/adopt-standards", action: "match" },
      },
      {
        action: "match",
        link: { target: ".claude/skills/standards-updates", action: "match" },
      },
    ],
  );
  assert.deepEqual(
    inspection.exact.map(({ id, action, link }) => ({ id, action, link })),
    [
      { id: "instructions", action: "match", link: undefined },
      {
        id: "review",
        action: "create",
        link: { target: ".claude/skills/review", action: "create" },
      },
    ],
  );
  assert.deepEqual(inspection.start.blockers, []);
  assert.deepEqual(inspection.discardedEdits, []);
  const summary = f.run(
    args.map((argument) => (argument === "--json" ? "--summary" : argument)),
  );
  assert.equal(summary.status, 0, summary.stdout + summary.stderr);
  assert.match(summary.stdout, /^Exact update: /m);
  assert.match(
    summary.stdout,
    /^\| `review` \| `\.claude\/skills\/review` \| created \|$/m,
  );
  const started = f.json(startArgs(inspection.identity, args));
  assert.equal(
    started.result.status,
    0,
    started.result.stdout + started.result.stderr,
  );
  assert.equal(started.report.outcome, "complete");
  assert.equal(
    readlinkSync(join(f.root, ".claude/skills/review")),
    "../../.agents/skills/review",
  );
  const state = JSON.parse(
    readFileSync(join(f.root, ".repo-standards/state.json"), "utf8"),
  ) as State;
  assert.equal(
    state.links[".claude/skills/review"],
    "../../.agents/skills/review",
  );
  assert.deepEqual(
    git(
      f.root,
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ".agents",
      ".claude",
    )
      .split("\n")
      .sort(),
    ["?? .agents/skills/review/SKILL.md", "?? .claude/skills/review"],
  );
});

test("retiring a skill removes its link, and an update leaves the project its own skills", async (t) => {
  const review = `    review:
      kind: skill
      name: review
      source: skills/review`;
  const instructions = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`;
  const f = await adoptionFixture(
    t,
    cli,
    source("v1", `${review}\n${instructions}`),
    {
      files: { "skills/review/SKILL.md": "Review", "agents.md": "Agents" },
      project: {
        ".agents/skills/mine/SKILL.md": "Mine",
        ".claude/skills/notes.md": "Notes",
      },
    },
  );
  const { remote, project, env } = f;
  f.adopt();
  remote.addVersion("v2.0.0", source("v2", instructions));
  const args = versionArgs("v2.0.0");
  const inspection = f.inspect(args);
  assert.deepEqual(inspection.start.blockers, []);
  assert.deepEqual(
    inspection.removed!.map(
      ({
        id,
        target,
        files,
      }: {
        id: string;
        target: string;
        files: { path: string; after: unknown }[];
      }) => ({
        id,
        target,
        files: files.map(({ path, after }) => ({ path, after })),
      }),
    ),
    [
      {
        id: "review",
        target: ".agents/skills/review",
        files: [
          {
            path: ".agents/skills/review/SKILL.md",
            after: { type: "missing" },
          },
        ],
      },
      {
        id: "review",
        target: ".claude/skills/review",
        files: [{ path: ".claude/skills/review", after: { type: "missing" } }],
      },
    ],
  );
  assert.deepEqual(inspection.removed![1]!.files[0]!.before, {
    type: "symlink",
    target: "../../.agents/skills/review",
  });
  assert.deepEqual(inspection.discardedEdits, []);
  const summary = cli.run(
    args.filter((argument) => argument !== "--json").concat("--summary"),
    project.root,
    env,
  ).stdout;
  assert.match(
    summary,
    /^\| `review` \| `\.agents\/skills\/review\/SKILL\.md` \| deleted \|\n\| `review` \| `\.claude\/skills\/review` \| deleted \|$/m,
  );
  const started = cli.run(
    startArgs(inspection.identity, args),
    project.root,
    env,
  );
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.equal(existsSync(join(project.root, ".agents/skills/review")), false);
  assert.equal(
    lstatSync(join(project.root, ".claude/skills/review"), {
      throwIfNoEntry: false,
    }),
    undefined,
  );
  const state = JSON.parse(
    readFileSync(join(project.root, ".repo-standards/state.json"), "utf8"),
  ) as State;
  assert.deepEqual(Object.keys(state.links).sort(), [
    ".claude/skills/adopt-standards",
    ".claude/skills/standards-updates",
  ]);
  assert.ok(
    state.changeSet.some(
      ({ path }: { path: string }) => path === ".claude/skills/review",
    ),
  );
  assert.equal(
    lstatSync(join(project.root, ".claude/skills/mine"), {
      throwIfNoEntry: false,
    }),
    undefined,
  );
  assert.equal(
    git(
      project.root,
      "status",
      "--porcelain",
      "--",
      ".agents/skills/mine",
      ".claude/skills/notes.md",
    ),
    "",
  );
});

test("a skill link changed after confirmation makes start stale", async (t) => {
  const f = await adoptionFixture(
    t,
    cli,
    source(
      "v1",
      `    review:
      kind: skill
      name: review
      source: skills/review`,
    ),
    { files: { "skills/review/SKILL.md": "Review" } },
  );
  const { project, env } = f;
  f.adopt();
  const inspection = f.inspect(["inspect", "--json"]);
  assert.equal(inspection.exact[0]!.link!.action, "match");
  // A committed hand-made copy in the link's place is tracked and clean, so
  // only the identity can tell.
  unlinkSync(join(project.root, ".claude/skills/review"));
  mkdirSync(join(project.root, ".claude/skills/review"));
  writeFileSync(join(project.root, ".claude/skills/review/SKILL.md"), "Review");
  commit(project.root);
  const before = snapshot(project.root);
  const started = cli.run(
    ["start", "--identity", inspection.identity, "--json"],
    project.root,
    env,
  );
  assert.equal(started.status, 1, started.stdout + started.stderr);
  assert.equal(
    (JSON.parse(started.stdout) as ErrorReport).errors[0]!.code,
    "STALE_INSPECTION",
  );
  assert.deepEqual(snapshot(project.root), before);
  const renewed = f.inspect(["inspect", "--json"]);
  assert.deepEqual(renewed.exact[0]!.link, {
    target: ".claude/skills/review",
    action: "replace",
  });
  assert.deepEqual(renewed.discardedEdits, [".claude/skills/review"]);
});

test("update inspections match candidate-equal content and list each discarded edit, including a retired target they remove", async (t) => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const declarations = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    review:
      kind: skill
      name: review
      source: review`;
  const retired = `
    retired:
      kind: file
      target: RETIRED.md
      exact: retired.md
    legacy:
      kind: skill
      name: legacy
      source: legacy`;
  const v1Files = {
    "agents.md": "Version one",
    "review/SKILL.md": "# Review v1",
    "review/resource.txt": "Owned resource",
    "retired.md": "Retired content",
    "legacy/SKILL.md": "# Legacy",
  };
  const v2Files = {
    "agents.md": "Version two",
    "review/SKILL.md": "# Review v2",
  };
  const review = ".agents/skills/review";
  const system = ".agents/skills/adopt-standards";
  const untracked = (path: string) => ({ code: "UNTRACKED_REPLACEMENT", path });
  for (const { name, mutate, blockers = [], discarded, actions } of [
    {
      name: "an ignored retired exact file",
      mutate: (root: string) => {
        writeFileSync(join(root, ".gitignore"), "/RETIRED.md\n");
        git(root, "rm", "--cached", "--quiet", "RETIRED.md");
      },
      blockers: [untracked("RETIRED.md")],
      discarded: [],
    },
    // Each kind of edit to installed content is replaced and listed.
    {
      name: "an exact file with changed bytes",
      mutate: (root: string) =>
        writeFileSync(join(root, "AGENTS.md"), "Maintainer edit"),
      discarded: ["AGENTS.md"],
    },
    {
      name: "an exact file with changed executable state",
      mutate: (root: string) => chmodSync(join(root, "AGENTS.md"), 0o755),
      discarded: ["AGENTS.md"],
    },
    {
      name: "an added skill file",
      mutate: (root: string) =>
        writeFileSync(join(root, review, "added.txt"), "Maintainer resource"),
      discarded: [review],
    },
    {
      name: "a removed skill file",
      mutate: (root: string) => rmSync(join(root, review, "resource.txt")),
      discarded: [review],
    },
    {
      name: "a changed skill file",
      mutate: (root: string) =>
        writeFileSync(join(root, review, "resource.txt"), "Maintainer edit"),
      discarded: [review],
    },
    {
      name: "an edited system skill",
      mutate: (root: string) =>
        writeFileSync(join(root, system, "SKILL.md"), "Maintainer edit"),
      discarded: [system],
    },
    {
      name: "a skill link replaced by a copy",
      mutate: (root: string) => {
        unlinkSync(join(root, ".claude/skills/review"));
        writeFileSync(join(root, ".claude/skills/review"), "# Review v1");
      },
      discarded: [".claude/skills/review"],
    },
    // Content that already equals the candidate is matched, not listed.
    {
      name: "an exact file whose bytes equal the candidate but not the baseline",
      mutate: (root: string) =>
        writeFileSync(join(root, "AGENTS.md"), "Version two"),
      discarded: [],
      actions: { instructions: "match", review: "replace" },
    },
    {
      name: "a skill whose bytes equal the candidate but not the baseline",
      mutate: (root: string) =>
        writeFileSync(join(root, review, "SKILL.md"), "# Review v2"),
      discarded: [],
      actions: { instructions: "replace", review: "match" },
    },
  ])
    await t.test(name, async (st) => {
      const f = await adoptionFixture(
        st,
        cli,
        source("v1", declarations + retired),
        { files: v1Files, registry },
      );
      const { remote, project, env } = f;
      f.adopt();
      mutate(project.root);
      commit(project.root);
      remote.addVersion("v1.1.0", source("v2", declarations), v2Files);
      const updateArgs = versionArgs("v1.1.0");
      const inspection = f.inspect(updateArgs);
      assert.deepEqual(
        inspection.start.blockers.map(({ code, path }) => ({ code, path })),
        blockers,
      );
      assert.deepEqual(inspection.discardedEdits, discarded);
      assert.deepEqual(
        inspection.removed!.map(({ id, target }) => ({ id, target })),
        [
          { id: "legacy", target: ".agents/skills/legacy" },
          { id: "legacy", target: ".claude/skills/legacy" },
          { id: "retired", target: "RETIRED.md" },
        ],
      );
      assert.deepEqual(inspection.kept, []);
      if (actions)
        assert.deepEqual(
          Object.fromEntries(
            inspection.exact.map(({ id, action }) => [id, action]),
          ),
          actions,
        );
      // Only a discarded edit requires confirmation; removing the unedited
      // retired targets requires none.
      assert.deepEqual(inspection.confirmation, {
        required: discarded.length > 0,
        reasons: discarded.map((target) => ({
          change: "discarded-edit",
          target,
        })),
      });
      const started = cli.run(
        startArgs(inspection.identity, updateArgs, discarded.length > 0),
        project.root,
        env,
      );
      if (blockers.length) {
        assert.equal(started.status, 1, started.stdout + started.stderr);
        assert.equal(
          (JSON.parse(started.stdout) as ErrorReport).errors[0]!.code,
          "START_BLOCKED",
        );
        for (const { path } of blockers)
          assert.ok(existsSync(join(project.root, path)), path);
        return;
      }
      assert.equal(started.status, 0, started.stdout + started.stderr);
      assert.equal((JSON.parse(started.stdout) as Run).outcome, "complete");
      assert.equal(existsSync(join(project.root, "RETIRED.md")), false);
      assert.equal(
        existsSync(join(project.root, ".agents/skills/legacy")),
        false,
      );
      assert.equal(
        lstatSync(join(project.root, ".claude/skills/legacy"), {
          throwIfNoEntry: false,
        }),
        undefined,
      );
      assert.equal(
        readlinkSync(join(project.root, ".claude/skills/review")),
        "../../.agents/skills/review",
      );
      // Each target now holds exactly its candidate: bytes, modes, and inventory.
      assert.equal(
        readFileSync(join(project.root, "AGENTS.md"), "utf8"),
        "Version two",
      );
      assert.equal(lstatSync(join(project.root, "AGENTS.md")).mode & 0o111, 0);
      assert.deepEqual(
        installedTree(join(project.root, review)),
        installedTree(join(remote.source.root, "review")),
      );
      assert.equal(
        readFileSync(join(project.root, review, "SKILL.md"), "utf8"),
        "# Review v2",
      );
      assert.deepEqual(
        installedTree(join(project.root, system)),
        installedTree(
          join(
            cli.root,
            "node_modules/@lutzseverino/repo-standards/skills/adopt-standards",
          ),
        ),
      );
    });
});

test("update inspections report each declared target block before baseline-only targets, and kept targets, sorted by path", async (t) => {
  const instructions = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`;
  const f = await adoptionFixture(
    t,
    cli,
    source(
      "v1",
      `${instructions}
    alpha:
      kind: file
      target: Z-RETIRED.md
      exact: z.md
    beta:
      kind: file
      target: A-RETIRED.md
      exact: a.md
    delta:
      kind: file
      target: Y-KEPT.md
      exact: y.md
    gamma:
      kind: file
      target: B-KEPT.md
      exact: b.md`,
    ),
    {
      files: {
        "agents.md": "Version one",
        "z.md": "Retired Z",
        "a.md": "Retired A",
        "y.md": "Kept Y",
        "b.md": "Kept B",
      },
      project: { "README.md": "Project README" },
    },
  );
  const { remote, project } = f;
  f.adopt();
  rmSync(join(project.root, "AGENTS.md"));
  symlinkSync("README.md", join(project.root, "AGENTS.md"));
  // Unedited retired targets that Git no longer tracks block their removal;
  // edited ones stay.
  writeFileSync(
    join(project.root, ".gitignore"),
    "/Z-RETIRED.md\n/A-RETIRED.md\n",
  );
  git(
    project.root,
    "rm",
    "--cached",
    "--quiet",
    "Z-RETIRED.md",
    "A-RETIRED.md",
  );
  writeFileSync(join(project.root, "Y-KEPT.md"), "Maintainer edit");
  writeFileSync(join(project.root, "B-KEPT.md"), "Maintainer edit");
  commit(project.root);
  remote.addVersion("v1.1.0", source("v2", instructions), {
    "agents.md": "Version two",
  });
  const inspection = f.inspect(versionArgs("v1.1.0"));
  assert.deepEqual(
    inspection.start.blockers.map(({ code, path }) => ({ code, path })),
    [
      { code: "UNSAFE_TARGET", path: "AGENTS.md" },
      { code: "UNTRACKED_REPLACEMENT", path: "A-RETIRED.md" },
      { code: "UNTRACKED_REPLACEMENT", path: "Z-RETIRED.md" },
    ],
  );
  assert.deepEqual(inspection.discardedEdits, ["AGENTS.md"]);
  assert.deepEqual(
    inspection.removed!.map(({ target }: { target: string }) => target),
    ["A-RETIRED.md", "Z-RETIRED.md"],
  );
  assert.deepEqual(inspection.kept, [
    { id: "gamma", target: "B-KEPT.md" },
    { id: "delta", target: "Y-KEPT.md" },
  ]);
});

// Declarations that leave the selection: an edited and an unedited exact file,
// and an edited and an unedited skill.
const leaving = {
  retired: { kind: "file", target: "RETIRED.md", exact: "retired.md" },
  unedited: { kind: "file", target: "UNEDITED.md", exact: "unedited.md" },
  legacy: { kind: "skill", name: "legacy", source: "legacy" },
  plain: { kind: "skill", name: "plain", source: "plain" },
};
const leavingFiles = {
  "agents.md": "Instructions",
  "retired.md": "Retired",
  "unedited.md": "Unedited",
  "legacy/SKILL.md": "# Legacy",
  "legacy/notes.md": "Legacy notes",
  "plain/SKILL.md": "# Plain",
};

test("an update keeps each edited target that leaves the selection as project content that later runs neither track nor remove", async (t) => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const instructions = {
    kind: "file",
    target: "AGENTS.md",
    exact: "agents.md",
  };
  // Once a target leaves the selection, every way of leaving it takes the same
  // path, so only a dropped declaration runs the update and a later run.
  for (const { name, initial, update, complete = false } of [
    {
      name: "a dropped declaration",
      initial: manifest({ instructions, ...leaving }),
      complete: true,
      update: (remote: ReturnType<typeof remoteFixture>) => {
        remote.addVersion("v1.1.0", manifest({ instructions }));
        return { args: versionArgs("v1.1.0"), env: remote.env };
      },
    },
    {
      name: "a profile exclusion",
      initial: manifest({ instructions, ...leaving }),
      update: (remote: ReturnType<typeof remoteFixture>) => {
        remote.addVersion(
          "v1.1.0",
          manifest(
            { instructions, ...leaving },
            {
              work: Object.fromEntries(
                Object.keys(leaving).map((id) => [id, { exclude: true }]),
              ),
            },
          ),
        );
        return { args: versionArgs("v1.1.0"), env: remote.env };
      },
    },
    {
      name: "a profile change",
      initial: manifest({ instructions }, { work: leaving, lean: {} }),
      update: (remote: ReturnType<typeof remoteFixture>) => ({
        args: inspectionArgs.map((argument) =>
          argument === "work" ? "lean" : argument,
        ),
        env: remote.env,
      }),
    },
    {
      name: "a source change",
      initial: manifest({ instructions, ...leaving }),
      update: () => {
        const other = remoteFixture(
          manifest({ instructions }),
          { "agents.md": "Other instructions" },
          [],
          "bob/standards",
        );
        t.after(() => other.close());
        return {
          args: inspectionArgs.map((argument) =>
            argument === "https://github.com/alice/standards"
              ? "https://github.com/bob/standards"
              : argument,
          ),
          env: other.env,
        };
      },
    },
  ])
    await t.test(name, async (st) => {
      const f = await adoptionFixture(st, cli, initial, {
        files: leavingFiles,
        registry,
      });
      const { remote, project } = f;
      const run = (args: string[], env: NodeJS.ProcessEnv) =>
        f.run(args, { ...env, ...registry.env });
      const { inspection: adopted } = f.adopt();
      assert.equal(adopted.kept, undefined);
      writeFileSync(join(project.root, "RETIRED.md"), "Maintainer edit");
      writeFileSync(
        join(project.root, ".agents/skills/legacy/notes.md"),
        "Maintainer notes",
      );
      commit(project.root);

      const { args, env } = update(remote);
      const result = run(args, env);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const inspection = JSON.parse(result.stdout) as Inspection;
      assert.deepEqual(inspection.start.blockers, []);
      assert.deepEqual(
        inspection.retired!.map(({ id }) => id),
        ["legacy", "plain", "retired", "unedited"],
      );
      assert.deepEqual(
        inspection.removed!.map(({ id, target }) => ({ id, target })),
        [
          { id: "plain", target: ".agents/skills/plain" },
          { id: "plain", target: ".claude/skills/plain" },
          { id: "unedited", target: "UNEDITED.md" },
        ],
      );
      assert.deepEqual(inspection.kept, [
        { id: "legacy", target: ".agents/skills/legacy" },
        { id: "legacy", target: ".claude/skills/legacy" },
        { id: "retired", target: "RETIRED.md" },
      ]);
      assert.deepEqual(inspection.discardedEdits, []);
      if (!complete) return;

      const started = run(startArgs(inspection.identity, args), env);
      assert.equal(started.status, 0, started.stdout + started.stderr);
      assert.equal((JSON.parse(started.stdout) as Run).outcome, "complete");
      assert.equal(
        readFileSync(join(project.root, "RETIRED.md"), "utf8"),
        "Maintainer edit",
      );
      assert.deepEqual(
        installedTree(join(project.root, ".agents/skills/legacy")).map(
          ([path, bytes]) => [path, Buffer.from(bytes, "base64").toString()],
        ),
        [
          ["SKILL.md", "# Legacy"],
          ["notes.md", "Maintainer notes"],
        ],
      );
      assert.equal(
        readlinkSync(join(project.root, ".claude/skills/legacy")),
        "../../.agents/skills/legacy",
      );
      assert.equal(existsSync(join(project.root, "UNEDITED.md")), false);
      assert.equal(
        existsSync(join(project.root, ".agents/skills/plain")),
        false,
      );
      assert.equal(
        lstatSync(join(project.root, ".claude/skills/plain"), {
          throwIfNoEntry: false,
        }),
        undefined,
      );
      const keptPaths = [
        "RETIRED.md",
        ".agents/skills/legacy",
        ".claude/skills/legacy",
      ];
      assert.equal(
        git(project.root, "status", "--porcelain", "--", ...keptPaths),
        "",
      );
      const state = JSON.parse(
        readFileSync(join(project.root, ".repo-standards/state.json"), "utf8"),
      ) as State;
      assert.deepEqual(
        Object.keys(state.baselines).filter((path) =>
          keptPaths.some(
            (kept) => path === kept || path.startsWith(kept + "/"),
          ),
        ),
        [],
      );
      assert.equal(state.skills[".agents/skills/legacy"], undefined);
      assert.equal(state.links[".claude/skills/legacy"], undefined);
      assert.deepEqual(
        state.changeSet.filter(({ path }) =>
          keptPaths.some(
            (kept) => path === kept || path.startsWith(kept + "/"),
          ),
        ),
        [],
      );
      commit(project.root);

      // A later run neither lists nor removes the project's content, even edited again.
      writeFileSync(join(project.root, "RETIRED.md"), "Later edit");
      rmSync(join(project.root, ".agents/skills/legacy/SKILL.md"));
      commit(project.root);
      const later = JSON.parse(
        run(["inspect", "--json"], env).stdout,
      ) as Inspection;
      assert.deepEqual(later.start.blockers, []);
      assert.deepEqual(later.removed, []);
      assert.deepEqual(later.kept, []);
      assert.deepEqual(later.discardedEdits, []);
      const again = run(["start", "--identity", later.identity, "--json"], env);
      assert.equal(
        (JSON.parse(again.stdout) as Run).outcome,
        "complete",
        again.stdout + again.stderr,
      );
      assert.equal(
        readFileSync(join(project.root, "RETIRED.md"), "utf8"),
        "Later edit",
      );
      assert.equal(
        readFileSync(
          join(project.root, ".agents/skills/legacy/notes.md"),
          "utf8",
        ),
        "Maintainer notes",
      );
      assert.equal(
        readlinkSync(join(project.root, ".claude/skills/legacy")),
        "../../.agents/skills/legacy",
      );
    });
});

test("an edited skill that leaves the selection is judged whole and keeps its link", async (t) => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const skill = ".agents/skills/legacy";
  const link = ".claude/skills/legacy";
  const copy = (root: string) => {
    unlinkSync(join(root, link));
    writeFileSync(join(root, link), "# Legacy");
  };
  const ignore = (root: string) => {
    writeFileSync(join(root, ".gitignore"), `/${skill}/local.md\n`);
    writeFileSync(join(root, skill, "local.md"), "Ignored notes");
  };
  for (const { name, mutate, kept, removed, blockers = [] } of [
    // The run never removes the edited skill, so ignored content inside it doesn't block.
    {
      name: "an edited skill with an ignored file",
      mutate: (root: string) => {
        ignore(root);
        writeFileSync(join(root, skill, "notes.md"), "Edited");
      },
      kept: [skill, link],
      removed: [],
    },
    // Only tracked content is an edit: ignored content alone leaves the skill to removal, which it blocks.
    {
      name: "an unedited skill with an ignored file",
      mutate: ignore,
      kept: [],
      removed: [skill, link],
      blockers: [{ code: "UNTRACKED_REPLACEMENT", path: `${skill}/local.md` }],
    },
    {
      name: "an edited skill whose link was removed",
      mutate: (root: string) => {
        writeFileSync(join(root, skill, "notes.md"), "Edited");
        unlinkSync(join(root, link));
      },
      kept: [skill],
      removed: [],
    },
    // A safe link follows its kept skill even when Git no longer tracks it.
    {
      name: "an edited skill whose link is untracked",
      mutate: (root: string) => {
        writeFileSync(join(root, skill, "notes.md"), "Edited");
        writeFileSync(join(root, ".gitignore"), `/${link}\n`);
        git(root, "rm", "--cached", "--quiet", link);
      },
      kept: [skill, link],
      removed: [],
    },
    {
      name: "an edited skill whose link was replaced by a copy",
      mutate: (root: string) => {
        writeFileSync(join(root, skill, "notes.md"), "Edited");
        copy(root);
      },
      kept: [skill, link],
      removed: [],
    },
    // An unedited skill goes; a copy in its link's place is the project's edit and stays.
    {
      name: "an unedited skill whose link was replaced by a copy",
      mutate: copy,
      kept: [link],
      removed: [skill],
    },
    {
      name: "an unedited skill whose link was removed",
      mutate: (root: string) => unlinkSync(join(root, link)),
      kept: [],
      removed: [skill],
    },
    // Unsafe content is never kept: its removal blocks.
    {
      name: "an edited skill whose link points elsewhere",
      mutate: (root: string) => {
        writeFileSync(join(root, skill, "notes.md"), "Edited");
        unlinkSync(join(root, link));
        symlinkSync("../../.agents/skills/other", join(root, link));
      },
      kept: [skill],
      removed: [link],
      blockers: [{ code: "UNSAFE_TARGET", path: link }],
    },
  ])
    await t.test(name, async (st) => {
      const f = await adoptionFixture(
        st,
        cli,
        manifest({ legacy: leaving.legacy }),
        { files: leavingFiles, registry },
      );
      const { remote, project, env } = f;
      f.adopt();
      mutate(project.root);
      commit(project.root);
      const before = existsSync(join(project.root, skill))
        ? installedTree(join(project.root, skill))
        : undefined;
      const linkContent = () => {
        const stat = lstatSync(join(project.root, link), {
          throwIfNoEntry: false,
        });
        return stat?.isSymbolicLink()
          ? `link ${readlinkSync(join(project.root, link))}`
          : stat
            ? readFileSync(join(project.root, link), "utf8")
            : undefined;
      };
      const linkBefore = linkContent();
      remote.addVersion("v1.1.0", manifest({}));
      const args = versionArgs("v1.1.0");
      const inspection = f.inspect(args);
      assert.deepEqual(
        inspection.start.blockers.map(({ code, path }) => ({ code, path })),
        blockers,
      );
      assert.deepEqual(
        inspection.kept!.map(({ target }) => target),
        kept,
      );
      assert.deepEqual(
        inspection.removed!.map(({ target }) => target),
        removed,
      );
      const started = cli.run(
        startArgs(inspection.identity, args),
        project.root,
        env,
      );
      if (blockers.length) {
        assert.equal(
          (JSON.parse(started.stdout) as ErrorReport).errors[0]!.code,
          "START_BLOCKED",
          started.stdout + started.stderr,
        );
        return;
      }
      assert.deepEqual(inspection.discardedEdits, []);
      assert.equal(
        (JSON.parse(started.stdout) as Run).outcome,
        "complete",
        started.stdout + started.stderr,
      );
      if (kept.includes(skill))
        assert.deepEqual(installedTree(join(project.root, skill)), before);
      else assert.equal(existsSync(join(project.root, skill)), false);
      assert.equal(linkContent(), kept.includes(link) ? linkBefore : undefined);
      const state = JSON.parse(
        readFileSync(join(project.root, ".repo-standards/state.json"), "utf8"),
      ) as State;
      assert.equal(state.skills[skill], undefined);
      assert.equal(state.links[link], undefined);
    });
});

test("an update keeps a retired installed target that lies within contextual scope", async (t) => {
  const v1 = source(
    "v1",
    `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    policy:
      kind: file
      target: docs/policy.md
      exact: policy.md`,
  );
  const v2 = source(
    "v2",
    `    instructions:
      kind: file
      target: AGENTS.md
      guidance: agents-guide.md
    docs:
      kind: repository
      guidance: docs-guide.md
      targets: {paths: [], directories: [docs]}`,
  );
  const f = await adoptionFixture(t, cli, v1, {
    files: { "agents.md": "Pinned instructions", "policy.md": "Policy" },
  });
  const { remote, project, env } = f;
  f.adopt();
  writeFileSync(join(project.root, "docs/policy.md"), "Maintainer policy");
  commit(project.root);
  remote.addVersion("v1.1.0", v2, {
    "agents-guide.md": "Keep the instructions current.",
    "docs-guide.md": "Keep the documentation current.",
  });
  const updateArgs = versionArgs("v1.1.0");
  const result = cli.run(updateArgs, project.root, env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const inspection = JSON.parse(result.stdout) as Inspection;
  assert.deepEqual(
    inspection.retired!.map((entry: { id: string }) => entry.id),
    ["policy"],
  );
  assert.deepEqual(inspection.removed, []);
  assert.deepEqual(inspection.discardedEdits, []);
  assert.deepEqual(inspection.start.blockers, []);
  const started = cli.run(
    startArgs(inspection.identity, updateArgs),
    project.root,
    env,
  );
  assert.equal(
    (JSON.parse(started.stdout) as Run).phase,
    "contextual",
    started.stdout + started.stderr,
  );
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Pinned instructions",
  );
  assert.equal(
    readFileSync(join(project.root, "docs/policy.md"), "utf8"),
    "Maintainer policy",
  );
});

test("an update leaves a retired installed target inside a still-installed skill to that skill", async (t) => {
  const v1 = source(
    "v1",
    `    instructions:
      kind: file
      target: .agents/skills/review/SKILL.md
      exact: review.md`,
  );
  const v2 = source(
    "v2",
    `    review:
      kind: skill
      name: review
      source: review`,
  );
  const f = await adoptionFixture(t, cli, v1, {
    files: { "review.md": "# Review v1" },
  });
  const { remote, project, env } = f;
  f.adopt();
  remote.addVersion("v1.1.0", v2, {
    "review/SKILL.md": "# Review v2",
    "review/notes.md": "Notes",
  });
  const updateArgs = versionArgs("v1.1.0");
  const inspection = JSON.parse(
    cli.run(updateArgs, project.root, env).stdout,
  ) as Inspection;
  assert.deepEqual(
    inspection.retired!.map((entry: { id: string }) => entry.id),
    ["instructions"],
  );
  assert.deepEqual(inspection.removed, []);
  assert.deepEqual(inspection.start.blockers, []);
  assert.equal(inspection.exact[0]!.action, "replace");
  // The skill has no installed baseline of its own, so replacing the
  // directory discards content that is not its baseline.
  assert.deepEqual(inspection.discardedEdits, [".agents/skills/review"]);
  const result = cli.run(
    startArgs(inspection.identity, updateArgs, true),
    project.root,
    env,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as Run).outcome, "complete");
  assert.deepEqual(
    installedTree(join(project.root, ".agents/skills/review")),
    installedTree(join(remote.source.root, "review")),
  );
});

test("an update removes the link path of a kept skill when it contains a newly installed target, and then installs it", async (t) => {
  const f = await adoptionFixture(
    t,
    cli,
    manifest({ legacy: leaving.legacy }),
    { files: leavingFiles },
  );
  const { remote, project, env } = f;
  f.adopt();
  writeFileSync(
    join(project.root, ".agents/skills/legacy/notes.md"),
    "Maintainer notes",
  );
  unlinkSync(join(project.root, ".claude/skills/legacy"));
  mkdirSync(join(project.root, ".claude/skills/legacy"));
  writeFileSync(join(project.root, ".claude/skills/legacy/old.md"), "Old");
  commit(project.root);
  remote.addVersion(
    "v1.1.0",
    manifest({
      guide: {
        kind: "file",
        target: ".claude/skills/legacy/new.md",
        exact: "new.md",
      },
    }),
    { "new.md": "New" },
  );
  const args = versionArgs("v1.1.0");
  const inspection = JSON.parse(
    cli.run(args, project.root, env).stdout,
  ) as Inspection;
  assert.deepEqual(inspection.start.blockers, []);
  assert.deepEqual(
    inspection.kept!.map(({ target }: { target: string }) => target),
    [".agents/skills/legacy"],
  );
  assert.deepEqual(
    inspection.removed!.map(({ target }: { target: string }) => target),
    [".claude/skills/legacy"],
  );
  assert.deepEqual(inspection.discardedEdits, [".claude/skills/legacy"]);
  const started = cli.run(
    startArgs(inspection.identity, args, true),
    project.root,
    env,
  );
  assert.equal(
    (JSON.parse(started.stdout) as Run).outcome,
    "complete",
    started.stdout + started.stderr,
  );
  assert.deepEqual(installedTree(join(project.root, ".claude/skills/legacy")), [
    ["new.md", Buffer.from("New").toString("base64"), false],
  ]);
  assert.equal(
    readFileSync(join(project.root, ".agents/skills/legacy/notes.md"), "utf8"),
    "Maintainer notes",
  );
});

test("an update removes a retired target beside contextual scope and one that contains a newly installed target", async (t) => {
  const v1 = source(
    "v1",
    `    old-docs:
      kind: file
      target: docs-old.md
      exact: old.md
    legacy:
      kind: skill
      name: legacy
      source: legacy`,
  );
  const v2 = source(
    "v2",
    `    docs:
      kind: repository
      guidance: docs-guide.md
      targets: {paths: [], directories: [docs]}
    readme:
      kind: file
      target: .agents/skills/legacy/README.md
      exact: readme.md`,
  );
  const f = await adoptionFixture(t, cli, v1, {
    files: { "old.md": "Old docs", "legacy/SKILL.md": "# Legacy" },
    project: { "docs/guide.md": "Guide" },
  });
  const { remote, project, env } = f;
  f.adopt();
  remote.addVersion("v1.1.0", v2, {
    "docs-guide.md": "Keep the documentation current.",
    "readme.md": "Read me",
  });
  const updateArgs = versionArgs("v1.1.0");
  const inspection = JSON.parse(
    cli.run(updateArgs, project.root, env).stdout,
  ) as Inspection;
  // The retired skill's link goes with it: a file installed into its old
  // directory is no skill to link.
  assert.deepEqual(
    inspection.removed!.map(({ target }: { target: string }) => target),
    [".agents/skills/legacy", ".claude/skills/legacy", "docs-old.md"],
  );
  assert.deepEqual(inspection.discardedEdits, []);
  assert.deepEqual(inspection.start.blockers, []);
  const started = cli.run(
    startArgs(inspection.identity, updateArgs),
    project.root,
    env,
  );
  assert.equal(
    (JSON.parse(started.stdout) as Run).phase,
    "contextual",
    started.stdout + started.stderr,
  );
  assert.equal(existsSync(join(project.root, "docs-old.md")), false);
  assert.equal(
    lstatSync(join(project.root, ".claude/skills/legacy"), {
      throwIfNoEntry: false,
    }),
    undefined,
  );
  assert.deepEqual(installedTree(join(project.root, ".agents/skills/legacy")), [
    ["README.md", Buffer.from("Read me").toString("base64"), false],
  ]);
  assert.equal(
    readFileSync(join(project.root, "docs/guide.md"), "utf8"),
    "Guide",
  );
});

test("a candidate CLI updates only the exact runtime pin from retained standards whose range excludes it and restores without the source", async (t) => {
  // The retained manifest's range excludes the candidate, which gates only the
  // selection of a standards version from its source.
  const f = await adoptionFixture(
    t,
    cli,
    source(
      "v1",
      `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`,
    ).replace(">=1.0.0", `>=1.0.0 <${candidateVersion}`),
    {
      files: { "agents.md": "Pinned standards" },
      versions: [cli.version, candidateVersion],
    },
  );
  const { remote, project, env } = f;
  const checkout = directoryFixture("repo-standards-checkout-");
  t.after(() => checkout.close());
  f.adopt();
  const originalSelection = (
    JSON.parse(f.run(["status", "--json"]).stdout) as Status
  ).selection;
  const candidate = installCandidate(candidateVersion, env);
  t.after(() => candidate.close());
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();

  const inspectionResult = candidate.run(["inspect", "--json"], project.root);
  assert.equal(
    inspectionResult.status,
    0,
    inspectionResult.stdout + inspectionResult.stderr,
  );
  const inspection = JSON.parse(inspectionResult.stdout) as Inspection;
  assert.deepEqual(inspection.update, ["cli"]);
  assert.equal(inspection.retained, true);
  assert.equal(
    inspection.source!.requires["repo-standards"],
    `>=1.0.0 <${candidateVersion}`,
  );
  assert.equal(
    inspection.start.eligible,
    true,
    JSON.stringify(inspection.start.blockers),
  );
  assert.equal(inspection.selection.cli.version, candidateVersion);
  assert.deepEqual(
    inspection.selection.standards,
    originalSelection!.standards,
  );
  assert.equal(inspection.selection.profile, originalSelection!.profile);
  const oldHead = git(project.root, "rev-parse", "HEAD");
  const result = candidate.run(
    ["start", "--identity", inspection.identity, "--json"],
    project.root,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as Run).outcome, "complete");
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Pinned standards",
  );
  assert.equal(
    (
      JSON.parse(
        readFileSync(
          join(project.root, ".repo-standards/runtime/package.json"),
          "utf8",
        ),
      ) as PackageManifest
    ).dependencies["@lutzseverino/repo-standards"],
    candidateVersion,
  );
  assert.ok(
    readFileSync(
      join(project.root, ".agents/skills/adopt-standards/SKILL.md"),
      "utf8",
    ).includes(`Fixture CLI ${candidateVersion}.`),
  );
  assert.equal(
    existsSync(join(project.root, ".agents/skills/author-standards")),
    false,
  );
  assert.equal(git(project.root, "rev-parse", "HEAD"), oldHead);
  const updated = JSON.parse(
    candidate.run(["status", "--json"], project.root).stdout,
  ) as Status;
  assert.equal(updated.selection!.cli.version, candidateVersion);
  assert.deepEqual(updated.selection!.standards, originalSelection!.standards);
  commit(project.root);

  rmSync(checkout.root, { recursive: true });
  execFileSync("git", ["clone", "--quiet", project.root, checkout.root]);
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
    { cwd: checkout.root, env, stdio: "pipe" },
  );
  const restored = join(
    checkout.root,
    ".repo-standards/runtime/node_modules/.bin/repo-standards",
  );
  assert.equal(
    execFileSync(restored, ["--version"], {
      cwd: checkout.root,
      encoding: "utf8",
    }).trim(),
    candidateVersion,
  );
  assert.ok(
    readFileSync(
      join(checkout.root, ".agents/skills/adopt-standards/SKILL.md"),
      "utf8",
    ).includes(`Fixture CLI ${candidateVersion}.`),
  );
  const status = JSON.parse(
    execFileSync(restored, ["status", "--json"], {
      cwd: checkout.root,
      env,
      encoding: "utf8",
    }),
  ) as Status;
  assert.equal(status.selection!.cli.version, candidateVersion);
  assert.deepEqual(status.selection!.standards, originalSelection!.standards);
});

test("an update failure preserves actual work and the previous last-complete evidence", async (t) => {
  const v1 = source(
    "v1",
    `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`,
  );
  const v2 = source(
    "v2",
    `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
      checks:
        - id: verify
          run: {executable: ${JSON.stringify(process.execPath)}, script: check.mjs, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=24 <25"}
          timeout-seconds: 5`,
  );
  const f = await adoptionFixture(t, cli, v1, {
    files: { "agents.md": "Version one" },
  });
  const { remote, project, env } = f;
  const { run: initial } = f.adopt();
  remote.addVersion("v1.1.0", v2, {
    "agents.md": "Version two",
    "check.mjs": `console.log(JSON.stringify({format:'repo-standards/result/v2',status:'failed',message:'Not ready'}));`,
  });
  const updateArgs = versionArgs("v1.1.0");
  const inspection = f.inspect(updateArgs);
  const result = cli.run(
    startArgs(inspection.identity, updateArgs),
    project.root,
    env,
  );
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout) as Run;
  assert.equal(report.outcome, "incomplete");
  assert.match(report.reason, /CHECKS_FAILED/);
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Version two",
  );
  assert.ok(report.changes.includes("AGENTS.md"));
  const state = JSON.parse(
    readFileSync(join(project.root, ".repo-standards/state.json"), "utf8"),
  ) as State;
  assert.equal(state.lastComplete.run, initial.id);
  const status = JSON.parse(
    cli.run(["status", "--json"], project.root, env).stdout,
  ) as Status;
  assert.equal(status.active!.id, report.id);
  assert.equal(status.lastComplete.run, initial.id);
  assert.equal(status.selection!.standards.version, "v1.1.0");
  const abandoned = cli.run(["abandon", "--json"], project.root, env);
  assert.equal((JSON.parse(abandoned.stdout) as Run).abandoned, true);
  const afterAbandon = cli.run(["status", "--json"], project.root, env);
  assert.equal(
    afterAbandon.status,
    0,
    afterAbandon.stdout + afterAbandon.stderr,
  );
  const history = JSON.parse(afterAbandon.stdout) as Status;
  assert.equal(history.active, null);
  assert.equal(history.lastComplete.run, initial.id);
  assert.equal(history.abandoned[0]!.id, report.id);
  assert.equal(history.abandoned[0]!.outcome, "incomplete");
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Version two",
  );
});

test("an inspection of the unchanged selection starts a run that re-applies it from retained inputs", async (t) => {
  const f = await adoptionFixture(
    t,
    cli,
    source(
      "v1",
      `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
      checks:
        - id: verify
          run: {executable: ${JSON.stringify(process.execPath)}, script: check.mjs, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=24 <25"}
          timeout-seconds: 5`,
    ),
    {
      files: {
        "agents.md": "Pinned standards",
        "check.mjs": `console.log(JSON.stringify({format:'repo-standards/result/v2',status:'passed',message:'Ready'}));`,
      },
    },
  );
  const { remote, project, env } = f;
  f.adopt();
  const previous = JSON.parse(
    cli.run(["status", "--json"], project.root, env).stdout,
  ) as Status;
  const runtimePaths = [
    ".repo-standards/runtime/package.json",
    ".repo-standards/runtime/package-lock.json",
    ".agents/skills/adopt-standards/SKILL.md",
  ];
  const runtime = runtimePaths.map((path) =>
    readFileSync(join(project.root, path), "utf8"),
  );
  const head = git(project.root, "rev-parse", "HEAD");
  // Neither the source nor the npm registry is reachable: an unchanged
  // selection re-applies retained inputs and keeps the installed runtime.
  f.registry.close();
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();

  const inspection = f.inspect(["inspect", "--json"]);
  assert.deepEqual(inspection.update, []);
  assert.deepEqual(inspection.previousSelection, previous.selection);
  assert.deepEqual(inspection.selection, previous.selection);
  assert.deepEqual(inspection.retired, []);
  assert.deepEqual(inspection.start.blockers, []);

  const result = cli.run(
    ["start", "--identity", inspection.identity, "--json"],
    project.root,
    env,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const completed = JSON.parse(result.stdout) as Run;
  assert.equal(completed.outcome, "complete");
  assert.equal(
    completed.previousComplete!.lastComplete.run,
    previous.lastComplete.run,
  );
  assert.deepEqual(
    completed.operations.map((entry) => [
      entry.operation.id,
      entry.result!.status,
    ]),
    [["verify", "passed"]],
  );
  const current = JSON.parse(
    cli.run(["status", "--json"], project.root, env).stdout,
  ) as Status;
  assert.equal(current.lastComplete.run, completed.id);
  assert.deepEqual(current.selection, previous.selection);
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Pinned standards",
  );
  assert.deepEqual(
    runtimePaths.map((path) => readFileSync(join(project.root, path), "utf8")),
    runtime,
  );
  assert.equal(git(project.root, "rev-parse", "HEAD"), head);
});

test("a coordinated update changes the CLI and standards pins in one run when the new standards version requires the candidate", async (t) => {
  const declarations = `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    review:
      kind: skill
      name: review
      source: review`;
  const f = await adoptionFixture(t, cli, source("v1", declarations), {
    files: { "agents.md": "Version one", "review/SKILL.md": "# Review v1" },
    versions: [cli.version, candidateVersion],
  });
  const { remote, project, env } = f;
  f.adopt();
  const previous = JSON.parse(
    cli.run(["status", "--json"], project.root, env).stdout,
  ) as Status;
  const head = git(project.root, "rev-parse", "HEAD");
  remote.addVersion(
    "v1.1.0",
    source("v2", declarations).replace(">=1.0.0", `>=${candidateVersion}`),
    { "agents.md": "Version two", "review/SKILL.md": "# Review v2" },
  );
  const updateArgs = versionArgs("v1.1.0");

  // The author's range still gates selecting that version from its source.
  const pinned = cli.run(updateArgs, project.root, env);
  assert.equal(pinned.status, 1, pinned.stdout + pinned.stderr);
  const error = (JSON.parse(pinned.stdout) as ErrorReport).errors[0];
  assert.equal(error!.code, "INVALID_STANDARDS");
  // The diagnostic recommends an open-ended minimum such as >=1.3.0.
  const incompatible = (error!.details as Diagnostic[]).find(
    (detail: { code: string }) => detail.code === "INCOMPATIBLE_CLI",
  );
  assert.ok(incompatible!.message.includes(">=1.3.0"), incompatible!.message);
  assert.equal(git(project.root, "status", "--porcelain=v1"), "");

  const candidate = installCandidate(candidateVersion, env);
  t.after(() => candidate.close());
  const runCandidate = (args: string[]) => candidate.run(args, project.root);
  const inspectionResult = runCandidate(updateArgs);
  assert.equal(
    inspectionResult.status,
    0,
    inspectionResult.stdout + inspectionResult.stderr,
  );
  const inspection = JSON.parse(inspectionResult.stdout) as Inspection;
  assert.deepEqual(inspection.update, ["cli", "standards"]);
  assert.deepEqual(inspection.previousSelection, previous.selection);
  assert.equal(inspection.selection.cli.version, candidateVersion);
  assert.equal(inspection.selection.standards.version, "v1.1.0");
  assert.equal(
    inspection.start.eligible,
    true,
    JSON.stringify(inspection.start.blockers),
  );

  const result = runCandidate(startArgs(inspection.identity, updateArgs));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as Run).outcome, "complete");
  const selection = parse(
    readFileSync(join(project.root, ".repo-standards/selection.yaml"), "utf8"),
  ) as Inspection["selection"];
  assert.equal(selection.cli.version, candidateVersion);
  assert.equal(selection.standards.version, "v1.1.0");
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Version two",
  );
  assert.equal(
    readFileSync(join(project.root, ".agents/skills/review/SKILL.md"), "utf8"),
    "# Review v2",
  );
  assert.equal(
    (
      JSON.parse(
        readFileSync(
          join(project.root, ".repo-standards/runtime/package.json"),
          "utf8",
        ),
      ) as PackageManifest
    ).dependencies["@lutzseverino/repo-standards"],
    candidateVersion,
  );
  assert.ok(
    readFileSync(
      join(project.root, ".agents/skills/adopt-standards/SKILL.md"),
      "utf8",
    ).includes(`Fixture CLI ${candidateVersion}.`),
  );
  assert.equal(
    (JSON.parse(runCandidate(["status", "--json"]).stdout) as Status)
      .lastComplete.run,
    (JSON.parse(result.stdout) as Run).id,
  );
  assert.equal(git(project.root, "rev-parse", "HEAD"), head);
});

test("source and profile switches are updates that remove the installed content of retired declarations", async (t) => {
  const alice = source(
    "v1",
    `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    legacy:
      kind: file
      target: LEGACY.md
      exact: legacy.md
    review:
      kind: skill
      name: review
      source: review`,
  ).replace(
    "    declarations: {}",
    "    declarations: {}\n  lean:\n    description: Lean\n    declarations: {legacy: {exclude: true}}",
  );
  const bob = remoteFixture(
    source(
      "v1",
      `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
    lint:
      kind: skill
      name: lint
      source: lint`,
    ).replace(
      "  work:\n    description: Work",
      "  team:\n    description: Team",
    ),
    {
      "agents.md": "Bob instructions",
      "lint/SKILL.md": "# Bob lint",
    },
    [],
    "bob/standards",
  );
  t.after(() => bob.close());
  const f = await adoptionFixture(t, cli, alice, {
    files: {
      "agents.md": "Alice instructions",
      "legacy.md": "Keep legacy content",
      "review/SKILL.md": "# Alice review",
    },
    versions: [cli.version, candidateVersion],
  });
  const { project, env, registry } = f;
  f.adopt();
  const adopted = JSON.parse(
    cli.run(["status", "--json"], project.root, env).stdout,
  ) as Status;
  const runtimePaths = [
    ".repo-standards/runtime/package.json",
    ".repo-standards/runtime/package-lock.json",
    ".agents/skills/adopt-standards/SKILL.md",
  ];
  const runtime = runtimePaths.map((path) =>
    readFileSync(join(project.root, path), "utf8"),
  );

  // A profile switch with the pinned CLI keeps the runtime.
  const profileArgs = inspectionArgs.map((argument) =>
    argument === "work" ? "lean" : argument,
  );
  const profileSwitch = JSON.parse(
    cli.run(profileArgs, project.root, env).stdout,
  ) as Inspection;
  assert.deepEqual(profileSwitch.update, ["profile"]);
  assert.deepEqual(profileSwitch.previousSelection, adopted.selection);
  assert.deepEqual(
    profileSwitch.retired!.map((entry: { id: string }) => entry.id),
    ["legacy"],
  );
  assert.equal(
    profileSwitch.start.eligible,
    true,
    JSON.stringify(profileSwitch.start.blockers),
  );
  const switched = cli.run(
    startArgs(profileSwitch.identity, profileArgs),
    project.root,
    env,
  );
  assert.equal(switched.status, 0, switched.stdout + switched.stderr);
  assert.equal(existsSync(join(project.root, "LEGACY.md")), false);
  let status = JSON.parse(
    cli.run(["status", "--json"], project.root, env).stdout,
  ) as Status;
  assert.equal(status.selection!.profile, "lean");
  assert.equal(status.baselines!["LEGACY.md"], undefined);
  assert.deepEqual(
    runtimePaths.map((path) => readFileSync(join(project.root, path), "utf8")),
    runtime,
  );
  commit(project.root);

  // A source switch can change every component at once, including the CLI pin.
  const candidate = installCandidate(candidateVersion, env);
  t.after(() => candidate.close());
  const bobEnv = { ...bob.env, ...registry.env };
  const runCandidate = (args: string[]) =>
    candidate.run(args, project.root, bobEnv);
  const sourceArgs = inspectionArgs.map((argument) =>
    argument === "https://github.com/alice/standards"
      ? "https://github.com/bob/standards"
      : argument === "work"
        ? "team"
        : argument,
  );
  const sourceResult = runCandidate(sourceArgs);
  assert.equal(
    sourceResult.status,
    0,
    sourceResult.stdout + sourceResult.stderr,
  );
  const sourceSwitch = JSON.parse(sourceResult.stdout) as Inspection;
  assert.deepEqual(sourceSwitch.update, [
    "cli",
    "standards",
    "source",
    "profile",
  ]);
  assert.deepEqual(sourceSwitch.previousSelection, status.selection);
  assert.deepEqual(
    sourceSwitch.retired!.map((entry: { id: string }) => entry.id),
    ["review"],
  );
  assert.equal(
    sourceSwitch.start.eligible,
    true,
    JSON.stringify(sourceSwitch.start.blockers),
  );
  const result = runCandidate(startArgs(sourceSwitch.identity, sourceArgs));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as Run).outcome, "complete");
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Bob instructions",
  );
  assert.equal(
    readFileSync(join(project.root, ".agents/skills/lint/SKILL.md"), "utf8"),
    "# Bob lint",
  );
  assert.equal(existsSync(join(project.root, ".agents/skills/review")), false);
  assert.equal(existsSync(join(project.root, "LEGACY.md")), false);
  assert.ok(
    readFileSync(
      join(project.root, ".agents/skills/adopt-standards/SKILL.md"),
      "utf8",
    ).includes(`Fixture CLI ${candidateVersion}.`),
  );
  status = JSON.parse(runCandidate(["status", "--json"]).stdout) as Status;
  assert.equal(
    status.selection!.standards.repository,
    "https://github.com/bob/standards",
  );
  assert.equal(status.selection!.profile, "team");
  assert.equal(status.selection!.cli.version, candidateVersion);
  assert.equal(status.skills![".agents/skills/review"], undefined);
  assert.equal(
    existsSync(join(project.root, ".repo-standards/inputs/source/legacy.md")),
    false,
  );
  assert.equal(
    existsSync(
      join(project.root, ".repo-standards/inputs/source/review/SKILL.md"),
    ),
    false,
  );
});

test("an established selection rejects its moved current tag even without the external observation cache", async (t) => {
  const v1 = source(
    "v1",
    `    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md`,
  );
  const f = await adoptionFixture(t, cli, v1, {
    files: { "agents.md": "Version one" },
  });
  const { remote, project, env } = f;
  f.adopt();
  const moved = remote.addVersion("v1.1.0", v1, {
    "agents.md": "Moved tag content",
  });
  assert.equal(remote.publish("v1.0.0").sha, moved.sha);
  rmSync(join(remote.support.root, "cache/repo-standards/tags"), {
    recursive: true,
    force: true,
  });
  const result = cli.run(inspectionArgs, project.root, env);
  assert.equal(result.status, 1);
  assert.equal(
    (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
    "MOVED_TAG",
  );
  assert.equal(
    readFileSync(join(project.root, "AGENTS.md"), "utf8"),
    "Version one",
  );
  assert.equal(git(project.root, "status", "--porcelain=v1"), "");
});

test("whole-skill updates allow resources to change between files and directories", async (t) => {
  const yaml = source(
    "v1",
    `    review:
      kind: skill
      name: review
      source: review`,
  );
  const f = await adoptionFixture(t, cli, yaml, {
    files: {
      "review/SKILL.md": "# Review",
      "review/expand": "Old file",
      "review/collapse/old.txt": "Old directory resource",
    },
  });
  const { remote, project, env } = f;
  f.adopt();
  const head = git(project.root, "rev-parse", "HEAD");
  rmSync(join(remote.source.root, "review/expand"));
  rmSync(join(remote.source.root, "review/collapse"), { recursive: true });
  remote.addVersion("v1.1.0", yaml, {
    "review/expand/new.txt": "New directory resource",
    "review/collapse": "New file",
  });
  const args = versionArgs("v1.1.0");
  const inspection = f.inspect(args);
  assert.deepEqual(inspection.start.blockers, []);
  const result = cli.run(
    startArgs(inspection.identity, args),
    project.root,
    env,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    readFileSync(
      join(project.root, ".agents/skills/review/expand/new.txt"),
      "utf8",
    ),
    "New directory resource",
  );
  assert.equal(
    readFileSync(join(project.root, ".agents/skills/review/collapse"), "utf8"),
    "New file",
  );
  assert.equal(git(project.root, "rev-parse", "HEAD"), head);
});

// An adopted skill and an inspection of its update: a standards
// update that replaces the skill's resources, or a CLI update that replaces the
// runtime and keeps the retained standards.
async function pendingUpdate(
  t: TestContext,
  kind: "standards" | "cli" = "standards",
) {
  const yaml = source(
    "v1",
    `    review:
      kind: skill
      name: review
      source: review`,
  );
  const f = await adoptionFixture(t, cli, yaml, {
    files: {
      "review/SKILL.md": "# Review v1",
      "review/obsolete.txt": "Old resource",
    },
    versions: kind === "cli" ? [cli.version, candidateVersion] : [cli.version],
  });
  const { remote, project, env } = f;
  f.adopt();
  const previous = JSON.parse(f.run(["status", "--json"]).stdout) as Status;
  let run = (args: string[], environment: NodeJS.ProcessEnv = env) =>
    f.run(args, environment);
  let args: string[];
  if (kind === "standards") {
    rmSync(join(remote.source.root, "review/obsolete.txt"));
    remote.addVersion("v1.1.0", yaml, {
      "review/SKILL.md": "# Review v2",
      "review/current.txt": "New resource",
    });
    args = versionArgs("v1.1.0");
  } else {
    const candidate = installCandidate(candidateVersion, env);
    t.after(() => candidate.close());
    run = (args, environment) => candidate.run(args, project.root, environment);
    for (const key of Object.keys(remote.responses))
      delete remote.responses[key];
    remote.save();
    args = ["inspect", "--json"];
  }
  const inspection = JSON.parse(run(args).stdout) as Inspection;
  return {
    remote,
    project,
    env,
    previous,
    head: git(project.root, "rev-parse", "HEAD"),
    inspectArgs: args,
    startArgs: startArgs(inspection.identity, args),
    // A candidate CLI only inspects and starts; the recorded adoption's status
    // needs its pinned CLI until a run under the candidate begins.
    pinned: (args: string[]) => f.run(args),
    run,
  };
}

test("a CLI pin-change retry completes after process death during runtime staging", async (t) => {
  const f = await pendingUpdate(t, "cli");
  const lock = join(
    f.project.root,
    git(f.project.root, "rev-parse", "--git-dir"),
    "repo-standards-run.lock",
  );
  const installed = join(
    f.project.root,
    ".repo-standards/runtime/node_modules",
  );
  const previousRuntime = snapshot(installed);
  const env = filesystemFault(
    f.remote.support.root,
    f.env,
    "runtime",
    `
const copy = fs.cpSync;
fs.cpSync = function(from, to, options) {
  if (String(to).endsWith('/repo-standards-run.lock.runtime')) {
    return copy.call(this, from, to, { ...options, filter(source, target) {
      if (fs.lstatSync(String(to) + '/.bin/repo-standards', { throwIfNoEntry: false })?.isSymbolicLink()) ${kill}
      return true;
    } });
  }
  return copy.call(this, from, to, options);
};
syncBuiltinESMExports();`,
  );
  assert.equal(f.run(f.startArgs, env).signal, "SIGKILL");
  const interrupted = JSON.parse(readFileSync(lock, "utf8")) as Run;
  assert.equal(interrupted.phase, "runtime");
  assert.equal(interrupted.continuation, undefined);
  assert.equal(
    lstatSync(`${lock}.runtime/.bin/repo-standards`).isSymbolicLink(),
    true,
  );
  assert.deepEqual(snapshot(installed), previousRuntime);

  // Keep the runtime bound to the recorded plan before retry installs it.
  // Completion performs the CLI's runtimeHash verification; the tree comparison
  // also checks every installed byte, mode and symbolic link against that stage.
  const recordedRuntime = join(f.remote.support.root, "recorded-runtime");
  const retryEnv = filesystemFault(
    f.remote.support.root,
    f.env,
    "installation",
    `
fs.cpSync(${JSON.stringify(`${lock}.runtime`)}, ${JSON.stringify(recordedRuntime)}, { recursive: true, verbatimSymlinks: true });`,
  );
  const result = f.run(["resume", "--retry", "--json"], retryEnv);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const completed = JSON.parse(result.stdout) as Run;
  assert.equal(completed.id, interrupted.id);
  assert.equal(completed.outcome, "complete");
  assert.equal(completed.selection.cli.version, candidateVersion);
  assert.deepEqual(snapshot(installed), snapshot(recordedRuntime));
  assert.equal(
    (JSON.parse(f.run(["status", "--json"]).stdout) as Status).lastComplete.run,
    completed.id,
  );
  assert.equal(git(f.project.root, "rev-parse", "HEAD"), f.head);
});

test("retry preserves runtime integrity failures after the installation is recorded", async (t) => {
  for (const point of ["staged", "installed"] as const)
    await t.test(point, async (t) => {
      const f = await pendingUpdate(
        t,
        point === "staged" ? "cli" : "standards",
      );
      const env = filesystemFault(
        f.remote.support.root,
        f.env,
        "installation",
        killAfterRename(
          `/.agents/skills/${point === "staged" ? "adopt-standards" : "review"}/SKILL.md`,
        ),
      );
      assert.equal(f.run(f.startArgs, env).signal, "SIGKILL");
      const lock = join(
        f.project.root,
        git(f.project.root, "rev-parse", "--git-dir"),
        "repo-standards-run.lock",
      );
      const interrupted = JSON.parse(readFileSync(lock, "utf8")) as Run;
      assert.ok(interrupted.continuation);
      assert.equal(interrupted.installation!.runtime, point === "installed");
      const installed = join(
        f.project.root,
        ".repo-standards/runtime/node_modules",
      );
      const target = join(
        point === "staged" ? `${lock}.runtime` : installed,
        "@lutzseverino/repo-standards/package.json",
      );
      const original = readFileSync(target);
      writeFileSync(target, "Maintainer runtime edit");
      const preservedRuntime = snapshot(installed);
      const rejected = f.run(["resume", "--retry", "--json"]);
      assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
      assert.match(
        (JSON.parse(rejected.stdout) as Run).reason,
        point === "staged"
          ? /STATE_INTEGRITY.*saved runtime installation changed/
          : /INSTALLATION_CHANGED.*Runtime content changed/,
      );
      assert.equal(readFileSync(target, "utf8"), "Maintainer runtime edit");
      assert.deepEqual(snapshot(installed), preservedRuntime);
      writeFileSync(target, original);
      const recovered = f.run(["resume", "--retry", "--json"]);
      assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
      assert.equal((JSON.parse(recovered.stdout) as Run).outcome, "complete");
    });
});

test("an update retries interrupted completion while preserving previous last-complete evidence", async (t) => {
  for (const [kind, name] of [
    ["standards", "lock.json"],
    ["cli", "state.json"],
  ] as const)
    await t.test(`${kind}: ${name}`, async (t) => {
      const f = await pendingUpdate(t, kind);
      const env = filesystemFault(
        f.remote.support.root,
        f.env,
        "completion",
        killAfterRename(`/.repo-standards/${name}`),
      );
      assert.equal(f.run(f.startArgs, env).signal, "SIGKILL");
      const status = JSON.parse(f.run(["status", "--json"]).stdout) as Status;
      assert.equal(status.lastComplete.run, f.previous.lastComplete.run);
      assert.equal(status.active!.phase, "completion");
      const result = f.run(["resume", "--retry", "--json"]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const completed = JSON.parse(
        f.run(["status", "--json"]).stdout,
      ) as Status;
      assert.equal(completed.lastComplete.run, status.active!.id);
      assert.equal(completed.active, null);
      assert.equal(git(f.project.root, "rev-parse", "HEAD"), f.head);
    });
});

// The excluded generated directories of product state, which a CLI update's
// runtime replacement concerns only under runtime/node_modules.
const generated = [
  ".repo-standards/local",
  ".repo-standards/cache",
  ".repo-standards/runtime/node_modules",
];
const updateKinds = [
  { kind: "standards", paths: generated },
  { kind: "cli", paths: [".repo-standards/runtime/node_modules"] },
] as const;

test("update inspections reject unexpected durable product files before creating a run", async (t) => {
  // A CLI update replaces the runtime, so an unexpected file there is its case.
  for (const { kind, paths } of [
    {
      kind: "standards",
      paths: [
        ".repo-standards/extra.txt",
        ".repo-standards/inputs/source/extra.txt",
        ".repo-standards/runtime/extra.txt",
        ".repo-standards/other/cache/extra.txt",
        ".repo-standards/other/local/extra.txt",
        ".repo-standards/other/runtime/node_modules/extra.txt",
      ],
    },
    { kind: "cli", paths: [".repo-standards/runtime/extra.txt"] },
  ] as const)
    await t.test(kind, async (t) => {
      const f = await pendingUpdate(t, kind);
      for (const path of paths) {
        mkdirSync(dirname(join(f.project.root, path)), { recursive: true });
        writeFileSync(
          join(f.project.root, path),
          "Preserve this unexpected file",
        );
        commit(f.project.root);
        const result = f.run(f.inspectArgs);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const inspection = JSON.parse(result.stdout) as Inspection;
        assert.equal(inspection.start.eligible, false, path);
        assert.ok(
          inspection.start.blockers.some(
            (blocker: { code: string }) => blocker.code === "STATE_INTEGRITY",
          ),
        );
        const rejected = f.run(startArgs(inspection.identity, f.inspectArgs));
        assert.equal(rejected.status, 1);
        assert.equal(
          (JSON.parse(rejected.stdout) as ErrorReport).errors[0]!.code,
          "START_BLOCKED",
        );
        const status = JSON.parse(
          f.pinned(["status", "--json"]).stdout,
        ) as Status;
        assert.equal(status.active, null);
        assert.equal(status.lastComplete.run, f.previous.lastComplete.run);
        assert.equal(
          readFileSync(join(f.project.root, path), "utf8"),
          "Preserve this unexpected file",
        );
        assert.equal(git(f.project.root, "status", "--porcelain=v1"), "");
        rmSync(join(f.project.root, path));
        commit(f.project.root);
      }
    });
});

test("updates validate excluded directory roots and reject changed boundaries before creating a run", async (t) => {
  for (const { kind, paths } of updateKinds)
    await t.test(kind, async (t) => {
      const f = await pendingUpdate(t, kind);
      const args = f.inspectArgs;
      // Ignore the entries themselves, including files and links, so Git status
      // cannot supply the freshness or safety signal under test.
      writeFileSync(
        join(f.project.root, ".git/info/exclude"),
        generated.join("\n") + "\n",
      );
      for (const path of paths) {
        const target = join(f.project.root, path);
        const saved = join(f.remote.support.root, "saved-directory");
        const hadDirectory = existsSync(target);
        if (hadDirectory) renameSync(target, saved);
        const before = JSON.parse(f.run(args).stdout) as Inspection;
        assert.equal(before.start.eligible, true, path);
        for (const type of ["file", "directory-link", "dangling-link", "fifo"])
          await t.test(`${path}: ${type}`, () => {
            if (type === "file") writeFileSync(target, "Preserve this file");
            else if (type === "fifo") execFileSync("mkfifo", [target]);
            else
              symlinkSync(
                type === "directory-link"
                  ? f.remote.support.root
                  : join(f.remote.support.root, "missing"),
                target,
              );
            try {
              const result = f.run(args);
              assert.equal(result.status, 0, result.stdout + result.stderr);
              const inspection = JSON.parse(result.stdout) as Inspection;
              assert.equal(inspection.start.eligible, false);
              assert.ok(
                inspection.start.blockers.some(
                  (blocker: { code: string }) =>
                    blocker.code ===
                    (type === "file" ? "TARGET_TYPE" : "UNSAFE_TARGET"),
                ),
              );
              assert.notEqual(inspection.identity, before.identity);
              const stale = f.run(startArgs(before.identity, args));
              assert.equal(
                (JSON.parse(stale.stdout) as ErrorReport).errors[0]!.code,
                "STALE_INSPECTION",
              );
              const rejected = f.run(startArgs(inspection.identity, args));
              assert.equal(
                (JSON.parse(rejected.stdout) as ErrorReport).errors[0]!.code,
                "START_BLOCKED",
              );
              if (type === "file") {
                assert.equal(
                  readFileSync(target, "utf8"),
                  "Preserve this file",
                );
                writeFileSync(target, "Changed file bytes");
                assert.notEqual(
                  (JSON.parse(f.run(args).stdout) as Inspection).identity,
                  inspection.identity,
                );
              } else if (type === "fifo")
                assert.equal(lstatSync(target).isFIFO(), true);
              else
                assert.equal(
                  readlinkSync(target),
                  type === "directory-link"
                    ? f.remote.support.root
                    : join(f.remote.support.root, "missing"),
                );
              const status = JSON.parse(
                f.pinned(["status", "--json"]).stdout,
              ) as Status;
              assert.equal(status.active, null);
              assert.equal(
                status.lastComplete.run,
                f.previous.lastComplete.run,
              );
              assert.equal(git(f.project.root, "status", "--porcelain=v1"), "");
              assert.equal(git(f.project.root, "rev-parse", "HEAD"), f.head);
            } finally {
              unlinkSync(target);
            }
          });
        if (hadDirectory) renameSync(saved, target);
      }
    });
});

test("updates allow absent excluded directories and ignore safe generated descendants", async (t) => {
  for (const { kind, paths } of updateKinds)
    await t.test(kind, async (t) => {
      const f = await pendingUpdate(t, kind);
      const before = JSON.parse(f.run(f.inspectArgs).stdout) as Inspection;
      for (const path of paths)
        rmSync(join(f.project.root, path), { recursive: true, force: true });
      const absent = JSON.parse(f.run(f.inspectArgs).stdout) as Inspection;
      assert.equal(absent.start.eligible, true);
      assert.equal(absent.identity, before.identity);
      for (const path of paths) {
        const target = join(f.project.root, path);
        mkdirSync(target);
        writeFileSync(join(target, "noise"), "Generated bytes");
        symlinkSync("missing-generated-target", join(target, "generated-link"));
      }
      const generatedContent = JSON.parse(
        f.run(f.inspectArgs).stdout,
      ) as Inspection;
      assert.equal(generatedContent.start.eligible, true);
      assert.equal(generatedContent.identity, before.identity);
      for (const path of paths)
        rmSync(join(f.project.root, path), { recursive: true });
      const result = f.run(f.startArgs);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal((JSON.parse(result.stdout) as Run).outcome, "complete");
      assert.equal(git(f.project.root, "rev-parse", "HEAD"), f.head);
    });
});

test("updates preserve incomplete work when excluded roots become invalid during installation or verification", async (t) => {
  for (const { kind, paths } of updateKinds)
    for (const phase of ["installation", "verification"]) {
      for (const path of paths)
        await t.test(`${kind}: ${phase}: ${path}`, async (t) => {
          const f = await pendingUpdate(t, kind);
          const target = join(f.project.root, path);
          const saved = join(f.remote.support.root, "saved-directory");
          // At the phase's first rename, the root becomes a file.
          const env = filesystemFault(
            f.remote.support.root,
            f.env,
            phase,
            killAfterRename("", {
              before: `
const target = ${JSON.stringify(target)};
if (fs.existsSync(target)) rename(target, ${JSON.stringify(saved)});
write(target, 'Preserve invalid root');`,
            }),
          );
          assert.equal(f.run(f.startArgs, env).signal, "SIGKILL");
          assert.equal(
            (JSON.parse(f.run(["status", "--json"]).stdout) as Status).active!
              .phase,
            phase,
          );
          const tracked = git(f.project.root, "diff", "--binary");
          const rejected = f.run(["resume", "--retry", "--json"]);
          assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
          // Resume cannot open a run whose local directory is no longer a
          // directory; otherwise the run records which check caught the root.
          if (path === ".repo-standards/local")
            assert.equal(
              (JSON.parse(rejected.stdout) as ErrorReport).errors[0]!.code,
              "UNSAFE_TARGET",
            );
          else
            assert.ok(
              (JSON.parse(rejected.stdout) as Run).reason.startsWith(
                path === ".repo-standards/runtime/node_modules" &&
                  phase === "verification"
                  ? "UNSAFE_TARGET:"
                  : "FINAL_INTEGRITY:",
              ),
              rejected.stdout,
            );
          assert.equal(readFileSync(target, "utf8"), "Preserve invalid root");
          assert.equal(git(f.project.root, "diff", "--binary"), tracked);
          const status = JSON.parse(
            f.run(["status", "--json"]).stdout,
          ) as Status;
          assert.ok(status.active);
          assert.equal(status.lastComplete.run, f.previous.lastComplete.run);
          unlinkSync(target);
          if (existsSync(saved)) renameSync(saved, target);
          const resumed = f.run(["resume", "--retry", "--json"]);
          assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
          assert.equal((JSON.parse(resumed.stdout) as Run).outcome, "complete");
          assert.equal(git(f.project.root, "rev-parse", "HEAD"), f.head);
        });
    }
});

test("an update identity binds unexpected durable bytes that Git status cannot show", async (t) => {
  const f = await pendingUpdate(t);
  // Keep Git status identical while changing an ignored durable file, so
  // freshness must come from the product-state observation itself.
  writeFileSync(
    join(f.project.root, ".git/info/exclude"),
    ".repo-standards/runtime/extra.txt\n",
  );
  const extra = join(f.project.root, ".repo-standards/runtime/extra.txt");
  writeFileSync(extra, "First unexpected bytes");
  const first = JSON.parse(f.run(f.inspectArgs).stdout) as Inspection;
  assert.equal(first.start.eligible, false);
  writeFileSync(extra, "Changed unexpected bytes");
  const changed = JSON.parse(f.run(f.inspectArgs).stdout) as Inspection;
  assert.notEqual(changed.identity, first.identity);
  const stale = f.run(startArgs(first.identity, f.inspectArgs));
  assert.equal(
    (JSON.parse(stale.stdout) as ErrorReport).errors[0]!.code,
    "STALE_INSPECTION",
  );
  assert.equal(
    (JSON.parse(f.pinned(["status", "--json"]).stdout) as Status).active,
    null,
  );
  assert.equal(git(f.project.root, "status", "--porcelain=v1"), "");
});

test("both update paths run fixes, contextual assessment, and checks with only active declarations", async (t) => {
  for (const kind of ["standards", "cli"] as const)
    await t.test(kind, async (t) => {
      const script = { script: "operation.mjs" };
      const declarations = {
        readme: {
          kind: "file",
          target: "README.md",
          guidance: "guide.md",
          fixes: [operation("prepare", script)],
          checks: [operation("verify", script)],
        },
        retired: {
          kind: "file",
          target: "RETIRED.md",
          exact: "retired.md",
          fixes: [operation("old-fix", script)],
          checks: [operation("old-check", script)],
        },
      };
      const f = await adoptionFixture(t, cli, manifest(declarations), {
        files: {
          "guide.md": "Explain how to use this project.",
          "retired.md": "Preserve retired content",
          "operation.mjs": `import {readFileSync, writeFileSync} from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
let status = input.operation.phase === 'fixes' ? 'unchanged' : 'passed';
if (input.operation.id === 'prepare') { writeFileSync('README.md', '# Prepared README'); status = 'changed'; }
if (input.operation.id === 'verify' && !readFileSync('README.md', 'utf8').includes('## Usage')) status = 'failed';
console.log(JSON.stringify({format: 'repo-standards/result/v2', status, message: input.operation.id}));`,
        },
        project: {
          "README.md": "# Project",
          "package.json": '{"private":true}\n',
          "yarn.lock": "# Project dependencies\n",
        },
        versions: [cli.version, candidateVersion],
      });
      const { remote, project, env } = f;
      let run = (args: string[]) => f.run(args);
      const assess = () => {
        writeFileSync(
          join(project.root, "README.md"),
          "# Queue service\n## Usage\nRun the worker to process queued jobs.\n",
        );
        run(["resume", "--json"]);
        const path = join(remote.support.root, "assessment.json");
        writeFileSync(
          path,
          JSON.stringify({
            format: "repo-standards/assessment/v3",
            declarations: [
              {
                id: "readme",
                status: "satisfied",
                explanation: "Documented the queue worker.",
                evidence: ["Usage explains how to process jobs."],
              },
            ],
          }),
        );
        return run(["resume", "--assessment", path, "--json"]);
      };
      assert.equal(f.start().report.phase, "contextual");
      const adopted = assess();
      assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
      commit(project.root);
      const previous = JSON.parse(run(["status", "--json"]).stdout) as Status;
      const head = git(project.root, "rev-parse", "HEAD");
      let args: string[];
      if (kind === "standards") {
        remote.addVersion(
          "v1.1.0",
          manifest({ readme: declarations.readme }),
          {},
        );
        args = versionArgs("v1.1.0");
      } else {
        const candidate = installCandidate(candidateVersion, env);
        t.after(() => candidate.close());
        run = (args) => candidate.run(args, project.root);
        for (const key of Object.keys(remote.responses))
          delete remote.responses[key];
        remote.save();
        args = ["inspect", "--json"];
      }
      const inspection = JSON.parse(run(args).stdout) as Inspection;
      const handoff = JSON.parse(
        run(startArgs(inspection.identity, args)).stdout,
      ) as Run;
      assert.equal(handoff.phase, "contextual");
      assert.equal(handoff.operations[0]!.result!.status, "changed");
      assert.equal(
        readFileSync(join(project.root, "README.md"), "utf8"),
        "# Prepared README",
      );
      assert.equal(
        (JSON.parse(run(["status", "--json"]).stdout) as Status).lastComplete
          .run,
        previous.lastComplete.run,
      );
      const result = assess();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const report = JSON.parse(result.stdout) as Run;
      assert.equal(report.outcome, "complete");
      assert.deepEqual(
        report.operations.map(
          (entry: { operation: { id: string } }) => entry.operation.id,
        ),
        kind === "standards"
          ? ["prepare", "verify"]
          : ["prepare", "old-fix", "verify", "old-check"],
      );
      const status = JSON.parse(run(["status", "--json"]).stdout) as Status;
      assert.equal(status.assessments!.length, 1);
      assert.equal(status.lastComplete.run, report.id);
      if (kind === "standards") {
        assert.equal(status.baselines!["RETIRED.md"], undefined);
        assert.equal(existsSync(join(project.root, "RETIRED.md")), false);
      } else
        assert.equal(
          readFileSync(join(project.root, "RETIRED.md"), "utf8"),
          "Preserve retired content",
        );
      assert.equal(
        readFileSync(join(project.root, "package.json"), "utf8"),
        '{"private":true}\n',
      );
      assert.equal(
        readFileSync(join(project.root, "yarn.lock"), "utf8"),
        "# Project dependencies\n",
      );
      assert.equal(git(project.root, "rev-parse", "HEAD"), head);
    });
});

test("a whole-skill update resumes a partially written resource without keeping its temporary file", async (t) => {
  const f = await pendingUpdate(t);
  const env = filesystemFault(
    f.remote.support.root,
    f.env,
    "installation",
    `
const writeResource = fs.writeFileSync;
fs.writeFileSync = function(path, data, ...args) {
  if (String(path).includes('/.agents/skills/review/.repo-standards-')) {
    writeResource.call(this, path, Buffer.from(data).subarray(0, 4), ...args);
    ${kill}
  }
  return writeResource.call(this, path, data, ...args);
};
syncBuiltinESMExports();`,
  );
  assert.equal(f.run(f.startArgs, env).signal, "SIGKILL");
  const result = f.run(["resume", "--retry", "--json"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    readFileSync(
      join(f.project.root, ".agents/skills/review/SKILL.md"),
      "utf8",
    ),
    "# Review v2",
  );
  assert.equal(
    readFileSync(
      join(f.project.root, ".agents/skills/review/current.txt"),
      "utf8",
    ),
    "New resource",
  );
  assert.deepEqual(
    (JSON.parse(f.run(["status", "--json"]).stdout) as Status).skills![
      ".agents/skills/review"
    ],
    ["SKILL.md", "current.txt"],
  );
});

test("retry preserves a maintainer deletion of a confirmed installed skill resource", async (t) => {
  const f = await pendingUpdate(t);
  const env = filesystemFault(
    f.remote.support.root,
    f.env,
    "installation",
    killAfterRename("/.agents/skills/review/current.txt"),
  );
  assert.equal(f.run(f.startArgs, env).signal, "SIGKILL");
  const path = join(f.project.root, ".agents/skills/review/SKILL.md");
  rmSync(path);
  const result = f.run(["resume", "--retry", "--json"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    (JSON.parse(result.stdout) as Run).reason,
    /INSTALLATION_CHANGED/,
  );
  assert.equal(existsSync(path), false);
  writeFileSync(path, "# Review v2");
  const reconciled = f.run(["resume", "--retry", "--json"]);
  assert.equal(reconciled.status, 0, reconciled.stdout + reconciled.stderr);
});

test("a whole-skill update interrupted while replacing the skill preserves unexpected directories until reconciled, then completes", async (t) => {
  for (const [phase, fault] of [
    ["removing", killDuringRemoval("/.agents/skills/review", "/obsolete.txt")],
    ["installing", killAfterRename("/.agents/skills/review/SKILL.md")],
  ] as const)
    await t.test(phase, async (t) => {
      const f = await pendingUpdate(t, "standards");
      assert.equal(
        f.run(
          f.startArgs,
          filesystemFault(f.remote.support.root, f.env, "installation", fault),
        ).signal,
        "SIGKILL",
      );
      assert.equal(
        (JSON.parse(f.run(["status", "--json"]).stdout) as Status).lastComplete
          .run,
        f.previous.lastComplete.run,
      );
      const addition = join(f.project.root, ".agents/skills/review/unexpected");
      mkdirSync(addition);
      const rejected = f.run(["resume", "--retry", "--json"]);
      assert.equal(rejected.status, 1, rejected.stdout);
      assert.match(
        (JSON.parse(rejected.stdout) as Run).reason,
        /INSTALLATION_CHANGED.*inventory/,
      );
      assert.equal(existsSync(addition), true);
      assert.equal(
        existsSync(join(f.project.root, ".agents/skills/review/current.txt")),
        false,
      );
      rmSync(addition, { recursive: true });
      const recovered = f.run(["resume", "--retry", "--json"]);
      assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
      assert.equal((JSON.parse(recovered.stdout) as Run).outcome, "complete");
      assert.equal(
        readFileSync(
          join(f.project.root, ".agents/skills/review/current.txt"),
          "utf8",
        ),
        "New resource",
      );
      assert.equal(
        existsSync(join(f.project.root, ".agents/skills/review/obsolete.txt")),
        false,
      );
      assert.equal(git(f.project.root, "rev-parse", "HEAD"), f.head);
    });
});

test("retry resumes an interrupted removal of retired targets and an interrupted initial skill or skill link replacement", async (t) => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const declarations = `    review:
      kind: skill
      name: review
      source: review`;
  const copy = {
    ".claude/skills/review/SKILL.md": "# Local copy",
    ".claude/skills/review/local.md": "Local notes",
  };
  // A link is removed by unlinking it, a tree by removing it recursively.
  for (const { name, fault, initialFiles, discarded } of [
    { name: "a retired exact file", fault: killDuringRemoval("/RETIRED.md") },
    {
      name: "a retired skill",
      fault: killDuringRemoval("/.agents/skills/legacy", "/notes.md"),
    },
    {
      name: "a retired skill link",
      fault: killDuringRemoval("/.claude/skills/legacy"),
    },
    {
      name: "an initial replacement of a differing tracked skill",
      fault: killDuringRemoval("/.agents/skills/review", "/local.md"),
      initialFiles: {
        ".agents/skills/review/SKILL.md": "# Local review",
        ".agents/skills/review/local.md": "Local notes",
      },
      discarded: [".agents/skills/review"],
    },
    {
      name: "an initial replacement of a tracked copy at a skill link",
      fault: killDuringRemoval("/.claude/skills/review", "/local.md"),
      initialFiles: copy,
      discarded: [".claude/skills/review"],
    },
    {
      name: "a staged skill link replacing a tracked copy",
      fault: killBeforeRename("/.claude/skills/review"),
      initialFiles: copy,
      discarded: [".claude/skills/review"],
    },
  ])
    await t.test(name, async (st) => {
      const f = await adoptionFixture(
        st,
        cli,
        source(
          "v1",
          `${declarations}
    retired:
      kind: file
      target: RETIRED.md
      exact: retired.md
    legacy:
      kind: skill
      name: legacy
      source: legacy`,
        ),
        {
          files: {
            "review/SKILL.md": "# Review",
            "retired.md": "Retired",
            "legacy/SKILL.md": "# Legacy",
            "legacy/notes.md": "Legacy notes",
          },
          project: initialFiles,
          registry,
        },
      );
      const { remote, project, env } = f;
      let start: string[];
      if (!initialFiles) {
        f.adopt();
        remote.addVersion("v1.1.0", source("v2", declarations), {});
        const updateArgs = versionArgs("v1.1.0");
        const inspection = f.inspect(updateArgs);
        assert.deepEqual(
          inspection.removed!.map(({ target }) => target),
          [".agents/skills/legacy", ".claude/skills/legacy", "RETIRED.md"],
        );
        start = startArgs(inspection.identity, updateArgs);
      } else {
        const initial = f.inspect();
        assert.deepEqual(initial.discardedEdits, discarded);
        start = startArgs(initial.identity, inspectionArgs, true);
      }
      assert.equal(
        f.run(
          start,
          filesystemFault(remote.support.root, env, "installation", fault),
        ).signal,
        "SIGKILL",
      );
      const result = f.run(["resume", "--retry", "--json"]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal((JSON.parse(result.stdout) as Run).outcome, "complete");
      assert.deepEqual(
        installedTree(join(project.root, ".agents/skills/review")),
        installedTree(join(remote.source.root, "review")),
      );
      assert.equal(
        readlinkSync(join(project.root, ".claude/skills/review")),
        "../../.agents/skills/review",
      );
      assert.deepEqual(
        readdirSync(join(project.root, ".claude/skills")).sort(),
        [
          "adopt-standards",
          ...(initialFiles ? ["legacy"] : []),
          "review",
          "standards-updates",
        ],
      );
      if (!initialFiles) {
        assert.equal(existsSync(join(project.root, "RETIRED.md")), false);
        assert.equal(
          existsSync(join(project.root, ".agents/skills/legacy")),
          false,
        );
      }
    });
});
