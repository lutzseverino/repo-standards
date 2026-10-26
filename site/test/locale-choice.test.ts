// The visitor's language: what the head's script decides for each page, saved
// choice and browser, and the script itself, run as the page runs it.
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { localeChoice, localeScript } from "../src/i18n/choice.ts";
import { LOCALES } from "../src/i18n/locales.ts";

const { redirect, page } = localeChoice(LOCALES);
const PAGES = [
  "/",
  "/how-it-works/",
  "/sources/lutzseverino/repo-canon/",
] as const;

test("a page's locale is its first path segment, and its path the English one", () => {
  assert.deepEqual(page("/"), { locale: "en", path: "/" });
  assert.deepEqual(page("/how-it-works/"), {
    locale: "en",
    path: "/how-it-works/",
  });
  assert.deepEqual(page("/es/"), { locale: "es", path: "/" });
  assert.deepEqual(page("/es"), { locale: "es", path: "/" });
  assert.deepEqual(page("/ca/sources/lutzseverino/repo-canon/"), {
    locale: "ca",
    path: "/sources/lutzseverino/repo-canon/",
  });
  // only a whole segment names a locale
  assert.deepEqual(page("/escape/"), { locale: "en", path: "/escape/" });
  assert.deepEqual(page("/en/"), { locale: "en", path: "/en/" });
});

test("a saved choice opens the same page in that language, from any locale", () => {
  for (const path of PAGES) {
    assert.equal(redirect(path, "es", ["en-GB"]), `/es${path}`);
    assert.equal(redirect(path, "ca", []), `/ca${path}`);
    assert.equal(redirect(`/es${path}`, "ca", ["es"]), `/ca${path}`);
    assert.equal(redirect(`/ca${path}`, "en", ["ca"]), path);
    assert.equal(redirect(`/es${path}`, "en", []), path);
  }
});

test("a saved choice wins over the browser's language", () => {
  assert.equal(redirect("/", "en", ["ca", "es"]), null);
  assert.equal(redirect("/es/", "es", ["ca"]), null);
  assert.equal(redirect("/how-it-works/", "es", ["ca"]), "/es/how-it-works/");
});

test("a page already in the saved language stays", () => {
  for (const path of PAGES) {
    assert.equal(redirect(path, "en", ["es"]), null);
    assert.equal(redirect(`/es${path}`, "es", ["ca"]), null);
    assert.equal(redirect(`/ca${path}`, "ca", ["en"]), null);
  }
});

test("a saved value that is not a site locale is ignored", () => {
  for (const saved of ["fr", "ES", "es-ES", "", "en-XA", "null"]) {
    assert.equal(redirect("/", saved, ["en"]), null, saved);
    assert.equal(redirect("/", saved, ["ca"]), "/ca/", saved);
    assert.equal(redirect("/es/", saved, ["ca"]), null, saved);
  }
});

test("with nothing saved, a browser preferring Catalan or Spanish lands on its version of an English page", () => {
  for (const path of PAGES) {
    assert.equal(redirect(path, null, ["ca"]), `/ca${path}`);
    assert.equal(redirect(path, null, ["es"]), `/es${path}`);
  }
  // regional tags count as their base language
  assert.equal(redirect("/", null, ["ca-ES-valencia"]), "/ca/");
  assert.equal(redirect("/", null, ["es-419", "en"]), "/es/");
  assert.equal(redirect("/", null, ["ES-es"]), "/es/");
  // the first supported language in the browser's order decides
  assert.equal(redirect("/", null, ["fr", "ca", "es"]), "/ca/");
  assert.equal(redirect("/", null, ["de-DE", "es-ES", "ca"]), "/es/");
});

test("with nothing saved, a browser preferring English or only unsupported languages stays", () => {
  for (const path of PAGES) {
    assert.equal(redirect(path, null, ["en-US", "es", "ca"]), null);
    assert.equal(redirect(path, null, ["fr", "en", "ca"]), null);
    assert.equal(redirect(path, null, ["fr", "de", "pt-BR"]), null);
    assert.equal(redirect(path, null, []), null);
  }
});

test("with nothing saved, the browser's language never leads away from /es/ or /ca/", () => {
  for (const path of PAGES)
    for (const locale of ["es", "ca"])
      for (const languages of [["en"], ["es"], ["ca"], ["fr"], []])
        assert.equal(
          redirect(`/${locale}${path}`, null, languages),
          null,
          `/${locale}${path} with ${languages.join()}`,
        );
});

test("the docs never redirect", () => {
  for (const pathname of ["/docs/", "/docs", "/docs/guides/adopt/"])
    for (const saved of [null, "en", "es", "ca"])
      assert.equal(redirect(pathname, saved, ["ca"]), null, pathname);
});

test("a redirect lands on a page that stays: it can't loop", () => {
  const savedChoices = [null, "en", "es", "ca", "fr"];
  const browsers = [[], ["en"], ["es"], ["ca"], ["fr", "ca"], ["es-419"]];
  for (const path of PAGES)
    for (const pathname of [path, `/es${path}`, `/ca${path}`])
      for (const saved of savedChoices)
        for (const languages of browsers) {
          const to = redirect(pathname, saved, languages);
          if (to === null) continue;
          assert.notEqual(to, pathname);
          assert.equal(
            redirect(to, saved, languages),
            null,
            `${pathname} → ${to} with ${saved} and ${languages.join()}`,
          );
        }
});

/** Runs the head's script on `href`, with `stored` as the saved value, or
 * storage that throws, and the browser's `languages`. */
function runScript(
  href: string,
  stored: string | null | Error,
  languages: string[] | undefined,
  language = "en-GB",
) {
  const url = new URL(href, "https://repo-standards.com");
  const replaced: string[] = [];
  const window: Record<string, unknown> = {
    location: {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      replace: (to: string) => replaced.push(to),
    },
    navigator: { languages, language },
    localStorage: {
      getItem: (key: string) => {
        if (stored instanceof Error) throw stored;
        return key === "locale" ? stored : null;
      },
    },
  };
  window.window = window;
  vm.runInNewContext(localeScript(), window);
  return replaced;
}

test("the head's script replaces the location, keeping the query and fragment", () => {
  assert.deepEqual(runScript("/how-it-works/?a=1#who-does-what", "es", []), [
    "/es/how-it-works/?a=1#who-does-what",
  ]);
  assert.deepEqual(runScript("/ca/", null, ["es"]), []);
  assert.deepEqual(runScript("/", null, ["ca-ES"]), ["/ca/"]);
  assert.deepEqual(runScript("/docs/", "es", ["es"]), []);
});

test("the head's script treats unavailable storage as nothing saved, and falls back to the browser's one language", () => {
  assert.deepEqual(runScript("/", new Error("no storage"), ["es"]), ["/es/"]);
  assert.deepEqual(runScript("/", null, undefined, "ca"), ["/ca/"]);
  assert.deepEqual(runScript("/", null, undefined, "en-US"), []);
});

test("the language menu saves one key, and storage that throws loses only the choice", () => {
  const stored = new Map<string, string>();
  const run = (body: string, storage: unknown): void => {
    vm.runInNewContext(
      `(${localeChoice.toString()})(${JSON.stringify(LOCALES)}).${body}`,
      {
        window: { localStorage: storage },
      },
    );
  };
  run(`save("ca")`, {
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  assert.deepEqual([...stored], [["locale", "ca"]]);
  assert.doesNotThrow(() =>
    run(`save("es")`, {
      setItem: () => {
        throw new Error("no storage");
      },
    }),
  );
});
