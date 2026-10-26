// The homepage: the sign assembly over the signposts, lit by a hand torch.
import { useState } from "react";
import { ADOPTION_DIALOG_STRINGS, AdoptionDialog } from "./adoption-dialog";
import { buttonVariants } from "@/components/app/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/app/empty";
import { TooltipProvider } from "@/components/app/tooltip";
import type { Rich, Strings } from "@/i18n/ids";
import { localePath, type Locale, type SiteLocale } from "@/i18n/locales";
import { formatMessage } from "@/i18n/message";
import {
  INSTALL_MODE_STRINGS,
  INSTALL_STRINGS,
  Install,
  InstallModeSwitch,
  useInstallMode,
} from "./install";
import { DOCS_LINK_STRINGS, DocsLink } from "./docs-link";
import { LANGUAGE_STRINGS, LanguageMenu } from "./language-menu";
import { Profiles } from "./profiles";
import { RichText } from "./rich-text";
import { Search } from "./search";
import { SIGN_STRINGS, SignAssembly } from "./sign/assembly";
import { SignpostList } from "./sign/signposts";
import { useTorch } from "./sign/torch";
import { REPOSITORY } from "./site-nav";
import { SUPPORT_STRINGS, SupportMenu } from "./support";
import { ThemeToggle } from "./theme-toggle";
import {
  STARTING_POINT,
  matches,
  type Catalogue,
  type InstallMode,
} from "@/lib/catalogue";
import { SUPPORT } from "@/lib/support";
import { useTheme } from "@/lib/theme";

export const HOME_STRINGS = [
  ...DOCS_LINK_STRINGS,
  "common.nav.how-it-works",
  "common.theme.toggle",
  "home.search.label",
  "home.sources.list-yours",
  "home.sources.adopters-explanation",
  ...SUPPORT_STRINGS,
  ...LANGUAGE_STRINGS,
  ...SIGN_STRINGS,
  ...INSTALL_MODE_STRINGS,
  ...INSTALL_STRINGS,
  ...ADOPTION_DIALOG_STRINGS,
] as const;

/** The homepage's text that takes values, formatted when the page is built,
 * except the one message that takes the visitor's search. */
export type HomeText = {
  /** The language menu's name, with the page's language. */
  language: string;
  /** The starting point's plate's name. */
  startLabel: string;
  /** Each listed source's repository, release date and CLI requirement, by
   * repository. */
  details: Record<string, string>;
  /** Localized public-adopter counts for the source tabs. */
  adopters: Record<string, string>;
  /** How to see every source again after a search that matches none. */
  clear: string;
  /** Where the sources come from, with a `topic` slot. */
  origin: Rich;
  /** How many more repositories the list leaves out, or nothing. */
  leftOut: string;
  /** The invitation to support, with `first` and `second` slots. */
  invitation: Rich;
  /** The MF2 source of the message for a search that matches nothing,
   * formatted here with the search. */
  noMatch: string;
};

// page-wide light layers and their diameter in beam radii. Like the other lit
// elements, they are lit before the page hydrates (sign/rig.ts), so React is
// told not to compare their style with the server's.
const LIGHT_LAYERS = [
  ["sign-torch-pool", 3],
  ["sign-lit-sheen", 2],
  ["sign-lit-prism", 2],
] as const;

