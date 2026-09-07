# Real-agent acceptance

This manual journey evaluates the packaged `adopt-standards` skill against
substantive projects. It is separate from `pnpm validate`: deterministic tests
submit scripted assessments and cannot establish contextual usefulness.

The two separately authored example sources have distinct goals and operations:
Alice's work profile guides Bob's parcel-preview tool, while Mira's service
profile guides Harbor's Python HTTP service. These are synthetic publishers and
projects, not claims about third-party production adoption.

Recorded runs: [2026-09-07 macOS and Linux acceptance](results/2026-09-07/README.md).

## Prepare each supported operating system

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
inspection. Use the printed session path to invoke the installed public CLI:

```sh
node acceptance/cli.ts SESSION inspect --source https://github.com/alice/standards \
  --standards-version v1.0.0 --profile work --json
# Mira uses https://github.com/mira/standards and profile service.
```

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
