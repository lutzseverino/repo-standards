import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "astro";

const site = (file: string) =>
  fileURLToPath(new URL(`../${file}`, import.meta.url));
const BEACON =
  /<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon="\{&quot;token&quot;: &quot;bb4c3d3b838d4fc1a2b848fc8d34fb72&quot;\}"><\/script>/g;

// The fixture site, with a second page that only this test builds through
// the shared layout.
let output = "";
const read = (file: string) => readFileSync(path.join(output, file), "utf8");

before(async () => {
  output = mkdtempSync(site("node_modules/.site-pages-"));
  process.env.SITE_SEARCH_RECORDING = site("fixtures/search");
  await build({
    root: site(""),
    outDir: output,
    logLevel: "error",
    integrations: [
      {
        name: "layout-test-page",
        hooks: {
          "astro:config:setup": ({ injectRoute }) =>
            injectRoute({
              pattern: "/layout-test",
              entrypoint: site("test/fixtures/layout-page.astro"),
            }),
        },
      },
    ],
  });
});

after(() => rmSync(output, { recursive: true, force: true }));

test("a page built through the layout is canonical at its own URL", () => {
  const html = read("layout-test/index.html");
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/repo-standards\.com\/layout-test\/"/,
  );
  assert.match(html, /<title>Layout test<\/title>/);
  assert.equal(html.match(BEACON)?.length, 1);
});

test("the homepage is canonical at the site root and loads the beacon once", () => {
  const html = read("index.html");
  assert.equal(
    html.match(/<link rel="canonical"[^>]*>/g)?.join(),
    '<link rel="canonical" href="https://repo-standards.com/">',
  );
  assert.equal(html.match(BEACON)?.length, 1);
  assert.equal(html.match(/cloudflareinsights/g)?.length, 1);
});

test("the sign's heading reads the name and the subtitle apart", () => {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(read("index.html"))?.[1];
  const text = h1?.replace(/<[^>]*>/g, "");
  assert.equal(
    text,
    "Repo Standards Write your setup down once. Your coding agent applies it to every repository.",
  );
});

/** The page's inline scripts, in document order. */
const inlineScripts = (html: string) =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test("the head applies the stored or system theme as the class and the attribute", () => {
  const [script] = inlineScripts(read("index.html"));
  const run = (stored: string | null, systemDark: boolean) => {
    const classes = new Set<string>();
    const root = {
      dataset: {} as Record<string, string>,
      classList: {
        toggle: (name: string, on: boolean) =>
          on ? classes.add(name) : classes.delete(name),
      },
    };
    const window: Record<string, unknown> = {
      document: { documentElement: root },
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: systemDark }),
    };
    window.window = window;
    vm.runInNewContext(script, window);
    return [classes.has("dark"), root.dataset.theme];
  };
  assert.deepEqual(run("dark", false), [true, "dark"]);
  assert.deepEqual(run("light", true), [false, "light"]);
  assert.deepEqual(run(null, true), [true, "dark"]);
  assert.deepEqual(run("unknown", false), [false, "light"]);
});

/** A stub element: its style, classes, attributes and the elements its
 * selectors find. */
function element(
  rect: { left: number; top: number; width: number; height: number },
  found: Record<string, unknown> = {},
) {
  const style: Record<string, string> & {
    setProperty?: (name: string, value: string) => void;
  } = {};
  style.setProperty = (name, value) => {
    style[name] = value;
  };
  const classes = new Set<string>();
  const attributes = new Map<string, string>();
  return {
    style,
    dataset: {} as Record<string, string>,
    classList: {
      contains: (name: string) => classes.has(name),
      remove: (name: string) => classes.delete(name),
      toggle: (name: string, on: boolean) =>
        on ? classes.add(name) : classes.delete(name),
    },
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    hasAttribute: (name: string) => attributes.has(name),
    getBoundingClientRect: () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }),
    rect,
    querySelector: (selector: string) => found[selector] ?? null,
    querySelectorAll: (selector: string) => found[selector] ?? [],
    closest: (selector: string) => found[`closest ${selector}`] ?? null,
  };
}
type Stub = ReturnType<typeof element>;

