// The pseudo-locale's generator: each text keeps its markers and about 30%
// expansion, and a long expansion wraps like the words of a longer
// translation, so a narrow screen shows only real overflow.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMessage } from "../src/i18n/message.ts";
import { pseudoTranslations } from "../src/i18n/pseudo.ts";
import { proseParts, sourceHash } from "../src/i18n/translations.ts";

const BREAK = "\u200B";
// 186 characters, padded by 56 dots
const sentence =
  "The CLI selects a version and a profile, records them in the repository, pins that version and the CLI that ran, and applies the exact part of the version, checking it before it commits.";

const generate = (messages: Record<string, string>, prose = {}) =>
  pseudoTranslations({ messages, prose });

// what a reader sees, without the padding's break opportunities
const visible = (text: string) => text.replaceAll(BREAK, "");

test("long prose keeps its markers and about 30% expansion, which wraps", () => {
  const { prose } = generate({}, { page: `# Title\n\n${sentence}\n` });
  const paragraph =
    proseParts(prose.page ?? "")
      .body.split("\n\n")[1]
      ?.trim() ?? "";
  assert.equal(visible(paragraph), `⟦${sentence}${"·".repeat(56)}⟧`);
  // five dots lengthen the last word, and the rest breaks every five
  assert.match(paragraph, /commits\.·····(\u200B·{1,5})+⟧$/);
  assert.doesNotMatch(paragraph, /·{6}/);
});

test("a long MF2 pattern keeps its markers, variants and placeholders, and its expansion wraps", () => {
  const source = `.input {$count :integer}\n.match $count\none {{{$number} source ${sentence}}}\n* {{{$number} sources ${sentence}}}`;
  const { messages } = generate({ "home.left-out": source });
  const entry = messages["home.left-out"] as {
    message: string;
    source: string;
  };
  assert.equal(entry.source, sourceHash(source));
  assert.match(
    entry.message,
    /^\.input \{\$count :integer\}\n\.match \$count\n/,
  );
  for (const [count, word] of [
    [1, "source"],
    [2, "sources"],
  ] as const) {
    const shown = formatMessage("en-XA", "home.left-out", entry.message, {
      count,
      number: "<n>",
    });
    // the pattern's own text, without its placeholder, is padded by 59 dots
    assert.equal(visible(shown), `⟦<n> ${word} ${sentence}${"·".repeat(59)}⟧`);
    assert.match(shown, /commits\.·····(\u200B·{1,5})+⟧$/);
    assert.doesNotMatch(shown, /·{6}/);
  }
});

test("a short label's padding stays one unbroken word", () => {
  const { messages } = generate({ "common.copy": "Copy" });
  assert.equal(
    (messages["common.copy"] as { message: string }).message,
    "⟦Copy··⟧",
  );
});

test("prose keeps its Markdown structure, link targets, URLs and code", () => {
  const markdown = [
    "# How it works",
    "",
    "Read [the guide](/docs/guides/adopt/) or <https://github.com/lutzseverino/repo-canon>, then run `npx repo-standards adopt` again.",
    "",
    "- First item",
    "- Second item",
    "",
    "```",
    "npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS",
    "```",
    "",
  ].join("\n");
  const body = visible(
    proseParts(generate({}, { page: markdown }).prose.page ?? "").body,
  );
  assert.match(body, /^# ⟦How it works····⟧$/m);
  assert.match(body, /\[⟦the guide···⟧\]\(\/docs\/guides\/adopt\/\)/);
  assert.match(body, /\]\(https:\/\/github\.com\/lutzseverino\/repo-canon\)/);
  assert.match(body, /⟧`npx repo-standards adopt`⟦/);
  assert.match(body, /^\* ⟦First item···⟧$/m);
  assert.match(body, /^\* ⟦Second item····⟧$/m);
  assert.match(
    body,
    /^```\nnpx @lutzseverino\/repo-standards adopt https:\/\/github\.com\/OWNER\/STANDARDS\n```$/m,
  );
});
