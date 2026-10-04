# Repository Standards — architecture contracts

This document describes the current contracts of CLI 4.0.0; individual tickets
state implementation scope, and the [architecture decisions](../adr/README.md)
record the rationale.

## Purpose and release boundary

Publish and apply versioned repository standards through deterministic tooling
and agent-guided workflows.

The product is Repository Standards, its GitHub repository is
`lutzseverino/repo-standards`, and its CLI is `repo-standards`. The repository is
public and MIT-licensed. Implementation uses TypeScript, ESM, Node.js 24, and
pnpm. Inspection, start, resume, and check require Git 2.32 or newer, checked before
observing project state, so Git never follows a symbolic `.gitignore` whose
referent the identity does not bind. The product supports macOS and Linux.

The product supports both journeys:

1. An author validates a local standards repository and publishes a stable
   version on public GitHub. It is directly adoptable and discoverable by topic.
2. An adopting project inspects one complete profile, adopts it, commits the
   resulting material through its own workflow, and later deliberately updates
   its selection, in any combination of its pins, source, and profile, through
   one confirmed run.

The maintainer's own standards are published separately as Repo Canon; the
product remains neutral for independently authored standards.

## Roles and responsibility

- The product repository owns the format, CLI, bootstrap, and system skills.
- A standards repository owns its standards, complete profiles, ordinary
  content, contextual guidance, author skills, and trusted checks and fixes.
- An adopting project owns its project content and normal change workflow.

The product does not implement an author's adoption procedure. All authors use
the same resolution and adoption interfaces. Authors cannot replace system
skills or provide adoption hooks. `adopt-standards`, `standards-updates`, and
`author-standards` are product-owned system skill names reserved within the
standards format.

## Deep modules

| Module | Interface and responsibility |
| --- | --- |
| Source acquisition | A public GitHub identity and stable version produce an immutable source snapshot and provenance. Search provides candidates without establishing trust. |
| Resolver | A source and profile produce one validated source-resolved selection, or structured errors. Discovery references remain distinct from executable targets until project scope is confirmed. This is the sole interpreter of the author format. |
| Repository state | A resolved selection and observed project produce an inspection, its update comparison and class, freshness identities, and durable adoption progress. The update comparison takes the verified recorded adoption, the candidate selection and materials, and the project's observed product state. It rejects a recorded tag that now resolves to a different commit, and returns the whole update part of an inspection, which is the changed selection components, the previous selection, the retired declarations, the update class and contextual changes, and the product-state-integrity blocker. Scope changes stay with inspection, which holds the scope proposal. |
| Declaration targets | A resolved declaration produces the targets it applies to, as paths and directory trees: an exact file's or skill's one installation target, or contextual guidance's targets. It also produces each skill's link and the text the product writes there, and holds the system skills: each reserved name, target, and link, and the ones adoption installs. Every other module asks it rather than deriving a skill's target or link, a declaration's targets, or the system skills itself. |
| Target ownership | Each installation target's current content, its installed baseline when one exists, its candidate content when one exists, and whether that content is tracked produce its target ownership: the action a run would take on it (match, create, or replace; a recorded target the selection no longer installs has a missing candidate, so its removal is a replacement, unless it overlaps contextual scope or lies at or inside a target the selection still installs, where it has no candidate and no action), whether that action discards content other than the installed baseline, and its one ownership blocker, untracked replacement content. The rule is the same for every target kind in every run. Inspection observes each target once and is its only caller. |
| Recorded adoption reader | The product state directory produces one verified value of what the last complete adoption left: selection, lock, durable state, baselines, skills, skill links, resolved declarations, retained source, scope evidence, and execution evidence, each matched against the lock before it is read, or one state-integrity failure. Inspection, start, resume, status, and check read an established adoption only through it; every command first rejects retired records in the product state and Git directories through it, which is all resume and abandon need while a run is active. `outdated` reads the selection leniently instead. |
| Installation | A confirmed inspection produces one run's installation plan, not the adoption itself: the exact content, skills, skill links, retained inputs, durable product state, and runtime an adoption run installs, the links it removes, and, for an update, the last complete adoption's durable state, kept in place until completion replaces it unread. It installs itself across interruptions, verifies itself, and produces the durable state and lock a completion writes. The run session saves it with the run and leaves interpreting the plan to this module. |
| Execution | Confirmed adoption progress advances through exact installation, literal process execution, checks, and final integrity. Final integrity is the run-time check of the run's planned installation, distinct from the recorded adoption reader's check of the committed baseline a run starts from. `check` runs the recorded adoption's checks through the same prerequisite probes and process execution outside any run, observing that each leaves the project unchanged. |
| Work evidence | The work-evidence journal owns an adoption run's observation intervals: it opens one for a phase and scope after recording any unattributed gap as an agent interval, closes intervals with their violation checks, continues after an interruption by recording and saving without checking, so each caller requires authorization where it holds, and answers what the agent changed. It keeps the one observation its last interval ends at behind an observation store seam: a file store beside the run journal for runs, an in-memory store for abandonment. Intervals and operation outcomes produce the run's execution evidence as identities and deltas, in one shape shared by the run record, the local run report, and committed durable state, which holds the current run only. At completion, the installation's changes and the intervals produce the run's net change set. |
| Scope evidence | A confirmed run and the recorded adoption it updates produce the retained scope evidence: the current run, with its project observation kept without derived evidence and its named observation as a delta, and its scope change against the previous run. The projected historical scope is rebuilt on read. |
| Available updates | A selection and the newest published stable CLI and standards versions produce per-pin availability, cached in the ignored product cache. It never blocks and writes nothing else; it fails only under a CLI other than the selection's CLI pin, before any lookup. |
| Summary renderer | An inspection report or a status record produces one deterministic Markdown document. It describes and never prescribes. |
| Update notice | The `standards-updates` system skill runs `outdated` with the project runtime, reinstalling the pinned runtime once when it is missing or reports `CLI_PIN_MISMATCH`, and reports each available update to the agent. It starts no update: one starts only on the maintainer's instruction, through adoption orchestration, as a change separate from the current work. |
| Adoption orchestration | The `adopt-standards` system skill presents inspection and its summary, obtains confirmation, performs requested contextual work, and submits evidence through the CLI. |

