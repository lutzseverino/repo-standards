// Build-time data step. It runs the repository's own CLI, built at the root,
// with `source search --json`, then reads each candidate's `standards.yaml`
// at its released commit for the profile descriptions search does not report.
// `SITE_CATALOGUE` names a catalogue file to use instead, so checks can build
// the page without the network.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { STARTING_POINT, type Catalogue, type Source } from "./catalogue";

type SearchReport = {
  cliVersion: string;
  notice: string;
  incompleteResults: boolean;
  candidates: {
    repository: string;
    commit: string;
    release: { version: string; publishedAt: string };
    source: {
      name: string;
      description: string;
      requires: { "repo-standards": string };
    };
    profiles: string[];
  }[];
  rejected: { repository: string | null; code: string }[];
  nextPage: number | null;
};

type StandardsFile = {
  profiles: Record<string, { description: string }>;
};

const ISSUE = "https://github.com/lutzseverino/repo-standards/issues/347";

let loaded: Promise<Catalogue> | undefined;

export function loadCatalogue(): Promise<Catalogue> {
  loaded ??= load();
  return loaded;
}

async function load(): Promise<Catalogue> {
  const file = process.env.SITE_CATALOGUE;
  const catalogue = file
    ? (JSON.parse(readFileSync(path.resolve(file), "utf8")) as Catalogue)
    : await search();
  if (!catalogue.sources.some((s) => s.repository === STARTING_POINT))
    throw new Error(`The catalogue does not list ${STARTING_POINT}.`);
  return catalogue;
}

function runSearch(page: number): SearchReport {
  // pnpm runs the site's scripts from site/, beside the CLI's build output
  const cli = path.resolve(process.cwd(), "../dist/cli.js");
  if (!existsSync(cli))
    throw new Error(
      `${cli} is missing. Run pnpm build at the repository root before building the site.`,
    );
  const stdout = execFileSync(
    process.execPath,
    [cli, "source", "search", "--page", String(page), "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as SearchReport;
}

async function search(): Promise<Catalogue> {
  const reports = [runSearch(1)];
  for (let next = reports[0].nextPage; next !== null;) {
    const report = runSearch(next);
    reports.push(report);
    next = report.nextPage;
  }
  const candidates = reports.flatMap((r) => r.candidates);
  const rejected = reports.flatMap((r) => r.rejected);
  const start = `https://github.com/${STARTING_POINT}`;

  // Until #347 is fixed, search can come back empty, marked incomplete, or
  // with Repo Canon wrongly rejected. Publishing that would drop sources from
  // the live page, so the build stops and GitHub Pages keeps the last good
  // deploy.
  const problem = reports.some((r) => r.incompleteResults)
    ? "GitHub marked the search results incomplete"
    : candidates.length === 0
      ? "search returned no candidates"
      : !candidates.some((c) => c.repository === start)
        ? `search did not list ${STARTING_POINT}${describeRejection(
            rejected.find((r) => r.repository === start),
          )}`
        : undefined;
  if (problem)
    throw new Error(
      `Source search is unreliable: ${problem}. This is the intermittent result of ${ISSUE}, where repeated searches return nothing, are marked incomplete, or reject a source with a stable release as NO_STABLE_RELEASE. The build stops so GitHub Pages keeps serving the last good deploy; rerun it later.`,
    );

  const sources: Source[] = await Promise.all(
    candidates.map(async (c) => {
      const repository = new URL(c.repository).pathname.slice(1);
      const standards = await standardsFile(repository, c.commit);
      return {
        repository,
        name: c.source.name,
        description: c.source.description,
        release: {
          version: c.release.version,
          publishedAt: c.release.publishedAt,
        },
        requires: c.source.requires["repo-standards"],
        profiles: c.profiles.map((name) => ({
          name,
          description: standards.profiles[name].description,
        })),
      };
    }),
  );
  sources.sort((a, b) =>
    b.release.publishedAt.localeCompare(a.release.publishedAt),
  );
  return {
    cliVersion: reports[0].cliVersion,
    notice: reports[0].notice,
    rejectedCount: rejected.length,
    sources,
  };
}

function describeRejection(rejection: { code: string } | undefined): string {
  return rejection ? ` and rejected it as ${rejection.code}` : "";
}

async function standardsFile(
  repository: string,
  commit: string,
): Promise<StandardsFile> {
  const url = `https://raw.githubusercontent.com/${repository}/${commit}/standards.yaml`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Cannot read ${url}: HTTP ${response.status}.`);
  return parse(await response.text()) as StandardsFile;
}
