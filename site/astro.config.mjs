import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { agentPages } from "./src/lib/agent-pages.ts";
import { analyticsBeacon } from "./src/lib/analytics.ts";
import { settledHydration } from "./src/lib/hydration.ts";
import { remarkDocs } from "./src/lib/docs-content.ts";
import { DEFAULT_LOCALE, LOCALES } from "./src/i18n/locales.ts";

const agentUrls = [];

export default defineConfig({
  site: "https://repo-standards.com",
  // Astro 7 defaults to JSX whitespace rules, which drop the space between
  // inline elements on separate lines, such as the support line's "Repo
  // Standards:" and its first link; keep Astro 6's HTML-aware compression
  compressHTML: true,
  prefetch: false,
  integrations: [
    react(),
    settledHydration(),
    agentPages(agentUrls),
    sitemap({
      customPages: agentUrls,
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: Object.fromEntries(LOCALES.map((locale) => [locale, locale])),
      },
    }),
    starlight({
      title: "Repo Standards",
      components: {
        Footer: "./src/components/docs/Footer.astro",
        Head: "./src/components/docs/Head.astro",
        Header: "./src/components/docs/Header.astro",
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
