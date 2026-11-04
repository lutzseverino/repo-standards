// The resolved appearance and selected preference shared by the nav and
// homepage lighting. The head initializes document-local memory before paint.
import { useEffect, useState } from "react";
import { themes, type Theme, type ThemePreference } from "./theme-core.ts";

export type { Theme, ThemePreference };

/** Resolved appearance, preference setter, and selected preference.
 * Appearance and preference are null until hydration. */
export function useTheme(): [
  Theme | null,
  (preference: ThemePreference) => void,
  ThemePreference | null,
] {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [preference, setPreference] = useState<ThemePreference | null>(null);

  useEffect(() => {
    const t = themes();
    const read = () => {
      setTheme(t.current());
      setPreference(t.preference());
    };
    t.sync();
    read();
    // Other consumers can choose a preference without changing appearance.
    const root = new MutationObserver(read);
    root.observe(document.documentElement, {
      attributeFilter: ["class", "data-theme-preference"],
    });
    const scheme = window.matchMedia(t.DARK);
    const onScheme = () => {
      t.sync();
      read();
    };
    scheme.addEventListener("change", onScheme);
    return () => {
      root.disconnect();
      scheme.removeEventListener("change", onScheme);
    };
  }, []);

  const choose = (next: ThemePreference) => {
    const t = themes();
    t.choose(next);
    setTheme(t.current());
    setPreference(next);
  };
  return [theme, choose, preference];
}
