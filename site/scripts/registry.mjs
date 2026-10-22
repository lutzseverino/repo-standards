// Keeps `src/components/ui/` as unmodified shadcn registry output. `add` and
// `update` run the pinned shadcn CLI, then record a checksum of every
// generated file in `registry-manifest.json`; `check` fails when the folder
// no longer matches that record.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const registryRoot = path.join(siteRoot, "src/components/ui");
const manifestPath = path.join(siteRoot, "registry-manifest.json");

function readJson(file) {
  return JSON.parse(readFileSync(path.join(siteRoot, file), "utf8"));
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(file) : [file];
    })
    .filter((file) => /\.tsx?$/.test(file))
    .sort();
}

function currentManifest() {
  return {
    schemaVersion: 1,
    generator: {
      package: "shadcn",
      version: readJson("package.json").devDependencies.shadcn,
    },
    style: readJson("components.json").style,
    files: Object.fromEntries(
      sourceFiles(registryRoot).map((file) => [
        path.relative(siteRoot, file).split(path.sep).join("/"),
        createHash("sha256").update(readFileSync(file)).digest("hex"),
      ]),
    ),
  };
}

function runShadcn(args) {
  const result = spawnSync("pnpm", ["exec", "shadcn", ...args], {
    cwd: siteRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  writeFileSync(
    manifestPath,
    `${JSON.stringify(currentManifest(), null, 2)}\n`,
  );
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "add":
    if (args.length === 0) {
      console.error("Usage: pnpm --dir site ui:add <component...>");
      process.exit(1);
    }
    runShadcn(["add", ...args]);
    break;
  case "update": {
    // refresh every installed component from the pinned CLI's registry
    const installed = sourceFiles(registryRoot).map((file) =>
      path.basename(file).replace(/\.tsx?$/, ""),
    );
    runShadcn(["add", "--overwrite", "--yes", ...installed]);
    break;
  }
  case "check": {
    const recorded = readFileSync(manifestPath, "utf8");
    const current = `${JSON.stringify(currentManifest(), null, 2)}\n`;
    if (recorded !== current) {
      console.error(
        "src/components/ui/ differs from registry-manifest.json. Do not edit generated shadcn source by hand; run pnpm --dir site ui:add or ui:update.",
      );
      process.exit(1);
    }
    break;
  }
  default:
    console.error("Usage: registry.mjs <add <component...> | update | check>");
    process.exit(1);
}
