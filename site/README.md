# Repo Standards website

The private `site/` workspace builds the Repo Standards website with
Astro, React, Tailwind 4 and shadcn/ui. Its homepage lists the standards
sources that source search finds, under a road sign pointing to Repo Canon,
and each source has its own page at `/sources/<owner>/<repo>/`.
Starlight 0.42 serves the usage documentation and design decisions at `/docs/`.

## Development

Follow the repository's [development guide](../docs/development/README.md) for
shared prerequisites, installation, validation and CI, and the
[contribution guidelines](../CONTRIBUTING.md) for the pull request workflow.

From the repository root:

```sh
pnpm build
pnpm --dir site dev
pnpm --dir site check
pnpm --dir site build
pnpm --dir site build:fixture
pnpm --dir site test
pnpm --dir site validate
pnpm --dir site preview
pnpm --dir site social-image
```

The development server listens on `http://localhost:4321`. The build writes
static files to `site/dist/`; preview serves that output locally.
`validate` runs `ui:check`, `check`, `test` and `build:fixture` in that order;
the root `pnpm validate` calls it, and root `pnpm lint` and `pnpm format:check`
cover this project. The tests in `test/` use Node's built-in test runner, with
no test framework installed. `pnpm --dir site test` runs their files one at a time: several of
them build the site or start its development server from this directory, with
the same Astro and Vite caches, and run together their builds can outlast the
120-second limit on each build command. `pages.test.ts` builds the fixture
site with a page only it builds, and runs the pages' inline scripts in
`node:vm`, which measures no layout. `phone-layout.test.ts` measures every
page family in a real browser at 320, 360 and 390 px, in both themes and
every locale, the pseudo-locale's from the development server, as the
development guide's [Site on a phone](../docs/development/README.md#site-on-a-phone)
describes. `browser.ts` drives the installed Chrome, Chromium or Edge through
the DevTools protocol over Node's own WebSocket, with no browser package, and
`layout-probe.ts` is what runs in the page to find content a phone does not
show whole. `sign-clamps.test.ts` checks in the same browser that each of
the hero sign's clamps sits on its post under its plate, at 1440 px and on a
phone, once loaded and after a resize, and that each face of a clamp is drawn
where the browser's own 3D transform of the turned clamp would show it.

`src/content.config.ts` loads `../docs/usage/**/*.md` and `../docs/adr/**/*.md`
in place. `src/lib/docs-content.ts` supplies each file's H1 as its title before
schema validation, removes that heading from the rendered body, and rewrites
Markdown links and reference definitions against the original file. Usage and
ADR links reach their docs routes; other repository files reach GitHub.
`README.md` becomes its folder's landing page. The sidebar follows the external
folders and adds Getting started when that folder exists. `astro.config.mjs`
keeps the explicit sitemap integration and disables prefetch to preserve the
homepage's output. Starlight builds the Pagefind index alongside the pages.
`test/docs.test.ts` checks the rendered corpus, links and fragments, sitemap,
beacon, theme navigation, and a nested-folder fixture. Its homepage fingerprint
records the fixture build at `e95dba8` with the Documentation link changed and
the How it works link added, normalizing only the affected Home bundle hash
and island UID, and omitting the new agent discovery links. It also omits the
nav, the Support control, the homepage's support line, the footer and their
inlined styles, and normalizes the React ids those additions renumber and the hashes
of the shared stylesheet and React renderer, so without them the homepage is
byte for byte what it was. Since Astro 7 it also compares each inline script
as Vite's minifier prints it, leaves out Astro's own island runtime scripts,
normalizes the page stylesheet's hash and collapses runs of whitespace between
tags: Vite 8 prints the same scripts and styles differently, and the Astro 6
build gives the same fingerprint. `astro.config.mjs` keeps Astro 6's HTML-aware
`compressHTML`, since Astro 7's JSX whitespace rules would drop the space
between inline elements on separate lines, as in the support line.

Agents can start at `/llms.txt`, which identifies the scoped npm package,
product repository and domain and links to Markdown versions of the site.
Every HTML page advertises its Markdown alternate: `/index.md` for the
homepage, otherwise the page URL without its trailing slash plus `.md`.
`src/lib/agent-pages.ts` writes these at build time before the sitemap runs.
Docs use their original Markdown with the same link resolver as Starlight,
made absolute; the other pages use their rendered content, including adoption
prompts held in readonly inputs, without navigation or controls. The sitemap
includes these surfaces, and `robots.txt` allows crawlers to reach them.

