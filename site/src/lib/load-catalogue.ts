// Build-time data step. It runs the repository's own CLI, built at the root,
// with `source search --json`, and reads each candidate's `standards.yaml` at
// its released commit for what search does not report: the profile
// descriptions and what each profile installs.
// `SITE_SEARCH_RECORDING` names a directory holding a recording of those
// inputs instead (`page-<n>.json` and `standards/<owner>/<repo>.yaml`), so
// checks build the page through the same transform without the network.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Catalogue, DetailedSource } from "./catalogue.ts";
import { buildCatalogue, type SearchInput } from "./search-report.ts";
import { countAdopters, type AdoptionInput } from "./adopters.ts";
import { readCounts } from "./adopter-counts.ts";

let loaded: Promise<Catalogue<DetailedSource>> | undefined;

export function loadCatalogue(): Promise<Catalogue<DetailedSource>> {
  const recording = process.env.SITE_SEARCH_RECORDING;
  loaded ??= buildCatalogue(sourceSearchInput(recording));
  return loaded;
}

export function sourceSearchInput(
  recording = process.env.SITE_SEARCH_RECORDING,
): SearchInput {
  return recording ? recorded(recording) : live();
}

function live(): SearchInput {
  // pnpm runs the site's scripts from site/, beside the CLI's build output
  const cli = path.resolve(process.cwd(), "../dist/cli.js");
  return {
    counts() {
      const file = process.env.SITE_ADOPTER_COUNTS;
      const run = process.env.GITHUB_RUN_ID;
      const attempt = process.env.GITHUB_RUN_ATTEMPT;
      if (!file || !run || !attempt)
        throw new Error("This build requires this run's public-adopter JSON.");
      return Promise.resolve(
        readCounts(JSON.parse(readFileSync(file, "utf8")), { run, attempt }),
      );
    },
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
    counts: () => recordedCounts(root),
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

type AdoptionRecording = {
  candidates: Record<string, string[]>;
  repositories: Record<
    string,
    NonNullable<Awaited<ReturnType<AdoptionInput["repository"]>>> & {
      selections: Record<string, string | null>;
    }
  >;
};

/** Recorded acquisition inputs, never a saved production count snapshot. */
export function recordedAdoptions(directory: string): AdoptionInput {
  const data = JSON.parse(
    readFileSync(path.join(directory, "adoptions.json"), "utf8"),
  ) as AdoptionRecording;
  return {
    async *candidates() {
      yield* await Promise.resolve(Object.values(data.candidates).flat());
    },
    repository: (repository) =>
      Promise.resolve(data.repositories[repository] ?? null),
    selection: (repository, branch) =>
      Promise.resolve(
        data.repositories[repository]?.selections[branch] ?? null,
      ),
  };
}

async function recordedCounts(directory: string) {
  // The fixture's candidate source keys are recorded inputs too.
  const data = JSON.parse(
    readFileSync(path.join(directory, "adoptions.json"), "utf8"),
  ) as AdoptionRecording;
  return countAdopters(
    Object.keys(data.candidates),
    recordedAdoptions(directory),
  );
}
