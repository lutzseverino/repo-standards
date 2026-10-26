import { fileURLToPath } from "node:url";
import { root } from "astro:config/server";
import type { APIRoute } from "astro";
import { readDocs } from "../lib/docs-content";
import { installText, STARTING_POINT, sourcePath } from "../lib/catalogue";
import { markdownPath } from "../lib/agent-paths";
import { loadCatalogue } from "../lib/load-catalogue";

export const GET: APIRoute = async ({ site }) => {
  const catalogue = await loadCatalogue();
  const docs = await readDocs(fileURLToPath(new URL("../", root)));
  const link = (name: string, pathname: string) =>
    `- [${name}](${new URL(pathname, site).href})`;
  const sections = [
    ["Getting started", "docs/getting-started"],
    ["Guides", "docs/guides"],
    ["Reference", "docs/reference"],
    ["Design decisions", "docs/decisions"],
  ].map(
    ([title, prefix]) =>
      `## ${title}\n\n${docs
        .filter(({ id }) => id === prefix || id.startsWith(`${prefix}/`))
        .sort((a, b) => a.id.localeCompare(b.id, "en"))
        .map(({ id, title }) => link(title, markdownPath(`/${id}/`)))
        .join("\n")}`,
  );
  const startingPoint = catalogue.sources.find(
    (source) => source.repository === STARTING_POINT,
  )!;
  return new Response(
    [
      "# Repo Standards",
      "> Write your setup down once. Your coding agent applies it to every repository.",
      "Repo Standards is the scoped npm package `@lutzseverino/repo-standards`, maintained at https://github.com/lutzseverino/repo-standards and published at https://repo-standards.com/. Repo Canon (https://github.com/lutzseverino/repo-canon) is the ready-made setup to start from.",
      "The site is also available in Spanish under /es/ and in Catalan under /ca/.",
      installText(startingPoint, "prompt"),
      `## Overview\n\n${link("Repo Standards", "/index.md")}\n${link("Documentation", "/docs.md")}\n${link("Sources (JSON)", "/sources.json")}`,
      ...sections,
      `## Sources\n\n${catalogue.sources.map((source) => link(source.name, markdownPath(sourcePath(source)))).join("\n")}`,
      `## How it works\n\n${link("How Repo Standards works", "/how-it-works.md")}`,
      "",
    ].join("\n\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
};
