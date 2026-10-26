import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "astro";
import {
  parseTranslations,
  readTranslationFiles,
} from "../src/i18n/translations.ts";
import { LOCALES } from "../src/i18n/locales.ts";
import { installText } from "../src/lib/catalogue.ts";
import { formatDate } from "../src/lib/format.ts";
import { loadCatalogue } from "../src/lib/load-catalogue.ts";

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

const sitePageFiles = () =>
  readdirSync(output, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith("index.html"))
    .filter(
      (file) => !file.startsWith("docs/") && file !== "layout-test/index.html",
    );

test("every site page links its English, Spanish and Catalan versions reciprocally", () => {
  for (const file of sitePageFiles()) {
    const pathname = `/${file.replace(/index\.html$/, "")}`.replace(
      /^\/(?:es|ca)\//,
      "/",
    );
    const alternates = [
      ...read(file).matchAll(
        /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g,
      ),
    ].map((match) => [match[1], match[2]]);
    assert.deepEqual(
      alternates,
      [
        ["en", `https://repo-standards.com${pathname}`],
        ["es", `https://repo-standards.com/es${pathname}`],
        ["ca", `https://repo-standards.com/ca${pathname}`],
        ["x-default", `https://repo-standards.com${pathname}`],
      ],
      file,
    );
    for (const [, href] of alternates) {
      assert.ok(
        read(`${new URL(href).pathname.slice(1)}index.html`),
        `${file} → ${href}`,
      );
    }
  }
});

test("every site page declares its language in Open Graph and JSON-LD", () => {
  const ogLocales = { en: "en_US", es: "es_ES", ca: "ca_ES" };
  for (const file of sitePageFiles()) {
    const locale = /^(es|ca)\//.exec(file)?.[1] ?? "en";
    const html = read(file);
    const meta = metaTags(html);
    assert.equal(
      meta["og:locale"],
      ogLocales[locale as keyof typeof ogLocales],
      file,
    );
    const alternates = [
      ...html.matchAll(
        /<meta property="og:locale:alternate" content="([^"]+)"/g,
      ),
    ].map((match) => match[1]);
    assert.deepEqual(
      alternates,
      Object.entries(ogLocales)
        .filter(([key]) => key !== locale)
        .map(([, value]) => value),
      file,
    );
    const data = [
      ...html.matchAll(
        /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ].map((match) => JSON.parse(match[1]) as Record<string, unknown>);
    const page = data.find((entry) => entry["@type"] === "WebPage");
    assert.ok(page, file);
    assert.equal(page.inLanguage, locale, file);
    assert.equal(page.url, meta["og:url"], file);
  }
});

test("the sitemap groups site translations and leaves English docs without alternates", () => {
  const entries = [
    ...read("sitemap-0.xml").matchAll(/<url>([\s\S]*?)<\/url>/g),
  ].map((match) => match[1]);
  for (const { file } of localePages()) {
    const pathname = `/${file.replace(/index\.html$/, "")}`;
    const english = pathname.replace(/^\/(?:es|ca)\//, "/");
    const entry = entries.find((item) =>
      item.includes(`<loc>https://repo-standards.com${pathname}</loc>`),
    );
    assert.ok(entry, pathname);
    const links = [
      ...entry.matchAll(
        /<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\s*\/>/g,
      ),
    ]
      .map((match) => [match[1], match[2]])
      .sort((a, b) => a[0].localeCompare(b[0], "en"));
    assert.deepEqual(
      links,
      [
        ["ca", `https://repo-standards.com/ca${english}`],
        ["en", `https://repo-standards.com${english}`],
        ["es", `https://repo-standards.com/es${english}`],
      ],
      pathname,
    );
  }
  const docs = entries.filter((item) =>
    item.includes("<loc>https://repo-standards.com/docs/"),
  );
  assert.ok(docs.length > 0);
  for (const entry of docs) assert.doesNotMatch(entry, /xhtml:link/);
  for (const file of readdirSync(path.join(output, "docs"), {
    recursive: true,
    encoding: "utf8",
  }).filter((file) => file.endsWith(".html")))
    assert.doesNotMatch(read(`docs/${file}`), /hreflang=/, file);
});

test("every locale's pages use its own social card and translated alt text", () => {
  const cards = {
    en: ["social.png", "A blue road sign reading Repo Standards:"],
    es: ["social-es.png", "Una señal de tráfico azul que dice Repo Standards:"],
    ca: ["social-ca.png", "Un senyal de trànsit blau que diu Repo Standards:"],
  };
  for (const { locale, file } of localePages()) {
    const [image, alt] = cards[locale as keyof typeof cards];
    const meta = metaTags(read(file));
    assert.equal(meta["og:image"], `https://repo-standards.com/${image}`, file);
    assert.ok(meta["og:image:alt"].startsWith(alt), file);
    assert.ok(readFileSync(path.join(output, image)).length > 0, image);
  }
});

test("the English agent surfaces mention the site languages without linking localized pages", () => {
  const llms = read("llms.txt");
  assert.match(
    llms,
    /^The site is also available in Spanish under \/es\/ and in Catalan under \/ca\/\.$/m,
  );
  for (const [, href] of llms.matchAll(/\]\(([^)]+)\)/g)) {
    assert.doesNotMatch(new URL(href).pathname, /^\/(?:es|ca)\//, href);
  }
  const files = readdirSync(output, { recursive: true, encoding: "utf8" });
  assert.ok(!files.some((file) => /^(?:es|ca)\/.*\.md$/.test(file)));
});

