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
import { format } from "../src/i18n/format.ts";
import {
  LOCALES,
  PSEUDO_LOCALE,
  localeName,
  localePath,
  type Locale,
} from "../src/i18n/locales.ts";
import { loadCatalogue } from "../src/lib/load-catalogue.ts";
import {
  Browser,
  findBrowser,
  type Key,
  type Tab,
  type View,
} from "./browser.ts";
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
  // without the toolbar, which development alone draws over the page
  development = await dev({
    root: site,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
    devToolbar: { enabled: false },
  });
  base.development = `http://127.0.0.1:${development.address.port}`;
  browser = await Browser.launch(executable);
  // A throwaway page, so no test's page reloads under it. On a fresh
  // checkout, Astro 7's startup content sync writes `.astro/data-store.json`
  // and then sends a `full-reload` before any page is connected; Vite buffers
  // it for the first page that connects. Vite sends a connecting page
  // `connected`, which its client logs, then the buffered message, and forgets
  // it, so once this page has logged "[vite] connected." no other page gets
  // the reload. Remove this once a fixed Astro 7 release ships.
  const { targetId } = await browser.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = (await browser.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  })) as { sessionId: string };
  await browser.send("Runtime.enable", {}, sessionId);
  const connected = (async () => {
    for (;;) {
      const { args } = (await browser.event(
        "Runtime.consoleAPICalled",
        sessionId,
      ).next) as { args: { value?: unknown }[] };
      if (args[0]?.value === "[vite] connected.") return;
    }
  })();
  await Promise.all([
    connected,
    browser.send(
      "Page.navigate",
      { url: base.development + localePath(PSEUDO_LOCALE, "/") },
      sessionId,
    ),
  ]);
  await browser.send("Target.closeTarget", { targetId });
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

/** What the page opens on a tap: each nav menu, the nav's panel on a phone
 * and the language list inside it, the adoption dialog after each copy, as
 * the prompt or the command, and the docs' menu and table of contents. A
 * state `inside` another opens that one first. */
const NAV_PANEL = {
  controls: "nav button[aria-controls=nav-menu]",
  shows: "#nav-menu",
};
const STATES: {
  controls: string;
  shows: string;
  inside?: typeof NAV_PANEL;
  name?: string;
}[] = [
  {
    controls: "[data-slot=dropdown-menu-trigger]",
    shows: "[data-slot=dropdown-menu-content]",
  },
  NAV_PANEL,
  {
    inside: NAV_PANEL,
    name: "the language list",
    controls: "#nav-menu [data-slot=dropdown-menu-trigger]",
    shows: "[data-slot=dropdown-menu-content]",
  },
  {
    controls: "[data-slot=input-group-addon] button",
    shows: "[data-slot=dialog-content]",
  },
  {
    controls: ".sl-menu-button",
    shows: "#starlight__sidebar:popover-open",
  },
  {
    controls: "mobile-starlight-toc summary",
    shows: "mobile-starlight-toc details[open] .dropdown",
  },
];

/** A tap, and what it shows. */
type Step = { control: string; index: number; shows: string };
type State = { name: string; steps: Step[] };

/** The states `tab`'s page can open, named by their controls, of the
 * controls a phone shows. */
const statesOf = (tab: Tab) =>
  tab.evaluate((states: typeof STATES) => {
    const found: State[] = [];
    const seen = new Map<string, number>();
    for (const { controls, shows, inside, name } of states) {
      const outer = inside ?? { controls, shows };
      [...document.querySelectorAll(outer.controls)].forEach(
        (control, index) => {
          // the nav's wide controls, which its panel holds on a phone
          if (!control.checkVisibility()) return;
          const label = (
            control.getAttribute("aria-label") ||
            control.textContent ||
            outer.controls
          )
            .replace(/\s+/g, " ")
            .trim();
          const step = { control: outer.controls, index, shows: outer.shows };
          if (inside) {
            found.push({
              name: `open: ${label}, then ${name}`,
              steps: [step, { control: controls, index: 0, shows }],
            });
            return;
          }
          // the second of two Copy buttons is "Copy 2"
          const count = (seen.get(label) ?? 0) + 1;
          seen.set(label, count);
          found.push({
            name: `open: ${label}${count > 1 ? ` ${count}` : ""}`,
            steps: [step],
          });
        },
      );
    }
    return found;
  }, STATES);

/** Taps each of `state`'s controls in turn, with copying always
 * succeeding, and waits for what each opens. */
