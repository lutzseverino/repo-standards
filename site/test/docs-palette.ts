// The docs' colours as a page in each theme sees them: Starlight's own
// properties, then the docs stylesheet's, which are unlayered and so win,
// each with its light block over its dark one when the page is light.
import { readFileSync } from "node:fs";

export type Theme = "dark" | "light";

export const source = (url: URL) =>
  readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replaceAll("'", '"');

export const docsCss = source(
  new URL("../src/styles/docs.css", import.meta.url),
);
export const tokens = source(
  new URL("../src/styles/tokens.css", import.meta.url),
);
const starlight = source(
  new URL(
    "../node_modules/@astrojs/starlight/style/props.css",
    import.meta.url,
  ),
);

/** The custom properties declared directly in the first block whose
 * selector is `selector`. */
export function block(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block`);
  const body = css.slice(
    start + selector.length + 2,
    css.indexOf("}", start + selector.length),
  );
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

const DARK = ":root, ::backdrop";
const LIGHT = ':root[data-theme="light"], [data-theme="light"] ::backdrop';

export function palette(theme: Theme) {
  const light = theme === "light";
  const values: Record<string, string> = {
    ...block(tokens, ":root"),
    ...block(starlight, DARK),
    ...(light ? block(starlight, LIGHT) : {}),
    ...block(docsCss, DARK),
    ...(light ? block(docsCss, LIGHT) : {}),
  };
  /** A property's colour as #rrggbb, through any var() it names. */
  const color = (name: string): string => {
    const value = values[name];
    const reference = /^var\((--[\w-]+)\)$/.exec(value ?? "");
    if (reference) return color(reference[1]);
    if (!/^#[0-9a-f]{6}$/i.test(value ?? ""))
      throw new Error(`${theme} ${name} is ${value}, not a hex colour`);
    return value.toLowerCase();
  };
  return color;
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG 2.2 contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Starlight draws code blocks on gray-6 at night and gray-7 by day (its
 * Expressive Code theming). */
export const CODE_BACKGROUND = {
  dark: "--sl-color-gray-6",
  light: "--sl-color-gray-7",
} as const;
