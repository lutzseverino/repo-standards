// One query seam for the site's synchronous, inline browser entries. The
// nested build deliberately has no Astro config: it bundles browser modules,
// not a second site, and writes no generated files.
import { build, type Plugin } from "vite";

export function prepaint(): Plugin {
  const query = "?prepaint";
  const prefix = "\0prepaint:";
  let root: string;
  return {
    name: "prepaint",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    async resolveId(id, importer) {
      if (!id.endsWith(query)) return;
      const entry = await this.resolve(id.slice(0, -query.length), importer, {
        skipSelf: true,
      });
      if (!entry) return this.error(`Cannot resolve prepaint entry: ${id}`);
      return prefix + entry.id;
    },
    async load(id) {
      if (!id.startsWith(prefix)) return;
      const result = await build({
        configFile: false,
        root,
        logLevel: "error",
        build: {
          write: false,
          rolldownOptions: {
            input: id.slice(prefix.length),
            output: {
              format: "iife",
              codeSplitting: false,
              // Keep source names for the rest-script identification check.
              minify: { compress: true, mangle: false },
            },
          },
        },
      });
      if (Array.isArray(result) || !("output" in result))
        return this.error("Expected one prepaint bundle");
      const [chunk] = result.output;
      if (
        result.output.length !== 1 ||
        chunk?.type !== "chunk" ||
        chunk.imports.length ||
        chunk.dynamicImports.length ||
        chunk.exports.length
      )
        return this.error(
          "Prepaint entries must bundle into one self-contained classic script",
        );
      for (const dependency of Object.keys(chunk.modules))
        this.addWatchFile(dependency);
      return `export default ${JSON.stringify(chunk.code.trim())};`;
    },
  };
}
