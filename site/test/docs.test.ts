import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { fromMarkdown } from "mdast-util-from-markdown";
import { minifySync } from "vite";
import { visit } from "unist-util-visit";
import { format } from "../src/i18n/format.ts";
import { byName, installText } from "../src/lib/catalogue.ts";
import { loadCatalogue } from "../src/lib/load-catalogue.ts";
import { SUPPORT } from "../src/lib/support.ts";
import { themes } from "../src/lib/theme-core.ts";
import { CODE_BACKGROUND, contrast, palette } from "./docs-palette.ts";

const site = fileURLToPath(new URL("../", import.meta.url));
const repository = path.dirname(site);
let output = "";
const read = (file: string) => readFileSync(path.join(output, file), "utf8");
type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlElement = DefaultTreeAdapterMap["element"];

function elements(node: HtmlNode): HtmlElement[] {
  return [
    ...("tagName" in node ? [node] : []),
    ...("childNodes" in node ? node.childNodes.flatMap(elements) : []),
  ];
}

const text = (node: HtmlNode): string =>
  "value" in node
    ? node.value
    : "childNodes" in node
      ? node.childNodes.map(text).join("")
      : "";
const attribute = (node: HtmlElement, name: string) =>
  node.attrs.find((attr) => attr.name === name)?.value;
const docsPages = () =>
  readdirSync(path.join(output, "docs"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".html"))
    .map((file) => ({
      url: `/docs/${file.replace(/index\.html$/, "")}`,
      nodes: elements(parse(read(`docs/${file}`))),
    }));

before(() => {
  process.env.SITE_SEARCH_RECORDING = path.join(site, "fixtures/search");
  output = mkdtempSync(path.join(site, "node_modules/.site-docs-"));
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
});

after(() => rmSync(output, { recursive: true, force: true }));

