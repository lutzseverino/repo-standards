import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { themeScript, themes } from "../src/lib/theme-core.ts";

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
    vm.runInNewContext(themeScript(), p.window);
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
  vm.runInNewContext(themeScript(), p.window);
  assert.equal(p.root.dataset.theme, "dark");
});
