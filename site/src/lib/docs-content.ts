// Adapt the repository's plain Markdown to Starlight without changing it.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader } from "astro/loaders";
import type { Root } from "mdast";
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

/** Supply the H1 before schema validation, and keep each glob's cleanup
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
              data: { ...data, title },
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
