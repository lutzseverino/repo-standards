// The nav of every page outside the docs, built once: a bar across the
// window shaped like the docs' header, its order and weight as ADR 0031
// records. On the left, where you are (the plate, home) and where you can go
// on this site; on the right, where you can go off it, Support, and how you
// see the site. Below 50rem, where the docs' header collapses too, it holds
// the plate, Support's heart and one menu with everything else.
import { MenuIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/app/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/app/dropdown-menu";
import type { Strings } from "@/i18n/ids";
import { localePath, type Locale, type SiteLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { DOCS_LINK_STRINGS, DocsLink } from "./docs-link";
import { LANGUAGE_STRINGS, LanguageItems, LanguageMenu } from "./language-menu";
import { Plate } from "./plate";
import { SUPPORT_STRINGS, SupportMenu } from "./support";
import { ThemeIcon, ThemeToggle, otherTheme } from "./theme-toggle";

export const REPOSITORY = "https://github.com/lutzseverino/repo-standards";

export const SITE_NAV_STRINGS = [
  ...DOCS_LINK_STRINGS,
  "common.nav.how-it-works",
  "common.nav.menu",
  "common.theme.toggle",
  ...SUPPORT_STRINGS,
  ...LANGUAGE_STRINGS,
] as const;

type NavProps = {
  locale: Locale;
  /** The page in each language. */
  alternates: Record<SiteLocale, string>;
  /** The language menu's name, with the page's language. */
  language: string;
  /** The page, when the nav has an item for it: the homepage leaves the
   * plate out, since its sign says the same, and How it works reads as
   * pressed on its own page. */
  current?: "home" | "how-it-works";
  /** On the homepage, what How it works does instead of leading to its
   * page: the sign plays its story. */
  onHowItWorks?: () => void;
  strings: Strings<(typeof SITE_NAV_STRINGS)[number]>;
};

const ghost = buttonVariants({ variant: "ghost" });
// the current page's item, pressed: the ghost button's muted background
const pressed = "aria-[current=page]:bg-muted";

export function SiteNav(props: NavProps) {
  const { locale, alternates, language, current, onHowItWorks, strings } =
    props;
  const [theme, setTheme] = useTheme();
  return (
    <nav className="flex h-14 items-center gap-4 border-b px-4 text-[15px] min-[50rem]:h-16 min-[50rem]:px-6">
      {current !== "home" && (
        <Plate href={localePath(locale, "/")} name="Repo Standards" />
      )}
      <div className="hidden items-center gap-1 min-[50rem]:flex">
        <DocsLink className={ghost} locale={locale} strings={strings} />
        {onHowItWorks ? (
          <button type="button" className={ghost} onClick={onHowItWorks}>
            {strings["common.nav.how-it-works"]}
          </button>
        ) : (
          <a
            className={cn(ghost, pressed)}
            href={localePath(locale, "/how-it-works/")}
            aria-current={current === "how-it-works" ? "page" : undefined}
          >
            {strings["common.nav.how-it-works"]}
          </a>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <a
          className={cn(ghost, "hidden min-[50rem]:inline-flex")}
          href={REPOSITORY}
        >
          GitHub
        </a>
        <SupportMenu heartAlone="50rem" strings={strings} />
        <div className="hidden items-center gap-1 min-[50rem]:flex">
          <LanguageMenu
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
        <div className="min-[50rem]:hidden">
          <NavMenu {...props} onTheme={() => setTheme(otherTheme(theme))} />
        </div>
      </div>
    </nav>
  );
}

/** The nav's one menu on a phone: the places, the languages and the theme
 * switch, in the bar's order. */
function NavMenu({
  locale,
  alternates,
  current,
  onHowItWorks,
  onTheme,
  strings,
}: NavProps & { onTheme: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={strings["common.nav.menu"]}
      >
        <MenuIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto max-w-(--available-width)"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={<DocsLink locale={locale} strings={strings} />}
          />
          {onHowItWorks ? (
            <DropdownMenuItem onClick={onHowItWorks}>
              {strings["common.nav.how-it-works"]}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className={pressed}
              render={
                <a
                  href={localePath(locale, "/how-it-works/")}
                  aria-current={current === "how-it-works" ? "page" : undefined}
                />
              }
            >
              {strings["common.nav.how-it-works"]}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<a href={REPOSITORY} />}>
            GitHub
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <LanguageItems
          locale={locale}
          alternates={alternates}
          strings={strings}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onTheme}>
          <ThemeIcon />
          {strings["common.theme.toggle"]}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
