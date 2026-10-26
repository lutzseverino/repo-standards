// The site's locales and their routes. Adding a locale means listing it here
// and giving it every catalog and prose file; the routes, `<html lang>` and
// the translation checks follow from this list.

/** The locales the site serves, the default first. The default is served at
 * the root, every other locale under `/<tag>/` with the same paths. */
export const LOCALES = ["en", "es", "ca"] as const;

export const DEFAULT_LOCALE = LOCALES[0];

/** Generated from the default locale (i18n/pseudo.ts) and served only by the
 * development server, never deployed. */
export const PSEUDO_LOCALE = "en-XA";

/** A locale the site is built and deployed in. */
export type SiteLocale = (typeof LOCALES)[number];

export type Locale = SiteLocale | typeof PSEUDO_LOCALE;

/** Each locale's name in its own language, for the language menu. */
export const LOCALE_NAMES: Record<SiteLocale, string> = {
  en: "English",
  es: "Español",
  ca: "Català",
};

/** The locale's own name; the pseudo-locale goes by its tag. */
export function localeName(locale: Locale): string {
  return locale === PSEUDO_LOCALE ? locale : LOCALE_NAMES[locale];
}

/** Whether this runs in Astro's development server. Plain Node, as in the
 * site's tests, has no `import.meta.env`. */
const DEVELOPMENT = import.meta.env ? import.meta.env.DEV : false;

/** The locales pages are built for. */
function pageLocales(): Locale[] {
  return DEVELOPMENT ? [...LOCALES, PSEUDO_LOCALE] : [...LOCALES];
}

/** A locale's first path segment; the default locale has none. */
function segment(locale: Locale): string | undefined {
  return locale === DEFAULT_LOCALE ? undefined : locale.toLowerCase();
}

/** A page's routes, one per locale, for a `[...locale]` route's
 * `getStaticPaths`. */
export function localeRoutes(): {
  params: { locale: string | undefined };
  props: { locale: Locale };
}[] {
  return pageLocales().map((locale) => ({
    params: { locale: segment(locale) },
    props: { locale },
  }));
}

/** `path`, a site path such as `/how-it-works/`, in `locale`. */
export function localePath(locale: Locale, path: string): string {
  const prefix = segment(locale);
  return prefix ? `/${prefix}${path}` : path;
}

/** A page's version in every site locale, by locale: `path`, a site path
 * such as `/how-it-works/`, under each locale's prefix. */
export function localeAlternates(path: string): Record<SiteLocale, string> {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, localePath(locale, path)]),
  ) as Record<SiteLocale, string>;
}
