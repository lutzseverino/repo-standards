import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { bundledScript } from "./prepaint-scripts.ts";

import { themes } from "../src/lib/theme-core.ts";

const themeScript = await bundledScript("theme");

/** A window with a root element, storage holding `stored`, and a system
 * colour scheme. */
function page(stored: string | null, systemDark = false) {
  const classes = new Set<string>();
  const storage = new Map<string, string>();
  if (stored !== null) storage.set("theme", stored);
  const root = {
    dataset: {} as Record<string, string>,
    classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, on: boolean) =>
        on ? classes.add(name) : classes.delete(name),
    },
  };
  const window: Record<string, unknown> = {
    document: { documentElement: root },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    matchMedia: () => ({ matches: systemDark }),
  };
  window.window = window;
  return { window, root, classes, storage };
}

/** Runs `use` with the page's window and document as globals. */
function within<T>(p: ReturnType<typeof page>, use: () => T): T {
  const saved = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: p.window, document: p.window.document });
  try {
    return use();
  } finally {
    Object.assign(globalThis, saved);
  }
}

test("choosing dark sets the class and the attribute, and is remembered", () => {
  const p = page(null);
  within(p, () => themes().choose("dark"));
  assert.ok(p.classes.has("dark"));
  assert.equal(p.root.dataset.theme, "dark");
  assert.equal(p.storage.get("theme"), "dark");

  within(p, () => themes().choose("light"));
  assert.ok(!p.classes.has("dark"));
  assert.equal(p.root.dataset.theme, "light");
  assert.equal(p.storage.get("theme"), "light");
});

test("the head's script applies the stored choice, or else the system's", () => {
  const run = (stored: string | null, systemDark: boolean) => {
    const p = page(stored, systemDark);
    vm.runInNewContext(themeScript, p.window);
    return [p.classes.has("dark"), p.root.dataset.theme];
  };
  assert.deepEqual(run("dark", false), [true, "dark"]);
  assert.deepEqual(run("light", true), [false, "light"]);
  assert.deepEqual(run(null, true), [true, "dark"]);
  assert.deepEqual(run(null, false), [false, "light"]);
});

test("without storage, the head's script follows the system", () => {
  const p = page(null, true);
  p.window.localStorage = {
    getItem: () => {
      throw new Error("storage is unavailable");
    },
  };
  vm.runInNewContext(themeScript, p.window);
  assert.equal(p.root.dataset.theme, "dark");
});

test("System removes an explicit choice and resolves the current OS scheme", () => {
  const p = page("light", true);
  within(p, () => themes().choose("system"));
  assert.equal(p.storage.has("theme"), false);
  assert.equal(p.root.dataset.theme, "dark");
  assert.ok(p.classes.has("dark"));
  within(p, () => assert.equal(themes().preference(), "system"));
});

for (const dark of [false, true]) {
  for (const stored of [null, "invalid", "system", "light", "dark"]) {
    test(`first paint: stored=${stored}, OS dark=${dark}`, () => {
      const p = page(stored, dark);
      vm.runInNewContext(themeScript, p.window);
      const preference =
        stored === "light" || stored === "dark" ? stored : "system";
      assert.equal(p.root.dataset.themePreference, preference);
      assert.equal(
        p.root.dataset.theme,
        preference === "system" ? (dark ? "dark" : "light") : preference,
      );
      assert.equal(p.classes.has("dark"), p.root.dataset.theme === "dark");
    });
  }
}

test("failed writes and removals retain document-local preference across OS changes and consumers", () => {
  const p = page("dark");
  Object.assign(p.window.localStorage as object, {
    setItem() {
      throw new Error("Storage unavailable");
    },
    removeItem() {
      throw new Error("Storage unavailable");
    },
  });
  within(p, () => {
    for (const choice of ["light", "dark", "system"] as const) {
      themes().choose(choice);
      for (const dark of [true, false, true]) {
        p.window.matchMedia = () => ({ matches: dark });
        // A different consumer sees the same document-local choice.
        const consumer = themes();
        consumer.sync();
        assert.equal(consumer.preference(), choice);
        assert.equal(
          consumer.current(),
          choice === "system" ? (dark ? "dark" : "light") : choice,
        );
        assert.equal(p.classes.has("dark"), consumer.current() === "dark");
      }
    }
  });
  assert.equal(p.storage.get("theme"), "dark");
});
