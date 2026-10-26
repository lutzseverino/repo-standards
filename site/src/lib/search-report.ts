// Turns the CLI's `source search --json` pages and each candidate's
// `standards.yaml` into the site's catalogue. The build reads them live;
// checks read a recording of the same inputs. Either way they pass through
// here, so a change in the CLI's report fails every build, not only Deploy.
import { parse } from "yaml";
import {
  STARTING_POINT,
  type Catalogue,
  type Declaration,
  type DetailedSource,
} from "./catalogue.ts";

/** Where the search pages and standards files come from. */
export type SearchInput = {
  counts(): Promise<Record<string, number>>;
  /** One page of `source search --json`, as parsed JSON. */
  page(page: number): Promise<unknown>;
  /** A candidate's `standards.yaml` at its released commit. */
  standards(repository: string, commit: string): Promise<string>;
};

type Candidate = {
  repository: string;
  commit: string;
  release: { version: string; publishedAt: string; url: string };
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

export async function buildCatalogue(
  input: SearchInput,
): Promise<Catalogue<DetailedSource>> {
  const reports = await searchReports(input);
  const counts = await input.counts();

  const sources: DetailedSource[] = await Promise.all(
    reports
      .flatMap((r) => r.candidates)
      .map(async (c) => {
        const repository = c.repository.slice(GITHUB.length);
        const publicAdopters = counts[repository.toLowerCase()];
        if (!Number.isSafeInteger(publicAdopters) || publicAdopters < 0)
          throw new Error(
            `Missing or invalid public-adopter count for ${repository}.`,
          );
        return {
          repository,
          publicAdopters,
          name: c.source.name,
          description: c.source.description,
          commit: c.commit,
          release: c.release,
          requires: c.source.requires,
          ...readStandards(
            await input.standards(repository, c.commit),
            repository,
            c.profiles,
          ),
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

/** The producer discovers the same eligible sources as the build. If search
 * changes between the two reads, an uncounted source stops the build. */
export async function searchRepositories(
  input: SearchInput,
): Promise<string[]> {
  return (await searchReports(input)).flatMap((r) =>
    r.candidates.map((c) => c.repository.slice(GITHUB.length)),
  );
}

async function searchReports(input: SearchInput): Promise<SearchReport[]> {
  const reports = [parseSearchReport(await input.page(1))];
  for (let next = reports[0].nextPage; next !== null;) {
    const report = parseSearchReport(await input.page(next));
    reports.push(report);
    next = report.nextPage;
  }
  checkSearch(reports);

  return reports;
}

/** Most observed public adopters first; names break ties. */
function byListOrder(a: DetailedSource, b: DetailedSource): number {
  return (
    b.publicAdopters - a.publicAdopters || a.name.localeCompare(b.name, "en")
  );
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
          url: text(release.url, `${at}.release.url`),
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

/** The listed profiles' descriptions, which search does not report, and
 * what the profiles install. Each profile resolves as the author format
 * resolves it: a profile's declaration replaces the default with its ID, or
 * excludes it with `exclude: true`. A declaration that resolves alike in
 * several profiles is listed once with all of them. */
function readStandards(
  yaml: string,
  repository: string,
  names: string[],
): Pick<DetailedSource, "profiles" | "installs"> {
  const where = `${repository}'s standards.yaml`;
  const root = record(parse(yaml), where);
  const defaults = record(
    record(root.defaults, `${where} defaults`).declarations,
    `${where} defaults declarations`,
  );
  const profiles = record(root.profiles, `${where} profiles`);
  const installs = new Map<string, Declaration>();
  const listed = names.map((name) => {
    if (profiles[name] === undefined)
      throw new Error(`${where} has no profile ${name}.`);
    const at = `${where} profile ${name}`;
    const profile = record(profiles[name], at);
    const resolved = {
      ...defaults,
      ...record(profile.declarations, `${at} declarations`),
    };
    for (const [id, value] of Object.entries(resolved)) {
      const fields = record(value, `${at} declaration ${id}`);
      if (fields.exclude === true) continue;
      const found = declaration(id, fields, `${where} declaration ${id}`);
      const key = JSON.stringify(found);
      const known = installs.get(key);
      if (known) known.profiles.push(name);
      else installs.set(key, { ...found, profiles: [name] });
    }
    return {
      name,
      description: text(profile.description, `${at} description`),
    };
  });
  return {
    profiles: listed,
    // the author format orders resolved declarations by ID
    installs: [...installs.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
  };
}

/** A declaration's kind, what it installs or governs, and its checks. */
function declaration(
  id: string,
  fields: Record<string, unknown>,
  at: string,
): Omit<Declaration, "profiles"> {
  const checks =
    fields.checks === undefined
      ? []
      : list(fields.checks, `${at} checks`).map((check, i) =>
          text(record(check, `${at} checks[${i}]`).id, `${at} checks[${i}] id`),
        );
  const kind = text(fields.kind, `${at} kind`);
  switch (kind) {
    case "file":
      return {
        id,
        kind,
        targets: [text(fields.target, `${at} target`)],
        checks,
      };
    case "skill":
      // an exact skill installs the whole `.agents/skills/<name>`
      return {
        id,
        kind,
        targets: [`.agents/skills/${text(fields.name, `${at} name`)}/`],
        checks,
      };
    case "repository": {
      // without explicit targets, each project discovers the scope
      if (fields.targets === undefined)
        return { id, kind, targets: [], checks };
      const targets = record(fields.targets, `${at} targets`);
      return {
        id,
        kind,
        targets: [
          ...list(targets.paths, `${at} targets paths`).map((p, i) =>
            text(p, `${at} targets paths[${i}]`),
          ),
          ...list(targets.directories, `${at} targets directories`).map(
            (d, i) => `${text(d, `${at} targets directories[${i}]`)}/`,
          ),
        ],
        checks,
      };
    }
    default:
      throw new Error(
        `${at} has the kind ${kind}, which the site does not know. Update the site's data step to the author format.`,
      );
  }
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
