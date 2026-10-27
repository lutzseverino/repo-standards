import type { Run, Status } from "./json-reports.ts";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateMetadata } from "./pr-metadata.ts";
import { after, test } from "node:test";
import type { TestContext } from "node:test";
import { installCli } from "./installed-cli.ts";
import { manifest as standards, versionArgs } from "./remote-fixture.ts";
import { adoptionFixture } from "./adoption-fixture.ts";

const cli = installCli();
after(() => cli.close());

const instructions = {
  kind: "file",
  target: "AGENTS.md",
  exact: "agents.md",
};
// A version's standards.yaml, with the author-written line when it has one.
const versioned = (adopterAction?: string) =>
  standards({ instructions }).replace(
    "defaults:",
    `${adopterAction === undefined ? "" : `adopter-action: ${adopterAction}\n`}defaults:`,
  );

async function fixture(t: TestContext, adopted = true) {
  const f = await adoptionFixture(t, cli, versioned(), {
    files: { "agents.md": "Pinned instructions\n" },
    project: { "README.md": "# Project\n" },
  });
  if (adopted) f.adopt(versionArgs("v1.0.0"));
  f.remote.addVersion("v1.1.0", versioned("Rotate the deploy key."), {
    "agents.md": "Instructions v1.1.0\n",
  });
  f.remote.addVersion("v1.2.0", versioned("Re-run the label sync."), {
    "agents.md": "Instructions v1.2.0\n",
  });
  return f;
}

// The installed Repo Canon pull request validator's verdict on a body.
function validate(f: { root: string }, title: string, body: string) {
  const event = join(f.root, ".git", "event.json");
  writeFileSync(event, JSON.stringify({ pull_request: { title, body } }));
  return validateMetadata(event);
}