These responsibilities do not mandate separate packages or class hierarchies.
They share the resolver's result. Other modules do not independently interpret
author YAML. The public CLI is the main testing seam.

## Author contract

One root `standards.yaml` declares the format, descriptive name and description,
compatible CLI version range, shared defaults, and at least one named profile.
Source paths refer to ordinary files in that standards repository.

Declaration IDs are stable, local, lower-case kebab-case names. A resolved
declaration is one complete unit containing content or guidance and its checks
and fixes. It has one of four forms:

- Exact file: supplied bytes at one target.
- Contextual file: referenced guidance for one project-owned target.
- Exact skill: one whole Agent Skill directory, installed under its skill name.
- Repository guidance: contextual guidance over explicit paths or directory
  trees, or a separate discovery-guidance reference. There are no glob patterns.

There are exactly two resolution levels: defaults and selected profile. A
profile inherits an omitted declaration, wholly replaces a declaration with the
same ID, excludes it with `exclude: true`, or adds a new ID. Fields never merge.
Exclusion removes the associated checks and fixes as well as the content or
guidance. A renamed ID represents retirement and addition.

### Concrete author example

This example consolidates the agreed public structure and is the packaged
[Alice example](../../examples/alice/standards.yaml). Operation IDs are local
to their declaration; prerequisite fields and literal invocation follow the
script contract below.

```yaml
format: repo-standards/v2
name: alice-standards
description: Alice's repository standards
requires:
  repo-standards: ">=1.2.0"

defaults:
  declarations:
    agent-guidance:
      kind: file
      target: AGENTS.md
      exact: defaults/files/AGENTS.md

    contribution-guidance:
      kind: file
      target: CONTRIBUTING.md
      exact: defaults/files/CONTRIBUTING.md

    readme:
      kind: file
      target: README.md
      guidance: defaults/guidance/readme.md
      checks:
        - id: headings
          run:
            executable: python3
            script: defaults/checks/readme.py
            resources: []
            arguments: []
          prerequisite:
            version-arguments: ["--version"]
            version: ">=3.12.0 <4.0.0"
          timeout-seconds: 60

    review-skill:
      kind: skill
      name: review
      source: defaults/skills/review

    source-layout:
      kind: repository
      guidance: defaults/guidance/source-layout.md
      targets:
        paths: []
        directories: [src]

profiles:
  personal:
    description: Standards for personal projects
    declarations: {}

  work:
    description: Standards for work projects
    declarations:
      agent-guidance:
        kind: file
        target: AGENTS.md
        exact: profiles/work/files/AGENTS.md
      contribution-guidance:
        exclude: true
```

Bob selects the `work` profile. Its exact `AGENTS.md` replaces the default
declaration. Its README guidance, review skill, and source-layout guidance are
inherited. Its contribution declaration and any checks or fixes owned by that
declaration are absent. Bob's existing employer-owned `CONTRIBUTING.md` stays
outside that profile's governance.

Validation rejects unknown fields, duplicate identities, missing references,
invalid versions, malformed operations, invalid exclusions, reserved skill
names, inconsistent skill invocation settings, and any profile that cannot
resolve. It reports all determinable errors with stable codes and precise YAML
locations.

Author skills' `SKILL.md` frontmatter `disable-model-invocation` and
`agents/openai.yaml` `policy.allow_implicit_invocation` must agree; an absent
setting means model-invocable. Product skills state both settings explicitly:
`adopt-standards` is manual only, and `standards-updates` and `author-standards`
are model-invocable.

Source and target paths are repository-relative and cannot escape their roots.
Selected sources cannot contain symbolic links. Targets and their ancestors
cannot be symbolic links during adoption, with one exception: a skill link
holding exactly the text the product writes at its path. Concrete targets,
including the skill link of each declared skill, cannot overlap, including
case-folded collisions. Product-owned state, every system-skill path
(`.agents/skills/adopt-standards`, `.agents/skills/standards-updates`, and
`.agents/skills/author-standards`), and each system skill's link path
(`.claude/skills/<name>`) are reserved, including equal paths,
ancestors, descendants, and collisions under the same case-folded and
Unicode-normalized comparison. This applies to
exact files, contextual files, and repository guidance as well as author skills,
across defaults and all profiles, including those not selected for inspection.
Reserving `author-standards` does not change the schema or the two-level
resolution semantics.

