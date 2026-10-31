// The nav of every page outside the docs, built once: a bar across the
// window shaped like the docs' header, its order and weight as ADR 0031
// records. On the left, where you are (the plate, home) and where you can go
// on this site; on the right, where you can go off it, Support, and how you
// see the site. Below 50rem, where the docs' header collapses too, it holds
// the plate, Support's heart and one menu button, which opens everything
// else in a sheet under the header (ADR 0032).
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/app/button";
import type { Strings } from "@/i18n/ids";
import { localePath, type Locale, type SiteLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/lib/theme";
import { DOCS_LINK_STRINGS, DocsLink } from "./docs-link";
import { LANGUAGE_STRINGS, LanguageMenu } from "./language-menu";
import { Plate } from "./plate";
import { SUPPORT_STRINGS, SupportMenu } from "./support";
import { ThemeToggle } from "./theme-toggle";

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
    <nav className="relative flex h-14 items-center gap-4 border-b px-4 text-[15px] min-[50rem]:h-16 min-[50rem]:px-6">
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
        <NavMenu {...props} theme={theme} onTheme={setTheme} />
      </div>
    </nav>
  );
}

/** The panel's ID, which its button controls: a page has one nav. */
const PANEL = "nav-menu";
// a row of the panel, full width and tall enough to tap
const row = "h-11 w-full justify-start px-3";

/** The nav's one menu on a phone: a button that opens a sheet under the
 * header with the places, then the language and the theme, in the bar's
 * order. It is a disclosure of plain links, not a menu: Up and Down Arrow,
 * Home and End move between its controls, Escape closes it, and focus
 * leaving it closes it too. The page below is dimmed and stays still. */
function NavMenu({
  locale,
  alternates,
  language,
  current,
  onHowItWorks,
  strings,
  theme,
  onTheme,
}: NavProps & { theme: Theme | null; onTheme: (theme: Theme) => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // while open, the page doesn't scroll, and a window wide enough for the
  // bar closes the panel
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const wide = window.matchMedia("(min-width: 50rem)");
    const widened = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener("change", widened);
    return () => {
      root.style.overflow = overflow;
      wide.removeEventListener("change", widened);
    };
  }, [open]);

  const controls = () => [
    ...panel.current!.querySelectorAll<HTMLElement>("a, button"),
  ];
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  // before the controls' own handlers see them, so the language selector's
  // Dropdown Menu, which opens on the arrow keys, never gets them
  const onPanelKeyDown = (event: KeyboardEvent) => {
    // the open language list belongs to the panel in React's tree only; it
    // keeps its own keys, and its Escape closes only the list
    if (!panel.current?.contains(event.target as Node)) return;
    if (event.key === "Escape") return close();
    const all = controls();
    const at = all.indexOf(event.target as HTMLElement);
    const to = {
      ArrowDown: Math.min(at + 1, all.length - 1),
      ArrowUp: Math.max(at - 1, 0),
      Home: 0,
      End: all.length - 1,
    }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    all[to].focus();
  };
  const onButtonKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === "Escape") setOpen(false);
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      controls()[0].focus();
    }
  };

  const followed = () => setOpen(false);
  return (
    <div
      className="min-[50rem]:hidden"
      onBlur={(event) => {
        // focus left for the page, not for the panel, its button or the
        // language list it opened
        const to = event.relatedTarget;
        if (
          to &&
          !event.currentTarget.contains(to) &&
          !to.closest("[data-slot=dropdown-menu-content]")
        )
          setOpen(false);
      }}
    >
      <Button
        ref={button}
        variant="ghost"
        size="icon"
        aria-label={strings["common.nav.menu"]}
        aria-expanded={open}
        aria-controls={PANEL}
        onClick={() => setOpen(!open)}
        onKeyDown={onButtonKeyDown}
      >
        {open ? <XIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
      </Button>
      {open && (
        <div className="absolute inset-x-0 top-full z-40">
          <div
            id={PANEL}
            ref={panel}
            className="border-y bg-background"
            onKeyDownCapture={onPanelKeyDown}
          >
            <ul className="p-2">
              <li>
                <DocsLink
                  className={cn(ghost, row)}
                  locale={locale}
                  strings={strings}
                  onClick={followed}
                />
              </li>
              <li>
                {onHowItWorks ? (
                  <button
                    type="button"
                    className={cn(ghost, row)}
                    onClick={() => {
                      setOpen(false);
                      onHowItWorks();
                    }}
                  >
                    {strings["common.nav.how-it-works"]}
                  </button>
                ) : (
                  <a
                    className={cn(ghost, pressed, row)}
                    href={localePath(locale, "/how-it-works/")}
                    aria-current={
                      current === "how-it-works" ? "page" : undefined
                    }
                    onClick={followed}
                  >
                    {strings["common.nav.how-it-works"]}
                  </a>
                )}
              </li>
              <li>
                <a
                  className={cn(ghost, row)}
                  href={REPOSITORY}
                  onClick={followed}
                >
                  GitHub
                </a>
              </li>
            </ul>
            <div className="flex items-center justify-between gap-2 border-t p-2">
              <LanguageMenu
                named
                locale={locale}
                alternates={alternates}
                current={language}
                strings={strings}
              />
              <ThemeToggle
                theme={theme}
                onChange={onTheme}
                label={strings["common.theme.toggle"]}
              />
            </div>
          </div>
          {/* the page below, dimmed; a tap on it closes the panel */}
          <div
            aria-hidden="true"
            className="h-dvh bg-black/40 dark:bg-black/60"
            onClick={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
