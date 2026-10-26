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

type Entries = Record<string, string>;
/** What a stub storage holds and allows: its entries; `"blocked"`, which
 * throws on every call; or `{ readOnly }`, which reads its entries but
 * throws on every write, removal included (`"read-only"` when empty). */
type StoreSetup = Entries | "blocked" | "read-only" | { readOnly: Entries };

/** A browser storage stub, set up by `setup`; `writable` changes whether it
 * accepts writes from then on. */
function storage(setup: StoreSetup) {
  const readOnly =
    setup === "read-only" || (typeof setup === "object" && "readOnly" in setup);
  const map = new Map<string, string>(
    typeof setup !== "object"
      ? []
      : Object.entries("readOnly" in setup ? setup.readOnly : setup),
  );
  const state = { writes: !readOnly && setup !== "blocked" };
  const fail = () => {
    throw new Error("The storage is unavailable.");
  };
  return {
    map,
    writable: (writes: boolean) => void (state.writes = writes),
    getItem: (key: string) =>
      setup === "blocked" ? fail() : (map.get(key) ?? null),
    setItem: (key: string, value: string) =>
      state.writes ? void map.set(key, value) : fail(),
    removeItem: (key: string) => (state.writes ? void map.delete(key) : fail()),
  };
}
type Store = ReturnType<typeof storage>;
const isStore = (setup: StoreSetup | Store): setup is Store =>
  typeof setup === "object" && "removeItem" in setup;
const store = (setup: StoreSetup | Store): Store =>
  isStore(setup) ? setup : storage(setup);

/** Runs the head's script on `href` with the browser's `languages` and its
 * two storages, as the page runs it. */
function runScript(
  href: string,
  {
    languages,
    language = "en-GB",
    local = {},
    session = {},
  }: {
    languages?: string[];
    language?: string;
    local?: StoreSetup | Store;
    session?: StoreSetup | Store;
  },
) {
  const url = new URL(href, "https://repo-standards.com");
  const replaced: string[] = [];
  const addressed: string[] = [];
  const stores = { local: store(local), session: store(session) };
  const window: Record<string, unknown> = {
    location: {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      replace: (to: string) => replaced.push(to),
    },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, to: string) =>
        addressed.push(to),
    },
    navigator: { languages, language },
    localStorage: stores.local,
    sessionStorage: stores.session,
    URLSearchParams,
  };
  window.window = window;
  vm.runInNewContext(localeScript(), window);
  return {
    replaced,
    addressed,
    local: stores.local.map,
    session: stores.session.map,
  };
}

test("the head's script replaces the location, keeping the query and fragment", () => {
  const go = (
    href: string,
    local: Record<string, string>,
    languages: string[],
  ) => runScript(href, { local, languages }).replaced;
  assert.deepEqual(
    go("/how-it-works/?a=1#who-does-what", { locale: "es" }, []),
    ["/es/how-it-works/?a=1#who-does-what"],
  );
  assert.deepEqual(go("/ca/", {}, ["es"]), []);
  assert.deepEqual(go("/", {}, ["ca-ES"]), ["/ca/"]);
  assert.deepEqual(go("/docs/", { locale: "es" }, ["es"]), []);
});

test("the head's script treats unavailable storage as nothing saved, and falls back to the browser's one language", () => {
  assert.deepEqual(
    runScript("/", { local: "blocked", session: "blocked", languages: ["es"] })
      .replaced,
    ["/es/"],
  );
  assert.deepEqual(runScript("/", { language: "ca" }).replaced, ["/ca/"]);
  assert.deepEqual(runScript("/", { language: "en-US" }).replaced, []);
});

test("a choice named in the address wins, is saved, and leaves the address", () => {
  // the menu's English, for a Spanish browser with nothing saved
  const english = runScript("/how-it-works/?locale=en#who-does-what", {
    languages: ["es"],
  });
  assert.deepEqual(english.replaced, []);
  assert.deepEqual(english.addressed, ["/how-it-works/#who-does-what"]);
  assert.deepEqual([...english.local], [["locale", "en"]]);
  // it outranks a saved choice, and other query parameters stay
  const catalan = runScript("/es/?a=1&locale=ca#x", {
    local: { locale: "es" },
    languages: ["es"],
  });
  assert.deepEqual(catalan.replaced, ["/ca/?a=1#x"]);
  assert.deepEqual([...catalan.local], [["locale", "ca"]]);
  // a value that is not a site locale is ignored, and still removed
  const unknown = runScript("/?locale=fr", { languages: ["ca"] });
  assert.deepEqual(unknown.replaced, ["/ca/"]);
  assert.deepEqual(unknown.addressed, []);
});

