import type { Diagnostic, ErrorReport, Inspection } from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { installCli, sourceFixture } from "./installed-cli.ts";
import {
  commit,
  git,
  inspectionArgs,
  manifest,
  operation,
  remoteFixture,
} from "./remote-fixture.ts";

interface GitTree {
  truncated: boolean;
  tree: { type: string; mode: string; path: string; sha: string }[];
}

const cli = installCli();
after(() => cli.close());
const yaml = `format: repo-standards/v2
name: public-standards
description: Public standards
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
    readme:
      kind: file
      target: README.md
      exact: readme.md
profiles:
  work:
    description: Work
    declarations: {}
`;

test("direct inspection resolves annotated tags and canonical repository identity, and rejects moved observations", (t) => {
  const remote = remoteFixture(yaml, {
    "readme.md": "Public standards README",
  });
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const annotation = "a".repeat(40);
  remote.responses["https://api.github.com/repos/Alice/Standards"] =
    remote.responses[remote.prefix]!;
  remote.responses[`${remote.prefix}/git/ref/tags/v1.0.0`] = {
    body: { ref: "refs/tags/v1.0.0", object: { type: "tag", sha: annotation } },
  };
  remote.responses[`${remote.prefix}/git/tags/${annotation}`] = {
    body: { object: { type: "commit", sha: remote.sha } },
  };
  remote.save();
  const result = cli.run(
    inspectionArgs.map((arg) =>
      arg === "https://github.com/alice/standards"
        ? "https://github.com/Alice/Standards.git/"
        : arg,
    ),
    project.root,
    remote.env,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(
    (JSON.parse(result.stdout) as Inspection).selection.standards,
    {
      repository: "https://github.com/alice/standards",
      version: "v1.0.0",
      commit: remote.sha,
    },
  );
  remote.responses[`${remote.prefix}/git/tags/${annotation}`] = {
    body: { object: { type: "commit", sha: "b".repeat(40) } },
  };
  remote.save();
  const moved = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(moved.status, 1);
  assert.equal(
    (JSON.parse(moved.stdout) as ErrorReport).errors[0]!.code,
    "MOVED_TAG",
  );
});

test("public inspection acquires a source larger than the anonymous API allowance without per-blob requests", (t) => {
  const files = Object.fromEntries(
    Array.from({ length: 70 }, (_, index) => [
      `material/file-${index}.txt`,
      `Material ${index}\n`,
    ]),
  );
  const remote = remoteFixture(
    yaml,
    { ...files, "readme.md": Buffer.from([0, 1, 2, 255]) },
    ["readme.md"],
    "alice/standards",
    true,
  );
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);

  const result = cli.run(inspectionArgs, project.root, {
    ...remote.env,
    GIT_DEFAULT_HASH: "sha256",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    (JSON.parse(result.stdout) as Inspection).selection.standards.commit,
    remote.sha,
  );
  assert.equal(
    remote.requests().filter((url) => url.includes("/git/blobs/")).length,
    0,
  );
  assert.ok(
    remote.requests().length <= 5,
    `Expected bounded API requests, observed ${remote.requests().length}`,
  );
});

test("a self-adopted remote source ignores unselected links without extracting them", (t) => {
  const names = [
    "adopt-standards",
    "standards-updates",
    ...Array.from({ length: 26 }, (_, index) => `author-${index}`),
  ];
  const remote = remoteFixture(
    manifest(
      {
        readme: { kind: "file", target: "README.md", exact: "readme.md" },
        review: {
          kind: "skill",
          name: "review",
          source: ".agents/skills/author-0",
        },
      },
      { complete: {} },
    ),
    {
      "readme.md": "README",
      ...Object.fromEntries(
        names.map((name) => [
          `.agents/skills/${name}/SKILL.md`,
          "Skill content",
        ]),
      ),
    },
    [],
    "lutzseverino/repo-canon",
  );
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  mkdirSync(join(remote.source.root, ".claude/skills"), { recursive: true });
  for (const name of names)
    symlinkSync(
      `../../.agents/skills/${name}`,
      join(remote.source.root, ".claude/skills", name),
    );
  symlinkSync("readme.md", join(remote.source.root, "elsewhere"));
  commit(remote.source.root);
  remote.publish("v0.5.1");
  unlinkSync(join(project.root, "standards.yaml"));

  // Observe the extracted filesystem at its cleanup boundary; the installed
  // CLI still performs acquisition and validation without fixture shortcuts.
  const inventory = join(remote.support.root, "extracted.json");
  appendFileSync(
    join(remote.support.root, "https-fixture.mjs"),
    `import fs from 'node:fs';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const remove = fs.rmSync;
fs.rmSync = (path, options) => {
  const root = join(String(path), 'snapshot');
  if (fs.existsSync(root)) {
    fs.writeFileSync(${JSON.stringify(inventory)}, JSON.stringify(fs.readdirSync(root, {recursive: true})));
  }
  return remove(path, options);
};
syncBuiltinESMExports();\n`,
  );
  const local = cli.run(["source", "validate", "--json"], remote.source.root);
  assert.equal(local.status, 0, local.stdout + local.stderr);
  const result = cli.run(
    [
      "inspect",
      "--source",
      "https://github.com/lutzseverino/repo-canon",
      "--standards-version",
      "v0.5.1",
      "--profile",
      "complete",
      "--project",
      project.root,
      "--json",
    ],
    project.root,
    remote.env,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const extracted = JSON.parse(readFileSync(inventory, "utf8")) as string[];
  assert.ok(extracted.includes("readme.md"));
  assert.ok(extracted.includes(".agents/skills/adopt-standards/SKILL.md"));
  assert.ok(!extracted.some((path) => path.startsWith(".claude/skills/")));
  assert.ok(!extracted.includes("elsewhere"));
});

test("remote and local validation reject selected links and linked ancestors with SOURCE_SYMLINK", (t) => {
  const project = sourceFixture("");
  t.after(() => project.close());
  const scenarios = [
    {
      declaration: { kind: "file", target: "README.md", exact: "linked" },
      link: "linked",
      target: "readme.md",
    },
    {
      declaration: {
        kind: "file",
        target: "README.md",
        guidance: "linked/readme.md",
      },
      link: "linked",
      target: "material",
    },
    {
      declaration: {
        kind: "repository",
        guidance: "readme.md",
        discovery: "linked",
      },
      link: "linked",
      target: "readme.md",
    },
    {
      declaration: { kind: "skill", name: "review", source: "linked" },
      link: "linked",
      target: "skill",
    },
    {
      declaration: { kind: "skill", name: "review", source: "skills/x" },
      link: "skills",
      target: "material",
    },
    {
      declaration: { kind: "skill", name: "review", source: "skill" },
      link: "skill/nested",
      target: "../readme.md",
    },
    {
      declaration: {
        kind: "file",
        target: "README.md",
        exact: "readme.md",
        checks: [operation("check", { script: "linked" })],
      },
      link: "linked",
      target: "readme.md",
    },
    {
      declaration: {
        kind: "file",
        target: "README.md",
        exact: "readme.md",
        checks: [operation("check", { resources: ["linked"] })],
      },
      link: "linked",
      target: "readme.md",
    },
    {
      declaration: {
        kind: "file",
        target: "README.md",
        exact: "readme.md",
        checks: [operation("check", { resources: ["resources"] })],
      },
      link: "resources/nested",
      target: "../readme.md",
    },
    {
      declaration: { kind: "skill", name: "review", source: "skill" },
      link: "skill/agents/openai.yaml",
      target: "../../readme.md",
    },
  ];
  for (const { declaration, link, target } of scenarios) {
    const remote = remoteFixture(manifest({ selected: declaration }), {
      "readme.md": "README",
      "material/readme.md": "README",
      "material/x/SKILL.md": "Review skill",
      "skill/SKILL.md": "Review skill",
      "run.mjs": "",
    });
    t.after(() => remote.close());
    mkdirSync(join(remote.source.root, link, ".."), { recursive: true });
    symlinkSync(target, join(remote.source.root, link));
    commit(remote.source.root);
    remote.publish("v1.0.0");
    const local = cli.run(["source", "validate", "--json"], remote.source.root);
    assert.equal(local.status, 1, local.stdout + local.stderr);
    const localErrors = (JSON.parse(local.stdout) as ErrorReport).errors;
    assert.ok(
      localErrors.some((error) => error.code === "SOURCE_SYMLINK"),
      local.stdout,
    );
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const error = (JSON.parse(result.stdout) as ErrorReport).errors[0]!;
    assert.equal(error.code, "INVALID_STANDARDS", result.stdout);
    assert.deepEqual(
      error.details,
      localErrors.map((detail) => ({ ...detail, file: "standards.yaml" })),
      result.stdout,
    );
  }
});

test("remote acquisition and local validation reject a symbolic standards.yaml", (t) => {
  const remote = remoteFixture(yaml, {
    "readme.md": "README",
    "manifest.yaml": yaml,
  });
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  const alias = join(remote.support.root, "linked-root");
  symlinkSync(remote.source.root, alias);
  const linkedRoot = cli.run(
    ["source", "validate", alias, "--json"],
    project.root,
  );
  assert.equal(linkedRoot.status, 1, linkedRoot.stdout + linkedRoot.stderr);
  assert.equal(
    (JSON.parse(linkedRoot.stdout) as ErrorReport).errors[0]!.code,
    "SOURCE_SYMLINK",
  );
  unlinkSync(join(remote.source.root, "standards.yaml"));
  symlinkSync("manifest.yaml", join(remote.source.root, "standards.yaml"));
  commit(remote.source.root);
  remote.publish("v1.0.0");
  const local = cli.run(["source", "validate", "--json"], remote.source.root);
  assert.equal(local.status, 1, local.stdout + local.stderr);
  assert.equal(
    (JSON.parse(local.stdout) as ErrorReport).errors[0]!.code,
    "SOURCE_SYMLINK",
  );
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(
    (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
    "SOURCE_SYMLINK",
  );
});

test("remote acquisition and local validation reject linked root license files", (t) => {
  const project = sourceFixture("");
  t.after(() => project.close());
  for (const name of ["LICENSE", "LICENCE.md", "license-extra.txt"]) {
    const remote = remoteFixture(yaml, {
      "readme.md": "README",
      "LICENSE.md": "License terms",
    });
    t.after(() => remote.close());
    symlinkSync("LICENSE.md", join(remote.source.root, name));
    commit(remote.source.root);
    remote.publish("v1.0.0");
    const local = cli.run(["source", "validate", "--json"], remote.source.root);
    assert.equal(local.status, 1, local.stdout + local.stderr);
    assert.equal(
      (JSON.parse(local.stdout) as ErrorReport).errors[0]!.code,
      "SOURCE_SYMLINK",
    );
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      "SOURCE_SYMLINK",
    );
  }
});

test("unselected links still participate in tree-listing integrity and source safety checks", (t) => {
  const project = sourceFixture("");
  t.after(() => project.close());
  for (const [code, change] of [
    [
      "SOURCE_INTEGRITY",
      (tree: GitTree) => {
        tree.tree = tree.tree.filter((entry) => entry.path !== "linked");
      },
    ],
    [
      "SOURCE_INTEGRITY",
      (tree: GitTree) => {
        tree.tree.find((entry) => entry.path === "linked")!.sha = "a".repeat(
          40,
        );
      },
    ],
    [
      "SOURCE_INTEGRITY",
      (tree: GitTree) => {
        tree.tree.push({
          type: "blob",
          mode: "120000",
          path: "invented-link",
          sha: "a".repeat(40),
        });
      },
    ],
    [
      "UNSAFE_SOURCE",
      (tree: GitTree) => {
        tree.tree.find((entry) => entry.path === "linked")!.path = "../escape";
      },
    ],
    [
      "UNSAFE_SOURCE",
      (tree: GitTree) => {
        tree.tree.find((entry) => entry.path === "linked")!.path = "README.md";
      },
    ],
    [
      "UNSAFE_SOURCE",
      (tree: GitTree) => {
        tree.tree.find((entry) => entry.path === "linked")!.mode = "100600";
      },
    ],
    [
      "UNSAFE_SOURCE",
      (tree: GitTree) => {
        const entry = tree.tree.find((entry) => entry.path === "linked")!;
        entry.mode = "160000";
        entry.type = "commit";
      },
    ],
  ] as const) {
    const remote = remoteFixture(yaml, { "readme.md": "README" });
    t.after(() => remote.close());
    symlinkSync("readme.md", join(remote.source.root, "linked"));
    commit(remote.source.root);
    const published = remote.publish("v1.0.0");
    change(
      remote.responses[
        `${remote.prefix}/git/trees/${published.treeSha}?recursive=1`
      ]!.body as GitTree,
    );
    remote.save();
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      code,
      result.stdout,
    );
  }
});

test("inspection rejects unsupported sources, floating references and incompatible selections with structured diagnostics", (t) => {
  const remote = remoteFixture(yaml, { "readme.md": "README" });
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  for (const source of [
    remote.source.root,
    "git@github.com:alice/standards.git",
    "https://gitlab.com/alice/standards",
    "https://github.com/alice/standards/tree/main",
    "https://github.com/alice/standards?ref=v1.0.0",
  ]) {
    const result = cli.run(
      inspectionArgs.map((arg) =>
        arg === "https://github.com/alice/standards" ? source : arg,
      ),
      project.root,
      remote.env,
    );
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      "UNSUPPORTED_SOURCE",
      result.stdout,
    );
  }
  for (const version of [
    "main",
    "latest",
    "^1.0.0",
    "v1.0.0-beta.1",
    "01.0.0",
    remote.sha,
  ]) {
    const result = cli.run(
      inspectionArgs.map((arg) => (arg === "v1.0.0" ? version : arg)),
      project.root,
      remote.env,
    );
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      "INVALID_STANDARDS_VERSION",
    );
  }
  const missing = cli.run(
    inspectionArgs.map((arg) => (arg === "work" ? "missing" : arg)),
    project.root,
    remote.env,
  );
  assert.equal(
    (JSON.parse(missing.stdout) as ErrorReport).errors[0]!.code,
    "UNKNOWN_PROFILE",
  );
  const incompatible = remoteFixture(yaml.replace(">=1.0.0", ">=99.0.0"), {
    "readme.md": "README",
  });
  t.after(() => incompatible.close());
  const result = cli.run(inspectionArgs, project.root, incompatible.env);
  assert.equal(
    (
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!
        .details as Diagnostic[]
    )[0]!.code,
    "INCOMPATIBLE_CLI",
  );
});

