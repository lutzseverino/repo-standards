// Adapt the repository's plain Markdown to Starlight without changing it.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader } from "astro/loaders";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const folders = [
  ["docs/usage", "docs"],
  ["docs/adr", "docs/decisions"],
] as const;

/** README is the folder's landing page; all other filenames keep their path. */
export function docsId(entry: string, prefix: string): string {
  const slug = entry.replace(/(?:^|\/)README\.md$/, "").replace(/\.md$/, "");
  return [prefix, slug].filter(Boolean).join("/");
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
            const title = /^# (.+)$/m.exec(source)?.[1];
            if (!title) throw new Error(`Missing plain ATX H1 in ${filePath}`);
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
    if (!folders.some(([folder]) => original.startsWith(`${folder}/`))) return;

    const heading = tree.children.findIndex(
      (node) => node.type === "heading" && node.depth === 1,
    );
    if (heading !== -1) tree.children.splice(heading, 1);

    visit(tree, (node) => {
      if (node.type !== "link" && node.type !== "definition") return;
      // Leave schemes, absolute URLs and same-page fragments alone.
      if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(node.url)) return;
      const [, target, suffix = ""] = /^([^?#]*)([\s\S]*)$/.exec(node.url)!;
      if (!target) return;
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(original), decodeURI(target)),
      );
      for (const [folder, prefix] of folders) {
        if (resolved.startsWith(`${folder}/`) && resolved.endsWith(".md")) {
          node.url = `/${docsId(resolved.slice(folder.length + 1), prefix)}/${suffix}`;
          return;
        }
      }
      node.url = `https://github.com/lutzseverino/repo-standards/blob/main/${resolved}${suffix}`;
    });
  };
}
