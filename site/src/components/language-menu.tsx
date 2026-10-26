// The nav's language menu: a shadcn Dropdown Menu of the site's languages,
// each named in its own language. Picking one saves it (i18n/choice.ts) and
// opens the same page, and section, in that language.
import { LanguagesIcon } from "lucide-react";
import { Button } from "@/components/app/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/app/dropdown-menu";
import { localeChoice } from "@/i18n/choice";
import type { Strings } from "@/i18n/ids";
import {
  LOCALES,
  LOCALE_NAMES,
  localeName,
  type Locale,
  type SiteLocale,
} from "@/i18n/locales";

export const LANGUAGE_STRINGS = ["common.language.label"] as const;

/** `current` names the menu and the page's language; `compact` shows the
 * icon alone on a phone. */
export function LanguageMenu({
  locale,
  alternates,
  current,
  strings,
  compact = false,
}: {
  locale: Locale;
  /** The page in each language. */
  alternates: Record<SiteLocale, string>;
  current: string;
  strings: Strings<(typeof LANGUAGE_STRINGS)[number]>;
  compact?: boolean;
}) {
  // the address names the choice too, for a browser that can't store it;
  // section IDs are the same in every locale, so the section stays open
  const choose = (next: SiteLocale) => {
    const choice = localeChoice(LOCALES);
    choice.save(next);
    if (next !== locale)
      window.location.assign(
        choice.choosing(alternates[next], next) + window.location.hash,
      );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" />}
        aria-label={current}
      >
        <LanguagesIcon aria-hidden="true" />
        <span className={compact ? "max-[30rem]:sr-only" : undefined}>
          {localeName(locale)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {strings["common.language.label"]}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale}>
            {LOCALES.map((option) => (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                lang={option}
                onClick={() => choose(option)}
              >
                {LOCALE_NAMES[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
