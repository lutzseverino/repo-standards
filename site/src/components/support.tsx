// The header's one Support control, on every page, the docs' too: a shadcn
// Button that opens a Dropdown Menu of GitHub Sponsors and Ko-fi. It works
// once its island hydrates; until then, and without a script, the footer's
// line (SupportLine.astro) carries both links.
import { ArrowUpRightIcon, HeartIcon } from "lucide-react";
import { Button } from "@/components/app/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/app/dropdown-menu";
import type { Strings } from "@/i18n/ids";
import { SUPPORT } from "@/lib/support";

export const SUPPORT_STRINGS = [
  "common.support.button",
  "common.support.menu",
] as const;

// below which width the control shows its heart alone: the docs' header on
// a phone, or the site's nav wherever it collapses (site-nav.tsx)
const HEART_ALONE = {
  "30rem": "max-[30rem]:sr-only",
  "50rem": "max-[50rem]:sr-only",
} as const;

/** `heartAlone` shows the heart alone below that width, for a header with
 * no room to spare; the word stays the control's name. */
export function SupportMenu({
  strings,
  heartAlone,
}: {
  strings: Strings<(typeof SUPPORT_STRINGS)[number]>;
  heartAlone?: keyof typeof HEART_ALONE;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <HeartIcon aria-hidden="true" />
        <span className={heartAlone && HEART_ALONE[heartAlone]}>
          {strings["common.support.button"]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {strings["common.support.menu"]}
          </DropdownMenuLabel>
          {SUPPORT.map(({ name, url }) => (
            <DropdownMenuItem key={url} render={<a href={url} />}>
              {name}
              <ArrowUpRightIcon aria-hidden="true" className="ml-auto" />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
