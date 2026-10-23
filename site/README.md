# Repository Standards website

The private `site/` workspace builds the Repository Standards website with
Astro, React, Tailwind 4 and shadcn/ui. Its homepage lists the standards
sources that source search finds, under a road sign pointing to Repo Canon.

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
data step's tests in `test/` use Node's built-in test runner, with no test
framework installed.

`src/pages/index.astro` loads the data and renders the homepage,
`src/components/home.tsx`. Shared Tailwind styles and shadcn's colour tokens,
set to the sign palette, live in `src/styles/global.css`. `components.json`
configures shadcn's `base-nova` style with the `@/` alias from
`tsconfig.json`.

The sign art has no shadcn equivalent and lives in `src/components/sign/`:
the sheeted plates, the LED border, the guardrail, the torch that lights them
and the signpost list. `sign.css` styles it. `light.css` is the one stylesheet
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
would see it. The theme follows the system
through shadcn's `.dark` class until the visitor picks one with the nav's
toggle; an inline script in the page head applies it before the first paint.
`rig.ts` measures the lit elements and writes the beam and the sign's tilt to
them. The page also runs it as an inline script after the markup and holds the
first paint until it has run, so the first frame already shows the sign at
its pose and the lights on, and hydration changes nothing.
D-DIN PRO, under the SIL Open Font License in `public/fonts/d-din-pro/`, sets
the signs and the text.

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
quota. `src/lib/search-report.ts` turns them into the catalogue. It checks the
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
`repo-standards.lutzseverino.com` as its custom domain. Astro's `site` is
`https://repo-standards.lutzseverino.com`, served from the root path with no `base`.
The site package is private and never published to npm.

The owner adds a DNS-only (unproxied) Cloudflare `CNAME` named `repo-standards`
in the `lutzseverino.com` zone, targeting `lutzseverino.github.io`. Account-level
GitHub Pages domain verification is optional. Once GitHub provisions the TLS
certificate after DNS resolves, enable Enforce HTTPS in the repository's Pages
settings.

Moving to `repo-standards.com` changes only Astro's `site` setting, the Pages
custom domain and DNS. Deployment from `main` can briefly describe merged but
unreleased CLI behaviour; releases normally follow within hours. The stack's
rationale is recorded in the [architecture decisions](../docs/adr/README.md).