test("a page built through the layout is canonical at its own URL", () => {
  const html = read("layout-test/index.html");
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/repo-standards\.com\/layout-test\/"/,
  );
  assert.match(html, /<title>Layout test<\/title>/);
  assert.equal(html.match(BEACON)?.length, 1);
});

test("the built site has each page in English, Spanish and Catalan, with its locale, and no pseudo-locale", () => {
  const files = readdirSync(output, { recursive: true, encoding: "utf8" });
  assert.ok(
    !files.some((file) => /^en-xa(?:\/|$)/i.test(file)),
    "no pseudo-locale route is built",
  );
  const pages = files.filter((file) => file.endsWith(".html"));
  const english = pages.filter((file) => !/^(?:es|ca)\//.test(file));
  for (const locale of ["es", "ca"])
    assert.deepEqual(
      pages
        .filter((file) => file.startsWith(`${locale}/`))
        .map((file) => file.slice(locale.length + 1))
        .sort(),
      english
        .filter(
          (file) =>
            !file.startsWith("docs/") &&
            !["404.html", "layout-test/index.html"].includes(file),
        )
        .sort(),
      `every site page in ${locale}`,
    );
  for (const file of pages) {
    const html = read(file);
    const locale = /^(es|ca)\//.exec(file)?.[1] ?? "en";
    assert.match(html, new RegExp(`<html lang="${locale}"[ >]`), file);
    // the docs, which describe the pseudo-locale, are not localized
    if (!file.startsWith("docs/")) assert.doesNotMatch(html, /[⟦⟧]/, file);
  }
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

test("the How it works page is canonical at its own URL, with its own title and description", () => {
  const html = read("how-it-works/index.html");
  assert.equal(
    html.match(/<link rel="canonical"[^>]*>/g)?.join(),
    '<link rel="canonical" href="https://repo-standards.com/how-it-works/">',
  );
  assert.match(
    html,
    /<title>How Repo Standards works \| Repo Standards<\/title>/,
  );
  const description = /<meta name="description" content="([^"]*)"/.exec(
    html,
  )?.[1];
  assert.ok(description, "the page has a description");
  assert.ok(
    description.length >= 140 && description.length <= 160,
    `about 155 characters, not ${description.length}`,
  );
  assert.equal(html.match(BEACON)?.length, 1);
});

