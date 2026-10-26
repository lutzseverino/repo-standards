// Records that a translation is current: for each message ID or prose file
// named, the locale's entry gets the hash of the current English text. Only
// what a person names, after updating its translation; never everything.
//
//   pnpm --dir site i18n:source <locale> <area.key | prose/name>...
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_LOCALE } from "../src/i18n/locales.ts";
import {
  isTranslated,
  parseTranslations,
  readTranslationFiles,
  sourceHash,
} from "../src/i18n/translations.ts";

const root = fileURLToPath(new URL("../src/i18n/", import.meta.url));
const [locale, ...names] = process.argv.slice(2);
if (!locale || names.length === 0)
  fail(
    "Name a locale and each message ID or prose/<name> whose translation you updated.",
  );
if (locale === DEFAULT_LOCALE)
  fail(`${DEFAULT_LOCALE} is the source; its entries record no hash.`);
const english = parseTranslations(readTranslationFiles(root))[DEFAULT_LOCALE];
if (!english) fail(`There are no ${DEFAULT_LOCALE} translations.`);

// every name is checked before any file is written
const files = new Map<string, string>();
const read = (file: string) => files.get(file) ?? readFileSync(file, "utf8");
for (const name of names) {
  const prose = /^prose\/(.+)$/.exec(name)?.[1];
  if (prose) {
    const source = english.prose[prose];
    if (source === undefined)
      fail(`There is no ${DEFAULT_LOCALE} prose ${prose}.`);
    const file = `${root}prose/${locale}/${prose}.md`;
    const text = read(file);
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!front || !/^source:/m.test(front[1]))
      fail(`${file} has no front matter with a source.`);
    files.set(
      file,
      `---\n${front[1].replace(/^source:.*$/m, `source: ${sourceHash(source)}`)}\n---\n${text.slice(front[0].length)}`,
    );
  } else {
    const source = english.messages[name];
    if (typeof source !== "string")
      fail(`There is no ${DEFAULT_LOCALE} message ${name}.`);
    const [area, ...key] = name.split(".");
    const file = `${root}messages/${locale}/${area}.json`;
    const catalog = JSON.parse(read(file)) as Record<string, unknown>;
    const entry = catalog[key.join(".")];
    if (!isTranslated(entry)) fail(`${file} has no translation of ${name}.`);
    entry.source = sourceHash(source);
    files.set(file, `${JSON.stringify(catalog, null, 2)}\n`);
  }
}
for (const [file, text] of files) writeFileSync(file, text);
console.log(
  `${locale} records the current ${DEFAULT_LOCALE} source of ${names.join(", ")}.`,
);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