`/sources.json` lists the accepted catalogue, its CLI version, notice and
schema version, with repository, release, commit, requirement, profiles, page
and prompt URLs for each source. It has no build timestamp. Each stable
`/sources/<owner>/<repo>/prompt.txt` serves the exact agent prompt from
`installText()` as plain text. `test/docs.test.ts` checks these build outputs,
Markdown content and absolute links, discovery links and fixture reproducibility.

The supported `ThemeProvider` and `ThemeSelect` overrides in `components/docs/`
use `src/lib/theme-core.ts` and the existing `theme` storage key. Starlight's
stock select keeps Dark, Light and Auto; Auto clears the explicit choice and
follows the system. Docs retain Starlight's stock layout, search, pagination
and focus ring, and include the shared analytics beacon through Starlight's
`head` option.

Every page offers two ways to support Repo Standards, GitHub Sponsors and
Ko-fi, listed in `src/lib/support.ts` in the order `.github/FUNDING.yml` and
the npm package's `funding` give them. The header's one Support control,
`src/components/support.tsx`, is the site's shadcn `Button` in its `outline`
variant, opening a shadcn Dropdown Menu whose items link to both. The
site's nav renders it on every page outside the docs; Starlight's header,
through the supported `Header` override, renders it as its own island,
hydrated with the site's `client:settled` directive (`src/lib/settled.ts`,
registered by `src/lib/hydration.ts`). It waits for the page's `load`, its
fonts and two animation frames, then for the browser to be idle, so the
island's script stays off the path to the largest paint. The override keeps
it visible below 50rem, where Starlight hides its own right-hand group, with
its heart alone below 30rem, so the docs' title plate keeps its whole name;
the site's nav shows the heart alone below 50rem. Until it hydrates, the control does nothing, and the footer carries both links: the layout's footer and the
supported `Footer` override show `SupportLine.astro`, and the homepage ends
with one line inviting support. `src/styles/support.css` styles the footer's
line in the sign's palette and type without Tailwind, so the docs' footer
loads it too. Page Markdown leaves asides and footers out, so `llms.txt` and
the Markdown versions stay as they were: the links are for people.
`test/docs.test.ts` checks the control, the footers, the homepage's line and
the agent surfaces, `test/support.test.ts` the funding metadata and the
contrast of the control, its menu and the footer's line in both themes, and
`test/stylesheets.test.ts` that no stylesheet styles the control by class
name.

The docs load no Tailwind preflight. `src/styles/docs-components.css`,
imported by the `Header` override, gives them Tailwind's theme and only the
utilities that the control, `Button` and Dropdown Menu use, so none reaches
Starlight's own markup, and fills the gaps preflight would have closed with
rules on the components' `data-slot` attributes. It loads shadcn's colour
tokens from `src/styles/shadcn-theme.css`, the same file `global.css` loads,
so the control looks the same on the docs as on the site's pages.

The docs wear the sign's palette and type through Starlight's own custom
properties only. `src/styles/docs.css`, Starlight's one `customCss` entry, maps
its accent to Verkehrsblau, its light theme to the day page and its dark theme
to the night page, and sets D-DIN PRO as its font. It imports
`src/styles/tokens.css` for the fonts and Verkehrsblau, so the docs bundle
carries its own copy and the homepage's bundle is unchanged; both declare the
same `/fonts/` files. The supported `SiteTitle` override,
`components/docs/SiteTitle.astro`, sets the header's title as the site's
plate, `src/components/plate.tsx`: a plain Verkehrsblau plate in the
condensed sign face, linking home, styled by `src/styles/plate.css` without
Tailwind. The site's nav shows the same plate.
`test/docs-theme.test.ts` resolves the palette over Starlight's own properties
in both themes, through `test/docs-palette.ts`, and requires WCAG 2.2 AA
contrast for text, links and code on every background they are drawn on;
`test/docs.test.ts` checks the built code colours, the plate and the font
faces.

