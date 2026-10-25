import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SUPPORT } from "../src/lib/support.ts";
import {
  block,
  contrast,
  palette,
  source,
  type Theme,
} from "./docs-palette.ts";

const repository = (file: string) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

test("the repository's Sponsor button and npm name the site's two pages, in its order", () => {
  assert.deepEqual(
    SUPPORT.map(({ name }) => name),
    ["GitHub Sponsors", "Ko-fi"],
  );
  assert.equal(
    repository(".github/FUNDING.yml"),
    "github: lutzseverino\nko_fi: lutzseverino\n",
  );
  const pkg = JSON.parse(repository("package.json")) as { funding: unknown };
  assert.deepEqual(pkg.funding, [
    { type: "github", url: SUPPORT[0].url },
    { type: "individual", url: SUPPORT[1].url },
  ]);
});

// WCAG 2.2 AA for normal-size text.
const AA = 4.5;
const support = source(new URL("../src/styles/support.css", import.meta.url));
const shadcn = source(
  new URL("../src/styles/shadcn-theme.css", import.meta.url),
);

type Rgba = [number, number, number, number];

const hex = (value: string): Rgba => {
  const full = value.length === 4 ? value.replace(/[0-9a-f]/gi, "$&$&") : value;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16));
  return [r / 255, g / 255, b / 255, 1];
};
const toHex = ([r, g, b]: Rgba) =>
  `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

// sRGB and OKLab, for color-mix(in oklab, …)
const linear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const gamma = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const toOklab = ([r, g, b]: Rgba) => {
  const [lr, lg, lb] = [r, g, b].map(linear);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const fromOklab = ([L, A, B]: number[]): [number, number, number] => {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(gamma) as [number, number, number];
};

/** color-mix(in oklab, a p, b), premultiplied as CSS mixes it. */
function mix(a: Rgba, p: number, b: Rgba): Rgba {
  const alpha = a[3] * p + b[3] * (1 - p);
  if (alpha === 0) return [0, 0, 0, 0];
  const [la, lb] = [toOklab(a), toOklab(b)];
  const lab = la.map((v, i) => (v * a[3] * p + lb[i] * b[3] * (1 - p)) / alpha);
  return [...fromOklab(lab), alpha];
}
/** A colour drawn over an opaque background. */
const over = (top: Rgba, below: Rgba): Rgba => [
  ...([0, 1, 2].map((i) => top[i] * top[3] + below[i] * (1 - top[3])) as [
    number,
    number,
    number,
  ]),
  1,
];

/** The shadcn tokens a page loads, light on :root and dark on .dark. */
function shadcnTokens(theme: Theme) {
  const values: Record<string, string> = {
    ...block(shadcn, ":root"),
    ...(theme === "dark" ? block(shadcn, ".dark") : {}),
  };
  const resolve = (value: string): Rgba => {
    value = value.trim();
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    if (reference) return resolve(values[reference[1]]);
    if (value === "transparent") return [0, 0, 0, 0];
    if (/^#([0-9a-f]{3}){1,2}$/i.test(value)) return hex(value);
    const mixed = /^color-mix\(in oklab, (\S+) ([\d.]+)%, (\S+)\)$/.exec(value);
    if (mixed)
      return mix(resolve(mixed[1]), Number(mixed[2]) / 100, resolve(mixed[3]));
    throw new Error(`${theme}: cannot read ${value}`);
  };
  /** A token, or Tailwind's `token/alpha`, as Tailwind mixes it. */
  return (token: string) => {
    const [name, alpha] = token.split("/");
    const colour = resolve(`var(--${name})`);
    return alpha === undefined
      ? colour
      : mix(colour, Number(alpha) / 100, [0, 0, 0, 0]);
  };
}

test("the Support control and its menu meet WCAG 2.2 AA in both themes, on the site and the docs", () => {
  const failures: string[] = [];
  for (const theme of ["light", "dark"] as Theme[]) {
    const token = shadcnTokens(theme);
    const check = (text: Rgba, background: Rgba, use: string) => {
      const ratio = contrast(toHex(text), toHex(background));
      if (ratio < AA)
        failures.push(
          `${theme} ${use}: ${toHex(text)} on ${toHex(background)} is ${ratio.toFixed(2)}`,
        );
    };
    // the outline trigger draws its own fill over the site's page and the
    // docs' header: at rest, pointed at and open (components/ui/button.tsx)
    const fills =
      theme === "dark"
        ? ["input/30", "input/50", "muted"]
        : ["background", "muted"];
    const pages = {
      site: token("background"),
      docs: hex(palette(theme)("--sl-color-bg-nav")),
    };
    for (const [page, background] of Object.entries(pages))
      for (const fill of fills)
        check(
          token("foreground"),
          over(token(fill), background),
          `trigger on the ${page} page, bg-${fill}`,
        );
    // the menu's label and items, at rest and highlighted
    // (components/ui/dropdown-menu.tsx)
    const menu = token("popover");
    check(token("muted-foreground"), menu, "menu label");
    check(token("popover-foreground"), menu, "menu item");
    check(
      token("accent-foreground"),
      over(token("accent"), menu),
      "highlighted item",
    );
  }
  assert.deepEqual(failures, []);
});

test("the footer's line meets WCAG 2.2 AA in both themes", () => {
  const failures: string[] = [];
  const line = /\.support-line \{[^}]*?[; ]color: (#[0-9a-f]{6})/i.exec(
    support,
  )![1];
  const darkLine = /\.dark \.support-line \{ color: (#[0-9a-f]{6})/i.exec(
    support,
  )![1];
  for (const theme of ["light", "dark"] as Theme[]) {
    // the site's page and the docs' page
    for (const page of [
      toHex(shadcnTokens(theme)("background")),
      palette(theme)("--sl-color-bg"),
    ]) {
      const text = theme === "dark" ? darkLine : line;
      const ratio = contrast(text, page);
      if (ratio < AA)
        failures.push(`${theme}: ${text} on ${page} is ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(failures, []);
});
