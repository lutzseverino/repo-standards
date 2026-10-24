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
import { themes } from "../src/lib/theme-core.ts";

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

test("one sitemap lists the homepage, How it works and every docs page", () => {
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
    ["/", "/how-it-works/", ...docsPages().map(({ url }) => url)]
      .map((url) => `https://repo-standards.com${url}`)
      .sort(),
  );
});

test("the homepage keeps its pre-Starlight HTML apart from its links", () => {
  // Fixture build at e95dba8, with the Documentation link changed to /docs/
  // and the How it works link beside the tab added. That page's styles also
  // split the shared layout's stylesheet out of the homepage's. Astro's Home
  // bundle hash and island UID change when the rendered links change.
  const html = read("index.html")
    .replace(/\/_astro\/home\.[\w-]+\.js/g, "/_astro/home.HASH.js")
    .replace(/(<astro-island )uid="[^"]+"/g, '$1uid="HASH"');
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    "ba409265da06128fc6906cf0bfb1bd1495e628af540a78988a5384a32c5989ac",
  );
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
