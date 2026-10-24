// The theme, the same on every page: the visitor's choice, stored under the
// key it has always had so returning visitors keep it, or else the system
// colour scheme. It is applied to <html> as shadcn's `.dark` class and as a
// `data-theme` attribute, the one Starlight reads, so a docs page can share
// the choice. The page head applies it before anything is drawn
// (`themeScript`, in layouts/base.astro), and the nav's toggle chooses it
// through `useTheme` (theme.ts).

export type Theme = "dark" | "light";

/** Reads, applies and stores the theme. The head's inline copy is this
 * function's source, so it must reference nothing outside its own body. */
export function themes() {
  const KEY = "theme";
  const DARK = "(prefers-color-scheme: dark)";

  /** The visitor's choice, if they made one. */
  const stored = (): Theme | null => {
    try {
      const value = window.localStorage.getItem(KEY);
      return value === "dark" || value === "light" ? value : null;
    } catch {
      // storage can be unavailable, as in some private windows
      return null;
    }
  };
  const system = (): Theme =>
    window.matchMedia(DARK).matches ? "dark" : "light";
  const apply = (theme: Theme) => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
  };
  const current = (): Theme =>
    document.documentElement.classList.contains("dark") ? "dark" : "light";
  /** Remembers the visitor's choice and applies it. */
  const choose = (theme: Theme) => {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      // the choice then lasts only for this page
    }
    apply(theme);
  };
  return { DARK, stored, system, apply, current, choose };
}

/** The inline script that applies the stored or system theme before the
 * first paint. */
export const themeScript = () => `(() => {
  const theme = (${themes.toString()})();
  theme.apply(theme.stored() ?? theme.system());
})();`;