async function open(tab: Tab, state: State) {
  for (const step of state.steps) {
    const shown = await tab.evaluate(async (step: Step) => {
      navigator.clipboard.writeText = () => Promise.resolve();
      (
        document.querySelectorAll(step.control)[step.index] as HTMLElement
      ).click();
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const shown = document.querySelector(step.shows);
        if (shown?.checkVisibility()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    }, step);
    assert.ok(shown, `${state.name} shows ${step.shows}`);
    await still(tab);
  }
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
          const states = await statesOf(tab);
          if (!DOCS.includes(page.url)) {
            assert.equal(
              states.filter(
                (s) =>
                  s.steps[0].control === NAV_PANEL.controls &&
                  s.steps.length === 1,
              ).length,
              1,
              "the panel is measured",
            );
            assert.equal(
              states.filter(
                (s) =>
                  s.steps[0].control === NAV_PANEL.controls &&
                  s.steps.length === 2,
              ).length,
              1,
              "the nested language list is measured",
            );
            assert.equal(
              states.filter(
                (s) =>
                  s.steps[0].control === "[data-slot=dropdown-menu-trigger]",
              ).length,
              1,
              "the site's Support menu is measured",
            );
          }
          for (const state of states) {
            await tab.goto(url);
            await open(tab, state);
            record(
              view,
              state.name,
              await measure(tab, page.url, view, state.name),
            );
            if (
              !DOCS.includes(page.url) &&
              state.steps[0].control === "[data-slot=dropdown-menu-trigger]"
            ) {
              await supportRings(tab, page, view);
            }
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

// The nav every page outside the docs shares (ADR 0031): at 1280 px a bar
// shaped like the docs' header, in its order; on a phone one row, and one
// menu that does what the bar's controls do.

/** A control the nav shows, by its name: the plate, or its label or text. */
type NavControl = {
  name: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Its border's colour, transparent but on the one outlined control. */
  border: string;
  background: string;
  current: string | null;
  /** How wide its word is, if it has one beside an icon. */
  word: number | null;
};

/** The nav's box and the controls it shows, left to right. */
const navOf = (tab: Tab) =>
  tab.evaluate(() => {
    const nav = document.querySelector("nav")!;
    const box = nav.getBoundingClientRect();
    const style = getComputedStyle(nav);
    const controls = [...nav.querySelectorAll("a, button")]
      .filter((el) => el.checkVisibility())
      .map((el): NavControl => {
        const rect = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const word = el.querySelector("svg + span");
        return {
          name: el.classList.contains("site-plate")
            ? "plate"
            : (el.getAttribute("aria-label") ?? el.textContent.trim()),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          border: s.borderTopColor,
          background: s.backgroundColor,
          current: el.getAttribute("aria-current"),
          word: word && word.getBoundingClientRect().width,
        };
      });
    return {
      left: box.left,
      width: box.width,
      height: box.height,
      border: style.borderBottomWidth,
      padding: style.paddingLeft,
      controls,
    };
  });

/** The plate's box in the nav, or the docs' header. */
const plateOf = (tab: Tab) =>
  tab.evaluate(() => {
    const rect = document.querySelector(".site-plate")!.getBoundingClientRect();
    return [rect.left, rect.top, rect.width, rect.height].map(
      (n) => Math.round(n * 10) / 10,
    );
  });

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const NAV_PAGES = ["/", "/how-it-works/", "/sources/lutzseverino/repo-canon/"];

test(
  "at 1280 px the nav spans the window like the docs' header, its controls in their order",
  { skip },
  async () => {
    const view = { width: 1280, theme: "light" } as const;
    const docs = await openTab(`${base.production}/docs/`, view);
    const header = await docs.evaluate(() => {
      const header = document.querySelector("header.header")!;
      const style = getComputedStyle(header);
      return {
        height: header.getBoundingClientRect().height,
        border: style.borderBottomWidth,
        padding: style.paddingLeft,
      };
    });
    const docsPlate = await plateOf(docs);
    await docs.close();
    assert.deepEqual(header, { height: 64, border: "1px", padding: "24px" });

    for (const page of NAV_PAGES) {
      const tab = await openTab(base.production + page, view);
      const nav = await navOf(tab);
      assert.deepEqual(
        {
          left: nav.left,
          width: nav.width,
          height: nav.height,
          border: nav.border,
          padding: nav.padding,
        },
        { left: 0, width: 1280, ...header },
        page,
      );
      assert.deepEqual(
        nav.controls.map((c) => c.name),
        [
          // the homepage's sign says the same as the plate
          ...(page === "/" ? [] : ["plate"]),
          "Documentation",
          "How it works",
          "GitHub",
          "Support",
          "Language: English",
          "Switch between the light and dark theme",
        ],
        page,
      );
      // left to right, the places on this site on the left, the rest on the
      // right
      const { controls } = nav;
      controls.forEach((c, i) =>
        assert.ok(i === 0 || c.left >= controls[i - 1].right, page),
      );
      const github = controls.findIndex((c) => c.name === "GitHub");
      assert.ok(controls[github - 1].right < 640, page);
      assert.ok(controls[github].left > 640, page);
      // Support alone is outlined
      assert.deepEqual(
        controls
          .filter((c) => c.name !== "plate" && c.border !== TRANSPARENT)
          .map((c) => c.name),
        ["Support"],
        page,
      );
      // How it works reads as pressed on its own page
      const howItWorks = controls.find((c) => c.name === "How it works")!;
      assert.equal(
        howItWorks.current,
        page === "/how-it-works/" ? "page" : null,
        page,
      );
      assert.equal(
        howItWorks.background === TRANSPARENT,
        page !== "/how-it-works/",
        page,
      );
      // the same plate in the same place as the docs' header's
      if (page !== "/") assert.deepEqual(await plateOf(tab), docsPlate, page);
      await tab.close();
    }
  },
);

test(
  "on a phone the nav holds the plate, Support's heart and one menu in one row",
  { skip },
  async () => {
    for (const page of NAV_PAGES)
      for (const width of WIDTHS) {
        const tab = await openTab(base.production + page, {
          width,
          theme: "light",
        });
        const { controls } = await navOf(tab);
        await tab.close();
        assert.deepEqual(
          controls.map((c) => c.name),
          [...(page === "/" ? [] : ["plate"]), "Support", "Menu"],
          `${page} at ${width} px`,
        );
        const support = controls.find((c) => c.name === "Support")!;
        assert.ok(support.word! <= 1, `${page}: the heart alone`);
        assert.ok(
          Math.max(...controls.map((c) => c.top)) <
            Math.min(...controls.map((c) => c.bottom)),
          `${page} at ${width} px: one row`,
        );
      }
  },
);

/** What the nav's panel on a phone shows: its controls in order, each with
 * its name, visible text, box and current-page state, and its roles. */
type Panel = {
  expanded: string | null;
  roles: string[];
  text: string;
  controls: {
    name: string;
    text: string;
    current: string | null;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }[];
};

/** The panel as it is: `expanded` is the menu button's `aria-expanded`,
 * and `controls` is empty while the panel is closed. */
const panelOf = (tab: Tab) =>
  tab.evaluate((): Panel => {
    const button = document.querySelector(
      "nav button[aria-controls=nav-menu]",
    )!;
    const panel = document.getElementById("nav-menu");
    return {
      expanded: button.getAttribute("aria-expanded"),
      roles: panel
        ? [...panel.querySelectorAll("[role]")].map((el) =>
            el.getAttribute("role")!,
          )
        : [],
      text: panel?.innerText ?? "",
      controls: [...(panel?.querySelectorAll("a, button") ?? [])].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          name: el.getAttribute("aria-label") ?? el.textContent.trim(),
          text: (el as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
          current: el.getAttribute("aria-current"),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      }),
    };
  });

/** Taps the nav's menu button on a phone, then waits a frame. */
const tapMenu = (tab: Tab) =>
  tab.evaluate(async () => {
    (
      document.querySelector(
        "nav button[aria-controls=nav-menu]",
      ) as HTMLElement
    ).click();
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  });

/** Clicks the control in the open panel or list that `name` names, by its
 * label or text, then waits a frame. */
const tap = (tab: Tab, name: string) =>
  tab.evaluate(async (name: string) => {
    const controls = [
      ...document.querySelectorAll(
        "#nav-menu a, #nav-menu button, [data-slot=dropdown-menu-content] [role^=menuitem]",
      ),
    ];
    (
      controls.find(
        (el) =>
          (el.getAttribute("aria-label") ?? el.textContent.trim()) === name,
      ) as HTMLElement
    ).click();
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  }, name);

/** The open language list's label and items, with each item's checked
 * state, or null with no list open. */
const languageList = (tab: Tab) =>
  tab.evaluate(async () => {
    const deadline = Date.now() + 5000;
    let list: Element | null = null;
    while (!list?.checkVisibility() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      list = document.querySelector("[data-slot=dropdown-menu-content]");
    }
    if (!list?.checkVisibility()) return null;
    return [
      ...list.querySelectorAll(
        "[data-slot=dropdown-menu-label], [data-slot=dropdown-menu-radio-item]",
      ),
    ].map((item) =>
      [item.textContent.trim(), item.getAttribute("aria-checked")]
        .filter(Boolean)
        .join(" "),
    );
  });

/** Waits until `tab`'s page is at `url` and settled. */
async function arrival(tab: Tab, url: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const at = await tab
      .evaluate(() => document.readyState === "complete" && location.href)
      .catch(() => false);
    if (at === url) return tab.settle();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`never reached ${url}`);
}

test(
  "on a phone the menu button opens a panel of links, then one language selector and the theme icon",
  { skip },
  async () => {
    for (const locale of [...LOCALES, PSEUDO_LOCALE] as Locale[]) {
      const t = (id: Parameters<typeof format>[1]) => format(locale, id);
      const server = locale === PSEUDO_LOCALE ? "development" : "production";
      const page = localePath(locale, "/how-it-works/");
      const tab = await openTab(base[server] + page, {
        width: 320,
        theme: "light",
      });
      const closed = await panelOf(tab);
      assert.deepEqual([closed.expanded, closed.controls], ["false", []]);
      await tapMenu(tab);
      const panel = await panelOf(tab);
      await tab.close();
      assert.equal(panel.expanded, "true", page);
      // a disclosure of links and buttons, not a menu
      assert.deepEqual(panel.roles, [], page);
      assert.deepEqual(
        panel.controls.map((c) => c.name),
        [
          `${t("common.nav.documentation")}${locale === "en" ? "" : `EN (${t("common.nav.in-english")})`}`,
          t("common.nav.how-it-works"),
          "GitHub",
          format(locale, "common.language.current", {
            language: localeName(locale),
          }),
          t("common.theme.toggle"),
        ],
        page,
      );
      // How it works reads as pressed on its own page
      assert.deepEqual(
        panel.controls.map((c) => c.current),
        [null, "page", null, null, null],
        page,
      );
      // the links are full-width rows a finger can tap, one under another
      const [, , github, selector, toggle] = panel.controls;
      for (const [i, c] of panel.controls.slice(0, 3).entries()) {
        assert.ok(c.bottom - c.top >= 44, `${page}: ${c.name} is 44 px tall`);
        assert.ok(c.right - c.left >= 320 - 32, `${page}: ${c.name} is wide`);
        if (i) assert.ok(c.top >= panel.controls[i - 1].bottom, page);
      }
      // below them one row: the language at its start, the theme at its end
      assert.ok(selector.top >= github.bottom, page);
      assert.ok(selector.bottom - selector.top >= 44, page);
      assert.ok(selector.left < 20 && toggle.right > 300, page);
      assert.ok(toggle.top < selector.bottom && toggle.bottom > selector.top);
      assert.equal(selector.text, localeName(locale), page);
      assert.equal(toggle.text, "", page);
      // the theme's long name is only its accessible name
      assert.ok(!panel.text.includes(toggle.name), page);
    }
  },
);

test(
  "the panel's language selector opens the language list, which leads to the same page and section",
  { skip },
  async () => {
    const view = { width: 320, theme: "light" } as const;
    const tab = await openTab(
      `${base.production}/how-it-works/#who-does-what`,
      view,
    );
    try {
      await tapMenu(tab);
      assert.equal((await panelOf(tab)).controls[3].name, "Language: English");
      await tap(tab, "Language: English");
      assert.deepEqual(await languageList(tab), [
        "Language",
        "English true",
        "Español false",
        "Català false",
      ]);
      // the list opens from the selector's start edge, over the dimmed page
      const [selector, list] = await tab.evaluate(() =>
        [
          "#nav-menu [data-slot=dropdown-menu-trigger]",
          "[data-slot=dropdown-menu-content]",
        ].map((selector) => {
          const rect = document
            .querySelector(selector)!
            .getBoundingClientRect();
          return { left: rect.left, top: rect.top, bottom: rect.bottom };
        }),
      );
      assert.ok(Math.abs(list.left - selector.left) <= 1, "start edge");
      assert.ok(list.top >= selector.bottom, "below it");
      // the panel stays open behind it
      assert.equal((await panelOf(tab)).expanded, "true");
      // picking leaves the page, so the click waits for nothing
      await tab.evaluate(() =>
        (
          [
            ...document.querySelectorAll(
              "[data-slot=dropdown-menu-content] [role^=menuitem]",
            ),
          ].find((item) => item.textContent.trim() === "Català") as HTMLElement
        ).click(),
      );
      // the same page and section in the language picked
      await arrival(tab, `${base.production}/ca/how-it-works/#who-does-what`);
      await tapMenu(tab);
      await tap(tab, "Llengua: Català");
      assert.deepEqual(await languageList(tab), [
        "Llengua",
        "English false",
        "Español false",
        "Català true",
      ]);
    } finally {
      // the choice is the browser's: later tabs open in English
      await tab.evaluate(() => localStorage.removeItem("locale"));
      await tab.close();
    }
  },
);

test(
  "the panel's theme icon switches and remembers the theme, and the panel stays open",
  { skip },
  async () => {
    const tab = await openTab(
      `${base.production}/es/sources/lutzseverino/repo-canon/`,
      { width: 320, theme: "light" },
    );
    await tapMenu(tab);
    await tap(tab, "Cambiar entre el tema claro y el oscuro");
    assert.deepEqual(
      await tab.evaluate(() => [
        document.documentElement.classList.contains("dark"),
        localStorage.getItem("theme"),
      ]),
      [true, "dark"],
    );
    const panel = await panelOf(tab);
    await tab.close();
    assert.equal(panel.expanded, "true");
    assert.equal(panel.controls[0].name, "DocumentaciónEN (en inglés)");
  },
);

test(
  "the open panel dims the page below it, which doesn't scroll until the panel closes",
  { skip },
  async () => {
    for (const [page, theme] of [
      ["/how-it-works/", "light"],
      ["/how-it-works/", "dark"],
      // above the sign's own layers
      ["/", "dark"],
    ] as const) {
      const tab = await openTab(base.production + page, { width: 390, theme });
      /** What a tap at the top of the header and at the bottom of the
       * screen would land on, and the dimming's colour. */
      const covered = () =>
        tab.evaluate(() => {
          const panel = document.getElementById("nav-menu");
          const below = document.elementFromPoint(195, 780)!;
          const header = document.elementFromPoint(195, 2)!;
          return {
            scrim:
              panel !== null &&
              below === panel.nextElementSibling &&
              below.getAttribute("aria-hidden") === "true",
            header: header.closest("nav") !== null && !panel?.contains(header),
            dim: getComputedStyle(below).backgroundColor,
            starts: Math.round(below.getBoundingClientRect().top),
            ends: Math.round(panel?.getBoundingClientRect().bottom ?? 0),
          };
        });
      /** Scrolls the page down with the mouse wheel; how far it moved. */
      const wheel = async () => {
        const before = await tab.evaluate(() => window.scrollY);
        await tab.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: 195,
          y: 700,
          deltaX: 0,
          deltaY: 400,
        });
        await tab.evaluate(async () => {
          for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame);
        });
        return (await tab.evaluate(() => window.scrollY)) - before;
      };

      await tapMenu(tab);
      const open = await covered();
      assert.ok(open.scrim, `${theme}: the page below is covered`);
      assert.ok(open.header, `${theme}: the header is not`);
      assert.equal(open.starts, open.ends, `${theme}: flush under the panel`);
      // black, 40% by day and 60% by night
      assert.equal(
        open.dim,
        `oklab(0 0 0 / ${theme === "light" ? 0.4 : 0.6})`,
        theme,
      );
      assert.equal(await wheel(), 0, `${theme}: the page stays still`);
      // a tap on the dimmed page closes the panel
      await tab.evaluate(async () => {
        (document.elementFromPoint(195, 780) as HTMLElement).click();
        for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
      });
      const closed = await panelOf(tab);
      assert.equal(closed.expanded, "false", theme);
      assert.equal((await covered()).scrim, false, theme);
      assert.ok((await wheel()) > 0, `${theme}: the page scrolls again`);

      // widening to the bar closes the panel too
      await tab.evaluate(() => window.scrollTo(0, 0));
      await tapMenu(tab);
      await tab.resize(1280);
      await tab.settle();
      assert.deepEqual(
        await tab.evaluate(() => [
          document.getElementById("nav-menu"),
          getComputedStyle(document.documentElement).overflow,
        ]),
        [null, "visible"],
        theme,
      );
      await tab.close();
    }
  },
);

