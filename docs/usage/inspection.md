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
| `action` | `readopt` when the caller explicitly requests a new adoption of unchanged retained pins; omitted for ordinary adoption, retained inspection, and updates. |
| `start` | Known blockers and prerequisite status. `eligible` is false for known blockers, null for unverified author prerequisites, and true when neither remains. Start probes every declared prerequisite before installation; contextual declarations stop incomplete after fixes until assessment is available. |
| `identity` | SHA-256 of deterministic report content, prefixed with `sha256:`. |

For an established candidate that changes one pin, `update` is `standards` or
`cli`, `previousSelection` records the current pins, and `retired` lists
declarations that will leave governance while their installed content remains
in place. An unchanged retained inspection omits these update fields and is
read-only unless `--readopt` explicitly requests a new adoption. A complete
discovery-backed re-adoption or update also includes `scopeChanges`, listing
individual additions and removals by declaration relative to the prior complete
adoption. Removed contextual paths remain project content and are not deleted.

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
read-only and cannot be started. Use `inspect --readopt --json` to request a
startable same-pin inspection; its action changes the inspection identity and
must be repeated as `start --readopt --confirm <identity>`. Re-adoption preserves
all pins, requires a complete prior adoption and a clean committed project, and
reuses retained source material when the original source is unavailable. The
resolver
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
repo-standards-bootstrap --cli-version 1.2.0 inspect --json
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

## Discover contextual file scope (v2 sources)

A selected repository declaration with `discovery` uses two read-only inspections.
The first invocation uses the same source, version, profile and project flags
shown above. It returns `repo-standards/inspection/v2` with discovery instructions,
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

