// A translation's sections take their source's IDs, so links and redirects
// to a section work in every locale.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sharedSectionIds } from "../src/lib/section-ids.ts";

const SOURCE =
  '<h1 id="how-it-works">How it works</h1><h2 id="who-does-what">Who does what</h2><h3 id="the-cli">The CLI</h3>';

test("each heading takes the ID of its source's heading in the same place", () => {
  assert.equal(
    sharedSectionIds(
      '<h1 id="cómo-funciona">Cómo funciona</h1><p>…</p><h2 id="quién-hace-qué">Quién hace qué</h2><h3 id="la-cli">La CLI</h3>',
      SOURCE,
      "test",
    ),
    '<h1 id="how-it-works">Cómo funciona</h1><p>…</p><h2 id="who-does-what">Quién hace qué</h2><h3 id="the-cli">La CLI</h3>',
  );
});

test("a translation whose headings differ from its source's fails", () => {
  for (const html of [
    '<h1 id="a">A</h1><h2 id="b">B</h2>',
    '<h1 id="a">A</h1><h3 id="b">B</h3><h3 id="c">C</h3>',
    '<h1 id="a">A</h1><h2 id="b">B</h2><h3 id="c">C</h3><h3 id="d">D</h3>',
  ])
    assert.throws(
      () => sharedSectionIds(html, SOURCE, "test"),
      /keeps its source's outline/,
    );
});