test("private, missing, truncated and corrupt remote snapshots are rejected", (t) => {
  const project = sourceFixture("");
  t.after(() => project.close());
  const cases: [string, (remote: ReturnType<typeof remoteFixture>) => void][] =
    [
      [
        "UNSUPPORTED_SOURCE",
        (remote) => {
          remote.responses[remote.prefix] = {
            body: { private: true, full_name: "alice/standards" },
          };
        },
      ],
      [
        "SOURCE_UNAVAILABLE",
        (remote) => {
          remote.responses[remote.prefix] = { status: 404, body: {} };
        },
      ],
      [
        "INVALID_SOURCE",
        (remote) => {
          (
            remote.responses[
              `${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`
            ]!.body as GitTree
          ).truncated = true;
        },
      ],
      [
        "UNSAFE_SOURCE",
        (remote) => {
          (
            remote.responses[
              `${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`
            ]!.body as GitTree
          ).tree.push({
            type: "blob",
            mode: "100644",
            path: "../escape",
            sha: "a".repeat(40),
          });
        },
      ],
      [
        "SOURCE_INTEGRITY",
        (remote) => {
          const entries = (
            remote.responses[
              `${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`
            ]!.body as GitTree
          ).tree;
          entries.find(
            (entry: { path: string }) => entry.path === "readme.md",
          )!.sha = "f".repeat(40);
        },
      ],
    ];
  for (const [code, mutate] of cases) {
    const remote = remoteFixture(yaml, { "readme.md": "README" });
    t.after(() => remote.close());
    mutate(remote);
    remote.save();
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1);
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      code,
      result.stdout,
    );
  }
  assert.equal(readFileSync(`${project.root}/standards.yaml`, "utf8"), "");
});

