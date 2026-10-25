/** BCP 47 locales are passed explicitly by each caller. */
export function formatList(items: string[], locale: string): string {
  return new Intl.ListFormat(locale, {
    style: "long",
    type: "conjunction",
  }).format(items);
}

/** Missing categories use `other`, as CLDR messages do. */
export function selectPlural(
  count: number,
  locale: string,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string },
): string {
  const category = new Intl.PluralRules(locale).select(count);
  return forms[category] ?? forms.other;
}

export function formatNumber(count: number, locale: string): string {
  // English counts were rendered as plain digits before locale formatting.
  return new Intl.NumberFormat(
    locale,
    locale === "en" ? { useGrouping: false } : undefined,
  ).format(count);
}

export function formatDate(
  iso: string,
  locale: string,
  month: "short" | "long" = "short",
): string {
  // The English site has always used day-month-year dates.
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    day: "numeric",
    month,
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
