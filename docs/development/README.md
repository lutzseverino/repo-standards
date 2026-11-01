# Development

This directory explains how to set up, validate, release, and maintain the
Repo Standards CLI and website.

## Setup and validation

Use TypeScript, ESM, stable Node.js 24 or 26 and pnpm. The default Node.js 24
baseline and pnpm versions are in `.node-version` and `package.json`.
Keep the bundled npm, Git 2.32 or newer and `python3` 3.9 or newer on `PATH`.
Node.js 22, odd majors, prereleases and future majors are excluded. The Alice
example test runs the example's `python3` check and needs that Python. Run
`pnpm install --frozen-lockfile`; npm registry access or cached dependencies
are required. The root package remains the published CLI;
`site/` is a private pnpm workspace. Installation from the root installs both
projects. `.factory/Dockerfile` supplies Node.js, pnpm, npm and `python3`; the host-installed
factory adds Git and agent tools in its own layer. The site's phone-layout
check also drives an installed Chrome, Chromium or Edge, as
[Site on a phone](#site-on-a-phone) describes; the site needs no other system
tools.

The site is a Site in Repo Canon's `typescript-astro` stack. It uses Astro 7
with Starlight 0.42, TypeScript 6 checked by `astro check`, React 19,
Tailwind CSS 4, shadcn CLI 4 with Base UI and lucide, oxlint 1, Prettier 3
with `prettier-plugin-astro`, `node --test`, pnpm 11 and Node.js 24 or 26;
the CLI keeps its root TypeScript version.

Run `pnpm --dir site dev` for the website at `http://localhost:4321`.
`pnpm --dir site check` runs `astro check`, and `pnpm --dir site build` writes
the static site to `site/dist/`. The build reads its list of standards sources
from GitHub with the CLI built at the root, so run `pnpm build` first; `pnpm
--dir site build:fixture` builds from the recorded search in
`site/fixtures/search/` without the network. `pnpm --dir site test` runs the
site's tests with Node's test runner, one file at a time, as the
[site README](../../site/README.md) explains, including the browser check of
every page on a phone. `pnpm --dir site preview` serves
that build.
`pnpm --dir site validate` runs the site's generated shadcn source check,
`astro check`, tests and fixture build. Run `pnpm validate` to validate the
entire repository; it ends with the site's `validate`.

During development, run `pnpm typecheck`, `pnpm lint` and `pnpm build`, then
focused tests covering the changed behavior, such as
`node --test --test-name-pattern='description' test/source-validation.test.ts`.
Run `pnpm format:check` to check every supported authored file with Prettier's
defaults, or `pnpm format` to format them locally. Prettier is exactly pinned in
`package.json`, with no formatting options or configuration file. The
[`.prettierignore`](../../.prettierignore) file excludes vendored code,
installed standards state and skills, the pnpm lockfile and checkout-local
store, Astro caches and generated declarations, and generated shadcn source
and its registry manifest.
`pnpm lint` first runs the site's `astro sync` to generate or refresh its
ignored `.astro` collection types, then runs oxlint with type-aware rules,
configured in `.oxlintrc.json`. Synchronization needs only the installed
dependencies, with no CLI build or live catalogue lookup; if it fails, lint
stops. Any lint finding, warning or error, fails the command. Run
`pnpm lint path ...` to lint particular files, or `pnpm lint --fix` to apply
its safe fixes. Root validation and CI use this same lint prerequisite.
`node --test test/lint.test.ts` checks the root command without generated
types, using a real collection consumer, and covers refresh, argument
forwarding and synchronization failure.
Include observable acceptance tests with the behavior they validate. Tests
install current `dist/` output; rebuild after changing product code.

The [update action](../usage/guides/automated-updates.md), `action.yml`, runs the
TypeScript in `action/` with Node.js directly, so it has no build output and
`pnpm build` does not cover it; `pnpm typecheck` and `pnpm lint` do.
`test/update-action.test.ts` runs it against a local fake of GitHub's REST API,
a bare Git remote, and a fake CLI on `PATH`. Only `action/github.ts` may call
GitHub.

### Continuous integration

Each PR runs three parallel Linux test parts on each of Node.js 24 and 26 using Node's `--test-shard` over
the same files as `pnpm test`, with every file in exactly one part. Part 2 runs
`test/update.test.ts`; parts 1 and 3 split all remaining `test/*.test.ts` files
into two shards. All parts use Node's default test concurrency. The six explicit checks name `node 24` or `node 26` and the part. Three aggregate
gates preserve the existing required-check settings: the required
checks are `validate (linux, 1/3)`, `validate (linux, 2/3)` and
`validate (linux, 3/3)`. Each aggregate requires all six CLI matrix jobs and both site matrix jobs to
succeed; a failure, cancellation or skip in either matrix fails every aggregate.
Together these required checks run every step of `pnpm validate` on both supported
Node.js majors. Each CLI part typechecks, lints, checks formatting, rejects any
runtime cycle of static imports among the source modules (type-only imports
are exempt), and builds before testing. Separate Linux `site` jobs run
the site's `validate`, which runs the generated shadcn source check, `astro check`, the site tests and the fixture site build, on both supported majors on every pull request, without path filtering.
Root oxlint covers the site's TypeScript, React and Astro scripts; Astro checking
covers templates. Root Prettier loads `prettier-plugin-astro` for `.astro` files
and checks the site along with the rest of the authored repository. The site's
tests use Node's built-in test runner; no site test framework is installed.
Their phone-layout and sign-clamp checks use the Google Chrome that GitHub's runners carry,
in these jobs and in the macOS validation after merge. The CLI's tests pack and
install the npm package into temporary directories, then exercise the installed public CLI
against temporary Git repositories. PR branches trigger Validate only through
`pull_request`; pushes trigger it only on `main`.

From the Repo Canon v0.20.0 adoption on, the Repo Canon required PR checks
ruleset requires a pull request's branch to be up to date with `main` before
it merges, so a merge to `main` makes every open pull request's checks stale
until its branch is updated.

The Deploy site workflow builds and publishes to GitHub Pages on every push to
`main` and daily, separately from Release. Only it builds the site from live
source search, as the [site README](../../site/README.md#data) describes.

macOS runs the full `pnpm validate` on both supported majors after merge on pushes to `main` and in the
release workflow. A macOS failure on `main` is a bug: open an issue and fix it
in a new PR. Merges continue; the release workflow blocks publication until
macOS passes.

`pnpm validate` includes the format check in the full local run. Passing all six Linux
CLI matrix jobs and both site matrix jobs through the three required gates replaces
a local full-suite run, so open the PR once focused checks pass.
Run additional local tests to diagnose failures when needed.

#### Running the full suite on a constrained host

The three Linux aggregate checks gate all six CLI matrix jobs and both site matrix
jobs. A full local run is sensitive to host load:
`pnpm test` runs every test file in parallel at Node's default concurrency, one
fewer than the available parallelism, and most files pack and install the CLI
and start adoption fixtures, each with its own local registry process and runtime
install. Fixed wall-clock limits then expire on a shared or saturated host: the
product's 10-second `npm --version` and `git --version` probes, its 120-second
runtime install, and the test harness's 60-second wait for terminal output. The
failures that follow, such as `NPM_REQUIRED`, `GIT_REQUIRED`, `RUNTIME_INSTALL`,
terminal timeouts, or a stale snapshot, come from load alone and say nothing
about the change. The product's limits stay sized for an adopter's machine; do
not raise them to suit the test suite.

To limit test-file concurrency through the normal root commands, set
`REPO_STANDARDS_TEST_CONCURRENCY` to a positive safe integer written in decimal
without whitespace or leading zeros:

```sh
REPO_STANDARDS_TEST_CONCURRENCY=2 pnpm test
REPO_STANDARDS_TEST_CONCURRENCY=2 pnpm validate
```

Build first when running `pnpm test`; `pnpm validate` includes the build.
Both commands reject invalid settings (including an empty value, zero,
fractions and nonnumeric text) before starting test files. With the setting
unset, Node's default scheduling stays in effect. The setting applies only to
the root test stage, not the site's tests or fixture build, and does not change
Linux CI's direct Node invocations or any product or harness deadline.

The direct Node workaround also remains available after building:

```sh
node --test --test-concurrency=<n> test/*.test.ts
```

Node rejects `--test-concurrency` in `NODE_OPTIONS`. Use the supported environment
setting for normal commands; runner filters can be passed directly, for example
`pnpm test --test-name-pattern='description'`.
With `n` set to `1`, test files run one at a time. Choose `n` so the host stays
well below saturation while the suite runs: start at half the available
parallelism, and lower it until runs stop failing with the load symptoms above.
A standard GitHub-hosted Linux runner runs each CI part at the default
concurrency, which is the reference point for a host that needs no limit.
Controlled concurrency reduces competing fixture work; it cannot guarantee
completion on an arbitrarily starved host. The harness's finite 60-second
prompt wait is distinct from product acquisition and operation limits, and
still fails when a prompt never arrives or a command stalls.

A test that fails only in a full local run is a load symptom, not a finding,
when its focused rerun and the three Linux parts pass. Treat it as a finding
only when it also fails in a full run with limited concurrency.

### Self-adoption and updates

This repository is both the CLI package and an adopting project. When the
requested CLI version matches its root package version, pinned `npx` from the
checkout can resolve the local package and fail with `repo-standards: not found`.
An unbuilt checkout lacks `dist/cli.js`; building alone is not a reliable
workaround. `--project` does not affect npm's working-directory package
resolution, which happens before the CLI launches.

Follow [Adopting in the product checkout](../usage/guides/adopt.md#adopting-in-the-product-checkout):
acquire the exact published candidate in an external directory with npm install
scripts disabled, then invoke that executable with `--project` naming this
clean, committed checkout. Keep its installation and answers outside the tree,
and reuse the same candidate through answer rounds and recovery until the
matching project runtime is usable. This needs no build or self-dependency and
leaves the tree clean until an actual adoption run starts. To keep the current
CLI pin, an already restored matching project runtime can launch the update
directly.

### Site translations

The website's text lives in `site/src/i18n/`, as
[ADR 0030](../adr/0030-localize-the-site-through-mf2-catalogs.md) records:
UI strings in `messages/<locale>/<area>.json`, and How it works and Repo
Canon's introduction in `prose/<locale>/<name>.md`. Product names, URLs, code,
the agent prompts and sources' own descriptions stay outside them.
`src/i18n/locales.ts` lists the locales, English first.

To add or change a string, edit its English catalog. A key `<key>` in
`messages/en/<area>.json` is the message ID `<area>.<key>`, and its value is
an MF2 message: write a variable as `{$name}`, and a plural as
`.input {$count :integer} .match $count one {{…}} * {{…}}`, passing the count
for selection and the number to show as separate variables. Format dates,
numbers and lists with `src/lib/format.ts` before passing them. A page calls
`format(locale, id, values)` from `src/i18n/format.ts`, or `rich()` when the
message holds an element, such as a link; an island gets its messages as
finished text from `strings(locale, ids)`, using the ID list its component
exports. Change prose in `prose/en/`. An ID missing from the English
catalogs fails `pnpm --dir site check`, and a missing variable fails the
build.

Every other locale has the same files. A translated message is
`{ "message": "…", "source": "…" }`, and translated prose starts with front
matter holding `source:`. Each `source` is the hash of the English text it
translates, so changing English makes `pnpm --dir site test` fail for each of
its translations until they are updated. After updating a translation, record
it by naming exactly the entries you updated:

```sh
pnpm --dir site i18n:source es home.search.label prose/how-it-works
```

The command never updates everything at once. The site serves English,
Spanish (`es`) and Catalan (`ca`): a pull request that changes English site
text updates both translations in it, and its body lists the strings and prose
changed in each locale for the owner's review. A new locale goes in
`locales.ts` with all of its catalogs and prose files. `pnpm --dir site dev`
also serves the pseudo-locale at `/en-xa/`, generated from English: any text
outside `⟦ ⟧` there bypasses the catalogs. Its padding can wrap every five
dots, like the words of a longer translation, so text that still overflows its
box there overflows for real.

### Site on a phone

Check every site change on a phone before review: at 320, 360 and 390 CSS px
wide, in the light and the dark theme, on every page it affects, with the
menus and dialogs those pages open. Check each page in English, Spanish and
Catalan, and the same page in the pseudo-locale at `/en-xa/`, whatever the
change touches: the pseudo-locale's longer text shows the overflow a longer
translation would cause. A change to the shared layout, navigation, styles or
components affects the homepage with its source cards, a source page, How it
works and the documentation shell. The docs are in English only and have no
translated or pseudo-locale pages.

A page fails when it scrolls sideways, and also when it fits but text or a
control is cut off, lies past the edge of the screen or sticks out of its box:
a clipping ancestor, such as the homepage's `.sign-page`, hides content
without widening the page. A code block or a table may scroll inside its own
box, which must itself fit. The plates' lit copies are inert decoration. Look
at long repository names and URLs, the source cards and their version
shields, the nav's links, language menu, theme toggle and Support control, the
adoption controls and dialog, prose, and wide tables and code. Fix a failure
where it arises, never by clipping the page, removing the pseudo-locale's
padding or letting all text break anywhere.

`site/test/phone-layout.test.ts`, part of `pnpm --dir site test` and so of
`pnpm validate` and the CI `site` jobs, measures this in a headless browser.
It builds the site from the recorded catalogue in `site/fixtures/search/`,
needing neither the network nor `pnpm build`, and serves it with Astro's
preview for English, Spanish and Catalan, and starts the development server
for the pseudo-locale, which the build never includes. It measures each page
family, every source in the recording and two docs pages, at each width and in
each theme: once loaded, after narrowing from 390 px, and with each nav menu,
the adoption dialog and the docs' menu and table of contents open, after the
fonts, hydration and animations settle. A failure names the page, its locale,
width, theme and state, and the element with its text and position. The file
also puts back into the current pages the failures that
[#421](https://github.com/lutzseverino/repo-standards/issues/421),
[#422](https://github.com/lutzseverino/repo-standards/issues/422) and
[#425](https://github.com/lutzseverino/repo-standards/issues/425) fixed, and
shows that the check finds each one, #425's in a page exactly as wide as the
screen.

The check uses the browser `SITE_BROWSER` names, or else the first Chrome,
Chromium or Edge on `PATH` or in macOS's Applications folder. Without one it
skips locally and fails in CI. From a fresh checkout:

```sh
pnpm install --frozen-lockfile
cd site
SITE_LAYOUT_REPORT=/tmp/site-layout node --test test/phone-layout.test.ts
```

`SITE_LAYOUT_REPORT` also writes every measurement to `layout.json` in that
directory, with a screenshot of each: the whole page once loaded, otherwise
the screen. Without it, the file only measures.

The check measures geometry only, and covers only the pages and states it
lists; add a new page family or interactive state to it. Look at the
screenshots yourself for what it cannot judge: overlapping or unreadable
text, awkward wrapping, contrast, and states it does not open, such as the
homepage's story playing and keyboard focus. To look in a browser, run
`SITE_SEARCH_RECORDING=fixtures/search pnpm --dir site dev` for every locale,
the pseudo-locale included, or `pnpm --dir site build:fixture` then
`pnpm --dir site preview` for the production pages, and use the browser's
device emulation at each width.

A pull request that changes the site reports this in its Evidence:

- **Revision**: the commit measured.
- **Pages**: the routes and locales, the pseudo-locale's among them.
- **Widths and themes**: 320, 360 and 390 px; light and dark.
- **Browser**: its name and version.
- **Measured**: what `phone-layout.test.ts` reported, and for a layout fix
  the measurements before and after, such as the page's scroll width and the
  right edge of the element that overflowed.
- **Checked by hand**: what you looked at yourself, and what you did not
  check.
- **Screenshots**: representative ones at 320 px in both themes, the
  pseudo-locale's included, and before and after for a fix.

### Release sources

The CLI pins `@lutzseverino/postern` 1.x as an exact runtime dependency.
Postern's `ReleaseSource` reads all pages of published releases for adoption,
discovery and update notices, and resolves exact version tags to commits,
including annotated tags. Repo Standards keeps stable-release selection,
the single retry for a read that receives no response, product diagnostics,
tag-movement detection and verified snapshot provenance. Annotation objects are
read on each observation; only tag observations and verified snapshots are cached.

Repository search, source repository metadata, and commit and tree verification
remain on the product's GitHub-only HTTP boundary because Postern has no port
for these reads. Git object fetching stays anonymous through Git. GitHub is the
only supported source host. Both HTTP boundaries select a trimmed `GH_TOKEN`,
then `GITHUB_TOKEN`, and otherwise read anonymously; Postern connections omit
`credential` when no token is present and redact credentials from results and
errors. The remaining GitHub boundary refuses credential-reflecting responses.

Readiness probes and remote setup fixes remain authored scripts owned by the
standards source. The product adds no platform calls or settings abstraction to
the probe runner; its read-only, prerequisite, process and mutation guards and
deferral outcomes are unchanged.
[ADR 0027](../adr/0027-choose-the-platform-inside-each-profile.md) records the
release-source decision alongside the platform choice inside each profile.

## Documents

- [Website project](../../site/README.md): local site commands, source layout,
  Pages deployment and custom-domain setup.
- [Architecture contracts](architecture.md): the product's purpose and release
  boundary, module responsibilities, formats, commands, adoption and update
  behavior, acceptance criteria, exclusions, and the mechanisms removed in
  2.0.0, 4.0.0, 5.0.0, 6.0.0, and 7.0.0.
- [Retained exact content](retained-exact-content.md): measurements, readers and
  options for dropping retained inputs that duplicate installed exact content,
  and the recommendation to keep them.
- [Release procedure](release.md): package contents, trusted publishing,
  release notes, recovery of a publication, and published and real-agent
  acceptance.