/** The text of each of the page's headings at `level`, in order. */
const headings = (html: string, level: number) =>
  [
    ...html.matchAll(
      new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)</h${level}>`, "g"),
    ),
  ].map((m) => m[1].replace(/<[^>]*>/g, "").trim());

test("the How it works page tells the story, who does what, what fits better and the limits", () => {
  const html = read("how-it-works/index.html");
  assert.deepEqual(headings(html, 1), ["How Repo Standards works"]);
  assert.deepEqual(headings(html, 2), [
    "Every repository, set up its own way",
    "Write the setup down once",
    "Your coding agent applies it",
    "All alike, and kept that way",
    "Who does what",
    "When something else fits better",
    "Current limits",
  ]);
  assert.deepEqual(headings(html, 3), [
    "The CLI",
    "Your coding agent",
    "You",
    "Updates",
  ]);
});

test("each comparison on the How it works page links its tool's documentation", () => {
  const html = read("how-it-works/index.html");
  for (const href of [
    "https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template",
    "https://copier.readthedocs.io/en/stable/",
    "https://copier.readthedocs.io/en/stable/updating/",
    "https://docs.renovatebot.com/modules/manager/copier/",
    "https://github.com/projen/projen",
    "https://nx.dev/docs/features/generate-code",
    "https://nx.dev/docs/features/automate-updating-dependencies",
    "https://github.com/BetaHuhn/repo-file-sync-action",
    "https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file",
    "https://github.com/vercel-labs/skills",
  ])
    assert.ok(html.includes(`href="${href}"`), href);
});

test("the homepage links to the How it works page in its markup, beside the tab", () => {
  assert.match(
    read("index.html"),
    /aria-label="How it works: play a short story"><\/button><a class="story-read" href="\/how-it-works\/">Read how it works<\/a>/,
  );
});

const SOURCES = [
  {
    path: "sources/lutzseverino/repo-canon/",
    title:
      "repo-canon: AGENTS.md template, agent skills and contribution guidelines | Repo Standards",
    description:
      "A ready-made setup to start from: AGENTS.md, agent skills, contribution guidelines, issue and PR templates, and checks your coding agent installs for you.",
    data: {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "repo-canon",
      description:
        "Repository documentation, contribution, agent workflow, and GitHub validation standards",
      codeRepository: "https://github.com/lutzseverino/repo-canon",
      version: "v0.17.0",
      dateModified: "2026-10-19T15:08:01Z",
      url: "https://repo-standards.com/sources/lutzseverino/repo-canon/",
    },
  },
  {
    path: "sources/lutzseverino/repo-standards-example/",
    title:
      "repository-standards-examples: Synthetic service and project-documentation profiles for release acceptance | Repo Standards",
    description:
      "Synthetic service and project-documentation profiles for release acceptance. Installs AGENTS.md, .editorconfig, README.md, 1 agent skill and 2 checks.",
    data: {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "repository-standards-examples",
      description:
        "Synthetic service and project-documentation profiles for release acceptance",
      codeRepository: "https://github.com/lutzseverino/repo-standards-example",
      version: "v3.0.0",
      dateModified: "2026-10-22T17:57:17Z",
      url: "https://repo-standards.com/sources/lutzseverino/repo-standards-example/",
    },
  },
];

/** HTML's escapes in text and attribute values, undone. */
const unescape = (html: string) =>
  html
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

test("each accepted source has a page, and a rejected candidate none", () => {
  const owners = readdirSync(path.join(output, "sources"));
  const pages = owners.flatMap((owner) =>
    readdirSync(path.join(output, "sources", owner), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `sources/${owner}/${entry.name}/`),
  );
  assert.deepEqual(
    pages.sort(),
    SOURCES.map((s) => s.path),
  );
});

for (const source of SOURCES) {
  test(`${source.path} has its own canonical, title, description and JSON-LD`, () => {
    const html = read(`${source.path}index.html`);
    assert.equal(
      html.match(/<link rel="canonical"[^>]*>/g)?.join(),
      `<link rel="canonical" href="https://repo-standards.com/${source.path}">`,
    );
    assert.equal(
      unescape(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ""),
      source.title,
    );
    assert.equal(
      unescape(
        /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "",
      ),
      source.description,
    );
    assert.ok(source.description.length <= 155);
    const scripts = [
      ...html.matchAll(
        /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ];
    assert.equal(scripts.length, 2);
    assert.deepEqual(JSON.parse(scripts[1][1]), source.data);
    assert.equal(html.match(BEACON)?.length, 1);
  });
}

test("each source page offers the source's own prompt and command", async () => {
  const { sources } = await loadCatalogue();
  for (const source of sources) {
    const html = read(`sources/${source.repository}/index.html`);
    const values = [...html.matchAll(/<input\b[^>]*\bvalue="([^"]*)"/g)].map(
      (m) => unescape(m[1]),
    );
    assert.deepEqual(values, [
      installText(source, "prompt"),
      installText(source, "terminal"),
    ]);
    assert.match(values[0], /npx --yes @lutzseverino\/repo-standards adopt /);
    assert.ok(
      html.includes(
        "Anyone can list a source here. Review one before you adopt it.",
      ),
    );
    assert.ok(html.includes(`href="https://github.com/${source.repository}"`));
    assert.ok(html.includes(`href="${source.release.url}"`));
  }
});

test("each source page's release links exactly its version, with the comma touching it", async () => {
  const { sources } = await loadCatalogue();
  const lines: string[] = [];
  for (const locale of LOCALES)
    for (const source of sources) {
      const page = `${locale === "en" ? "" : `${locale}/`}sources/${source.repository}/index.html`;
      const release = read(page).match(
        new RegExp(
          `<dd>([^<]*)<a [^>]*href="${source.release.url}">([^<]*)</a>([^<]*)</dd>`,
        ),
      );
      assert.ok(release, page);
      const [, before, version, after] = release;
      assert.equal(version, source.release.version, page);
      // Whitespace at the edges of the <dd> doesn't render.
      assert.equal(before.trim(), "", page);
      assert.equal(
        unescape(after).trimEnd(),
        `, ${formatDate(source.release.publishedAt, locale)}`,
        page,
      );
      if (source.repository === "lutzseverino/repo-canon")
        lines.push(`${version}${unescape(after).trimEnd()}`);
    }
  assert.deepEqual(lines, [
    "v0.17.0, 19 Oct 2026",
    "v0.17.0, 19 oct 2026",
    "v0.17.0, 19 d’oct. del 2026",
  ]);
});

test("each source page names its whole repository, which a phone can break after each slash", async () => {
  const { sources } = await loadCatalogue();
  for (const source of sources) {
    const html = read(`sources/${source.repository}/index.html`);
    const link = html.match(
      new RegExp(
        `<a [^>]*href="https://github\\.com/${source.repository}">([^]*?)</a>`,
      ),
    );
    assert.ok(link, source.repository);
    const [owner, name] = source.repository.split("/");
    assert.equal(
      link[1].trim(),
      `github.com/<wbr>${owner}/<wbr>${name}`,
      source.repository,
    );
  }
});

test("Repo Canon's page names what it provides in searchers' words", () => {
  const html = read("sources/lutzseverino/repo-canon/index.html");
  const names = [...headings(html, 2), ...headings(html, 3)];
  for (const heading of [
    "AGENTS.md",
    "Agent skills",
    "Contribution guidelines",
    "Issue and PR templates",
    "Checks",
  ])
    assert.ok(names.includes(heading), heading);
});

test("every homepage row links to its source's page, and every source page is in the sitemap", async () => {
  const { sources } = await loadCatalogue();
  const plates = [
    ...read("index.html").matchAll(
      /<a class="[^"]*\bsignpost-plate\b[^"]*" href="([^"]*)"/g,
    ),
  ].map((m) => m[1]);
  assert.deepEqual(
    plates,
    sources.map((s) => `/sources/${s.repository}/`),
  );
  const sitemap = read("sitemap-0.xml");
  for (const source of SOURCES)
    assert.match(
      sitemap,
      new RegExp(`<loc>https://repo-standards\\.com/${source.path}</loc>`),
    );
});