/** Focuses the nav's menu button on a phone. */
const focusMenu = (tab: Tab) =>
  tab.evaluate(() =>
    (
      document.querySelector(
        "nav button[aria-controls=nav-menu]",
      ) as HTMLElement
    ).focus(),
  );

/** The focused element, by its label or text, and whether the panel and
 * the language list are open. */
const focusOf = (tab: Tab) =>
  tab.evaluate(async () => {
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
    const el = document.activeElement!;
    const selector = document.querySelector(
      "#nav-menu [data-slot=dropdown-menu-trigger]",
    );
    return {
      focus: el.getAttribute("aria-label") ?? el.textContent.trim(),
      panel: document
        .querySelector("nav button[aria-controls=nav-menu]")!
        .getAttribute("aria-expanded"),
      list:
        selector === null
          ? null
          : [
              selector.getAttribute("aria-expanded"),
              document.querySelector("[data-slot=dropdown-menu-content]") !==
                null,
            ],
    };
  });

test(
  "the panel follows the disclosure navigation keyboard model, and the arrow keys never open the language list",
  { skip },
  async () => {
    const tab = await openTab(`${base.production}/how-it-works/`, {
      width: 320,
      theme: "light",
    });
    const THEME = "Switch between the light and dark theme";
    const LANGUAGE = "Language: English";
    const closedList = ["false", false];
    /** A key pressed, then where focus is, the menu button's
     * `aria-expanded`, and the language selector's `aria-expanded` with
     * whether its list is rendered, or null with the panel closed. */
    const steps: {
      press: Key;
      shift?: boolean;
      /** Whether focus leaves for the page's body first. */
      blur?: boolean;
      focus: string;
      panel: string;
      list: unknown;
    }[] = [
      // Enter opens the panel and leaves focus on the button
      { press: "Enter", focus: "Menu", panel: "true", list: closedList },
      // Down Arrow from the open button reaches the first link
      {
        press: "ArrowDown",
        focus: "Documentation",
        panel: "true",
        list: closedList,
      },
      {
        press: "ArrowDown",
        focus: "How it works",
        panel: "true",
        list: closedList,
      },
      { press: "ArrowDown", focus: "GitHub", panel: "true", list: closedList },
      { press: "ArrowDown", focus: LANGUAGE, panel: "true", list: closedList },
      // from the selector, Down Arrow focuses the theme toggle and Up Arrow
      // GitHub, with the list closed
      { press: "ArrowDown", focus: THEME, panel: "true", list: closedList },
      // focus stops at either end
      { press: "ArrowDown", focus: THEME, panel: "true", list: closedList },
      { press: "ArrowUp", focus: LANGUAGE, panel: "true", list: closedList },
      { press: "ArrowUp", focus: "GitHub", panel: "true", list: closedList },
      { press: "ArrowDown", focus: LANGUAGE, panel: "true", list: closedList },
      { press: "ArrowDown", focus: THEME, panel: "true", list: closedList },
      {
        press: "Home",
        focus: "Documentation",
        panel: "true",
        list: closedList,
      },
      {
        press: "ArrowUp",
        focus: "Documentation",
        panel: "true",
        list: closedList,
      },
      { press: "End", focus: THEME, panel: "true", list: closedList },
      { press: "ArrowUp", focus: LANGUAGE, panel: "true", list: closedList },
      // Enter opens the list, whose first item takes focus
      { press: "Enter", focus: "English", panel: "true", list: ["true", true] },
      // Escape closes only the list, and the panel stays open
      { press: "Escape", focus: LANGUAGE, panel: "true", list: closedList },
      // a second Escape closes the panel
      { press: "Escape", focus: "Menu", panel: "false", list: null },
      // with no list open, Escape closes the panel and focuses its button
      { press: "Enter", focus: "Menu", panel: "true", list: closedList },
      {
        press: "ArrowDown",
        focus: "Documentation",
        panel: "true",
        list: closedList,
      },
      { press: "Escape", focus: "Menu", panel: "false", list: null },
      // Escape with nothing focused, as after a tap in Safari, closes it too
      { press: "Enter", focus: "Menu", panel: "true", list: closedList },
      {
        press: "Escape",
        blur: true,
        focus: "Menu",
        panel: "false",
        list: null,
      },
      // Shift+Tab from the first link returns to the button, still open
      { press: "Enter", focus: "Menu", panel: "true", list: closedList },
      { press: "Tab", focus: "Documentation", panel: "true", list: closedList },
      {
        press: "Tab",
        shift: true,
        focus: "Menu",
        panel: "true",
        list: closedList,
      },
      // Tab from the theme toggle leaves the panel, which closes
      {
        press: "ArrowDown",
        focus: "Documentation",
        panel: "true",
        list: closedList,
      },
      { press: "End", focus: THEME, panel: "true", list: closedList },
    ];
    try {
      await focusMenu(tab);
      for (const { press, shift, blur, ...expected } of steps) {
        if (blur)
          await tab.evaluate(() =>
            (document.activeElement as HTMLElement).blur(),
          );
        await tab.press(press, shift);
        await still(tab);
        assert.deepEqual(
          await focusOf(tab),
          expected,
          `${press}${shift ? " with Shift" : ""} to ${expected.focus}`,
        );
      }
      await tab.press("Tab");
      await still(tab);
      const out = await focusOf(tab);
      assert.equal(out.panel, "false", "Tab from the theme toggle closes it");
      assert.notEqual(out.focus, THEME);
      assert.ok(
        await tab.evaluate(
          () =>
            document.activeElement !== document.body &&
            document.querySelector("nav")!.contains(document.activeElement) ===
              false,
        ),
        "focus moves on to the page",
      );
    } finally {
      await tab.close();
    }
  },
);