test("with storage blocked, choosing English from the menu opens English and stays", () => {
  const choice = localeChoice(LOCALES);
  const address = choice.choosing("/how-it-works/", "en");
  assert.equal(address, "/how-it-works/?locale=en");
  // both storages throwing, a Spanish browser: before, the head sent the
  // visit straight back to /es/
  const visit = runScript(`${address}#who-does-what`, {
    local: "blocked",
    session: "blocked",
    languages: ["es-ES", "en"],
  });
  assert.deepEqual(visit.replaced, []);
  assert.deepEqual(visit.addressed, ["/how-it-works/#who-does-what"]);
  // the same when storage reads but refuses to write
  const readOnly = runScript(address, {
    local: "read-only",
    session: "read-only",
    languages: ["ca"],
  });
  assert.deepEqual(readOnly.replaced, []);
});

test("a choice falls back to the session's storage when the lasting one fails", () => {
  // saved where only the session's storage works, then found there
  const saved = runScript("/?locale=ca", {
    local: "blocked",
    languages: ["en"],
  });
  assert.deepEqual([...saved.session], [["locale", "ca"]]);
  assert.deepEqual(
    runScript("/how-it-works/", {
      local: "blocked",
      session: { locale: "ca" },
      languages: ["en"],
    }).replaced,
    ["/ca/how-it-works/"],
  );
  // the lasting storage is preferred when it works
  const lasting = runScript("/es/?locale=es", { languages: ["en"] });
  assert.deepEqual([...lasting.local], [["locale", "es"]]);
  assert.deepEqual([...lasting.session], []);
});

/** Runs the language menu's `save(locale)` against the two storages. */
function menuSaves(locale: string, local: Store, session: Store) {
  vm.runInNewContext(
    `(${localeChoice.toString()})(${JSON.stringify(LOCALES)}).save(${JSON.stringify(locale)})`,
    { window: { localStorage: local, sessionStorage: session } },
  );
}

test("a choice the lasting storage can't take wins over the older one it holds", () => {
  // localStorage holds Spanish and refuses every write, removal included
  const local = storage({ readOnly: { locale: "es" } });
  const session = storage({});
  // on a Spanish page, the visitor picks English in the menu
  menuSaves("en", local, session);
  const opened = runScript("/how-it-works/?locale=en", {
    local,
    session,
    languages: ["es"],
  });
  assert.deepEqual(opened.replaced, []);
  // then follows an internal link: the page stays English
  for (const pathname of [
    "/",
    "/how-it-works/",
    "/sources/lutzseverino/repo-canon/",
  ])
    assert.deepEqual(
      runScript(pathname, { local, session, languages: ["es"] }).replaced,
      [],
      pathname,
    );
  assert.deepEqual([...local.map], [["locale", "es"]]);
  assert.deepEqual([...session.map], [["locale", "en"]]);
});

test("where the lasting storage can remove but not write, its stale choice goes", () => {
  const local = storage({ locale: "es" });
  const session = storage({});
  local.setItem = () => {
    throw new Error("The storage is full.");
  };
  menuSaves("en", local, session);
  assert.deepEqual([...local.map], []);
  assert.deepEqual([...session.map], [["locale", "en"]]);
  assert.deepEqual(
    runScript("/", { local, session, languages: ["es"] }).replaced,
    [],
  );
});

test("once the lasting storage keeps a choice, no session choice overrides it", () => {
  const local = storage("read-only");
  const session = storage({});
  menuSaves("en", local, session);
  assert.deepEqual([...session.map], [["locale", "en"]]);
  // the lasting storage accepts writes again, and the visitor picks Catalan
  local.writable(true);
  menuSaves("ca", local, session);
  assert.deepEqual([...local.map], [["locale", "ca"]]);
  assert.deepEqual([...session.map], []);
  assert.deepEqual(
    runScript("/", { local, session, languages: ["en"] }).replaced,
    ["/ca/"],
  );
});

test("the language menu saves one key, and storage that throws loses only the choice", () => {
  const run = (body: string, local: unknown, session: unknown): void => {
    vm.runInNewContext(
      `(${localeChoice.toString()})(${JSON.stringify(LOCALES)}).${body}`,
      { window: { localStorage: local, sessionStorage: session } },
    );
  };
  const local = storage({});
  run(`save("ca")`, local, storage({}));
  assert.deepEqual([...local.map], [["locale", "ca"]]);
  assert.doesNotThrow(() =>
    run(`save("es")`, storage("blocked"), storage("blocked")),
  );
});
