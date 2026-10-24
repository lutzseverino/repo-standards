// The homepage: the sign assembly over the signposts, lit by a hand torch.
import { useState } from "react";
import { AdoptionDialog } from "./adoption-dialog";
import { buttonVariants } from "@/components/app/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/app/empty";
import { TooltipProvider } from "@/components/app/tooltip";
import { Install, InstallModeSwitch, useInstallMode } from "./install";
import { Profiles } from "./profiles";
import { Search } from "./search";
import { SignAssembly } from "./sign/assembly";
import { SignpostList } from "./sign/signposts";
import { useTorch } from "./sign/torch";
import { REPOSITORY } from "./site-nav";
import { ThemeToggle } from "./theme-toggle";
import {
  STARTING_POINT,
  formatDate,
  matches,
  type Catalogue,
  type InstallMode,
} from "@/lib/catalogue";
import { useTheme } from "@/lib/theme";

// page-wide light layers and their diameter in beam radii. Like the other lit
// elements, they are lit before the page hydrates (sign/rig.ts), so React is
// told not to compare their style with the server's.
const LIGHT_LAYERS = [
  ["sign-torch-pool", 3],
  ["sign-lit-sheen", 2],
  ["sign-lit-prism", 2],
] as const;

export function Home({ catalogue }: { catalogue: Catalogue }) {
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
  const rejected = catalogue.rejectedCount;

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
        <nav className="mb-8 flex items-center justify-end gap-1 text-[15px]">
          <a className={buttonVariants({ variant: "ghost" })} href="/docs/">
            Documentation
          </a>
          <button
            type="button"
            className={buttonVariants({ variant: "ghost" })}
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              setPlayRequest((n) => n + 1);
            }}
          >
            How it works
          </button>
          <a className={buttonVariants({ variant: "ghost" })} href={REPOSITORY}>
            GitHub
          </a>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </nav>

        <SignAssembly start={start} playRequest={playRequest} />

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Search value={query} onChange={setQuery} />
            <InstallModeSwitch mode={mode} onChange={setMode} />
          </div>
          <div className="mt-8">
            <SignpostList sources={visible}>
              {(s) => (
                <>
                  <Install
                    source={s}
                    mode={mode}
                    onCopied={() => setCopied(mode)}
                  />
                  <div>
                    <p className="leading-snug">{s.description}</p>
                    <div className="mt-1 text-[14px] text-muted-foreground">
                      {s.repository}, {formatDate(s.release.publishedAt)}, needs
                      CLI {s.requires.replace(">=", "≥ ")}
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
                    No standards source matches “{query}”
                  </EmptyTitle>
                  <EmptyDescription className="text-[15px]">
                    Clear the search to see all {sources.length}.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
          <p className="mt-10 max-w-2xl text-[15px] leading-snug text-muted-foreground">
            Sources come from the public GitHub topic{" "}
            <code>repo-standards</code>, validated with CLI{" "}
            {catalogue.cliVersion}.{" "}
            {rejected > 0 &&
              `${rejected} more ${rejected === 1 ? "repository carries" : "repositories carry"} the topic but ${rejected === 1 ? "is" : "are"} left out, without a stable release this CLI can use. `}
            To list your own source, add the topic and publish a stable release.
          </p>
        </section>
      </main>
      <AdoptionDialog copied={copied} onClose={() => setCopied(null)} />
    </TooltipProvider>
  );
}