### Source resolution and validation limits

Repository guidance retains `guidance` for contextual work and chooses exactly
one of explicit `targets` or `discovery`, a regular source-file reference containing
criteria for identifying applicable project files. Both references use the existing
safe, readable source-reference contract. Other kinds, operations, declaration
identities, and complete replacement/exclusion semantics remain unchanged.

The Resolver alone interprets the author format. Source resolution preserves
unresolved discovery without manufacturing empty or broad executable targets.
Execution accepts concrete targets; unresolved discovery cannot authorize
adoption. Inspection returns a report with a `DISCOVERY_REQUIRED` blocker when
scope is missing. Initial start receives the same valid proposal and confirmed
complete inspection identity and reconstructs inspection before mutation. Inspection accepts
`repo-standards/scope/v2` proposals through `--scope`, returns explicitly versioned
`repo-standards/inspection/v6` reports, and binds a complete eligible project
snapshot, relevant observation/ignore inputs, and named targets and ancestors.
A proposal carries only the agent's judgment per active discovery declaration:
candidates with their decisions, reasons and evidence paths, coverage, and
unresolved questions. Inspection derives the request binding, evidence
identities and included paths from its own observation, and checks that every
active discovery declaration has exactly one entry.
The [inspection contract](../usage/inspection.md#discover-contextual-file-scope)
defines evidence paths, strict proposal validation, observation limits, and
the distinction between source declarations and materialized concrete targets.
Profiles without active discovery continue through the existing concrete-target
path.

Source validation checks all profiles, including unselected profiles and references
of excluded/replaced defaults, without author-code execution. It reports verified
schema, references, operations, reservations, and determinable explicit-target
conflicts separately from the need for project inspection, discovery, and semantic
review. A valid source does not prove concrete scope safety or semantic completeness
in an unfamiliar project. Discovery resolves to individual file paths, retaining
the existing disjoint ownership rules. Explicit directory targets remain disjoint;
there is no protection language, exact-descendant subtraction, discovery script,
or additional ownership model.

## Publication and compatibility

Local directories are accepted for author validation. Adoption accepts public
GitHub repositories with stable SemVer tags. A selection records the canonical
repository URL, version tag, and resolved commit SHA. Branches and floating
references are not pins. A previously observed tag resolving to another commit
is rejected; retained inputs continue to identify the original adoption.

Discovery searches the `repo-standards` GitHub topic. A discoverable source is
public, has the root declaration, and has a stable SemVer release. Discovery
does not endorse a source or automatically select a profile.

Every source declares `repo-standards/v2`, the one source format, and a
compatible CLI SemVer range; unsupported formats fail explicitly. The author's
range gates selection only: source resolution checks it when a standards
version is selected from its source. Retained inputs are validated against the
running CLI's supported source formats, which carry the compatibility promise,
so a CLI update over retained standards never fails on the retained range.
Validation diagnostics and the authoring guide recommend an open-ended minimum,
such as `>=1.3.0`. Source Git provenance and SHA-256 hashes of retained inputs
are recorded independently of the exact CLI package pin.

## CLI and bootstrap

| Operation | Observable result |
| --- | --- |
| `source validate` | Validates a local source and all its profiles without running author code. |
| `source search` | Finds public GitHub candidates and metadata. |
| `inspect` | Describes the exact selection, the update comparison and class, proposed changes, guidance, operations, prerequisites, and conflicts without modifying the project or running author code. `--summary` renders the report as a Markdown proposal. |
| `start` | Validates the confirmed inspection and advances adoption until completion, a problem, or required contextual work. |
| `resume` | Continues the existing run, including accepting `--assessment <file>` and explicitly retrying interrupted work. |
| `status` | Reports current pins, progress, and historical evidence without any network request or implying continuing compliance. `--summary` renders the last complete or active run as a Markdown record. |
| `abandon` | Ends an incomplete run while retaining its changes and report. |
| `outdated` | Reports, for each pin, whether a newer stable CLI or standards version is published and by how many stable releases, without blocking or changing anything outside the ignored product cache. |
| `check` | Runs every retained check of the last complete adoption against the working tree, outside any run and without confirmation, and reports each result; fails when any check does not pass or changes the project. |

`--summary` is a peer of `--json` on `inspect` and `status`; combining them is a
usage error. One renderer module produces both summaries, and the same report
or record renders the same bytes. An inspection summary lists the selection
before and after, the update class, changed declarations and paths, operations,
scope changes, retired declarations, blockers when present, and the identity. A
status summary lists the selection, operations and their results, the run's net
change set, scope changes, and identities, or an active run's phase, progress,
and next action.

`outdated` reads the selection and makes at most one npm registry lookup and one
GitHub releases lookup, comparing the newest stable versions with each pin and
ignoring prereleases and non-SemVer tags. It sends a GitHub token from the
environment when one is present, caches each answer for 24 hours under
`.repo-standards/cache/`, and exits 0 whenever it reports: network failure,
exhausted quota, or a missing selection report `unknown` with a reason for each
affected pin. `status` stays offline.

`status`, `outdated`, and `check` require the recorded CLI pin, as `resume` and
`abandon` do. `status` and `check` take it from the active run's selection when
a run is active, where `check` then fails with `ACTIVE_RUN`, and otherwise from
the recorded adoption; `outdated` takes it from the selection it reads. Under
another CLI version they fail with `CLI_PIN_MISMATCH`, naming the pinned
version and, when the project runtime manifest and npm lock both pin it, the
project root and the command that reinstalls the project runtime there;
otherwise they name an exact CLI installed outside the project. `status`,
`resume`, `abandon`, and `check` check that pin before any record format or
integrity validation, and before acquiring a worker lock. `outdated` fails
before any lookup. Without a recorded pin they report under any CLI. Only
`inspect` and `start` treat a different exact CLI as a candidate CLI pin change.
`outdated`, the update class, and both summaries describe. Whether to take an
available update is the maintainer's decision: the update notice reports it and
starts nothing, and a requested update is a change of its own. How any change
is delivered belongs to standards content; the product prescribes no delivery
workflow.

The thin user-installed bootstrap obtains one exact CLI version outside the
project for first inspection. An omitted version selects the latest stable
once and discloses it. Confirmed adoption installs that version and the matching
repository-local `adopt-standards` and `standards-updates` skills. Existing
projects use their own pin.
Adoption does not automatically install `author-standards`; reserving that
identity does not manage unrelated global skill installations or change
adoption runtime pins, system-skill installation, integrity baselines, or
updates.

The CLI is published as `@lutzseverino/repo-standards` with executable
`repo-standards`. Publishing access to the npm scope is a release prerequisite.
Each project has an isolated runtime installation
with a committed package manifest and npm lockfile. Fresh checkouts restore it
with `npm ci --ignore-scripts`. Node.js 24 and npm are prerequisites; missing
prerequisites produce setup instructions. The project's own implementation
language and package manager remain independent.

## Inspection, trust, and start

Inspection identifies exact changes and the trusted author operations that
adoption will execute. Its identity binds what the run reads: the selection,
resolved materials, affected bytes and modes, the product-state inventory, and,
when discovery is active, the discovery observation. It does not bind Git HEAD,
the index, status, or the project root, so an inspection made in any checkout of
the same content confirms a start in another
([ADR 0012](../adr/0012-bind-content-not-location.md)). Reports carry hash
inventories and diffs, not file bytes.
The `adopt-standards` skill obtains explicit confirmation of that inspection;
start rejects stale state before mutation.

For an established adoption, inspection is an update. It reports every changed
selection component, in the order CLI, standards, source, and profile, together
with the previous selection and the declarations that retire. Any combination,
including none, is one update that can be confirmed and started; a confirmed
inspection of the unchanged selection starts a run that applies it again. The
update class is exact only when every declaration's guidance, discovery
guidance, and operations, including their scripts, arguments, resources, and
complete definitions, the retired declaration set, and the confirmed scope are
hash-identical to the retained inputs. Exact content, skills, and the selection
itself can change in an exact update. Any other difference makes the update
contextual, and the report names each differing declaration. The class is a
report field and a summary input; it authorizes and decides nothing.

Inspection works in a dirty Git checkout. Start requires an existing commit,
a clean index and working tree with no untracked files, and the inspected
project state; the run records the project root and HEAD at start for
provenance. It also examines replacement targets for ignored content:
a clean Git status alone does not prove that content is recoverable.

Every skill a run installs, system or author, also gets a skill link
([ADR 0013](../adr/0013-expose-installed-skills-through-skill-links.md)): a
relative symbolic link at `.claude/skills/<name>` whose text is
`../../.agents/skills/<name>`, so that Claude Code, which reads only its own
skill location, sees the skill. A skill link is an installation target whose
baseline is its text. Its observation records the link without following it,
the inspection identity binds it, and durable state records it. A `.claude` or
`.claude/skills` that is itself a symbolic link blocks with `UNSAFE_TARGET`, as
does a link at a skill-link path with any other text. The product never writes
`.claude/skills` as a whole and links only the skills it installs; a skill the
project wrote itself under `.agents/skills/` gets no link. A retired skill's
link is removed with the skill. Links are exact content, so they never make an
update contextual.

Target ownership is one rule for every installation target, including author
skills, the system skills, and skill links, in every run. An existing exact
file or skill directory whose complete inventory, bytes, and modes match the
supplied content is matched without rewriting, and so is a skill link with the
same text. Tracked content that differs is replaced, as shown in the confirmed
inspection, because Git can recover it; a replaced skill directory is replaced
whole, and so is whatever a skill link replaces. Ignored or otherwise untracked replacement
content, including an empty directory, blocks mutation. The inspection lists
each replacement that discards content other than the target's installed
baseline; at initial adoption there is no baseline, so every replacement of
existing content is listed. Existing product state blocks initial adoption.
[ADR 0010](../adr/0010-replace-tracked-content-block-only-untracked.md) records
the decision.

All prerequisite executables and versions are checked before project changes.
Version probes run installed executables directly using declared arguments;
the first SemVer-like output version is compared with the declared range.
Missing executables, failed probes, unreadable versions, or incompatible
versions block adoption. The product never installs author prerequisites.

## Script execution contract

Checks and fixes declare an operation ID, executable, source script, literal
arguments, version probe and range, and timeout. Additional required source
files or directory trees are explicit resources. Invocation is a direct process
argument vector with the retained script path followed by literal arguments.
The working directory is the adopting-project root. There are no author-defined
environment values, shell interpretation, or custom working directories.

One versioned JSON input conveys the operation identity, project root,
standards identity, profile, active resolved declarations, and allowed targets.
The script returns one versioned JSON result on standard output and human logs
on standard error. A check reports `passed`, `failed`, or `blocked`; a fix
reports `unchanged`, `changed`, or `blocked`. Nonzero exits, signals, timeouts,
and invalid protocol output are execution errors.

Scripts are trusted code. Resource declarations describe what the product
retains; they cannot restrict host or network access. Authors must respect the
resolved scope and exclusions and supply fixes safe to repeat. Checks must not
mutate project content. Observed check mutation is an incomplete result with
the changes preserved.

### Observed execution scope

During adoption, each fix's observed additions, deletions, byte
edits, and executable changes must belong to its declaration's concrete targets.
Checks remain read-only. Installation expectations stay immutable, including
against an exact declaration's own fix. Observation failure or a detected
violation leaves adoption incomplete with operation outcomes and work preserved.

Execution observes the eligible project snapshot, individually named targets
and ancestors, consulted ignore inputs, and explicit directory trees (including
ignored descendants). Unlisted ignored siblings outside these trees are not
inventoried. Bounded, repeated observations detect incomplete reads and observed
instability; this is neither continuous monitoring nor host/network sandboxing.

Separate fix, check, and agent intervals retain their before and after
observation identities, applicable concrete scope, changed paths, violations,
and interruption evidence.
Retry closes the outgoing interval before replay, retains agent changes even
when fixes subsequently overwrite the same files, and requires renewed
assessment and checks. Detected scope violations cannot be erased by retry;
abandon and reconcile before a new confirmed adoption. Installation, process
liveness, concurrency, clean initial starts, and abandonment keep their existing
contracts. See the [script](../usage/script-protocol.md#observed-adoption-scope)
and [assessment](../usage/assessment-protocol.md#observation-and-replay) protocols.

## Adoption sequence and agent interface

1. Verify confirmation freshness and all prerequisites.
2. Install exact content, runtime state, pinned system skills, and skill links.
3. Run declared fixes serially.
4. Return a contextual work request if required.
5. Validate the submitted agent assessment and observed changes, binding it to
   the run and deriving its changed paths.
6. Run checks and collect their evidence.
7. Verify final content integrity and record complete adoption state.

Within phases, declarations run by ID and operations in their declared list
order. Cross-declaration dependencies are unsupported. Fixes stop on the first
block or execution error. Ordinary check failures do not prevent collecting
the remaining check results.

A work request identifies its adoption run, applicable guidance, allowed
targets, and evidence requirements. The agent performs the contextual work and
submits only its judgment, `satisfied` or `blocked`, an explanation, and
supporting evidence for each contextual declaration through
`resume --assessment`.

The CLI binds the accepted assessment to the active run, its resolved selection,
and the project snapshot at submission, and derives each declaration's changed
paths from the run's observed agent changes and allowed targets. An observed
change outside the allowed targets makes adoption incomplete. Snapshots include
tracked and non-ignored untracked project content, excluding generated product
state. A subsequent content change before completion requires reassessment and
checks again.

Final verification compares installed exact files, complete skill inventories,
retained inputs, and product state against their expected values. Later phases
cannot silently redefine installation baselines.

## Durable state and ownership

```text
.repo-standards/
  selection.yaml
  lock.json
  state.json
  inputs/
  runtime/
  cache/      (ignored)
  local/      (ignored)
  .gitignore
.agents/skills/
  adopt-standards/
  <author skills>/
```

- Selection records the current CLI version, source, standards version, and
  profile. The CLI owns changes to this selection.
- The lock records exact CLI resolution, source commit, selection identity, and
  input hashes. The npm runtime lock owns dependency resolution details.
- State records the last complete adoption, exact-content baselines, checks,
  and assessment identities, and that run's work evidence.
- Inputs retain normalized source metadata, resolved selection, source license,
  exact content, guidance, scripts, and declared resources. Other profiles and
  unrelated source files are omitted.

Exact baselines include file hashes, executable bits, and complete skill path
inventories. Added, removed, and modified skill files are edits. Contextual
project content remains project-owned; its assessment identifies a particular
snapshot rather than an enforced installation baseline.

After complete adoption the project's normal workflow commits durable state,
retained inputs, runtime manifests, installed content and skills, and contextual
changes. Dependencies, caches, run locks, detailed logs, and incomplete-run
records stay ignored. The product never commits or moves HEAD.

Each artifact has exactly one format, which the CLI writes and reads: durable
state, the integrity lock, retained scope evidence, the run record and local run
report, the status record, the inspection report, and the work request and
assessment. Reports and records carry hash inventories, unified diffs for
changed text, and hashes for binary content, never file bytes or observation
maps. After any required CLI pin check, reading an older format fails with
`RETIRED_FORMAT` before further records are read or anything is written;
nothing is converted. Its diagnostic names the one path
forward, fresh adoption: remove any retired run record in Git's directory and
the product state directory, commit the directory's removal, and adopt again.
A newer version of a known record format fails with `NEWER_FORMAT` and names
using the pinned CLI, including when the record holding the pin has changed
schema. It never advises removal or fresh adoption. The format gate checks the
integrity lock, durable state, retained scope evidence, and active and archived
run records. Malformed or unrelated format identities remain integrity failures.

A format's version rises when its keys change: a key is added, removed,
renamed, or changes type. Changed values under the same keys, such as embedded
content or digests, keep the version. Raise each format at most once per
release; a branch that rebases onto a merge that already raised a format keeps
that raise and does not raise it again.

### Committed evidence

Committed evidence holds the current run only
([ADR 0011](../adr/0011-retain-only-the-current-run.md)); Git history keeps
earlier runs. It records no location the product observes on the adopting
machine ([ADR 0012](../adr/0012-bind-content-not-location.md)); the project
root stays in the local run record, and retry history names archived evidence
by its path within Git's directory for the working tree. An observation names
each ignore input by role, with its content state: `global` for the global
excludes, `info` for the repository info exclude, and each consulted
`.gitignore` by its project-relative path. Durable state, `.repo-standards/state.json` in
`repo-standards/state/v7`, is one object:

| Field | Content |
| --- | --- |
| `format` | `repo-standards/state/v7`. |
| `observations`, `operations`, `retryHistory` | The run's work evidence: its intervals as identities and deltas, its operation outcomes, and its retry history. |
| `lastComplete` | The run ID, its confirmed inspection identity, completion time, and HEAD at start. |
| `baselines`, `skills`, `links` | Installed baselines of exact content, complete skill inventories, and each skill link's text by path. |
| `checks`, `assessments` | The run's final checks and accepted assessments. |
| `changeSet` | The run's net change set: each path whose state at completion differs from its state before the run, once, sorted, with the phases that changed it: `installation`, `fixes`, or `agent`. Installation changes are the exact files, skill files, and skill links, including the system skills' and a retired declaration's removed target, that the run created, replaced, or removed; fix and agent changes are the paths their intervals name. Verified restoration of installed content after an interruption keeps only the installation's attribution. Product state is not listed. |

`status --summary` renders a complete run's changed paths from the stored change
set alone, each path once, under the heading
`# Repository Standards adoption record`, which Repo Canon's pull request
validator recognizes.

Retained scope evidence, `.repo-standards/inputs/scope-history.json` in
`repo-standards/scope-history/v5`, is written by a run that discovers scope
and by every later run, and is one object:

| Field | Content |
| --- | --- |
| `format`, `evidence` | `repo-standards/scope-history/v5` and `historical`. |
| `inspection` | The run's confirmed inspection identity. |
| `resolved` | The run's resolved selection, with discovered scope materialized as concrete targets. |
| `sourceResolved`, `discovery` | Present when the run discovered scope: the source-resolved declarations, and the discovery identity, proposal, absence, declarations, project observation without derived evidence, and named observation as a delta. |
| `scopeChanges` | Each discovery declaration whose discovered paths changed against the previous run's confirmed scope, with the paths added and removed. A first discovery adds every path. |

The scope change is computed when the run is planned, from the confirmed
inspection and the recorded adoption it updates, and is stored with the run.
`status` reports the stored change; retained inspection exposes the file as
`historicalScope`, rebuilding derived evidence. State that carries an earlier
run's `history`, or scope evidence with any other field or another `evidence`
marker, fails state integrity; nothing reads an earlier run from committed
evidence.

`status --json`, in `repo-standards/status/v7`, also reports `scopeProposal`: the
last complete run's confirmed `repo-standards/scope/v2` proposal, or null when
there is none. It reads committed scope evidence, carries no identity, and is
available independently of source flags and checkout location. While an update
is incomplete or abandoned, its clean HEAD at start supplies the last complete
proposal, verified against that commit's lock; its candidate proposal is never
reported as complete. The status summary remains unchanged.

## Updates, interruption, and retirement

An update moves an adopting project from its current selection to a confirmed
selection in one inspected and confirmed run. It can change the CLI pin, the
standards version, the source, the profile, any combination of them, or none;
each follows the same inspection, confirmation, and start. The candidate exact
CLI inspects and starts a changed CLI pin; source flags select a standards
version, source, or profile; omitting them keeps the retained standards.
Existing retained inputs support inspection and use of the current selection if
its source disappears; selecting a standards version, source, or profile still
requires its source. Fresh runtime acquisition still requires the npm package
to be available or already cached. Every update, including an unchanged
selection, requires a fresh confirmed scope for each active discovery
declaration.

Edits to installed content do not block an update. The update replaces an
edited target, or matches it when it already holds the candidate content, and
the inspection lists each replacement that discards an edit. Installed bytes
that already equal the candidate are matched without rewriting.

Retiring a declaration, including one that a changed source or profile no
longer declares or that the profile excludes, relinquishes governance and
removes its installed targets; an edited one is listed among the discarded
edits. An installed target within contextual scope, as a contextual target or
inside or containing one, is not removed and stays in place as project content,
and one at or inside a target the selection still installs is left to that
target's own action. Updating a still-declared skill replaces the whole
directory, including removal of resources absent from the new version.
Exclusion removes only installed targets outside contextual scope and never
deletes project-owned content.

At most one run is active for an adopting project. An interrupted run must be
resumed or abandoned. Progress records distinguish confirmed installation work
from uncertain script outcomes. On explicit retry, verify installed progress,
rerun repeat-safe fixes, reassess contextual work, and rerun checks. Abandonment
preserves changes and its report and does not assert successful adoption.

Every run reports `complete` or `incomplete`. An incomplete result identifies
the phase, reason, changes, successful work, failed or uncertain work, and a
safe next action. Reaching the contextual handoff is incomplete and expected;
it is not a completed adoption. There is no blanket rollback promise.

A run's confirmed scope never changes. When contextual work needs files outside
it, or a confirmed target is mistaken, the run stays incomplete with its work
preserved; the adopter abandons it, commits or discards its changes, and adopts
again with a new confirmed scope. Initial adoption matches existing exact files
and skill directories, including the system skills, whose complete inventory,
bytes, and modes match, and replaces tracked ones that differ, while existing
product state blocks it. Fresh adoption over previously installed content
therefore needs only the committed removal of the product state directory; an
existing system skill that a different CLI version installed is replaced like
any other tracked target.

## Acceptance criteria

The public installed CLI against real temporary Git repositories is the main
test interface. Test fixtures may replace remote acquisition without adding
local-directory adoption to the public product. Scripted agents use the real
assessment interface; a real-agent journey separately evaluates useful
contextual work.

The product is complete only when all of these pass:

1. Validate and resolve all four declaration forms, inheritance, complete
   replacement, exclusion, references, and strict error reporting.
2. Publish a public source with a stable version and discover it by topic.
   Adopt it directly without depending on discovery.
3. Run inspection without project mutation or author-script execution.
4. Reject stale confirmation, invalid Git state, unsafe targets, ignored
   replacement content, and missing prerequisites before project mutation.
5. Adopt Alice's work profile: install the correct exact content and skill,
   with a skill link for every installed skill, improve Bob's real README, and
   leave employer contribution content alone.
6. Support a second independently authored source with materially different
   guidance and scripts through the same interfaces.
7. Collect script and agent evidence separately. Detect blocked assessments,
   malformed results, out-of-scope work, mutating checks, stale evidence, and
   final exact-content corruption.
8. Complete adoption with uncommitted changes and unchanged HEAD, then restore
   its pinned runtime in a fresh checkout and inspect its retained standards
   after the standards source becomes unavailable.
9. Update the CLI pin, the standards version, the source, and the profile,
   separately and together, and apply an unchanged selection again, each in one
   confirmed run. Reject incompatible selections and moved tags before
   mutation. Replace local edits to installed content, including added skill
   resources, and list each one in the confirmed inspection; remove obsolete
   resources on an unchanged skill update.
10. Retire a declaration by removing its installed targets, including a
    skill's link, and relinquishing ownership, listing each removed edit.
11. Recover from interrupted installation and fixes through recorded progress
    and explicit retry. Prevent concurrent runs; preserve abandoned work.
12. Pass the same product behavior on macOS and Linux through the published
    installation path and pinned system skills.
13. Report available updates without blocking, degrading to `unknown` when a
    lookup fails, through `outdated` and the update notice that relays it to
    an agent, and classify every update as exact or contextual with
    deterministic Markdown summaries of inspections and runs.
14. Reject retired formats with the fresh-adoption diagnostic, and adopt fresh
    over previously installed content after removing the product state,
    replacing any differing tracked system skill without an ownership blocker.

## Implementation choices

Internal library choices, function names, file organization, and serialization
helpers can be implementation decisions within these contracts. Public format
and protocol documentation must agree with the implementation and its tests.

## Explicit exclusions

Private sources, SSH, other Git hosts, local-directory adoption, Windows,
multiple selected profiles, profile chains, declaration field merges, consumer
subsets, cross-publisher dependencies, third-party skill collection management,
adoption hooks, arbitrary extensions, marketplace infrastructure, personal
policy migration, app scaffolding, built-in GitHub workflow mutation, automatic
commits, silent prerequisite installation, sandbox claims, signed releases,
attestations, force overwrite, and universal rollback are excluded. So are drift
detection, conversion of retired formats, and any workflow rule for what to do
with an available, exact, or contextual update.

## Discovery adoption

[ADR 0003](../adr/0003-use-agent-discovery-with-confirmed-concrete-scope.md)
records the decision behind discovery.

Where a declaration requests discovery, agent-discovered individual file paths
replace fixed author-supplied contextual scope. One complete inspection binds
source declarations and concrete scope, rationale, exclusions, the full
eligible project snapshot, named targets and ancestors, and relevant
observation/ignore inputs. Initial starts retain the clean committed-project,
prerequisite and disjoint ownership rules. The CLI validates structure and
observations; the agent and adopter judge semantic coverage.

After confirmation, expected installation, fix and contextual writes are assessed
against their phase's authority, rather than the immutable pre-start snapshot.
The shared execution machinery runs exact/runtime/system-skill installation,
repeat-safe fixes, contextual work and assessment, checks, final integrity and
durable completion. Fix/agent intervals retain attribution and immutable exact
expectations through retries. Empty discovered scope retains operations.

Discovery handoffs and assessments bind the confirmed scope, post-fix snapshot,
and current snapshot and require separate agent coverage reviews after fixes and
at assessment. A need for more files or a mistaken target produces an incomplete
result with preserved work and a safe next action; reporting additional paths
grants no authority, and the scope is corrected by adopting again. All migration
sources, destinations, directory introductions and link-repair files require
prior confirmation. Deletion and creation are recorded separately, with the
agent explaining useful-content preservation. Exclusion never implies deletion
authority. Exact content is protected throughout.

Retained inputs include both guidance files, selected source declarations,
materialized scope and accepted discovery evidence. Committed interval records
and assessments explain the authorized work in a fresh checkout. Committed
state holds the current run's interval, operation, retry, check and assessment
evidence only; earlier runs stay in Git history. Committed intervals are work
evidence: observation identities and the delta between them, never the
observation maps. The run record keeps its intervals in the same shape, so
completion carries them unchanged; only the observation its last interval ends
at is kept beside the journal for recovery. Historical scope is not evidence of
current coverage. Every later update, including one that applies an unchanged
selection again, recomputes every active discovery declaration from fresh
evidence, reports additions and removals against the prior complete scope, and
retains its own proposal and evidence with that scope change, replacing the
previous run's. Removed scope paths stay project-owned content; removing a path
from scope, or excluding or retiring its contextual declaration, never deletes
it.

## Removed in 2.0.0

These mechanisms are removed, not deprecated. An adopter whose committed state
or run records use a retired format adopts fresh.

- Scope amendment: `inspect --amend-scope`, `resume --amend-scope`, the
  amendment format and its inspection format, outgoing-scope revalidation, and
  fix replay after amendment. Scope is corrected by adopting again
  ([ADR 0009](../adr/0009-correct-scope-by-adopting-again.md)).
- Re-adoption: the `--readopt` flag, its action, and its identity variant. An
  unchanged selection is an ordinary update.
- The `repo-standards/v1` source format, with its resolution, validation,
  execution, examples, and fixtures.
- One-pin updates: the blockers that required CLI and standards updates to run
  separately, forbade source and profile switches, and rejected an unchanged
  selection, and revalidation of the retained manifest's range during a CLI
  update ([ADR 0006](../adr/0006-gate-selection-with-the-author-range-only.md)).
- Multi-format reading: the read-side unions for state and scope evidence, the
  acceptance of older run formats, state formats v1 to v4, and the older report
  formats ([ADR 0007](../adr/0007-write-and-read-one-evidence-format.md)).
- Embedded file bytes in inspection reports and run records, and full
  observation maps in the local run report
  ([ADR 0007](../adr/0007-write-and-read-one-evidence-format.md)).
- Git HEAD, the index, and Git status in confirmation identity
  ([ADR 0008](../adr/0008-bind-confirmation-identity-to-what-the-run-reads.md)).

## Removed in 4.0.0

These mechanisms and outcomes are removed, not deprecated. An adopter whose
committed state or run records use a retired format adopts fresh.

- Ownership blockers for tracked content: `SKILL_CONFLICT`,
  `SYSTEM_SKILL_CONFLICT`, and `INSTALLED_CONTENT_EDITED`, the established
  system skill's exemption from the untracked-content check, and keeping the
  project's copy of the system skill during an update that keeps the CLI pin.
  Tracked content that differs from the candidate is replaced at any target,
  and a replacement that discards content other than the installed baseline is
  listed among the discarded edits
  ([ADR 0010](../adr/0010-replace-tracked-content-block-only-untracked.md)).
- Keeping the installed targets of retired and excluded declarations in place.
  An update removes them, except within contextual scope or at or inside a
  target the selection still installs.
- Earlier runs in committed evidence and reports: durable state's and the
  status report's `history`, retained scope evidence's `runs` and the
  inspection report's `historicalScope.runs`, the scope change computed by
  comparing two stored runs, and decoding the previous durable state at
  completion, with its `FINAL_INTEGRITY` failure
  ([ADR 0011](../adr/0011-retain-only-the-current-run.md)).
- Checkout location in identities and committed evidence: the project root in
  the inspection and discovery request identities, the inspection report's
  `project.root`, ignore inputs' absolute `location`, and archived evidence
  paths relative to the project root
  ([ADR 0012](../adr/0012-bind-content-not-location.md)).
- Mechanical scope proposal fields: `request`, `paths`, declaration-level
  `evidence`, and evidence kinds and identities, with `STALE_SCOPE`. A proposal
  that no longer fits the project fails `start` with `STALE_INSPECTION`.
- Mechanical assessment fields: `run`, `selection`, `snapshot`, `scope`, and
  per-declaration `changedPaths`, with `ASSESSMENT_MISMATCH`,
  `ASSESSMENT_SCOPE_MISMATCH`, `ASSESSMENT_PATHS`, and the `STALE_ASSESSMENT`
  rejection of a submission that carries an earlier snapshot.
- The adoption record's changed paths rebuilt from work intervals, one row per
  interval, phase, and operation. The record renders the stored change set.
- `status` and `outdated` under a CLI other than the recorded pin. They fail
  with `CLI_PIN_MISMATCH`.
- The formats `repo-standards/state/v5`, `repo-standards/scope-history/v3`,
  `repo-standards/status/v5`, `repo-standards/inspection/v4`,
  `repo-standards/run/v5`, `repo-standards/scope/v1`, and
  `repo-standards/assessment/v2`
  ([ADR 0007](../adr/0007-write-and-read-one-evidence-format.md)).
