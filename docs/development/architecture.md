# Repo Standards — architecture contracts

This document describes the current contracts of CLI 10.0.0; individual tickets
state implementation scope, and the [architecture decisions](../adr/README.md)
record the rationale.

## Purpose and release boundary

Publish and apply versioned repository standards through deterministic tooling
and agent-guided workflows.

The product is Repo Standards, its GitHub repository is
`lutzseverino/repo-standards`, and its CLI is `repo-standards`. The repository is
public and MIT-licensed. Implementation uses TypeScript, ESM, Node.js 24 or 26, and
pnpm. Inspection, start, resume, and check require Git 2.32 or newer, checked before
observing project state, so Git never follows a symbolic `.gitignore` whose
referent the identity does not bind. The product supports macOS and Linux.

The product supports both journeys:

1. An author validates a local standards repository and publishes a stable
   version on public GitHub. It is directly adoptable and discoverable by topic.
2. An adopting project inspects one complete profile, adopts it, commits the
   resulting material through its own workflow, and later deliberately updates
   its selection, in any combination of its pins, source, profile, and
   platform, through
   one run; the agent reviews discarded edits recoverable from Git, and the
   maintainer confirms a remote setting overwrite.

The maintainer's own standards are published separately as Repo Canon; the
product remains neutral for independently authored standards.

## Roles and responsibility

- The product repository owns the format, CLI, bootstrap, and system skills.
- A standards repository owns its standards, complete profiles, ordinary
  content, contextual guidance, author skills, and trusted checks and fixes.
- An adopting project owns its project content and normal change workflow.
- The product repository also publishes the update action, `action.yml` at its
  root. An adopting project opts in by installing a caller workflow that runs
  it, which is the maintainer's standing instruction to propose every available
  update ([ADR 0026](../adr/0026-propose-updates-through-one-rolling-pull-request.md)).
  Without that opt-in, every update stays the maintainer's decision
  ([ADR 0014](../adr/0014-leave-available-updates-to-the-maintainer.md)).

The product does not implement an author's adoption procedure. All authors use
the same resolution and adoption interfaces. Authors cannot replace system
skills or provide adoption hooks. `repository-standards`, `author-standards`,
and `adopt-repository-standards`
are product-owned system skill names reserved within the standards format. The
retired `adopt-standards` and `standards-updates` names are released: they are
neither installed nor reserved.

The model-invocable `repository-standards` skill replaces `standards-updates`.
At the start of any work, including work that changes no file, it reads the
repository-wide installed rules with `rules` and no path, alongside the update
notice, and follows them. Before changing a project file it looks up the
source's installed rules with `rules <path>` and follows them. During
contextual work in an active run it reads the installed rules index and the rules named by the work request,
because `rules` reads only a complete adoption. The skill adds no requirements
of its own. Inspection identifies removed and kept product targets by `systemSkill`,
separately from a declaration's `id`; summaries name their owner. An update
removes an unedited old notice skill and its link under
the ordinary retired-target policy; edited copies remain project-owned.

`adopt` replaces the manual-only `adopt-standards` skill: that skill's
procedure is the next steps `adopt` prints at each stage. An update removes the
unedited old adoption skill and its link under the same retired-target policy.

The model-invocable `adopt-repository-standards` system skill is a standalone
entry point for adopting a standards source. Its body is one sentence pointing
to the unversioned `npx --yes @lutzseverino/repo-standards adopt <source> --json` command,
using the user-named source or Repo Canon as the fallback, and following what
it prints. The README prompt is also a one-sentence pointer. The CLI owns all
adopting-agent instructions: a new run's `NO_COMMIT` or `DIRTY_PROJECT` blockers
stop the agent and notify the maintainer, including in answers templates;
active runs continue with their expected uncommitted changes. Pre-start steps
leave project files unedited until the run starts. The agent decides version,
profile, scope, start, discarded edits and remote setup deferral from the request
and project evidence, recording decisions in its handoff. Only an unsettled
profile choice needs clarification; a fix's remote setting overwrite still
needs the maintainer's decision, and a declined one defers its fix. Repeat-safe
recovery uses `resume --retry` without another approval, and a changed scope
answer, which Git can undo, replaces a run stopped for its scope in place
without asking; abandonment remains the maintainer's decision.
Completion
requires complete-output review, leaves changes uncommitted and unstaged, and
hands them to the maintainer for review without committing. Its status verdict
describes uncommitted changes and must be recorded before committing. If any
recorded change-set path is absent from Git's uncommitted changes, status reports
not ready. An empty change set satisfies the path condition, so a complete
adoption without state errors can remain ready after committing. The terminal's
completion message addresses a human who can review and commit normally.
Neither entry point carries adoption rules of its own. Like `author-standards`,
the skill is distributed independently through release-tag
skill installation and is not installed into adopting projects by adoption.

## Deep modules

