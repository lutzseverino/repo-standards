import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const read = (file: string) =>
  readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

const SIGN_SHEETS = [
  "components/sign/sign.css",
  "components/sign/light.css",
  "components/sign/story.css",
  "components/adoption-dialog.css",
];

test("the sign stylesheets sit in the sign layer, before Tailwind's utilities", () => {
  for (const file of SIGN_SHEETS) {
    const css = read(file).trim();
    assert.match(css, /^@layer sign \{[\s\S]*\}$/, file);
    // one block: the layer's own braces close only at the end
    let depth = 0;
    for (let i = 0; i < css.length; i++) {
      depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
      if (depth === 0 && css[i] === "}") assert.equal(i, css.length - 1, file);
    }
  }
  assert.match(
    read("styles/global.css"),
    /^\s*@layer theme, base, components, sign, utilities;\s*@import "tailwindcss";/,
  );
});

test("the sign stylesheets style only their own classes", () => {
  for (const file of SIGN_SHEETS) {
    const classes = [
      ...read(file)
        // property values hold no class names, and file names in url()s
        // would read as classes
        .replace(/\{[^{}]*\}/g, "{}")
        .matchAll(/\.(-?[_a-zA-Z][\w-]*)/g),
    ].map((m) => m[1]);
    const generic = classes.filter(
      (c) =>
        !/^(sign|signpost|story|adoption)-/.test(c) &&
        // the plates' parts, styled only inside a scoped plate
        ![
          "seal",
          "slats",
          "rainbow",
          "spill",
          "lens",
          "lens-shine",
          "lit",
          "flare-h",
          "flare-v",
          "sB",
          "sC",
          "sD",
          "dark",
        ].includes(c),
    );
    assert.deepEqual(generic, [], file);
  }
});

test("the fonts and the sign's colours are tokens any page can load", () => {
  const tokens = read("styles/tokens.css");
  assert.match(tokens, /@font-face/);
  assert.match(tokens, /--verkehrsblau:/);
  const declared = (css: string) =>
    [...css.matchAll(/[{;]\s*(--[\w-]+)\s*:/g)].map((m) => m[1]);

  const sign = read("components/sign/sign.css");
  assert.doesNotMatch(sign, /@font-face/);
  assert.doesNotMatch(sign, /(^|[{}\s])(:root|\.dark)\s*\{/);
  assert.deepEqual(
    declared(sign).filter((name) => declared(tokens).includes(name)),
    [],
  );
  // no Tailwind, so no preflight
  assert.doesNotMatch(tokens, /@import|@tailwind|@apply|@theme/);
});

// every authored stylesheet: the .css files and the .astro files' <style>
const authored = (directory: string): [string, string][] =>
  readdirSync(new URL(`../src/${directory}`, import.meta.url), {
    recursive: true,
    encoding: "utf8",
  })
    .filter((file) => /\.(css|astro)$/.test(file))
    .map((file) => `${directory}/${file}`)
    .map((file): [string, string] => {
      const css = read(file);
      return [
        file,
        file.endsWith(".astro")
          ? [...css.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
              .map((m) => m[1])
              .join("\n")
          : css,
      ];
    });

const selectors = (css: string) =>
  [
    ...css
      .replace(/@(import|source|layer [\w, ]+;)[^;]*;?/g, "")
      .replace(/\{[^{}]*\}/g, "{}")
      .matchAll(/([^{}]+)\{\}/g),
  ].map((m) => m[1].trim());

test("no stylesheet styles the Support control or its menu by class name", () => {
  for (const [file, css] of [
    ...authored("styles"),
    ...authored("components"),
    ...authored("layouts"),
    ...authored("pages"),
  ]) {
    const classes = selectors(css).flatMap((selector) =>
      [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]),
    );
    // the footer's line is text, not a control
    assert.deepEqual(
      classes.filter(
        (c) =>
          c.startsWith("support") &&
          !["support-line", "support-footer"].includes(c),
      ),
      [],
      file,
    );
  }
  // the docs' only rules for the components name their data-slot
  const docs = read("styles/docs-components.css").replace(
    /@layer base \{([\s\S]*)\}\s*$/,
    "$1",
  );
  assert.ok(selectors(docs).length > 0);
  for (const selector of selectors(docs))
    assert.match(selector, /^\[data-slot="[\w-]+"\]$/, selector);
});

test("the docs load Tailwind's theme and utilities, not its preflight, and the site's own shadcn tokens", () => {
  const docs = read("styles/docs-components.css");
  const imports = [...docs.matchAll(/@import "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports, [
    "tailwindcss/theme.css",
    "tailwindcss/utilities.css",
    "tw-animate-css",
    "shadcn/tailwind.css",
    "./shadcn-theme.css",
  ]);
  assert.match(
    docs,
    /@import "tailwindcss\/utilities\.css" layer\(utilities\) source\(none\);/,
  );
  assert.match(read("styles/global.css"), /@import "\.\/shadcn-theme\.css";/);
  // one copy of the tokens, so the docs' never drift from the site's
  for (const [file, css] of authored("styles"))
    if (file !== "styles/shadcn-theme.css")
      assert.doesNotMatch(
        css,
        /--(background|foreground|popover|accent|input)\s*:/,
        file,
      );
});