The site's text comes from message catalogs and prose files in `src/i18n/`,
through `format()`; the [development guide](../docs/development/README.md#site-translations)
says how to change it and its translations, and
[ADR 0030](../docs/adr/0030-localize-the-site-through-mf2-catalogs.md) records
the design. The pages live under `src/pages/[...locale]/`, built once for each
locale in `src/i18n/locales.ts`: the default, English, at the root, and
Spanish and Catalan under `/es/` and `/ca/`, with the same paths. The
development server also serves the pseudo-locale at `/en-xa/`, which
`test/pseudo-locale.test.ts` checks there; the build never includes it. The
docs, `llms.txt`, `sources.json`, the prompts and the Markdown versions stay in
English: a page in another locale advertises its English version's Markdown,
and `src/lib/agent-pages.ts` writes Markdown for English pages only.

Every page outside the docs shows one nav, `src/components/site-nav.tsx`,
in the order and weight
[ADR 0031](../docs/adr/0031-give-every-site-page-one-nav.md) records. It is a
bar across the window, above the page's column, with the docs' header's
height, padding and hairline: the plate, Documentation and How it works on
the left, then GitHub, Support, the language menu and the theme toggle on
the right. A page passes only its locale, its language versions, the current
page and the homepage's action. The homepage leaves the plate out, and its
How it works button plays the sign's story; on How it works its own item
reads as pressed, with `aria-current="page"`. Below 50rem the bar holds the
plate, Support's heart and one menu button, which opens a sheet under the
header, as [ADR 0032](../docs/adr/0032-open-the-phone-nav-as-a-sheet-under-the-header.md)
records: the three links as full-width rows, then one row with the language
selector, showing the page's language by its own name, and the theme toggle's
icon. The page below is dimmed and doesn't scroll; a tap on it, Escape,
following a link, focus leaving the sheet or a window wide enough for the bar
closes it. The sheet is a disclosure of plain links rather than a menu, and
renders only while open: the arrow keys, Home and End move between its
controls, before the language selector's Dropdown Menu sees them, so they
never open its list. `src/styles/global.css` gives every Dropdown Menu item on
the site's pages the Button's focus ring. `test/pages.test.ts` checks the
nav's items, order and weight in every locale, and `test/phone-layout.test.ts`
measures the bar against the docs' header at 1280 px, measures the open sheet
and its language list on every page, and drives the sheet by touch and by
keyboard.

The nav's language menu, `src/components/language-menu.tsx`, is the site's
shadcn Dropdown Menu, beside the theme toggle, showing its icon alone and
named with the page's language, listing English, Español and Català, each in
its own language; the sheet's language selector opens the same list. Picking one saves it in `localStorage` under
`locale`, or `sessionStorage` where that fails, and opens the same page and
section in that language, with `?locale=<tag>` in the address, which the head
script honours, saves and removes, so a browser that can store nothing still
gets the language it picked. The layout's first head
script, `src/components/LocaleScript.astro`, generated from
`src/i18n/choice.ts` like the theme's, runs before the first paint: a saved
locale opens its version of the page, and with none saved, an English page
opens the version in the browser's first supported language, if that is
Spanish or Catalan. The browser's language never leads away from `/es/` or
`/ca/`, the docs never redirect, and `test/locale-choice.test.ts` checks each
case. A redirect keeps the fragment: How it works gives each translated
heading the English heading's ID (`src/lib/section-ids.ts`), so
`#who-does-what` opens the same section in every locale, and a translation
whose headings don't match English's one for one fails the build. The docs have no menu; on a Spanish or Catalan page the nav's Docs link
carries a small "EN" badge (`docs-link.tsx`). The layout imports `LocaleScript.astro` after
its stylesheets: Astro orders a page's stylesheets by where they are imported,
and the layout's must come first, since it declares the cascade layers' order
that the sign's stylesheets use.

`src/pages/[...locale]/index.astro` loads the data and renders the homepage,
`src/components/home.tsx`. `src/pages/[...locale]/how-it-works.astro` renders
`src/i18n/prose/<locale>/how-it-works.md`, the homepage story in words, with
who does what, the tools that fit some jobs better and the current limits; its
claims follow the usage documents and the ADRs. Each plate in the homepage's
list links to the source's page,
`src/pages/[...locale]/sources/[owner]/[repo].astro`: the source's
description, latest release, CLI requirement and profiles, the agent prompt
and terminal command (`source-adoption.tsx`), the site's notice and what the
source installs. `src/lib/source-page.ts` writes each page's title and
description, and Repo Canon's introduction from
`src/i18n/prose/<locale>/repo-canon.md`, which names what it provides in the
words people search for. Each thing the introduction names must be among what
its release installs, or the build fails until the introduction is updated. A
source page carries JSON-LD for its source. Every page outside the docs renders inside
`src/layouts/base.astro`, which owns the head: the page's locale as
`<html lang>`, the theme, the page's title,
description and canonical URL, its own path on `site`, the Open Graph and
Twitter card tags, the favicons, the web manifest and the Cloudflare Web
Analytics beacon. `og:title`, `og:description` and `og:url` repeat the page's
title, description and canonical URL, and `og:image` is the page's `image`
prop, a `SocialImage` from `src/lib/social-image.ts`, as an absolute URL on
`site`; a page that passes none takes its locale's card: `public/social.png`
for English, `public/social-es.png` for Spanish or `public/social-ca.png` for
Catalan. The layout links every page's language versions with reciprocal
`hreflang` and English as `x-default`, declares its Open Graph locale and
alternates, and adds `WebPage` JSON-LD with `inLanguage` set to its locale.
`public/site.webmanifest` names the site and lists the 192 and 512 pixel
icons, in the sign palette's colours. The beacon is `src/lib/analytics.ts`, a
tag in the shape Starlight's `head` option takes, so the docs can include it
too. A
page adds JSON-LD and its other head elements in the layout's `head` slot.
Shared Tailwind styles live in `src/styles/global.css`, and shadcn's colour
tokens, set to the sign palette, in `src/styles/shadcn-theme.css`, which it
imports; the fonts and the sign palette live in
`src/styles/tokens.css`, which holds no Tailwind, so a page without Tailwind's
preflight can load it. Tailwind reads its classes from the site's source
but not from `scripts/`, which renders nothing. `components.json`
configures shadcn's `base-nova` style with the `@/` alias from
`tsconfig.json`.

The sign art has no shadcn equivalent and lives in `src/components/sign/`:
the sheeted plates, the LED border, the guardrail, the torch that lights them
and the signpost list. The hero assembly stands on galvanised posts 12 cm
behind its plates, which shade them, held by cast-aluminium clamps drawn in
3D; the eye, below the sign, sees the plates' folded edges, and road dust and
rain runs mark the plates. `sign.css` styles it. The sign stylesheets, `sign.css`,
`light.css`, `story.css` and `adoption-dialog.css`, sit in the `sign` cascade
layer, which `global.css` orders after Tailwind's components and before its
utilities, so a utility on a sign element wins. They style only classes that
start with `sign-`, `signpost-`, `story-` or `adoption-`. `light.css` is the one stylesheet
that lights shadcn components, by their `data-slot` attributes, and runs the
page-wide layers that light the whole page, nav, sign and list alike. At
night the light is a torch, plain, slightly warm white: only reflective
surfaces, the plates, component edges and text, split it into a rainbow at the
beam's rim, and the bare page only brightens. By day it is the sun, behind
the viewer and up to the left, and it shows only as a white glint where the
sheeting and the component edges mirror it, moving at half the pointer's
speed. The torch, `torch.ts`, follows the pointer and keyboard focus, floods
the page on entry and when the pointer leaves, and stays floodlit with
`prefers-contrast: more`; by day the glint rests where an eye at the centre
would see it. A finger never aims the light or tilts the sign. On a
touch-first screen, with no hover and a coarse pointer, the torch rests fixed
to the screen over the sign instead of flooding, so the page scrolls through
it, and the sign holds its pose; a mouse or trackpad there still aims it. The theme follows the system
until the visitor picks one with the nav's toggle, remembered in
`localStorage` under `theme`. `src/lib/theme-core.ts` reads, applies and
stores it, as shadcn's `.dark` class and a `data-theme` attribute, the one
Starlight reads, on `<html>`; the layout's inline script, generated from the
same module, applies it before the first paint.
`rig.ts` measures the lit elements and writes the beam and the sign's tilt to
them. The page also runs it as an inline script after the markup and holds the
first paint until it has run, so the first frame already shows the sign at
its pose, its posts sunk behind the guardrail and dressed for the plates in
front of them, with the plates' shadows, the clamps and the plates' edges
(`posts.ts`), the list's plate
names fitted to one line (`fit-name.ts`) and the lights on, and hydration
changes nothing.
D-DIN PRO, under the SIL Open Font License in `public/fonts/d-din-pro/`, sets
the signs and the text.
`scripts/social-image.mjs` draws each locale's social preview: the
homepage's title plate by day, at 1200 by 630 pixels. It outlines the title
and the positioning line from the WOFF2 fonts, kerned with their GPOS pairs,
and renders them with sharp, so the image needs no system fonts or browser.
The positioning line comes from each locale's `sign.tagline` message.
Run `pnpm --dir site social-image` and commit the three images after changing
either line or the day palette.

The sign is also the way into "How it works" (`story.tsx`, `story.css`). Its
tab, its title, its notice and the nav's link sink it behind the guardrail
and play a short story in its place: a floor of repositories, each set up
its own way, made alike by one falling plate of shared standards. A light
along the rail shows how long each caption stays, and the sign comes back
at the end. The story plays on its own once per visitor, remembered in
`localStorage`, after they have been still for 8 seconds with the sign in
view, and never with reduced motion. Copying a prompt or command opens a
dialog, `adoption-dialog.tsx`, that says what happens next; on a phone, a
note in its picture of the repository that has no room beside its file goes
on its own line. Beside the tab, a plain link leads to the same story in
words at `/how-it-works/`, with no script needed; words too long for the room
beside the tab wrap, so they stay on the screen.

`src/components/ui/` is generated shadcn source and read-only. Add components
and refresh the installed ones only through the exactly pinned shadcn CLI:

```sh
pnpm --dir site ui:add <component...>
pnpm --dir site ui:update
pnpm --dir site ui:check
```

`ui:add` and `ui:update` record each generated file's checksum in
`registry-manifest.json`, and `ui:check`, part of `pnpm validate` and the site
CI job, fails when the folder differs from it. Formatting and linting skip the
folder. Pages import components from `src/components/app/`, where an unchanged
component is a one-line re-export and a wrapper holds only a rule shared by
several uses. [ADR 0028](../docs/adr/0028-keep-generated-shadcn-source-read-only.md)
records the arrangement.

## Data

At build time, `src/lib/load-catalogue.ts` runs the CLI built at the root,
`../dist/cli.js source search --json`, through every page, and reads each
candidate's `standards.yaml` at its released commit for the profile
descriptions and what each listed profile installs: every declaration as the
profile resolves it, with its kind, paths and checks. Pass `GH_TOKEN` or `GITHUB_TOKEN` for the authenticated GitHub
quota. `src/lib/search-report.ts` turns them into the catalogue, and each
source keeps its released `commit`. Only the source pages show what a source
installs; the homepage's list leaves it out (`listed`). It checks the
report's shape, so a renamed or missing field fails the build, and it fails
when the search is marked incomplete, finds no candidates or does not list
Repo Canon, the source the sign points to; this is
how [#347](https://github.com/lutzseverino/repo-standards/issues/347)'s
intermittent search results show, and GitHub Pages keeps serving the last good
deploy. Another source can still drop out of one day's build.

The homepage ranks by observed public-adopter count, descending, with display
names breaking ties in `byListOrder`. Its tabs explain that this is a lower
bound: one GitHub code-search query discovers public selection candidates for
all sources (with pagination when needed), then repository metadata and
the selection on the current default branch establish adoption. Forks,
archived repositories and source self-adoption are excluded, and each
repository counts once. Search indexing can omit public adoption; private
adoption is not represented. A textual mention, another branch or a historical
selection does not establish current adoption.

The Pages build step runs `scripts/count-adopters.ts` with its built-in workflow
token, then consumes that step's JSON through `SITE_ADOPTER_COUNTS`. It creates
a fresh directory under `RUNNER_TEMP` and deletes it on exit; no count artifact,
committed production snapshot, cache or cross-run fallback exists. The JSON is
bound to `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`, and the catalogue rejects
missing, invalid or earlier-run counts. Failed or incomplete acquisition stops
the build before Pages artifact upload, so deployment retains the live site.
429 and secondary limits get exponential backoff, honoring `Retry-After` and
exhausted-quota resets within one fifteen-minute total wait budget shared by
all acquisition reads. The build job has a thirty-minute timeout. This budget
admits the observed 733-second cooldown; persisting limits still stop deployment.
The workflow-wide `github-pages` concurrency group serializes counting and
publishing across daily and main-push runs, so nearby pushes cannot compete
with each other. Other GitHub activity can still consume quota or trigger
secondary limits: GitHub documents the built-in token's primary quota as
[per repository](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-github_token-in-github-actions),
and response headers remain the authority for code-search limits.
Two [simultaneous](https://github.com/lutzseverino/repo-standards/actions/runs/40340944224)
[workflow probes](https://github.com/lutzseverino/repo-standards/actions/runs/40341005739)
both received 429 with the same `code_search` reset, limit 10, remaining 10,
and `Retry-After` 86/87 seconds. This is consistent with a shared throttle,
not proof of isolated per-run capacity; deployment runs therefore serialize.
The built-in token's public search and cross-repository coverage were verified
in [the Actions probe for #345](https://github.com/lutzseverino/repo-standards/actions/runs/40333619116),
including a successful retry after a 733-second cooldown.

Agent surfaces retain their alphabetical source order and omit the human count
tabs and explanation, keeping `llms.txt`, Markdown and `sources.json` unchanged.
The regression test builds the current site and documentation again with the
count UI removed and zero counts restoring alphabetical order, then compares
every agent output byte for byte. It pins no agent-output hash, so unrelated
documentation and discovery-copy changes apply equally to both builds.

`SITE_SEARCH_RECORDING` names a recording of those inputs to build from
instead: `page-<n>.json` holding the CLI's raw output and
`standards/<owner>/<repo>.yaml`, plus `adoptions.json` containing candidate,
repository and branch-selection inputs. `build:fixture` builds from the recording in
`fixtures/search/` through the same transform, and the tests change it to
check each failure. Pull request checks and `pnpm validate` use it, so they
never depend on GitHub search; only the Deploy site workflow builds from live
search. Record a fresh search with
`node dist/cli.js source search --json > site/fixtures/search/page-1.json`
from the root, and each candidate's `standards.yaml` from
`https://raw.githubusercontent.com/<owner>/<repo>/<commit>/standards.yaml`.
For local development without live acquisition, run
`SITE_SEARCH_RECORDING=fixtures/search pnpm --dir site dev` from the root.
Fixture builds derive counts from recorded acquisition inputs rather than a
saved production count output. `test/adopter-workflow.test.ts` executes the
workflow's actual counting/build shell step twice with distinct run IDs and
once with a simulated counting failure, verifying fresh consumption, temporary
file cleanup and the deployment gate.

## Deployment

The Deploy site workflow builds every push to `main`, and daily at 04:23 UTC
to pick up new sources and releases, and publishes `site/dist/` with
`actions/deploy-pages`. GitHub Pages uses GitHub Actions as its source and
`repo-standards.com` as its custom domain. Astro's `site` is
`https://repo-standards.com`, served from the root path with no `base`.
The site package is private and never published to npm.

`public/robots.txt` allows every crawler and points to the absolute sitemap URL.
`@astrojs/sitemap` includes the built pages automatically, the source pages
among them. Its `i18n` option groups the site's language versions as alternates;
the English-only docs keep no alternates. `llms.txt` lists English pages and
notes the Spanish and Catalan site paths; localized pages share their English
Markdown alternate. The homepage also publishes JSON-LD describing the site and the
listed standards sources, and each source page describes its own source, using
the same catalogue as the visible page and escaping third-party metadata for
the script element.

Cloudflare hosts the DNS for `repo-standards.com`. The apex has GitHub Pages
`A` and `AAAA` records, and `www` has a `CNAME` targeting
`lutzseverino.github.io`; all these records are DNS-only (unproxied). The domain
is verified for the GitHub account. GitHub Pages has an approved TLS
certificate for the apex and `www`, and Enforce HTTPS is enabled.

`repo-standards.lutzseverino.com` is proxied by Cloudflare. A permanent Redirect
Rule returns a 301 to the same path and query on `https://repo-standards.com`.
The old host stays permanently so the old address can serve again if the site
ever moves back.

Deployment from `main` can briefly describe merged but unreleased CLI behaviour;
releases normally follow within hours. The stack's rationale is recorded in
the [architecture decisions](../docs/adr/README.md).
