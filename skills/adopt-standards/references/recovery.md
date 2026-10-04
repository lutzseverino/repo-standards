# Recover, abandon, or adopt fresh

Run every recovery command with the run's exact CLI. `status`, `resume`, and
`abandon` reject any other with `CLI_PIN_MISMATCH`, whose message names the CLI
to use. If installation stopped before the project runtime became usable, use
the externally installed CLI that started the run. Preserve progress records
and partial changes throughout. The commands and their guarantees are defined
in
[recovery](https://github.com/lutzseverino/repo-standards/blob/v4.0.0/docs/usage/adoption.md#recover-or-abandon-an-interrupted-run).

## Read the active run

Read `status --json` and its `active` record: `phase`, `reason`, `changes`,
`completed`, `uncertain`, `nextAction`, and `execution`.

- `execution: active` means a command or an author process group is still
  running. Wait for it to finish. Stop it only on the maintainer's
  instruction.
- An ordinary contextual handoff continues with [assessment](assessment.md).
- An ordinary `CHECKS_FAILED` result continues with a renewed
  [assessment](assessment.md#submit-the-assessment), not a retry.
- Interrupted installation, other failed or uncertain operations, and failed
  completion need a decision between retry and abandonment. Explain the phase,
  reason, actual changes, completed and uncertain work, and the safe next
  action, then ask the maintainer.

## Retry

Obtain an explicit retry instruction before `resume --retry --json`. Retry
repeats trusted operations: it checks prerequisites again, finishes pending
installation from saved material, reruns repeat-safe fixes, and reruns checks.
It discards the accepted assessment, so contextual work needs a renewed
assessment afterwards. Edits to installed content other than the inspected or
expected bytes block retry; reconcile them with the maintainer, never by
overwriting. Never remove durable run records to get past a recovery check.

## Abandon

Obtain an explicit abandonment instruction before `abandon --json`. Abandonment
keeps the project content and archives the run's report. Afterwards, help the
maintainer reconcile the preserved changes through the project's normal
workflow. A new adoption needs a clean committed project and a fresh confirmed
inspection.

## Correct a confirmed scope

An active run's confirmed scope never changes, and retry repeats work under it.
When contextual work needs files outside the scope, or a confirmed target is
mistaken, submit the blocked scope review without writing those files. The run
stays incomplete with `SCOPE_INCOMPLETE`. Then adopt again:

1. Preserve the work worth keeping.
2. With the maintainer's instruction, abandon the run.
3. Resolve its changes through the project's normal workflow. Commit or discard
   contextual work on project-owned files. Discard what the run installed by
   restoring `.repo-standards/`, exact content, and skills to their committed
   state: the new run installs them again, and an abandoned run's product state
   is not a complete adoption.
4. Build a new [scope proposal](discovery.md), inspect with it, obtain explicit
   confirmation of the new inspection, and start it with the same proposal.

## Adopt fresh from a retired format

`RETIRED_FORMAT` means the CLI does not read a record the project carries.
Nothing is converted, and the only way forward is a fresh adoption.

1. When the diagnostic names a run record in Git's directory, the CLI that the
   project pinned before can still resume or abandon that run and so preserve
   its work. Offer that first; this CLI cannot.
2. The maintainer removes any such record, at
   `git rev-parse --git-path repo-standards-run.lock` and the
   `repo-standards-reports/` directory beside it, and the product state:

   ```sh
   git rm -r --quiet .repo-standards  # tracked product state
   rm -rf .repo-standards             # ignored runtime, local, and cache content
   ```

3. The maintainer commits that removal through their normal workflow.
4. Continue with an initial adoption using an externally installed exact CLI.
