// The nav of a page other than the homepage: the way home, the
// documentation, the repository, the Support control and the theme toggle.
import { buttonVariants } from "@/components/app/button";
import type { Strings } from "@/i18n/ids";
import { localePath, type Locale } from "@/i18n/locales";
import { useTheme } from "@/lib/theme";
import { SUPPORT_STRINGS, SupportMenu } from "./support";
import { ThemeToggle } from "./theme-toggle";

export const REPOSITORY = "https://github.com/lutzseverino/repo-standards";

export const SITE_NAV_STRINGS = [
  "common.nav.sources",
  "common.nav.documentation",
  "common.theme.toggle",
  ...SUPPORT_STRINGS,
] as const;

export function SiteNav({
  locale,
  strings,
}: {
  locale: Locale;
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
      <div className="flex items-center gap-1">
        <a className={buttonVariants({ variant: "ghost" })} href="/docs/">
          {strings["common.nav.documentation"]}
        </a>
        <a className={buttonVariants({ variant: "ghost" })} href={REPOSITORY}>
          GitHub
        </a>
        <SupportMenu strings={strings} />
        <ThemeToggle
          theme={theme}
          onChange={setTheme}
          label={strings["common.theme.toggle"]}
        />
      </div>
    </nav>
  );
}
