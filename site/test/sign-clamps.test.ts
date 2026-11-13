// The clamps on the hero sign's posts, in a real browser. The layout pass
// (posts.ts) places a clamp on each post under each of the three plates,
// its top behind the plate's bottom edge, before the first paint and again
// whenever the page changes size. Each is measured at 1440 px and on a phone
// at 320, 360 and 390 px, once loaded and after a resize, which changes the
// plates' heights. The page is drawn with reduced motion, so the sign stands
// untilted and the boxes measured are the layout's.
//
// Each clamp is a 3D object seen without perspective, which the tilt
// (rig.ts) draws flat: each face of its flanges with the 2D transform that
// turning it in 3D would give it. The file checks every face against the
// browser's own 3D transform for the clamp's turn, at its own angles from
// the eye and at angles the tilt can add to them.
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

const site = fileURLToPath(new URL("../", import.meta.url));
const WIDTHS = [1440, 320, 360, 390];

const executable = findBrowser();
const skip = executable
  ? false
  : "no Chrome, Chromium or Edge found; set SITE_BROWSER to one";

process.env.SITE_SEARCH_RECORDING = path.join(site, "fixtures/search");

const fixture = new BrowserFixture();
let browser: Browser | undefined;
let output = "";
let server: Awaited<ReturnType<typeof preview>> | undefined;
let base = "";

before(() =>
  fixture.setup(async () => {
    if (!executable) return;
    output = mkdtempSync(path.join(site, "node_modules/.site-clamps-"));
    fixture.ownDirectory(output);
    fixture.defer("build output removal", () =>
      rmSync(output, { recursive: true, force: true }),
    );
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
    fixture.defer("preview server stop", () => server!.stop());
    base = `http://127.0.0.1:${server.port}`;
    browser = await Browser.launch(executable, fixture);
  }),
);

// whatever `before` reached before it failed
after(() => fixture.close());

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

