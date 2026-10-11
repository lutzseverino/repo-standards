import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://repo-standards.lutzseverino.com",
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