/** The original ring probe, shared by the model test and matrix sweep. */
const ringsOf = (
  tab: Tab,
  controls = "nav button[aria-controls=nav-menu], #nav-menu a, #nav-menu button, [data-slot=dropdown-menu-content] [role^=menuitem]",
) =>
  tab.evaluate(async (controls: string) => {
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
    const ring = (el: Element) => {
      const s = getComputedStyle(el);
      return {
        shadow: s.boxShadow,
        outline: s.outlineStyle === "none" ? "none" : s.outline,
        background: s.backgroundColor,
      };
    };
    const name = (el: Element) =>
      el.getAttribute("aria-label") ?? el.textContent.trim();
    const focused = document.activeElement!;
    return {
      focused: {
        name: name(focused),
        visible: focused.matches(":focus-visible"),
        ...ring(focused),
      },
      others: Object.fromEntries(
        [...document.querySelectorAll(controls)]
          .filter((el) => el !== focused && el.checkVisibility())
          .map((el) => [name(el), ring(el)]),
      ),
    };
  }, controls);

// #451 extends #453's keyboard model and ring probe across the existing
// site-page matrix. The docs keep their original geometry-only coverage.
const SITE_FOCUS =
  "nav a, nav button, [data-slot=dropdown-menu-content] [role^=menuitem]";
