import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDate,
  formatList,
  formatNumber,
  selectPlural,
} from "../src/lib/format.ts";

test("lists use the locale's conjunction and punctuation", () => {
  const items = ["a", "b", "c"];
  assert.equal(formatList(items, "en"), "a, b, and c");
  assert.equal(formatList(items, "es"), "a, b y c");
  assert.equal(formatList(items, "ca"), "a, b i c");
  assert.equal(formatList([], "en"), "");
  assert.equal(formatList(["a"], "en"), "a");
  assert.equal(formatList(["a", "b"], "en"), "a and b");
});

test("counts preserve ungrouped English output and use other locales' number separators", () => {
  assert.equal(formatNumber(1_000_000, "en"), "1000000");
  assert.equal(formatNumber(1_000_000, "es"), "1.000.000");
  assert.equal(formatNumber(1_000_000, "ca"), "1.000.000");
});

test("plural selection reaches CLDR categories including Spanish and Catalan many", () => {
  const forms = { one: "singular", many: "millions", other: "plural" };
  for (const locale of ["en", "es", "ca"]) {
    assert.equal(selectPlural(0, locale, forms), "plural");
    assert.equal(selectPlural(1, locale, forms), "singular");
    assert.equal(selectPlural(2, locale, forms), "plural");
  }
  assert.equal(selectPlural(1_000_000, "en", forms), "plural");
  assert.equal(selectPlural(1_000_000, "es", forms), "millions");
  assert.equal(selectPlural(1_000_000, "ca", forms), "millions");
  assert.equal(
    selectPlural(1_000_000, "ca", { other: "fallback" }),
    "fallback",
  );
  assert.equal(
    selectPlural(0, "ar", { zero: "none", other: "fallback" }),
    "none",
  );
  assert.equal(
    selectPlural(2, "ar", { two: "pair", other: "fallback" }),
    "pair",
  );
  assert.equal(selectPlural(3, "ar", { few: "few", other: "fallback" }), "few");
});

test("dates keep English day-month-year order and use Spanish and Catalan month forms", () => {
  const date = "2026-10-25T23:30:00Z";
  assert.equal(formatDate(date, "en"), "25 Oct 2026");
  assert.equal(formatDate(date, "en", "long"), "25 October 2026");
  assert.equal(formatDate(date, "es", "long"), "25 de octubre de 2026");
  assert.equal(formatDate(date, "ca", "long"), "25 d’octubre del 2026");
});
