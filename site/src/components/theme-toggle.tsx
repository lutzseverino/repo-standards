import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/app/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/app/dropdown-menu";
import type { Strings } from "@/i18n/ids";
import type { ThemePreference } from "@/lib/theme";

export const THEME_STRINGS = [
  "common.theme.toggle",
  "common.theme.system",
  "common.theme.light",
  "common.theme.dark",
] as const;

/** The appearance's icon follows `.dark`, including before hydration. */
export function ThemeIcon() {
  return (
    <>
      <SunIcon aria-hidden="true" className="hidden dark:block" />
      <MoonIcon aria-hidden="true" className="dark:hidden" />
    </>
  );
}

/** An icon-triggered menu whose radio state names the preference, even
 * when System resolves to the same appearance as an explicit choice. */
export function ThemeToggle({
  preference,
  onChange,
  strings,
}: {
  preference: ThemePreference | null;
  onChange: (preference: ThemePreference) => void;
  strings: Strings<(typeof THEME_STRINGS)[number]>;
}) {
  const label = strings["common.theme.toggle"];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={label}
      >
        <ThemeIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto" aria-label={label}>
        <DropdownMenuRadioGroup value={preference ?? ""} aria-label={label}>
          {(["system", "light", "dark"] as const).map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              closeOnClick
              onClick={() => onChange(option)}
            >
              {strings[`common.theme.${option}`]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
