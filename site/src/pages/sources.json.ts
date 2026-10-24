import type { APIRoute } from "astro";
import { NOTICE, repositoryUrl, sourcePath } from "../lib/catalogue";
import { loadCatalogue } from "../lib/load-catalogue";

export const GET: APIRoute = async ({ site }) => {
  const { cliVersion, sources } = await loadCatalogue();
  return Response.json({
    schema: "repo-standards/sources/v1",
    cliVersion,
    notice: NOTICE,
    sources: sources.map((source) => ({
      repository: repositoryUrl(source),
      name: source.name,
      description: source.description,
      release: source.release,
      commit: source.commit,
      requires: source.requires,
      profiles: source.profiles,
      page: new URL(sourcePath(source), site).href,
      prompt: new URL(`${sourcePath(source)}prompt.txt`, site).href,
    })),
  });
};
