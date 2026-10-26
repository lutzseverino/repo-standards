// The site on a phone, in a real browser: every page family at 320, 360 and
// 390 CSS px, light and dark, in English, Spanish and Catalan from the
// fixture's production build and in the pseudo-locale from the development
// server, which alone serves it. Each page is measured once loaded, after
// narrowing from 390 px, since fitted names refit on a resize, and with each
// menu and dialog it opens. `layout-probe.ts` says what fails.
//
// The browser is the one `browser.ts` finds; without one this file skips,
// except in CI. `SITE_LAYOUT_REPORT=<dir>` also writes every measurement to
// `<dir>/layout.json` and a screenshot of each to `<dir>/`, for a pull
// request's evidence.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { dev, preview } from "astro";
import { LOCALES, PSEUDO_LOCALE, localePath } from "../src/i18n/locales.ts";
import { loadCatalogue } from "../src/lib/load-catalogue.ts";
import { Browser, findBrowser, type Tab, type View } from "./browser.ts";
import { measureLayout, type Layout } from "./layout-probe.ts";

const site = fileURLToPath(new URL("../", import.meta.url));
const WIDTHS = [320, 360, 390];
const THEMES = ["light", "dark"] as const;
// a returning visitor's: the story has played, so it never starts on its
// own while a page is measured
const STORAGE = { "story-seen": "1" };

const executable = findBrowser();
const skip = executable
  ? false
  : "no Chrome, Chromium or Edge found; set SITE_BROWSER to one";
const reportTo = process.env.SITE_LAYOUT_REPORT;

process.env.SITE_SEARCH_RECORDING = path.join(site, "fixtures/search");
const families = [
  "/",
  "/how-it-works/",
  ...(await loadCatalogue()).sources.map(
    (source) => `/sources/${source.repository}/`,
  ),
];
// the docs are in English only; one page with wide tables and code
const DOCS = ["/docs/", "/docs/reference/author-format/"];
/** A page, from the server that serves it, with its `<html lang>`. */
type Page = {
  server: "production" | "development";
  url: string;
  lang: string;
};
const pages: Page[] = [
  ...LOCALES.flatMap((locale) =>
    families.map((family): Page => ({
      server: "production",
      url: localePath(locale, family),
      lang: locale,
    })),
  ),
  ...DOCS.map((url): Page => ({ server: "production", url, lang: "en" })),
  ...families.map((family): Page => ({
    server: "development",
    url: localePath(PSEUDO_LOCALE, family),
    lang: PSEUDO_LOCALE,
  })),
];

let browser: Browser | undefined;
let output = "";
let production: Awaited<ReturnType<typeof preview>> | undefined;
let development: Awaited<ReturnType<typeof dev>> | undefined;
const base = { production: "", development: "" };
const measurements: Record<string, unknown>[] = [];