The request binds selection, requested action (adoption, update, or retained
inspection), HEAD, index and hidden index flags, and the complete tracked and
non-ignored project snapshot. Observation records file hashes/executable state,
directory inventories and boundaries, effective Git observation settings, and
consulted `.gitignore`, Git info/exclude, and global ignore inputs, including their
absence. Configured ignore paths preserve significant whitespace; an explicitly
empty `core.excludesFile` disables the default global ignore input. It retains relevant settings and ignore hashes, not unrelated Git
configuration, credentials, or external ignore-file contents. The final identity
also binds the proposal, rationale, named targets, and their ancestors. Named
paths remain observed even if ignored. Ignored untracked files cannot be used as
file evidence. Unlisted ignored siblings remain outside the observation promise.

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
There is no separate mandatory scope confirmation. Existing explicit selections
retain inspection/v1; v2 execution uses the [observed-scope contract](script-protocol.md#observed-scope-for-v2-adoption).
Standards updates, CLI updates and same-pin re-adoption repeat this fresh
discovery pass for every active v2 declaration. Use the update commands described
above, or `inspect --readopt --scope <file>` followed by matching confirmed
`start --readopt --scope <file>`. The selection and requested action are bound
into the request and final inspection identities, so retained historical or
ordinary-inspection proposals cannot authorize the new run.

After ordinary v2 completion, retained `inspect --json` remains
`repo-standards/inspection/v2` and exposes `historicalScope` as
`repo-standards/scope-history/v3`: the
accepted inspection identity, source-resolved declarations, materialized concrete
selection, and discovery proposal, rationale, guidance, references, and observation
identities. Ordered `runs` retain each later complete lifecycle point, including
a no-discovery state after all discovery declarations are retired, rather than
erasing or misidentifying the immediately prior authorization context. Its
`evidence: historical` describes prior authorization, even in a
fresh checkout without the source. The ordinary report's current discovery
request is separate and confers no authority or claim of current coverage.
After an amended completion, retained inspection advances to
`repo-standards/inspection/v3`; its `repo-standards/scope-history/v3` adds the
accepted scope revision and immutable amendment records. If a later adoption
completes, the amended run keeps those fields in its ordered `runs` entry.

The committed file stores each discovery run once: the project observation
without the evidence array it implies, and the named observation as the delta of
the confirmed targets and any boundary entry naming them adds. Both are rebuilt
on read with the product's existing derivation, and the newest run is projected
at the top level as before, so this report's historical scope is unchanged.
Scope-history v2 and every earlier format stay readable; the next complete
adoption rewrites the file in the compact form and carries each earlier run
forward once.

Retained inspection reads the committed durable state, which is
`repo-standards/state/v5` after a complete adoption and echoed by `status` as
`repo-standards/status/v5`. It also reads state v4 and every earlier format; the
next complete adoption rewrites the state in the compact
[work evidence](script-protocol.md#observed-scope-for-v2-adoption) form,
keeping the last-complete, scope-revision and amendment fields that correlate a
complete run with its retained scope. The retained scope projection in this
report is unchanged.

## Preview scope amendments in an active run

Use the pinned CLI and the active run's retained selection:

```sh
repo-standards inspect --amend-scope --json
repo-standards inspect --amend-scope --scope /tmp/amended-scope.json --json
```

The first command returns fresh discovery guidance, eligible evidence and a
request identity. Build the same `repo-standards/scope/v1` proposal described
above, retaining every previously authorized path under its original declaration.
The complete proposal can add individual files or reconfirm exactly the same
scope with fresh evidence. It cannot remove targets, transfer them between
declarations, change explicit targets, declaration contents, source, profile or
pins. Source/version/profile flags are rejected; no source acquisition is needed.

The report uses `repo-standards/inspection/v3` and `action: amend-scope`:

| Field | Meaning |
| --- | --- |
| `selection`, `source`, `sourceResolved` | The active run's fixed source selection and declarations. |
| `resolved`, `guidance`, `operations` | Proposed concrete targets and unchanged guidance/operations. Without a proposal, the existing targets remain visible. Operations are described, never executed. |
| `discovery` | Current request, eligible evidence and observation; with a proposal, its normalized rationale, absence evidence and named-target observations. |
| `project` | Current root, HEAD, index, hidden index flags, Git status and eligible project observation. |
| `amendment.run`, `amendment.revision` | Active run ID and its currently accepted scope inspection identity. |
| `amendment.existingScope`, `proposedScope`, `additions` | Per-declaration original and proposed authority, with newly requested files separately listed. The latter two require a proposal. |
| `amendment.observations`, `operations`, `assessments` | Work observed under its outgoing scope, definite operation evidence and prior agent assessments. Inspection closes current work only in the returned preview; it writes no journal. |
| `amendment.eligible`, `blockers`, `nextAction` | Whether the proposal passes preview protections and the safe next action. Missing scope yields `DISCOVERY_REQUIRED`; unresolved questions yield `UNRESOLVED_SCOPE`. |
| `start` | Always ineligible with `AMENDMENT_ONLY`; this is not a new adoption inspection. |
| `identity` | Deterministic confirmation identity binding this preview and its active-run request. |

Eligible runs are at contextual handoff or a later contextual, scope or check
block with definite author-operation outcomes. Pending contextual assessment
alone is not an uncertain author process. A live CLI worker or author process
blocks inspection; uncertain work requires the existing explicit `resume --retry`
first. Verification checks exact bytes/modes, skills, runtime dependencies,
retained inputs and installed product inventory against the saved expectations.
HEAD, index and hidden index flags must match the run's original inspection.
The working tree may contain authorized adoption changes: initial clean-start
rules do not apply to this continuation.

Every previously observed interval is validated against its own outgoing scope,
including current agent work. A recorded violation continues to block amendment
even after the file is restored, and adding the violated path to the proposal
cannot authorize the earlier write. Removal or transfer returns
`SCOPE_RECONCILIATION_REQUIRED`, explaining that a mistaken target requiring
withdrawal leaves the run incomplete and needs reconciliation outside this run.
Abandonment preserves work; it does not create reusable complete ownership.

Request freshness binds the action, full active journal and saved installation
identity, scope revision, outgoing-scope observations, current working changes,
selection, evidence and relevant observation/ignore inputs. The final identity
also binds the complete proposal and rationale. Named paths and ancestors remain
observed even when ignored. Installed exact files, author/system skills and
product state are verified separately and excluded from discovery evidence,
including directory inventories. Ancestors absent before installation are also
excluded when only installed output remains beneath them. Pre-existing empty
directories and ancestors containing project-owned work remain eligible.
Local operation logs are not project membership evidence. Original work
intervals still account for installed paths and their ancestors.
The same observation bounds and failure protections apply.
Repeated unchanged inspection has the same identity. Stale proposals require a
fresh request and evidence review, not just a replaced request string.

Inspection performs no exact installation, scope acceptance, author execution or
project mutation. `amendment.eligible: true` means the preview passed; it grants
no new write authority. After explicit maintainer confirmation of the complete
preview, accept and continue it with the same proposal and identity:

```sh
repo-standards resume --amend-scope --scope /tmp/amended-scope.json \
  --confirm 'sha256:AMENDMENT_INSPECTION_HASH' --json
```

Resume reconstructs and verifies the preview before recording the new revision.
Do not write to added paths before this command accepts them. The command cannot
be combined with assessment submission, retry, source/profile/pin changes or a
new adoption action. Stale evidence or confirmation leaves the prior scope
authoritative and the work preserved.