export function Home({
  locale,
  alternates,
  catalogue,
  strings,
  text,
}: {
  locale: Locale;
  /** The homepage in each language. */
  alternates: Record<SiteLocale, string>;
  catalogue: Catalogue;
  strings: Strings<(typeof HOME_STRINGS)[number]>;
  text: HomeText;
}) {
  const [theme, setTheme] = useTheme();
  const [mode, setMode] = useInstallMode();
  const [query, setQuery] = useState("");
  // the nav asks the sign for its story
  const [playRequest, setPlayRequest] = useState(0);
  const [copied, setCopied] = useState<InstallMode | null>(null);
  useTorch(theme);

  const { sources } = catalogue;
  const start = sources.find((s) => s.repository === STARTING_POINT)!;
  const visible = sources.filter((s) => matches(s, query));

  return (
    <TooltipProvider>
      {LIGHT_LAYERS.map(([name, k]) => (
        <div
          key={name}
          className={`sign-light-layer ${name}`}
          data-light-layer={k}
          aria-hidden="true"
          suppressHydrationWarning
        />
      ))}
      <main className="sign-page mx-auto max-w-6xl px-6 pt-10 pb-32">
        {/* on a phone the controls wrap onto a line of their own */}
        <nav className="mb-8 flex flex-wrap items-center justify-end gap-1 text-[15px]">
          <DocsLink
            className={buttonVariants({ variant: "ghost" })}
            locale={locale}
            strings={strings}
          />
          <button
            type="button"
            className={buttonVariants({ variant: "ghost" })}
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              setPlayRequest((n) => n + 1);
            }}
          >
            {strings["common.nav.how-it-works"]}
          </button>
          <a className={buttonVariants({ variant: "ghost" })} href={REPOSITORY}>
            GitHub
          </a>
          <div className="flex items-center gap-1">
            <SupportMenu compact strings={strings} />
            <LanguageMenu
              compact
              locale={locale}
              alternates={alternates}
              current={text.language}
              strings={strings}
            />
            <ThemeToggle
              theme={theme}
              onChange={setTheme}
              label={strings["common.theme.toggle"]}
            />
          </div>
        </nav>

        <SignAssembly
          start={start}
          startLabel={text.startLabel}
          howItWorks={localePath(locale, "/how-it-works/")}
          playRequest={playRequest}
          strings={strings}
        />

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Search
              value={query}
              onChange={setQuery}
              label={strings["home.search.label"]}
            />
            <InstallModeSwitch
              mode={mode}
              onChange={setMode}
              strings={strings}
            />
          </div>
          <div className="mt-8">
            <SignpostList
              locale={locale}
              sources={visible}
              adopters={text.adopters}
            >
              {(s) => (
                <>
                  <Install
                    source={s}
                    mode={mode}
                    onCopied={() => setCopied(mode)}
                    strings={strings}
                  />
                  <div>
                    <p className="leading-snug">{s.description}</p>
                    <div className="mt-1 text-[14px] text-muted-foreground">
                      {text.details[s.repository]}
                    </div>
                  </div>
                  <div>
                    <Profiles source={s} />
                  </div>
                </>
              )}
            </SignpostList>
            {visible.length === 0 && (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyTitle className="text-base">
                    {formatMessage(
                      locale,
                      "home.search.no-match",
                      text.noMatch,
                      {
                        query,
                      },
                    )}
                  </EmptyTitle>
                  <EmptyDescription className="text-[15px]">
                    {text.clear}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
          <p className="mt-10 max-w-2xl text-[15px] leading-snug text-muted-foreground">
            <RichText
              parts={text.origin}
              slots={{ topic: <code>repo-standards</code> }}
            />{" "}
            {text.leftOut && `${text.leftOut} `}
            {strings["home.sources.list-yours"]}
          </p>
          <aside className="mt-4 max-w-2xl text-[15px] leading-snug text-muted-foreground">
            {strings["home.sources.adopters-explanation"]}
          </aside>
          {/* for people: the Markdown version leaves asides out */}
          <aside className="mt-4 max-w-2xl text-[15px] leading-snug text-muted-foreground">
            <RichText
              parts={text.invitation}
              slots={{
                first: (
                  <a
                    className="text-foreground underline underline-offset-4"
                    href={SUPPORT[0].url}
                  >
                    {SUPPORT[0].name}
                  </a>
                ),
                second: (
                  <a
                    className="text-foreground underline underline-offset-4"
                    href={SUPPORT[1].url}
                  >
                    {SUPPORT[1].name}
                  </a>
                ),
              }}
            />
          </aside>
        </section>
      </main>
      <AdoptionDialog
        copied={copied}
        onClose={() => setCopied(null)}
        strings={strings}
      />
    </TooltipProvider>
  );
}
