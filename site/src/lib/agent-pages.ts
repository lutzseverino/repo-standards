// Build Markdown alternates from the original docs, or the rendered page's
// content. Run before sitemap so it also lists the generated agent surfaces.
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
import { markdownPath } from "./agent-paths.ts";
import { docsFolders, docsId, docsLink } from "./docs-content.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));

export function agentPages(sitemapUrls: string[]): AstroIntegration {
  let site: URL;
  return {
    name: "agent-pages",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = new URL(config.site!);
      },
      "astro:build:done": async ({ dir }) => {
        const output = fileURLToPath(dir);
        const documents = new Map<string, string>();
        for (const [folder, prefix] of docsFolders) {
          for (const file of await readdir(path.join(repository, folder), {
            recursive: true,
          })) {
            if (file.endsWith(".md"))
              documents.set(
                `/${docsId(file, prefix).replace(/\/$/, "")}/`,
                `${folder}/${file}`,
              );
          }
        }
        sitemapUrls.length = 0;
        const files = await readdir(output, { recursive: true });
        for (const file of files.filter((file) => file.endsWith(".html"))) {
          const pathname = `/${file.replace(/index\.html$/, "")}`;
          const page = new URL(pathname, site);
          const markdown = markdownPath(pathname);
          const original = documents.get(pathname);
          const tree = original
            ? fromMarkdown(
                await readFile(path.join(repository, original), "utf8"),
                {
                  extensions: [gfm()],
                  mdastExtensions: [gfmFromMarkdown()],
                },
              )
            : pageContent(await readFile(path.join(output, file), "utf8"));
          visit(tree, (node) => {
            if (
              node.type === "link" ||
              node.type === "definition" ||
              node.type === "image"
            ) {
              node.url = new URL(
                original ? docsLink(node.url, original) : node.url,
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

/** Keep the page's content, without navigation, decoration or controls.
 * Adoption prompts are readonly input values in the rendered pages. */
function pageContent(html: string): Root {
  const tree = fromHtml(html);
  visit(tree, (node, index, parent) => {
    if (
      node.type === "comment" ||
      (node.type === "element" &&
        (["script", "style", "svg", "nav", "button"].includes(node.tagName) ||
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
