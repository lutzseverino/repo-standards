import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CODE_BACKGROUND,
  contrast,
  docsCss,
  palette,
  type Theme,
} from "./docs-palette.ts";

// WCAG 2.2 AA for normal-size text.
const AA = 4.5;

test("docs text, links and code meet WCAG 2.2 AA in both themes", () => {
  const failures: string[] = [];
  for (const theme of ["light", "dark"] as Theme[]) {
    const color = palette(theme);
    const check = (text: string, background: string, use: string) => {
      const ratio = contrast(color(text), color(background));
      if (ratio < AA)
        failures.push(
          `${theme} ${use}: ${text} on ${background} is ${ratio.toFixed(2)}`,
        );
    };
    // headings, body and muted text, and links, including inline code,
    // on the page, the header, the sidebar, inline and block code, and the
    // search's focused result
    for (const text of [
      "--sl-color-white",
      "--sl-color-gray-1",
      "--sl-color-gray-2",
      "--sl-color-gray-3",
      "--sl-color-text",
      "--sl-color-text-accent",
    ])
      for (const background of [
        "--sl-color-bg",
        "--sl-color-bg-nav",
        "--sl-color-bg-sidebar",
        "--sl-color-bg-inline-code",
        CODE_BACKGROUND[theme],
        "--sl-color-accent-low",
      ])
        check(text, background, "text");
    // the sidebar's current page and the skip link
    check("--sl-color-text-invert", "--sl-color-text-accent", "current page");
  }
  assert.deepEqual(failures, []);
});

test("the header's plate keeps its white legend legible on Verkehrsblau", () => {
  const color = palette("light");
  assert.ok(contrast("#ffffff", color("--verkehrsblau")) >= AA);
});

test("the docs stylesheet only sets Starlight's custom properties", () => {
  const rules = docsCss.replace(/@import "\.\/tokens\.css";/, "");
  assert.doesNotMatch(rules, /@import|@font-face|@layer/);
  // every declaration names a Starlight property, on the root or backdrop
  const declarations = [...rules.matchAll(/([\w-]+)\s*:\s*[^;{}]+;/g)].map(
    (m) => m[1],
  );
  assert.ok(declarations.length > 0);
  assert.deepEqual(
    declarations.filter((name) => !name.startsWith("--sl-")),
    [],
  );
  const selectors = [...rules.matchAll(/([^{};]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((selector) => !selector.startsWith("@media"));
  assert.deepEqual(
    [...new Set(selectors)].sort(),
    [
      ":root",
      ":root, ::backdrop",
      ':root[data-theme="light"], [data-theme="light"] ::backdrop',
    ].sort(),
  );
});
