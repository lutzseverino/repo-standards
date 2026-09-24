# Repository Standards — architecture contracts

Status: accepted through the architecture grilling completed on 2026-09-06,
extended by the accepted
[contextual scope specification (#41)](https://github.com/lutzseverino/repo-standards/issues/41)
and the
[single update path specification (#79)](https://github.com/lutzseverino/repo-standards/issues/79).
This document describes the current contracts of CLI 2.0.0; individual tickets
state implementation scope, and the [architecture decisions](../adr/README.md)
record the rationale.

## Purpose and release boundary

Publish and apply versioned repository standards through deterministic tooling
and agent-guided workflows.

The product is Repository Standards, its GitHub repository is
`lutzseverino/repo-standards`, and its CLI is `repo-standards`. The repository is
public and MIT-licensed. Implementation uses TypeScript, ESM, Node.js 24, and
pnpm. The product supports macOS and Linux.

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

- The product repository owns the format, CLI, bootstrap, and system skill.
- A standards repository owns its standards, complete profiles, ordinary
  content, contextual guidance, author skills, and trusted checks and fixes.
- An adopting project owns its project content and normal change workflow.

The product does not implement an author's adoption procedure. All authors use
the same resolution and adoption interfaces. Authors cannot replace system
skills or provide adoption hooks. Both `adopt-standards` and `author-standards`
are product-owned system skill names reserved within the standards format.

## Deep modules

| Module | Interface and responsibility |
| --- | --- |
| Source acquisition | A public GitHub identity and stable version produce an immutable source snapshot and provenance. Search provides candidates without establishing trust. |
| Resolver | A source and profile produce one validated source-resolved selection, or structured errors. Discovery references remain distinct from executable targets until project scope is confirmed. This is the sole interpreter of the author format. |
| Repository state | A resolved selection and observed project produce an inspection, its update comparison and class, ownership conflicts, freshness identities, and durable adoption progress. The update comparison takes the verified recorded adoption, the candidate selection and materials, and the observed project. It rejects a recorded tag that now resolves to a different commit, and returns the whole update part of an inspection, which is the changed selection components, the previous selection, the retired declarations, the update class and contextual changes, and the edited-baseline and product-state-integrity blockers. Scope changes stay with inspection, which holds the scope proposal. |
| Recorded adoption reader | The product state directory produces one verified value of what the last complete adoption left: selection, lock, durable state, baselines, skills, resolved declarations, retained source, scope history, and execution evidence, each matched against the lock before it is read, or one state-integrity failure. Inspection, start, resume, and status read an established adoption only through it; every command first rejects retired records in the product state and Git directories through it, which is all resume and abandon need while a run is active. `outdated` reads the selection leniently instead. |
| Execution | Confirmed adoption progress advances through exact installation, literal process execution, checks, and integrity verification. |
| Work evidence | The work-evidence journal owns an adoption run's observation intervals: it opens one for a phase and scope after recording any unattributed gap as an agent interval, closes intervals with their violation checks, continues after an interruption, and answers what the agent changed. It keeps the one observation its last interval ends at behind an observation store seam: a file store beside the run journal for runs, an in-memory store for abandonment. Intervals and operation outcomes produce the run's execution evidence as identities and deltas, in one shape shared by the run record, the local run report, and committed durable state. Prior complete runs are carried forward in the same form. |
| Scope evidence | Confirmed discovery runs produce the retained scope history, each run stored once with its project observation kept without derived evidence and its named observation as a delta. The projected historical scope is rebuilt on read. |
| Available updates | A selection and the newest published stable CLI and standards versions produce per-pin availability, cached in the ignored product cache. It never blocks and writes nothing else. |
| Summary renderer | An inspection report or a status record produces one deterministic Markdown document. It describes and never prescribes. |
| Adoption orchestration | The system skill reads available updates, presents inspection and its summary, obtains confirmation, performs requested contextual work, and submits evidence through the CLI. |

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
names, and any profile that cannot resolve. It reports all determinable errors
with stable codes and precise YAML locations.

Source and target paths are repository-relative and cannot escape their roots.
Selected sources cannot contain symbolic links. Targets and their ancestors
cannot be symbolic links during adoption. Concrete targets cannot overlap,
including case-folded collisions. Product-owned state and both system-skill
paths (`.agents/skills/adopt-standards` and `.agents/skills/author-standards`)
are reserved, including equal paths, ancestors, descendants, and collisions
under the same case-folded and Unicode-normalized comparison. This applies to
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
`repo-standards/scope/v1` proposals through `--scope`, returns explicitly versioned
`repo-standards/inspection/v4` reports, and binds a complete eligible project
snapshot, relevant observation/ignore inputs, and named targets and ancestors.
The [inspection contract](../usage/inspection.md#discover-contextual-file-scope)
defines evidence references, strict proposal validation, observation limits, and
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

`--summary` is a peer of `--json` on `inspect` and `status`; combining them is a
usage error. One renderer module produces both summaries, and the same report
or record renders the same bytes. An inspection summary lists the selection
before and after, the update class, changed declarations and paths, operations,
scope changes, retired declarations, blockers when present, and the identity. A
status summary lists the selection, operations and their results, changed paths,
scope changes, and identities, or an active run's phase, progress, and next
action.

`outdated` reads the selection and makes at most one npm registry lookup and one
GitHub releases lookup, comparing the newest stable versions with each pin and
ignoring prereleases and non-SemVer tags. It sends a GitHub token from the
environment when one is present, caches each answer for 24 hours under
`.repo-standards/cache/`, and always exits 0: network failure, exhausted quota,
or a missing selection report `unknown` with a reason for each affected pin.
`status` stays offline. `outdated`, the update class, and both summaries
describe; what to do with an available or classified update belongs to
standards content, and the product prescribes no workflow.

The thin user-installed bootstrap obtains one exact CLI version outside the
project for first inspection. An omitted version selects the latest stable
once and discloses it. Confirmed adoption installs that version and the matching
repository-local `adopt-standards` skill. Existing projects use their own pin.
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
the index, or status. Reports carry hash inventories and diffs, not file bytes.
The system skill obtains explicit confirmation of that inspection;
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
project state; the run records HEAD at start for provenance. It also examines replacement targets for ignored content:
a clean Git status alone does not prove that content is recoverable.

An existing exact file or skill directory whose complete inventory, bytes, and
modes match the supplied content is claimed without rewriting; at initial
adoption this includes the system skill packaged with the exact CLI. A differing
exact file or eligible skill directory is replaced only as shown in the
confirmed inspection. A differing existing skill without an installed baseline
remains a conflict, and existing product state blocks initial adoption.
Ignored or otherwise untracked replacement content blocks mutation.

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
2. Install exact content, runtime state, and pinned system skills.
3. Run declared fixes serially.
4. Return a contextual work request if required.
5. Validate the submitted agent assessment and observed changes.
6. Run checks and collect their evidence.
7. Verify final content integrity and record complete adoption state.

Within phases, declarations run by ID and operations in their declared list
order. Cross-declaration dependencies are unsupported. Fixes stop on the first
block or execution error. Ordinary check failures do not prevent collecting
the remaining check results.

A work request identifies its adoption run, applicable guidance, allowed
targets, and evidence requirements. The agent performs the contextual work and
submits `satisfied` or `blocked`, an explanation, changed paths, and supporting
evidence for each contextual declaration through `resume --assessment`.

The CLI compares observed contextual changes with the submission and allowed
targets. Missing or out-of-scope reported changes make adoption incomplete.
The assessment binds to the resolved selection and project snapshot at
submission. Snapshots include tracked and non-ignored untracked project
content, excluding generated product state. A subsequent content change before
completion requires reassessment and checks again.

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
  and assessment identities.
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
maps. Reading a retired format fails with `RETIRED_FORMAT` before anything else
is read or written; nothing is converted. Its diagnostic names the one path
forward, fresh adoption: remove any retired run record in Git's directory and
the product state directory, commit the directory's removal, and adopt again.

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

Known edits to installed content block the entire update before mutation.
There is no force-overwrite or automatic discard promise. Maintainers reconcile
their content before a new inspection.

Retiring a declaration, including one that a changed source or profile no
longer declares, preserves its content and relinquishes governance.
Updating a still-declared skill replaces the whole directory, including removal
of resources absent from the new version. Exclusion never authorizes deletion
of project-owned content.

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
again with a new confirmed scope. Initial adoption claims existing exact files
and skill directories, including the system skill, whose complete inventory,
bytes, and modes match, while existing product state blocks it. Fresh adoption
over previously installed content therefore needs only the committed removal of
the product state directory.

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
   improve Bob's real README, and leave employer contribution content alone.
6. Support a second independently authored source with materially different
   guidance and scripts through the same interfaces.
7. Collect script and agent evidence separately. Detect blocked assessments,
   malformed results, omitted changed paths, out-of-scope work, mutating
   checks, stale evidence, and final exact-content corruption.
8. Complete adoption with uncommitted changes and unchanged HEAD, then restore
   its pinned runtime in a fresh checkout and inspect its retained standards
   after the standards source becomes unavailable.
9. Update the CLI pin, the standards version, the source, and the profile,
   separately and together, and apply an unchanged selection again, each in one
   confirmed run. Reject incompatible selections, moved tags, and local edits
   before mutation. Detect added skill resources as edits and remove obsolete
   resources on an unchanged skill update.
10. Retire a declaration by preserving its content and relinquishing ownership.
11. Recover from interrupted installation and fixes through recorded progress
    and explicit retry. Prevent concurrent runs; preserve abandoned work.
12. Pass the same product behavior on macOS and Linux through the published
    installation path and pinned system skill.
13. Report available updates without blocking, degrading to `unknown` when a
    lookup fails, and classify every update as exact or contextual with
    deterministic Markdown summaries of inspections and runs.
14. Reject retired formats with the fresh-adoption diagnostic, and adopt fresh
    over previously installed content after removing the product state.

Release 2.0.0 is accepted through the fresh adoption of this repository with the
published 2.0.0 CLI against the current Repo Canon release, recorded as
identities and the CLI's summary.

## Implementation plan constraints

The specification will map every acceptance criterion to implementation tickets
with explicit blockers. Each ticket delivers a bounded, observable behavior
through the public interface and includes its validation. Early slices can
implement a narrower working journey; the product is not complete until the
entire acceptance list passes. Discovery, architecture investigation, and
prototype tickets are excluded.

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
records the decision behind discovery, accepted in
[issue #41](https://github.com/lutzseverino/repo-standards/issues/41).

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
and assessments explain the authorized work in a fresh checkout. Each later
complete run retains the prior run's interval, operation, retry, check and
assessment evidence in the ordered state history. Committed intervals are work
evidence: observation identities and the delta between them, never the
observation maps. The run record keeps its intervals in the same shape, so
completion carries them unchanged; only the observation its last interval ends
at is kept beside the journal for recovery. Historical scope is not evidence of
current coverage. Every later update, including one that applies an unchanged
selection again, recomputes every active discovery declaration from fresh
evidence, reports additions and removals against the prior complete scope, and
retains each complete proposal and its evidence. Removed paths stay
project-owned content; removal, exclusion and retirement never imply deletion.

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
