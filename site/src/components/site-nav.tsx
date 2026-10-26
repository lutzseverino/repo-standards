// The nav of a page other than the homepage: the way home, the
// documentation, the repository, the Support control, the language menu and
// the theme toggle.
import { buttonVariants } from "@/components/app/button";
import type { Strings } from "@/i18n/ids";
import { localePath, type Locale, type SiteLocale } from "@/i18n/locales";
import { useTheme } from "@/lib/theme";
import { DOCS_LINK_STRINGS, DocsLink } from "./docs-link";
import { LANGUAGE_STRINGS, LanguageMenu } from "./language-menu";
import { SUPPORT_STRINGS, SupportMenu } from "./support";
import { ThemeToggle } from "./theme-toggle";

export const REPOSITORY = "https://github.com/lutzseverino/repo-standards";

export const SITE_NAV_STRINGS = [
  "common.nav.sources",
  ...DOCS_LINK_STRINGS,
  "common.theme.toggle",
  ...SUPPORT_STRINGS,
  ...LANGUAGE_STRINGS,
] as const;

export function SiteNav({
  locale,
  alternates,
  language,
  strings,
}: {
  locale: Locale;
  /** The page in each language. */
  alternates: Record<SiteLocale, string>;
  /** The language menu's name, with the page's language. */
  language: string;
  strings: Strings<(typeof SITE_NAV_STRINGS)[number]>;
}) {
  const [theme, setTheme] = useTheme();
  return (
    <nav className="mb-8 flex flex-wrap items-center justify-between gap-1 text-[15px]">
      <a
        className={buttonVariants({ variant: "ghost" })}
        href={localePath(locale, "/")}
      >
        {strings["common.nav.sources"]}
      </a>
      {/* on a phone the controls wrap onto a line of their own */}
      <div className="flex flex-wrap items-center justify-end gap-1">
        <DocsLink
          className={buttonVariants({ variant: "ghost" })}
          locale={locale}
          strings={strings}
        />
        <a className={buttonVariants({ variant: "ghost" })} href={REPOSITORY}>
          GitHub
        </a>
        <div className="flex items-center gap-1">
          <SupportMenu strings={strings} />
          <LanguageMenu
            compact
            locale={locale}
            alternates={alternates}
            current={language}
            strings={strings}
          />
          <ThemeToggle
            theme={theme}
            onChange={setTheme}
            label={strings["common.theme.toggle"]}
          />
        </div>
      </div>
    </nav>
  );
}
