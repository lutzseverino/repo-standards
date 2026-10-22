// Turns the CLI's `source search --json` pages and each candidate's
// `standards.yaml` into the homepage's catalogue. The build reads them live;
// checks read a recording of the same inputs. Either way they pass through
// here, so a change in the CLI's report fails every build, not only Deploy.
import { parse } from "yaml";
import { STARTING_POINT, type Catalogue, type Source } from "./catalogue.ts";

/** Where the search pages and standards files come from. */
export type SearchInput = {
  /** One page of `source search --json`, as parsed JSON. */
  page(page: number): Promise<unknown>;
  /** A candidate's `standards.yaml` at its released commit. */
  standards(repository: string, commit: string): Promise<string>;
};

type Candidate = {
  repository: string;
  commit: string;
  release: { version: string; publishedAt: string };
  source: { name: string; description: string; requires: string };
  profiles: string[];
};

type SearchReport = {
  cliVersion: string;
  notice: string;
  incompleteResults: boolean;
  candidates: Candidate[];
  rejected: { repository: string | null; code: string }[];
  nextPage: number | null;
};

const ISSUE = "https://github.com/lutzseverino/repo-standards/issues/347";
const GITHUB = "https://github.com/";

export async function buildCatalogue(input: SearchInput): Promise<Catalogue> {
  const reports = [parseSearchReport(await input.page(1))];
  for (let next = reports[0].nextPage; next !== null;) {
    const report = parseSearchReport(await input.page(next));
    reports.push(report);
    next = report.nextPage;
  }
  checkSearch(reports);

  const sources: Source[] = await Promise.all(
    reports
      .flatMap((r) => r.candidates)
      .map(async (c) => {
        const repository = c.repository.slice(GITHUB.length);
        const descriptions = profileDescriptions(
          await input.standards(repository, c.commit),
          repository,
        );
        return {
          repository,
          name: c.source.name,
          description: c.source.description,
          release: c.release,
          requires: c.source.requires,
          profiles: c.profiles.map((name) => {
            const description = descriptions[name];
            if (description === undefined)
              throw new Error(
                `${repository}'s standards.yaml has no description for its profile ${name}.`,
              );
            return { name, description };
          }),
        };
      }),
  );
  sources.sort(byListOrder);
  return {
    cliVersion: reports[0].cliVersion,
    notice: reports[0].notice,
    rejectedCount: reports.reduce((n, r) => n + r.rejected.length, 0),
    sources,
  };
}

/** The list's order. Its key is the adopter count, which does not exist
 * yet (#345); until then the list is alphabetical by display name, neutral
 * and stable. Repo Canon is not pinned: the sign above already features it. */
function byListOrder(a: Source, b: Source): number {
  return a.name.localeCompare(b.name, "en");
}

/** Until #347 is fixed, search can come back empty, marked incomplete, or
 * with Repo Canon wrongly rejected. Publishing that would drop sources from
 * the live page, so the build stops and GitHub Pages keeps the last good
 * deploy. */
function checkSearch(reports: SearchReport[]) {
  const candidates = reports.flatMap((r) => r.candidates);
  const start = `${GITHUB}${STARTING_POINT}`;
  const rejection = reports
    .flatMap((r) => r.rejected)
    .find((r) => r.repository === start);
  const problem = reports.some((r) => r.incompleteResults)
    ? "GitHub marked the search results incomplete"
    : candidates.length === 0
      ? "search returned no candidates"
      : !candidates.some((c) => c.repository === start)
        ? `search did not list ${STARTING_POINT}${rejection ? ` and rejected it as ${rejection.code}` : ""}`
        : undefined;
  if (problem)
    throw new Error(
      `Source search is unreliable: ${problem}. This is the intermittent result of ${ISSUE}, where repeated searches return nothing, are marked incomplete, or reject a source with a stable release as NO_STABLE_RELEASE. The build stops so GitHub Pages keeps serving the last good deploy; rerun it later.`,
    );
}

/** Checks the report's shape, so a renamed or missing field fails loudly
 * instead of silently switching a guard off. */
function parseSearchReport(value: unknown): SearchReport {
  const report = record(value, "report");
  return {
    cliVersion: text(report.cliVersion, "cliVersion"),
    notice: text(report.notice, "notice"),
    incompleteResults: flag(report.incompleteResults, "incompleteResults"),
    candidates: list(report.candidates, "candidates").map((item, i) => {
      const at = `candidates[${i}]`;
      const c = record(item, at);
      const release = record(c.release, `${at}.release`);
      const source = record(c.source, `${at}.source`);
      const requires = record(source.requires, `${at}.source.requires`);
      const repository = text(c.repository, `${at}.repository`);
      if (!repository.startsWith(GITHUB))
        throw shapeError(`${at}.repository`, "a GitHub URL");
      return {
        repository,
        commit: text(c.commit, `${at}.commit`),
        release: {
          version: text(release.version, `${at}.release.version`),
          publishedAt: text(release.publishedAt, `${at}.release.publishedAt`),
        },
        source: {
          name: text(source.name, `${at}.source.name`),
          description: text(source.description, `${at}.source.description`),
          requires: text(
            requires["repo-standards"],
            `${at}.source.requires.repo-standards`,
          ),
        },
        profiles: list(c.profiles, `${at}.profiles`).map((p, j) =>
          text(p, `${at}.profiles[${j}]`),
        ),
      };
    }),
    rejected: list(report.rejected, "rejected").map((item, i) => {
      const r = record(item, `rejected[${i}]`);
      return {
        repository:
          r.repository === null
            ? null
            : text(r.repository, `rejected[${i}].repository`),
        code: text(r.code, `rejected[${i}].code`),
      };
    }),
    nextPage:
      report.nextPage === null ? null : whole(report.nextPage, "nextPage"),
  };
}

function profileDescriptions(
  yaml: string,
  repository: string,
): Record<string, string | undefined> {
  const where = `${repository}'s standards.yaml`;
  const profiles = record(
    record(parse(yaml), where).profiles,
    `${where} profiles`,
  );
  return Object.fromEntries(
    Object.entries(profiles).map(([name, profile]) => [
      name,
      text(
        record(profile, `${where} profile ${name}`).description,
        `${where} profile ${name} description`,
      ),
    ]),
  );
}

function shapeError(path: string, expected: string) {
  return new Error(
    `The CLI's source search report does not have the expected shape: ${path} is not ${expected}. Update the site's data step to the CLI's report.`,
  );
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw shapeError(path, "an object");
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw shapeError(path, "an array");
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") throw shapeError(path, "a string");
  return value;
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw shapeError(path, "a boolean");
  return value;
}

function whole(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value)) throw shapeError(path, "a whole number");
  return value as number;
}
