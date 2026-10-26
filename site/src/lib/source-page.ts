// What a source's own page says about it beyond its listing: its title and
// description, and Repo Canon's introduction, which the site writes itself in
// i18n/prose/<locale>/repo-canon.md.
import type { RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import {
  STARTING_POINT,
  type Declaration,
  type DetailedSource,
  type Source,
} from "./catalogue.ts";
import { formatList, formatNumber } from "./format.ts";
import { format, prose } from "../i18n/format.ts";
import type { MessageId } from "../i18n/ids.ts";
import type { Locale } from "../i18n/locales.ts";

/** A search result's description is cut at about this many characters. */
const DESCRIPTION_LIMIT = 155;

/** One thing a source provides, under a heading in searchers' words, in the
 * order the introduction's prose gives the headings. */
type Topic = {
  /** The installed paths and check IDs a declaration adds to the topic. */
  shows: (declaration: Declaration) => string[];
  /** What the heading and text name. Each must be among what the topic
   * shows, a claim ending in `/` as a prefix, or the page states something
   * the release does not install. */
  claims: string[];
};

type Introduction = {
  /** The title's description. */
  summary: MessageId;
  /** The page's meta description. */
  description: MessageId;
  /** The prose file holding the lead and each topic's heading and text. */
  prose: string;
  topics: Topic[];
};

export type IntroducedTopic = {
  heading: string;
  text: string;
  items: string[];
};

/** Repo Canon, the sign's starting point, is what people search for when
 * they want an AGENTS.md or agent skills. Its page names them in their words,
 * and each claim is checked against the release it describes. */
const STARTING_POINT_INTRODUCTION: Introduction = {
  summary: "sources.repo-canon.summary",
  description: "sources.repo-canon.description",
  prose: "repo-canon",
  topics: [
    {
      shows: (d) =>
        d.targets.filter(
          (t) => t === "AGENTS.md" || t.startsWith("docs/agents/"),
        ),
      claims: ["AGENTS.md", "docs/agents/"],
    },
    {
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
      shows: (d) => d.targets.filter((t) => t === "CONTRIBUTING.md"),
      claims: ["CONTRIBUTING.md"],
    },
    {
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

/** `<source name>: <summary> | Repo Standards`. */
export function sourceTitle(source: Source, locale: Locale): string {
  const introduction = INTRODUCTIONS[source.repository];
  return format(locale, "sources.title", {
    name: source.name,
    summary: introduction
      ? format(locale, introduction.summary)
      : source.description,
  });
}

/** The source's own description and what it installs, within a search
 * result's length. Repo Canon's is the site's own. */
export function sourceDescription(
  source: DetailedSource,
  locale: Locale,
): string {
  const introduction = INTRODUCTIONS[source.repository];
  if (introduction) return format(locale, introduction.description);
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
  const count = (id: MessageId, n: number) =>
    format(locale, id, { count: n, number: formatNumber(n, locale) });
  const counts = [
    skills > 0 && count("sources.description.skills", skills),
    checks > 0 && count("sources.description.checks", checks),
  ].filter((c) => c !== false);
  // as many of the files as fit, with the counts
  for (let n = files.length; n >= 0; n--) {
    const items = [...files.slice(0, n), ...counts];
    if (items.length === 0) break;
    const text = format(locale, "sources.description.installs", {
      description: own,
      // Existing English descriptions omit the serial comma.
      installs: formatList(items, locale === "en" ? "en-GB" : locale),
    });
    if (text.length <= DESCRIPTION_LIMIT) return text;
  }
  return own;
}

/** Repo Canon's introduction with what each topic shows from its release.
 * It fails when the release does not install something the page claims, so
 * the page never states what it does not install. */
export function sourceIntroduction(
  source: DetailedSource,
  locale: Locale,
): { lead: string; topics: IntroducedTopic[] } | undefined {
  const introduction = INTRODUCTIONS[source.repository];
  if (!introduction) return undefined;
  const { lead, sections } = introductionProse(
    prose(locale, introduction.prose),
    `${introduction.prose} in ${locale}`,
  );
  if (sections.length !== introduction.topics.length)
    throw new Error(
      `The prose ${introduction.prose} in ${locale} has ${sections.length} topics, but site/src/lib/source-page.ts checks ${introduction.topics.length}.`,
    );
  return {
    lead,
    topics: introduction.topics.map(({ shows, claims }, i) => {
      const { heading, text } = sections[i];
      const items = [...new Set(source.installs.flatMap(shows))].sort();
      for (const claim of claims)
        if (
          !items.some((item) =>
            claim.endsWith("/") ? item.startsWith(claim) : item === claim,
          )
        )
          throw new Error(
            `The page for ${source.repository} names ${claim} under "${heading}", which its standards.yaml at ${source.release.version} does not install. Update its introduction in site/src/lib/source-page.ts and site/src/i18n/prose/.`,
          );
      return { heading, text, items };
    }),
  };
}

/** An introduction's plain text: a lead paragraph, then each topic as a
 * second-level heading over one paragraph. */
function introductionProse(
  markdown: string,
  file: string,
): { lead: string; sections: { heading: string; text: string }[] } {
  const fail = (): never => {
    throw new Error(
      `The prose ${file} must be a plain-text lead paragraph, then each topic as a "## heading" over one plain-text paragraph.`,
    );
  };
  const plain = (
    node: RootContent | undefined,
    type: "heading" | "paragraph",
  ): string => {
    if (node?.type !== type || (node.type === "heading" && node.depth !== 2))
      return fail();
    return node.children
      .map((child) => (child.type === "text" ? child.value : fail()))
      .join("");
  };
  const [lead, ...rest] = fromMarkdown(markdown).children;
  const sections = [];
  for (let i = 0; i < rest.length; i += 2)
    sections.push({
      heading: plain(rest[i], "heading"),
      text: plain(rest[i + 1], "paragraph"),
    });
  return { lead: plain(lead, "paragraph"), sections };
}
