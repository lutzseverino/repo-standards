// Build-time data step. It runs the repository's own CLI, built at the root,
// with `source search --json`, and reads each candidate's `standards.yaml` at
// its released commit for the profile descriptions search does not report.
// `SITE_SEARCH_RECORDING` names a directory holding a recording of those
// inputs instead (`page-<n>.json` and `standards/<owner>/<repo>.yaml`), so
// checks build the page through the same transform without the network.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Catalogue } from "./catalogue.ts";
import { buildCatalogue, type SearchInput } from "./search-report.ts";

let loaded: Promise<Catalogue> | undefined;

export function loadCatalogue(): Promise<Catalogue> {
  const recording = process.env.SITE_SEARCH_RECORDING;
  loaded ??= buildCatalogue(recording ? recorded(recording) : live());
  return loaded;
}

function live(): SearchInput {
  // pnpm runs the site's scripts from site/, beside the CLI's build output
  const cli = path.resolve(process.cwd(), "../dist/cli.js");
  return {
    page(page) {
      if (!existsSync(cli))
        throw new Error(
          `${cli} is missing. Run pnpm build at the repository root before building the site.`,
        );
      const stdout = execFileSync(
        process.execPath,
        [cli, "source", "search", "--page", String(page), "--json"],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
      return Promise.resolve(JSON.parse(stdout) as unknown);
    },
    async standards(repository, commit) {
      const url = `https://raw.githubusercontent.com/${repository}/${commit}/standards.yaml`;
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Cannot read ${url}: HTTP ${response.status}.`);
      return response.text();
    },
  };
}

function recorded(directory: string): SearchInput {
  const root = path.resolve(directory);
  return {
    page: (page) =>
      Promise.resolve(
        JSON.parse(
          readFileSync(path.join(root, `page-${page}.json`), "utf8"),
        ) as unknown,
      ),
    standards: (repository) =>
      Promise.resolve(
        readFileSync(
          path.join(root, "standards", `${repository}.yaml`),
          "utf8",
        ),
      ),
  };
}
