import assert from "node:assert/strict";
import { test } from "node:test";
import type { Catalogue } from "../src/lib/catalogue.ts";
import {
  buildSourceStructuredData,
  buildStructuredData,
  serializeStructuredData,
} from "../src/lib/structured-data.ts";

const website = {
  name: "Repo Standards",
  url: "https://repo-standards.com/",
  description: "Standards sources you can adopt in one command.",
};

const catalogue: Catalogue = {
  cliVersion: "10.0.0",
  notice: "Discovery is not an endorsement.",
  rejectedCount: 0,
  sources: [
    {
      repository: "example/zebra",
      publicAdopters: 2,
      name: "Zebra standards",
      description: "Standards for Zebra projects",
      commit: "1111111111111111111111111111111111111111",
      release: {
        version: "v2.1.0",
        publishedAt: "2026-10-01T12:00:00Z",
        url: "https://github.com/example/zebra/releases/tag/v2.1.0",
      },
      requires: ">=9.0.0",
      profiles: [],
    },
    {
      repository: "example/alice",
      publicAdopters: 1,
      name: "Alice standards",
      description: "Standards for Alice projects",
      commit: "2222222222222222222222222222222222222222",
      release: {
        version: "v1.0.0",
        publishedAt: "2026-09-01T12:00:00Z",
        url: "https://github.com/example/alice/releases/tag/v1.0.0",
      },
      requires: ">=9.0.0",
      profiles: [],
    },
  ],
};

test("structured data describes the website and every listed source in page order", () => {
  assert.deepEqual(buildStructuredData(catalogue, website), {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", ...website },
      {
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            item: {
              "@type": "SoftwareSourceCode",
              name: "Zebra standards",
              description: "Standards for Zebra projects",
              codeRepository: "https://github.com/example/zebra",
              version: "v2.1.0",
              dateModified: "2026-10-01T12:00:00Z",
            },
          },
          {
            "@type": "ListItem",
            position: 2,
            item: {
              "@type": "SoftwareSourceCode",
              name: "Alice standards",
              description: "Standards for Alice projects",
              codeRepository: "https://github.com/example/alice",
              version: "v1.0.0",
              dateModified: "2026-09-01T12:00:00Z",
            },
          },
        ],
      },
    ],
  });
});

test("a source's page describes the source at the page's URL", () => {
  assert.deepEqual(
    buildSourceStructuredData(
      catalogue.sources[1],
      "https://repo-standards.com/sources/example/alice/",
    ),
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "Alice standards",
      description: "Standards for Alice projects",
      codeRepository: "https://github.com/example/alice",
      version: "v1.0.0",
      dateModified: "2026-09-01T12:00:00Z",
      url: "https://repo-standards.com/sources/example/alice/",
    },
  );
});

test("third-party values cannot end the JSON-LD script element", () => {
  const hostile = '</script><script>alert(1)</script><!-- & "quoted"';
  const data = buildStructuredData(
    {
      ...catalogue,
      sources: catalogue.sources.map((source) => ({
        ...source,
        name: hostile,
        description: hostile,
      })),
    },
    website,
  );
  const json = serializeStructuredData(data);
  assert.ok(!json.includes("<"));
  assert.deepEqual(JSON.parse(json), data);
  const element = `<script type="application/ld+json">${json}</script>`;
  assert.equal(element.match(/<\/script\s*>/gi)?.length, 1);
});