| Module                   | Interface and responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source acquisition       | A public GitHub identity and stable version produce an immutable source snapshot and provenance, freshly acquired or reused from the verified snapshot cache. Search provides candidates without establishing trust.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Resolver                 | A source and profile produce one validated source-resolved selection, or structured errors. Each profile carries the hosting platforms it supports, from one product constant typed by Postern's `PlatformName`; inspection leaves out the declarations of every other platform than the selected one before scope. Discovery references remain distinct from executable targets until project scope is confirmed. This is the sole interpreter of the author format.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Repository state         | A resolved selection and observed project produce an inspection, its update comparison and class, freshness identities, and durable adoption progress. The update comparison takes the verified recorded adoption, the candidate selection and materials, and the project's observed product state. It rejects a recorded tag that now resolves to a different commit, and returns the whole update part of an inspection, which is the changed selection components, the previous selection, the retired declarations, the update class and contextual changes, and the product-state-integrity blocker. Scope changes stay with inspection, which holds the scope proposal. Inspection also runs each remote setup's readiness probe through execution, read-only, and reports its readiness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Declaration targets      | A resolved declaration produces the targets it applies to, as paths and directory trees: an exact file's or skill's one installation target, or contextual guidance's targets. It also produces each skill's link and the text the product writes there, and holds the system skills: each reserved name, target, and link, and the ones adoption installs. Every other module asks it rather than deriving a skill's target or link, a declaration's targets, or the system skills itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Target ownership         | Each installation target's current content, its installed baseline when one exists, its candidate content when one exists, and whether that content is tracked produce its target ownership: the action a run would take on it (match, create, or replace; a recorded target the selection no longer installs has a missing candidate, so its removal is a replacement, unless it overlaps contextual scope or lies at or inside a target the selection still installs, where it has no candidate and no action), whether that action discards content other than the installed baseline, whether the target is kept, and its one ownership blocker, untracked replacement content. A recorded target the selection no longer installs is kept, with no action and no blocker, when its safely observed, tracked content is not its installed baseline, unless it contains a target the selection still installs; a skill directory is judged whole, and a kept skill keeps its link. The rule is the same for every target kind in every run. Inspection observes each target once and is its only caller.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Recorded adoption reader | The product state directory produces one verified value of what the last complete adoption left, in the current formats or the previous release's: selection, lock, durable state, baselines, skills, skill links, resolved declarations, retained source, scope evidence, and execution evidence, each matched against the lock before it is read, or one state-integrity failure. Inspection, start, resume, status, check, and rules read an established adoption only through it, which reads it from the commit a preserved run started from when a start adopts in place over that run's changes; every command first runs its format gate over the records in the product state and Git directories, which is all resume and abandon need while a run is active. The gate rejects newer and retired records, except that it returns retired committed records to a public inspection or start, which adopts fresh over them, and to status, resume, abandon, check, and rules while a run of this CLI is active. `outdated` reads the selection leniently instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Installed rules          | A resolved selection and its retained rules produce the rules files and index an installation writes, at `.repo-standards/rules/`. A project path and the recorded adoption produce the rules that cover it: those of declarations whose targets or confirmed scope contain it, and of every repository-wide declaration, whose empty targets or confirmed scope make it cover the whole repository. An optional declaration confirmed with no scope keeps no rules, so it is never repository-wide. It names the rules a failed check cites, in `check` and in an adoption run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Installation             | The inspection a start is bound to produces one run's installation plan, not the adoption itself: the exact content, skills, skill links, retained inputs, installed rules, durable product state, and runtime an adoption run installs, the links it removes, retired product state it removes whole, and, for an update, the last complete adoption's durable state, kept in place until completion replaces it unread. It installs itself across interruptions, verifies itself, and produces the durable state and lock a completion writes. The run session saves it with the run and leaves interpreting the plan to this module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Execution                | Adoption progress advances through exact installation, literal process execution, checks, and final integrity. Final integrity is the run-time check of the run's planned installation, distinct from the recorded adoption reader's check of the committed baseline a run starts from. `check` runs the recorded adoption's checks through the same prerequisite probes and process execution outside any run, observing that each leaves the project unchanged, and runs one contextual declaration's checks the same way inside a run that waits for contextual work, recording nothing in it; remote setup readiness probes run under the same read-only observation, and a run skips the fixes and prerequisites of deferred remote setup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Work evidence            | The work-evidence journal owns an adoption run's observation intervals: it opens one for a phase and scope after recording any unattributed gap as an agent interval, closes intervals with their violation checks, continues after an interruption by recording and saving without checking, so each caller requires authorization where it holds, and answers what the agent changed. It keeps the one observation its last interval ends at behind an observation store seam: a file store beside the run journal for runs, an in-memory store for abandonment. Intervals and operation outcomes produce the run's execution evidence as identities and deltas, in one shape shared by the run record, the local run report, and committed durable state, which holds the current run only. At completion, the changes a replaced run left, the installation's changes, and the intervals produce the run's net change set; inherited agent and fix changes count as the run's own agent work and fixes, under its authority.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Preserved changes        | An abandoned or replaced run's archived report, saved installation, and last observation, and the checkout, produce the run whose changes a start can adopt over in place, or why there is none: the checkout must hold the run's HEAD and index, its verified installation, and each uncommitted path outside product state in the state the run last observed. It produces the Git start blockers of such a start, which exempt exactly those paths, the last complete adoption at the run's HEAD at start, and the run's changes, which the new run inherits. Inspection and guided adoption ask it; the recorded adoption reader only names the abandoned run in its state-integrity diagnostic. Both exclude archived `repo-standards/run/v6` reports. Abandonment archives the observation a stopped run's last closed interval ends at, so changes made after the stop are not exempt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Scope evidence           | A run and the recorded adoption it updates produce the retained scope evidence: the current run, with its project observation kept without derived evidence and its named observation as a delta, and its scope change against the previous run. The projected historical scope is rebuilt on read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Reused answers           | The recorded adoption, a fresh inspection with its discovery drafts, and, for an assessment, the project after the run's fixes produce each recorded answer's classification: reused, with what made it eligible, when what it was about is provably unchanged, or proposed, prefilled with the recorded answer and naming what changed. It classifies scope answers, remote setup deferrals and assessments, and nothing else; guided adoption asks it before a start and the run after its fixes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Available updates        | A selection and the newest published stable CLI and standards versions produce per-pin availability, cached in the ignored product cache. It never blocks and writes nothing else; it fails only under a CLI other than the selection's CLI pin, before any lookup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Summary renderer         | An inspection report, a status record or an outdated report produces one deterministic Markdown document. It describes and never prescribes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Update notice            | The `repository-standards` system skill runs `outdated` with the project runtime, reinstalling the pinned runtime once when it is missing or reports `CLI_PIN_MISMATCH`, and reports each available update to the agent. It starts no update: one starts only on the maintainer's instruction, through guided adoption, as a change separate from the current work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Guided adoption          | `adopt` takes an optional source, version, profile, platform, and answers file and the project's state, and produces the questions the adoption still asks as an answers-file template and the next steps, or, once none is open, nothing blocks and no confirmation is required, the start over the inspection it just computed, or one step of the active run: a confirmed or deferred fix or submitted assessments, or, for a run stopped for its scope and a changed scope answer, the run's replacement in place. It drives inspect, start, and resume, and in a terminal also a waiting run's contextual checks and abandon, interprets no author format, and writes nothing in the project itself; the start it drives pins the exact CLI that ran. For an update it answers each recorded scope answer and remote setup deferral that is provably unchanged itself, marking it reused, and proposes the rest for review. An answers file confirms a confirmation-required change only by naming the inspection identity the agent reviewed for discarded edits, or the maintainer confirmed for a remote setting overwrite; an inspection that requires no confirmation starts with no `inspection` answer, which then names nothing the start depends on, so only a terminal still asks before every start. A question is open until an answers file, a reused answer, or a default `adopt` proposes as the answer (the version and the profile) answers it; a scope draft or a recorded answer proposed for review stays open in every mode. In a terminal it asks a person the same questions, one stage at a time, and walks each contextual declaration: it shows the rules and adoption guidance, waits for the edit, runs the declaration's checks, asks whether it is done or blocked, and writes the assessment from the answers; it retries or abandons an interrupted run only on the person's choice. `adopt --headless` is a headless update: it takes no source, profile or answers file, fails before any change without an established adoption, selects the recorded source and profile and the newest stable release or the `--standards-version` tag, takes only reused answers and the defaults a template proposes, never answers `confirmation` or a `fix:` question, starts the run deferring every remote setup, and only reports an active run; it stops before any write for an open question or blocker, or with the run active at contextual work or a fix's confirmation, and an ordinary answers file finishes it. |
| Update action            | The published `action.yml` and its scripts take an adopting project's checkout of its default branch, a token and an optional agent command, and keep one rolling update pull request or issue current through the pinned `outdated`, the newest CLI's headless update and `status`. Only its forge module talks to GitHub; the CLI gains no platform code and never commits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

These responsibilities do not mandate separate packages or class hierarchies.
They share the resolver's result. Other modules do not independently interpret
author YAML. The public CLI is the main testing seam.

## Author contract

One root `standards.yaml` declares the format, descriptive name and description,
compatible CLI version range, shared defaults, and at least one named profile.
Source paths refer to ordinary files in that standards repository.

A profile names the hosting platforms it supports, `github` alone by default,
and a declaration may name the one platform it applies on. The adopting
project selects its platform separately, as part of its selection, so a source
never multiplies profiles per platform
([ADR 0027](../adr/0027-choose-the-platform-inside-each-profile.md)).

Declaration IDs are stable, local, lower-case kebab-case names. A resolved
declaration is one complete unit containing content or guidance and its checks
and fixes. Every form but an exact skill may also name rules: lasting
requirements that adoption installs. Its guidance is adoption guidance, kept
only with the retained inputs. It has one of four forms:

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
  repo-standards: ">=7.0.0"

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
            version: ">=3.9.0 <4.0.0"
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
`repository-standards`, `author-standards`, and `adopt-repository-standards`
are model-invocable.

Source and target paths are repository-relative and cannot escape their roots.
The source root, `standards.yaml`, and selected material, including retained
root license entries and their contents, reference ancestors and whole
skill/resource trees, cannot contain symbolic links. Root license entries may
be files or directories.
Remote acquisition ignores unselected links without extracting them and still
includes them in tree-listing integrity checks, matching local validation.
Targets and their ancestors
cannot be symbolic links during adoption, with one exception: a skill link
holding exactly the text the product writes at its path. Concrete targets,
including the skill link of each declared skill, cannot overlap, including
case-folded collisions. Product-owned state, every system-skill path
(`.agents/skills/repository-standards`, `.agents/skills/author-standards`, and
`.agents/skills/adopt-repository-standards`), and each system skill's link path
(`.claude/skills/<name>`) are reserved, including equal paths,
ancestors, descendants, and collisions under the same case-folded and
Unicode-normalized comparison. This applies to
exact files, contextual files, and repository guidance as well as author skills,
across defaults and all profiles, including those not selected for inspection.
Reserving the standalone entry and authoring skills does not change the schema or the two-level
resolution semantics.

### Source resolution and validation limits

Repository guidance retains `guidance` for contextual work and chooses exactly
one of explicit `targets` or `discovery`, a regular source-file reference containing
criteria for identifying applicable project files. Both references use the existing
safe, readable source-reference contract. A discovery declaration may also name
a `discovery-script`, declared like a check without an ID, that inspection runs
read-only to draft its scope proposal and open questions. Other kinds,
operations, declaration identities, and complete replacement/exclusion
semantics remain unchanged.

