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
    setTheme(t.current());
    const scheme = window.matchMedia(t.DARK);
    const onScheme = () => {
      if (t.stored()) return;
      t.apply(t.system());
      setTheme(t.current());
    };
    scheme.addEventListener("change", onScheme);
    return () => scheme.removeEventListener("change", onScheme);
  }, []);

  const choose = (next: Theme) => {
    themes().choose(next);
    setTheme(next);
  };
  return [theme, choose];
}
