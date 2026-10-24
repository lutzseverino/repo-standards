/** The Markdown alternate of a page, including the homepage and error pages. */
export function markdownPath(pathname: string): string {
  const page = pathname.replace(/\/$/, "").replace(/\.html$/, "");
  return page ? `${page}.md` : "/index.md";
}
