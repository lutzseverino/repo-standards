import { repositoryUrl, type Catalogue } from "./catalogue.ts";

export function buildStructuredData(
  catalogue: Catalogue,
  website: { name: string; url: string; description: string },
) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", ...website },
      {
        "@type": "ItemList",
        itemListElement: catalogue.sources.map((source, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "SoftwareSourceCode",
            name: source.name,
            description: source.description,
            codeRepository: repositoryUrl(source),
            version: source.release.version,
            dateModified: source.release.publishedAt,
          },
        })),
      },
    ],
  };
}

/** Escape HTML's script delimiter even when it comes from a source's metadata. */
export function serializeStructuredData(
  data: ReturnType<typeof buildStructuredData>,
): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
