import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SUPPORT } from "../src/lib/support.ts";
import {
  block,
  contrast,
  palette,
  source,
  tokens,
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
const global = source(new URL("../src/styles/global.css", import.meta.url));

test("the Support control and the footer's line meet WCAG 2.2 AA in both themes", () => {
  const failures: string[] = [];
  for (const theme of ["light", "dark"] as Theme[]) {
    const dark = theme === "dark";
    const values: Record<string, string> = {
      ...block(tokens, ":root"),
      ...(dark ? block(tokens, ".dark") : {}),
      ...block(support, ".support"),
      ...(dark ? block(support, ".dark .support") : {}),
    };
    const color = (value: string): string => {
      const reference = /^var\((--[\w-]+)\)$/.exec(value);
      return reference ? color(values[reference[1]]) : value.toLowerCase();
    };
    const line = color(
      /\.support-line \{[^}]*?[; ]color: (#[0-9a-f]{6})/i.exec(support)![1],
    );
    const darkLine = color(
      /\.dark \.support-line \{ color: (#[0-9a-f]{6})/i.exec(support)![1],
    );
    // the site's page and the docs' page and header
    const pages = [
      block(global, dark ? ".dark" : ":root")["--background"],
      palette(theme)("--sl-color-bg"),
      palette(theme)("--sl-color-bg-nav"),
    ];
    const check = (text: string, background: string, use: string) => {
      const ratio = contrast(text, background);
      if (ratio < AA)
        failures.push(
          `${theme} ${use}: ${text} on ${background} is ${ratio.toFixed(2)}`,
        );
    };
    for (const page of pages) {
      check(color("var(--support-ink)"), page, "control");
      check(dark ? darkLine : line, page, "footer");
    }
    check("#ffffff", color("var(--support-fill)"), "open control");
    for (const text of ["--support-menu-ink", "--support-menu-muted"])
      check(color(`var(${text})`), color("var(--support-menu-bg)"), text);
  }
  assert.deepEqual(failures, []);
});
