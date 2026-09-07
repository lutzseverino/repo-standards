# Contextual work and agent assessment

After exact installation and serial fixes, a profile with contextual file or
repository guidance returns an incomplete `contextual` run with a
`repo-standards/work-request/v1` object in `workRequest`. The CLI never runs a
model. This handoff uses the already confirmed selection and preserves the run,
installed baselines, and post-fix project snapshot for subsequent commands.

## Work request

The request contains:

- `run`: the adoption run ID.
- `selection`: a content-derived identity for the exact CLI, standards source,
  version, commit, and profile selection.
- `snapshot`: a content-derived identity for current tracked and non-ignored
  untracked project content, excluding `.repo-standards/` generated state, and
  the current retry attempt. Copy this opaque identity from the current request.
- `declarations`: every active contextual declaration, sorted by ID. Each entry
  contains `id`, `guidance` (source-relative `source`, `content`, `encoding`,
  SHA-256 and executable state), and `allowedTargets` with explicit `paths` and
  `directories`. Directory entries allow the directory and its descendants;
  file paths allow only that exact path. No glob interpretation occurs.
- `requiredEvidence`: `status`, `explanation`, `changedPaths`, and `evidence`.

Read the selected guidance and apply it to the adopting project's actual content.
Exact files and skills remain author-owned; excluded and unrelated content
remains outside the contextual scope. Preserve work and report blockers honestly.

After contextual edits, refresh the request from the project root:

```sh
repo-standards resume --json
```

This verifies installed integrity and returns another expected incomplete
handoff with the current snapshot. It runs neither fixes nor checks. Refreshing
does not reset the post-fix comparison baseline or excuse out-of-scope edits.
Keep the project content unchanged while assessing and submitting that snapshot.

## Assessment submission

Write one JSON document, then submit it with the pinned CLI:

```sh
repo-standards resume --assessment /tmp/assessment.json --json
```

`resume` also accepts `--project <directory>`. A relative assessment filename
is resolved against that project directory. Store submissions outside the
project or in ignored `.repo-standards/local/`; an untracked submission in an
unrelated project path is itself an out-of-scope change.

```json
{
  "format": "repo-standards/assessment/v1",
  "run": "COPY_WORK_REQUEST_RUN",
  "selection": "COPY_WORK_REQUEST_SELECTION",
  "snapshot": "COPY_WORK_REQUEST_SNAPSHOT",
  "declarations": [
    {
      "id": "readme",
      "status": "satisfied",
      "explanation": "The README describes this service's setup and architecture.",
      "changedPaths": ["README.md"],
      "evidence": ["Setup names the worker command; Architecture explains queue ownership."]
    },
    {
      "id": "source-layout",
      "status": "satisfied",
      "explanation": "Existing source modules already have clear responsibilities.",
      "changedPaths": [],
      "evidence": ["src/queue.ts owns delivery; src/storage.ts owns persistence."]
    }
  ]
}
```

Use exactly the documented fields. Every contextual declaration needs one entry;
unknown or repeated IDs are rejected. Status is `satisfied` or `blocked`.
Explanations must be nonempty strings; evidence is a nonempty array of distinct,
nonempty supporting statements. Evidence is agent judgment, not independently
verified proof. `changedPaths` is an array of distinct repository-relative paths
without dot, parent, empty, backslash, drive-prefix, or control-character
components. Empty arrays are valid when no contextual changes were needed.

Report all added, modified, deleted, and executable-state-changed paths since
fixes finished, against the declaration that governs each path. Report actual
files, including every changed file within a directory tree. Changes made by
installation and fixes are already accounted for and must not be claimed as
contextual changes. An unchanged extra path, omitted observed path, path under
the wrong declaration, unsafe target, or out-of-scope change blocks completion.
Ignored untracked files are outside the content snapshot; tracked files remain
observed even when an ignore rule matches them.

## Freshness, checks, and durable evidence

Submissions must identify this run, selection, and the current work-request
snapshot. Refresh after further edits, reassess all contextual declarations,
and submit renewed evidence. Blocked assessments remain in the incomplete run
report separately from script results and prevent checks from starting.

A satisfied assessment advances to checks in declaration and list order, then
final integrity verification and durable completion. All checks execute again
for a renewed accepted assessment; earlier attempts remain in the active run's
operation history. Completed state records only the final attempt's checks and
its assessment. Changes after assessment invalidate completion, and detected
check mutation remains an incomplete result with changes preserved.

Resume uses the installation expectations captured before contextual work;
it cannot redefine exact bytes, executable bits, complete skill inventories,
retained inputs, runtime dependencies, or durable product state. HEAD and index
must remain unchanged. An exclusive worker lock prevents concurrent resumes.
Recorded continuation material stays in Git's per-working-tree metadata and is
removed on completion; it is never an adoption output to commit.

Successful completion leaves changes uncommitted. `status --json` reports
historical `checks` and separate `assessments` containing the submitted run,
selection, snapshot, and per-declaration evidence. Exit status is 0 only for
complete adoption, 1 for expected handoff or rejection, and 2 for usage errors.

This resume interface handles contextual work, stale final assessment, and
renewed assessment after ordinary `CHECKS_FAILED` results. A timeout, signal,
nonzero exit, malformed protocol result, blocked check, detected check mutation,
or post-check integrity failure is preserved and rejected with
`RESUME_UNAVAILABLE`. Neither refreshing a request nor submitting another
assessment authorizes repeating these operations. Use explicit `resume --retry`
to recover interrupted work and repeat fixes, or `abandon` to preserve its work
and report; see [Recovery commands](adoption.md#recover-or-abandon-an-interrupted-run).
Retry requires new assessment even when project bytes are unchanged, and retains
the original contextual comparison baseline. Updates remain a later ticket. Real-agent usefulness is evaluated separately in
issue #9; scripted agents exercise this deterministic protocol.
