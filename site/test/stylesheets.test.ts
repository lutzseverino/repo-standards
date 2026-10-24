import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
