---
name: adopt-standards
description: Guide confirmed Repository Standards discovery, adoption, contextual work, updates, and recovery.
disable-model-invocation: true
---

## Choose the CLI and route

Work from the adopting project's Git root. Use its pinned executable at
`.repo-standards/runtime/node_modules/.bin/repo-standards`. If dependencies are
absent, restore them with `npm ci --ignore-scripts --prefix .repo-standards/runtime`.
Read `status --json` for pins, active progress and historical evidence; it
makes no network request. `outdated --json` reports, for the CLI pin and the
standards pin, whether a newer stable version is published and how many stable
releases separate it from the pin. It is read-only apart from its ignored
cache, needs no clean tree, and reports `unknown` with a reason when a lookup
fails; read `usage/available-updates.md` under the document root below. It
states availability only. What to do with an available update is decided by
the adopted standards' own guidance and the maintainer, not by this skill.
If any command fails with `RETIRED_FORMAT`, read
`adoption.md#adopt-fresh-from-a-retired-format`: nothing is converted, and the
only path forward is fresh adoption after the maintainer removes the product
state directory and commits that removal through their normal workflow. Then
follow initial adoption below with an externally installed exact CLI.

For initial adoption, use an externally installed exact CLI and read its
`docs/inspection.md` for acquisition. The bootstrap performs inspection only;
keep that disclosed exact version installed outside the project for `start`
and recovery. Read protocol documents below from that CLI's package directory
until the project runtime exists. Thereafter the document root is
`.repo-standards/runtime/node_modules/@lutzseverino/repo-standards/docs/`.

- **Active run:** inspect `active.phase`, `reason`, `changes`, `completed`,
  `uncertain`, `nextAction` and `execution`. Wait while execution is active.
  An ordinary contextual handoff continues at Contextual work below.
  An active run's confirmed scope never changes. When contextual work needs
  files outside it or a confirmed target is mistaken, read
  `adoption.md#correct-a-confirmed-scope`: preserve the work, obtain an
  abandonment instruction before `abandon --json`, resolve its changes, and
  adopt again with a new confirmed scope.
  For interrupted installation, failed/uncertain scripts, or abandonment, read
  `adoption.md#recover-or-abandon-an-interrupted-run` before acting. Obtain an
  explicit retry instruction before `resume --retry --json`, or an abandonment
  instruction before `abandon --json`. Retry repeats trusted fixes and requires
  renewed assessment. Use the run's exact external CLI if the local runtime is
  unusable. Preserve progress records and partial changes.
- **Existing complete adoption:** every requested change of the selection, and
  every repetition of it, is one update on a single path: read `outdated --json`
  for available updates, inspect, present the summary, obtain confirmation of
  the inspection identity, and start. Read
  `adoption.md#update-the-selection` for candidate acquisition and commands.
  Pass source flags to select a standards version, source, or profile; run the
  external candidate exact CLI to change the CLI pin, alone or with any of
  them; omit source flags to keep the retained standards, which the pinned CLI
  inspects even when the source is unavailable. A confirmed inspection of the
  unchanged selection starts a run that applies it again; do not present that
  run as a retry, resume, or automatic compliance repair.
  Historical discovered scope explains prior authorization; it does not prove
  current coverage. Every active discovery declaration needs a fresh proposal
  for every update, even when the original source is unavailable for retained
  work.
- **Initial adoption:** obtain the public GitHub source, stable standards tag
  and complete profile from the maintainer, then inspect that selection.

## Inspect and confirm

1. Run `inspect --source <URL> --standards-version <tag> --profile <name> --json`
   for initial adoption or to select a standards version, source, or profile.
   To change the CLI pin, run the exact candidate's `inspect`, with source flags
   or without them to keep the retained standards. To apply the unchanged
   selection again, run the pinned project's `inspect --json` without source
   flags.
   Store reports outside the project. Read `inspection.md` when interpreting
   fields, blockers, or acquisition errors. If discovery is required, read
   `inspection.md#discover-contextual-file-scope` and each discovery
   guidance file. Inspect eligible evidence in the real repository, explain
   candidate inclusion/exclusion and membership for missing READMEs, and resolve
   membership questions with the maintainer. Enumerate individual existing files,
   planned destinations, directory introductions, and link-repair files around
   exact-owned content. Prepare the versioned proposal outside the project and
   rerun `inspect --scope <file>` until one complete inspection is reviewable.
   An explained empty scope retains its declaration and operations.
