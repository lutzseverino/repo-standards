import assert from "node:assert/strict";
import { test } from "node:test";
import { docsDescription } from "../src/lib/docs-content.ts";

test("descriptions preserve visible prose without Markdown or HTML syntax", () => {
  assert.equal(
    docsDescription(
      "# Heading\n\nUse [the **guide**](https://example.com) with `adopt` and <em>care</em> &amp; attention.\nKeep going.",
      "Heading",
    ),
    "Use the guide with adopt and care & attention. Keep going.",
  );
});

test("descriptions skip code, lists and standalone ADR notices", () => {
  assert.equal(
    docsDescription(
      `# Decision

Status: Accepted.

**Supersedes:** [old decision](old.md).

Amends [another decision](another.md).

\`\`\`sh
npm install
\`\`\`

- An example
- Another example

Use the published release to keep every repository consistent.`,
      "Decision",
    ),
    "Use the published release to keep every repository consistent.",
  );
});

test("descriptions keep short prose and truncate long prose at a word boundary", () => {
  assert.equal(
    docsDescription("# Short\n\nShort prose.", "Short"),
    "Short prose.",
  );
  const description = docsDescription(
    "# Long\n\n" +
      "Keep each repository consistent with published standards. ".repeat(5),
    "Long",
  );
  assert.equal(
    description,
    "Keep each repository consistent with published standards. Keep each repository consistent with published standards. Keep each repository consistent with…",
  );
  assert.ok(description.length <= 155);
});

test("documents without prose receive a readable title-based fallback", () => {
  assert.equal(
    docsDescription("# Commands\n\n```sh\nadopt\n```\n\n- A list", "Commands"),
    "Commands — Repo Standards documentation.",
  );
  assert.equal(
    docsDescription("# Notice\n\n![diagram](image.svg)", "Notice"),
    "Notice — Repo Standards documentation.",
  );
});

test("an ADR relationship sentence does not discard the prose that follows it", () => {
  assert.equal(
    docsDescription(
      "# Recovery\n\nAmends [ADR 0009](0009.md). A stopped run can recover in place.",
      "Recovery",
    ),
    "A stopped run can recover in place.",
  );
});

test("descriptions skip tables and remove GFM formatting", () => {
  assert.equal(
    docsDescription(
      "# Guide\n\n| Command | Meaning |\n| --- | --- |\n| adopt | Install |\n\nUse ~~old~~ **published** standards.",
      "Guide",
    ),
    "Use old published standards.",
  );
});

test("descriptions preserve HTML prose without tags or hidden content", () => {
  assert.equal(
    docsDescription(
      "# Title\n\n<!-- editorial note -->\n\n<script>hidden()</script>\n\n<p>Use <em>published</em> standards<br>with <code>adopt</code>.</p>",
      "Title",
    ),
    "Use published standards with adopt.",
  );
});

test("quoted prose is suitable but nested list text is not", () => {
  assert.equal(
    docsDescription(
      "# Guide\n\n- Ignore this list paragraph.\n\n> > Use published standards.",
      "Guide",
    ),
    "Use published standards.",
  );
});