/** The content of each `<meta>` tag in the page, by its property or name. */
const metaTags = (html: string) =>
  Object.fromEntries(
    [
      ...html.matchAll(
        /<meta (?:property|name)="([^"]+)" content="([^"]*)"\s*\/?>/g,
      ),
    ].map((m) => [m[1], m[2]]),
  );

test("the homepage unfurls as itself, with the default social image", () => {
  const html = read("index.html");
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  const meta = metaTags(html);
  assert.equal(canonical, "https://repo-standards.com/");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(meta).filter(([key]) => /^(og|twitter):/.test(key)),
    ),
    {
      "og:type": "website",
      "og:site_name": "Repo Standards",
      "og:title": "Repo Standards: one setup for every repository",
      "og:description":
        "Write your setup down once: agent instructions, docs, templates and checks. Your coding agent applies it to every repository and keeps them in step.",
      "og:url": canonical,
      "og:locale": "en_US",
      "og:locale:alternate": "ca_ES",
      "og:image": "https://repo-standards.com/social.png",
      "og:image:width": "1200",
      "og:image:height": "630",
      "og:image:alt":
        "A blue road sign reading Repo Standards: Write your setup down once. Your coding agent applies it to every repository.",
      "twitter:card": "summary_large_image",
    },
  );
  assert.equal(meta["og:description"], meta.description);
  assert.equal(
    html.match(/<link rel="manifest"[^>]*>/g)?.join(),
    '<link rel="manifest" href="/site.webmanifest">',
  );
});

