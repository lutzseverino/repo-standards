import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/app/button";
import type { Theme } from "@/lib/theme";

/** The theme a toggle leads to: the sun by night, the moon by day. It
 * follows the `.dark` class, so it is right before the page hydrates. */
export function ThemeIcon() {
  return (
    <>
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </>
  );
}

/** The theme after `theme`. */
export const otherTheme = (theme: Theme | null): Theme =>
  theme === "dark" ? "light" : "dark";

/** Switches between the light and dark theme. */
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
      onClick={() => onChange(otherTheme(theme))}
    >
      <ThemeIcon />
    </Button>
  );
}
