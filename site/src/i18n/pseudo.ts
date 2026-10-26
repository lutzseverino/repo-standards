// The pseudo-locale, generated from the source locale: every text is wrapped
// in ⟦ ⟧ and padded by about 30%, so text that skipped the catalogs, text
// cut off by its box, and text built by joining messages show at a glance.
// MF2 syntax, placeholders, Markdown structure, code and URLs stay intact.
import type { Text } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";
import { visit } from "unist-util-visit";
import { mapPatterns } from "./message.ts";
import {
  proseParts,
  sourceHash,
  type LocaleTranslations,
} from "./translations.ts";

const padding = (text: string) => "·".repeat(Math.ceil(text.length * 0.3));

/** One MF2 message, each variant's pattern wrapped and padded. */
function pseudoMessage(source: string): string {
  return mapPatterns(source, (pattern, text) => [
    "⟦",
    ...pattern,
    `${padding(text)}⟧`,
  ]);
}

/** A Markdown body, each run of text wrapped and padded. */
function pseudoProse(markdown: string): string {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  visit(tree, "text", (node: Text) => {
    node.value = `⟦${node.value}${padding(node.value)}⟧`;
  });
  return toMarkdown(tree, { extensions: [gfmToMarkdown()] });
}

/** The pseudo-locale's translations of `source`, the source locale's, each
 * recording the hash of what it translates, as a translation would. */
export function pseudoTranslations(
  source: LocaleTranslations,
): LocaleTranslations {
  return {
    messages: Object.fromEntries(
      Object.entries(source.messages).map(([id, message]) => [
        id,
        typeof message === "string"
          ? { message: pseudoMessage(message), source: sourceHash(message) }
          : message,
      ]),
    ),
    prose: Object.fromEntries(
      Object.entries(source.prose).map(([name, text]) => [
        name,
        `---\nsource: ${sourceHash(text)}\n---\n${pseudoProse(proseParts(text).body)}`,
      ]),
    ),
  };
}
