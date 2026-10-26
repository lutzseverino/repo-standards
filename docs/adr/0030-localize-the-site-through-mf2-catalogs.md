# Localize the website through MessageFormat 2 catalogs

The website is translated; the product's agent surfaces are not. Every string
on the site's pages is a Unicode MessageFormat 2 (MF2) message in a catalog,
`site/src/i18n/messages/<locale>/<area>.json`, or prose in a file,
`site/src/i18n/prose/<locale>/<name>.md`. Pages turn a message ID into text
only through `format(locale, id, values)` in `site/src/i18n/format.ts`, and
`site/src/i18n/message.ts` is the only module that imports the `messageformat`
library. Dates, numbers and lists are formatted through `Intl` before they
reach a message, so no message uses MF2's Draft functions, such as
`:datetime` and `:unit`.

UI strings are grouped in one catalog per area per locale, such as `common`,
`home`, `sign`, `sources` and `adoption`. An English entry is a plain MF2
string; a translated entry is `{ "message": ..., "source": ... }`, where
`source` is a short hash of the English message it translates. Longer
hand-written text, How it works and Repo Canon's introduction on its source
page, is one Markdown file per locale, rendered by its page; a translated file
records the hash of the whole English file in its front matter. These files
are the site's copy, so they stay under `site/`, not under `docs/`. Islands get
finished strings as props; the MF2 runtime reaches the browser only in an
island that formats a value only the browser knows, such as the homepage's
search.

There is no runtime fallback. `format()` throws on an unknown locale or ID, a
malformed entry, a message that does not parse and a missing variable, so a
gap fails the static build instead of showing English on a translated page.
One check, run by the site's tests, compares each locale with English: exactly
the same message IDs and prose files, every message parsing, each translation
using its English message's variables, while plural and select variants may
differ because Spanish and Catalan have `many`, and every recorded hash
matching the current English text. Each part passes or fails; a stale
translation fails like a missing one. `pnpm --dir site i18n:source` updates
hashes only for the entries a person names, never all at once, so a current
hash means someone updated that translation. The check imports nothing from
the site, so a Repo Canon i18n standard can lift it out later. A pseudo-locale,
generated from English with every text wrapped in `⟦ ⟧` and padded by about
30%, shows text that skipped the catalogs or overflows its box; only the
development server serves it.

`site/src/i18n/locales.ts` lists the locales, English first, and the routes
follow from it. English stays at the root, and every other locale is served
under `/<tag>/` with the same English paths, such as `/es/how-it-works/`, so
the English site keeps every URL. The pages are `[...locale]` routes rather
than Astro's `i18n` configuration: Starlight generates that configuration when
it has `locales`, and configuring both is an error, so the docs can still be
localized later. `<html lang>` is the page's locale. GitHub Pages cannot
choose a language on the server, so a language switcher saves the visitor's
choice, and a script on English pages sends a first visit on to the browser's
first supported language. A saved choice wins over the browser; the browser's
language never redirects away from `/es/` or `/ca/`, and `/docs/` never
redirects.

Product names, Repo Standards and Repo Canon, are never translated, and
sources' descriptions from their own `standards.yaml` stay in their own
language. The CLI and its `--json` output, the agent prompts, `llms.txt`,
`sources.json`, the Markdown versions of pages and `/docs/` stay English: they
are what agents read, or documentation rewritten in most product changes.

ICU MessageFormat 1, through `intl-messageformat`, was the alternative most
translation tools support today. MF2 is the stable Unicode standard, with the
same plural and select model and a path to `Intl.MessageFormat`; because
every call goes through `format()`, moving to MF1 would change the catalogs
and one module. Lingui, used in `polity`, ties call sites to its macros, a
build transform and PO catalogs, and its silent English fallback there hides
which messages were never translated. Prefixing English as `/en/` would have
changed every existing URL.
