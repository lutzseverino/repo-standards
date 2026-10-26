import assert from "node:assert/strict";
import { test } from "node:test";
import {
  format,
  messageSource,
  prose,
  rich,
  siteMessages,
  strings,
} from "../src/i18n/format.ts";
import type { MessageId } from "../src/i18n/ids.ts";
import type { Locale } from "../src/i18n/locales.ts";
import { formatMessage } from "../src/i18n/message.ts";

test("format() reads the English catalogs", () => {
  assert.equal(
    format("en", "common.notice"),
    "Anyone can list a source here. Review one before you adopt it.",
  );
  assert.equal(
    format("en", "home.search.no-match", { query: "<x>" }),
    "No standards source matches “<x>”",
  );
});

test("format() selects plural variants on the raw count and shows the formatted number", () => {
  const leftOut = (count: number) =>
    format("en", "home.sources.left-out", {
      count,
      number: String(count),
    });
  assert.match(leftOut(1), /^1 more repository carries the topic/);
  assert.match(leftOut(2), /^2 more repositories carry the topic/);
});

test("format() throws for a locale the site does not serve", () => {
  assert.throws(
    () => format("es" as Locale, "common.notice"),
    /The site has no locale es\./,
  );
});

test("format() throws for an unknown message ID", () => {
  assert.throws(
    () => format("en", "common.missing" as MessageId),
    /There is no message common\.missing in en\./,
  );
});

test("format() throws for a missing variable instead of showing a fallback", () => {
  assert.throws(
    () => format("en", "home.search.no-match"),
    /Message home\.search\.no-match in en: .*\$query/,
  );
});

test("format() throws for a message that doesn't parse", () => {
  const { format: fixture } = siteMessages({
    en: { messages: { "common.notice": "Hello {$name" }, prose: {} },
  });
  assert.throws(
    () => fixture("en", "common.notice", { name: "x" }),
    /Message common\.notice in en: /,
  );
});

test("format() throws for a malformed entry", () => {
  const { format: fixture } = siteMessages({
    en: { messages: { "common.notice": { message: "Hello" } }, prose: {} },
  });
  assert.throws(
    () => fixture("en", "common.notice"),
    /The message common\.notice in en is malformed\./,
  );
});

test("the pseudo-locale wraps and pads each message and keeps its placeholders", () => {
  assert.equal(
    format("en-XA", "home.search.no-match", { query: "x" }),
    "⟦No standards source matches “x”·········⟧",
  );
  assert.match(
    messageSource("en-XA", "home.sources.left-out"),
    /^\.input \{\$count :integer\}\n\.match \$count\none \{\{⟦\{\$number\} more repository/,
  );
  assert.match(
    prose("en-XA", "how-it-works"),
    /^# ⟦How Repo Standards works·+⟧$/m,
  );
});

test("strings() finishes messages for an island", () => {
  assert.deepEqual(strings("en", ["adoption.copy", "adoption.copied"]), {
    "adoption.copy": "Copy",
    "adoption.copied": "Copied",
  });
});

test("rich() leaves a slot for each element, where the message places it", () => {
  assert.deepEqual(
    rich("en", "home.sources.origin", { version: "1.2.3" }, ["topic"]),
    [
      "Sources come from the public GitHub topic ",
      "topic",
      ", validated with CLI 1.2.3.",
    ],
  );
  assert.deepEqual(
    rich("en-XA", "home.support.invitation", {}, ["first", "second"]).filter(
      (_, i) => i % 2 === 1,
    ),
    ["first", "second"],
  );
});

test("prose() returns a file's body without its front matter", () => {
  const { prose: fixture } = siteMessages({
    en: { messages: {}, prose: { page: "# Page\n" } },
  });
  assert.equal(fixture("en", "page"), "# Page\n");
  assert.throws(
    () => fixture("en", "other"),
    /There is no prose other in en\./,
  );
});

test("the client's formatter inserts values as they are, without bidi marks", () => {
  assert.equal(
    formatMessage("en", "x", "Hello {$name}.", { name: "Kat" }),
    "Hello Kat.",
  );
});

test("the formatter selects Spanish and Catalan `many` plurals that English lacks", () => {
  const source =
    ".input {$count :integer} .match $count one {{one}} many {{many}} * {{other}}";
  for (const locale of ["es", "ca"]) {
    assert.equal(formatMessage(locale, "x", source, { count: 1 }), "one");
    assert.equal(formatMessage(locale, "x", source, { count: 2 }), "other");
    assert.equal(
      formatMessage(locale, "x", source, { count: 1_000_000 }),
      "many",
    );
  }
  assert.equal(formatMessage("en", "x", source, { count: 1_000_000 }), "other");
});