test("malformed GitHub responses are rejected as source errors", (t) => {
  const project = sourceFixture("");
  t.after(() => project.close());
  const cases: [string, (remote: ReturnType<typeof remoteFixture>) => void][] =
    [
      [
        "UNSUPPORTED_SOURCE",
        (remote) => {
          remote.responses[remote.prefix] = { body: null };
        },
      ],
      [
        "INVALID_SOURCE",
        (remote) => {
          remote.responses[`${remote.prefix}/git/commits/${remote.sha}`] = {
            body: null,
          };
        },
      ],
      [
        "UNSAFE_SOURCE",
        (remote) => {
          (
            remote.responses[
              `${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`
            ]!.body as { tree: unknown[] }
          ).tree.push({ type: "tree", mode: "040000", path: "docs", sha: 42 });
        },
      ],
    ];
  for (const [code, mutate] of cases) {
    const remote = remoteFixture(yaml, { "readme.md": "README" });
    t.after(() => remote.close());
    mutate(remote);
    remote.save();
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1);
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      code,
      result.stdout,
    );
  }
});

test("inspection rejects a GitHub tree listing that substitutes another reachable blob under the observed tree identity", (t) => {
  const remote = remoteFixture(yaml, {
    "readme.md": "README",
    "other.md": "Other reachable bytes",
  });
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const entries = (
    remote.responses[
      `${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`
    ]!.body as GitTree
  ).tree;
  entries.find((entry: { path: string }) => entry.path === "readme.md")!.sha =
    entries.find((entry: { path: string }) => entry.path === "other.md")!.sha;
  remote.save();

  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(
    (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
    "SOURCE_INTEGRITY",
  );
});

test("remote source references require exact Git path spelling for every material kind", (t) => {
  const operation = (field: string, path: string) =>
    `kind: file
      target: README.md
      exact: README.md
      checks:
        - id: check
          run: {executable: node, script: check.js, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=24.0.0"}
          timeout-seconds: 10`.replace(field, path);
  const cases = [
    {
      declaration:
        "kind: file\n      target: README.md\n      exact: readme.md",
      files: { "README.md": "Exact" },
      location: "/exact",
    },
    {
      declaration:
        "kind: file\n      target: README.md\n      guidance: readme.md",
      files: { "README.md": "Guidance" },
      location: "/guidance",
    },
    {
      declaration:
        "kind: repository\n      guidance: readme.md\n      targets: {paths: [README.md], directories: []}",
      files: { "README.md": "Guidance" },
      location: "/guidance",
    },
    {
      declaration:
        "kind: file\n      target: README.md\n      exact: docs/readme.md",
      files: { "Docs/readme.md": "Exact" },
      location: "/exact",
    },
    {
      declaration: "kind: skill\n      name: review\n      source: skill",
      files: { "Skill/SKILL.md": "Skill" },
      location: "/source",
    },
    {
      declaration: "kind: skill\n      name: review\n      source: skill",
      files: { "skill/skill.md": "Skill" },
      location: "/source",
    },
    {
      declaration: operation("script: check.js", "script: CHECK.js"),
      files: {
        "README.md": "Exact",
        "check.js": 'throw new Error("Do not run")',
      },
      location: "/checks/0/run/script",
    },
    {
      declaration: operation("resources: []", "resources: [resource.json]"),
      files: { "README.md": "Exact", "check.js": "", "Resource.json": "{}" },
      location: "/checks/0/run/resources/0",
    },
    {
      declaration: operation("resources: []", "resources: [resources]"),
      files: {
        "README.md": "Exact",
        "check.js": "",
        "Resources/data.json": "{}",
      },
      location: "/checks/0/run/resources/0",
    },
  ];
  const project = sourceFixture("");
  t.after(() => project.close());
  commit(project.root);
  for (const scenario of cases) {
    const source = yaml.replace(
      "kind: file\n      target: README.md\n      exact: readme.md",
      scenario.declaration,
    );
    const remote = remoteFixture(source, scenario.files);
    t.after(() => remote.close());
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(
      result.status,
      1,
      `${scenario.location}: ${result.stdout}${result.stderr}`,
    );
    const error = (JSON.parse(result.stdout) as ErrorReport).errors[0];
    assert.equal(error!.code, "INVALID_STANDARDS");
    assert.ok(
      (error!.details as Diagnostic[]).some(
        (detail: { code: string; path: string; line: number }) =>
          detail.code === "MISSING_REFERENCE" &&
          detail.path === `/defaults/declarations/readme${scenario.location}` &&
          detail.line > 0,
      ),
      result.stdout,
    );
  }
});

test("remote snapshots reject path aliases before host extraction can conflate distinct Git entries", (t) => {
  const project = sourceFixture("");
  t.after(() => project.close());
  for (const [left, right] of [
    ["Docs/a.md", "docs/b.md"],
    ["README.md", "readme.md"],
    ["Caf\u00e9/a.md", "Cafe\u0301/b.md"],
  ]) {
    const remote = remoteFixture(
      yaml.replace("exact: readme.md", "exact: seed.md"),
      { "seed.md": "README", "first.txt": "First", "second.txt": "Second" },
    );
    t.after(() => remote.close());
    const tree = (
      remote.responses[
        `${remote.prefix}/git/trees/${remote.treeSha}?recursive=1`
      ]!.body as { tree: { path: string }[] }
    ).tree;
    tree.find((entry) => entry.path === "first.txt")!.path = left!;
    tree.find((entry) => entry.path === "second.txt")!.path = right!;
    remote.save();
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(
      (JSON.parse(result.stdout) as ErrorReport).errors[0]!.code,
      "UNSAFE_SOURCE",
      result.stdout,
    );
  }
});

test("the remote root entry point must be spelled standards.yaml in Git", (t) => {
  const remote = remoteFixture(yaml, { "readme.md": "README" });
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  git(remote.source.root, "mv", "standards.yaml", "Standards.yaml");
  commit(remote.source.root);
  remote.publish("v1.0.0");
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const error = (JSON.parse(result.stdout) as ErrorReport).errors[0];
  assert.equal(error!.code, "INVALID_STANDARDS");
  assert.equal((error!.details as Diagnostic[])[0]!.code, "SOURCE_READ");
});
