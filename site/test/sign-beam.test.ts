// The beam's writes to the hero sign, in a real browser. The rig (rig.ts)
// writes each beam value only to what draws it: a plate's lit copy takes all
// nine, the layers inside it the aim point and radius, and a post only the
// five its torch-lit layer reads at night, and none by day. The file checks
// the inline pre-paint rig and the hydrated torch, through pointer movement,
// remeasurement and theme changes, and the footprint and viewport culling
// that switches a recipient off.
//
// Observe writes, not retained inline values: a culled recipient can keep
// yesterday's beam without doing any work today.
//
// The browser is the one `browser.ts` finds; without one this file skips,
// except in CI.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { preview } from "astro";
import { Browser, findBrowser, type Tab } from "./browser.ts";
import { BrowserFixture } from "./fixture.ts";

type BeamWrite = {
  target: string;
  name: string;
  value: string;
  hydrated: boolean;
};
declare global {
  interface Window {
    beamWrites: BeamWrite[];
  }
}

const POST = ["--brx", "--bry", "--gain", "--lx", "--ly"];
const PLATE = [...POST, "--hrx", "--hry", "--hx", "--hy"].sort();
const site = fileURLToPath(new URL("../", import.meta.url));
const executable = findBrowser();
const skip = executable
  ? false
  : "no Chrome, Chromium or Edge found; set SITE_BROWSER to one";
const fixture = new BrowserFixture();
let browser: Browser;
let base = "";

before(() =>
  fixture.setup(async () => {
    if (!executable) return;
    const output = mkdtempSync(path.join(site, "node_modules/.site-beam-"));
    fixture.ownDirectory(output);
    fixture.defer("build output removal", () =>
      rmSync(output, { recursive: true, force: true }),
    );
    execFileSync(
      process.execPath,
      ["node_modules/astro/bin/astro.mjs", "build", "--outDir", output],
      {
        cwd: site,
        env: { ...process.env, SITE_SEARCH_RECORDING: "fixtures/search" },
        timeout: 120_000,
        stdio: "pipe",
      },
    );
    const server = await preview({
      root: site,
      outDir: output,
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0 },
    });
    fixture.defer("preview server stop", () => server.stop());
    base = `http://127.0.0.1:${server.port}`;
    browser = await Browser.launch(executable, fixture);
  }),
);
after(() => fixture.close());

/** Records every beam value written to a post, a plate's lit copy or a
 * layer in it, and whether the torch had hydrated. Installed before
 * navigation, so the real inline rest script is observed too. */
function observe() {
  window.beamWrites = [];
  // oxlint-disable-next-line typescript/unbound-method -- Forwarded with its original declaration as `this` below.
  const set = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
    if (/^--(lx|ly|brx|bry|hrx|hry|hx|hy|gain|br)$/.test(name)) {
      for (const [selector, kind] of [
        [".sign-tube", "post"],
        [".sign-lit-copy", "plate"],
        [".sign-lit-copy .rainbow, .sign-lit-glint, .sign-lit-streak", "layer"],
      ]) {
        [...document.querySelectorAll<HTMLElement>(selector)].forEach(
          (el, index) => {
            if (el.style === this)
              window.beamWrites.push({
                target: `${kind}${index}`,
                name,
                value: value ?? "",
                hydrated: document.documentElement.hasAttribute("data-torch"),
              });
          },
        );
      }
    }
    return set.call(this, name, value, priority);
  };
}

/** The homepage at 1440 px in `theme`, as a returning visitor, with reduced
 * motion, once the hydrated torch has drawn a reachable plate. */
