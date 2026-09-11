# Repository Standards — version-one architecture

Status: accepted through the architecture grilling completed on 2026-09-06.
This document describes the intended product, not existing implementation.

## Purpose and release boundary

Publish and apply versioned repository standards through deterministic tooling
and agent-guided workflows.

The product is Repository Standards, its GitHub repository is
`lutzseverino/repo-standards`, and its CLI is `repo-standards`. The repository is
public and MIT-licensed. Implementation uses TypeScript, ESM, Node.js 24, and
pnpm. Version one supports macOS and Linux.

A complete first release supports both journeys:

1. An author validates a local standards repository and publishes a stable
   version on public GitHub. It is directly adoptable and discoverable by topic.
2. An adopting project inspects one complete profile, adopts it, commits the
   resulting material through its own workflow, and later deliberately updates
   its pinned standards or CLI version.

The maintainer's own standards will belong in a separately named repository at
a later date. Creating or migrating those standards is outside this release.

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
| Resolver | A source and profile produce one validated resolved selection, or structured errors. This is the sole interpreter of the author format. |
| Repository state | A resolved selection and observed project produce an inspection, ownership conflicts, freshness identities, and durable adoption progress. |
| Execution | Confirmed adoption progress advances through exact installation, literal process execution, checks, and integrity verification. |
| Adoption orchestration | The system skill presents inspection, obtains confirmation, performs requested contextual work, and submits evidence through the CLI. |

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
  trees. There are no glob patterns.

There are exactly two resolution levels: defaults and selected profile. A
profile inherits an omitted declaration, wholly replaces a declaration with the
same ID, excludes it with `exclude: true`, or adds a new ID. Fields never merge.
Exclusion removes the associated checks and fixes as well as the content or
guidance. A renamed ID represents retirement and addition.

### Concrete author example

This example consolidates the agreed public structure. Operation IDs are local
to their declaration; prerequisite fields and literal invocation follow the
script contract below.

```yaml
format: repo-standards/v1
name: alice-standards
description: Alice's repository standards
requires:
  repo-standards: ">=1.0.0 <2.0.0"

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
cannot be symbolic links during adoption. Resolved targets cannot overlap,
including case-folded collisions. Product-owned state and both system-skill
paths (`.agents/skills/adopt-standards` and `.agents/skills/author-standards`)
are reserved, including equal paths, ancestors, descendants, and collisions
under the same case-folded and Unicode-normalized comparison. This applies to
exact files, contextual files, and repository guidance as well as author skills,
across defaults and all profiles, including those not selected for inspection.
Reserving `author-standards` does not change the schema or the two-level
resolution semantics.

## Publication and compatibility

Local directories are accepted for author validation. Adoption accepts public
GitHub repositories with stable SemVer tags. A selection records the canonical
repository URL, version tag, and resolved commit SHA. Branches and floating
references are not pins. A previously observed tag resolving to another commit
is rejected; retained inputs continue to identify the original adoption.

Discovery searches the `repo-standards` GitHub topic. A discoverable source is
public, has the root declaration, and has a stable SemVer release. Discovery
does not endorse a source or automatically select a profile.

The format identity is `repo-standards/v1`. Authors declare a compatible CLI
SemVer range. Source Git provenance and SHA-256 hashes of retained inputs are
recorded independently of the exact CLI package pin.

## CLI and bootstrap

| Operation | Observable result |
| --- | --- |
| `source validate` | Validates a local source and all its profiles without running author code. |
| `source search` | Finds public GitHub candidates and metadata. |
| `inspect` | Describes the exact selection, proposed changes, guidance, operations, prerequisites, and conflicts without modifying the project or running author code. |
| `start` | Validates the confirmed inspection and advances adoption until completion, a problem, or required contextual work. |
| `resume` | Continues the existing run, including accepting `--assessment <file>` and explicitly retrying interrupted work. |
| `status` | Reports current pins, progress, and historical evidence without implying continuing compliance. |
| `abandon` | Ends an incomplete run while retaining its changes and report. |

The thin user-installed bootstrap obtains one exact CLI version outside the
project for first inspection. An omitted version selects the latest stable
once and discloses it. Confirmed adoption installs that version and the matching
repository-local `adopt-standards` skill. Existing projects use their own pin.
Adoption does not automatically install `author-standards`; reserving that
identity does not manage unrelated global skill installations or change
adoption runtime pins, system-skill installation, integrity baselines, or
independent standards and CLI updates.

The CLI is published as `@lutzseverino/repo-standards` with executable
`repo-standards`. Publishing access to the npm scope is a release prerequisite.
Each project has an isolated runtime installation
with a committed package manifest and npm lockfile. Fresh checkouts restore it
with `npm ci --ignore-scripts`. Node.js 24 and npm are prerequisites; missing
prerequisites produce setup instructions. The project's own implementation
language and package manager remain independent.

## Inspection, trust, and start

Inspection identifies exact changes and the trusted author operations that
adoption will execute. Its identity binds the selection and relevant project
state. The system skill obtains explicit confirmation of that inspection;
start rejects stale state before mutation.

Inspection works in a dirty Git checkout. Start requires an existing commit,
a clean index and working tree with no untracked files, and the inspected HEAD
and project state. It also examines replacement targets for ignored content:
a clean Git status alone does not prove that content is recoverable.

An existing matching exact file can be claimed without rewriting. A differing
exact file or eligible skill directory is replaced only as shown in the
confirmed inspection. An unrelated existing skill with the same name remains
a conflict. Ignored or otherwise untracked replacement content blocks mutation.

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

## Updates, interruption, and retirement

Standards versions and CLI versions can change independently, subject to
compatibility and the same inspection/confirmation/adoption procedure. Source
and profile switching are deferred. Existing retained inputs support inspection
and use of the current selection if its source disappears; obtaining a new
standards version still requires its source. Fresh runtime acquisition still
requires the npm package to be available or already cached.

Known edits to installed content block the entire update before mutation.
There is no force-overwrite or automatic discard promise. Maintainers reconcile
their content before a new inspection.

Retiring a declaration preserves its content and relinquishes governance.
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

## Acceptance criteria

The public installed CLI against real temporary Git repositories is the main
test interface. Test fixtures may replace remote acquisition without adding
local-directory adoption to the public product. Scripted agents use the real
assessment interface; a real-agent journey separately evaluates useful
contextual work.

Version one is complete only when all of these pass:

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
9. Update standards and CLI independently. Reject incompatible selections,
   moved tags, and local edits before mutation. Detect added skill resources
   as edits and remove obsolete resources on an unchanged skill update.
10. Retire a declaration by preserving its content and relinquishing ownership.
11. Recover from interrupted installation and fixes through recorded progress
    and explicit retry. Prevent concurrent runs; preserve abandoned work.
12. Pass the same product behavior on macOS and Linux through the published
    installation path and pinned system skill.

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
adoption hooks, arbitrary extensions, marketplace infrastructure, source/profile
switching, personal policy migration, app scaffolding, built-in GitHub workflow
mutation, automatic commits, silent prerequisite installation, sandbox claims,
signed releases, attestations, and universal rollback are outside version one.