type Rings = Awaited<ReturnType<typeof ringsOf>>;

/** The same focused/unfocused oracle as #453, including controls whose
 * unfocused shadow is decorative (the plate or an outlined button). */
function assertRings(seen: Rings[], context: string) {
  assert.ok(seen.length > 0, `${context}: controls were focused`);
  for (const { focused } of seen) {
    assert.ok(focused.visible, `${context}: ${focused.name} focus-visible`);
    const unfocused = seen.find((s) => s.others[focused.name])?.others[
      focused.name
    ];
    assert.ok(unfocused, `${context}: ${focused.name} unfocused evidence`);
    const shows = (key: "shadow" | "outline") =>
      focused[key] !== "none" && focused[key] !== unfocused[key];
    assert.ok(
      shows("shadow") || shows("outline"),
      `${context}: ${focused.name} has a ring: ${JSON.stringify({ focused, unfocused })}`,
    );
  }
}

/** Checks the already-opened site's Support state, never the docs'. */
async function supportRings(tab: Tab, page: Page, view: View) {
  const items = await tab.evaluate(() => {
    const list = document.querySelector(
      "[data-slot=dropdown-menu-content][role=menu]",
    );
    return [...(list?.querySelectorAll("[role=menuitem]") ?? [])].map((el) =>
      el.textContent.trim(),
    );
  });
  assert.deepEqual(
    items,
    ["GitHub Sponsors", "Ko-fi"],
    `${page.url}: Support items`,
  );
  await tab.evaluate(() =>
    (
      document.querySelector(
        "[data-slot=dropdown-menu-content] [role=menuitem]",
      ) as HTMLElement
    ).focus(),
  );
  const seen: Rings[] = [];
  for (const [i, name] of items.entries()) {
    await tab.press(i === 0 ? "Home" : "ArrowDown");
    const ring = await ringsOf(tab, SITE_FOCUS);
    assert.equal(ring.focused.name, name, "Support keyboard order");
    seen.push(ring);
  }
  assertRings(seen, `${page.url} ${view.width} px ${view.theme} Support`);
  if (reportTo)
    measurements.push({
      url: page.url,
      ...view,
      state: "keyboard: Support",
      rings: seen,
    });
}

