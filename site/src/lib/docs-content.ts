// Adapt the repository's plain Markdown to Starlight without changing it.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader } from "astro/loaders";
import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";
import type { Root, Nodes, Paragraph } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { visit } from "unist-util-visit";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const docsFolders = [
  ["docs/usage", "docs"],
  ["docs/adr", "docs/decisions"],
] as const;

/** README is the folder's landing page; all other filenames keep their path. */
export function docsId(entry: string, prefix: string): string {
  const slug = entry.replace(/(?:^|\/)README\.md$/, "").replace(/\.md$/, "");
  return [prefix, slug].filter(Boolean).join("/");
}

/** Read the docs at their original paths, without generated Astro types. */
export async function readDocs(repositoryRoot: string): Promise<
  {
    id: string;
    title: string;
    original: string;
    markdown: string;
  }[]
> {
  const documents = [];
  for (const [folder, prefix] of docsFolders) {
    for (const file of await readdir(path.join(repositoryRoot, folder), {
      recursive: true,
    })) {
      if (!file.endsWith(".md")) continue;
      const original = `${folder}/${file}`;
      const markdown = await readFile(
        path.join(repositoryRoot, original),
        "utf8",
      );
      documents.push({
        id: docsId(file, prefix),
        title: docsTitle(markdown, original),
        original,
        markdown,
      });
    }
  }
  return documents;
}

function docsTitle(markdown: string, file: string): string {
  const title = /^# (.+)$/m.exec(markdown)?.[1];
  if (!title) throw new Error(`Missing plain ATX H1 in ${file}`);
  return title;
}

/** Use visible prose, rather than headings, commands or Markdown syntax. */
export function docsDescription(markdown: string, title: string): string {
  const visible = (node: Nodes): string => {
    if (node.type === "text" || node.type === "inlineCode") return node.value;
    if (
      node.type === "break" ||
      (node.type === "html" && /^<br\s*\/?>$/i.test(node.value))
    )
      return " ";
    return "children" in node ? node.children.map(visible).join("") : "";
  };
  const paragraphs = (nodes: Root["children"]): Paragraph[] =>
    nodes.flatMap((node): Paragraph[] => {
      if (node.type === "paragraph") return [node];
      if (node.type === "blockquote") return paragraphs(node.children);
      if (node.type === "html")
        return paragraphs(
          (
            toMdast(fromHtml(node.value, { fragment: true })) as Root
          ).children.filter((child) => child.type !== "html"),
        );
      return [];
    });
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const prose = paragraphs(tree.children)
    .map((node) => visible(node).replace(/\s+/g, " ").trim())
    .map((text) =>
      text.replace(
        /^(?:Status\s*:|Amends\b|Supersedes\b)[^.]*\.(?:\s+|$)/i,
        "",
      ),
    )
    .find(
      (text) => text && !/^(?:Status\s*:|Amends\b|Supersedes\b)/i.test(text),
    );
  const description = prose ?? `${title} — Repo Standards documentation.`;
  if (description.length <= 155) return description;
  const words = description.slice(0, 155).split(" ");
  words.pop();
  return `${words.join(" ") || description.slice(0, 154)}…`;
}

/** Supply metadata before schema validation, and keep each glob's cleanup
 * restricted to its own entries in the combined docs collection. */
export function titledDocs(
  loaders: { loader: Loader; base: string }[],
): Loader {
  return {
    name: "repository-docs",
    async load(context) {
      for (const { loader, base } of loaders) {
        await loader.load({
          ...context,
          // Include derived metadata so an existing content cache refreshes
          // when the adapter changes, even if the Markdown hasn't changed.
          generateDigest: (contents) =>
            context.generateDigest({
              contents,
              description:
                typeof contents === "string"
                  ? docsDescription(contents, "")
                  : "",
            }),
          store: {
            ...context.store,
            keys: () =>
              context.store
                .entries()
                .filter(([, entry]) => entry.filePath?.startsWith(`${base}/`))
                .map(([id]) => id),
          },
          async parseData({ filePath, data, ...entry }) {
            const source = await readFile(filePath!, "utf8");
            const title = docsTitle(source, filePath!);
            return context.parseData({
              ...entry,
              filePath,
              data: {
                ...data,
                title,
                description: docsDescription(source, title),
              },
            });
          },
        });
      }
    },
  };
}

export function remarkDocs() {
  return (tree: Root, file: { path: string }) => {
    const original = path.relative(repository, file.path);
    if (!docsFolders.some(([folder]) => original.startsWith(`${folder}/`)))
      return;

    const heading = tree.children.findIndex(
      (node) => node.type === "heading" && node.depth === 1,
    );
    if (heading !== -1) tree.children.splice(heading, 1);

    visit(tree, (node) => {
      if (node.type !== "link" && node.type !== "definition") return;
      node.url = docsLink(node.url, original);
    });
  };
}

/** Resolve a Markdown link against the original repository document. */
export function docsLink(url: string, original: string): string {
  // Leave schemes, absolute URLs and same-page fragments alone.
  if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(url)) return url;
  const [, target, suffix = ""] = /^([^?#]*)([\s\S]*)$/.exec(url)!;
  if (!target) return url;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(original), decodeURI(target)),
  );
  for (const [folder, prefix] of docsFolders) {
    if (resolved.startsWith(`${folder}/`) && resolved.endsWith(".md")) {
      return `/${docsId(resolved.slice(folder.length + 1), prefix)}/${suffix}`;
    }
  }
  return `https://github.com/lutzseverino/repo-standards/blob/main/${resolved}${suffix}`;
}
