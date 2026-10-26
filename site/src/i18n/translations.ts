// The translation files and their one check, knowing nothing of the site, so
// both can be lifted out. A root holds `messages/<locale>/<area>.json`, the
// UI strings, and `prose/<locale>/<name>.md`, the prose pages. A source
// locale's message is a plain MF2 string; a translated one is
// `{ "message": ..., "source": ... }`, where `source` is the hash of the
// source message it translates. A translated prose file records, as `source`
// in its front matter, the hash of the whole source file.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { messageVariables } from "./message.ts";

/** Each file's text by its path under the root, such as
 * `messages/en/home.json`. */
export type TranslationFiles = Record<string, string>;

export type LocaleTranslations = {
  /** Each message's catalog entry by its ID, `<area>.<key>`. */
  messages: Record<string, unknown>;
  /** Each prose file's whole text by its name. */
  prose: Record<string, string>;
};

/** Every locale's messages and prose, by locale tag. */
export type Translations = Record<string, LocaleTranslations>;

export type TranslatedMessage = { message: string; source: string };

const MESSAGES = /^messages\/([^/]+)\/([^/]+)\.json$/;
const PROSE = /^prose\/([^/]+)\/([^/]+)\.md$/;
const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;

/** Reads every message catalog and prose file under `root`. */
export function readTranslationFiles(root: string): TranslationFiles {
  const files: TranslationFiles = {};
  for (const file of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    const name = file.split(path.sep).join("/");
    if (MESSAGES.test(name) || PROSE.test(name))
      files[name] = readFileSync(path.join(root, file), "utf8");
  }
  return files;
}

/** Groups the files by locale. It throws on a catalog that isn't a JSON
 * object; the checks report everything else. */
export function parseTranslations(files: TranslationFiles): Translations {
  const translations: Translations = {};
  const of = (locale: string) =>
    (translations[locale] ??= { messages: {}, prose: {} });
  for (const [file, text] of Object.entries(files)) {
    const message = MESSAGES.exec(file);
    if (message) {
      const [, locale, area] = message;
      const catalog: unknown = JSON.parse(text);
      if (!isRecord(catalog))
        throw new Error(`${file} is not a JSON object of messages.`);
      for (const [key, entry] of Object.entries(catalog))
        of(locale).messages[`${area}.${key}`] = entry;
      continue;
    }
    const prose = PROSE.exec(file);
    if (prose) of(prose[1]).prose[prose[2]] = text;
  }
  return translations;
}

/** The short, stable hash a translation records of its source. */
export function sourceHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

/** A prose file's body, and the source hash its front matter records. */
export function proseParts(text: string): { source?: string; body: string } {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { body: text };
  // every scalar a string, so a hash of digits stays a hash
  const data: unknown = parseYaml(match[1], { schema: "failsafe" });
  const source =
    isRecord(data) && typeof data.source === "string" ? data.source : "";
  return { source, body: text.slice(match[0].length) };
}

/** Every problem with the translations, compared with `sourceLocale`. Each
 * check passes or fails: there is no warning. */
export function checkTranslations(
  translations: Translations,
  sourceLocale: string,
): string[] {
  const problems: string[] = [];
  const source = translations[sourceLocale];
  if (!source) return [`There are no ${sourceLocale} translations.`];

  const variables = new Map<string, Set<string>>();
  for (const [id, entry] of Object.entries(source.messages)) {
    if (typeof entry !== "string") {
      problems.push(`${sourceLocale}: ${id} is not a plain MF2 string.`);
      continue;
    }
    const used = parseable(sourceLocale, id, entry, problems);
    if (used) variables.set(id, used);
  }

  for (const [locale, { messages, prose }] of Object.entries(translations)) {
    if (locale === sourceLocale) continue;
    for (const id of Object.keys(source.messages))
      if (!(id in messages)) problems.push(`${locale}: ${id} is missing.`);
    for (const [id, entry] of Object.entries(messages)) {
      const english = source.messages[id];
      if (english === undefined) {
        problems.push(`${locale}: ${id} has no ${sourceLocale} message.`);
        continue;
      }
      if (!isTranslated(entry)) {
        problems.push(
          `${locale}: ${id} is not { "message": ..., "source": ... }.`,
        );
        continue;
      }
      const used = parseable(locale, id, entry.message, problems);
      const expected = variables.get(id);
      if (used && expected && !sameSet(used, expected))
        problems.push(
          `${locale}: ${id} uses ${list(used)}, but its ${sourceLocale} message uses ${list(expected)}.`,
        );
      if (typeof english === "string" && entry.source !== sourceHash(english))
        problems.push(
          `${locale}: ${id} is stale: it translates an earlier ${sourceLocale} message.`,
        );
    }

    for (const name of Object.keys(source.prose))
      if (!(name in prose))
        problems.push(`${locale}: the prose ${name} is missing.`);
    for (const [name, text] of Object.entries(prose)) {
      const english = source.prose[name];
      if (english === undefined) {
        problems.push(
          `${locale}: the prose ${name} has no ${sourceLocale} file.`,
        );
        continue;
      }
      const recorded = proseParts(text).source;
      if (!recorded)
        problems.push(
          `${locale}: the prose ${name} records no source in its front matter.`,
        );
      else if (recorded !== sourceHash(english))
        problems.push(
          `${locale}: the prose ${name} is stale: it translates an earlier ${sourceLocale} file.`,
        );
    }
  }
  return problems;
}

/** The message's variables, or a problem when it doesn't parse. */
function parseable(
  locale: string,
  id: string,
  message: string,
  problems: string[],
): Set<string> | undefined {
  try {
    return messageVariables(message);
  } catch (error) {
    problems.push(
      `${locale}: ${id} does not parse as MF2: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTranslated(entry: unknown): entry is TranslatedMessage {
  return (
    isRecord(entry) &&
    Object.keys(entry).sort().join() === "message,source" &&
    typeof entry.message === "string" &&
    typeof entry.source === "string"
  );
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

const list = (names: Set<string>) =>
  names.size === 0
    ? "no variables"
    : [...names]
        .sort()
        .map((name) => `$${name}`)
        .join(", ");
