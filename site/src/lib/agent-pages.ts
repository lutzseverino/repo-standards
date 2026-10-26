// Build Markdown alternates from the original docs, or the rendered English
// page's content; a page in another locale shares its English version's.
// Run before sitemap so it also lists the generated agent surfaces.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";
import type { Root } from "mdast";
import { SKIP, visit } from "unist-util-visit";
import { localeChoice } from "../i18n/choice.ts";
import { LOCALES } from "../i18n/locales.ts";
import { markdownPath } from "./agent-paths.ts";
import { docsLink, readDocs } from "./docs-content.ts";

export function agentPages(sitemapUrls: string[]): AstroIntegration {
  let site: URL;
  let repositoryRoot: string;
  return {
    name: "agent-pages",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = new URL(config.site!);
        repositoryRoot = fileURLToPath(new URL("../", config.root));
      },
      "astro:build:done": async ({ dir }) => {
        const output = fileURLToPath(dir);
        const documents = new Map(
          (await readDocs(repositoryRoot)).map((document) => [
            `/${document.id.replace(/\/$/, "")}/`,
            document,
          ]),
        );
        sitemapUrls.length = 0;
        const files = await readdir(output, { recursive: true });
        const { page: localePage } = localeChoice(LOCALES);
        for (const file of files.filter((file) => file.endsWith(".html"))) {
          const pathname = `/${file.replace(/index\.html$/, "")}`;
          if (localePage(pathname).path !== pathname) continue;
          const page = new URL(pathname, site);
          const markdown = markdownPath(pathname);
          const document = documents.get(pathname);
          const tree = document
            ? fromMarkdown(document.markdown, {
                extensions: [gfm()],
                mdastExtensions: [gfmFromMarkdown()],
              })
            : pageContent(await readFile(path.join(output, file), "utf8"));
          visit(tree, (node) => {
            if (
              node.type === "link" ||
              node.type === "definition" ||
              node.type === "image"
            ) {
              node.url = new URL(
                document ? docsLink(node.url, document.original) : node.url,
                page,
              ).href;
            }
          });
          await writeFile(
            path.join(output, markdown),
            toMarkdown(tree, {
              extensions: [gfmToMarkdown()],
            }),
          );
          if (!/^\/(?:404|500)\.html$/.test(pathname))
            sitemapUrls.push(new URL(markdown, site).href);
        }
        for (const file of files.filter(
          (file) =>
            file === "llms.txt" ||
            file === "sources.json" ||
            file.endsWith("/prompt.txt"),
        ))
          sitemapUrls.push(new URL(file, site).href);
      },
    },
  };
}

/** Keep the page's content, without navigation, decoration, controls,
 * asides or footers: the ways to support Repo Standards are for people.
 * Adoption prompts are readonly input values in the rendered pages. */
function pageContent(html: string): Root {
  const tree = fromHtml(html);
  visit(tree, (node, index, parent) => {
    if (
      node.type === "comment" ||
      (node.type === "element" &&
        ([
          "script",
          "style",
          "svg",
          "nav",
          "button",
          "aside",
          "footer",
        ].includes(node.tagName) ||
          node.properties.ariaHidden === "true" ||
          node.properties.hidden === true))
    ) {
      parent!.children.splice(index!, 1);
      return [SKIP, index];
    }
    if (
      node.type === "element" &&
      node.tagName === "input" &&
      node.properties.value
    ) {
      node.tagName = "code";
      node.children = [{ type: "text", value: String(node.properties.value) }];
      node.properties = {};
    }
  });
  let content = tree;
  visit(tree, "element", (node) => {
    if (node.tagName === "main")
      content = { type: "root", children: node.children };
  });
  return toMdast(content) as Root;
}
