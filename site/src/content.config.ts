import { defineCollection } from "astro/content/config";
import { glob } from "astro/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { docsId, titledDocs } from "./lib/docs-content";

export const collections = {
  docs: defineCollection({
    loader: titledDocs([
      {
        base: "../docs/usage",
        loader: glob({
          base: "../docs/usage",
          pattern: "**/*.md",
          generateId: ({ entry }) => docsId(entry, "docs"),
        }),
      },
      {
        base: "../docs/adr",
        loader: glob({
          base: "../docs/adr",
          pattern: "**/*.md",
          generateId: ({ entry }) => docsId(entry, "docs/decisions"),
        }),
      },
    ]),
    schema: docsSchema(),
  }),
};
