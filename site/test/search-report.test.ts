import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCatalogue, type SearchInput } from "../src/lib/search-report.ts";

const recording = new URL("../fixtures/search/", import.meta.url);
const recordedPage = () =>
  JSON.parse(readFileSync(new URL("page-1.json", recording), "utf8")) as {
    incompleteResults: unknown;
    candidates: { repository: string; profiles?: unknown }[];
    rejected: { repository: string | null; code: string }[];
  };

/** The recorded search, with `change` applied to its page. */
function input(change: (page: ReturnType<typeof recordedPage>) => void) {
  const page = recordedPage();
  change(page);
  return {
    counts: () =>
      Promise.resolve({
        "lutzseverino/repo-canon": 1,
        "lutzseverino/repo-standards-example": 2,
      }),
    page: () => Promise.resolve(page),
    standards: (repository: string) =>
      Promise.resolve(
        readFileSync(
          new URL(`standards/${repository}.yaml`, recording),
          "utf8",
        ),
      ),
  } satisfies SearchInput;
}

test("the recorded search becomes the catalogue", async () => {
  const catalogue = await buildCatalogue(input(() => {}));
  const canon = catalogue.sources.find(
    (s) => s.repository === "lutzseverino/repo-canon",
  );
  assert.deepEqual(canon?.profiles, [
    {
      name: "standard",
      description: "The Repo Canon standards for every adopting repository",
    },
    {
      name: "factory",
      description:
        "The standard profile plus the factory's repository files and workflow rules, for a repository a factory serves",
    },
  ]);
  assert.equal(catalogue.rejectedCount, recordedPage().rejected.length);
});

test("each source lists what its profiles install, resolved over its defaults", async () => {
  const catalogue = await buildCatalogue(input(() => {}));
  const example = catalogue.sources.find(
    (s) => s.repository === "lutzseverino/repo-standards-example",
  );
  assert.equal(
    example?.release.url,
    "https://github.com/lutzseverino/repo-standards-example/releases/tag/v3.0.0",
  );
  // the work profile replaces agent-guidance and both exclude
  // contribution-guidance, so no profile installs CONTRIBUTING.md
  assert.deepEqual(example?.installs, [
    {
      id: "agent-guidance",
      kind: "file",
      targets: ["AGENTS.md"],
      checks: [],
      profiles: ["work"],
    },
    {
      id: "editor-settings",
      kind: "file",
      targets: [".editorconfig"],
      checks: [],
      profiles: ["service"],
    },
    {
      id: "operations-guide",
      kind: "repository",
      targets: ["docs/operations.md", "docs/operating-status.json"],
      checks: ["operational-evidence"],
      profiles: ["service"],
    },
    {
      id: "readme",
      kind: "file",
      targets: ["README.md"],
      checks: ["headings"],
      profiles: ["work"],
    },
    {
      id: "review-skill",
      kind: "skill",
      targets: [".agents/skills/review/"],
      checks: [],
      profiles: ["work"],
    },
    {
      id: "source-layout",
      kind: "repository",
      targets: ["src/"],
      checks: [],
      profiles: ["work"],
    },
  ]);
  const canon = catalogue.sources.find(
    (s) => s.repository === "lutzseverino/repo-canon",
  );
  const documentation = canon?.installs.find((d) => d.id === "documentation");
  // discovered scope has no fixed paths
  assert.deepEqual(documentation, {
    id: "documentation",
    kind: "repository",
    targets: [],
    checks: ["documentation-navigation"],
    profiles: ["standard", "factory"],
  });
  assert.deepEqual(
    canon?.installs.find((d) => d.id === "factory-workflow")?.profiles,
    ["factory"],
  );
});

test("a declaration of a kind the site does not know fails the build", async () => {
  const standards = (repository: string) =>
    readFileSync(new URL(`standards/${repository}.yaml`, recording), "utf8");
  await assert.rejects(
    buildCatalogue({
      ...input(() => {}),
      standards: (repository) =>
        Promise.resolve(
          standards(repository).replace("kind: skill", "kind: plugin"),
        ),
    }),
    /repo-canon.s standards\.yaml declaration skill-babysit has the kind plugin, which the site does not know/,
  );
});

test("every source carries its released commit", async () => {
  const catalogue = await buildCatalogue(input(() => {}));
  const recorded = recordedPage().candidates as unknown as {
    repository: string;
    commit: string;
  }[];
  assert.equal(catalogue.sources.length, recorded.length);
  for (const source of catalogue.sources) {
    const candidate = recorded.find(
      (c) => c.repository === `https://github.com/${source.repository}`,
    );
    assert.match(source.commit, /^[0-9a-f]{40}$/);
    assert.equal(source.commit, candidate?.commit);
  }
});

test("the list ranks by acquired adopter count rather than name", async () => {
  const catalogue = await buildCatalogue(
    input((page) => page.candidates.reverse()),
  );
  assert.deepEqual(
    catalogue.sources.map((s) => s.name),
    ["repository-standards-examples", "repo-canon"],
  );
  assert.deepEqual(
    catalogue.sources.map((s) => s.publicAdopters),
    [2, 1],
  );
});

test("equal acquired counts use display names to break ties", async () => {
  const catalogue = await buildCatalogue({
    ...input(() => {}),
    counts: () =>
      Promise.resolve({
        "lutzseverino/repo-canon": 0,
        "lutzseverino/repo-standards-example": 0,
      }),
  });
  assert.deepEqual(
    catalogue.sources.map((s) => s.name),
    ["repo-canon", "repository-standards-examples"],
  );
});

test("missing or invalid acquired counts fail the catalogue boundary", async () => {
  for (const count of [undefined, -1, 0.5, NaN]) {
    await assert.rejects(
      buildCatalogue({
        ...input(() => {}),
        counts: () =>
          Promise.resolve({ "lutzseverino/repo-canon": count } as Record<
            string,
            number
          >),
      }),
      /Missing or invalid public-adopter count/,
    );
  }
});

test("an incomplete search fails the build", async () => {
  await assert.rejects(
    buildCatalogue(input((page) => (page.incompleteResults = true))),
    /GitHub marked the search results incomplete\. This is the intermittent result of https:\/\/github\.com\/lutzseverino\/repo-standards\/issues\/347/,
  );
});

test("an empty search fails the build", async () => {
  await assert.rejects(
    buildCatalogue(input((page) => (page.candidates = []))),
    /search returned no candidates\. This is the intermittent result of .*issues\/347/,
  );
});

test("a search without Repo Canon fails the build", async () => {
  await assert.rejects(
    buildCatalogue(
      input((page) => {
        page.candidates = page.candidates.filter(
          (c) => c.repository !== "https://github.com/lutzseverino/repo-canon",
        );
        page.rejected.push({
          repository: "https://github.com/lutzseverino/repo-canon",
          code: "NO_STABLE_RELEASE",
        });
      }),
    ),
    /search did not list lutzseverino\/repo-canon and rejected it as NO_STABLE_RELEASE\. This is the intermittent result of .*issues\/347/,
  );
});

test("a malformed report fails the build", async () => {
  await assert.rejects(
    buildCatalogue(
      input((page) => {
        delete (page as { incompleteResults?: unknown }).incompleteResults;
      }),
    ),
    /report does not have the expected shape: incompleteResults is not a boolean/,
  );
  await assert.rejects(
    buildCatalogue(input((page) => delete page.candidates[0].profiles)),
    /report does not have the expected shape: candidates\[0\]\.profiles is not an array/,
  );
});
