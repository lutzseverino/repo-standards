// The one translation check: every locale has exactly the English messages
// and prose, every message parses, translations use their English message's
// variables, and every recorded source hash is current.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { pseudoTranslations } from "../src/i18n/pseudo.ts";
import {
  checkTranslations,
  parseTranslations,
  readTranslationFiles,
  sourceHash,
  type LocaleTranslations,
  type Translations,
} from "../src/i18n/translations.ts";

const site = parseTranslations(
  readTranslationFiles(fileURLToPath(new URL("../src/i18n/", import.meta.url))),
);

test("the site's catalogs and the pseudo-locale generated from them pass", () => {
  const en = site.en;
  assert.ok(Object.keys(en.messages).length > 0);
  assert.ok(Object.keys(en.prose).length > 0);
  assert.deepEqual(
    checkTranslations({ ...site, "en-XA": pseudoTranslations(en) }, "en"),
    [],
  );
});

// fixture catalogs: English, and a translation of all of it
const PLURAL =
  ".input {$count :integer} .match $count one {{{$number} source}} * {{{$number} sources}}";
const english: LocaleTranslations = {
  messages: {
    "home.title": "Repo Standards",
    "home.greeting": "Hello {$name}",
    "home.count": PLURAL,
  },
  prose: { page: "# A page\n" },
};
const translated = (message: string, of: string) => ({
  message,
  source: sourceHash(of),
});
const spanish = (): LocaleTranslations => ({
  messages: {
    "home.title": translated("Repo Standards", "Repo Standards"),
    "home.greeting": translated("Hola {$name}", "Hello {$name}"),
    // Spanish has `many` as well
    "home.count": translated(
      ".input {$count :integer} .match $count one {{{$number} fuente}} many {{{$number} de fuentes}} * {{{$number} fuentes}}",
      PLURAL,
    ),
  },
  prose: {
    page: `---\nsource: ${sourceHash("# A page\n")}\n---\n# Una página\n`,
  },
});
const check = (change: (es: LocaleTranslations) => void) => {
  const es = spanish();
  change(es);
  return checkTranslations({ en: english, es } satisfies Translations, "en");
};

test("a complete, current translation passes, with plural variants English lacks", () => {
  assert.deepEqual(
    check(() => {}),
    [],
  );
});

test("a missing message fails", () => {
  assert.deepEqual(
    check((es) => delete es.messages["home.title"]),
    ["es: home.title is missing."],
  );
});

test("an extra message fails", () => {
  assert.deepEqual(
    check((es) => {
      es.messages["home.extra"] = translated("Extra", "Extra");
    }),
    ["es: home.extra has no en message."],
  );
});

test("a message that doesn't parse fails, in English too", () => {
  const [problem] = check((es) => {
    es.messages["home.greeting"] = translated("Hola {$name", "Hello {$name}");
  });
  assert.match(problem, /^es: home\.greeting does not parse as MF2: /);
  const [english] = checkTranslations(
    { en: { messages: { "home.title": "Hi {" }, prose: {} } },
    "en",
  );
  assert.match(english, /^en: home\.title does not parse as MF2: /);
});

test("a translation using other variables than its English message fails", () => {
  assert.deepEqual(
    check((es) => {
      es.messages["home.greeting"] = translated(
        "Hola {$user}",
        "Hello {$name}",
      );
    }),
    ["es: home.greeting uses $user, but its en message uses $name."],
  );
  assert.deepEqual(
    check((es) => {
      es.messages["home.count"] = translated(
        ".input {$count :integer} .match $count one {{una fuente}} * {{fuentes}}",
        PLURAL,
      );
    }),
    ["es: home.count uses $count, but its en message uses $count, $number."],
  );
});

test("a translation of an earlier English message fails as stale", () => {
  assert.deepEqual(
    check((es) => {
      es.messages["home.greeting"] = translated("Hola {$name}", "Hi {$name}");
    }),
    ["es: home.greeting is stale: it translates an earlier en message."],
  );
});

test("a malformed translated entry fails", () => {
  assert.deepEqual(
    check((es) => {
      es.messages["home.title"] = "Repo Standards";
    }),
    ['es: home.title is not { "message": ..., "source": ... }.'],
  );
});

test("a missing prose translation fails", () => {
  assert.deepEqual(
    check((es) => delete es.prose.page),
    ["es: the prose page is missing."],
  );
});

test("a prose translation of an earlier English file fails as stale", () => {
  assert.deepEqual(
    check((es) => {
      es.prose.page = `---\nsource: ${sourceHash("# Old page\n")}\n---\n# Una página\n`;
    }),
    ["es: the prose page is stale: it translates an earlier en file."],
  );
});

test("a prose translation that records no source fails", () => {
  assert.deepEqual(
    check((es) => {
      es.prose.page = "# Una página\n";
    }),
    ["es: the prose page records no source in its front matter."],
  );
});

test("a source hash of digits alone stays a string in front matter", () => {
  const es = spanish();
  const text = "digits";
  const en = { ...english, prose: { page: text } };
  es.prose.page = `---\nsource: 12345678\n---\n# Una página\n`;
  assert.deepEqual(checkTranslations({ en, es }, "en"), [
    "es: the prose page is stale: it translates an earlier en file.",
  ]);
  assert.notEqual(sourceHash(text), "12345678");
});

test("the files are read by locale, area and name", () => {
  const translations = parseTranslations({
    "messages/en/home.json": '{ "title": "Hi" }',
    "messages/es/home.json":
      '{ "title": { "message": "Hola", "source": "abc" } }',
    "prose/es/page.md": "# Página\n",
  });
  assert.deepEqual(translations, {
    en: { messages: { "home.title": "Hi" }, prose: {} },
    es: {
      messages: { "home.title": { message: "Hola", source: "abc" } },
      prose: { page: "# Página\n" },
    },
  });
  assert.throws(
    () => parseTranslations({ "messages/en/home.json": "[]" }),
    /messages\/en\/home\.json is not a JSON object of messages\./,
  );
});