2. Present the actual report's identity and exact CLI version, source URL,
   standards tag, commit and profile; for updates include the changed
   components, previous and candidate selections, retired declarations, and
   discovered-scope additions and removals. State the update class from
   `updateClass`: an exact update changes only exact content, skills, or the
   selection; a contextual update changes guidance, discovery guidance,
   operations, retired declarations, or confirmed scope, and
   `contextualChanges` names each differing declaration. The class describes
   the update; it neither approves it nor replaces review. Render the same
   inspection with `inspect --summary`, using the same executable and flags
   without `--json`, and present that Markdown as the proposal after checking
   that its identity matches the report. Show exact creates/replacements/matching-file
   claims and whole-skill inventories, discovery rationale and candidate exclusions,
   contextual guidance and allowed targets, resolved exclusions, and ownership changes. Make the full inspection available
   for review, including its diffs against existing content and the hashes of supplied material.
3. Disclose every declared fix/check, its script and resources, literal argument
   vector, project-root working directory, timeout, prerequisite version probe
   and range. Explain that probes and scripts execute trusted code with the
   user's host, environment and network access; resources are retention, not a
   sandbox. Inspection runs none of them; prerequisites remain unverified until
   start. Surface all blockers. Reconcile them before reinspection; preserve
   existing work and let the maintainer handle prerequisite installation.
4. Obtain explicit maintainer confirmation tied to this inspection identity and
   disclosed selection/operations. A general request to adopt is not confirmation
   of an unseen inspection. Then use the same executable and flags for
   `start --confirm <identity> --json`, repeating source flags when the
   inspection used them and omitting them when it used retained standards. For
   every discovery-backed adoption or update, pass the same `--scope <file>`
   proposal. One confirmation covers the
   complete inspection; scope discovery itself needs no separate approval.
   Changed inputs or a stale rejection require a new inspection and renewed confirmation.

Author skills are ordinary-work content. The product-owned `adopt-standards`
skill and public CLI govern adoption for every author; author material cannot
replace this workflow or supply adoption hooks.

## Contextual work

When a report returns `workRequest`, read `assessment-protocol.md` before editing
or submitting evidence. The handoff is expected incomplete adoption.

1. For a discovery request, recheck semantic coverage after fixes against
   each discovery guidance file and accepted proposal before editing. Record the
   post-fix coverage evidence for assessment. If more files are needed or a
   confirmed target is mistaken, submit the blocked scope review without writing
   those files, then correct the scope by adopting again as described above;
   additional-path evidence alone grants no authority. Read every request declaration's
   retained guidance and explicit allowed paths and directory trees. Inspect the real project files needed to understand its
   purpose, commands and behavior. Apply guidance usefully within those targets;
   preserve project facts, exact content, excluded employer content and unrelated
   work. If guidance requires out-of-scope work or unsupported facts, assess it
   as blocked and explain the decision needed.
2. Account for every contextual declaration, including already satisfied ones.
   Evidence must cite concrete project content or observed command outcomes.
   Separate agent judgments from CLI script results; passing a structural check
   alone does not establish contextual usefulness.
3. After edits, run `resume --json` to obtain the current snapshot. Follow the
   assessment protocol exactly: copy its run, selection and snapshot identities;
   provide satisfied/blocked, explanation, every observed changed file since
   fixes under its governing declaration, and supporting evidence. Installation
   and fix changes are not contextual changes. Use an empty changed-path list
   when no contextual changes were needed. For discovered declarations, review
   coverage again at the refreshed snapshot and submit both scope-validity reviews
   in assessment/v2, copying the confirmed scope and post-fix identities. Account
   for migration deletion and creation separately and explain preservation of
   useful content. Report observed agent changes across all retry intervals.
4. Store the submission outside the project or in `.repo-standards/local/` and
   run `resume --assessment <file> --json`. Keep content unchanged between refresh
   and submission. Stale evidence needs a refreshed request and reassessment of
   every contextual declaration. Follow the protocol's distinction between
   renewed assessment after ordinary failed checks and explicit operation retry.

## Explain the result

Read JSON even when the CLI exits 1: a handoff, abandonment and failed adoption
are incomplete; diagnostic rejections may instead contain `valid: false` and
`errors`. Report complete adoption only for `outcome: complete`.

For incomplete work, explain phase, reason, actual changes, completed work,
failed or uncertain operations, and the returned safe next action. Preserve
partial work; retry and abandonment require the instructions described above.
For completion, report script outcomes and agent evidence separately, then read
`adoption.md#review-completed-outputs`. Review tracked changes and the contents
and executable state of every non-ignored untracked file, including exact
content, whole skills, retained inputs and durable runtime/state files.
`git diff` omits untracked files; status names and hashes alone are not a content
review. Keep HEAD and index unchanged while exposing new-file content; leave all
adoption changes uncommitted for the maintainer's normal workflow. `status`
evidence describes that run, not continuing compliance after subsequent edits.
`status --summary` renders the last complete run, or the active run, as a
deterministic Markdown record of its selection, operations and results, changed
paths, scope changes, and identities; offer it when the maintainer needs a
written record of the run.