async function keyboardNav(tab: Tab, page: Page, view: View) {
  const locale = page.lang as Locale;
  const t = (id: Parameters<typeof format>[1]) => format(locale, id);
  const menu = t("common.nav.menu");
  const support = t("common.support.button");
  const language = format(locale, "common.language.current", {
    language: localeName(locale),
  });
  const theme = t("common.theme.toggle");
  const docs = `${t("common.nav.documentation")}${locale === "en" ? "" : `EN (${t("common.nav.in-english")})`}`;
  const controls = [
    docs,
    t("common.nav.how-it-works"),
    "GitHub",
    language,
    theme,
  ];
  const home = page.url === localePath(locale, "/");
  const header = [...(home ? [] : ["Repo Standards"]), support, menu];
  const context = `${page.url} ${view.width} px ${view.theme}`;
  const seen: Rings[] = [];
  const trace: unknown[] = [];
  const closedList = ["false", false];

  // Header order is explicit, including the plain plate link, and matches
  // the painted left-to-right order rather than button discovery alone.
  const nav = await navOf(tab);
  assert.deepEqual(
    nav.controls.map((c) => c.name),
    [...(home ? [] : ["plate"]), support, menu],
    context,
  );
  nav.controls.forEach((c, i) =>
    assert.ok(
      i === 0 || c.left >= nav.controls[i - 1].right,
      `${context}: header visual order`,
    ),
  );

  const press = async (
    key: Key,
    focus: string,
    panel = true,
    list: unknown = closedList,
    shift = false,
  ) => {
    await tab.press(key, shift);
    if (key === "Escape" || key === "Enter" || key === " ") await still(tab);
    const actual = await focusOf(tab);
    assert.deepEqual(
      actual,
      { focus, panel: String(panel), list: panel ? list : null },
      `${context}: ${shift ? "Shift+" : ""}${key} to ${focus}`,
    );
    if (!seen.some((s) => s.focused.name === focus))
      seen.push(await ringsOf(tab, SITE_FOCUS));
    trace.push({ key, shift, ...actual });
  };

  for (const name of header) await press("Tab", name, false);
  for (const name of header.slice(0, -1).reverse())
    await press("Tab", name, false, null, true);
  for (const name of header.slice(1)) await press("Tab", name, false);

  // Both activation keys open and close without moving focus.
  for (const key of ["Enter", " "] as const) {
    await press(key, menu);
    await press(key, menu, false);
  }
  await press("Enter", menu);
  const panel = await panelOf(tab);
  assert.deepEqual(
    panel.controls.map((c) => c.name),
    controls,
    context,
  );
  assert.deepEqual(panel.roles, [], `${context}: disclosure, not an ARIA menu`);
  const currentPage = page.url === localePath(locale, "/how-it-works/");
  assert.deepEqual(
    panel.controls.map((c) => c.current),
    [null, currentPage ? "page" : null, null, null, null],
    `${context}: current-page row`,
  );
  assert.equal(
    await tab.evaluate(() =>
      document.getElementById("nav-menu")!.getAttribute("role"),
    ),
    null,
    "the panel has no menu role",
  );
  assert.equal(
    await tab.evaluate(
      () => document.getElementById("nav-menu")!.closest("nav") !== null,
    ),
    true,
    "inside the navigation landmark",
  );
  panel.controls.forEach((c, i) => {
    if (!i) return;
    const previous = panel.controls[i - 1];
    assert.ok(
      c.top >= previous.bottom ||
        (c.top < previous.bottom &&
          c.bottom > previous.top &&
          c.left >= previous.right),
      `${context}: panel visual order`,
    );
  });

  await press("ArrowDown", docs);
  await press("Tab", menu, true, closedList, true);
  for (const name of controls) await press("Tab", name);
  for (const name of controls.slice(0, -1).reverse())
    await press("Tab", name, true, closedList, true);
  await press("ArrowUp", docs); // stops, never wraps
  for (const name of controls.slice(1)) await press("ArrowDown", name);
  await press("ArrowDown", theme); // stops, never wraps
  for (const name of controls.slice(0, -1).reverse())
    await press("ArrowUp", name);
  await press("End", theme);
  await press("ArrowUp", language);
  await press("Home", docs); // from the selector, list remains closed
  await press("End", theme);
  await press("ArrowUp", language);
  await press("End", theme); // likewise End on the selector
  await press("Home", docs);
  await press("Escape", menu, false);

  for (const key of ["Enter", " "] as const) {
    await press("Enter", menu);
    await press("ArrowDown", docs);
    await press("End", theme);
    await press("ArrowUp", language);
    await press(key, "English", true, ["true", true]);
    assert.deepEqual(
      await languageList(tab),
      [
        t("common.language.label"),
        ...LOCALES.map((l) => `${localeName(l)} ${l === locale}`),
      ],
      `${context}: opened language list and checked row`,
    );
    assert.equal(
      await tab.evaluate(() =>
        document
          .querySelector("[data-slot=dropdown-menu-content]")!
          .getAttribute("role"),
      ),
      "menu",
    );
    for (const name of LOCALES.slice(1).map(localeName))
      await press("ArrowDown", name, true, ["true", true]);
    await press("Home", "English", true, ["true", true]);
    await press("End", "Català", true, ["true", true]);
    await press("Escape", language);
    await press("Escape", menu, false);
  }

  await press("Enter", menu);
  await press("ArrowDown", docs);
  await press("End", theme);
  await press("Enter", theme);
  assert.deepEqual(
    await tab.evaluate(() => [
      document.documentElement.classList.contains("dark"),
      localStorage.getItem("theme"),
    ]),
    [view.theme !== "dark", view.theme === "dark" ? "light" : "dark"],
    `${context}: theme operates with panel open`,
  );
  await press(" ", theme);
  assert.equal(
    await tab.evaluate(() => localStorage.getItem("theme")),
    view.theme,
  );

  // Find the next page stop independently of the panel's event handler.
  const next = await tab.evaluate(() => {
    const all = [
      ...document.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, summary, [tabindex]",
      ),
    ].filter(
      (el) =>
        el.tabIndex >= 0 && el.checkVisibility() && !el.closest("[inert]"),
    );
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next = all[at + 1];
    if (!next || next.closest("nav")) return null;
    next.setAttribute("data-phone-next", "");
    return next.getAttribute("aria-label") ?? next.textContent.trim();
  });
  assert.ok(next, `${context}: next focusable page element exists`);
  const ringCount = seen.length;
  await press("Tab", next, false);
  // The page target itself is outside this change's focus-ring contract.
  seen.splice(ringCount);
  assert.equal(
    await tab.evaluate(() =>
      document.activeElement?.hasAttribute("data-phone-next"),
    ),
    true,
    `${context}: Tab leaves for the next page stop`,
  );
  await tab.evaluate(() =>
    document
      .querySelector("[data-phone-next]")!
      .removeAttribute("data-phone-next"),
  );
  assertRings(seen, context);
  if (currentPage)
    assert.notEqual(
      seen.find((s) => s.focused.name === controls[1])!.focused.background,
      TRANSPARENT,
      `${context}: pressed row keeps its background with the ring`,
    );

  // Select by keyboard too: keep the destination page and saved choice,
  // then clear that browser-wide preference for the next matrix entry.
  await focusMenu(tab);
  for (const key of [
    "Enter",
    "ArrowDown",
    "End",
    "ArrowUp",
    "Enter",
  ] as const) {
    await tab.press(key);
    await still(tab);
  }
  const chosen = locale === "en" ? "es" : "en";
  if (chosen === "es") await tab.press("ArrowDown");
  await tab.press("Enter");
  const family = families.find(
    (family) => localePath(locale, family) === page.url,
  )!;
  await arrival(tab, base[page.server] + localePath(chosen, family));
  assert.equal(
    await tab.evaluate(() => localStorage.getItem("locale")),
    chosen,
    `${context}: keyboard selection saves and navigates`,
  );
  await tab.evaluate(() => localStorage.removeItem("locale"));
  if (reportTo)
    measurements.push({
      url: page.url,
      ...view,
      state: "keyboard: navigation",
      trace,
      rings: seen,
    });
}

