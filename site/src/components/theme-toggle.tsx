import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/app/button";
import type { Theme } from "@/lib/theme";

/** Switches between the light and dark theme. The icon follows the `.dark`
 * class, so it is right before the page hydrates. */
export function ThemeToggle({
  theme,
  onChange,
  label,
}: {
  theme: Theme | null;
  onChange: (theme: Theme) => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => onChange(theme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}
