// The nav's link to the docs, which are in English only: on a page in
// another language it carries a small "EN" badge, so the switch to English
// is no surprise.
import type { ComponentProps } from "react";
import { Badge } from "@/components/app/badge";
import type { Strings } from "@/i18n/ids";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

export const DOCS_LINK_STRINGS = [
  "common.nav.documentation",
  "common.nav.in-english",
] as const;

/** The other props go to the link, so a menu item can render as it. */
export function DocsLink({
  locale,
  strings,
  ...props
}: {
  locale: Locale;
  strings: Strings<(typeof DOCS_LINK_STRINGS)[number]>;
} & ComponentProps<"a">) {
  const english = locale === DEFAULT_LOCALE;
  return (
    <a {...props} href="/docs/" hrefLang={english ? undefined : DEFAULT_LOCALE}>
      {strings["common.nav.documentation"]}
      {!english && (
        <>
          <Badge variant="outline" aria-hidden="true">
            {DEFAULT_LOCALE.toUpperCase()}
          </Badge>
          <span className="sr-only">{` (${strings["common.nav.in-english"]})`}</span>
        </>
      )}
    </a>
  );
}
