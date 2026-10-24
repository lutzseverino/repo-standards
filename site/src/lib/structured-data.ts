import { repositoryUrl, type Catalogue, type Source } from "./catalogue.ts";

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

/** A source's own page: the source, at the page's URL. */
export function buildSourceStructuredData(source: Source, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: source.name,
    description: source.description,
    codeRepository: repositoryUrl(source),
    version: source.release.version,
    dateModified: source.release.publishedAt,
    url,
  };
}

/** Escape HTML's script delimiter even when it comes from a source's metadata. */
export function serializeStructuredData(data: object): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
