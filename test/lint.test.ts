import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const consumer = "site/src/lint-consumer.ts";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "repo-standards-lint-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".gitignore",
    ".oxlintrc.json",
    "tsconfig.json",
    "docs",
    "site",
  ]) {
    cpSync(join(repository, file), join(root, file), {
      recursive: true,
      filter: (path) =>
        !["node_modules", ".astro", "dist"].includes(basename(path)),
    });
  }
  for (const directory of ["node_modules", "site/node_modules"])
    symlinkSync(join(repository, directory), join(root, directory), "dir");
  const git = spawnSync("git", ["init", "--quiet", root], { encoding: "utf8" });
  assert.equal(git.status, 0, git.stdout + git.stderr);
  writeFileSync(
    join(root, consumer),
    'import { getCollection } from "astro:content";\n' +
      'export const titles = (await getCollection("docs")).map((entry) => entry.data.title.trim());\n',
  );
  return {
    root,
    lint: (...args: string[]) =>
      spawnSync("pnpm", ["lint", ...args], {
        cwd: root,
        // Borrow the frozen installation without pnpm trying to relocate it.
        env: { ...process.env, pnpm_config_verify_deps_before_run: "false" },
        encoding: "utf8",
        timeout: 120_000,
      }),
  };
}

test("root lint generates usable Astro collection types from a clean checkout", (t) => {
  const { root, lint } = fixture(t);
  assert.equal(existsSync(join(root, "site/.astro")), false);
  assert.equal(existsSync(join(root, "dist")), false);

  const result = lint();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(existsSync(join(root, "site/.astro/types.d.ts")));
  assert.match(
    readFileSync(join(root, "site/.astro/content.d.ts"), "utf8"),
    /["']docs["']/,
  );
});

test("root lint refreshes collection types and forwards paths, fixes and lint failures", (t) => {
  const { root, lint } = fixture(t);
  const initial = lint(consumer);
  assert.equal(initial.status, 0, initial.stdout + initial.stderr);

  const config = join(root, "site/src/content.config.ts");
  writeFileSync(
    config,
    readFileSync(config, "utf8").replace(
      "docs: defineCollection",
      "refreshedDocs: defineCollection",
    ),
  );
  const source = join(root, consumer);
  writeFileSync(
    source,
    readFileSync(source, "utf8").replace('"docs"', '"refreshedDocs"') +
      'export let fixable = "title";\n',
  );
  // This violation must remain outside the caller's selected lint paths.
  writeFileSync(
    join(root, "site/src/unselected.ts"),
    "export const value: any = 1;\n",
  );
  const fixed = lint(consumer, "--fix");
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.match(readFileSync(source, "utf8"), /export const fixable/);
  assert.match(
    readFileSync(join(root, "site/.astro/content.d.ts"), "utf8"),
    /["']refreshedDocs["']/,
  );

  writeFileSync(source, "export const value: any = 1;\n");
  const invalid = lint(consumer);
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout + invalid.stderr, /no-explicit-any/);

  writeFileSync(source, "debugger;\n");
  const warning = lint(consumer);
  assert.equal(warning.status, 1, warning.stdout + warning.stderr);
  assert.match(warning.stdout + warning.stderr, /no-debugger/);
});

test("root lint stops on failed synchronization instead of linting with stale types", (t) => {
  const { root, lint } = fixture(t);
  const initial = lint(consumer);
  assert.equal(initial.status, 0, initial.stdout + initial.stderr);
  writeFileSync(
    join(root, "site/astro.config.mjs"),
    'throw new Error("lint sync failure fixture");\n',
  );
  const fixable = 'export let fixable = "title";\n';
  writeFileSync(join(root, consumer), fixable);

  const result = lint(consumer, "--fix");
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.error, undefined);
  assert.match(result.stdout + result.stderr, /lint sync failure fixture/);
  assert.equal(readFileSync(join(root, consumer), "utf8"), fixable);
});
