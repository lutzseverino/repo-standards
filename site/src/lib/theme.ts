// The theme follows the system colour scheme until the visitor picks one in
// the nav, and is applied as shadcn's `.dark` class on <html>. The inline
// script in the page head applies it before anything is drawn.
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const THEME_KEY = "theme";
const DARK = "(prefers-color-scheme: dark)";

function current(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    // storage can be unavailable, as in some private windows
    return null;
  }
}

/** The theme in effect, and a setter that remembers the visitor's choice.
 * `null` until the page has hydrated. */
export function useTheme(): [Theme | null, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(current());
    const scheme = window.matchMedia(DARK);
    const onScheme = () => {
      if (stored()) return;
      apply(scheme.matches ? "dark" : "light");
      setTheme(current());
    };
    scheme.addEventListener("change", onScheme);
    return () => scheme.removeEventListener("change", onScheme);
  }, []);

  const choose = (next: Theme) => {
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // the choice then lasts only for this page
    }
    apply(next);
    setTheme(next);
  };
  return [theme, choose];
}
