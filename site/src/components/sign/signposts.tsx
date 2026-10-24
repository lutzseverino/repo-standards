// The list: each standards source is a card headed by its own sign plate,
// with an exit tab and a version shield standing up from the plate. Entries
// line up with their neighbours (subgrid): plate, copy control, text and
// profiles each start on one line across a row.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Card, CardContent } from "@/components/app/card";
import { repositoryUrl, type Source } from "@/lib/catalogue";
import { Arrow, ExitArrow } from "./arrow";
import { Face } from "./face";
import { fitName } from "./fit-name";
import { announceLayout } from "./torch";

export function SignpostList({
  sources,
  children,
}: {
  sources: Source[];
  /** The card body for each source. */
  children: (source: Source) => ReactNode;
}) {
  const keys = sources.map((s) => s.repository).join(" ");
  // plates came or went: the torch measures them again
  useLayoutEffect(() => {
    requestAnimationFrame(announceLayout);
  }, [keys]);

  return (
    <ul className="signpost-grid">
      {sources.map((s, i) => (
        <li key={s.repository} className="signpost-entry">
          <div className="signpost-sign">
            <div className="signpost-tabs">
              <Face
                kind="blue"
                className="sign-tab-face signpost-exit-tab"
                hidden
              >
                <span className="sign-face__inner flex items-center gap-1.5 tabular-nums">
                  {i + 1}
                  <ExitArrow />
                </span>
              </Face>
              <Face
                kind="blue"
                className="sign-tab-face signpost-shield-tab"
                hidden
              >
                <span className="sign-face__inner tabular-nums">
                  {s.release.version}
                </span>
              </Face>
            </div>
            <Face
              as="a"
              kind="blue"
              href={repositoryUrl(s)}
              label={`${s.name} ${s.release.version}`}
              className="signpost-plate"
            >
              <span className="sign-face__inner flex w-full items-center gap-3">
                <Arrow size={34} />
                <FitName name={s.name} />
              </span>
            </Face>
          </div>
          {/* the plate is the card's header, so the card is flush under it */}
          <Card className="signpost-body row-span-3 mb-10 grid grid-rows-subgrid gap-0 rounded-t-none rounded-b-[12px] border border-t-0 border-(--card-border) py-0 text-base ring-0">
            <CardContent className="row-span-3 grid grid-rows-subgrid gap-3 py-4 pb-[18px]">
              {children(s)}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** A plate's name, fitted to one line where it can be (fit-name.ts). */
function FitName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => fitName(el);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement!);
    // a font that arrives later changes the name's width, not the plate's
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [name]);
  return (
    // fitted before the page hydrates (rig.ts)
    <span ref={ref} className="signpost-name" suppressHydrationWarning>
      {name}
    </span>
  );
}
