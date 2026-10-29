// The nav's theme toggle: the theme in effect, following the system colour
// scheme until the visitor picks one (theme-core.ts).
import { useEffect, useState } from "react";
import { themes, type Theme } from "./theme-core.ts";

export type { Theme };

/** The theme in effect, and a setter that remembers the visitor's choice.
 * `null` until the page has hydrated. */
export function useTheme(): [Theme | null, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const t = themes();
    const sync = () => setTheme(t.current());
    sync();
    // a theme another component chose, such as the nav's toggle, which the
    // homepage's torch follows
    const root = new MutationObserver(sync);
    root.observe(document.documentElement, { attributeFilter: ["class"] });
    const scheme = window.matchMedia(t.DARK);
    const onScheme = () => {
      if (t.stored()) return;
      t.apply(t.system());
      sync();
    };
    scheme.addEventListener("change", onScheme);
    return () => {
      root.disconnect();
      scheme.removeEventListener("change", onScheme);
    };
  }, []);

  const choose = (next: Theme) => {
    themes().choose(next);
    setTheme(next);
  };
  return [theme, choose];
}
