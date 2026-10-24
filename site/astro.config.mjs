import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { agentPages } from "./src/lib/agent-pages.ts";
import { analyticsBeacon } from "./src/lib/analytics.ts";
import { remarkDocs } from "./src/lib/docs-content.ts";

const agentUrls = [];

export default defineConfig({
  site: "https://repo-standards.com",
  prefetch: false,
  integrations: [
    react(),
    agentPages(agentUrls),
    sitemap({ customPages: agentUrls }),
    starlight({
      title: "Repo Standards",
      components: {
        Head: "./src/components/docs/Head.astro",
        SiteTitle: "./src/components/docs/SiteTitle.astro",
        ThemeProvider: "./src/components/docs/ThemeProvider.astro",
        ThemeSelect: "./src/components/docs/ThemeSelect.astro",
      },
      customCss: ["./src/styles/docs.css"],
      head: [analyticsBeacon],
      markdown: { processedDirs: ["../docs/usage", "../docs/adr"] },
      sidebar: [
        { label: "Overview", link: "/docs/" },
        ...(existsSync(
          new URL("../docs/usage/getting-started", import.meta.url),
        )
          ? [
              {
                label: "Getting started",
                items: [
                  {
                    autogenerate: {
                      directory: "../docs/usage/getting-started",
                    },
                  },
                ],
              },
            ]
          : []),
        {
          label: "Guides",
          items: [{ autogenerate: { directory: "../docs/usage/guides" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "../docs/usage/reference" } }],
        },
        {
          label: "Design decisions",
          items: [{ autogenerate: { directory: "../docs/adr" } }],
        },
      ],
    }),
  ],
  markdown: { processor: unified({ remarkPlugins: [remarkDocs] }) },
  vite: { plugins: [tailwindcss()] },
});
