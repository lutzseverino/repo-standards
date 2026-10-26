// The visitor's language: the one they picked in the language menu, saved in
// `localStorage`, or else, on a first visit to an English page, the browser's
// first supported language. The layout's inline script, generated from
// `localeChoice`, sends the visit on before the first paint; the menu saves
// the choice through the same function. A saved choice always wins, the
// browser's language never leads away from `/es/` or `/ca/`, and `/docs/`
// never moves, so a redirect always lands on a page that stays put.
//
// The menu also names its choice in the address it opens, `?locale=<tag>`,
// which the script honours, saves and strips: where storage is blocked, the
// chosen page still opens instead of following the browser's language. A
// saved choice falls back to `sessionStorage` when `localStorage` fails.
import { LOCALES } from "./locales.ts";

/** Reads, saves and applies the choice over `locales`, the default first.
 * The head's inline copy is this function's source, so it must reference
 * nothing outside its own body. */
export function localeChoice(locales: readonly string[]) {
  const KEY = "locale";
  const fallback = locales[0];

  /** The page's locale, and its path in the default locale. */
  const page = (pathname: string) => {
    const first = pathname.split("/")[1];
    return first !== fallback && locales.includes(first)
      ? { locale: first, path: pathname.slice(first.length + 1) || "/" }
      : { locale: fallback, path: pathname };
  };

  /** Where a visit to `pathname` goes instead, or `null` to stay: the saved
   * locale's version of the page, or, with none saved, on a default-locale
   * page, the version in the first of `languages` the site has, reduced to
   * its base language. Any saved value but a locale is ignored. */
  const redirect = (
    pathname: string,
    saved: string | null,
    languages: readonly string[],
  ): string | null => {
    if (/^\/docs(?:\/|$)/.test(pathname)) return null;
    const { locale, path } = page(pathname);
    const chosen = saved !== null && locales.includes(saved) ? saved : null;
    const target =
      chosen ??
      (locale === fallback
        ? languages
            .map((language) => language.split("-")[0].toLowerCase())
            .find((language) => locales.includes(language))
        : undefined);
    if (target === undefined || target === locale) return null;
    return target === fallback ? path : `/${target}${path}`;
  };

  /** The locale an address's query chose, if it names a site locale, and
   * the query without its choice. */
  const query = (search: string) => {
    const params = new URLSearchParams(search);
    const value = params.get(KEY);
    params.delete(KEY);
    const rest = params.toString();
    return {
      chosen: value !== null && locales.includes(value) ? value : null,
      search: rest ? `?${rest}` : "",
    };
  };

  /** `path` with the query that names `locale` as the visitor's choice. */
  const choosing = (path: string, locale: string) =>
    `${path}?${KEY}=${encodeURIComponent(locale)}`;

  // Storage can be unavailable, as in some private windows, or refuse
  // writes only. The session's storage then holds the choice, and since it
  // only ever holds a choice the lasting one couldn't keep, it is read
  // first: the most recent choice wins over an older one stuck in
  // `localStorage`. A choice the lasting storage keeps clears the session's.
  const attempt = <T>(run: () => T): T | null => {
    try {
      return run();
    } catch {
      return null;
    }
  };

  /** The saved choice, or `null`. */
  const saved = (): string | null =>
    attempt(() => window.sessionStorage.getItem(KEY)) ??
    attempt(() => window.localStorage.getItem(KEY));

  const save = (locale: string) => {
    const kept = attempt(() => {
      window.localStorage.setItem(KEY, locale);
      return true;
    });
    if (kept) {
      attempt(() => window.sessionStorage.removeItem(KEY));
      return;
    }
    // with neither, the address carries the choice to the next page
    attempt(() => window.sessionStorage.setItem(KEY, locale));
    attempt(() => window.localStorage.removeItem(KEY));
  };
  return { KEY, page, redirect, query, choosing, saved, save };
}

/** The inline script that sends a visit to the visitor's language before
 * the first paint. */
export const localeScript = () => `(() => {
  const choice = (${localeChoice.toString()})(${JSON.stringify(LOCALES)});
  const { chosen, search } = choice.query(location.search);
  if (chosen !== null) {
    choice.save(chosen);
    history.replaceState(
      history.state,
      "",
      location.pathname + search + location.hash,
    );
  }
  const to = choice.redirect(
    location.pathname,
    chosen ?? choice.saved(),
    navigator.languages || [navigator.language],
  );
  if (to !== null) location.replace(to + search + location.hash);
})();`;
