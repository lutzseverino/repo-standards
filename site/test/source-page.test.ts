import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, stringify } from "yaml";
import type { DetailedSource } from "../src/lib/catalogue.ts";
import { buildCatalogue, type SearchInput } from "../src/lib/search-report.ts";
import {
  sourceDescription,
  sourceIntroduction,
  sourceTitle,
} from "../src/lib/source-page.ts";

const recording = new URL("../fixtures/search/", import.meta.url);
const recorded = (file: string) =>
  readFileSync(new URL(file, recording), "utf8");

/** The recorded search, with `change` applied to Repo Canon's
 * standards.yaml. */
async function repoCanon(
  change: (standards: {
    defaults: { declarations: object };
  }) => void = () => {},
) {
  const input: SearchInput = {
    page: () => Promise.resolve(JSON.parse(recorded("page-1.json"))),
    standards: (repository) => {
      const yaml = recorded(`standards/${repository}.yaml`);
      if (repository !== "lutzseverino/repo-canon")
        return Promise.resolve(yaml);
      const standards = parse(yaml) as Parameters<typeof change>[0];
      change(standards);
      return Promise.resolve(stringify(standards));
    },
  };
  const { sources } = await buildCatalogue(input);
  return sources.find((s) => s.repository === "lutzseverino/repo-canon")!;
}

test("everything Repo Canon's introduction names, its release installs", async () => {
  const introduction = sourceIntroduction(await repoCanon());
  assert.deepEqual(
    introduction?.topics.map((t) => t.heading),
    [
      "AGENTS.md",
      "Agent skills",
      "Contribution guidelines",
      "Issue and PR templates",
      "Checks",
    ],
  );
  const items = (heading: string) =>
    introduction?.topics.find((t) => t.heading === heading)?.items ?? [];
  assert.ok(items("AGENTS.md").includes("AGENTS.md"));
  assert.ok(items("Agent skills").includes(".agents/skills/tdd/"));
  assert.deepEqual(items("Contribution guidelines"), ["CONTRIBUTING.md"]);
  assert.ok(
    items("Issue and PR templates").includes(
      ".github/PULL_REQUEST_TEMPLATE.md",
    ),
  );
  assert.ok(items("Checks").includes("repository-readme-structure"));
});

test("a Repo Canon release without something its page names fails the build", async () => {
  const source = await repoCanon((standards) => {
    delete (standards.defaults.declarations as Record<string, unknown>)[
      "pull-request-template"
    ];
  });
  assert.throws(
    () => sourceIntroduction(source),
    /names \.github\/PULL_REQUEST_TEMPLATE\.md under "Issue and PR templates", which its standards\.yaml at v0\.17\.0 does not install/,
  );
});

test("only Repo Canon has an introduction", async () => {
  const { sources } = await buildCatalogue({
    page: () => Promise.resolve(JSON.parse(recorded("page-1.json"))),
    standards: (repository) =>
      Promise.resolve(recorded(`standards/${repository}.yaml`)),
  });
  assert.deepEqual(
    sources.map((s) => sourceIntroduction(s) !== undefined),
    sources.map((s) => s.repository === "lutzseverino/repo-canon"),
  );
});

const source: DetailedSource = {
  repository: "example/alice",
  name: "alice",
  description: "Standards for Alice projects",
  commit: "2222222222222222222222222222222222222222",
  release: {
    version: "v1.0.0",
    publishedAt: "2026-09-01T12:00:00Z",
    url: "https://github.com/example/alice/releases/tag/v1.0.0",
  },
  requires: ">=9.0.0",
  profiles: [{ name: "default", description: "Everything" }],
  installs: [
    ...["AGENTS.md", "CONTRIBUTING.md", "README.md", "docs/guide.md"].map(
      (target) => ({
        id: target.toLowerCase(),
        kind: "file" as const,
        targets: [target],
        checks: target === "README.md" ? ["headings", "links"] : [],
        profiles: ["default"],
      }),
    ),
    {
      id: "review",
      kind: "skill",
      targets: [".agents/skills/review/"],
      checks: [],
      profiles: ["default"],
    },
  ],
};

test("a source's title is its name and description", () => {
  assert.equal(
    sourceTitle(source),
    "alice: Standards for Alice projects | Repo Standards",
  );
});

test("a source's description names the root files it installs, its skills and its checks", () => {
  assert.equal(
    sourceDescription(source),
    "Standards for Alice projects. Installs AGENTS.md, CONTRIBUTING.md, README.md, 1 agent skill and 2 checks.",
  );
});

test("a long description drops files until it fits a search result", () => {
  const description = `${"Standards for Alice projects, ".repeat(3)}and more`;
  const text = sourceDescription({ ...source, description });
  assert.equal(
    text,
    `${description}. Installs AGENTS.md, 1 agent skill and 2 checks.`,
  );
  assert.ok(text.length <= 155);
  const long = "Standards ".repeat(20).trim();
  const cut = sourceDescription({ ...source, description: long });
  assert.ok(cut.length <= 155);
  assert.match(cut, /^Standards( Standards)*…$/);
});
