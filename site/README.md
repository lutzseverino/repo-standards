# Repository Standards website

The private `site/` workspace builds the Repository Standards website with
Astro, React, Tailwind 4 and shadcn/ui. Its homepage lists the standards
sources that source search finds, under a road sign pointing to Repo Canon.
Starlight 0.40.0 serves the usage documentation and design decisions at `/docs/`.

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
pnpm --dir site preview
```

The development server listens on `http://localhost:4321`. The build writes
static files to `site/dist/`; preview serves that output locally. Root
`pnpm lint`, `pnpm format:check` and `pnpm validate` cover this project. The
tests in `test/` use Node's built-in test runner, with no test framework
installed. `pages.test.ts` builds the fixture site with a page only it builds,
and runs the pages' inline scripts in `node:vm`.

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
records the fixture build at `e95dba8` with the Documentation link changed,
normalizing only the affected Home bundle hash and island UID.

The supported `ThemeProvider` and `ThemeSelect` overrides in `components/docs/`
use `src/lib/theme-core.ts` and the existing `theme` storage key. Starlight's
stock select keeps Dark, Light and Auto; Auto clears the explicit choice and
follows the system. Docs retain Starlight's stock styles, search and pagination,
and include the shared analytics beacon through Starlight's `head` option.

`src/pages/index.astro` loads the data and renders the homepage,
`src/components/home.tsx`. Every page outside the docs renders inside
`src/layouts/base.astro`, which owns the head: the theme, the page's title,
description and canonical URL, its own path on `site`, the favicons and the
Cloudflare Web Analytics beacon. The beacon is `src/lib/analytics.ts`, a tag in
the shape Starlight's `head` option takes, so the docs can include it too. A
page adds JSON-LD and its other head elements in the layout's `head` slot.
Shared Tailwind styles and shadcn's colour tokens, set to the sign palette,
live in `src/styles/global.css`; the fonts and the sign palette live in
`src/styles/tokens.css`, which holds no Tailwind, so a page without Tailwind's
preflight can load it. `components.json`
configures shadcn's `base-nova` style with the `@/` alias from
`tsconfig.json`.

The sign art has no shadcn equivalent and lives in `src/components/sign/`:
the sheeted plates, the LED border, the guardrail, the torch that lights them
and the signpost list. `sign.css` styles it. The sign stylesheets, `sign.css`,
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
its pose, its posts sunk behind the guardrail (`posts.ts`), the list's plate
names fitted to one line (`fit-name.ts`) and the lights on, and hydration
changes nothing.
D-DIN PRO, under the SIL Open Font License in `public/fonts/d-din-pro/`, sets
the signs and the text.

The sign is also the way into "How it works" (`story.tsx`, `story.css`). Its
tab, its title, its notice and the nav's link sink it behind the guardrail
and play a short story in its place: a floor of repositories, each set up
its own way, made alike by one falling plate of shared standards. A light
along the rail shows how long each caption stays, and the sign comes back
at the end. The story plays on its own once per visitor, remembered in
`localStorage`, after they have been still for 8 seconds with the sign in
view, and never with reduced motion. Copying a prompt or command opens a
dialog, `adoption-dialog.tsx`, that says what happens next.

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
descriptions. Pass `GH_TOKEN` or `GITHUB_TOKEN` for the authenticated GitHub
quota. `src/lib/search-report.ts` turns them into the catalogue, and each
source keeps its released `commit`. It checks the
report's shape, so a renamed or missing field fails the build, and it fails
when the search is marked incomplete, finds no candidates or does not list
Repo Canon, the source the sign points to; this is
how [#347](https://github.com/lutzseverino/repo-standards/issues/347)'s
intermittent search results show, and GitHub Pages keeps serving the last good
deploy. Another source can still drop out of one day's build.

The list is alphabetical by display name, with Repo Canon unpinned since the
sign features it. Its ranking key will be the adopter count once
[#345](https://github.com/lutzseverino/repo-standards/issues/345) provides
one; the order is one function, `byListOrder`.

`SITE_SEARCH_RECORDING` names a recording of those inputs to build from
instead: `page-<n>.json` holding the CLI's raw output and
`standards/<owner>/<repo>.yaml`. `build:fixture` builds from the recording in
`fixtures/search/` through the same transform, and the tests change it to
check each failure. Pull request checks and `pnpm validate` use it, so they
never depend on GitHub search; only the Deploy site workflow builds from live
search. Record a fresh search with
`node dist/cli.js source search --json > site/fixtures/search/page-1.json`
from the root, and each candidate's `standards.yaml` from
`https://raw.githubusercontent.com/<owner>/<repo>/<commit>/standards.yaml`. The adopters count stays off the page
until there is a real one
([#345](https://github.com/lutzseverino/repo-standards/issues/345)).

## Deployment

The Deploy site workflow builds every push to `main`, and daily at 04:23 UTC
to pick up new sources and releases, and publishes `site/dist/` with
`actions/deploy-pages`. GitHub Pages uses GitHub Actions as its source and
`repo-standards.com` as its custom domain. Astro's `site` is
`https://repo-standards.com`, served from the root path with no `base`.
The site package is private and never published to npm.

`public/robots.txt` allows every crawler and points to the absolute sitemap URL.
`@astrojs/sitemap` includes the built pages automatically. The homepage also
publishes JSON-LD describing the site and the listed standards sources, using
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
