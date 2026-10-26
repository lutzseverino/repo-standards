// One ID per section in every locale: a translation's headings take the IDs
// of the default locale's, place for place, so a link or a redirect to
// `#who-does-what` opens the same section in any language.

const HEADING = /<h([1-6]) id="([^"]*)"/g;

/** `html`, a translation's rendered prose, with each heading's ID replaced
 * by the ID of the heading in the same place in `source`, the default
 * locale's rendering of it. It throws when the headings don't pair up, one
 * for one at the same level, so a translation keeps its source's outline. */
export function sharedSectionIds(
  html: string,
  source: string,
  name: string,
): string {
  const ids = [...source.matchAll(HEADING)].map(([, level, id]) => ({
    level,
    id,
  }));
  const levels = [...html.matchAll(HEADING)].map(([, level]) => level);
  if (levels.join() !== ids.map(({ level }) => level).join())
    throw new Error(
      `The translated ${name} has the headings h${levels.join(", h")}, but its source has h${ids.map(({ level }) => level).join(", h")}: a translation keeps its source's outline.`,
    );
  let i = 0;
  return html.replace(HEADING, (_, level: string) => {
    const { id } = ids[i++];
    return `<h${level} id="${id}"`;
  });
}
