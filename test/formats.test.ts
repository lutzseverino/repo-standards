import assert from "node:assert/strict";
import { after, test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { installCli } from "./installed-cli.ts";

const cli = installCli();
after(() => cli.close());
const { formats, readableFormat } = (await import(
  pathToFileURL(
    join(cli.root, "node_modules/@lutzseverino/repo-standards/dist/formats.js"),
  ).href
)) as typeof import("../src/formats.ts");

const recordFormats = [
  formats.state,
  formats.lock,
  formats.scopeHistory,
  formats.run,
];

test("a readable record must carry a format marker for every expected artifact", () => {
  for (const expected of recordFormats)
    for (const value of [undefined, null, {}, { format: undefined }])
      assert.equal(readableFormat(value, expected), false, expected);
});

test("current and explicitly supported previous record formats remain readable", () => {
  for (const expected of recordFormats)
    assert.equal(readableFormat({ format: expected }, expected), true);
  assert.equal(
    readableFormat({ format: "repo-standards/state/v7" }, formats.state),
    true,
  );
  assert.equal(
    readableFormat(
      { format: "repo-standards/scope-history/v5" },
      formats.scopeHistory,
    ),
    true,
  );
  for (const expected of recordFormats)
    for (const format of [
      "repo-standards/unrelated/v1",
      expected.replace(/v\d+$/, "v0"),
      expected.replace(/v\d+$/, "v999"),
    ])
      assert.equal(readableFormat({ format }, expected), false, format);
});
