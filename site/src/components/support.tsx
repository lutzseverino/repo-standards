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

/** `compact` shows the heart alone on a phone, for a nav with no room to
 * spare; the word stays the control's name. */
export function SupportMenu({
  strings,
  compact = false,
}: {
  strings: Strings<(typeof SUPPORT_STRINGS)[number]>;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <HeartIcon aria-hidden="true" />
        <span className={compact ? "max-[30rem]:sr-only" : undefined}>
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
