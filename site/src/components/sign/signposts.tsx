// The list: each standards source is a card headed by its own sign plate,
// with an exit tab standing up from the plate. Entries line up with their
// neighbours (subgrid): plate, copy control, text and profiles each start on
// one line across a row.
import { useLayoutEffect, type ReactNode } from "react";
import { Card, CardContent } from "@/components/app/card";
import { repositoryUrl, type Source } from "@/lib/catalogue";
import { Arrow, ExitArrow } from "./arrow";
import { Face } from "./face";
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
    <ul className="posts-grid">
      {sources.map((s, i) => (
        <li key={s.repository} className="entry">
          <div className="entry-sign">
            <div className="signpost-tabs">
              <Face kind="blue" className="tab-face exit-tab" hidden>
                <span className="face__inner flex items-center gap-1.5 tnum">
                  {i + 1}
                  <ExitArrow />
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
              <span className="face__inner flex w-full items-center gap-3">
                <Arrow size={34} />
                <span className="shield signpost-shield tnum">
                  {s.release.version}
                </span>
                <span className="signpost-name">{s.name}</span>
              </span>
            </Face>
          </div>
          {/* the plate is the card's header, so the card is flush under it */}
          <Card className="entry-body row-span-3 mb-10 grid grid-rows-subgrid gap-0 rounded-t-none rounded-b-[12px] border border-t-0 border-(--card-border) py-0 text-base ring-0">
            <CardContent className="row-span-3 grid grid-rows-subgrid gap-3 py-4 pb-[18px]">
              {children(s)}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
