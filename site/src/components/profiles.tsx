import { Badge } from "@/components/app/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/app/tooltip";
import type { Source } from "@/lib/catalogue";

/** A source's profiles, each with its description in a tooltip. */
export function Profiles({ source }: { source: Source }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {source.profiles.map((p) => (
        <Tooltip key={p.name}>
          <TooltipTrigger
            render={
              <Badge
                variant="outline"
                tabIndex={0}
                className="h-6 cursor-default px-2.5 text-[13px]"
              />
            }
          >
            {p.name}
          </TooltipTrigger>
          <TooltipContent>{p.description}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}