test("a page that passes its own social image unfurls with it", () => {
  const meta = metaTags(read("layout-test/index.html"));
  assert.equal(meta["og:url"], "https://repo-standards.com/layout-test/");
  assert.equal(meta["og:title"], "Layout test");
  assert.equal(meta["og:image"], "https://repo-standards.com/layout-test.png");
  assert.equal(meta["og:image:width"], "800");
  assert.equal(meta["og:image:height"], "400");
  assert.equal(meta["og:image:alt"], "The layout test's own image.");
});

/** The page's inline scripts, in document order. */
const inlineScripts = (html: string) =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test("the head applies the stored or system theme as the class and the attribute", () => {
  const script = inlineScripts(read("index.html")).find((s) =>
    s.includes("function themes"),
  )!;
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

/* ---------- the site in Spanish and Catalan ---------- */

const SITE_PAGES = [
  "",
  "how-it-works/",
  "sources/lutzseverino/repo-canon/",
  "sources/lutzseverino/repo-standards-example/",
];
const PREFIXES = { en: "", es: "es/", ca: "ca/" } as const;
const localePages = () =>
  Object.entries(PREFIXES).flatMap(([locale, prefix]) =>
    SITE_PAGES.map((page) => ({
      locale,
      page,
      file: `${prefix}${page}index.html`,
    })),
  );

test("every site page opens the visitor's language first in its head, and loads the layout's stylesheet first", () => {
  for (const { file } of localePages()) {
    const html = read(file);
    assert.match(
      html,
      /<head><meta charset="UTF-8"><!--[^>]*--><script>\(\(\) => \{\n {2}const choice = \(function localeChoice\(/,
      file,
    );
    // the layout's stylesheet declares the cascade layers' order, so it
    // must come before the sign's, which use them
    assert.match(
      /<link rel="stylesheet" href="([^"]+)"/.exec(html)?.[1] ?? "",
      /^\/_astro\/base\.[\w-]+\.css$/,
      file,
    );
  }
});

test("a built page's language script opens the same page in the saved language", () => {
  const script = inlineScripts(read("es/how-it-works/index.html")).find((s) =>
    s.includes("function localeChoice"),
  )!;
  const run = (
    pathname: string,
    stored: string | null,
    languages: string[],
  ) => {
    const replaced: string[] = [];
    vm.runInNewContext(script, {
      window: { localStorage: { getItem: () => stored } },
      URLSearchParams,
      location: {
        pathname,
        search: "",
        hash: "",
        replace: (to: string) => replaced.push(to),
      },
      navigator: { languages },
    });
    return replaced;
  };
  assert.deepEqual(run("/es/how-it-works/", "ca", []), ["/ca/how-it-works/"]);
  assert.deepEqual(run("/es/how-it-works/", "en", []), ["/how-it-works/"]);
  assert.deepEqual(run("/how-it-works/", null, ["es-ES"]), [
    "/es/how-it-works/",
  ]);
  assert.deepEqual(run("/es/how-it-works/", null, ["en"]), []);
});

test("every site page's nav has a language menu naming the page's language, which leads to the same page in each", () => {
  const names = {
    en: "Language: English",
    es: "Idioma: Español",
    ca: "Llengua: Català",
  } as const;
  for (const { locale, page, file } of localePages()) {
    const html = read(file);
    const triggers = [
      ...html.matchAll(
        /<button [^>]*data-slot="dropdown-menu-trigger"[^>]*aria-label="([^"]*)"/g,
      ),
    ].map((m) => m[1]);
    assert.deepEqual(triggers, [names[locale as keyof typeof names]], file);
    const alternates = Object.entries(PREFIXES)
      .map(
        ([other, prefix]) =>
          `&quot;${other}&quot;:[0,&quot;/${prefix}${page}&quot;]`,
      )
      .join(",");
    assert.ok(
      html.includes(`&quot;alternates&quot;:[0,{${alternates}}]`),
      `${file} links its own page in every language`,
    );
  }
});

test("in Spanish and Catalan the nav's Docs link carries an EN badge, and in English none", () => {
  for (const { locale, file } of localePages()) {
    const html = read(file);
    const link = /<a [^>]*href="\/docs\/"[^>]*>[\s\S]*?<\/a>/.exec(html)![0];
    if (locale === "en") {
      assert.doesNotMatch(link, /hreflang|data-slot="badge"/i, file);
      continue;
    }
    assert.match(link, /hreflang="en"/i, file);
    assert.match(
      link,
      /<span data-slot="badge"[^>]*aria-hidden="true"[^>]*>EN<\/span>/,
      file,
    );
    assert.match(
      link,
      locale === "es" ? /\(en inglés\)/ : /\(en anglès\)/,
      file,
    );
  }
});

test("Spanish and Catalan pages show none of the English catalogs' or prose's text", () => {
  const translations = parseTranslations(
    readTranslationFiles(site("src/i18n")),
  );
  const english = translations.en;
  // whole messages of two words or more without variables, and the English
  // prose's headings and sentences
  const messages = Object.entries(english.messages)
    .filter(
      ([, message]) =>
        typeof message === "string" &&
        !message.includes("{") &&
        message.includes(" "),
    )
    .map(([id, message]) => ({ id, text: message as string }));
  const prose = Object.values(english.prose).flatMap((text) =>
    text
      .split(/\n#+ |\.\s/)
      .map((part) => part.replace(/\n/g, " ").trim())
      .filter((part) => /^[A-Z][a-z]+ [a-z]+ [a-z]+/.test(part))
      .map((part) => part.split(" ").slice(0, 5).join(" ")),
  );
  for (const { locale, file } of localePages()) {
    if (locale === "en") continue;
    const html = unescape(read(file));
    for (const { id, text } of messages) {
      const own = translations[locale].messages[id] as { message: string };
      if (own.message === text) continue;
      assert.ok(!html.includes(text), `${file} shows ${id}: ${text}`);
    }
    for (const words of prose)
      assert.ok(!html.includes(words), `${file} shows the prose ${words}`);
  }
});

test("each How it works page's links within itself reach one of its headings", () => {
  for (const prefix of Object.values(PREFIXES)) {
    const html = read(`${prefix}how-it-works/index.html`);
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map((m) =>
      decodeURIComponent(m[1]),
    );
    assert.ok(fragments.length > 0, prefix);
    for (const fragment of fragments)
      assert.ok(ids.has(fragment), `${prefix}how-it-works/ → #${fragment}`);
  }
});

test("each How it works page gives its sections the English IDs, so a link or redirect to a section opens it in every locale", () => {
  const ids = (file: string) =>
    [...read(file).matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1]);
  const english = ids("how-it-works/index.html");
  assert.ok(english.includes("who-does-what"));
  for (const prefix of ["es/", "ca/"])
    assert.deepEqual(ids(`${prefix}how-it-works/index.html`), english, prefix);
  // the redirect keeps the fragment: a Spanish browser's first visit to
  // English's section lands on the same section in Spanish
  const script = inlineScripts(read("how-it-works/index.html")).find((s) =>
    s.includes("function localeChoice"),
  )!;
  const replaced: string[] = [];
  vm.runInNewContext(script, {
    window: { localStorage: { getItem: () => null } },
    URLSearchParams,
    location: {
      pathname: "/how-it-works/",
      search: "",
      hash: "#who-does-what",
      replace: (to: string) => replaced.push(to),
    },
    navigator: { languages: ["es-ES"] },
  });
  assert.deepEqual(replaced, ["/es/how-it-works/#who-does-what"]);
  const [, fragment] = replaced[0].split("#");
  assert.ok(ids("es/how-it-works/index.html").includes(fragment));
});
