# Contextual work and agent assessment

After exact installation and serial fixes, a profile with contextual file or
repository guidance returns an incomplete `contextual` run with a
`repo-standards/work-request/v5` object in `workRequest`. The CLI never runs a
model. This handoff uses the run's started selection and preserves the run,
installed baselines, and post-fix project snapshot for subsequent commands.

## Work request

The request contains:

- `run`: the adoption run ID.
- `selection`: a content-derived identity for the exact CLI, standards source,
  version, commit, profile, and platform selection.
- `snapshot`: a content-derived identity for the current observed project
  content, excluding `.repo-standards/` generated state, and the current retry
  attempt. The CLI binds an accepted assessment to it; the agent never copies
  it.
- `declarations`: every active contextual declaration, sorted by ID. Each entry
  contains `id`, `guidance` (source-relative `source`, SHA-256 and executable
  state, and the `retained` project path of its bytes, under
  `.repo-standards/inputs/source/`), `rules` (the project path of the
  declaration's [installed rules](rules.md), present only when it has rules),
  and `allowedTargets` with explicit `paths` and
  `directories`. Directory entries allow the directory and its descendants;
  file paths allow only that exact path. No glob interpretation occurs. In an
  update, an entry may also carry the last complete adoption's judgment of the
  declaration, without `id` or changed paths: `reused`, with the `evidence`
  that its rules, or its adoption guidance when it has no rules, and the files
  in its scope are unchanged since that adoption, or `proposed`, with what
  `changed`. See [reused assessments](#reused-assessments).
- `requiredEvidence`: the fields the agent supplies for each declaration:
  `status`, `explanation`, and `evidence`.

Contextual work applies the selected guidance to the adopting project's actual
content within the allowed targets, so that it satisfies the declaration's
rules. Exact files and skills remain author-owned;
excluded and unrelated content remains outside the contextual scope.
[`adopt`](../guides/adopt.md#adopt-with-one-command) prints each contextual
declaration's rules and adoption guidance with next steps for doing and judging
this work, and submits the assessment from its answers file.

After contextual edits, refresh the request from the project root:

```sh
repo-standards resume --json
```

This verifies installed integrity and returns another expected incomplete
handoff with the current snapshot. It runs neither fixes nor checks. Refreshing
does not reset the post-fix comparison baseline or excuse out-of-scope edits.
The assessment is bound to that snapshot, so a change between refreshing and
submitting makes it stale.

### Reused assessments

An update [reuses](adoption-run.md#reused-answers) the last complete adoption's
judgment of a contextual declaration whose rules, or adoption guidance when it
has no rules, and scoped files are unchanged since that adoption. The run
judges this after its fixes, so a fix that changes a scoped file makes the
judgment ineligible, and again at each refresh, so contextual work that changes
a scoped file does too. When every contextual declaration's judgment is
reused, the run accepts them, bound to itself like a submitted assessment,
records them as reused, and runs its checks without returning a work request.
Otherwise the work request carries each reusable judgment in `reused` and each
other recorded one in `proposed`, for review; a proposed judgment is no
answer until the agent submits one.

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
  "format": "repo-standards/assessment/v3",
  "declarations": [
    {
      "id": "readme",
      "status": "satisfied",
      "explanation": "The README describes this service's setup and architecture.",
      "evidence": [
        "Setup names the worker command; Architecture explains queue ownership."
      ]
    },
    {
      "id": "source-layout",
      "status": "satisfied",
      "explanation": "Existing source modules already have clear responsibilities.",
      "evidence": [
        "src/queue.ts owns delivery; src/storage.ts owns persistence."
      ]
    }
  ]
}
```

Use exactly the documented fields: the submission holds only the agent's
judgment. Every contextual declaration needs one entry, except one whose
recorded judgment the work request reuses: omitting it, or repeating that
judgment, accepts it as reused, and another judgment replaces it. Unknown or
repeated IDs are rejected, and a missing declaration is rejected by name. Status is
`satisfied` or `blocked`. Explanations must be nonempty strings; evidence is a
nonempty array of distinct, nonempty supporting statements. Evidence is agent
judgment, not independently verified proof.

The CLI derives each declaration's changed paths from the run's work evidence:
every path added, modified, deleted, or changed in executable state by agent
work since fixes finished, including every changed file within a directory
tree, attributed to the declaration whose allowed targets permit it; targets of
one profile never overlap. Changes made by installation and fixes are not
attributed. An observed change outside
every declaration's allowed targets, or an unsafe target, blocks completion.

## Freshness, checks, and durable evidence

The CLI binds an accepted assessment to the active run: its run, selection,
and current work-request snapshot. A submission when no adoption run is active
is rejected with `NO_ACTIVE_RUN`. A project that changed since the current
work request is rejected with `STALE_ASSESSMENT`. The submission carries no
identity of its own, so the CLI cannot tell whether it was written for the
current request: after further edits or a retry, only a refreshed request and
renewed evidence for every contextual declaration describe the current
project. Blocked assessments remain in the incomplete run report
separately from script results and prevent checks from starting.

A satisfied assessment advances to checks in declaration and list order, then
final integrity verification and durable completion. All checks execute again
for a renewed accepted assessment; earlier attempts remain in the active run's
operation history. The `checks` and `assessments` fields record the final attempt; the
interval and retry history is retained as described below. Changes after assessment invalidate completion, and detected
check mutation remains an incomplete result with changes preserved.

Resume uses the installation expectations captured before contextual work;
it cannot redefine exact bytes, executable bits, complete skill inventories,
retained inputs, runtime dependencies, or durable product state. HEAD and index
must remain unchanged. An exclusive worker lock prevents concurrent resumes.
Recorded continuation material stays in Git's per-working-tree metadata and is
removed on completion; it is never an adoption output to commit.

Successful completion leaves changes uncommitted. `status --json` reports
historical `checks` and separate `assessments` containing the bound run,
selection, and snapshot, and each declaration's submitted judgment with its
derived `changedPaths`. That accepted record keeps the submission's format
name; only the CLI writes its bound fields. Exit status is 0 only for complete
adoption, 1 for expected handoff or rejection, and 2 for usage errors.

This resume interface handles contextual work, stale final assessment, and
renewed assessment after ordinary `CHECKS_FAILED` results. A timeout, signal,
nonzero exit, malformed protocol result, blocked check, detected check mutation,
or post-check integrity failure is preserved and rejected with
`RESUME_UNAVAILABLE`. Neither refreshing a request nor submitting another
assessment authorizes repeating these operations. Explicit `resume --retry`
recovers interrupted work and repeats fixes, and `abandon` ends the run while
preserving its work and report; see
[Recovery commands](adoption-run.md#recover-or-abandon-an-interrupted-run).
Retry discards the accepted assessment and requires a new submission against
the retried request even when project bytes are unchanged, and retains
separate intervals as described below. Updates use this same assessment interface. The [real-agent acceptance journey](https://github.com/lutzseverino/repo-standards/blob/main/acceptance/README.md) evaluates contextual
usefulness separately; scripted agents exercise this deterministic protocol.

## Observation and replay

For explicit-target adoption, the work request and accepted assessment carry no
`scope` field, and the assessment no `scopeValidity` reviews. The snapshot
identity binds the observed project content, named files and ancestors,
effective observation settings and consulted ignore inputs. Named files remain
observable when ignore rules change. Explicit directory targets keep their
complete tree behavior; unlisted ignored siblings outside those trees remain
outside the observation promise. Creating, removing, or changing the mode of an
explicit directory target is itself an observed change: the CLI attributes the
directory path alongside the files changed within it. Incomplete observation
blocks progression.

The derived `changedPaths` is the **net observed agent changes across all
agent intervals in this run**, under each owning declaration: each path an agent
interval changed whose state now differs from its state before the earliest
interval of the run that changed it. It excludes work observed only during
fixes and verified restoration recorded in `restoredExact`. A path the run
changed and then restored, in or out of scope, has nothing to attribute. If the
agent edits `README.md` and a retried fix writes its earlier bytes back, the
file is no longer attributed; if it differs from its pre-run state, the current
file needs renewed assessment. Refresh and retry preserve earlier intervals;
neither can turn an out-of-scope change that still stands into valid
completion. Replaying fixes requires a new submission against the retried
request, and fresh checks, even when the current bytes happen to match an
earlier snapshot.

An out-of-scope change stops the run with `ASSESSMENT_SCOPE`, naming each path
whose state still differs from before the run. Restore each path in place:
remove a file the run added, or restore an edited file's committed content, and
a directory the run created is removed again. Then run `adopt` again with the
answers, or resume and submit the assessment again. A reconciled violation stops
nothing, and the run continues without abandonment. When a named path belongs
in a discovered declaration's scope, change that scope answer instead: `adopt`
[adopts again in place](adoption-run.md#adopt-again-in-place) with the new scope,
and the new run's `changedPaths` include the agent changes the replaced run
left that still differ from their state before it.

Run records and state v7 store each interval's applicable concrete scope
separately from operation outcomes and assessment submissions. State v7 holds
the last complete run's interval, operation, retry, check and assessment
evidence only; a completion does not carry the preceding run's evidence. A
recorded out-of-scope interval remains an incomplete result until the project
is restored to its state before the run, which reconciles it; the interval keeps
its changes and violations as observed. The last complete state retains its
interval and retry history as historical evidence, without asserting ongoing
compliance.

## Discovery work-request/v5 and assessment/v3

Active discovery uses the same `repo-standards/work-request/v5` and
`repo-standards/assessment/v3` formats as explicit selections. The
request adds `scope` with the run's `inspection` identity, `afterFixes`
snapshot identity, and accepted `proposal`. Each discovered declaration also
includes `discovery` guidance alongside its contextual `guidance` and concrete
`allowedTargets`. Explicit contextual declarations do not have discovery fields.
The post-fix snapshot is captured after each successful fix phase, remains fixed
across refreshes, and is renewed by explicit retry; the ordinary `snapshot` binds
the current project state and retry attempt. Expected adoption writes are allowed
under their phase's concrete scope, not treated as stale pre-start observations.

The `afterFixes` scope-validity review judges coverage against the post-fix
project, and the `current` review judges it against the refreshed current
project: included and excluded candidates, missing READMEs, intended
destinations and links, and explained empty scope. These are agent judgments;
the CLI checks their structure and identity, not semantic truth.

Submit `repo-standards/assessment/v3` with the ordinary fields. The CLI binds
the accepted assessment to the request's confirmed `scope.inspection` and
`scope.afterFixes` identities; the agent copies neither. Each discovery
declaration requires `scopeValidity` with exactly `afterFixes` and `current`.
Each review uses:

```json
{
  "status": "valid",
  "explanation": "The maintained projects and planned migration files remain covered.",
  "evidence": [
    "Reviewed project manifests, legacy documentation and navigation links."
  ],
  "additionalPaths": []
}
```

Both reviews need nonempty explanation and a nonempty list of distinct evidence
statements. `additionalPaths` is a list of distinct repository-relative filenames.
`status: blocked` reports, with its explanation, that coverage needs the files
listed in `additionalPaths`, that membership is unresolved, or that a target
must be withdrawn. `valid` requires an empty additional-path list. Every
discovery declaration needs both reviews, including empty scope and
[no scope](inspection.md#no-scope). A declaration with no scope has no rules,
no operations, and no allowed targets, and the accepted `proposal` marks its
entry with `noScope`: its assessment judges only that no project file belongs
in its scope, with both reviews `valid` when none does, or `blocked` with the
files that do in `additionalPaths`, which stops the run for its scope. It has
no other contextual work. Explicit
contextual declarations keep their ordinary entry fields. Missing reviews and a
submission in another format are rejected.

A structurally valid blocked review is retained as `SCOPE_INCOMPLETE` before checks.
It grants no authority, and an active run cannot change its confirmed scope.
A different scope takes a new run with a new confirmed scope, as described in
[Correct a confirmed scope](adoption-run.md#correct-a-confirmed-scope).

For migrations, the CLI attributes old source deletion and destination creation
as separate changed paths, along with introductions and every link-repair file.
All must already be confirmed; there is no rename protocol or deletion
authority implied by exclusions. Out-of-scope changes, stale assessments and
exact corruption prevent completion and preserve work and installation
expectations. Successful state retains the reviews and separate fix/agent
observation intervals.