test("an update skipping a release derives its line and records every release's author-written line", async (t) => {
  const f = await fixture(t);
  const args = versionArgs("v1.2.0");

  // The inspection derives the line, deterministically, and shows the
  // candidate release's author-written line beside it.
  const inspection = f.inspect(args);
  assert.equal(inspection.updateClass, "exact");
  assert.deepEqual(inspection.adopterAction, {
    derived:
      "Exact update: nothing is needed beyond reviewing and committing the update.",
    authored: "Re-run the label sync.",
  });
  assert.deepEqual(f.inspect(args).adopterAction, inspection.adopterAction);
  const summary = f.run([...args.slice(0, -1), "--summary"]).stdout;
  assert.match(
    summary,
    /\n## Adopter action\n\nExact update: nothing is needed beyond reviewing and committing the update\.\n\nAuthor-written action of `v1\.2\.0`: Re-run the label sync\.\n/,
  );

  const started = f.json<Run>([
    "start",
    ...args.slice(1),
    "--identity",
    inspection.identity,
  ]);
  assert.equal(started.report.outcome, "complete", started.result.stdout);

  // The record ends with Impact then Migration: the derived line, and the
  // author-written lines of the skipped and the adopted release, oldest first.
  const record = f.run(["status", "--summary"]).stdout;
  assert.deepEqual(
    record.split("\n").filter((line) => /^#{1,2} /.test(line)),
    [
      "# Repository Standards adoption record",
      "## Ready to commit",
      "## Selection",
      "## Operations",
      "## Changed paths",
      "## Scope changes",
      "## Identities",
      "## Impact",
      "## Migration",
    ],
  );
  assert.ok(
    record.endsWith(`## Impact

Exact update: nothing is needed beyond reviewing and committing the update.

| Release | Adopter action |
| --- | --- |
| \`v1.1.0\` | Rotate the deploy key. |
| \`v1.2.0\` | Re-run the label sync. |

## Migration

1. Release v1.1.0: Rotate the deploy key.
2. Release v1.2.0: Re-run the label sync.
3. Review and commit the update.
`),
    record,
  );
  const status = f.json<Status>(["status", "--json"]).report;
  assert.deepEqual(status.impact, {
    derived:
      "Exact update: nothing is needed beyond reviewing and committing the update.",
    releases: [
      { version: "v1.1.0", action: "Rotate the deploy key." },
      { version: "v1.2.0", action: "Re-run the label sync." },
    ],
    steps: [
      "Release v1.1.0: Rotate the deploy key.",
      "Release v1.2.0: Re-run the label sync.",
      "Review and commit the update.",
    ],
  });

  // Both a plain and a breaking title accept the record as the body.
  for (const title of [
    `chore: adopt standards v1.2.0 with CLI ${cli.version}`,
    `chore!: adopt standards v1.2.0 with CLI ${cli.version}`,
  ]) {
    const verdict = validate(f, title, record);
    assert.equal(verdict.status, 0, verdict.stdout + verdict.stderr);
  }
});

test("a release the lookup cannot read is reported in the record without failing the update", async (t) => {
  const f = await fixture(t);
  delete f.remote.responses[
    `${f.remote.prefix}/contents/standards.yaml?ref=v1.1.0`
  ];
  f.remote.save();
  const started = f.start(versionArgs("v1.2.0"));
  assert.equal(started.report.outcome, "complete", started.result.stdout);
  const status = f.json<Status>(["status", "--json"]).report;
  const [skipped, adopted] = status.impact!.releases;
  assert.equal(skipped!.version, "v1.1.0");
  assert.equal(skipped!.action, null);
  assert.equal(skipped!.reason!.code, "SOURCE_UNAVAILABLE");
  assert.deepEqual(adopted, {
    version: "v1.2.0",
    action: "Re-run the label sync.",
  });
  const record = f.run(["status", "--summary"]).stdout;
  assert.match(
    record,
    /\| `v1\.1\.0` \| Unreadable: `SOURCE_UNAVAILABLE` .* \|\n\| `v1\.2\.0` \| Re-run the label sync\. \|/,
  );
  assert.match(
    record,
    /1\. Check release v1\.1\.0 for an author-written adopter action: its standards\.yaml could not be read \(SOURCE\\_UNAVAILABLE\)\.\n2\. Release v1\.2\.0: Re-run the label sync\.\n3\. Review and commit the update\.\n$/,
  );
  for (const title of [
    `chore: adopt standards v1.2.0 with CLI ${cli.version}`,
    `chore!: adopt standards v1.2.0 with CLI ${cli.version}`,
  ]) {
    const verdict = validate(f, title, record);
    assert.equal(verdict.status, 0, verdict.stdout + verdict.stderr);
  }
});

test("an initial adoption records only the adopted release's line", async (t) => {
  const f = await fixture(t, false);
  const inspection = f.inspect(versionArgs("v1.1.0"));
  assert.equal(inspection.updateClass, undefined);
  assert.deepEqual(inspection.adopterAction, {
    derived:
      "Initial adoption: the run asks for no contextual work, so nothing is needed beyond reviewing and committing the adoption.",
    authored: "Rotate the deploy key.",
  });
  const started = f.start(versionArgs("v1.1.0"));
  assert.equal(started.report.outcome, "complete", started.result.stdout);
  const impact = f.json<Status>(["status", "--json"]).report.impact!;
  assert.deepEqual(impact.releases, [
    { version: "v1.1.0", action: "Rotate the deploy key." },
  ]);
  assert.equal(impact.skipped, undefined);
  assert.deepEqual(impact.steps, [
    "Release v1.1.0: Rotate the deploy key.",
    "Review and commit the adoption.",
  ]);
});

test("an unreadable release list is reported in the record without failing the update", async (t) => {
  const f = await fixture(t);
  delete f.remote.responses[`${f.remote.prefix}/releases?per_page=100`];
  f.remote.save();
  const started = f.start(versionArgs("v1.2.0"));
  assert.equal(started.report.outcome, "complete", started.result.stdout);
  const impact = f.json<Status>(["status", "--json"]).report.impact!;
  assert.deepEqual(impact.releases, [
    { version: "v1.2.0", action: "Re-run the label sync." },
  ]);
  assert.equal(impact.skipped!.code, "SOURCE_UNAVAILABLE");
  assert.equal(
    impact.steps[0],
    "Check the releases since the previous selection for author-written adopter actions: they could not be listed (SOURCE_UNAVAILABLE).",
  );
  const verdict = validate(
    f,
    `chore!: adopt standards v1.2.0 with CLI ${cli.version}`,
    f.run(["status", "--summary"]).stdout,
  );
  assert.equal(verdict.status, 0, verdict.stdout + verdict.stderr);
});
