import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { stringify } from "yaml";
import { assertNoMachineLocation } from "./committed-evidence.ts";
import { directoryFixture } from "./installed-cli.ts";
import { git } from "./remote-fixture.ts";

function fixture(t: TestContext, files: Record<string, string>) {
  const directory = directoryFixture("repo-standards-evidence-");
  t.after(() => directory.close());
  git(directory.root, "init", "--quiet", "--initial-branch=main");
  for (const [path, text] of Object.entries({ "state.json": "{}", ...files })) {
    const target = join(directory.root, ".repo-standards", path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  return directory.root;
}

test("committed evidence allows exact authored executables beneath a rejected location in retained JSON and YAML", (t) => {
  const executable = "/tmp/authored-node/bin/node";
  const declarations = [{ fixes: [{ run: { executable } }] }];
  const root = fixture(t, {
    "inputs/resolved.json": JSON.stringify({ declarations }, null, 2),
    "inputs/standards.yaml": stringify({ declarations }),
  });
  assert.doesNotThrow(() =>
    assertNoMachineLocation(root, [root, "/tmp"], [executable]),
  );
});

test("committed evidence recognizes escaped JSON and quoted YAML authored values", (t) => {
  const executable = `/tmp/node "double" and 'single'/bin/node`;
  const value = { operations: [{ executable }, { executable }] };
  const root = fixture(t, {
    "inputs/resolved.json": JSON.stringify(value),
    "inputs/single.yaml": stringify(value, {
      defaultStringType: "QUOTE_SINGLE",
    }),
    "inputs/double.yaml": stringify(value, {
      defaultStringType: "QUOTE_DOUBLE",
    }),
  });
  assert.doesNotThrow(() =>
    assertNoMachineLocation(root, [root, "/tmp"], [executable]),
  );
});

const executable = "/tmp/authored-node/bin/node";
const serializations = [
  { extension: "json", serialize: JSON.stringify },
  { extension: "yaml", serialize: stringify },
];
const locationFailure = {
  code: "ERR_ASSERTION",
  message:
    /committed evidence must not record an absolute path or a path outside the project/,
};

for (const { extension, serialize } of serializations) {
  test(`committed ${extension} evidence still rejects a separate machine location alongside an authored executable`, (t) => {
    const root = fixture(t, {});
    const locations = [
      root,
      `${root}/support`,
      `${root}/.git/worktrees/linked`,
      "/tmp",
    ];
    for (const machine of locations) {
      writeFileSync(
        join(root, `.repo-standards/inputs.${extension}`),
        serialize({ executable, message: `Observed at ${machine}` }),
      );
      assert.throws(
        () => assertNoMachineLocation(root, locations, [executable]),
        locationFailure,
      );
    }
  });

  test(`committed ${extension} evidence does not allow siblings, extensions or embedded authored paths`, (t) => {
    const root = fixture(t, {});
    for (const other of [
      "/tmp/authored-node/bin/other",
      `${executable}-debug`,
      `${executable}/child`,
      `Observed at ${executable}`,
      `${executable} --version`,
    ]) {
      writeFileSync(
        join(root, `.repo-standards/inputs.${extension}`),
        serialize({ executable, other }),
      );
      assert.throws(
        () => assertNoMachineLocation(root, ["/tmp"], [executable]),
        locationFailure,
      );
    }
  });

  test(`committed ${extension} evidence does not exempt authored paths used as keys`, (t) => {
    const root = fixture(t, {
      [`inputs.${extension}`]: serialize({ [executable]: executable }),
    });
    assert.throws(
      () => assertNoMachineLocation(root, ["/tmp"], [executable]),
      locationFailure,
    );
  });
}

test("committed evidence rejects non-authored absolute paths and parent traversal in JSON keys and values", (t) => {
  const root = fixture(t, {});
  for (const forbidden of [
    { executable },
    { path: "/unlisted/private" },
    { path: "../outside" },
    { path: "nested/../../outside" },
    { path: "../../.agents/skills/review/extra" },
    { "/unlisted/private": "value" },
    { "../outside": "value" },
  ]) {
    writeFileSync(
      join(root, ".repo-standards/state.json"),
      JSON.stringify(forbidden),
    );
    assert.throws(() => assertNoMachineLocation(root, []), locationFailure);
  }
});

test("committed evidence keeps the narrow in-project skill-link exemption", (t) => {
  const root = fixture(t, {
    "state.json": JSON.stringify({
      links: { review: "../../.agents/skills/review" },
    }),
  });
  assert.doesNotThrow(() => assertNoMachineLocation(root, [root]));
});

test("committed evidence still scans YAML comments and ordinary text for machine locations", (t) => {
  const root = fixture(t, {});
  for (const [path, text] of [
    ["inputs.yaml", `${stringify({ executable })}# Observed at /tmp\n`],
    ["inputs.txt", `Executable: "${executable}"\n`],
  ]) {
    const target = join(root, ".repo-standards", path!);
    writeFileSync(target, text!);
    assert.throws(
      () => assertNoMachineLocation(root, ["/tmp"], [executable]),
      locationFailure,
    );
    writeFileSync(target, "");
  }
});