async function open(theme: "light" | "dark") {
  const tab = await browser.open(
    "about:blank",
    { width: 1440, theme },
    {
      "story-seen": "1",
    },
  );
  await tab.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${observe.toString()})();`,
  });
  await tab.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await tab.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });

  await tab.goto(`${base}/`);
  await tab.evaluate(async () => {
    const deadline = performance.now() + 15_000;
    while (
      !window.beamWrites.some((w) => w.hydrated && w.target.startsWith("plate"))
    ) {
      if (performance.now() >= deadline)
        throw new Error("the hydrated torch never wrote a reachable plate");
      await new Promise(requestAnimationFrame);
    }
  });
  return tab;
}

/** Each post took exactly the values it draws in `theme`, and every
 * reachable plate and layer exactly its own. */
function assertWrites(
  writes: BeamWrite[],
  theme: "light" | "dark",
  at: string,
) {
  const names = (target: string) =>
    [
      ...new Set(writes.filter((w) => w.target === target).map((w) => w.name)),
    ].sort();
  for (const post of ["post0", "post1"])
    assert.deepEqual(
      names(post),
      theme === "dark" ? POST : [],
      `${at}: ${post}`,
    );
  for (const [kind, expected] of [
    ["plate", PLATE],
    ["layer", ["--br", "--lx", "--ly"]],
  ] as const) {
    const targets = [
      ...new Set(
        writes.filter((w) => w.target.startsWith(kind)).map((w) => w.target),
      ),
    ];
    assert.ok(targets.length > 0, `${at}: reachable ${kind}s receive the beam`);
    for (const target of targets)
      assert.deepEqual(names(target), expected, `${at}: ${target}`);
  }
}

test("a browser observes sign beam writes in CI", () => {
  assert.ok(executable || !process.env.CI, skip || "");
});

for (const theme of ["light", "dark"] as const)
  test(
    `only drawn post values are written before paint and after hydration: ${theme}`,
    { skip },
    async () => {
      const tab = await open(theme);
      try {
        const writes = await tab.evaluate(() => window.beamWrites);
        for (const hydrated of [false, true])
          assertWrites(
            writes.filter((w) => w.hydrated === hydrated),
            theme,
            hydrated ? "hydrated" : "pre-paint",
          );
      } finally {
        await tab.close();
      }
    },
  );

const takeWrites = (tab: Tab) =>
  tab.evaluate(() => {
    const writes = window.beamWrites;
    window.beamWrites = [];
    return writes;
  });

test(
  "hydrated pointer updates and remeasurement follow light → dark → light → dark",
  { skip },
  async () => {
    const tab = await open("light");
    try {
      for (const theme of ["light", "dark", "light", "dark"] as const) {
        await takeWrites(tab);
        await tab.evaluate((theme) => {
          document.documentElement.classList.toggle("dark", theme === "dark");
          document.documentElement.dataset.theme = theme;
        }, theme);
        await tab.settle();
        await takeWrites(tab);
        await tab.evaluate(async () => {
          window.dispatchEvent(new Event("light:measure"));
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
        });
        assertWrites(await takeWrites(tab), theme, `${theme}: remeasurement`);
        await tab.evaluate(async () => {
          window.dispatchEvent(
            new PointerEvent("pointermove", {
              clientX: 720,
              clientY: 300,
              pointerType: "mouse",
            }),
          );
          // The entrance deliberately holds the flood for 900 ms.
          await new Promise((resolve) => setTimeout(resolve, 1000));
          window.dispatchEvent(
            new PointerEvent("pointermove", {
              clientX: 700,
              clientY: 320,
              pointerType: "mouse",
            }),
          );
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
        });
        assertWrites(await takeWrites(tab), theme, `${theme}: pointer`);
        assert.deepEqual(
          await tab.evaluate(() =>
            [...document.querySelectorAll(".sign-tube")].map((p) =>
              p.classList.contains("sign-lit-off"),
            ),
          ),
          [false, false],
        );
      }
    } finally {
      await tab.close();
    }
  },
);

test(
  "missed and off-screen recipients do no beam work, recover, and apply reads no layout",
  { skip },
  async () => {
    const tab = await open("dark");
    try {
      const factory = await tab.evaluate(() => {
        const assembly = document.querySelector(".sign-assembly")!;
        assembly.replaceWith(assembly.cloneNode(true));
        const script = [...document.scripts].find((s) =>
          s.textContent?.includes("const rig = ("),
        );
        const match = script?.textContent?.match(
          /const rig = (\([\s\S]*?\)\(\));/,
        );
        if (!match) throw new Error("pre-paint lightRig factory missing");
        return match[1];
      });
      const result = await tab.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
        const rig = ${factory};
        const posts = [...document.querySelectorAll('.sign-tube')];
        const styles = posts.map(p => p.style.cssText);
        const full = rig.start();
        const records = [];
        const draw = (phase, beam) => {
          window.beamWrites = [];
          const bounds = Element.prototype.getBoundingClientRect;
          const computed = window.getComputedStyle;
          const fail = () => { throw new Error('layout read during apply'); };
          const descriptors = ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft'].map(name =>
            [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)]);
          Element.prototype.getBoundingClientRect = fail;
          window.getComputedStyle = fail;
          for (const [name] of descriptors) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: fail });
          try { rig.apply(beam); }
          finally {
            Element.prototype.getBoundingClientRect = bounds;
            window.getComputedStyle = computed;
            for (const [name, descriptor] of descriptors) Object.defineProperty(HTMLElement.prototype, name, descriptor);
          }
          records.push({phase, writes: window.beamWrites, off: posts.map(p => p.classList.contains('sign-lit-off'))});
        };
        rig.measure();
        draw('reached', full);
        draw('missed', {x: 10000, y: 10000, r: 10});
        draw('reached again', full);
        posts.forEach(p => { p.style.position = 'absolute'; p.style.top = '3000px'; });
        rig.measure();
        draw('off-screen', full);
        posts.forEach((p, i) => p.style.cssText = styles[i]);
        document.documentElement.classList.remove('dark');
        rig.measure();
        draw('day after culling', full);
        document.documentElement.classList.add('dark');
        rig.measure();
        draw('visible again', full);
        return records;
      })()`,
      });
      assert.equal(
        result.exceptionDetails,
        undefined,
        JSON.stringify(result.exceptionDetails),
      );
      const records = (
        result.result as {
          value: { phase: string; writes: BeamWrite[]; off: boolean[] }[];
        }
      ).value;
      for (const record of records) {
        const off = record.phase === "missed" || record.phase === "off-screen";
        assert.deepEqual(record.off, [off, off], record.phase);
        const postWrites = record.writes.filter((w) =>
          w.target.startsWith("post"),
        );
        if (off) assert.deepEqual(postWrites, [], record.phase);
        else {
          const theme = record.phase === "day after culling" ? "light" : "dark";
          assertWrites(record.writes, theme, record.phase);
          for (const post of ["post0", "post1"])
            assert.equal(
              postWrites.filter((w) => w.target === post).length,
              theme === "dark" ? POST.length : 0,
              record.phase,
            );
        }
        if (record.phase === "missed")
          assert.deepEqual(
            record.writes,
            [],
            "plates and layers are culled too",
          );
      }
    } finally {
      await tab.close();
    }
  },
);