test(
  "a new rig reconciles faces left by another pose, then follows later turns",
  { skip },
  async () => {
    const tab = await open(1440);
    try {
      // Exercise the same self-contained factory the page runs before paint,
      // including a fresh cache over the existing DOM at each handover.
      const factory = await tab.evaluate(() => {
        // Keep the real styles and DOM left by hydration, but give only the
        // rigs below ownership of this assembly's subsequent draws.
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
      for (const [fresh, angles] of [
        [true, [-3, -21]],
        [true, [12, 21]],
        [false, [-3, -21]],
        [false, [12, 21]],
        [true, [-3, -21]],
        [false, [12, 21]],
      ] as const) {
        const result = await tab.send("Runtime.evaluate", {
          expression: `(() => {
          ${fresh ? `globalThis.clampRig = ${factory};` : ""}
          const assembly = document.querySelector('.sign-assembly');
          for (const c of assembly.querySelectorAll('.sign-clamp')) {
            c.dataset.vx0 = ${angles[0]};
            c.dataset.vy0 = ${angles[1]};
          }
          globalThis.clampRig.tilt(assembly, { x: 0, y: 0 });
        })()`,
        });
        assert.equal(result.exceptionDetails, undefined);
        const seen = await faces(tab, null);
        assert.equal(seen.length, 60);
        assert.ok(seen.some((f) => f.facing) && seen.some((f) => !f.facing));
        for (const face of seen)
          assert.equal(
            face.shown,
            face.facing,
            `${fresh ? "new" : "existing"} rig at ${angles.join(", ")}: ${face.name}`,
          );
      }
    } finally {
      await tab.close();
    }
  },
);

/** Each face of each clamp's flanges, where it is drawn, and where the
 * browser draws it turned in 3D: rotateX by the angle the clamp is seen from
 * below, rotateY by the angle from the side, then the face's own place on
 * the clamp, flattened onto the page. `angles` sets every clamp's own
 * angles first, as the layout pass would, and has the tilt draw them. */
const faces = (tab: Tab, angles: [number, number] | null, mirror = false) =>
  tab.evaluate(
    async ({ angles, mirror }) => {
      const clamps = [
        ...document.querySelectorAll<HTMLElement>(".sign-assembly .sign-clamp"),
      ];
      if (angles) {
        for (const c of clamps) {
          c.dataset.vx0 = String(angles[0]);
          c.dataset.vy0 = String(angles[1]);
        }
        // the tilt draws again on resize, without a new layout
        window.dispatchEvent(new Event("resize"));
      }
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
      const px = (el: Element, name: string) =>
        parseFloat(getComputedStyle(el).getPropertyValue(name));
      return clamps.flatMap((c, i) => {
        const [R, L, D, H] = ["--R", "--L", "--D", "--H"].map((n) => px(c, n));
        const vx = Number(c.dataset.vx0);
        const vy = Number(c.dataset.vy0);
        const box = c.getBoundingClientRect();
        const centre = [box.left + box.width / 2, box.top + box.height / 2];
        return [...c.querySelectorAll<HTMLElement>(".sign-clamp-lugs > i")].map(
          (face) => {
            const s = face.classList.contains("sign-clamp-l") ? -1 : 1;
            const kind = face.classList[0].replace("sign-clamp-", "");
            const x = s * (R + L / 2);
            // Deliberately independent of the rig's axes and projection: CSS
            // transforms describe the reference solid for the browser to turn.
            const place = {
              front: `translate3d(${x}px, 1.5px, ${D / 2}px)`,
              end: `translate3d(${s * (R + L)}px, 1.5px, 0) rotateY(${s * 90}deg)`,
              bottom: `translate3d(${x}px, ${H / 2 + 1.5}px, 0) rotateX(-90deg)`,
              "nut-side": `translate3d(${x}px, 3px, ${D / 2 + 0.6}px)`,
              nut: `translate3d(${x}px, 3px, ${D / 2 + 2}px)`,
            }[kind];
            const turned = new DOMMatrix(
              `rotateX(${vx}deg) rotateY(${vy}deg) ${place}`,
            );
            const w = px(face, "width") / 2;
            const h = px(face, "height") / 2;
            const corners = [
              [-w, -h],
              [w, -h],
              [w, h],
              [-w, h],
            ].map(([cx, cy]) => turned.transformPoint(new DOMPoint(cx, cy, 0)));
            if (mirror && i === 0 && kind === "front" && s === 1)
              face.style.transform += " scaleX(-1)";
            // Measure labelled local corners in the rendered DOM, rather than
            // inferring their correspondence from an axis-aligned bounding box.
            const drawnCorners = [
              [0, 0],
              [2 * w, 0],
              [2 * w, 2 * h],
              [0, 2 * h],
            ].map(([x, y]) => {
              const marker = document.createElement("span");
              marker.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:0;height:0`;
              face.append(marker);
              const r = marker.getBoundingClientRect();
              marker.remove();
              return [r.left - centre[0], r.top - centre[1]];
            });
            const r = face.getBoundingClientRect();
            return {
              name: `clamp ${i + 1}, ${kind} ${s < 0 ? "left" : "right"}`,
              drawn: [
                r.left - centre[0],
                r.top - centre[1],
                r.right - centre[0],
                r.bottom - centre[1],
              ],
              turned: [
                Math.min(...corners.map((p) => p.x)),
                Math.min(...corners.map((p) => p.y)),
                Math.max(...corners.map((p) => p.x)),
                Math.max(...corners.map((p) => p.y)),
              ],
              drawnCorners,
              turnedCorners: corners.map((p) => [p.x, p.y]),
              // the face's own z axis, turned, still points to the eye
              facing: turned.m33 > 0,
              shown: getComputedStyle(face).visibility !== "hidden",
              arch: [
                px(c.querySelector(".sign-clamp-band")!, "--vx"),
                px(c.querySelector(".sign-clamp-under")!, "--vx"),
                vx,
              ],
            };
          },
        );
      });
    },
    { angles, mirror },
  );

function assertOrientation(
  face: Awaited<ReturnType<typeof faces>>[number],
  at: string,
) {
  for (const [i, corner] of face.drawnCorners.entries())
    for (const [axis, coordinate] of corner.entries())
      assert.ok(
        Math.abs(coordinate - face.turnedCorners[i][axis]) < 0.02,
        `${at}: corner ${i}, axis ${axis}: ${coordinate} against ${face.turnedCorners[i][axis]}`,
      );
}

for (const width of [1440, 320])
  test(
    `each clamp's faces are drawn where the clamp turned in 3D shows them at ${width} px`,
    { skip },
    async () => {
      const tab = await open(width);
      try {
        // the clamps' own angles, then the tilt's extremes added to them:
        // from the side either way, and from above, where the underside
        // turns away
        for (const angles of [null, [12, 21], [-3, -21]] as const) {
          const seen = await faces(tab, angles && [...angles]);
          assert.equal(seen.length, 60, `${width} px: ten faces on six clamps`);
          assert.deepEqual(
            seen.map((face) => face.name).sort(),
            [1, 2, 3, 4, 5, 6]
              .flatMap((clamp) =>
                ["end", "bottom", "front", "nut-side", "nut"].flatMap((kind) =>
                  ["left", "right"].map(
                    (side) => `clamp ${clamp}, ${kind} ${side}`,
                  ),
                ),
              )
              .sort(),
            "each kind appears once on each side, matching the independent solid",
          );
          for (const face of seen) {
            const at = `${width} px, ${angles ? `turned ${angles.join(", ")}` : "at rest"}, ${face.name}`;
            for (const [i, edge] of face.drawn.entries())
              assert.ok(
                Math.abs(edge - face.turned[i]) < 0.02,
                `${at}: drawn at ${face.drawn.join(", ")}, turned in 3D ${face.turned.join(", ")}`,
              );
            assert.equal(face.shown, face.facing, `${at}: shown as it faces`);
            assertOrientation(face, at);
            // the band's lower edge arches by the angle from below
            for (const vx of face.arch.slice(0, 2))
              assert.ok(Math.abs(vx - face.arch[2]) < 0.01, `${at}: ${vx}`);
          }
        }
      } finally {
        await tab.close();
      }
    },
  );

test(
  "corner checks detect a mirrored local axis with unchanged bounds",
  { skip },
  async () => {
    const tab = await open(1440);
    try {
      const original = await faces(tab, [12, 21]);
      const mirrored = await faces(tab, null, true);
      const name = "clamp 1, front right";
      const before = original.find((f) => f.name === name)!;
      const after = mirrored.find((f) => f.name === name)!;
      for (const [i, edge] of before.drawn.entries())
        assert.ok(
          Math.abs(edge - after.drawn[i]) < 0.0001,
          "mirroring preserves bounds",
        );
      assert.equal(before.shown, after.shown);
      assertOrientation(before, name);
      assert.throws(() => assertOrientation(after, name), /corner/);
    } finally {
      await tab.close();
    }
  },
);