before(async () => {
  if (!executable) return;
  output = mkdtempSync(path.join(site, "node_modules/.site-phone-"));
  // in a process of its own: a build leaves production React loaded, which
  // the development server below cannot render with
  execFileSync(
    process.execPath,
    ["node_modules/astro/bin/astro.mjs", "build", "--outDir", output],
    { cwd: site, timeout: 120_000, stdio: "pipe" },
  );
  // the preview server sets NODE_ENV for the process, which would make the
  // development server render as production, without the pseudo-locale
  const mode = process.env.NODE_ENV;
  production = await preview({
    root: site,
    outDir: output,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  if (mode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = mode;
  base.production = `http://127.0.0.1:${production.port}`;
  development = await dev({
    root: site,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  base.development = `http://127.0.0.1:${development.address.port}`;
  browser = await Browser.launch(executable);
  if (reportTo) mkdirSync(reportTo, { recursive: true });
});

// whatever `before` reached before it failed
after(async () => {
  await browser?.close();
  await production?.stop();
  await development?.stop();
  if (output) rmSync(output, { recursive: true, force: true });
  if (reportTo)
    writeFileSync(
      path.join(reportTo, "layout.json"),
      `${JSON.stringify(measurements, null, 2)}\n`,
    );
});

test("a browser measures the pages in CI", () => {
  assert.ok(executable || !process.env.CI, skip || "");
});

/** Waits for the page's finite animations, such as a menu fading in, to
 * end, and for two more frames. */
const still = (tab: Tab) =>
  tab.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  });

/** What the page opens on a tap: each nav menu, the adoption dialog after
 * each copy, as the prompt or the command, and the docs' menu and table of
 * contents. */
const STATES = [
  {
    controls: "[data-slot=dropdown-menu-trigger]",
    shows: "[data-slot=dropdown-menu-content]",
  },
  {
    controls: "[data-slot=input-group-addon] button",
    shows: "[data-slot=dialog-content]",
  },
  {
    controls: "starlight-menu-button button",
    shows: "body[data-mobile-menu-expanded] #starlight__sidebar",
  },
  {
    controls: "mobile-starlight-toc summary",
    shows: "mobile-starlight-toc details[open] .dropdown",
  },
];

type State = { name: string; control: string; index: number; shows: string };

/** The states `tab`'s page can open, named by their controls. */
const statesOf = (tab: Tab) =>
  tab.evaluate((states: typeof STATES) => {
    const found: State[] = [];
    for (const { controls, shows } of states)
      [...document.querySelectorAll(controls)].forEach((control, index) =>
        found.push({
          name: `open: ${(control.getAttribute("aria-label") || control.textContent || controls).replace(/\s+/g, " ").trim()}`,
          control: controls,
          index,
          shows,
        }),
      );
    return found;
  }, STATES);

/** Taps `state`'s control, with copying always succeeding, and waits for
 * what it opens. */
async function open(tab: Tab, state: State) {
  const shown = await tab.evaluate(async (state: State) => {
    navigator.clipboard.writeText = () => Promise.resolve();
    (
      document.querySelectorAll(state.control)[state.index] as HTMLElement
    ).click();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const shown = document.querySelector(state.shows);
      if (shown?.checkVisibility()) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }, state);
  assert.ok(shown, `${state.name} shows ${state.shows}`);
  await still(tab);
}

const slug = (text: string) =>
  text
    .replace(/^\/|\/$/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase() || "home";

/** Measures `tab` as it is, recording the measurement for the report. */
async function measure(
  tab: Tab,
  url: string,
  view: View,
  state: string,
): Promise<Layout> {
  await still(tab);
  const layout = await tab.evaluate(measureLayout, view.width);
  if (reportTo) {
    const shot = `${slug(url)}-${view.width}-${view.theme}-${slug(state)}.png`;
    await tab.screenshot(path.join(reportTo, shot), state === "loaded");
    measurements.push({ url, ...view, state, ...layout, screenshot: shot });
  }
  return layout;
}

const describe = (layout: Layout) =>
  layout.violations.map(
    (v) =>
      `${v.kind}: ${v.element}${v.text ? ` "${v.text}"` : ""}: ${v.detail}`,
  );
const report = (layout: Layout) => describe(layout).join("\n");

/** A tab in the browser `before` launched, as a returning visitor. */
const openTab = (url: string, view: View) => browser!.open(url, view, STORAGE);

for (const page of pages)
  test(
    `${page.url} fits a phone at 320, 360 and 390 px, light and dark`,
    {
      skip,
    },
    async () => {
      const url = base[page.server] + page.url;
      const failures: string[] = [];
      const record = (view: View, state: string, layout: Layout) =>
        failures.push(
          ...describe(layout).map(
            (line) => `${view.width} px ${view.theme}, ${state}: ${line}`,
          ),
        );
      for (const theme of THEMES) {
        // loaded wide, then narrowed: fitted names refit on a resize
        const wide = { width: Math.max(...WIDTHS), theme };
        const tab = await openTab(url, wide);
        assert.equal(
          await tab.evaluate(() => document.documentElement.lang),
          page.lang,
          `${page.url} is in its locale`,
        );
        for (const width of [...WIDTHS].sort((a, b) => b - a)) {
          const view = { width, theme };
          if (width !== wide.width) {
            await tab.resize(width);
            await tab.settle();
          }
          const state =
            width === wide.width ? "loaded" : `narrowed from ${wide.width} px`;
          record(view, state, await measure(tab, page.url, view, state));
        }
        await tab.close();

        for (const width of WIDTHS) {
          const view = { width, theme };
          const tab = await openTab(url, view);
          if (width !== wide.width)
            record(
              view,
              "loaded",
              await measure(tab, page.url, view, "loaded"),
            );
          for (const state of await statesOf(tab)) {
            await tab.goto(url);
            await open(tab, state);
            record(
              view,
              state.name,
              await measure(tab, page.url, view, state.name),
            );
          }
          await tab.close();
        }
      }
      assert.deepEqual(
        failures,
        [],
        `${page.url} (${page.lang}):\n${failures.join("\n")}`,
      );
    },
  );

// The failures #421, #422 and #425 fixed, put back into today's pages: each
// shows, and a page exactly as wide as the screen does not hide #425's.

/** Measures `pathname` on `server` at `width`, after `change` runs in it. */
async function changed(
  server: keyof typeof base,
  pathname: string,
  width: number,
  change: () => void,
) {
  const tab = await openTab(base[server] + pathname, { width, theme: "light" });
  await tab.evaluate(change);
  await tab.settle();
  await still(tab);
  const layout = await tab.evaluate(measureLayout, width);
  await tab.close();
  return layout;
}

const kinds = (layout: Layout) => [
  ...new Set(layout.violations.map((v) => v.kind)),
];

test(
  "#425: source cards wider than the list are cut off, though the page fits",
  {
    skip,
  },
  async () => {
    const wider = () => {
      const style = document.createElement("style");
      style.textContent =
        ".signpost-grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)) !important }";
      document.head.append(style);
    };
    const narrow = await changed("production", "/", 320, wider);
    // .sign-page clips at the screen's edge, so the page cannot scroll to
    // what lies past it
    assert.equal(narrow.scrollWidth, 320);
    assert.ok(
      narrow.violations.some(
        (v) =>
          (v.kind === "screen" || v.kind === "clipped") &&
          v.element.includes("signpost-entry"),
      ),
      report(narrow),
    );
    // at 360 px the cards still pass the list's edge, inside the screen
    const wide = await changed("production", "/", 360, wider);
    assert.equal(wide.scrollWidth, 360);
    assert.ok(
      wide.violations.some(
        (v) => v.kind === "box" && v.element.includes("signpost-entry"),
      ),
      report(wide),
    );
  },
);

test(
  "#421: a repository link that cannot break and a nav row that cannot wrap widen a source page",
  {
    skip,
  },
  async () => {
    const layout = await changed(
      "production",
      "/sources/lutzseverino/repo-canon/",
      320,
      () => {
        for (const hint of document.querySelectorAll("dd a wbr")) hint.remove();
        const style = document.createElement("style");
        style.textContent =
          "dd a { overflow-wrap: normal !important } nav .flex-wrap { flex-wrap: nowrap !important }";
        document.head.append(style);
      },
    );
    assert.ok(layout.scrollWidth > 320, report(layout));
    assert.deepEqual(kinds(layout).slice(0, 1), ["page"]);
    const lines = report(layout);
    assert.match(
      lines,
      /screen: .*dd > a.*"github\.com\/lutzseverino\/repo-canon"/,
    );
    assert.match(lines, /screen: nav[\w.-]* > div\.flex\.flex-wrap/);
  },
);

test(
  "#422: the pseudo-locale's padding as one unbroken run widens How it works",
  {
    skip,
  },
  async () => {
    const layout = await changed(
      "development",
      "/en-xa/how-it-works/",
      390,
      () => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode())
          node.textContent = node.textContent!.replaceAll("\u200B", "");
      },
    );
    assert.ok(layout.scrollWidth > 390, report(layout));
    assert.match(report(layout), /(screen|box): .*p.*"⟦/);
  },
);

// What a phone may show only in part, on a page of its own.
const standalone = (body: string) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><meta name="viewport" content="width=device-width"><style>body { margin: 0; padding: 24px; font: 16px/1.4 sans-serif } .clip { overflow-x: clip }</style>${body}`,
  )}`;

async function measured(html: string) {
  const tab = await openTab(standalone(html), { width: 320, theme: "light" });
  const layout = await tab.evaluate(measureLayout, 320);
  await tab.close();
  return layout;
}

test(
  "code and tables scroll in their own boxes; decoration, hidden text and negative margins pass",
  {
    skip,
  },
  async () => {
    const wide = "x".repeat(120);
    const layout = await measured(`
    <pre style="overflow-x: auto"><code>${wide}</code></pre>
    <div style="overflow-x: auto"><table><tr><td>${wide}</td></tr></table></div>
    <div class="clip">
      <p>A plate.</p>
      <div inert aria-hidden="true" style="width: 600px">${wide}</div>
    </div>
    <span style="position: absolute; width: 1px; height: 1px; overflow: hidden; white-space: nowrap">${wide}</span>
    <div style="display: flex; border: 1px solid">
      <input style="flex: 1; min-width: 0"><button style="margin-right: -6px">Copy</button>
    </div>`);
    assert.deepEqual(describe(layout), []);
  },
);

test(
  "content cut off by a clipping box, a sideways scroller that is not code, or a decoration that is not inert fails",
  {
    skip,
  },
  async () => {
    const wide = "x".repeat(60);
    const layout = await measured(`
    <div class="clip"><div style="width: 400px"><button>Copy</button><a href="#">${wide}</a></div></div>
    <div style="overflow-x: auto"><p style="white-space: nowrap">A paragraph too long for the screen scrolls sideways</p></div>
    <div class="clip"><div aria-hidden="true" style="width: 600px">${wide}</div></div>`);
    assert.equal(layout.scrollWidth, 320);
    assert.deepEqual(
      layout.violations.map((v) => v.kind),
      ["clipped", "scroll", "clipped"],
      report(layout),
    );
  },
);
