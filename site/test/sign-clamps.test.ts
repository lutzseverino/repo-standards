// The clamps on the hero sign's posts, in a real browser. The layout pass
// (posts.ts) places a clamp on each post under each of the three plates,
// its top behind the plate's bottom edge, before the first paint and again
// whenever the page changes size. Each is measured at 1440 px and on a phone
// at 320, 360 and 390 px, once loaded and after a resize, which changes the
// plates' heights. The page is drawn with reduced motion, so the sign stands
// untilted and the boxes measured are the layout's.
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

const site = fileURLToPath(new URL("../", import.meta.url));
const WIDTHS = [1440, 320, 360, 390];

const executable = findBrowser();
const skip = executable
  ? false
  : "no Chrome, Chromium or Edge found; set SITE_BROWSER to one";

process.env.SITE_SEARCH_RECORDING = path.join(site, "fixtures/search");

let browser: Browser | undefined;
let output = "";
let server: Awaited<ReturnType<typeof preview>> | undefined;
let base = "";

before(async () => {
  if (!executable) return;
  output = mkdtempSync(path.join(site, "node_modules/.site-clamps-"));
  execFileSync(
    process.execPath,
    ["node_modules/astro/bin/astro.mjs", "build", "--outDir", output],
    { cwd: site, timeout: 120_000, stdio: "pipe" },
  );
  server = await preview({
    root: site,
    outDir: output,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  base = `http://127.0.0.1:${server.port}`;
  browser = await Browser.launch(executable);
});

// whatever `before` reached before it failed
after(async () => {
  await browser?.close();
  await server?.stop();
  if (output) rmSync(output, { recursive: true, force: true });
});

test("a browser measures the clamps in CI", () => {
  assert.ok(executable || !process.env.CI, skip || "");
});

/** The homepage at `width`, untilted, as a returning visitor, whose story
 * never starts on its own. */
async function open(width: number) {
  const tab = await browser!.open(
    "about:blank",
    { width, theme: "light" },
    { "story-seen": "1" },
  );
  await tab.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
  await tab.goto(`${base}/`);
  return tab;
}

/** Each clamp's plate and the post under it, and how far its top is above
 * that plate's bottom edge and its centre from the post's, in CSS px. */
const measure = (tab: Tab) =>
  tab.evaluate(async () => {
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
    const assembly = document.querySelector(".sign-assembly")!;
    const plates = [
      ...assembly.querySelectorAll(
        ":scope > .sign-mount:not(.sign-mount--tab)",
      ),
    ].map((el) => el.getBoundingClientRect());
    const posts = [...assembly.querySelectorAll(".sign-tube")].map((el) =>
      el.getBoundingClientRect(),
    );
    const centre = (r: DOMRect) => r.left + r.width / 2;
    return [...assembly.querySelectorAll<HTMLElement>(".sign-clamp")].map(
      (el) => {
        const r = el.getBoundingClientRect();
        const post = posts.reduce(
          (best, p, i) =>
            Math.abs(centre(p) - centre(r)) <
            Math.abs(centre(posts[best]) - centre(r))
              ? i
              : best,
          0,
        );
        // the plate it holds the post under
        const plate = Number(el.dataset.plate);
        return {
          name: `plate ${plate + 1}, post ${post + 1}`,
          plate,
          behind: plates[plate].bottom - r.top,
          below: r.bottom - plates[plate].bottom,
          off: centre(r) - centre(posts[post]),
          onPost: r.top >= posts[post].top && r.bottom <= posts[post].bottom,
        };
      },
    );
  });

function assertClamps(seen: Awaited<ReturnType<typeof measure>>, at: string) {
  // one on each post under each of the three plates
  assert.deepEqual(
    seen.map((c) => c.name).sort(),
    [1, 2, 3].flatMap((plate) =>
      [1, 2].map((post) => `plate ${plate}, post ${post}`),
    ),
    at,
  );
  for (const clamp of seen) {
    const where = `${at}, ${clamp.name}`;
    assert.ok(clamp.onPost, `${where}: on its post's length`);
    assert.ok(Math.abs(clamp.off) <= 0.5, `${where}: ${clamp.off} px off`);
    // its top 4 px behind the plate, the rest of its 15 px below it; the
    // layout pass reads the plates' offsets, which are whole pixels
    assert.ok(
      Math.abs(clamp.behind - 4) < 1,
      `${where}: top ${clamp.behind} px behind the plate`,
    );
    assert.ok(clamp.below > 0, `${where}: ${clamp.below} px below the plate`);
  }
}

for (const width of WIDTHS)
  test(
    `each clamp sits on its post under its plate at ${width} px, loaded and after a resize`,
    { skip },
    async () => {
      // loaded at this width
      let tab = await open(width);
      try {
        assertClamps(await measure(tab), `${width} px, loaded`);
      } finally {
        await tab.close();
      }
      // loaded at another width, whose plates are taller or shorter, then
      // resized to this one
      const from = width === 1440 ? 390 : 1440;
      tab = await open(from);
      try {
        await tab.resize(width);
        await tab.settle();
        assertClamps(
          await measure(tab),
          `${width} px, resized from ${from} px`,
        );
      } finally {
        await tab.close();
      }
    },
  );
