import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://repo-standards.lutzseverino.com",
  integrations: [react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
});
