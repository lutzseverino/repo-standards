// What a source's own page says about it beyond its listing: its title and
// description, and Repo Canon's introduction, which the site writes itself.
import {
  STARTING_POINT,
  type Declaration,
  type DetailedSource,
  type Source,
} from "./catalogue.ts";

export const SITE_NAME = "Repo Standards";

/** A search result's description is cut at about this many characters. */
const DESCRIPTION_LIMIT = 155;

/** One thing a source provides, under a heading in searchers' words. */
type Topic = {
  heading: string;
  text: string;
  /** The installed paths and check IDs a declaration adds to the topic. */
  shows: (declaration: Declaration) => string[];
  /** What the heading and text name. Each must be among what the topic
   * shows, a claim ending in `/` as a prefix, or the page states something
   * the release does not install. */
  claims: string[];
};

type Introduction = {
  /** The title's description. */
  short: string;
  /** The page's meta description. */
  description: string;
  lead: string;
  topics: Topic[];
};

export type IntroducedTopic = Pick<Topic, "heading" | "text"> & {
  items: string[];
};

/** Repo Canon, the sign's starting point, is what people search for when
 * they want an AGENTS.md or agent skills. Its page names them in their words,
 * and each claim is checked against the release it describes. */
const STARTING_POINT_INTRODUCTION: Introduction = {
  short: "AGENTS.md template, agent skills and contribution guidelines",
  description:
    "A ready-made setup to start from: AGENTS.md, agent skills, contribution guidelines, issue and PR templates, and checks your coding agent installs for you.",
  lead: "Repo Canon is a ready-made setup to start from. Your coding agent installs it in your repository and adapts it to your project, and the same prompt later updates it to a newer release.",
  topics: [
    {
      heading: "AGENTS.md",
      text: "An AGENTS.md that coding agents read first, with the project's agent docs beside it in docs/agents/.",
      shows: (d) =>
        d.targets.filter(
          (t) => t === "AGENTS.md" || t.startsWith("docs/agents/"),
        ),
      claims: ["AGENTS.md", "docs/agents/"],
    },
    {
      heading: "Agent skills",
      text: "Skills in .agents/skills/ for triage, specifications and tickets, test-driven development, code review and pull requests.",
      shows: (d) => (d.kind === "skill" ? d.targets : []),
      claims: [
        ".agents/skills/triage/",
        ".agents/skills/to-spec/",
        ".agents/skills/to-tickets/",
        ".agents/skills/tdd/",
        ".agents/skills/code-review/",
        ".agents/skills/pr/",
      ],
    },
    {
      heading: "Contribution guidelines",
      text: "A CONTRIBUTING.md for the people and the agents who work on the repository.",
      shows: (d) => d.targets.filter((t) => t === "CONTRIBUTING.md"),
      claims: ["CONTRIBUTING.md"],
    },
    {
      heading: "Issue and PR templates",
      text: "GitHub issue forms for bug reports, feature requests, specifications and implementation tickets, and a pull request template.",
      shows: (d) =>
        d.targets.filter(
          (t) =>
            t.startsWith(".github/ISSUE_TEMPLATE/") ||
            t === ".github/PULL_REQUEST_TEMPLATE.md",
        ),
      claims: [
        ".github/ISSUE_TEMPLATE/bug-report.yml",
        ".github/ISSUE_TEMPLATE/feature-request.yml",
        ".github/ISSUE_TEMPLATE/specification.yml",
        ".github/ISSUE_TEMPLATE/implementation-ticket.yml",
        ".github/PULL_REQUEST_TEMPLATE.md",
      ],
    },
    {
      heading: "Checks",
      text: "Checks of the documentation's navigation, the READMEs' structure and the pull request reviewer file, run on adoption and with repo-standards check, and GitHub Actions workflows, among them checks of issue contracts and pull request metadata.",
      shows: (d) => [
        ...d.checks,
        ...d.targets.filter((t) => t.startsWith(".github/workflows/")),
      ],
      claims: [
        "documentation-navigation",
        "repository-readme-structure",
        "project-readme-structure",
        "pull-request-reviewer",
        ".github/workflows/issue-contracts.yml",
        ".github/workflows/pr-metadata.yml",
      ],
    },
  ],
};

const INTRODUCTIONS: Record<string, Introduction> = {
  [STARTING_POINT]: STARTING_POINT_INTRODUCTION,
};

/** `<source name>: <short description> | Repo Standards`. */
export function sourceTitle(source: Source): string {
  const short = INTRODUCTIONS[source.repository]?.short ?? source.description;
  return `${source.name}: ${short} | ${SITE_NAME}`;
}

/** The source's own description and what it installs, within a search
 * result's length. Repo Canon's is the site's own. */
export function sourceDescription(source: DetailedSource): string {
  const introduction = INTRODUCTIONS[source.repository];
  if (introduction) return introduction.description;
  const own = /[.!?]$/.test(source.description)
    ? source.description
    : `${source.description}.`;
  if (own.length > DESCRIPTION_LIMIT)
    return `${own.slice(0, DESCRIPTION_LIMIT - 1).replace(/\s+\S*$/, "")}…`;

  const { installs } = source;
  // the files at the repository's root are the ones people know by name
  const files = installs
    .filter((d) => d.kind === "file")
    .flatMap((d) => d.targets)
    .filter((t) => !t.includes("/"));
  const skills = installs.filter((d) => d.kind === "skill").length;
  const checks = installs.reduce((n, d) => n + d.checks.length, 0);
  const counts = [
    skills > 0 && plural(skills, "agent skill"),
    checks > 0 && plural(checks, "check"),
  ].filter((c) => c !== false);
  // as many of the files as fit, with the counts
  for (let n = files.length; n >= 0; n--) {
    const items = [...files.slice(0, n), ...counts];
    if (items.length === 0) break;
    const text = `${own} Installs ${listing(items)}.`;
    if (text.length <= DESCRIPTION_LIMIT) return text;
  }
  return own;
}

/** Repo Canon's introduction with what each topic shows from its release.
 * It fails when the release does not install something the page claims, so
 * the page never states what it does not install. */
export function sourceIntroduction(
  source: DetailedSource,
): { lead: string; topics: IntroducedTopic[] } | undefined {
  const introduction = INTRODUCTIONS[source.repository];
  if (!introduction) return undefined;
  return {
    lead: introduction.lead,
    topics: introduction.topics.map(({ heading, text, shows, claims }) => {
      const items = [...new Set(source.installs.flatMap(shows))].sort();
      for (const claim of claims)
        if (
          !items.some((item) =>
            claim.endsWith("/") ? item.startsWith(claim) : item === claim,
          )
        )
          throw new Error(
            `The page for ${source.repository} names ${claim} under "${heading}", which its standards.yaml at ${source.release.version} does not install. Update its introduction in site/src/lib/source-page.ts.`,
          );
      return { heading, text, items };
    }),
  };
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** "a, b and c". */
function listing(items: string[]): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