test("every published docs page has one useful, page-specific description", () => {
  const descriptions = new Set<string>();
  for (const { url, nodes } of docsPages()) {
    const tags = nodes.filter(
      (node) =>
        node.tagName === "meta" && attribute(node, "name") === "description",
    );
    assert.equal(tags.length, 1, url);
    const description = attribute(tags[0], "content")!;
    assert.ok(description.trim().length > 0 && description.length <= 155, url);
    assert.ok(!descriptions.has(description), `${url}: ${description}`);
    descriptions.add(description);
    assert.doesNotMatch(description, /\[[^\]]+\]\(|https?:\/\/|[`*]/, url);
  }
});

test("llms.txt identifies Repo Standards and links agents to built Markdown", () => {
  const llms = read("llms.txt");
  assert.match(llms, /^# Repo Standards\n/m);
  assert.match(
    llms,
    /^> Write your setup down once\. Your coding agent applies it to every repository\.$/m,
  );
  for (const identity of [
    "@lutzseverino/repo-standards",
    "https://github.com/lutzseverino/repo-standards",
    "https://repo-standards.com/",
    "https://github.com/lutzseverino/repo-canon",
    "Run `npx --yes @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon --json` in this repository and follow what it prints.",
  ])
    assert.ok(llms.includes(identity), identity);
  for (const heading of [
    "Getting started",
    "Guides",
    "Reference",
    "Sources",
    "How it works",
  ])
    assert.ok(llms.includes(`## ${heading}`), heading);
});

test("every HTML page advertises built Markdown and llms.txt", () => {
  assert.match(read("robots.txt"), /User-agent: \*\s+Allow: \//);
  assert.match(
    read("robots.txt"),
    /Sitemap: https:\/\/repo-standards\.com\/sitemap-index\.xml/,
  );
  for (const file of readdirSync(output, {
    recursive: true,
    encoding: "utf8",
  }).filter((file) => file.endsWith(".html"))) {
    const nodes = elements(parse(read(file)));
    const alternates = nodes.filter(
      (node) =>
        node.tagName === "link" && attribute(node, "rel") === "alternate",
    );
    const markdown = alternates.filter(
      (node) => attribute(node, "type") === "text/markdown",
    );
    assert.equal(markdown.length, 1, file);
    const href = attribute(markdown[0], "href")!;
    const pathname = new URL(href, "https://repo-standards.com").pathname;
    assert.ok(read(pathname.slice(1)).trim(), `${file} → ${href}`);
    // a page in another locale shares its English version's
    const page = `/${file.replace(/index\.html$/, "")}`.replace(
      /^\/(?:es|ca)\//,
      "/",
    );
    const expected =
      page === "/"
        ? "/index.md"
        : `${page.replace(/\/$/, "").replace(/\.html$/, "")}.md`;
    assert.equal(pathname, expected, file);
    assert.ok(
      alternates.some(
        (node) =>
          attribute(node, "type") === "text/plain" &&
          attribute(node, "href") === "/llms.txt",
      ),
      file,
    );
  }
  const llms = read("llms.txt");
  for (const [, href] of llms.matchAll(/\]\(([^)]+)\)/g)) {
    const url = new URL(href);
    if (url.origin === "https://repo-standards.com")
      assert.ok(read(url.pathname.slice(1)).trim(), href);
  }
});

test("sources.json and stable prompts describe exactly the accepted catalogue", async () => {
  const catalogue = await loadCatalogue();
  const manifest = JSON.parse(read("sources.json")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(manifest).sort(), [
    "cliVersion",
    "notice",
    "schema",
    "sources",
  ]);
  assert.equal(manifest.schema, "repo-standards/sources/v1");
  assert.equal(manifest.cliVersion, catalogue.cliVersion);
  assert.equal(manifest.notice, format("en", "common.notice"));
  assert.deepEqual(
    manifest.sources,
    [...catalogue.sources].sort(byName).map((source) => ({
      repository: `https://github.com/${source.repository}`,
      name: source.name,
      description: source.description,
      release: source.release,
      commit: source.commit,
      requires: source.requires,
      profiles: source.profiles,
      page: `https://repo-standards.com/sources/${source.repository}/`,
      prompt: `https://repo-standards.com/sources/${source.repository}/prompt.txt`,
    })),
  );
  for (const source of catalogue.sources) {
    assert.equal(
      read(`sources/${source.repository}/prompt.txt`),
      installText(source, "prompt"),
    );
    const markdown = read(`sources/${source.repository}.md`);
    assert.ok(markdown.includes(source.description));
    assert.ok(markdown.includes(source.release.version));
    assert.ok(
      markdown.includes(installText(source, "prompt")),
      "rendered input retains its adoption prompt",
    );
    for (const declaration of source.installs) {
      assert.ok(markdown.includes(declaration.id), declaration.id);
      for (const target of declaration.targets)
        assert.ok(markdown.includes(target), target);
    }
  }
});

test("page Markdown keeps readable content without the sign's decorative copies", () => {
  const home = read("index.md");
  assert.match(
    home,
    /^# Repo Standards Write your setup down once\. Your coding agent applies it to every repository\.$/m,
  );
  assert.equal(home.split("Write your setup down once.").length - 1, 1);
  for (const file of [
    "index.md",
    "sources/lutzseverino/repo-canon.md",
    "how-it-works.md",
  ]) {
    assert.doesNotMatch(read(file), /<!--/);
  }
  assert.match(read("sources/lutzseverino/repo-canon.md"), /^# repo-canon$/m);
});

test("docs Markdown retains source headings and code with absolute links", () => {
  for (const folder of ["docs/usage", "docs/adr"]) {
    for (const file of readdirSync(path.join(repository, folder), {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => file.endsWith(".md"))) {
      const prefix = folder === "docs/usage" ? "docs" : "docs/decisions";
      const slug = file.replace(/(?:^|\/)README\.md$/, "").replace(/\.md$/, "");
      const url = `${prefix}/${slug}`.replace(/\/$/, "");
      const source = readFileSync(path.join(repository, folder, file), "utf8");
      const markdown = read(`${url}.md`);
      const tree = fromMarkdown(markdown);
      assert.ok(markdown.includes(/^# (.+)$/m.exec(source)![0]), file);
      const codes: string[] = [];
      visit(fromMarkdown(source), "code", (node) => {
        codes.push(node.value);
      });
      const actualCodes: string[] = [];
      visit(tree, "code", (node) => {
        actualCodes.push(node.value);
      });
      assert.deepEqual(actualCodes, codes, file);
      visit(tree, (node) => {
        if (
          node.type === "link" ||
          node.type === "definition" ||
          node.type === "image"
        )
          assert.match(node.url, /^[a-z][\w+.-]*:/i, `${file}: ${node.url}`);
      });
    }
  }
  const adopt = read("docs/guides/adopt.md");
  assert.ok(adopt.includes("https://repo-standards.com/docs/"));
  const how = read("how-it-works.md");
  for (const heading of [
    "How Repo Standards works",
    "Who does what",
    "Current limits",
  ])
    assert.ok(how.includes(heading), heading);
});

test("agent surfaces use the scoped npm package in every install instruction", () => {
  for (const file of readdirSync(output, {
    recursive: true,
    encoding: "utf8",
  }).filter(
    (file) =>
      /\.(md|txt|json|html)$/.test(file) && !file.startsWith("pagefind/"),
  )) {
    const content = read(file);
    assert.doesNotMatch(
      content,
      /\b(?:npx|npm\s+(?:install|i|exec))\s+(?:(?:--yes|-y)\s+)?repo-standards(?:\s|@|$)/m,
      file,
    );
  }
});

test("every usage document and design decision is served with its source title", () => {
  for (const [folder, route] of [
    ["docs/usage", "docs"],
    ["docs/adr", "docs/decisions"],
  ]) {
    for (const file of readdirSync(path.join(repository, folder), {
      recursive: true,
      encoding: "utf8",
    })) {
      if (!file.endsWith(".md")) continue;
      const source = readFileSync(path.join(repository, folder, file), "utf8");
      const title = /^# (.+)$/m.exec(source)?.[1];
      const slug = file.replace(/(?:^|\/)README\.md$/, "").replace(/\.md$/, "");
      const html = read(path.join(route, slug, "index.html"));
      const nodes = elements(parse(html));
      const headings = nodes.filter((node) => node.tagName === "h1");
      assert.equal(headings.length, 1, file);
      assert.equal(text(headings[0]), title, file);
      assert.equal(
        text(nodes.find((node) => node.tagName === "title")!),
        `${title} | Repo Standards`,
      );
    }
  }
});

test("docs links reach built pages and fragments or the original files on GitHub", () => {
  const pages = new Map(docsPages().map(({ url, nodes }) => [url, nodes]));
  pages.set("/", elements(parse(read("index.html"))));
  const failures: string[] = [];
  let githubDevelopment = 0;
  for (const [url, nodes] of pages) {
    if (url === "/") continue;
    for (const node of nodes.filter((node) => node.tagName === "a")) {
      const href = attribute(node, "href");
      if (!href) continue;
      const target = new URL(href, `https://repo-standards.com${url}`);
      if (target.origin !== "https://repo-standards.com") {
        if (
          target.href.startsWith(
            "https://github.com/lutzseverino/repo-standards/blob/main/docs/development/",
          )
        )
          githubDevelopment++;
        continue;
      }
      const destination = pages.get(target.pathname);
      if (!destination) {
        failures.push(`${url} → ${href} (page)`);
      } else if (
        target.hash &&
        !destination.some(
          (el) =>
            attribute(el, "id") === decodeURIComponent(target.hash.slice(1)),
        )
      ) {
        failures.push(`${url} → ${href} (fragment)`);
      }
    }
  }
  assert.deepEqual(failures, []);
  assert.ok(githubDevelopment > 0);
});

test("one sitemap lists the homepage, How it works and every source page in each locale, and every docs page", () => {
  const index = read("sitemap-index.xml");
  assert.deepEqual(
    [...index.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]),
    ["https://repo-standards.com/sitemap-0.xml"],
  );
  const urls = [...read("sitemap-0.xml").matchAll(/<loc>(.*?)<\/loc>/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    urls.sort(),
    [
      ...["", "/es", "/ca"].flatMap((prefix) =>
        [
          "/",
          "/how-it-works/",
          "/sources/lutzseverino/repo-canon/",
          "/sources/lutzseverino/repo-standards-example/",
        ].map((page) => `${prefix}${page}`),
      ),
      ...docsPages().map(({ url }) => url),
      ...readdirSync(output, { recursive: true, encoding: "utf8" })
        .filter(
          (file) =>
            (file.endsWith(".md") && file !== "404.md") ||
            file === "llms.txt" ||
            file === "sources.json" ||
            file.endsWith("/prompt.txt"),
        )
        .map((file) => `/${file}`),
    ]
      .map((url) => `https://repo-standards.com${url}`)
      .sort(),
  );
});

// Astro's own inline scripts: the `load` directive and the island element
const ASTRO_RUNTIME = /astro:load|["`]astro-island["`]/;

test("the homepage keeps its fixture HTML with acquired counts and ranking", () => {
  // #345 refreshes the baseline for count tabs and descending adopter order;
  // the Markdown and JSON agent surfaces retain their previous bytes.
  // Fixture build at e95dba8, with the Documentation link changed to /docs/
  // and the How it works link beside the tab added. That page's styles also
  // split the shared layout's stylesheet out of the homepage's. Astro's Home
  // bundle hash and island UID change when the rendered links change.
  // Since #380 the plates link to the source pages, each release carries its
  // URL, the shared stylesheet holds the source pages' utilities too, and
  // they share the adoption dialog's stylesheet, which the build emits apart.
  // The layout's social tags and manifest link came later, and pages.test.ts
  // checks them. So did the Support control, the invitation to support and
  // the footer, which the support tests check, with their inlined styles;
  // the nodes they add renumber React's ids. The control's Dropdown Menu
  // moves the React renderer to a chunk of its own, which changes its hash.
  // Since #404 the text comes from the message catalogs: the Home island's
  // props carry its locale and finished strings, and whole messages change
  // only React's text boundaries. Since #405 the head starts by opening the
  // visitor's language, the nav has a language menu beside the Support
  // control, its controls are grouped so they wrap together on a phone, and
  // the island's props carry the homepage in each language.
  // Since #406 the layout adds language alternates and WebPage JSON-LD;
  // pages.test.ts checks this metadata for every locale.
  // Since #440 the site's shared nav replaces the homepage's own, above the
  // page's column, and pages.test.ts and phone-layout.test.ts check it. The
  // baseline leaves out the nav, and the plate's style joins the support
  // line's inlined styles: without them the homepage is byte for byte what
  // it was at c40551c.
  // Since #448 Astro 7 builds with Vite 8. Vite 8 transpiles the TypeScript
  // that the inline scripts are generated from with Oxc, which prints the
  // same functions with other whitespace, quotes and braces, so each inline
  // script is compared as Vite's minifier prints it; Astro's own island
  // runtime scripts are left out, and the page's stylesheet, minified with
  // Lightning CSS, keeps its rules under another hash. Astro 7's compiler
  // also leaves longer runs of whitespace between some tags, which render as
  // one space on a homepage with no <pre> or <textarea>, and a space between
  // </body> and </html>. The Astro 6 fixture build at 2ba1c50 gives the same
  // hash under these rules.
  // Since #461 the hero sign is drawn as a roadside assembly: its posts take
  // the torch's beam themselves, a clamp holds each post under each plate,
  // the hero plates carry a layer of grime, and the rest script inlines the
  // posts' layout pass, which places the clamps and the plates' shadows and
  // edges. sign-clamps.test.ts checks where the clamps sit.
  // Since #462 each lit plate carries the sun's streak as an element and its
  // glint's sparkle as a layer of its own, so the light moves them instead of
  // drawing them again; the hero's stage is clipped only while the story
  // plays; and the rest script inlines the rig that draws the clamps' faces
  // flat. sign-clamps.test.ts checks the faces against the browser's 3D.
  const html = read("index.html")
    .replace(/<nav\b[\s\S]*?<\/nav>/, "")
    .replace(/<!-- opens the page in the visitor's[\s\S]*?<\/script>/, "")
    .replace(
      /<link rel="alternate" type="text\/markdown" href="\/index\.md">/g,
      "",
    )
    .replace(
      /<link rel="alternate" type="text\/plain" href="\/llms\.txt" title="llms\.txt">/g,
      "",
    )
    .replace(/<meta property="og:[^>]*>|<meta name="twitter:[^>]*>/g, "")
    .replace(/<link rel="alternate" hreflang="[^"]+" href="[^"]+">/g, "")
    .replace(
      /<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@type":"WebPage",[^<]*<\/script>/,
      "",
    )
    .replace('<link rel="manifest" href="/site.webmanifest">', "")
    // Shared font aliases change the base stylesheet hash, and the sign's
    // styles the adoption dialog's stylesheet hash, not homepage markup.
    .replace(/\/_astro\/base\.[\w-]+\.css/g, "/_astro/base.HASH.css")
    .replace(
      /\/_astro\/adoption-dialog\.[\w-]+\.css/g,
      "/_astro/adoption-dialog.HASH.css",
    )
    .replace(/\/_astro\/home\.[\w-]+\.js/g, "/_astro/home.HASH.js")
    .replace(/\/_astro\/client\.[\w-]+\.js/g, "/_astro/client.HASH.js")
    .replace(/(<astro-island )uid="[^"]+"/g, '$1uid="HASH"')
    .replace(
      /(component-export="Home"[^>]*props="\{)&quot;locale&quot;:\[0,&quot;en&quot;\],&quot;alternates&quot;:\[0,\{[^}]*\}\],/,
      "$1",
    )
    .replace(
      /(component-export="Home"[^>]*props="\{[^"]*?),&quot;strings&quot;:[^"]*(\}")/,
      "$1$2",
    )
    // Whole messages and templates change only React's text boundaries.
    .replace(/<!-- -->/g, "")
    .replace(
      /<button type="button"[^>]*data-slot="dropdown-menu-trigger"[\s\S]*?<\/button>/g,
      "",
    )
    .replace(/<aside\b[\s\S]*?<\/aside>/, "")
    .replace(/<footer class="support-footer">[\s\S]*?<\/footer> /, "")
    .replace(/<style>\.support-line[^<]*<\/style>/, "")
    .replace(/_r\d+R_[0-9a-z]+_/g, "_ID_")
    .replace(/\/_astro\/index\.[\w-]+\.css/g, "/_astro/index.HASH.css")
    .replace(/>\s{2,}</g, "> <")
    .replace("</body> </html>", "</body></html>")
    .replace(/<script>([\s\S]*?)<\/script>/g, (_, code: string) =>
      ASTRO_RUNTIME.test(code)
        ? "<script></script>"
        : `<script>${minifySync("inline.js", code, { compress: true, mangle: false }).code}</script>`,
    );
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    "81ebd695c1a64c053e5d2574c799ddd3b775a0b8ae67d5cb932707a7e5a6f27f",
  );
});

test("the homepage exposes real acquired counts in descending order with a lower-bound explanation", () => {
  const nodes = elements(parse(read("index.html")));
  const entries = nodes.filter(
    (node) => attribute(node, "class") === "signpost-entry",
  );
  assert.deepEqual(
    entries.map((node) => attribute(node, "data-source-name")),
    ["repository-standards-examples", "repo-canon"],
  );
  const tabs = entries.map((entry) =>
    elements(entry).find((node) =>
      attribute(node, "class")?.includes("signpost-adopters-tab"),
    )!,
  );
  assert.deepEqual(
    tabs.map((node) => text(node).trim()),
    ["2 public adopters", "1 public adopter"],
  );
  assert.ok(
    nodes.some(
      (node) =>
        node.tagName === "aside" &&
        text(node) === format("en", "home.sources.adopters-explanation"),
    ),
  );
});

test("ranking and count tabs preserve agent surfaces against a build without them", () => {
  const project = mkdtempSync(path.join(site, "node_modules/.agent-baseline-"));
  const fixtureSite = path.join(project, "site");
  try {
    mkdirSync(fixtureSite);
    for (const item of [
      "src",
      "public",
      "astro.config.mjs",
      "tsconfig.json",
      "package.json",
    ])
      cpSync(path.join(site, item), path.join(fixtureSite, item), {
        recursive: true,
      });
    for (const folder of ["usage", "adr"])
      cpSync(
        path.join(repository, "docs", folder),
        path.join(project, "docs", folder),
        { recursive: true },
      );
    symlinkSync(
      path.join(site, "node_modules"),
      path.join(fixtureSite, "node_modules"),
      "dir",
    );
    const config = path.join(fixtureSite, "astro.config.mjs");
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace(
        "export default defineConfig({",
        'export default defineConfig({ cacheDir: "./.cache",',
      ),
    );

    // Use today's source and docs, removing only the human count UI. A
    // deliberate source change to those elements must update this fixture,
    // while unrelated docs, translations and discovery copy need no pins.
    for (const [file, pattern] of [
      [
        "components/sign/signposts.tsx",
        /<aside>\s*<Face\b[^]*?signpost-adopters-tab[^]*?<\/aside>/,
      ],
      [
        "components/home.tsx",
        /<aside\b[^>]*>\s*\{strings\["home\.sources\.adopters-explanation"\]\}\s*<\/aside>/,
      ],
    ] as const) {
      const target = path.join(fixtureSite, "src", file);
      const original = readFileSync(target, "utf8");
      assert.match(
        original,
        pattern,
        `baseline must remove ${file}'s count UI`,
      );
      writeFileSync(target, original.replace(pattern, ""));
    }

    // Zero acquired counts restore the pre-count alphabetical order. This
    // also tests the independent JSON and llms.txt catalogue consumers.
    const recording = path.join(project, "search");
    cpSync(path.join(site, "fixtures/search"), recording, { recursive: true });
    const adoptionFile = path.join(recording, "adoptions.json");
    const adoptions = JSON.parse(readFileSync(adoptionFile, "utf8")) as {
      candidates: Record<string, string[]>;
    };
    for (const source of Object.keys(adoptions.candidates))
      adoptions.candidates[source] = [];
    writeFileSync(adoptionFile, JSON.stringify(adoptions));
    execFileSync(
      process.execPath,
      [path.join(site, "node_modules/astro/bin/astro.mjs"), "build"],
      {
        cwd: fixtureSite,
        env: { ...process.env, SITE_SEARCH_RECORDING: recording },
        timeout: 120_000,
        stdio: "pipe",
      },
    );
    const baseline = path.join(fixtureSite, "dist");
    const nodes = elements(
      parse(readFileSync(path.join(baseline, "index.html"), "utf8")),
    );
    assert.ok(
      !nodes.some((node) =>
        attribute(node, "class")?.includes("signpost-adopters-tab"),
      ),
    );
    assert.ok(
      !nodes.some(
        (node) =>
          node.tagName === "aside" &&
          text(node) === format("en", "home.sources.adopters-explanation"),
      ),
    );
    const names = nodes
      .filter((node) => attribute(node, "class") === "signpost-entry")
      .map((node) => attribute(node, "data-source-name")!);
    assert.deepEqual(
      names,
      [...names].sort((a, b) => a.localeCompare(b, "en")),
    );
    assert.notDeepEqual(
      names,
      elements(parse(read("index.html")))
        .filter((node) => attribute(node, "class") === "signpost-entry")
        .map((node) => attribute(node, "data-source-name")),
      "the baseline must exercise a different list order",
    );

    const agentFiles = (directory: string) =>
      readdirSync(directory, { recursive: true, encoding: "utf8" })
        .filter(
          (file) =>
            file.endsWith(".md") ||
            file === "llms.txt" ||
            file === "sources.json",
        )
        .sort();
    const files = agentFiles(baseline);
    assert.deepEqual(agentFiles(output), files);
    for (const file of files)
      assert.deepEqual(
        readFileSync(path.join(output, file)),
        readFileSync(path.join(baseline, file)),
        file,
      );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

// the header and footer of a built page: the nav on the site's own pages,
// Starlight's header on the docs'
function pageFrame(file: string) {
  const nodes = elements(parse(read(file)));
  return {
    nodes,
    header: nodes.find((node) =>
      file.startsWith("docs/")
        ? node.tagName === "header"
        : node.tagName === "nav",
    )!,
    footers: nodes.filter((node) => node.tagName === "footer"),
  };
}
// the homepage, How it works, a source page and every docs page
const framedPages = () => [
  "index.html",
  "how-it-works/index.html",
  "sources/lutzseverino/repo-canon/index.html",
  ...docsPages().map(({ url }) => `${url.slice(1)}index.html`),
];
const links = (node: HtmlElement) =>
  elements(node)
    .filter((el) => el.tagName === "a")
    .map((el) => attribute(el, "href"));
const SUPPORT_URLS = SUPPORT.map(({ url }) => url);

// the island an element renders in, if any
const islandOf = (nodes: HtmlElement[], node: HtmlElement) =>
  nodes.find(
    (island) =>
      island.tagName === "astro-island" && elements(island).includes(node),
  );

test("every page's header has one Support control, which opens a menu", () => {
  for (const file of framedPages()) {
    const { nodes, header } = pageFrame(file);
    // the site's pages also have the language menu, named by a label, which
    // the docs don't
    const triggers = nodes.filter(
      (node) =>
        node.tagName === "button" &&
        attribute(node, "aria-haspopup") === "menu" &&
        !attribute(node, "aria-label"),
    );
    assert.equal(triggers.length, 1, file);
    const [trigger] = triggers;
    assert.ok(elements(header).includes(trigger), file);
    assert.equal(text(trigger).trim(), "Support", file);
    assert.equal(attribute(trigger, "aria-expanded"), "false", file);
    assert.equal(
      attribute(trigger, "data-slot"),
      "dropdown-menu-trigger",
      file,
    );
    // its own island in the docs' header, else the nav's
    const island = islandOf(nodes, trigger)!;
    assert.equal(
      attribute(island, "component-export"),
      file === "index.html"
        ? "Home"
        : file.startsWith("docs/")
          ? "SupportMenu"
          : "SiteNav",
      file,
    );
    assert.equal(
      attribute(island, "client"),
      attribute(island, "component-export") === "SupportMenu"
        ? "settled"
        : "load",
      file,
    );
  }
});

test("the docs stay English: no language menu, no language script and no EN badge", () => {
  for (const { url, nodes } of docsPages()) {
    const html = read(`${url.slice(1)}index.html`);
    assert.ok(!html.includes("localeChoice"), url);
    assert.ok(
      !nodes.some((node) =>
        /^(?:Language|Idioma|Llengua):/.test(
          attribute(node, "aria-label") ?? "",
        ),
      ),
      url,
    );
    assert.ok(
      !nodes.some((node) => attribute(node, "data-slot") === "badge"),
      url,
    );
  }
});

test("every page's footer links both pages", () => {
  for (const file of framedPages()) {
    const { footers } = pageFrame(file);
    assert.ok(
      footers.some(
        (footer) =>
          links(footer).join() === SUPPORT_URLS.join() &&
          // the space after the label survives the build's compression
          text(footer)
            .replace(/\s+/g, " ")
            .includes(
              `${format("en", "common.support.footer")} ${SUPPORT.map(({ name }) => name).join(" · ")}`,
            ),
      ),
      file,
    );
  }
});

test("the homepage invites support once, with both links", () => {
  const nodes = elements(parse(read("index.html")));
  const main = nodes.find((node) => node.tagName === "main")!;
  // outside the nav's Support control, the one line links each page once
  const nav = nodes.find((node) => node.tagName === "nav")!;
  const outside = elements(main).filter(
    (node) =>
      node.tagName === "a" &&
      SUPPORT_URLS.includes(attribute(node, "href") as never) &&
      !elements(nav).includes(node),
  );
  assert.deepEqual(
    outside.map((node) => attribute(node, "href")),
    SUPPORT_URLS,
  );
  const lines = elements(main).filter(
    (node) =>
      node.tagName === "aside" &&
      links(node).some((link) => SUPPORT_URLS.includes(link as never)),
  );
  assert.equal(lines.length, 1);
  assert.deepEqual(links(lines[0]), SUPPORT_URLS);
  assert.equal(
    text(lines[0]).replace(/\s+/g, " ").trim(),
    "If Repo Standards keeps your repositories in step, you can support its work on GitHub Sponsors or Ko-fi.",
  );
});

test("the agent surfaces leave the support links out", () => {
  for (const file of readdirSync(output, {
    recursive: true,
    encoding: "utf8",
  }).filter((file) => /\.(md|txt|json)$/.test(file))) {
    const content = read(file);
    for (const url of SUPPORT_URLS) assert.ok(!content.includes(url), file);
  }
});

test("docs retain stock search and pagination and load the shared beacon once", () => {
  for (const { url, nodes } of docsPages()) {
    assert.equal(
      nodes.filter(
        (node) =>
          node.tagName === "script" &&
          attribute(node, "src") ===
            "https://static.cloudflareinsights.com/beacon.min.js",
      ).length,
      1,
      url,
    );
    assert.ok(
      nodes.some((node) => node.tagName === "site-search"),
      url,
    );
  }
  const html = read("docs/guides/adopt/index.html");
  assert.match(html, /rel="prev"/);
  assert.match(html, /rel="next"/);
  assert.ok(readdirSync(path.join(output, "pagefind")).includes("pagefind.js"));
});

test("docs headers carry the plain title plate linking home", () => {
  for (const { url, nodes } of docsPages()) {
    const header = nodes.find((node) => node.tagName === "header")!;
    const plates = elements(header).filter((node) =>
      attribute(node, "class")?.split(" ").includes("site-plate"),
    );
    assert.equal(plates.length, 1, url);
    assert.equal(plates[0].tagName, "a", url);
    assert.equal(attribute(plates[0], "href"), "/", url);
    assert.equal(text(plates[0]).trim(), "Repo Standards", url);
  }
});

test("docs code colours meet WCAG 2.2 AA on the code background in both themes", () => {
  // Expressive Code gives each token its night colour as --0 and its day
  // colour as --1, and plain code the theme's foreground.
  const css = readdirSync(path.join(output, "_astro"))
    .filter((file) => /^ec\..*\.css$/.test(file))
    .map((file) => read(`_astro/${file}`))
    .join("");
  const colours = { dark: new Set<string>(), light: new Set<string>() };
  for (const { nodes } of docsPages())
    for (const node of nodes) {
      const style = attribute(node, "style") ?? "";
      for (const [, index, colour] of style.matchAll(/--([01]):([^;]+)/g))
        colours[index === "0" ? "dark" : "light"].add(colour.toLowerCase());
    }
  const foregrounds = [...css.matchAll(/--ec-codeFg:([^;}]+)/g)].map((m) =>
    m[1].toLowerCase(),
  );
  colours.dark.add(foregrounds[0]);
  colours.light.add(foregrounds[1]);
  assert.match(css, /--ec-frm-edBg:var\(--sl-color-gray-6\)/);
  assert.match(css, /--ec-frm-edBg:var\(--sl-color-gray-7\)/);
  assert.match(css, /--ec-frm-trmBg:var\(--sl-color-gray-6\)/);
  assert.match(css, /--ec-frm-trmBg:var\(--sl-color-gray-7\)/);
  const failures: string[] = [];
  for (const theme of ["dark", "light"] as const) {
    const background = palette(theme)(CODE_BACKGROUND[theme]);
    assert.ok(colours[theme].size > 5, theme);
    for (const colour of colours[theme]) {
      assert.match(colour, /^#[0-9a-f]{6}$/, theme);
      const ratio = contrast(colour, background);
      if (ratio < 4.5)
        failures.push(`${theme} ${colour} on ${background}: ${ratio}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("docs and the homepage declare each font face once, from the same files", () => {
  // A page's styles: its linked stylesheets and its inline style elements.
  const faces = (file: string) => {
    const nodes = elements(parse(read(file)));
    const css = [
      ...nodes
        .filter(
          (node) =>
            node.tagName === "link" &&
            attribute(node, "rel") === "stylesheet" &&
            !attribute(node, "media"),
        )
        .map((node) => read(attribute(node, "href")!)),
      ...nodes.filter((node) => node.tagName === "style").map(text),
    ].join("");
    return [...css.matchAll(/@font-face\s*\{[^}]*?url\(([^)]+)\)/g)]
      .map((m) => m[1])
      .sort();
  };
  const homepage = faces("index.html");
  assert.equal(homepage.length, 5);
  assert.equal(new Set(homepage).size, homepage.length);
  assert.ok(homepage.every((url) => url.startsWith("/fonts/d-din-pro/")));
  for (const file of ["docs/index.html", "docs/guides/adopt/index.html"])
    assert.deepEqual(faces(file), homepage, file);
});

test("theme choices survive navigation between the homepage and docs in both directions", () => {
  const storage = new Map<string, string>();
  const navigate = (html: string, systemDark = false, unavailable = false) => {
    const classes = new Set<string>();
    const root = {
      dataset: {} as Record<string, string>,
      classList: {
        contains: (name: string) => classes.has(name),
        toggle: (name: string, on: boolean) =>
          on ? classes.add(name) : classes.delete(name),
      },
    };
    const controls = [0, 1].map(() => ({
      value: "auto",
      change: () => {},
      addEventListener(_event: string, listener: () => void) {
        this.change = listener;
      },
    }));
    let ready = () => {};
    let schemeChanged = () => {};
    const context: Record<string, unknown> = {
      // an English browser on an English page: the language script stays
      location: { pathname: "/", search: "", hash: "" },
      URLSearchParams,
      navigator: { languages: ["en-GB"] },
      document: {
        documentElement: root,
        querySelectorAll: () => controls,
        addEventListener: (_event: string, listener: () => void) => {
          ready = listener;
        },
      },
      localStorage: {
        getItem: (key: string) => {
          if (unavailable) throw new Error("Storage unavailable");
          return storage.get(key) ?? null;
        },
        setItem: (key: string, value: string) => {
          if (unavailable) throw new Error("Storage unavailable");
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          if (unavailable) throw new Error("Storage unavailable");
          storage.delete(key);
        },
      },
      matchMedia: () => ({
        matches: systemDark,
        addEventListener: (_event: string, listener: () => void) => {
          schemeChanged = listener;
        },
      }),
    };
    context.window = context;
    const head = elements(parse(html)).find((node) => node.tagName === "head")!;
    for (const node of elements(head).filter(
      (node) =>
        node.tagName === "script" &&
        !attribute(node, "src") &&
        !attribute(node, "type"),
    )) {
      vm.runInNewContext(text(node), context);
    }
    ready();
    return {
      root,
      classes,
      controls,
      context,
      changeSystem: (dark: boolean) => {
        systemDark = dark;
        schemeChanged();
      },
    };
  };
  const homepage = navigate(read("index.html"));
  // The same handler the homepage toggle calls.
  vm.runInNewContext(
    `(${themes.toString()})().choose("dark")`,
    homepage.context,
  );
  const docs = navigate(read("docs/index.html"));
  assert.equal(docs.root.dataset.theme, "dark");
  assert.ok(docs.classes.has("dark"));
  assert.equal(docs.controls[0].value, "dark");
  docs.controls[0].value = "light";
  docs.controls[0].change();
  assert.equal(docs.root.dataset.theme, "light");
  assert.ok(!docs.classes.has("dark"));
  assert.equal(docs.controls[1].value, "light");
  const returned = navigate(read("index.html"), true);
  assert.equal(returned.root.dataset.theme, "light");
  assert.ok(!returned.classes.has("dark"));
  assert.deepEqual([...storage.keys()], ["theme"]);
  docs.controls[0].value = "auto";
  docs.controls[0].change();
  assert.equal(storage.size, 0);
  const automatic = navigate(read("docs/index.html"), true);
  assert.equal(automatic.root.dataset.theme, "dark");
  assert.equal(automatic.controls[0].value, "auto");
  automatic.changeSystem(false);
  assert.equal(automatic.root.dataset.theme, "light");
  assert.ok(!automatic.classes.has("dark"));
  assert.equal(storage.size, 0);
  assert.doesNotThrow(() => navigate(read("docs/index.html"), true, true));
});

test("nested documents keep their route, title, sidebar and original-file link resolution", () => {
  const project = mkdtempSync(path.join(site, "node_modules/.docs-project-"));
  const fixtureSite = path.join(project, "site");
  try {
    mkdirSync(fixtureSite);
    for (const item of [
      "src",
      "public",
      "astro.config.mjs",
      "tsconfig.json",
      "package.json",
    ]) {
      cpSync(path.join(site, item), path.join(fixtureSite, item), {
        recursive: true,
      });
    }
    // node_modules is shared for dependencies, so give this project's content
    // store its own cache instead of sharing the real site's build state.
    const config = path.join(fixtureSite, "astro.config.mjs");
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace(
        "export default defineConfig({",
        'export default defineConfig({ cacheDir: "./.cache",',
      ),
    );
    for (const folder of ["usage", "adr"]) {
      cpSync(
        path.join(repository, "docs", folder),
        path.join(project, "docs", folder),
        { recursive: true },
      );
    }
    symlinkSync(
      path.join(site, "node_modules"),
      path.join(fixtureSite, "node_modules"),
      "dir",
    );
    const guides = path.join(project, "docs/usage/guides/nested");
    mkdirSync(guides, { recursive: true });
    cpSync(
      new URL("fixtures/docs/guides/nested/deep.md", import.meta.url),
      path.join(guides, "deep.md"),
    );
    const gettingStarted = path.join(project, "docs/usage/getting-started");
    mkdirSync(gettingStarted, { recursive: true });
    writeFileSync(path.join(gettingStarted, "hello.md"), "# First adoption\n");
    execFileSync(
      process.execPath,
      [path.join(site, "node_modules/astro/bin/astro.mjs"), "build"],
      {
        cwd: fixtureSite,
        env: {
          ...process.env,
          SITE_SEARCH_RECORDING: path.join(site, "fixtures/search"),
        },
        timeout: 120_000,
        stdio: "pipe",
      },
    );
    assert.equal(
      readFileSync(path.join(fixtureSite, "dist/sources.json"), "utf8"),
      read("sources.json"),
    );
    const markdown = readFileSync(
      path.join(fixtureSite, "dist/docs/guides/nested/deep.md"),
      "utf8",
    );
    assert.ok(markdown.includes("# Nested guide"));
    for (const href of [
      "https://repo-standards.com/docs/guides/adopt/?from=nested#recovery",
      "https://github.com/lutzseverino/repo-standards/blob/main/docs/development/README.md?from=nested#development",
    ])
      assert.ok(markdown.includes(href), href);
    const nodes = elements(
      parse(
        readFileSync(
          path.join(fixtureSite, "dist/docs/guides/nested/deep/index.html"),
          "utf8",
        ),
      ),
    );
    assert.deepEqual(nodes.filter((node) => node.tagName === "h1").map(text), [
      "Nested guide",
    ]);
    const descriptions = nodes.filter(
      (node) =>
        node.tagName === "meta" && attribute(node, "name") === "description",
    );
    assert.equal(descriptions.length, 1);
    assert.equal(
      attribute(descriptions[0], "content"),
      "Adopt Design decision Development Agent guidance Repository Source",
    );
    const firstAdoption = elements(
      parse(
        readFileSync(
          path.join(fixtureSite, "dist/docs/getting-started/hello/index.html"),
          "utf8",
        ),
      ),
    );
    assert.deepEqual(
      firstAdoption
        .filter(
          (node) =>
            node.tagName === "meta" &&
            attribute(node, "name") === "description",
        )
        .map((node) => attribute(node, "content")),
      ["First adoption — Repo Standards documentation."],
    );
    const links = nodes.filter((node) => node.tagName === "a");
    assert.ok(
      links.some(
        (node) =>
          attribute(node, "href") === "/docs/guides/nested/deep/" &&
          text(node).trim() === "Nested guide",
      ),
    );
    for (const expected of [
      "/docs/guides/adopt/?from=nested#recovery",
      "/docs/decisions/0018-add-a-private-astro-site-workspace/",
      "https://github.com/lutzseverino/repo-standards/blob/main/docs/development/README.md?from=nested#development",
      "https://github.com/lutzseverino/repo-standards/blob/main/docs/agents/project.md",
      "https://github.com/lutzseverino/repo-standards/blob/main/README.md",
      "https://github.com/lutzseverino/repo-standards/blob/main/src/cli.ts",
    ])
      assert.ok(
        links.some((node) => attribute(node, "href") === expected),
        expected,
      );
    const summaries = nodes
      .filter((node) => node.tagName === "summary")
      .map((node) => text(node).trim());
    assert.deepEqual(
      summaries.filter((label) =>
        ["Getting started", "Guides", "Reference", "Design decisions"].includes(
          label,
        ),
      ),
      ["Getting started", "Guides", "Reference", "Design decisions"],
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
