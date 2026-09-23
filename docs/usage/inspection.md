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
failures structured JSON on stdout. `--summary` renders the report as
[Markdown](#markdown-summary) instead.

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

Every report has the single format `repo-standards/inspection/v4`. A profile
with discovery declarations adds the `discovery` and `sourceResolved` fields
described [below](#discover-contextual-file-scope):

| Field | Meaning |
| --- | --- |
| `selection` | Exact CLI package/version, canonical standards URL, version tag, commit SHA, and profile. |
| `source`, `resolved` | Validated metadata and the resolver's complete active profile. |
| `exact` | Declaration and target; `create`, `replace`, or `match`; each file's before and after hash inventories; a unified `diff` for a changed text file, or `binary: true` for changed binary content, which carries only its before and after hashes. |
| `systemSkill` | The reserved `.agents/skills/adopt-standards` target and `create`, `replace`, or `match` against the system skill packaged with the inspecting exact CLI. |
| `guidance` | Guidance by source-relative `source` path, SHA-256 and executable state, with its explicit project paths or directory trees. |
| `operations` | Ordered fixes and checks, literal arguments, the script by path and hash, resource hash inventories, timeout, and declared prerequisite probe/range. |
| `project` | Canonical project root and hash inventories of the affected targets, the reserved system skill, and the durable product state. Git HEAD, index, and status are not reported. |
| `inputs`, `manifest` | Hash inventories of the selected source material, and the hash of the normalized single-profile metadata, that adoption retains. |
| `start` | Known blockers and prerequisite status. `eligible` is false for known blockers, null for unverified author prerequisites, and true when neither remains. Start probes every declared prerequisite before installation; contextual declarations stop incomplete after fixes until assessment is available. |
| `identity` | SHA-256 of deterministic report content, prefixed with `sha256:`. |

For an established adoption, the report is an update. `update` lists every
changed selection component, in the order `cli`, `standards`, `source`, and
`profile`, and is empty for an unchanged selection. The standards component
changes with the version tag or its commit. `previousSelection` records the
current selection, and `retired` lists declarations that will leave governance
while their installed content remains in place. Initial adoption omits these
fields. Any update can be confirmed and started; an unchanged selection is
applied again. A complete discovery-backed update also includes `scopeChanges`,
listing individual additions and removals by declaration relative to the prior
complete adoption. Removed contextual paths remain project content and are not
deleted.

Every update report states its class in `updateClass`. It is an **exact update**
(`exact`) only when each declaration's guidance, discovery guidance, and
operations, including their scripts, arguments, and resources, are
hash-identical to the retained inputs, its confirmed scope is unchanged, and no
declaration retires. Exact content, skills, and the selection itself can change
in an exact update, and an unchanged selection is one. Any other difference
makes it a **contextual update** (`contextual`). `contextualChanges` lists each
differing declaration by ID with what differs, in the order `guidance`,
`discovery`, `operations`, and `scope`, or `retired` for a declaration the
candidate no longer declares; it is empty for an exact update. Operations
compare their complete definitions, including prerequisite probes and timeouts.
An active discovery declaration differs in `scope` until a scope proposal
confirms its paths, so a report still awaiting that proposal is contextual.
The class describes the update; it does not decide how the update is handled.
Initial adoption omits both fields.

For an established selection, `project.productState` is the hash inventory of
the full durable `.repo-standards/` tree, including unexpected files. Inspection
rejects additions or removals from its recorded file inventory before creating
an adoption run. This verification is independent of the discovery observation,
which excludes durable product state entirely. Only `.repo-standards/local/`,
`.repo-standards/cache/`, and `.repo-standards/runtime/node_modules/` are
excluded from this observation; equally named directories elsewhere remain part
of durable state. Installation and final verification use the same inventory
rules.

Reports embed no file bytes. A hash inventory keeps the observed tree: a
directory lists its `entries` by name, each file has its `sha256` and
`executable` state, and links and unsafe entries keep their observation. Text is
lossless UTF-8 without NUL bytes; anything else is binary. A changed text file's
`diff` is a unified diff with three lines of context, `a/` and `b/` path
prefixes, `/dev/null` for a missing side, and the `\ No newline at end of file`
marker. A matching or mode-only change has no diff, and neither has creating
or deleting an empty file, which the before and after states express. Read referenced guidance,
discovery guidance, scripts, and resources at their source-relative paths in
the standards source at `selection.standards.commit`; adoption retains the same
bytes at `.repo-standards/inputs/source/<path>`. Start acquires the source again
and verifies its bytes against the hashes the confirmed identity binds, so a
report needs no bytes to remain safe.
Whole-skill inventories include existing and supplied files.
Matching exact files and skill directories are claimed without rewriting during
adoption.
When an existing exact target conflicts with the supplied file/directory type,
the replacement entry retains both complete root observations, including any
directory inventory. The type conflict remains a start blocker.
Operations list all fixes before all checks; within each phase, declarations
appear by ID and operations retain their declared list order.
Contextual content stays project-owned. All author prerequisites remain
`not-checked`: inspection cannot establish them without running probes.

Identity has no timestamp or random acquisition path. It binds what the run
reads: the exact selection, resolved declarations and materials through their
hashes, the project root, affected bytes and executable state through their
hashes, the product-state inventory, blockers and safety observations, and,
when discovery is active, the discovery observation and confirmed scope. Git
HEAD, the index, and Git status are not bound, except through the start
blockers they produce, such as a dirty tree. A commit that touches nothing the
run reads leaves the identity unchanged, so a confirmation survives unrelated
work between inspection and start; a change to an affected file's bytes or mode,
a retained input, or the product-state inventory changes it. The discovery
observation spans the tracked and non-ignored tree, so for a discovery-backed
selection most commits change the identity. Start still requires a clean
committed tree, and the run records HEAD at start for provenance. Repeated
unchanged inspection has the same identity. `start --confirm` checks this
identity after explicit maintainer confirmation.

Known blockers include missing commits, dirty Git state, symlink or non-directory
ancestors, special files, case-folded existing-path conflicts, file/directory type
conflicts, ignored or untracked replacement content, and differing unowned skills.
Case conflicts retain every alias and the exact component when present, so
changes to either remain visible and change the inspection identity.
Git assume-unchanged or skip-worktree flags also block eligibility because they
can hide working-tree changes; clear those flags and reconcile content first.
An existing skill directory without an installed baseline is claimed when its
complete inventory, bytes, and executable state match the supplied skill; any
difference in a file, mode, or inventory entry is a `SKILL_CONFLICT`. Initial
adoption claims existing reserved system-skill content the same way when it
matches the skill packaged with the inspecting exact CLI and reports
`SYSTEM_SKILL_CONFLICT` otherwise. Existing product state blocks initial
adoption with `EXISTING_ADOPTION`; see
[adopting afresh over installed content](adoption.md#adopt-afresh-over-installed-content).
Established projects can use `inspect --json` with their pinned CLI to inspect
the unchanged selection from retained material. Confirming that inspection
starts a run that applies the selection again. It requires a complete prior
adoption and a clean committed project, and reuses retained source material
when the original source is unavailable. The resolver
rejects targets overlapping `.git`, `.repo-standards`, or `adopt-standards`.

## Inspect updates

Every change to an established selection is one update: the CLI pin, the
standards version, the source, the profile, or any combination. Pass all three
source flags to select a standards version, source, or profile. With the
project's pinned CLI:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards inspect \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.3.0 --profile work --json
```

To change the CLI pin, run the candidate exact CLI outside the project. Omit
the source flags to keep the current retained standards, or pass them to change
the standards selection in the same inspection:

```sh
repo-standards-bootstrap --cli-version 1.2.0 inspect --json
```

Selecting a standards version, source, or profile requires its public source.
Without source flags, inspection works from retained inputs if the source is
unavailable, but a changed CLI pin still needs its exact npm package and
dependencies to be public or cached. The author's `requires.repo-standards`
range is checked only when a standards version is selected from its source;
retained inputs are validated against the running CLI's supported source
formats alone. Every update inspection compares bytes, executable state, and
complete skill inventories with the last-complete baselines. Any committed or
uncommitted local edit blocks the whole update. Known moved tags, incompatible
CLI/format combinations, and changed retained product state are also blockers
or structured failures before mutation.

Exit status 0 means a report was produced, including reports with start blockers.
Status 1 means acquisition, compatibility, prerequisites, or inspection failed.
Status 2 means invalid CLI usage. JSON failures contain `valid: false` and
`errors` with stable `code` and `message` fields. Source-validation failures
include precise resolver diagnostics in `details`. Bootstrap failures go to
stderr and exit 1; otherwise it forwards the invoked CLI's exit status.

## Markdown summary

`inspect --summary` renders the report as a Markdown proposal on stdout instead
of JSON. It has these sections, in order:

- **Selection**: each selection component before and after, and the changed
  components; initial adoption has no previous selection.
- **Update class**: for an update, whether it is an exact or a contextual
  update, and each declaration that makes it contextual.
- **Changed declarations**: exact content by declaration and path, created,
  modified, deleted, or mode changed, including the reserved system skill; and
  contextual declarations with their targets and what changed.
- **Operations**: every fix and check with its literal argument vector,
  prerequisite probe and range, and timeout.
- **Scope changes**: discovered-scope additions and removals by declaration,
  the confirmed discovered scope of an initial adoption, or that discovery
  scope is not confirmed yet.
- **Retired declarations**: for an update, the declarations that leave
  governance.
- **Blockers**: present only when the report has start blockers.
- **Identity**: the inspection identity and start eligibility.

The summary is a pure rendering of the report: the same report renders the same
bytes, so two inspections with the same identity print the same summary. It
describes the report and prescribes nothing. Failures print the usual diagnostic
on stderr, and combining `--summary` with `--json` is a usage error with exit
status 2. [`status --summary`](adoption.md#summarize-status) renders the status
record the same way.

## Discover contextual file scope

A selected repository declaration with `discovery` uses two read-only inspections.
The first invocation uses the same source, version, profile and project flags
shown above. Its `repo-standards/inspection/v4` report adds discovery instructions,
eligible evidence, a request identity, and `DISCOVERY_REQUIRED` in `start.blockers`.
The report still includes exact changes, contextual guidance, and all operations.
Unresolved declarations remain in `sourceResolved`; they do not manufacture
executable targets in `resolved`.

Read each declaration's discovery guidance and inspect the eligible files to
explain which candidates meet the author's criteria. Inventory and hash evidence
establish what was observed; they do not prove that a candidate is a maintained
project. Explain exclusions such as fixtures, generated output, and organizational
directories, and disclose unresolved questions. The adopter reviews semantic
coverage together with the complete inspection.

Write a JSON proposal **outside the adopting project**, then inspect it:

```sh
repo-standards inspect \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work \
  --scope /tmp/project-scope.json --json
```

The proposal has exactly this structure (replace request and evidence identities
with values from the first report):

```json
{
  "format": "repo-standards/scope/v1",
  "request": "sha256:REQUEST_FROM_INSPECTION",
  "declarations": [
    {
      "id": "project-docs",
      "paths": ["apps/widget/README.md"],
      "coverage": "Widget is the only maintained project; the other candidates are fixtures.",
      "evidence": [
        {"kind": "directory", "path": ".", "identity": "sha256:ROOT_INVENTORY_IDENTITY"}
      ],
      "candidates": [
        {
          "path": "apps/widget/README.md",
          "decision": "include",
          "reason": "The manifest and source establish project membership.",
          "evidence": [
            {"kind": "file", "path": "apps/widget/package.json", "identity": "sha256:FILE_IDENTITY"},
            {"kind": "absence", "path": "apps/widget/README.md"}
          ]
        },
        {
          "path": "fixtures/fake",
          "decision": "exclude",
          "reason": "This directory supplies test data, not a maintained project.",
          "evidence": [
            {"kind": "file", "path": "fixtures/fake/package.json", "identity": "sha256:FIXTURE_FILE_IDENTITY"}
          ]
        }
      ],
      "unresolved": []
    }
  ]
}
```

Supply exactly one entry per active discovery declaration, and none for explicit
or excluded declarations. All fields shown are required; unknown fields,
duplicate keys, duplicate list entries, unsupported formats, and invalid or stale
evidence references fail. Lists are unordered and normalized; explanation text is
preserved verbatim and changes the final inspection identity.

`paths` contains individual repository-relative filenames, including intended
new files. Every path needs an included candidate with a reason and evidence.
Excluded candidates may describe directories or exact/reserved paths and must
not be included in that entry's paths. Every candidate uses the shared safe,
repository-relative explicit-path syntax; exclusions cannot use root, parent,
absolute, backslash, or glob paths. Every entry needs a nonempty coverage explanation and evidence,
even with empty `paths` and `candidates`. Empty scope retains the declaration,
guidance, and its fixes/checks. Nonempty `unresolved` produces an inspectable
report with `UNRESOLVED_SCOPE`, never a startable result.

Copy file and directory references from `discovery.evidence`. Directory inventories
contain eligible immediate child paths, not all ignored siblings. Absence references
have only `kind` and `path`: the CLI observes the named target and ancestors and
returns the derived identity in `discovery.absence`. Every absent target requires
absence evidence. A missing README additionally needs a file or nonempty directory
inventory within its project directory as positive membership evidence. The CLI
checks this structural support; the agent and adopter judge its meaning.

Discovered paths reuse the shared target validation: no directories, globs, root
write scope, unsafe ancestors, symbolic links, special files, exact/reserved overlaps,
duplicate ownership, or aliases under Unicode normalization and case folding.
A valid proposal populates ordinary `targets.paths` with empty `targets.directories`
in `resolved`; the source declarations in `sourceResolved` and the retained source
`manifest` remain unchanged. The complete report includes normalized proposal,
rationale, candidate exclusions, guidance, exact changes, and operations together.

The request binds the selection, the durable product-state inventory, and the
complete tracked and non-ignored project snapshot; HEAD and the index are not
bound. Observation records file hashes/executable state,
directory inventories and boundaries, effective Git observation settings, and
consulted `.gitignore`, Git info/exclude, and global ignore inputs, including their
absence. Configured ignore paths preserve significant whitespace; an explicitly
empty `core.excludesFile` disables the default global ignore input. It retains relevant settings and ignore hashes, not unrelated Git
configuration, credentials, or external ignore-file contents. The final identity
also binds the proposal, rationale, named targets, and their ancestors. Named
paths remain observed even if ignored. Ignored untracked files cannot be used as
file evidence. Unlisted ignored siblings remain outside the observation promise.
Durable product state is excluded from every discovery observation: no file
state, evidence entry, directory inventory, or boundary is recorded for
`.repo-standards/` or anything beneath it, and its bytes never count toward the
limits below. Inspection verifies that tree separately and reports it as
`project.productState`.

Inspection compares observations again before returning. Read failures, unsafe
state, detected instability, or exceeded limits return a structured error without
a partial successful report. Each observation is bounded to 20,000 directory
entries/file observations, 128 directory levels, 8 MiB per file, 64 MiB of file
reads, and 30 seconds of traversal. Proposals are limited to 2 MiB. There is no
continuous monitoring or atomic filesystem snapshot guarantee. After a stale
request, run the first inspection again and review evidence before revising the
proposal; changing only its request string is not a substitute for that review.

For initial adoption, obtain one confirmation of this complete inspection and
pass the same external proposal file and identity to start:

```sh
repo-standards start --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --scope /tmp/scope.json \
  --confirm 'sha256:INSPECTION_HASH' --json
```

Start reconstructs the inspection before prerequisites and again before
installation. Missing, invalid, unresolved, or stale scope cannot authorize
mutation. Initial clean committed-project and prerequisite rules still apply.
There is no separate mandatory scope confirmation. Explicit-target selections
produce the same report format without `discovery`; execution uses the
[observed-scope contract](script-protocol.md#observed-adoption-scope).
Every update, including an unchanged selection, repeats this fresh discovery
pass for every active discovery declaration: pass `--scope <file>` to the
update commands described above and to the matching confirmed start. The
selection, product-state inventory, and project observation are bound into the
request and final inspection identities, so retained historical proposals cannot
authorize the new run.

After ordinary discovery completion, retained `inspect --json` remains
`repo-standards/inspection/v4` and exposes `historicalScope` as
`repo-standards/scope-history/v3`: the
accepted inspection identity, source-resolved declarations, materialized concrete
selection, and discovery proposal, rationale, guidance, references, and observation
identities. Ordered `runs` retain each later complete lifecycle point, including
a no-discovery state after all discovery declarations are retired, rather than
erasing or misidentifying the immediately prior authorization context. Its
`evidence: historical` describes prior authorization, even in a
fresh checkout without the source. The ordinary report's current discovery
request is separate and confers no authority or claim of current coverage.

The committed file stores each discovery run once: the project observation
without the evidence array it implies, and the named observation as the delta of
the confirmed targets and any boundary entry naming them adds. Both are rebuilt
on read with the product's existing derivation, and the newest run is projected
at the top level. Scope-history v3 is the only format written and read.

Retained inspection reads the committed durable state, which is
`repo-standards/state/v5`, the only state format, with its
[work evidence](script-protocol.md#observed-adoption-scope) as
identities and deltas; `status` echoes it as `repo-standards/status/v5`.
Inspection rejects a committed state, retained scope history, or run record in
a retired format with `RETIRED_FORMAT` before reading anything else; nothing is
converted. [Adopt fresh](adoption.md#adopt-fresh-from-a-retired-format) to
continue.

A confirmed scope never changes during a run. When contextual work needs files
outside it, or a confirmed target is mistaken, preserve the work, abandon the
run, commit or discard its changes, and inspect again with a new proposal; see
[Correct a confirmed scope](adoption.md#correct-a-confirmed-scope).
