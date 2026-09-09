# Bootstrap and public inspection

See [public installation](installation.md) for npm and standalone-bootstrap
acquisition and [adoption](adoption.md) for confirmed adoption, runtime pins and
retained inspection. Public release status is recorded in the product repository.

## Obtain the CLI outside the adopting project

Use macOS or Linux with Node.js 24, npm, and Git on `PATH`. Node.js 24 installers
at <https://nodejs.org/en/download> include npm. Missing prerequisites produce
actionable setup instructions. Git is needed to observe the adopting project.

The executable `bootstrap/repo-standards` is a standalone POSIX shell file with
an embedded Node.js program. It needs no product checkout, pnpm, or installed
JavaScript dependencies. Follow [public installation](installation.md#install-outside-your-project)
to obtain it from the matching release and install it outside your project.
Then inspect a selection:

```sh
cd /path/to/adopting-project
"$HOME/.local/bin/repo-standards-bootstrap" --cli-version 1.0.0 inspect \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --json
```

Replace the source, tag, and profile with a published standards source. The
bootstrap needs the requested CLI package in the configured npm registry.
The packed CLI also exposes `repo-standards-bootstrap`; installing the product
package globally installs both executable names.

An explicit `--cli-version` must be an exact stable package version. When it is
omitted, the bootstrap reads published versions once and selects the greatest
stable SemVer, excluding prereleases. It discloses that exact version on stderr
before installation, installs only that version, verifies its installed identity,
and invokes it. It never falls back to a different version. Each new invocation
is a new selection; reuse the disclosed `--cli-version` to repeat it. Inspection
records the invoked package and version.

Installation uses an external temporary directory and npm's configured cache,
with lifecycle scripts disabled and the project's `.npmrc` out of scope. The
cache is reused so an exact CLI version and its dependencies can be acquired
when already cached, including with npm offline mode. The configured cache must
resolve outside the project, and its `_cacache` content tree cannot contain
symbolic links or the adopting project. Acquisition logs stay in temporary
storage, even if the configured cache has a linked `_logs` directory. Normal
completion or failure removes the temporary installation and logs while
preserving the reusable cache. The project's language, package
manager, dependency manifests, and content are unchanged. Do not redirect the
report into the project if the entire invocation must leave it unchanged.

## Keep the disclosed CLI for start and recovery

The bootstrap removes its temporary runtime after inspection. To continue,
install the disclosed exact version in a persistent directory outside the
adopting project (replace `1.0.0` with that version):

```sh
adoption_cli="$HOME/.local/share/repo-standards/cli-1.0.0"
mkdir -p "$adoption_cli"
(cd "$adoption_cli" && npm install --prefix "$adoption_cli" \
  --ignore-scripts --save-exact --no-audit --no-fund \
  @lutzseverino/repo-standards@1.0.0)
"$adoption_cli/node_modules/.bin/repo-standards" --version
```

Use that executable from the project root for inspection and confirmed start.
Before initial adoption, ask the agent to read the packaged skill at
`$adoption_cli/node_modules/@lutzseverino/repo-standards/skills/adopt-standards/SKILL.md`.
After installation, invoke the matching repository-local `adopt-standards` skill.
Keep the external runtime available until completion for interrupted-installation
recovery. The [adoption workflow](adoption.md) documents start and continuation.

## Inspect with an already installed exact CLI

```sh
repo-standards inspect \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work \
  --project /path/to/adopting-project --json
```

`--project` defaults to the current directory; subdirectories resolve to the Git
working-tree root. Inspection works with staged, unstaged, untracked, and ignored
content, and an unborn HEAD. Non-Git and bare repositories are rejected. Default
output and `--json` provide the complete indented JSON report; `--json` also makes
failures structured JSON on stdout.

Git observation disables fsmonitor and clean/process filters and prevents index
refresh writes. Because author-defined normalization cannot run during inspection,
filtered working content may be reported as differing from the index even when
ordinary Git status considers it clean. Nested submodule state remains a start
blocker in this initial journey; inspection does not execute nested Git behavior.

Only public HTTPS GitHub repository URLs are accepted. A trailing `.git` or `/`
is normalized through GitHub's canonical metadata. The version must name an
existing stable SemVer tag (`1.2.3` or `v1.2.3`, optionally with build metadata).
Branches, commit-only inputs, ranges, prereleases, local directories, SSH, private
sources, and other hosts are unsupported. Direct inspection needs no discovery.

Acquisition uses unauthenticated GitHub REST repository and Git-object endpoints.
It resolves lightweight or annotated tags to a commit and downloads that commit's
tree and blobs outside the project. Blob bytes are verified against Git object
identities; executable bits are preserved. No checkout hooks, filters, author
scripts, or prerequisite probes run. Symlinks, submodules, special files, unsafe
paths, incomplete trees, and corrupt blobs are rejected. Before extraction,
source paths that collide after Unicode normalization and case folding are
rejected. Source
references and the root `standards.yaml` must use their exact Git path spelling,
including on case-insensitive filesystems. GitHub rate limits and
API size limits can prevent acquisition; failures never select another revision.

Observed tag-to-commit identities persist outside the project under
`$XDG_CACHE_HOME/repo-standards/tags`, or `~/.cache/repo-standards/tags` by default.
A previously observed tag that moves is rejected across separate CLI invocations.
Preserve this cache to preserve observation history. It is not retained input
storage and cannot detect movement before the first observation. `TMPDIR` and
the tag-cache location must resolve outside the project, including via symlinks.

## Report and inspection identity

The report has format `repo-standards/inspection/v1`:

| Field | Meaning |
| --- | --- |
| `selection` | Exact CLI package/version, canonical standards URL, version tag, commit SHA, and profile. |
| `source`, `resolved` | Validated metadata and the resolver's complete active profile. |
| `exact` | Declaration and target; `create`, `replace`, or `match`; before/after inventories with full bytes, SHA-256 hashes, and executable state. |
| `guidance` | Guidance content and its explicit project paths or directory trees. |
| `operations` | Ordered fixes and checks, literal arguments, script bytes, resource inventories, timeout, and declared prerequisite probe/range. |
| `project` | Canonical project root, HEAD or null, Git status and index, affected content, and reserved product paths. |
| `inputs`, `manifest` | Selected source material and normalized single-profile metadata retained by adoption. |
| `start` | Known blockers and prerequisite status. `eligible` is false for known blockers, null for unverified author prerequisites, and true when neither remains. Start probes every declared prerequisite before installation; contextual declarations stop incomplete after fixes until assessment is available. |
| `identity` | SHA-256 of deterministic report content, prefixed with `sha256:`. |

For an established candidate that changes one pin, `update` is `standards` or
`cli`, `previousSelection` records the current pins, and `retired` lists
declarations that will leave governance while their installed content remains
in place. An unchanged retained inspection omits these update fields and is
read-only.

For an established selection, `project.productState` observes the full durable
`.repo-standards/` tree, including unexpected files and their bytes. Inspection
rejects additions or removals from its recorded file inventory before creating
an adoption run. Only `.repo-standards/local/`, `.repo-standards/cache/`, and
`.repo-standards/runtime/node_modules/` are excluded from this observation;
equally named directories elsewhere remain part of durable state. Installation
and final verification use the same inventory rules.

File bytes use `encoding: utf8` when losslessly representable, otherwise
`encoding: base64`. Whole-skill inventories include existing and supplied files.
Matching exact files can be claimed without rewriting during adoption.
When an existing exact target conflicts with the supplied file/directory type,
the replacement entry retains both complete root observations, including any
directory inventory. The type conflict remains a start blocker.
Operations list all fixes before all checks; within each phase, declarations
appear by ID and operations retain their declared list order.
Contextual content stays project-owned. All author prerequisites remain
`not-checked`: inspection cannot establish them without running probes.

Identity has no timestamp or random acquisition path. It binds the exact
selection, resolved declarations and materials, project root, HEAD, index,
Git status, affected bytes and executable state, and safety observations.
Repeated unchanged inspection has the same identity; changes to bound inputs
change it. `start --confirm` checks this identity after explicit maintainer confirmation.

Known blockers include missing commits, dirty Git state, symlink or non-directory
ancestors, special files, case-folded existing-path conflicts, file/directory type
conflicts, ignored or untracked replacement content, and unrelated skill names.
Case conflicts retain every alias and the exact component when present, so
changes to either remain visible and change the inspection identity.
Git assume-unchanged or skip-worktree flags also block eligibility because they
can hide working-tree changes; clear those flags and reconcile content first.
An existing skill conflicts even if its bytes match when no installed baseline
establishes ownership. Existing product state or reserved system-skill content
also blocks initial adoption. Established projects can use `inspect --json` with
their pinned CLI to inspect retained material. That unchanged inspection is
read-only and cannot be started. The resolver
rejects targets overlapping `.git`, `.repo-standards`, or `adopt-standards`.

## Inspect updates

Run a standards update with the project's pinned CLI and the current source and
profile, changing only the stable tag:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards inspect \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.3.0 --profile work --json
```

Run a CLI update using the candidate exact CLI outside the project, omitting all
source flags so it validates the current retained standards:

```sh
repo-standards-bootstrap --cli-version 1.1.0 inspect --json
```

Source and profile switching and changing both pins in one inspection are
blocked. A standards update requires its public source. A CLI update works from
retained inputs if that source is unavailable, but its exact npm package and
dependencies must be public or cached. Every update inspection compares bytes,
executable state, and complete skill inventories with the last-complete
baselines. Any committed or uncommitted local edit blocks the whole update.
Known moved tags, incompatible CLI/format combinations, and changed retained
product state are also blockers or structured failures before mutation.

Exit status 0 means a report was produced, including reports with start blockers.
Status 1 means acquisition, compatibility, prerequisites, or inspection failed.
Status 2 means invalid CLI usage. JSON failures contain `valid: false` and
`errors` with stable `code` and `message` fields. Source-validation failures
include precise resolver diagnostics in `details`. Bootstrap failures go to
stderr and exit 1; otherwise it forwards the invoked CLI's exit status.
