import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fitName } from "../src/components/sign/fit-name.ts";

// A lit copy that is transformed or positioned apart from its plate puts its
// text on different pixels from the plate's, which shows as doubled text
// wherever the light falls. It shares the plate's grid cell instead.
test("no rule moves a plate's lit copy apart from the plate", () => {
  const css = readFileSync(
    new URL("../src/components/sign/sign.css", import.meta.url),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");
  const moved = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(
    ([, selectors, body]) =>
      selectors
        .split(",")
        .map((s) => s.trim())
        // the copy itself or the plate inside it, not their pseudo-elements
        // or the layers inside them
        .filter((s) => /\.(sign-lit-copy|sign-face--lit)$/.test(s))
        .flatMap((s) =>
          [
            ...body.matchAll(
              /(?:^|;)\s*(transform|translate|rotate|scale|left|top|right|bottom|width|inset|position\s*:\s*(?:absolute|fixed))\b/g,
            ),
          ].map((m) => `${s} { ${m[1]} }`),
        ),
  );
  assert.deepEqual(moved, []);
});

test("a plate's lit copy takes the plate's fitted name, never its own", () => {
  // two names in one plate, the plate's and its lit copy's: each is as wide
  // as its text at its font size, in a 300 px line
  const name = (lit: boolean) => {
    const el = {
      style: { fontSize: "25px", whiteSpace: "" },
      clientWidth: 300,
      get scrollWidth() {
        return parseFloat(el.style.fontSize) * 14;
      },
      closest: (selector: string) =>
        selector === ".sign-face--lit" ? (lit ? {} : null) : wrap,
    };
    return el;
  };
  const own = name(false);
  const lit = name(true);
  const wrap = { querySelector: () => lit };

  fitName(own as unknown as HTMLElement);
  assert.equal(own.style.fontSize, "21px");
  assert.deepEqual(lit.style, own.style);

  lit.style.fontSize = "25px";
  fitName(lit as unknown as HTMLElement);
  assert.equal(lit.style.fontSize, "25px", "the lit copy is never measured");
});
