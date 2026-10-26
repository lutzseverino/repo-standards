// The visitor's language: the one they picked in the language menu, saved in
// `localStorage`, or else, on a first visit to an English page, the browser's
// first supported language. The layout's inline script, generated from
// `localeChoice`, sends the visit on before the first paint; the menu saves
// the choice through the same function. A saved choice always wins, the
// browser's language never leads away from `/es/` or `/ca/`, and `/docs/`
// never moves, so a redirect always lands on a page that stays put.
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

  /** The saved choice, or `null`. */
  const saved = (): string | null => {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      // storage can be unavailable, as in some private windows
      return null;
    }
  };
  const save = (locale: string) => {
    try {
      window.localStorage.setItem(KEY, locale);
    } catch {
      // the choice then lasts only for this page
    }
  };
  return { KEY, page, redirect, saved, save };
}

/** The inline script that sends a visit to the visitor's language before
 * the first paint. */
export const localeScript = () => `(() => {
  const choice = (${localeChoice.toString()})(${JSON.stringify(LOCALES)});
  const to = choice.redirect(
    location.pathname,
    choice.saved(),
    navigator.languages || [navigator.language],
  );
  if (to !== null) location.replace(to + location.search + location.hash);
})();`;
