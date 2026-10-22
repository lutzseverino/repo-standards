// The homepage's list of standards sources, as the build reads it from source
// search. Shared by the build and the browser, so it holds no Node.js code.

export type Profile = {
  name: string;
  description: string;
};

export type Source = {
  /** `owner/repo` on GitHub. */
  repository: string;
  name: string;
  description: string;
  release: { version: string; publishedAt: string };
  requires: string;
  profiles: Profile[];
};

export type Catalogue = {
  cliVersion: string;
  notice: string;
  /** Repositories with the topic that search left out. */
  rejectedCount: number;
  sources: Source[];
};

/** The source the sign at the top of the page points to. */
export const STARTING_POINT = "lutzseverino/repo-canon";

export function repositoryUrl(source: Source): string {
  return `https://github.com/${source.repository}`;
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
