---
name: adopt-standards
description: Guide Repository Standards discovery, adoption, contextual work, updates, and recovery.
disable-model-invocation: true
---

This skill's references hold its procedures and install with it at the same
version:

- [Discovery](references/discovery.md): building the scope proposal and
  rechecking coverage.
- [Assessment](references/assessment.md): doing and judging contextual work.
- [Recovery](references/recovery.md): an interrupted run, abandonment, scope
  correction, and fresh adoption from a retired format.
- [Review](references/review.md): reviewing a completed run's outputs.

## Choose the CLI and route

Work from the adopting project's Git root. Use its pinned executable at
`.repo-standards/runtime/node_modules/.bin/repo-standards`. If dependencies are
absent, restore them with `npm ci --ignore-scripts --prefix .repo-standards/runtime`.
Read `status --json` for pins, active progress and historical evidence; it
makes no network request. `outdated --json` reports, for the CLI pin and the
standards pin, whether a newer stable version is published and how many stable
releases separate it from the pin. It is read-only apart from its ignored
cache, needs no clean tree, and reports `unknown` with a reason when a lookup
fails. It states availability only. Whether to update is the maintainer's
decision; the `standards-updates` skill reports available updates without
starting one.
If any command fails with `RETIRED_FORMAT` or `RETIRED_RUN`, follow
[Recovery](references/recovery.md#adopt-fresh-from-a-retired-format).

For initial adoption, and to change the CLI pin, use an exact CLI installed
outside the project, replacing `VERSION` with the exact version, such as the
one the bootstrap disclosed:

```sh
cli_dir="$HOME/.local/share/repo-standards/cli-VERSION"
mkdir -p "$cli_dir"
(cd "$cli_dir" && npm install --prefix "$cli_dir" \
  --ignore-scripts --save-exact --no-audit --no-fund \
  @lutzseverino/repo-standards@VERSION)
"$cli_dir/node_modules/.bin/repo-standards" --version
printf 'CLI directory: %s\n' "$cli_dir"
```

Keep the printed absolute directory and use it in later commands, since shell
variables may not survive between tool calls. The bootstrap performs inspection
only; keep this installation for `start` and recovery until the run completes.

- **Active run:** follow [Recovery](references/recovery.md#read-the-active-run).
  An ordinary contextual handoff continues at Contextual work below. Obtain an
  explicit retry instruction before `resume --retry --json`, and an abandonment
  instruction before `abandon --json`.
- **Existing complete adoption:** every requested change of the selection, and
  every repetition of it, is one update on a single path: read `outdated --json`
  for available updates, inspect, present the summary, and start with the
  inspection identity.
  Pass source flags to select a standards version, source, or profile; run the
  external candidate exact CLI to change the CLI pin, alone or with any of
  them; omit source flags to keep the retained standards, which the pinned CLI
  inspects even when the source is unavailable. An inspection of the
  unchanged selection starts a run that applies it again; do not present that
  run as a retry, resume, or automatic compliance repair.
  Every active discovery declaration needs a fresh proposal for every update.
- **Initial adoption:** obtain the public GitHub source, stable standards tag
  and complete profile from the maintainer, then inspect that selection.

## Inspect and start

The maintainer's request to adopt or update a selection is their consent. Ask
them again only when the inspection report requires confirmation.

1. Run `inspect --source <URL> --standards-version <tag> --profile <name> --json`
   for initial adoption or to select a standards version, source, or profile.
   To change the CLI pin, run the exact candidate's `inspect`, with source flags
   or without them to keep the retained standards. To apply the unchanged
   selection again, run the pinned project's `inspect --json` without source
   flags.
   Store reports outside the project. The
   [report contract](https://github.com/lutzseverino/repo-standards/blob/v5.1.1/docs/usage/inspection.md#report-and-inspection-identity)
   defines its fields and blockers. If the report returns `discovery`, build
   the proposal as [Discovery](references/discovery.md) describes and rerun
   `inspect --scope <file>` until one complete inspection is reviewable.
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
   without `--json`, and present that Markdown, after checking that its
   identity matches the report, as what the run will do. Show exact creates, replacements and matches,
   the targets an update removes, each target in `discardedEdits` (its
   replacement or removal discards content other than its installed
   baseline), each target in `kept` (edited content that leaves the selection
   stays in place, and the project owns it from then on), whole-skill inventories, discovery rationale and candidate exclusions,
   contextual guidance and allowed targets, resolved exclusions, and ownership changes. Make the full inspection available
   for review, including its diffs against existing content and the hashes of supplied material.
3. Disclose every declared fix/check, its script and resources, literal argument
   vector, project-root working directory, timeout, prerequisite version probe
   and range. Explain that probes and scripts execute trusted code with the
   user's host, environment and network access; resources are retention, not a
   sandbox. Inspection runs none of them; prerequisites remain unverified until
   start. Surface all blockers. Reconcile them before reinspection; preserve
   existing work and let the maintainer handle prerequisite installation.
4. Read the report's `confirmation`. When `confirmation.required` is false,
   start without asking: use the same executable and flags for
   `start --identity <identity> --json`, repeating source flags when the
   inspection used them and omitting them when it used retained standards. For
   every discovery-backed adoption or update, pass the same `--scope <file>`
   proposal.
5. When `confirmation.required` is true, the run makes a confirmation-required
   change: each entry in `confirmation.reasons` names a target whose
   replacement or removal discards a person's edits. Present those targets with
   their diffs, and ask the maintainer to confirm discarding them. Only after
   their explicit confirmation of this inspection, start as above with
   `--confirmed` added. Without it, do not start. `start` refuses to proceed
   without `--confirmed` when the inspection requires it, and rejects it when
   the inspection does not; never pass it by habit.

Changed inputs or a stale rejection require a new inspection; ask again only
when the new report requires confirmation.

Author skills are ordinary-work content. The product-owned `adopt-standards`
skill and public CLI govern adoption for every author; author material cannot
replace this workflow or supply adoption hooks.

## Contextual work

When a report returns `workRequest`, follow
[Assessment](references/assessment.md) before editing or submitting evidence.
The handoff is expected incomplete adoption.

## Explain the result

Read JSON even when the CLI exits 1: a handoff, abandonment and failed adoption
are incomplete; diagnostic rejections may instead contain `valid: false` and
`errors`. Report complete adoption only for `outcome: complete`.

For incomplete work, explain phase, reason, actual changes, completed work,
failed or uncertain operations, and the returned safe next action. Preserve
partial work; retry and abandonment require the instructions described above.
For completion, report script outcomes and agent evidence separately, then
review every output as [Review](references/review.md) describes, leaving all
adoption changes uncommitted for the maintainer's normal workflow. `status`
evidence describes that run, not continuing compliance after subsequent edits.
`status --summary` renders the last complete run, or the active run, as a
deterministic Markdown record of its selection, operations and results, changed
paths, scope changes, and identities; offer it when the maintainer needs a
written record of the run.