for (const page of pages.filter((p) => !DOCS.includes(p.url)))
  test(
    `${page.url} keyboard navigation and rings across the phone matrix`,
    { skip },
    async () => {
      for (const theme of THEMES)
        for (const width of WIDTHS) {
          const view = { width, theme };
          const tab = await openTab(base[page.server] + page.url, view);
          try {
            await keyboardNav(tab, page, view);
          } finally {
            try {
              await tab.evaluate(() => localStorage.removeItem("locale"));
            } finally {
              await tab.close();
            }
          }
        }
    },
  );

test(
  "every control in the panel and the language list shows a focus ring, in both themes",
  { skip },
  async () => {
    for (const theme of THEMES) {
      const tab = await openTab(`${base.production}/how-it-works/`, {
        width: 320,
        theme,
      });
      /** The focused element's name, ring and pressed background, and the
       * same of every control in the panel and the list while they are not
       * focused, by name. */
      const rings = () => ringsOf(tab);
      const seen: Awaited<ReturnType<typeof rings>>[] = [];
      await focusMenu(tab);
      await tab.press("Enter");
      seen.push(await rings());
      for (let i = 0; i < 5; i++) {
        await tab.press("ArrowDown");
        seen.push(await rings());
      }
      await tab.press("ArrowUp");
      await tab.press("Enter");
      seen.push(await rings());
      for (let i = 0; i < 2; i++) {
        await tab.press("ArrowDown");
        seen.push(await rings());
      }
      await tab.close();

      const names = seen.map((s) => s.focused.name);
      assert.deepEqual(
        names,
        [
          "Menu",
          "Documentation",
          "How it works",
          "GitHub",
          "Language: English",
          "Switch between the light and dark theme",
          "English",
          "Español",
          "Català",
        ],
        theme,
      );
      for (const { focused } of seen) {
        assert.ok(focused.visible, `${theme}: ${focused.name} focus-visible`);
        // its look while another control has focus
        const unfocused = seen.find((s) => s.others[focused.name])!.others[
          focused.name
        ];
        const shows = (look: typeof unfocused, key: "shadow" | "outline") =>
          look[key] !== "none" && look[key] !== unfocused[key];
        assert.ok(
          shows(focused, "shadow") || shows(focused, "outline"),
          `${theme}: ${focused.name} has a ring: ${JSON.stringify({ focused, unfocused })}`,
        );
      }
      // the current page's row keeps its pressed background with the ring
      const current = seen[2].focused;
      assert.notEqual(current.background, TRANSPARENT, theme);
    }
  },
);

test(
  "on the homepage How it works plays the sign's story, from the bar and from the panel",
  { skip },
  async () => {
    const sunk = (tab: Tab) =>
      tab.evaluate(async () => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          if (document.querySelector(".sign-hero-stage[data-sunk]"))
            return true;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return false;
      });
    const wide = await openTab(`${base.production}/`, {
      width: 1280,
      theme: "light",
    });
    await wide.evaluate(() => {
      const button = [...document.querySelectorAll("nav button")].find(
        (button) => button.textContent === "How it works",
      ) as HTMLElement;
      button.click();
    });
    assert.ok(await sunk(wide), "from the bar");
    await wide.close();
    const phone = await openTab(`${base.production}/`, {
      width: 320,
      theme: "light",
    });
    await tapMenu(phone);
    await tap(phone, "How it works");
    assert.ok(await sunk(phone), "from the panel");
    assert.equal((await panelOf(phone)).expanded, "false", "which closes");
    await phone.close();
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
  "#421: a repository link that cannot break and a nav that keeps its wide row widen a source page",
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
          "dd a { overflow-wrap: normal !important } nav .hidden { display: flex !important }";
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
    assert.match(lines, /screen: nav[\w.-]* > div\.ml-auto/);
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
