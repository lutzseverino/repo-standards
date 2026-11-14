// The theme, the same on every page: the visitor's choice, stored under the
// key it has always had so returning visitors keep it, or else the system
// colour scheme. It is applied to <html> as shadcn's `.dark` class and as a
// `data-theme` attribute, the one Starlight reads, so a docs page can share
// the choice. The page head applies it before anything is drawn
// (prepaint/theme.ts, in layouts/base.astro), and the nav's toggle chooses it
// through `useTheme` (theme.ts).

export type Theme = "dark" | "light";
export type ThemePreference = "system" | Theme;

/** Reads, applies and stores the theme. */
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
  /** Document-local memory survives failed storage writes and removals, and
   * is shared by every consumer, including separately hydrated islands. */
  const preference = (): ThemePreference => {
    const root = document.documentElement;
    const value = root.dataset.themePreference;
    if (value === "system" || value === "light" || value === "dark")
      return value;
    const initial = stored() ?? "system";
    root.dataset.themePreference = initial;
    return initial;
  };
  const sync = () => {
    const selected = preference();
    apply(selected === "system" ? system() : selected);
  };
  /** Remembers the visitor's choice and applies it. */
  const choose = (theme: ThemePreference) => {
    document.documentElement.dataset.themePreference = theme;
    try {
      if (theme === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, theme);
    } catch {
      // the choice then lasts only for this page
    }
    sync();
  };
  return { DARK, stored, system, apply, current, preference, sync, choose };
}
