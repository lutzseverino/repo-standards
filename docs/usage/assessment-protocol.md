# Contextual work and agent assessment

After exact installation and serial fixes, a profile with contextual file or
repository guidance returns an incomplete `contextual` run with a
`repo-standards/work-request/v3` object in `workRequest`. The CLI never runs a
model. This handoff uses the already confirmed selection and preserves the run,
installed baselines, and post-fix project snapshot for subsequent commands.

## Work request

The request contains:

- `run`: the adoption run ID.
- `selection`: a content-derived identity for the exact CLI, standards source,
  version, commit, and profile selection.
- `snapshot`: a content-derived identity for the current observed project
  content, excluding `.repo-standards/` generated state, and the current retry
  attempt. The CLI binds an accepted assessment to it; the agent never copies
  it.
- `declarations`: every active contextual declaration, sorted by ID. Each entry
  contains `id`, `guidance` (source-relative `source`, SHA-256 and executable
  state, and the `retained` project path of its bytes, under
  `.repo-standards/inputs/source/`), and `allowedTargets` with explicit `paths` and
  `directories`. Directory entries allow the directory and its descendants;
  file paths allow only that exact path. No glob interpretation occurs.
- `requiredEvidence`: the fields the agent supplies for each declaration:
  `status`, `explanation`, and `evidence`.

Contextual work applies the selected guidance to the adopting project's actual
content within the allowed targets. Exact files and skills remain author-owned;
excluded and unrelated content remains outside the contextual scope. The
`adopt-standards` skill's
[assessment reference](../../skills/adopt-standards/references/assessment.md)
describes doing and judging this work.

After contextual edits, refresh the request from the project root:

```sh
repo-standards resume --json
```

This verifies installed integrity and returns another expected incomplete
handoff with the current snapshot. It runs neither fixes nor checks. Refreshing
does not reset the post-fix comparison baseline or excuse out-of-scope edits.
The assessment is bound to that snapshot, so a change between refreshing and
submitting makes it stale.

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
judgment. Every contextual declaration needs one entry; unknown or repeated IDs
are rejected, and a missing declaration is rejected by name. Status is
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
[Recovery commands](adoption.md#recover-or-abandon-an-interrupted-run).
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

The derived `changedPaths` is the union of **observed agent changes across all
agent intervals in this run**, under each owning declaration. It excludes work
observed only during fixes and verified restoration recorded in `restoredExact`.
If the agent edits `README.md` and a retried fix restores earlier bytes, the
earlier agent change is still attributed, and the current file needs renewed
assessment. Refresh and retry preserve earlier intervals; neither can turn an
out-of-scope change into valid completion. Replaying fixes requires a new
submission against the retried request, and fresh checks, even when the current
bytes happen to match an earlier snapshot.

Run records and state v7 store each interval's applicable concrete scope
separately from operation outcomes and assessment submissions. State v7 holds
the last complete run's interval, operation, retry, check and assessment
evidence only; a completion does not carry the preceding run's evidence. A
recorded out-of-scope interval remains an incomplete result; abandon and
reconcile before a new confirmed adoption. The last complete state retains its
interval and retry history as historical evidence, without asserting ongoing
compliance.

## Discovery work-request/v3 and assessment/v3

Active discovery uses the same `repo-standards/work-request/v3` and
`repo-standards/assessment/v3` formats as explicit selections. The
request adds `scope` with the confirmed `inspection` identity, `afterFixes`
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
discovery declaration needs both reviews, including empty scope. Explicit
contextual declarations keep their ordinary entry fields. Missing reviews and a
submission in another format are rejected.

A structurally valid blocked review is retained as `SCOPE_INCOMPLETE` before checks.
It grants no authority, and an active run cannot change its confirmed scope.
A different scope takes a new run with a new confirmed scope, as described in
[Correct a confirmed scope](adoption.md#correct-a-confirmed-scope).

For migrations, the CLI attributes old source deletion and destination creation
as separate changed paths, along with introductions and every link-repair file.
All must already be confirmed; there is no rename protocol or deletion
authority implied by exclusions. Out-of-scope changes, stale assessments and
exact corruption prevent completion and preserve work and installation
expectations. Successful state retains the reviews and separate fix/agent
observation intervals.
