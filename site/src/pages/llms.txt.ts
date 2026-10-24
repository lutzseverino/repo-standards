import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { installText, STARTING_POINT, sourcePath } from "../lib/catalogue";
import { loadCatalogue } from "../lib/load-catalogue";

export const GET: APIRoute = async ({ site }) => {
  const catalogue = await loadCatalogue();
  const docs = await getCollection("docs");
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
        .map(({ id, data }) => link(data.title, `/${id.replace(/\/$/, "")}.md`))
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
      installText(startingPoint, "prompt"),
      `## Overview\n\n${link("Repo Standards", "/index.md")}\n${link("Documentation", "/docs.md")}\n${link("Sources (JSON)", "/sources.json")}`,
      ...sections,
      `## Sources\n\n${catalogue.sources.map((source) => link(source.name, `${sourcePath(source).slice(0, -1)}.md`)).join("\n")}`,
      `## How it works\n\n${link("How Repo Standards works", "/how-it-works.md")}`,
      "",
    ].join("\n\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
};
