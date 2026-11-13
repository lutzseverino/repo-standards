// Node cannot import a Vite query directly. Load the same query seam as Astro.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { prepaint } from "../src/lib/prepaint.ts";

export async function bundledScript(entry: string): Promise<string> {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    plugins: [prepaint()],
    server: { middlewareMode: true, watch: null },
  });
  try {
    const loaded = (await server.ssrLoadModule(
      `/src/prepaint/${entry}.ts?prepaint`,
    )) as { default: string };
    return loaded.default;
  } finally {
    await server.close();
  }
}
