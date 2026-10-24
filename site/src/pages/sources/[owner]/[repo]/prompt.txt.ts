import type { APIRoute, GetStaticPaths } from "astro";
import { installText, type Source } from "../../../../lib/catalogue";
import { loadCatalogue } from "../../../../lib/load-catalogue";

export const getStaticPaths: GetStaticPaths = async () => {
  const { sources } = await loadCatalogue();
  return sources.map((source) => {
    const [owner, repo] = source.repository.split("/");
    return { params: { owner, repo }, props: { source } };
  });
};

export const GET: APIRoute = ({ props }) =>
  new Response(installText(props.source as Source, "prompt"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
