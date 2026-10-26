import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("the fixture build exposes the homepage and catalogue to crawlers", () => {
  const output = mkdtempSync(
    fileURLToPath(new URL("../node_modules/.site-crawlers-", import.meta.url)),
  );
  try {
    execFileSync(
      process.execPath,
      ["node_modules/astro/bin/astro.mjs", "build", "--outDir", output],
      {
        cwd: new URL("../", import.meta.url),
        env: { ...process.env, SITE_SEARCH_RECORDING: "fixtures/search" },
        timeout: 120_000,
        stdio: "pipe",
      },
    );
    const read = (file: string) =>
      readFileSync(path.join(output, file), "utf8");
    assert.equal(
      read("robots.txt"),
      "User-agent: *\nAllow: /\n\nSitemap: https://repo-standards.com/sitemap-index.xml\n",
    );
    assert.match(
      read("sitemap-index.xml"),
      /<loc>https:\/\/repo-standards\.com\/sitemap-0\.xml<\/loc>/,
    );
    assert.match(
      read("sitemap-0.xml"),
      /<loc>https:\/\/repo-standards\.com\/<\/loc>/,
    );
    assert.match(
      read("sitemap-0.xml"),
      /<loc>https:\/\/repo-standards\.com\/how-it-works\/<\/loc>/,
    );
    const html = read("index.html");
    assert.match(
      html,
      /<link rel="canonical" href="https:\/\/repo-standards\.com\/"/,
    );
    const scripts = [
      ...html.matchAll(
        /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ];
    assert.equal(scripts.length, 2);
    const data = JSON.parse(scripts[1][1]) as {
      "@context": string;
      "@graph": [
        { "@type": string; name: string; url: string; description: string },
        {
          "@type": string;
          itemListElement: {
            "@type": string;
            position: number;
            item: {
              "@type": string;
              name: string;
              description: string;
              codeRepository: string;
              version: string;
              dateModified: string;
            };
          }[];
        },
      ];
    };
    assert.equal(data["@context"], "https://schema.org");
    assert.deepEqual(data["@graph"][0], {
      "@type": "WebSite",
      name: "Repo Standards",
      url: "https://repo-standards.com/",
      description:
        "Write your setup down once: agent instructions, docs, templates and checks. Your coding agent applies it to every repository and keeps them in step.",
    });
    assert.equal(data["@graph"][1]["@type"], "ItemList");
    assert.deepEqual(data["@graph"][1].itemListElement, [
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "SoftwareSourceCode",
          name: "repo-canon",
          description:
            "Repository documentation, contribution, agent workflow, and GitHub validation standards",
          codeRepository: "https://github.com/lutzseverino/repo-canon",
          version: "v0.17.0",
          dateModified: "2026-10-19T15:08:01Z",
        },
      },
      {
        "@type": "ListItem",
        position: 2,
        item: {
          "@type": "SoftwareSourceCode",
          name: "repository-standards-examples",
          description:
            "Synthetic service and project-documentation profiles for release acceptance",
          codeRepository:
            "https://github.com/lutzseverino/repo-standards-example",
          version: "v3.0.0",
          dateModified: "2026-10-22T17:57:17Z",
        },
      },
    ]);
    assert.match(
      html,
      /<title>Repo Standards: one setup for every repository<\/title>/,
    );
    assert.match(
      html,
      /<meta name="description" content="Write your setup down once: agent instructions, docs, templates and checks\. Your coding agent applies it to every repository and keeps them in step\."/,
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