// The rest script runs before the page hydrates, so nothing has checked it
// but a browser. Here it runs against stub elements in a context that holds
// only the window and the document: a global the script reads without a
// guard, beyond those, throws.
for (const dark of [false, true]) {
  test(`the rest script draws the ${dark ? "night" : "day"} page at rest`, async () => {
    const script = inlineScripts(read("index.html")).at(-1)!;
    assert.match(script, /sinkPosts/);

    // a list plate's name, 350 px of text at 25 px in a 300 px line, and its
    // lit copy's
    const litName = element({ left: 0, top: 0, width: 300, height: 30 });
    const wrap = element({ left: 0, top: 900, width: 320, height: 60 });
    const name = Object.assign(
      element({ left: 0, top: 900, width: 300, height: 30 }),
      { clientWidth: 300 },
    );
    Object.defineProperty(name, "scrollWidth", {
      get: () => parseFloat(name.style.fontSize) * 14,
    });
    Object.assign(name, {
      closest: (selector: string) =>
        selector === ".sign-face-wrap" ? wrap : null,
    });
    Object.assign(wrap, {
      querySelector: (selector: string) =>
        selector === ":scope > .sign-lit-copy .signpost-name" ? litName : null,
    });

    // the hero: a plate with its lit copy, the posts and the rail under them
    const litCopy = element({ left: 260, top: 120, width: 760, height: 200 });
    const plate = element(
      { left: 260, top: 120, width: 760, height: 200 },
      {
        ":scope > .sign-lit-copy": litCopy,
      },
    );
    const tubes = [420, 860].map((left) =>
      element({ left, top: 100, width: 19, height: 400 }),
    );
    const assembly = element(
      { left: 260, top: 60, width: 760, height: 480 },
      {
        ".sign-tube": tubes,
      },
    );
    const gradient = element({ left: 0, top: 0, width: 0, height: 0 });
    gradient.dataset.k = "1.1";
    const rail = element(
      { left: 88, top: 520, width: 1104, height: 40 },
      {
        radialGradient: [gradient],
      },
    );
    const layer = element({ left: 0, top: 0, width: 1280, height: 800 });
    layer.dataset.lightLayer = "2";
    const root = element({ left: 0, top: 0, width: 1280, height: 800 });
    if (dark) root.classList.toggle("dark", true);
    Object.assign(root, { clientHeight: 800 });

    let settled = 0;
    const found: Record<string, () => unknown> = {
      ".signpost-name": () => {
        settled += 1;
        return [name];
      },
      ".sign-assembly": () => assembly,
      "svg.sign-hero-rail": () => rail,
      "[data-lo]": () => [plate],
      "svg.sign-rail-svg": () => [rail],
      "[data-light-layer]": () => [layer],
      '.sign-page [data-slot="input-group"], .sign-page [data-slot="toggle-group-item"]':
        () => [],
    };
    const find = (selector: string) => {
      const result = found[selector];
      assert.ok(result, `the script asks for ${selector}`);
      return result();
    };
    const document = {
      documentElement: root,
      querySelector: find,
      querySelectorAll: find,
      fonts: { ready: Promise.resolve() },
    };
    const window: Record<string, unknown> = {
      document,
      innerWidth: 1280,
      innerHeight: 800,
      scrollX: 0,
      scrollY: 0,
      matchMedia: () => ({ matches: false }),
      getComputedStyle: (el: Stub) => ({
        width: `${el.rect.width}px`,
        height: `${el.rect.height}px`,
      }),
    };
    window.window = window;

    vm.runInNewContext(script, window);

    // the list's name is fitted to its line, and its lit copy takes the size
    assert.equal(name.style.fontSize, "21px");
    assert.equal(litName.style.fontSize, "21px");
    // the posts end under the rail
    for (const tube of tubes) assert.match(tube.style.bottom, /^-?\d+\.\dpx$/);
    // the sign stands at its pose
    assert.equal(assembly.style["--tilt-x"], "4.00deg");
    assert.equal(assembly.style["--tilt-y"], "-9.00deg");
    // and the light is on: the plate, the page-wide layer, the rail and the
    // root, which the lit components inherit their beam from
    assert.match(litCopy.style["--lx"], /^-?\d+\.\dpx$/);
    assert.match(layer.style["--disc-r"], /^\d+px$/);
    assert.ok(gradient.attributes.has("cx"));
    assert.match(root.style["--px"], /^-?\d+\.\dpx$/);
    assert.equal(settled, 1);

    // once the fonts arrive it measures again, unless the torch has taken over
    await document.fonts.ready;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, 2);
  });
}

test("once the torch has taken over, the fonts change nothing", async () => {
  const script = inlineScripts(read("index.html")).at(-1)!;
  const root = element({ left: 0, top: 0, width: 1280, height: 800 });
  root.setAttribute("data-torch", "");
  let settled = 0;
  const document = {
    documentElement: Object.assign(root, { clientHeight: 800 }),
    querySelector: () => null,
    querySelectorAll: (selector: string) => {
      if (selector === ".signpost-name") settled += 1;
      return [];
    },
    fonts: { ready: Promise.resolve() },
  };
  const window: Record<string, unknown> = {
    document,
    innerWidth: 390,
    innerHeight: 844,
    scrollX: 0,
    scrollY: 0,
    matchMedia: () => ({ matches: true }),
  };
  window.window = window;
  vm.runInNewContext(script, window);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, 1);
});
