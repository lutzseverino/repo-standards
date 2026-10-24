// The site's standards sources, as the build reads them from source search.
// Shared by the build and the browser, so it holds no Node.js code.

export type Profile = {
  name: string;
  description: string;
};

export type Source = {
  /** `owner/repo` on GitHub. */
  repository: string;
  name: string;
  description: string;
  /** The released commit, which pages and agents pin to. */
  commit: string;
  /** The latest stable release, with its page on GitHub. */
  release: { version: string; publishedAt: string; url: string };
  requires: string;
  profiles: Profile[];
};

/** One declaration of a source's `standards.yaml` at its released commit, as
 * the profiles listed in `profiles` resolve it. */
export type Declaration = {
  id: string;
  kind: "file" | "skill" | "repository";
  /** The paths it installs or governs, a directory ending in `/`. Empty for
   * repository guidance whose scope each project discovers. */
  targets: string[];
  /** The IDs of its checks. */
  checks: string[];
  profiles: string[];
};

/** A source with what it installs, which only its own page shows. */
export type DetailedSource = Source & { installs: Declaration[] };

export type Catalogue<S extends Source = Source> = {
  cliVersion: string;
  notice: string;
  /** Repositories with the topic that search left out. */
  rejectedCount: number;
  sources: S[];
};

/** The source the sign at the top of the page points to. */
export const STARTING_POINT = "lutzseverino/repo-canon";

/** The site's notice. It says why a listing is no endorsement: any
 * repository with the topic and a stable release is listed. */
export const NOTICE =
  "Anyone can list a source here. Review one before you adopt it.";

export function repositoryUrl(source: Source): string {
  return `https://github.com/${source.repository}`;
}

/** The source's own page on the site. */
export function sourcePath(source: Source): string {
  return `/sources/${source.repository}/`;
}

/** A source as the list shows it, without what it installs, which only its
 * own page shows, so a page does not ship it to the browser. */
export function listing({
  repository,
  name,
  description,
  commit,
  release,
  requires,
  profiles,
}: Source): Source {
  return { repository, name, description, commit, release, requires, profiles };
}

/** The catalogue as the homepage's list shows it. */
export function listed(catalogue: Catalogue<DetailedSource>): Catalogue {
  return { ...catalogue, sources: catalogue.sources.map(listing) };
}

export type InstallMode = "prompt" | "terminal";

/** The README's canonical adoption sentence, as an agent prompt or a terminal
 * command. */
export function installText(source: Source, mode: InstallMode): string {
  const url = repositoryUrl(source);
  return mode === "prompt"
    ? `Run \`npx --yes @lutzseverino/repo-standards adopt ${url} --json\` in this repository and follow what it prints.`
    : `npx @lutzseverino/repo-standards adopt ${url}`;
}

export function matches(source: Source, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    source.repository,
    source.name,
    source.description,
    ...source.profiles.map((p) => p.name),
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
