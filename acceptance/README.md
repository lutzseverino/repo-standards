# Real-agent acceptance

The [authoring candidate journey](#authoring-candidate) evaluates preference
elicitation and local source creation. The adoption journey below evaluates
the packaged `adopt-standards` skill against
substantive projects. It is separate from `pnpm validate`: deterministic tests
submit scripted assessments and cannot establish contextual usefulness.

The two separately authored example sources have distinct goals and operations:
Alice's work profile guides Bob's parcel-preview tool, while Mira's service
profile guides Harbor's Python HTTP service. These are synthetic publishers and
projects, not claims about third-party production adoption.

Recorded runs: [2026-09-07 macOS and Linux acceptance](results/2026-09-07/README.md).
The separate [live publication and discovery journey](results/2026-09-07/source-publication.md)
uses the public synthetic `repo-standards-example` source.

## Prepare each supported operating system

For issue #11's public release, use the published package and a designated public
standards source. On each OS, prepare a disposable project using actual public
npm acquisition (set `PUBLISHED_CLI_VERSION` to the exact published release being
evaluated; an unpublished local candidate cannot supply this evidence):

```sh
node acceptance/prepare-public.ts "$PUBLISHED_CLI_VERSION" \
  https://github.com/lutzseverino/repo-standards-example v1.0.0 service harbor
```

For Alice/Bob, use the same learning repository at `v1.1.0`, profile `work`, and
project `bob`. The maintainer chose to keep public acceptance in one repository:
`service` and `work` are two profiles of one source, not two independent public
publishers. Separate-source behavior and agent acceptance remain covered by the
independently authored fixture sources. For fresh real-agent evidence using the
public npm package with independent temporary Git sources, prepare explicitly:

```sh
node acceptance/prepare-public.ts "$PUBLISHED_CLI_VERSION" fixture:alice v1.0.0 work bob
```

This substitutes only GitHub responses with the independent fixture's real Git
objects; npm installation still uses the public registry. Record it as
public-package/fixture-source acceptance, never as live public-source evidence.
The earlier local-tarball journeys below are historical and cannot establish
public-package behavior for the current release.
Preparation prints a session JSON path and exits; no local registry is involved.
Read the externally installed skill, then follow the same agent journey below,
using the session's recorded source, standards version and profile.
Record published bootstrap/discovery separately with
`node acceptance/public-installation.ts "$PUBLISHED_CLI_VERSION" /outside/evidence.json`.
Public release evidence must also cover the normal project commit, fresh-checkout
restoration, retained-source use and independent updates described in
[the release procedure](../docs/release.md#published-acceptance).

### Earlier fixture-based acceptance

Use macOS and Linux with Node.js 24, npm, Git and Python >=3.12,<4. From a product
checkout, install dependencies with `pnpm install --frozen-lockfile` and build
with `pnpm build`. Keep this setup process running:

```sh
node acceptance/prepare.ts alice bob
# In a separate process, for the second source:
node acceptance/prepare.ts mira harbor
```

Each prints a session JSON path outside the checkout. It records a disposable
committed project, independently packed/installed CLI, source/profile, starting
HEAD and the acquisition fixture environment. Setup performs no adoption,
contextual edits or assessments. `Ctrl-C` stops its temporary registry; project
and package directories remain available for review and can be removed later.

The fixture replaces GitHub HTTPS responses with real source Git objects and
serves the packed package through a loopback npm registry. All CLI and script
execution is real; adoption still uses the public GitHub selection interface.
These boundaries do **not** demonstrate publication, discovery, or public npm
installation. Public-registry installation evidence belongs to issue #11.

## Run the agent journey

Read the external package's `skills/adopt-standards/SKILL.md` before first
inspection. Use the printed session path to invoke the installed CLI:

```sh
node acceptance/cli.ts SESSION inspect --source SOURCE \
  --standards-version TAG --profile PROFILE --json
```

Replace `SESSION`, `SOURCE`, `TAG` and `PROFILE` with the prepared session path
and its recorded selection. Earlier fixture sessions use tag `v1.0.0`; public
sessions record `standardsVersion` explicitly. Do not substitute fixture URLs
into a public-source session.

Save the full report outside the adopting project, disclose the pins, exact
content, contextual scope and trusted operations, and obtain maintainer
confirmation of its identity. Follow the skill to start that same selection.
After installation, read the matching project-local skill and its packaged
assessment protocol, then use `--local` before the public CLI arguments:

```sh
node acceptance/cli.ts SESSION --local status --json
node acceptance/cli.ts SESSION --local resume --json
node acceptance/cli.ts SESSION --local resume --assessment /outside/assessment.json --json
```

The agent must read the actual project, make useful contextual edits and write
its own evidence. Do not copy scripted test assessments or replay a previous
journey's edits as real-agent work. For Alice, verify commands and parcel output,
improve the README and source-responsibility guidance, install work exact content
and the review skill, and preserve employer contribution bytes. For Mira,
inspect the server and probe its loopback API; document actual startup, health,
restart behavior and limitations, preserving existing warnings and ownership.
Keep deployment status unverified. Use the shared CLI and skill for both.

## Record evidence

Record OS/tool versions, source and CLI pins, package and installed-skill hashes,
inspection/confirmation identities, run IDs, initial handoff, submitted
assessment, final report, status evidence, project diff (including new files),
and command outputs supporting contextual claims. Compare employer contribution
bytes, initial/final HEAD and index; capture the uncommitted Git status.
Follow [Review completed outputs](../docs/adoption.md#review-completed-outputs):
include tracked changes and every non-ignored untracked file in content diffs
or explicit content inspection, preserving binary bytes and executable state.
Verify coverage against `git ls-files --others --exclude-standard -z`; contextual
patches and status/hash inventories alone are insufficient. Keep the index
unchanged rather than staging files to make them appear in a diff.
Record what the agent improved and why it helps a maintainer separately from
structural check results. Record blockers or missing acceptance honestly.

For supported-OS runs, keep their evidence separate and identify whether the
same agent or different agents performed them. A containerized Linux journey
counts as Linux runtime/skill execution, not a separate native desktop-agent
integration. Updates, interrupted retry, abandonment, stale assessments and
ownership rejection have deterministic coverage in `test/update.test.ts`,
`test/recovery.test.ts` and `test/assessment.test.ts`; do not relabel those tests
as real-agent journeys.

## Authoring candidate

Issues #27 and #28 use parent #25's agreed seams: an installed skill with a real
agent for conversation and the installed public CLI for validation. Creation
covers configuration/guidance, starting with one profile and expressing accepted
context differences as complete profiles. Revision, generated operations, and
public skill installation/discovery are separate tickets.

From the product checkout with Node.js 24 and npm, run:

```sh
node acceptance/prepare-author.ts
```

Setup copies only the candidate skill directory to a temporary installation
input, installs it using `skills@1.5.25 add ... --global --agent codex --copy`,
and removes that input. The installer receives isolated child-process home
directories and telemetry is disabled. Your actual global skills are untouched.
The printed session JSON records the installed skill, an empty workspace,
resource hashes, environment versions, and the conventional command. Setup
creates no source, preference decisions, npm product installation, or Git repo.

Start a fresh agent with only that installed skill, workspace, and the author's
opening request. Keep the product checkout and prior examples out of its context.
Have it acquire the compatible npm CLI and matching documentation using the
bundled guide. Record whether the CLI was a public package or packed candidate;
neither turns the local skill installation into public skill evidence.

Conduct live turns as an author unfamiliar with the format. Choose a working
context and depth after the overview. Supply an optional reference containing an
incidental practice. Request a recommendation, refine a concrete draft, and
review ownership and explicit target scope. Exercise exact configuration,
contextual file guidance, and repository guidance where accepted. Include an
explicit non-preference, a skipped topic, and an unresolved question explicitly
deferred. Review actual new-file contents and the whole source before accepting
completion. A separate fresh journey must confirm no standards and observe that
no filler `standards.yaml` is created and validation is not claimed.

For #28, run a fresh journey with meaningful differences between working contexts.
Have the author accept shared content and differences requiring a full replacement,
exclusion, and addition. Include an ambiguous identical-content/shared-intent choice
and review concrete drafts before settling ownership. Also offer a context whose
differences the author declines; it must not produce another profile. Inspect the
installed CLI's full resolved output against the accepted selections, including
absence of fields from replaced declarations. Every profile must be complete and
every difference must trace to acceptance; examples alone do not prove elicitation.

Retain the live author/agent turns outside the generated source, reviewed
choices mapped to each declaration, every resulting source file, concise notes,
exact CLI version/acquisition output, full all-profile validation JSON and exit
status, and completion/handoff evidence. Record final filesystem inventory to
check no repository provisioning, adoption, or publication occurred. If a
synthetic author is played by an evaluator, label that and who accepted the
result; do not present it as a human usability study. Scripted assessments,
prewritten sources, or prose-matching tests cannot establish interview quality.

Record `pnpm validate` separately from this agent evidence. Report coverage of
parent stories 1–12, 14–15, 19–21, 25–26, 28–31 and Testing Decisions 1, 2, 4,
8 plus the single-profile part of 3. Story 29 here is local conventional
installation only: public installation and observed discovery belong to #31.
Keep supported-OS results and any missing evidence explicit.
The #28 journey additionally owns story 13 and multi-profile/ownership coverage
of Testing Decisions 3, extending the single-profile and ownership work in stories
12 and 14. Keep earlier evidence dated; do not present it as a new run.