The Resolver alone interprets the author format. Source resolution preserves
unresolved discovery without manufacturing empty or broad executable targets.
Execution accepts concrete targets; unresolved discovery cannot authorize
adoption. Inspection returns a report with a `DISCOVERY_REQUIRED` blocker when
scope is missing. Initial start receives the same valid proposal and confirmed
complete inspection identity and reconstructs inspection before mutation. Inspection accepts
`repo-standards/scope/v2` proposals through `--scope`, returns explicitly versioned
`repo-standards/inspection/v9` reports, and binds a complete eligible project
snapshot, relevant observation/ignore inputs, and named targets and ancestors.
A proposal carries only the agent's judgment per active discovery declaration:
candidates with their decisions, reasons and evidence paths, coverage, and
unresolved questions, and, for a declaration its author marks `optional`,
whether it has no scope. Inspection derives the request binding, evidence
identities and included paths from its own observation, and checks that every
active discovery declaration has exactly one entry and that only an optional
one has no scope. A declaration confirmed with no scope materializes with
empty targets, no rules, no checks or fixes, and `"no-scope": true`
([ADR 0023](../adr/0023-let-an-optional-discovery-declaration-have-no-scope.md)).
The [inspection contract](../usage/reference/inspection.md#discover-contextual-file-scope)
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
there is no protection language, exact-descendant subtraction, or additional
ownership model. A discovery script only drafts a proposal; it never decides
scope.

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
such as `>=7.0.0`. Source Git provenance and SHA-256 hashes of retained inputs
are recorded independently of the exact CLI package pin.

### Source reuse and the request budget

Acquisition keeps each verified source in the external product cache,
`$XDG_CACHE_HOME/repo-standards/` or `~/.cache/repo-standards/`, under the
external-path restrictions of temporary storage: never inside the adopting
project, never committed, and holding no credentials. A cached snapshot is the
Git objects of one commit, keyed by the canonical repository and commit, with
its provenance of repository, commit and tree. Postern resolves annotated tags
on each observation; there is no annotation-object cache. Each acquisition
extracts its own copy of a snapshot into temporary storage, so repeated consumers and separate processes share it.

Mutable observations are never cached. An acquisition resolves the
repository's public identity and the selected tag through GitHub, and checks
the tag against the tag observation record, before it reuses anything. One
guided adoption invocation observes them once, shared by profile and guidance
reading, inspection and the start's first inspection; every invocation and
terminal round observes them again. After acquiring the runtime, start
observes the tag again, rejecting a tag moved meanwhile before installing
anything, and repeats every project check under the run lock. A cached
snapshot supplies bytes only once its commit, each tree and each blob hash to
their Git identities, starting from the commit the tag names now, and its tree
passes the same path, link and entry-kind checks as a fresh acquisition. A
missing, incomplete or damaged snapshot is discarded and acquired again.
Inspection is never cached: project observation, scope validation and drafts,
readiness probes, ownership, blockers and identities are recomputed at each
boundary, so cached and fresh acquisition produce the same inspection, and a
changed project or scope still invalidates stale answers and confirmations.

Guided adoption resolves the newest stable release for a request without a
version, across every page of the release list. Its answers file carries the
selected version, so a release published during the adoption does not change
it, while a later independent request finds it. Release lookups are not
cached, so GitHub refusing one fails visibly as before.

A cold acquisition makes `4 + d` GitHub REST requests for `d` annotated tag
objects: the repository, the tag reference, each tag object, the commit and the
tree, however many files the source holds. A warm one makes `2 + d`. A guided
adoption of four invocations, through profile selection, scope, remote setup
deferral and start, and one contextual continuation, makes at most 16 source
and release REST requests with a lightweight tag, plus one per annotated tag
object on each observation and one per additional release page. The four
invocations observe tags five times, including the second observation during
start. An unchanged update is one invocation that observes tags twice, including the second observation during
start, and has the same per-observation annotation cost.
Contextual continuation makes none. Source-authored probes, discovery scripts, fixes and checks make their
own requests, outside this budget. The tests measure it across separate CLI
processes.

## CLI and bootstrap

| Operation         | Observable result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adopt`           | Adopts a public source, or updates the current selection without one: in a terminal, asks a person its questions, walks each contextual declaration with its checks, and writes the assessment; otherwise, with or without an answers file, starts the run over the inspection it just computed when no question is open, nothing blocks it, and no confirmation is required, and so it no longer previews an adoption (`inspect` does); else prints its questions as an answers-file template with next steps and changes nothing, names missing answers, or reports `blocked`; continues an active run by one step. With `--headless`, a headless update of an established adoption that asks nobody, even in a terminal: it completes in one invocation and exits 0, or exits 1 with the report, marked `headless`, whose missing answers, blockers, answers and contextual work are its open questions and whose `deferred` lists the remote setup it defers; it never writes to the hosting platform and makes no commit, push, branch, pull request or issue. |
| `source validate` | Validates a local source and all its profiles without running author code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `source search`   | Finds public GitHub candidates and metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `inspect`         | Describes the exact selection, the update comparison and class, proposed changes, guidance, operations, prerequisites, and conflicts without modifying the project. It runs no author code except remote setup readiness probes and, when discovery is required, declared discovery scripts, both read-only. `--summary` renders the report as a Markdown proposal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `start`           | Validates the inspection identity and its confirmation and advances adoption until completion, a problem, or required contextual work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `resume`          | Continues the existing run, including accepting `--assessment <file>`, explicitly retrying interrupted work, and continuing from a fix that needs confirmation with `--confirmed`, rerunning it allowed to overwrite, or `--defer`, deferring it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `status`          | Reports current pins, progress, and historical evidence without any network request or implying continuing compliance. `--summary` renders the last complete or active run as a Markdown record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `abandon`         | Ends an incomplete run while retaining its changes and report, exiting 0 once abandoned and 1 on a refusal; a later `adopt` adopts again in place over those changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `outdated`        | Reports, for each pin, whether a newer stable CLI or standards version is published and by how many stable releases, without blocking or changing anything outside the ignored product cache. It renders a Markdown report by default and `repo-standards/outdated/v2` JSON with `--json`, including each newer standards release's author-written adopter action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `check`           | Runs every retained check of the last complete adoption against the working tree, outside any run and without confirmation, and reports each result; fails when any check does not pass or changes the project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `rules [<path>]`  | Prints the installed rules covering a path and the rules of every repository-wide declaration, or with no path only the repository-wide rules, which govern any work in the project, from the last complete adoption, without any network request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

`--summary` is a peer of `--json` on `inspect` and `status`; combining them is a
usage error. One renderer module produces these summaries and the `outdated`
report, and the same report or record renders the same bytes. An inspection summary lists the selection
before and after, the update class, changed declarations and paths, discarded
edits with whether confirmation is required, operations, scope changes, retired
declarations, the adopter action, blockers when present, and the identity. A
status summary lists the selection, operations and their results, the run's net
change set, scope changes, identities, and, for a complete adoption, the Impact
and Migration sections that close the record, or an active run's phase,
progress, and next action.

The adopter action module derives one line from an inspection: the update
class, the declarations whose contextual work the run asks for, and remote setup
that is not ready. The same facts give the same bytes. A source's optional root
`adopter-action` is validated by the source resolver, retained in the source
metadata, and shown beside the derived line. An update that starts from the same
source also reads the `standards.yaml` of every stable release between the
previous selection and the candidate, through the release list and the GitHub
request helper, and the run record keeps what it read. At completion the
derived line is recomputed from the run's result, without the assessments it
reused and with the fixes it deferred, and durable state keeps it with those
lines and the migration steps as `impact`, so `status` renders the record
offline from committed state. An unreadable release, or an unreadable release
list, is evidence in the record and never fails the run.

`outdated` renders Markdown by default and the v2 JSON report with `--json`,
as `status` does; unlike `status`, it has no `--summary` flag, because the
Markdown is its default. The rendering is a pure function of the report the
command builds, so it adds no lookup, cache write or other project change.
The Markdown has a Pins table, one row for the CLI package and one for the
standards source, with the pinned and newest versions, update, newer stable
release count, lookup time and cache provenance, and, only when a pin is
unknown, an Unknown results table of reason codes and messages. An Adopter
actions table lists each newer release's author-written line, which `outdated`
reads from the release's `standards.yaml` once per release through the GitHub
request helper and caches with the other lookups; an unreadable release reports
its reason without failing the report. It states availability only. The default output changed from JSON in a major release;
scripts pass `--json`, whose errors and exit statuses are unchanged and which
remains the system skill's call. Its format changed to `outdated/v2` when the
Adopter actions arrived, with the cache format.

`outdated` reads the selection and makes at most one npm registry lookup, one
release-list lookup across all pages and one `standards.yaml` read per newer
stable release, comparing the newest stable versions
with each pin and ignoring prereleases and non-SemVer tags. The exact runtime
dependency `@lutzseverino/postern` 1.x supplies `ReleaseSource` for release lists
and exact-tag resolution. Repository search, source metadata and commit/tree
verification stay on the GitHub-only helper because Postern has no port for
them. Both boundaries send `GH_TOKEN`, or otherwise `GITHUB_TOKEN`, as bearer
authorization when present. Values are trimmed; empty or whitespace-only values count as absent. A token uses the authenticated API quota, remains outside
reports, inspection identity, retained inputs, caches and logs, and does not
authenticate the separate Git smart-protocol object downloads. Both token
variables are removed from Git
subprocess environments, including acquisition, observation and discovery, so
credential helpers cannot read the REST credentials. The parent process retains
them for REST requests. A Postern read that fails with `unavailable` and no
response status is sent once more; failures after a response are not retried.
The GitHub-only helper retains its single retry for a reset pooled connection.
Private sources remain rejected by acquisition's `private !== false` check. A 429, or a 403 with
`x-ratelimit-remaining: 0` or `retry-after`, is `QUOTA_EXHAUSTED`; its message names
the usable reset time or retry delay and both token variables, preferring
`retry-after` over `x-ratelimit-reset` when both arrive. `inspect`, `start`
and `search` exit 1 on this failure; search aborts the whole page even when a
release list or candidate acquisition exhausts quota. Other candidate failures
remain rejections. A 401 with a token is `SOURCE_UNAVAILABLE`, saying the token
was rejected, with no anonymous retry. After a cross-origin redirect strips
authorization, a target's 401 on the GitHub-only helper reports the target's
failure instead. That helper refuses responses containing the trimmed token
actually sent; Postern redacts credentials in results and errors. Without a
token, connections omit the credential option and requests remain anonymous.
`outdated` caches each answer for 24 hours under
`.repo-standards/cache/`, and exits 0 whenever it reports: network failure,
exhausted quota, or a missing selection report `unknown` with a reason for each
affected pin. `status` stays offline.

`status`, `outdated`, `check`, and `rules` require the recorded CLI pin, as
`resume` and `abandon` do. `status`, `check`, and `rules` take it from the
active run's selection when a run is active, where `check` and `rules` then
fail with `ACTIVE_RUN`, and otherwise from
the recorded adoption; `outdated` takes it from the selection it reads. Under
another CLI version they fail with `CLI_PIN_MISMATCH`, naming the pinned
version and, when the project runtime manifest and npm lock both pin it, the
project root and the command that reinstalls the project runtime there;
otherwise they name an exact CLI installed outside the project. `status`,
`resume`, `abandon`, `check`, and `rules` check that pin before any record format or
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
once and discloses it. Adoption installs that version and the matching
repository-local `repository-standards` skill. Existing projects use their own
pin. `adopt` needs no bootstrap: run through `npx`, it installs and pins the
exact CLI that ran it.
Adoption does not automatically install `author-standards`; reserving that
identity does not manage unrelated global skill installations or change
adoption runtime pins, system-skill installation, integrity baselines, or
updates.

The CLI is published as `@lutzseverino/repo-standards` with executable
`repo-standards`. Publishing access to the npm scope is a release prerequisite.
Each project has an isolated runtime installation
with a committed package manifest and npm lockfile. Fresh checkouts restore it
with `npm ci --ignore-scripts`. Node.js 24 or 26 and npm are prerequisites; missing
prerequisites produce setup instructions. The project's own implementation
language and package manager remain independent.

## Inspection, trust, and start

Inspection identifies exact changes and the trusted author operations that
adoption will execute. Its identity binds what the run reads: the selection,
resolved materials, affected bytes and modes, the product-state inventory, and,
when discovery is active, the discovery observation. It does not bind Git HEAD,
the index, status, or the project root, so an inspection made in any checkout of
the same content starts a run in another
([ADR 0012](../adr/0012-bind-content-not-location.md)). Reports carry hash
inventories and diffs, not file bytes.

Asking to adopt or update is the maintainer's consent. The agent reviews and
confirms discarded edits, which Git can restore; only a fix's remote setting
overwrite waits for the maintainer's decision
([ADR 0021](../adr/0021-let-agents-decide-what-git-can-undo.md), amending
[ADR 0017](../adr/0017-confirm-only-confirmation-required-changes.md)).
Inspection reports the ones it can see in its deterministic `confirmation`
result, computed without running source code: `required` exactly when
`discardedEdits` is not empty, with one `discarded-edit` reason per target, at
an initial adoption as at an update. Breaking source changes, scope proposals,
retired product state, and removing unedited installed content add none. The
report binds the result into its identity. `start --identity <identity>` binds
every run to the inspection identity and rejects stale state before mutation,
before it checks confirmation. Its `--confirmed` flag is required when the
inspection requires confirmation, failing with `CONFIRMATION_REQUIRED`
otherwise, and accepted only then, failing with `CONFIRMATION_NOT_REQUIRED`
when it does not. A retry of a start interrupted before its installation was
prepared repeats the identity check only: the run's start already carried the
confirmation that identity requires. An agent answers the inspection's
confirmation after reviewing discarded edits; a fix's remote overwrite requires
the maintainer's decision. The answers file confirms either with the run's
inspection identity.

Fixes report the confirmation-required changes inspection cannot see, because
it runs no fix: a fix that would change or remove an existing setting
holding a different value returns `confirmation-required` without changing
anything, unless its request allows overwriting. The run stops there,
resumably, as the [script execution contract](#script-execution-contract)
describes.

A fix that changes the hosting platform's settings can declare itself
remote setup, with a readiness probe declared like a check. When the report has
no start blockers, inspection runs every remote setup probe read-only, after
its own prerequisite, from the project root with its script read from the
acquired or retained source, and reports each in `remoteSetup` as `ready`, or
`not-ready` with the probe's reason; with blockers each is `not-checked`.
Inspection observes the project around each probe as `check` does around a
check and fails with `PROBE_MUTATION` when a probe changed it. The identity
binds `remoteSetup`, so a probe whose answer changes makes the start stale. A
start whose inspection has a not-ready remote setup fails with
`REMOTE_SETUP_NOT_READY` before any write, including the run record, unless it
passes `--defer-remote-setup`. A headless update's start defers every remote
setup instead, ready or not, with a reason saying that a headless update never
writes to the hosting platform and the next local `adopt` applies it; its
probes still run during inspection. A deferred remote setup runs neither its fix nor
its fix's prerequisite probe; the run records it in `deferred`, not as an
operation result, and completion keeps it in durable state's `deferred`, which
`status` and the adoption record list. Every later run probes it again and
applies it once ready, recording no deferral for it; while the same probe
still reports it not ready, `adopt` reuses the recorded deferral
([ADR 0024](../adr/0024-reuse-recorded-answers-that-are-provably-unchanged.md)),
so a headless deferral of setup that was ready is not reused. The concept names no
platform; source acquisition accepting only public `github.com` sources is the
known blocker to platform independence.

For an established adoption, inspection is an update. It reports every changed
selection component, in the order CLI, standards, source, profile, and
platform, together
with the previous selection and the declarations that retire. Any combination,
including none, is one update that can be started; an
inspection of the unchanged selection starts a run that applies it again. The
update class is exact only when every declaration's guidance, discovery
guidance, and operations, including their scripts, arguments, resources, and
complete definitions, the retired declaration set, and the confirmed scope are
hash-identical to the retained inputs. A declaration with no scope is compared
as resolved, without rules or operations, and its no scope differs from an
empty scope. Exact content, skills, and the selection
itself can change in an exact update. Any other difference makes the update
contextual, and the report names each differing declaration. The class is a
report field and a summary input; it authorizes and decides nothing.

Inspection works in a dirty Git checkout. Start requires an existing commit,
a clean index and working tree with no untracked files, and the inspected
project state; the run records the project root and HEAD at start for
provenance. The one exception is a start over the changes an abandoned or
replaced run of the same selection preserved
([ADR 0022](../adr/0022-replace-a-stopped-run-in-place.md)), whose Git start
blockers exempt exactly the uncommitted paths that run's last observation
recorded, with that run's HEAD and index unchanged and its installation
verified; any other uncommitted path blocks with `DIRTY_PROJECT`, naming it.
Those paths are recoverable content at their targets, not untracked
replacement content, the run's verified product state is not an existing
adoption, and an update's last complete adoption is read from that HEAD. It also examines replacement targets for ignored content:
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
link is removed with the skill, and kept with it when an edited skill is kept.
Links are exact content, so they never make an
update contextual.

Target ownership is one rule for every installation target, including author
skills, the system skills, and skill links, in every run. An existing exact
file or skill directory whose complete inventory, bytes, and modes match the
supplied content is matched without rewriting, and so is a skill link with the
same text. Tracked content that differs is replaced, as shown in the
inspection, because Git can recover it; a replaced skill directory is replaced
whole, and so is whatever a skill link replaces. Ignored or otherwise untracked replacement
content, including an empty directory, blocks mutation. The inspection lists
each replacement that discards content other than the target's installed
baseline; at initial adoption there is no baseline, so every replacement of
existing content is listed, and each listed one requires confirmation.
Existing product state blocks initial adoption,
unless its committed records use a retired format, when the run removes it.
[ADR 0010](../adr/0010-replace-tracked-content-block-only-untracked.md) records
the decision.

All prerequisite executables and versions, except those of deferred remote
setup, are checked before project changes.
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

One versioned JSON input, `repo-standards/operation/v2`, conveys the operation
identity, project root, standards identity, profile, active resolved
declarations, allowed targets, and whether a fix may overwrite an existing
setting, `overwriteAllowed`, false for every check and readiness probe. A
check's input also carries `invocation`, `"run"` when an adoption run invokes
it and `"check"` when `repo-standards check` does; fix and probe inputs omit
it. Older CLIs omit it too, and scripts ignore request fields they do not read,
so the field is additive within `operation/v2`. A
readiness probe runs in the `probes` phase as its fix's operation and reports
`ready` or `not-ready`. The script returns one
versioned JSON result, `repo-standards/result/v2`, on standard output and human
logs on standard error. A check reports `passed`, `failed`, or `blocked`; a fix
reports `unchanged`, `changed`, `blocked`, or, only when overwriting is not
allowed, `confirmation-required`. Nonzero exits, signals, timeouts, and invalid
protocol output, including a retired result format, are execution errors.

A `confirmation-required` fix stops the run resumably in the `fixes` phase,
recording the fix's result in the run's operations and its message in the run's
`reason`, under `CONFIRMATION_REQUIRED`. The run record gains no field: the
stop is that reason with the fix's recorded result as the last operation and no
uncertain work. The fix's observed interval must hold no change: a
`confirmation-required` fix whose interval changed a path or boundary is a
`PROTOCOL_ERROR`, not a stop, and `resume --confirmed` does not accept it.
`resume --confirmed`, accepted only by such a run and failing with
`CONFIRMATION_NOT_REQUIRED` otherwise, reruns that fix with
`overwriteAllowed: true`, then the fixes after it, and continues the run.
`resume --defer`, accepted only by such a run too, records the whole fix in
the run's `deferred`, with the reason `The maintainer declined the overwrite:`
and the fix's message, and continues with the fixes after it; a retry of that
run skips it, completion keeps it in durable state's `deferred`, and every
later run runs it again. Without confirmation or deferral the run stays
stopped: `resume` and `resume --assessment` fail with `CONFIRMATION_REQUIRED`
and change nothing, retry stops at the same fix again, and abandonment works
as for any run.

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
assessment and checks. Detected scope violations cannot be erased by retry,
but restoring a violating path to its state before the run reconciles them: a
violation stands only while its path's net change over the run's intervals,
from its state before the earliest interval that changed it, is nonzero, and
the agent's observed changes are those net changes. Intervals keep their
violations as observed. Installation, process
liveness, concurrency, clean initial starts, and abandonment keep their existing
contracts. See the [script](../usage/reference/script-protocol.md#observed-adoption-scope)
and [assessment](../usage/reference/assessment-protocol.md#observation-and-replay) protocols.

## Adoption sequence and agent interface

1. Verify inspection freshness, the required confirmation, remote setup
   readiness or its deferral, and all prerequisites.
2. Install exact content, runtime state, pinned system skills, and skill links.
3. Run declared fixes serially, except deferred remote setup.
4. Accept each reused assessment, and return a contextual work request for
   the other contextual declarations if any remain.
5. Validate the submitted agent assessment and observed changes, binding it to
   the run and deriving its changed paths.
6. Run checks and collect their evidence.
7. Verify final content integrity and record complete adoption state.

Within phases, declarations run by ID and operations in their declared list
order. Cross-declaration dependencies are unsupported. Fixes stop on the first
block, execution error, or `confirmation-required` result. Ordinary check failures do not prevent collecting
the remaining check results.

A work request identifies its adoption run, applicable guidance, allowed
targets, and evidence requirements. The agent performs the contextual work and
submits only its judgment, `satisfied` or `blocked`, an explanation, and
supporting evidence for each contextual declaration through
`resume --assessment`.

An update reuses the last complete adoption's assessment of a contextual
declaration when its rules, or its adoption guidance when it has no rules, and
the files in its scope are unchanged since that adoption, judged at the
project as the run's fixes left it
([ADR 0024](../adr/0024-reuse-recorded-answers-that-are-provably-unchanged.md)).
The work request carries such a judgment in the declaration's `reused`, and a
recorded judgment that is not provably unchanged in its `proposed`, with what
changed. A submission may omit a reused declaration, or repeat its judgment,
to accept it; another judgment replaces it. When every contextual
declaration's assessment is reused, the run accepts them, bound to itself like
a submitted assessment, and runs its checks without waiting.

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
  rules/
  runtime/
  cache/      (ignored)
  local/      (ignored)
  .gitignore
  .gitattributes
.agents/skills/
  repository-standards/
  <author skills>/
```

- Selection records the current CLI version, source, standards version, and
  profile. The CLI owns changes to this selection.
- The lock records exact CLI resolution, source commit, selection identity, and
  input hashes. The npm runtime lock owns dependency resolution details.
- State records the last complete adoption, exact-content baselines, checks,
  and assessment identities, that run's work evidence, the recorded answers it
  reused, and each contextual declaration's scoped files by identity.
- Rules holds the installed rules of each active declaration that has them,
  named by declaration ID, and a generated `README.md` index of what each
  covers. They are CLI-owned exact content: the lock records them, completion
  verifies them, and an update replaces the directory whole.
- Inputs retain normalized source metadata, resolved selection, source license,
  exact content, guidance, rules, scripts, and declared resources. Other profiles and
  unrelated source files are omitted.

Exact baselines include file hashes, executable bits, and complete skill path
inventories. Added, removed, and modified skill files are edits. Contextual
project content remains project-owned; its assessment identifies a particular
snapshot rather than an enforced installation baseline.

After complete adoption the project's normal workflow commits durable state,
retained inputs, runtime manifests, installed content and skills, and contextual
changes. Dependencies, caches, run locks, detailed logs, and incomplete-run
records stay ignored. The CLI never commits or moves HEAD; only the
[update action](#update-action) commits, and only on its rolling branch.

Each artifact has exactly one format, which the CLI writes and reads: durable
state, the integrity lock, retained scope evidence, the run record and local run
report, the status record, the inspection report, the work request and
assessment, and `adopt`'s answers file and report. Reports and records carry
hash inventories, unified diffs for changed text, and hashes for binary
content, never file bytes or observation maps; only `adopt`'s report, written
for the agent to read, carries the text of the rules and guidance it presents. After any required CLI pin check, the format gate checks the integrity
lock, durable state, retained scope evidence, and active and archived run
records before further records are read or anything is written; nothing is
converted. A newer version of a known record format anywhere fails with
`NEWER_FORMAT` and names using the pinned CLI, including when the record
holding the pin has changed schema. It never advises removal or fresh
adoption. An active run record in an older format may hold unfinished work: it
fails every command that runs the format gate with `RETIRED_RUN`, naming the
earlier pinned CLI's `resume --retry` and `abandon`, and nothing is removed.
`outdated`, which reads only the pinned selection and writes only its ignored
cache, runs no format gate. Archived reports are decoded as runs only in the current run format. Every reader of
archived reports skips one whose format is exactly `repo-standards/run/v6`,
which CLI 9.0.0 wrote, and leaves it in place unread. Such a report blocks
nothing, is never preserved changes, and is never named by a diagnostic
([ADR 0029](../adr/0029-leave-archived-run-v6-reports-unread.md)). An archived
report in any other older run format fails with `RETIRED_FORMAT`, naming that
report, which only the CLI that wrote it reads.

The one exception is the update from the previous release: this CLI also
reads `repo-standards/state/v7` and `repo-standards/scope-history/v5`, the
durable state and retained scope evidence the previous release wrote, as the
established adoption an update replaces, so that the update carries its
recorded answers forward
([ADR 0024](../adr/0024-reuse-recorded-answers-that-are-provably-unchanged.md)).
It treats the keys they lack as absent and writes only its own formats.

Committed product state in any other older format is never read. When every committed
record present carries its own artifact's current or retired format, an
inspection with source flags treats the selection as a fresh adoption; any
other committed record there fails with `STATE_INTEGRITY`, so nothing malformed
is removed. Its report's `retiredState` lists the retired records and every file of the
`.repo-standards` directory as content the run removes, and the identity binds
that directory as it binds an update's product state, without its generated
directories. Under its lock, `start` observes the same directory again,
removes it whole, generated directories included, as its first installation
step, and then installs, leaving the removal uncommitted with the run's other
changes. Once its removal is recorded, the run observes the directory a last
time and removes it only when it still matches the confirmed inventory, or,
after an interrupted removal, when every remaining file does and nothing was
added; otherwise it fails with `INSTALLATION_CHANGED` and removes nothing.
Its removal is tracked like any replaced tree, so an interrupted one
resumes on retry; until it is removed, the run, not the retired state, is what
status, resume, and abandon read, and what blocks check, and abandonment
archives none of the earlier CLI's local reports as the run's. Every other
read of retired committed state, including retained inspection, fails with
`RETIRED_FORMAT`, naming that fresh-adoption path. Malformed or unrelated
format identities, including a same-prefix version that is not `vN` such as
`repo-standards/state/vnext`, are not classified as retired or newer. They
fail integrity validation when a command reads that record.

### Format versions

A persisted record or public report's format version rises when its keys
change: a key is added, removed, renamed, or changes type. A value an earlier
reader would reject, such as a new enumerated status, counts as a change.
Changed values under the same keys, such as embedded content or digests, keep
the version.

The `platform` field is a narrow exception for persisted records and public
reports while `github` remains the only supported platform
([ADR 0027](../adr/0027-choose-the-platform-inside-each-profile.md)). Its addition
keeps their existing format versions: a recorded selection without the field
is read as `github`, and the next committed run records it. Adding a second
supported platform raises the record formats. Other record and report key
changes still follow the general rule above.

An author-facing input format may gain an optional key without a version rise
when existing inputs remain valid with the same meaning. This covers operation
and discovery input, which the CLI sends to author scripts, and scope proposals,
which the CLI reads from discovery scripts or agents. The optional `invocation`
key in `repo-standards/operation/v2` and `noScope` in
`repo-standards/scope/v2` follow this rule
([ADR 0023](../adr/0023-let-an-optional-discovery-declaration-have-no-scope.md)).
For [operation input](../usage/reference/script-protocol.md#json-input-on-stdin)
and [discovery input](../usage/reference/script-protocol.md#discovery-scripts),
scripts must ignore request fields they do not read, including unfamiliar
additive request fields. For `repo-standards/discovery/v1`, this requirement
applies from the [owner's 2026-10-26 decision](https://github.com/lutzseverino/repo-standards/issues/354#issuecomment-6407013223)
onward; it does not establish that previously authored strict readers violated
the earlier contract. Compatible optional discovery-input additions therefore
retain `repo-standards/discovery/v1`, as with operation-input additions retaining
`repo-standards/operation/v2`.
For scope proposals, an older CLI need not accept the new key: it rejects
`noScope` as unknown rather than misreading the proposal. A source that marks a
declaration `optional` raises its `requires.repo-standards` range to a CLI that
accepts it. Keeping the input format lets producers that do not use the
extension keep their existing output; raising the scope format would require
every discovery script to change it.

Other input shape or meaning changes still raise the input format's version:
adding a required key, removing or renaming a key, changing its type, or changing
the meaning or accepted values of existing input. The optional-input exception
does not apply to persisted records or public reports. Raise each format at
most once per release; a branch that rebases onto a merge that already raised a
format keeps that raise and does not raise it again.

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
`repo-standards/state/v8`, is one object:

| Field                                        | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`                                     | `repo-standards/state/v8`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `observations`, `operations`, `retryHistory` | The run's work evidence: its intervals as identities and deltas, its operation outcomes, and its retry history.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lastComplete`                               | The run ID, the inspection identity its start was bound to, completion time, and HEAD at start.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `baselines`, `skills`, `links`               | Installed baselines of exact content, complete skill inventories, and each skill link's text by path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `checks`, `assessments`                      | The run's final checks and accepted assessments.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `deferred`                                   | Each fix the run deferred: remote setup that was not ready, or every remote setup in a headless update, or a fix whose overwrite the maintainer declined, with its reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `reused`                                     | Each recorded answer of the previous complete adoption the run reused: its question ID, its kind, `scope`, `remote-setup` or `assessment`, and the evidence that made it eligible.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `assessedScopes`                             | Each contextual declaration's scoped files at completion, as an identity of its targets and their observed states, which a later update compares to reuse its assessment.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `impact`                                     | What adopters must do about the update: the adopter action derived from the run's result, the author-written lines of the adopted release and of each release since the previous selection, and the migration steps, which `status` renders as the record's Impact and Migration sections.                                                                                                                                                                                                                                                                                                                                      |
| `changeSet`                                  | The run's net change set: each path whose state at completion differs from its state before the run, or before the run it replaced in place, once, sorted, with the phases that changed it: `installation`, `fixes`, or `agent`. Installation changes are the exact files, skill files, and skill links, including the system skills' and a retired declaration's removed target, that the run created, replaced, or removed; fix and agent changes are the paths their intervals name. Verified restoration of installed content after an interruption keeps only the installation's attribution. Product state is not listed. |

`status --summary` renders a complete run's changed paths from the stored change
set alone, each path once, under the heading
`# Repository Standards adoption record`, which Repo Canon's pull request
validator recognizes. It lists the reused answers, with why each was eligible,
in a `### Reused answers` subsection of its Operations section, adding no
level-1 or level-2 heading.

Retained scope evidence, `.repo-standards/inputs/scope-history.json` in
`repo-standards/scope-history/v6`, is written by a run that discovers scope
and by every later run, and is one object:

| Field                         | Content                                                                                                                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`, `evidence`          | `repo-standards/scope-history/v6` and `historical`.                                                                                                                                                                                                                                                 |
| `inspection`                  | The inspection identity the run's start was bound to.                                                                                                                                                                                                                                               |
| `resolved`                    | The run's resolved selection, with discovered scope materialized as concrete targets.                                                                                                                                                                                                               |
| `sourceResolved`, `discovery` | Present when the run discovered scope: the source-resolved declarations, and the discovery identity, proposal, absence, declarations, project observation without derived evidence, named observation as a delta, and `drafts`, each discovery script's draft the confirmed entry was decided from. |
| `scopeChanges`                | Each discovery declaration whose discovered paths changed against the previous run's confirmed scope, with the paths added and removed. A first discovery adds every path.                                                                                                                          |

The scope change is computed when the run is planned, from the confirmed
inspection and the recorded adoption it updates, and is stored with the run.
`status` reports the stored change; retained inspection exposes the file as
`historicalScope`, rebuilding derived evidence. State that carries an earlier
run's `history`, or scope evidence with any other field or another `evidence`
marker, fails state integrity; nothing reads an earlier run from committed
evidence.

`status --json`, in `repo-standards/status/v9`, also reports `scopeProposal`: the
last complete run's confirmed `repo-standards/scope/v2` proposal, or null when
there is none, and `reused`: the reused answers of the active run, or else of
the last complete run. It reads committed scope evidence, carries no identity, and is
available independently of source flags and checkout location. While an update
is incomplete or abandoned, its clean HEAD at start supplies the last complete
proposal, verified against that commit's lock; its candidate proposal is never
reported as complete.

`status` prints its Markdown summary by default, including whether the adoption
run is ready to commit. Every JSON status report includes `readyToCommit` and
`readinessReasons`: the verdict is true exactly when no run is active, a last
complete run exists, there is no state error, and every path in its change set
is among Git's uncommitted changes. Reasons name each failing condition,
including each changed path absent from the uncommitted changes. Staged,
unstaged, and non-ignored untracked changes count, including deletions and both
ends of renames. The verdict reads local Git state without running checks or
changing the project; it neither certifies continuing compliance nor changes
the report's exit status.

## Updates, interruption, and retirement

An update moves an adopting project from its current selection to a candidate
selection in one inspected run. It can change the CLI pin, the
standards version, the source, the profile, the platform, any combination of
them, or none;
each follows the same inspection and start, with confirmation only when required. The candidate exact
CLI inspects and starts a changed CLI pin; source flags select a standards
version, source, or profile; omitting them keeps the retained standards.
Existing retained inputs support inspection and use of the current selection if
its source disappears; selecting a standards version, source, or profile still
requires its source. Fresh runtime acquisition still requires the npm package
to be available or already cached. Every update, including an unchanged
selection, inspects and starts with a confirmed scope for each active
discovery declaration. Through `adopt`, an update reuses the last complete
adoption's scope answer when the declaration's discovery guidance and rules are
hash-identical to the recorded ones, its fresh discovery-script draft equals
the draft the recorded entry was decided from, and every path the entry names
still exists; any other recorded entry is proposed for review, naming what
changed, and is no answer until the agent carries it back
([ADR 0024](../adr/0024-reuse-recorded-answers-that-are-provably-unchanged.md)).
Scope evidence the previous release wrote keeps no drafts, so a fresh draft
then matches only the recorded entry itself.

An update reuses a recorded answer only when what it was about is provably
unchanged: a scope answer as above, a remote setup deferral while the same
probe, with an unchanged script, arguments, resources and prerequisite, still
reports the same fix not ready, and an assessment as the
[adoption sequence](#adoption-sequence-and-agent-interface) describes; state
the previous release wrote proves an assessment unchanged only by the whole
project's work snapshot. Each other recorded answer comes back prefilled for
the agent to validate. A `confirmation`, a `fix:` overwrite answer, and a fix
deferred because the maintainer declined its overwrite are never reused, and
`version` and `profile` keep their proposals; a recorded `platform` the
profile still supports is carried forward as the selection's own, not as a
reused answer. An answer the agent gives
replaces a reused one and is not listed as reused; an answer equal to the
reused one keeps it reused. The run record, durable state, `status`, and the
adoption record list every reused answer with what made it eligible.

Edits to installed content do not block an update. The update replaces an
edited target that stays in the selection, or matches it when it already holds
the candidate content, and the inspection lists each replacement that discards
an edit. Installed bytes that already equal the candidate are matched without
rewriting.

Retiring a declaration, including one that a changed source or profile no
longer declares or that the profile excludes, relinquishes governance. The run
removes each installed target that still matches its installed baseline, and
keeps each edited one
([ADR 0016](../adr/0016-keep-edited-content-that-leaves-the-selection.md)):
the inspection lists it in `kept`, as now owned by the project, the run leaves
it in place, durable state drops it, and later runs neither track nor remove
it. An edit is tracked content, which Git records, so ignored or other
untracked content alone keeps nothing, and content observed as unsafe is never
kept, so its blockers stand. A skill directory is judged whole, so a skill with
any added, removed, or changed tracked file stays whole, and a kept skill keeps
its link. A link is otherwise
judged on its own: a skill link the project replaced is kept even when its
unedited skill is removed. An edited target is listed as kept, never among the
discarded edits; an edited target that stays in the selection is still
replaced and listed as ADR 0010 says. An installed target within contextual
scope, as a contextual target or inside or containing one, is not removed and
stays in place as project content, and one at or inside a target the selection
still installs is left to that target's own action. One that contains such a
target is removed even when edited, and the run then installs the contained
target. Updating a still-declared skill replaces the whole
directory, including removal of resources absent from the new version.
Exclusion removes only installed targets outside contextual scope and never
deletes project-owned content.

At most one run is active for an adopting project. An interrupted run must be
resumed, replaced in place, or abandoned. Progress records distinguish confirmed installation work
from uncertain script outcomes. On explicit retry, verify installed progress,
rerun repeat-safe fixes, reassess contextual work, and rerun checks. Abandonment
preserves changes and its report and does not assert successful adoption.

Every run reports `complete` or `incomplete`. An incomplete result identifies
the phase, reason, changes, successful work, failed or uncertain work, and a
safe next action. Reaching the contextual handoff is incomplete and expected;
it is not a completed adoption. There is no blanket rollback promise.

A run's confirmed scope never changes. When contextual work needs files outside
it, or a confirmed target is mistaken, the run stays incomplete with its work
preserved: `SCOPE_INCOMPLETE`, `ASSESSMENT_SCOPE`, or `ASSESSMENT_BLOCKED`. A
changed `scope:<declaration>` answer to `adopt` replaces it in place
([ADR 0022](../adr/0022-replace-a-stopped-run-in-place.md), amending
[ADR 0009](../adr/0009-correct-scope-by-adopting-again.md)): the run's report
is archived, marked abandoned with a reason starting `REPLACED:`, and the
unchanged selection is inspected with the new scope and started over the
run's changes, rerunning every fix and reassessing the preserved contextual
work. Abandonment archives the run's saved installation and last observation
with its report, so `adopt` after abandonment adopts again in place the same
way, defaulting to the abandoned run's selection and scope. Committing or
discarding the changes and adopting again from a clean checkout stays
possible. Initial adoption matches existing exact files
and skill directories, including the system skills, whose complete inventory,
bytes, and modes match, and replaces tracked ones that differ, while existing
product state blocks it, unless that state is retired. Fresh adoption over
previously installed content therefore needs only the committed removal of
product state in the current formats, and nothing first over retired state; an
existing system skill that a different CLI version installed is replaced like
any other tracked target.

### Update action

The update action is a composite GitHub action, `action.yml` at the product
repository's root, whose scripts in `action/` run with Node.js 24 directly,
with no build step. Callers pin it by commit SHA. It takes a `token`, defaulting
to `github.token`, and an optional `agent-command`. On a checkout of the
default branch, each run:

1. Restores the pinned runtime and runs the pinned `outdated --json`. A pin
   reporting `unknown` fails the run with its reason, opening or changing
   nothing. With both pins `none`, it closes the rolling items whose update
   has landed and exits.
2. Otherwise runs the newest CLI's headless update,
   `npx --yes @lutzseverino/repo-standards@<newest> adopt --headless --json`,
   with the token as `GH_TOKEN`, so both pins move together to the newest CLI
   and standards release.
3. When the update completes, records `status --summary`, which reports it
   ready to commit, commits on the rolling branch `repo-standards/update`,
   force-pushes it, and opens or edits the rolling pull request against the
   default branch. Its body is the record and its title follows the adoption
   rule from the record's selection; a pin moving by a major version, or by a
   minor version of a `0.x` pin, makes it `chore!:`, and the action appends
   Impact and Migration sections from the update class and deferred remote
   setup unless the record already carries them.
4. When the update stops, runs the agent command, if any, with the headless
   report's path in `REPO_STANDARDS_REPORT`, and continues at step 3 when
   `status --json` then reports ready to commit. Otherwise, or when the push
   is refused, it opens or edits the rolling issue, whose `Problem` and
   `Desired outcome` sections carry the target versions, the open questions,
   and the adopter's action.

At most one rolling pull request, found by its branch, or rolling issue, found
by a hidden marker recording its target, is open. A newer release refreshes it;
the same release leaves it untouched; the default branch reaching its versions
closes it; and the item that no longer applies is closed with a comment linking
its successor. All GitHub-specific code, its pushes, pull requests, issues and
branch reads, sits in `action/github.ts` behind one forge interface. The CLI
gains no platform code.

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
3. Run inspection without project mutation or author-script execution, except
   remote setup readiness probes and, when discovery is required, declared
   discovery scripts, both read-only.
4. Reject a stale inspection, a missing or unneeded confirmation, invalid Git state, unsafe targets, ignored
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
   run. Reject incompatible selections and moved tags before mutation. Replace
   local edits to installed content, including added skill resources, and list
   each one in the inspection as a confirmation-required change; remove
   obsolete resources on an unchanged skill update.
10. Retire a declaration by removing its unedited installed targets,
    including a skill's link, and relinquishing ownership, keeping each edited
    target, a skill whole with its link, as project content that later runs
    neither track nor remove.
11. Recover from interrupted installation and fixes through recorded progress
    and explicit retry. Prevent concurrent runs; preserve abandoned work.
    Stop at a fix that needs confirmation to overwrite a setting, and continue
    only with confirmation, rerunning it allowed to overwrite, or with its
    deferral, which later runs run again. Replace a run stopped for its scope
    in place with a changed scope answer, and adopt again in place after
    abandonment, with a change set covering both runs.
12. Pass the same product behavior on macOS and Linux through the published
    installation path and pinned system skills.
13. Report available updates without blocking, degrading to `unknown` when a
    lookup fails, through `outdated` and the update notice that relays it to
    an agent, and classify every update as exact or contextual with
    deterministic Markdown summaries of inspections and runs.
14. Preview and complete a fresh adoption over retired committed product
    state, removing it in the run and replacing any differing tracked
    system skill without an ownership blocker; block on a retired active run
    record; and reject other reads of retired formats with the fresh-adoption
    diagnostic.
15. Adopt and update through `adopt` and an answers file: print a complete
    template without changing the project while a question is open, name
    missing answers, start in the invocation that finds none open and nothing
    blocking, with the inspection identity confirmed after review only when
    confirmation is required, complete contextual work from the answers file's
    assessments, and pin the exact CLI that ran.
16. Adopt in a scripted terminal session, contextual work included: show a
    declaration whose checks fail again, with the failure and its rules, until
    it is fixed or marked blocked; leave the run incomplete, naming a blocked
    declaration; and continue where the run stopped when `adopt` runs again
    after an interruption.
17. Update an unchanged adoption, including one the previous release recorded,
    in one `adopt` invocation and one run that reuses its scope answers, remote setup deferrals and
    assessments, recording each; and propose each recorded answer whose
    guidance, rules, draft, paths, probe, or scoped files changed for review
    instead, never replaying a confirmation or a fix's overwrite answer.
18. Keep an adopting repository current through the update action against a
    fake forge and CLI: open nothing without an update and close landed
    rolling items, propose a complete update as one rolling pull request whose
    body is the adoption record and whose breaking title carries Impact and
    Migration sections, change nothing for the same release, refresh the same
    item for a newer one, and open one rolling issue for a stop, a refused
    push, or an agent command that leaves the update unready.

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
commits other than the update action's on its rolling branch, silent
prerequisite installation, sandbox claims, signed releases, attestations, force
overwrite, and universal rollback are excluded. So are drift detection,
conversion of retired formats, and any workflow rule for what to do with an
available, exact, or contextual update other than the
[update action's](#update-action), which applies only to adopters who opt in
([ADR 0026](../adr/0026-propose-updates-through-one-rolling-pull-request.md)).
The action never merges, applies remote setup, or supports another forge.

## Discovery adoption

[ADR 0003](../adr/0003-use-agent-discovery-with-confirmed-concrete-scope.md)
records the decision behind discovery, and
[ADR 0019](../adr/0019-run-declared-discovery-scripts-read-only.md) the
discovery scripts that draft its proposals.

Where a declaration requests discovery, agent-discovered individual file paths
replace fixed author-supplied contextual scope. When discovery is required,
inspection runs each declared discovery script in a temporary copy of the
observed project, with its prerequisite and timeout, and reports its draft
entry and open questions in `discovery.draft`. A script that fails, times out
or changes the copy fails inspection with `DISCOVERY_SCRIPT_FAILED`; the
project is unchanged. The draft authorizes nothing until the agent or adopter
answers its questions and submits it with `--scope`. One complete inspection binds
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
expectations through retries. Empty discovered scope retains operations; no
scope retains none.

Discovery handoffs and assessments bind the confirmed scope, post-fix snapshot,
and current snapshot and require separate agent coverage reviews after fixes and
at assessment. A need for more files or a mistaken target produces an incomplete
result with preserved work and a safe next action; reporting additional paths
grants no authority, and the scope is corrected by a new run that replaces the
stopped one in place. All migration
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
selection again, observes every active discovery declaration afresh and runs
its discovery script, reports additions and removals against the prior
complete scope, and retains its own proposal, evidence and drafts with that
scope change, replacing the previous run's. A recorded scope answer is reused
only when that fresh evidence reproduces what it was decided from
([ADR 0024](../adr/0024-reuse-recorded-answers-that-are-provably-unchanged.md)). Removed scope paths stay project-owned content; removing a path
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
  target the selection still installs. Since 5.0.0 an edited one is kept
  ([ADR 0016](../adr/0016-keep-edited-content-that-leaves-the-selection.md)).
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

## Removed in 5.0.0

These mechanisms and outcomes are removed, not deprecated. A project adopted
with 4.0.0 adopts fresh over retired committed state through a source-flag
inspection and its start; it does not update in place and has no
update class.

- Git older than 2.32 for `inspect`, `start`, `resume` (including `--retry`
  and `--assessment`), and `check`. Git is checked before project observation;
  `resume` checks its CLI pin first. Git prerequisite diagnostics precede the
  npm and Node diagnostics when several prerequisites fail.
- Directory modes in discovery observations and confirmation identities.
  Different clone umasks and directory `chmod` no longer invalidate a
  confirmation; file executable bits remain bound
  ([ADR 0012](../adr/0012-bind-content-not-location.md)).
- Reading formats before the CLI pin in `status`, `resume`, and `abandon`,
  including their no-active-run cases. A different CLI reports
  `CLI_PIN_MISMATCH` first, rather than a format, integrity, or
  `NO_ACTIVE_RUN` error.
- Treating every same-prefix noncurrent format as retired. A higher numeric
  version reports `NEWER_FORMAT`, including in `lock.json`. Malformed or
  unrelated format identities, including a same-prefix version that is not
  `vN`, are not classified as retired or newer. They fail integrity validation
  when a command reads that record. Newer formats take precedence over retired
  records and never advise removal.
- Requiring removal and a separate commit before inspecting retired committed
  product state. A source-flag inspection previews its removal, and the
  start removes the whole `.repo-standards` tree under its lock.
  Every committed record present must carry its own artifact's current or
  retired format, or `STATE_INTEGRITY` prevents removal. The final observation
  before removal must match the confirmed inventory, or an unchanged subset
  after interrupted removal, or `INSTALLATION_CHANGED` prevents removal.
- Advising fresh adoption for a retired active run. `RETIRED_RUN` calls for
  the earlier pinned CLI's retry or abandonment before any record-reading
  command proceeds; `outdated` is the exception. It takes precedence over
  retired committed records. This CLI's own active run can read, retry, or
  abandon before removing retired committed state, and `check` then reports
  `ACTIVE_RUN`. Retry and abandonment before removal archive none of the
  earlier CLI's local reports. Retired archived reports other than `repo-standards/run/v6` still block and
  must be moved out of Git's directory, while `run/v6` reports are left in place
  unread; retained inspection still rejects retired
  committed state with `RETIRED_FORMAT`.
- Removing every edited target that leaves the selection. Safely observed
  tracked edits are kept as project-owned content, no longer recorded in
  baselines or removed by later runs. A skill stays whole with its link;
  an independently edited link can stay after its unedited skill is removed.
  Contextual overlap and containment by a still-installed target retain their
  existing exceptions; a retired target containing a still-installed target
  is removed even when edited
  ([ADR 0016](../adr/0016-keep-edited-content-that-leaves-the-selection.md)).
- The README evidence rule: an included missing `README` or `README.*` no
  longer needs evidence inside its directory. Every included file that does
  not exist yet keeps its exemption from supplying evidence paths; existing
  and excluded candidates still need eligible evidence.
- Author skills with disagreeing invocation settings, and author declarations
  using `standards-updates` or a reserved system-skill link path under
  `.claude/skills/`. Validation reads only the two invocation settings; it
  does not impose metadata hygiene on unrelated skill frontmatter.
- Agent procedures in the usage documents and the duplicate of
  `author-standards` in `authoring.md`. Procedures live with their skill;
  `adopt-standards` uses its own references with release-pinned contract links.
- The formats `repo-standards/state/v6`, `repo-standards/scope-history/v4`,
  `repo-standards/status/v6`, and `repo-standards/inspection/v5`. Their current
  versions are `state/v7` (skill-link baselines), `scope-history/v5` (directory
  entries without modes), `status/v7` (`scopeProposal`), and `inspection/v6`
  (`systemSkills`, skill links, `kept`, and `retiredState`)
  ([ADR 0007](../adr/0007-write-and-read-one-evidence-format.md)).

## Removed in 6.0.0

These mechanisms are removed, not deprecated
([ADR 0017](../adr/0017-confirm-only-confirmation-required-changes.md)).

- `start --confirm <identity>`. `start --identity <identity>` binds every run
  to its inspection, and `--confirmed` is passed only when the inspection
  requires confirmation. `--confirm` is a usage error.
- Confirming every inspection. A start without a confirmation-required change
  proceeds with the identity alone; the `adopt-standards` skill asks the
  maintainer only when the report requires it.
- Fixes that overwrite an existing setting unasked. A fix returns
  `confirmation-required` instead, and the run continues from it with
  `resume --confirmed`.
- The formats `repo-standards/inspection/v6`, `repo-standards/operation/v1`,
  and `repo-standards/result/v1`. 6.0.0 replaced them with `inspection/v7`
  (`confirmation`), `operation/v2` (`overwriteAllowed`), and `result/v2` (the
  fix status `confirmation-required`). A script returning the retired result
  format fails with `PROTOCOL_ERROR`; no compatibility reader accepts it
  ([ADR 0007](../adr/0007-write-and-read-one-evidence-format.md)).

## Removed in 7.0.0

These mechanisms are removed, not deprecated.

- The `adopt-standards` system skill. `adopt` prints its procedure as the next
  steps of each stage and installs the exact CLI it ran, so nothing is installed
  outside the project by hand.
- The `standards-updates` system skill. The model-invocable
  `repository-standards` skill carries the same update notice
  ([ADR 0014](../adr/0014-leave-available-updates-to-the-maintainer.md)) and rule
  lookup. An update removes an unedited copy of either retired skill and its
  link; an edited copy stays project-owned. Neither name is reserved.
- Plain `status` printing JSON. It prints the Markdown record with the
  **Ready to commit** verdict, as `status --summary` does; `status --json`
  returns the structured report.
- The formats `repo-standards/inspection/v7`, `repo-standards/status/v7`,
  `repo-standards/check/v1`, and `repo-standards/work-request/v3`. 7.0.0
  replaced them with `inspection/v8` (remote setup readiness and `rules`
  contextual changes), `status/v8` (`readyToCommit`, `readinessReasons`, and
  deferred remote setup), `check/v2` (`rules` on a check that did not pass),
  and `work-request/v4` (each declaration's installed `rules`). Durable state,
  lock, run, and scope-history formats are unchanged.
