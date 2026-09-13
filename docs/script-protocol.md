# Trusted script protocol

Every active declaration may own checks and repeat-safe fixes as described in
[Author format](author-format.md#checks-and-fixes). Inspection displays their
scripts, literal arguments, resources and prerequisites without executing them.
Maintainer confirmation authorizes their execution. Scripts are trusted code
with the invoking user's host, environment and network access. Declared
resources control retention, not sandbox access.

## Prerequisites and invocation

Before changing project content, start invokes every operation's executable
with its literal `prerequisite.version-arguments`, from the project root.
It compares the first complete SemVer-like version observed in either output
stream with the declared npm SemVer range. Version fragments from different
streams are never combined. A leading `v`, prerelease and build suffixes are
supported. Missing executables, unsuccessful or timed-out probes, unreadable
versions and incompatible versions are reported for all operations and block
installation. The CLI never installs prerequisites. The operation's timeout
also applies to its probe, with a 1 MiB limit on each output stream.

After installation the CLI invokes this argument vector directly:

```text
[executable, absolute-retained-script-path, ...literal-arguments]
```

The current directory is the adopting-project root. Arguments containing spaces,
empty strings, wildcard characters or shell expressions retain their literal
values. There is no shell, author-defined environment override, or custom
working directory. The process inherits the CLI environment. Retained scripts
live under `.repo-standards/inputs/source/` at their original source-relative
paths. Declared resources keep the same layout; scripts can locate them relative
to their own retained path. Other profiles and unrelated source material are
not retained.

## JSON input on stdin

The CLI supplies one UTF-8 JSON object and closes stdin:

```json
{
  "format": "repo-standards/operation/v1",
  "operation": {"declaration": "readme", "phase": "checks", "id": "headings"},
  "projectRoot": "/absolute/project",
  "standards": {
    "repository": "https://github.com/alice/standards",
    "version": "v1.0.0",
    "commit": "40-character-resolved-commit-sha"
  },
  "profile": "work",
  "declarations": [],
  "allowedTargets": {"paths": ["README.md"], "directories": []}
}
```

`declarations` contains every active, fully resolved declaration, including its
ID and complete checks/fixes lists; the empty array above is abbreviated.
`operation.phase` is `fixes` or `checks`. `allowedTargets` describes this
operation's owning declaration: file targets are explicit paths, skills are
whole `.agents/skills/<name>` directories, and repository guidance retains its
explicit paths and directory trees. All targets are project-relative. Authors
must respect that scope, the active profile, and exclusions.

## JSON result on stdout

Return exactly one UTF-8 JSON object with these three fields, and exit zero:

```json
{"format":"repo-standards/result/v1","status":"passed","message":"Required headings are present."}
```

A fix status is `unchanged`, `changed`, or `blocked`. A check status is `passed`,
`failed`, or `blocked`. `message` is a string explaining the result. Additional
fields, wrong formats, invalid statuses, missing fields, multiple JSON values,
and non-JSON stdout are protocol errors. Surrounding whitespace is accepted.
Write human logs to stderr. A standards failure is a zero-exit `failed` result;
it is distinct from a process failure.

Nonzero exits, signals, timeouts, spawn failures, output exceeding 1 MiB per
stream, and invalid protocol output are execution errors. On timeout or excess
output the CLI kills the operation's process group with SIGKILL, so a process
ignoring SIGTERM cannot keep the run waiting. This is process cleanup, not a
sandbox. Captured output is bounded and retained under ignored
`.repo-standards/local/operations/`. Reports separate `process` evidence
(`exitCode`, `signal`, `error`, `timedOut`), a parsed `result` or null, the
execution `error` code or null, and stdout/stderr log paths. Durable state keeps
check evidence; detailed logs remain local and are absent from fresh checkouts.

## Ordering, integrity and incomplete work

Declarations execute by ID; operations execute in their listed order. All fixes
run before contextual work. Checks run after a satisfied, current [agent assessment](assessment-protocol.md);
profiles without contextual declarations run checks immediately after fixes.
Excluded declarations and their operations never run. Fixes stop at the first
block or execution error. Ordinary failed checks allow remaining checks to
collect evidence. A blocked check or execution error stops further execution.

Fixes must be safe to repeat, including after interruption at any point. Observe
the current project and make only the missing changes; do not assume a previous
invocation finished or never started. Return `unchanged` when no work is needed.
The CLI records an uncertain operation before invocation and records its result
afterward. Recovery requires explicit `resume --retry`: it verifies installed
progress, repeats fixes, requests renewed contextual assessment, and reruns
checks before completion. It never implicitly retries an uncertain operation.
Use `abandon` to preserve incomplete work and its report without asserting
completion. A surviving author process group blocks retry and abandonment even
after its direct fix or prerequisite probe returns. See the
[recovery commands](adoption.md#recover-or-abandon-an-interrupted-run).

Checks must leave project content unchanged. The CLI compares tracked and
non-ignored untracked content before and after each check, independently of
whether adoption already dirtied the working tree. It also verifies exact bytes
and executable state, whole skill inventories, retained inputs, runtime files,
product state, HEAD and the index against installation expectations after each
operation. Index verification includes skip-worktree and assume-unchanged flags
that can conceal later edits from Git status. Unexpected changes are preserved and adoption remains incomplete;
they cannot redefine the installed baseline. Altered local run-report bytes are
preserved beside the operation logs before the incomplete report is saved.

Use `status --json` and the incomplete report to review actual changes and
successful, failed or uncertain work. Follow the recovery instructions in
[Adoption](adoption.md#completion-and-incomplete-results). No process error,
blocked result, failed check or contextual handoff asserts complete adoption.

## Observed scope for v2 adoption

Sources using `repo-standards/v2` use the same execution
machinery and unchanged `repo-standards/operation/v1` input and
`repo-standards/result/v1` output. Each fix's observed added, deleted, edited,
and executable-state-changed files must fit **its owning declaration**, not the
union of all declarations. A violation reports `OPERATION_SCOPE`, the operation,
and offending paths. Checks report `CHECK_MUTATION` for observed writes, even
within their allowed targets. A successful process/result does not override
scope or exact-integrity failure. Exact bytes, executable state, and complete
skill inventories (including directory paths and added empty directories) stay protected against their own declaration's fixes too.

Observations include tracked and non-ignored content, named targets even after
they become ignored, their ancestors, effective observation settings and ignore
inputs. Explicit directory targets include ignored descendants. Generated
`.repo-standards` content is verified separately against installation expectations.
The same directory-aware inventory comparison protects durable product state,
including retained inputs and runtime manifests. Only `local`, `cache`, and
`runtime/node_modules` are excluded from that inventory: local logs/caches are
generated outputs, and runtime dependencies have their own complete-tree
integrity check.
Unlisted ignored siblings outside explicit directory trees are not inventoried;
trusted scripts retain host/network access. These are bounded before/after
observations, not continuous monitoring or atomic filesystem snapshots. The
[same observation limits](inspection.md#discover-contextual-file-scope-v2-sources)
apply; incomplete reads, unsafe boundaries, instability, or exhausted limits
block progression and preserve incomplete work.

`repo-standards/run/v2` records `observations` separately from `operations` and
`assessments`. Each interval has a phase (`fixes`, `checks`, or `agent`), its
applicable declaration `scope`, and a `before` observation. Closed intervals add
`after`, file `changedPaths`, `boundaryChanges`, and `violations`. Operation intervals identify the
operation and its `operationIndex` in the run's operation history; an interval closed during explicit recovery has `interrupted: true`
when its operation outcome was not fully recorded. An open interval is evidence
that observation is incomplete, never evidence of no changes. Observations
contain file identities and executable state, boundaries, settings, and consulted
ignore-input identities. Changes to external ignore inputs/settings are reported
as `@ignore/global`, `@ignore/info`, or `@git/observation-settings` and cannot be
authorized as project paths.

Adjacent observations are compared across operation and handoff boundaries;
work between author invocations has its own agent interval. Named file scope
permits creating missing parent directories, but not deleting or changing
existing ancestors. Checks may not create even empty directories.

Retry retains intervals and earlier agent evidence before repeating fixes; it
cannot authorize new scope or hide a recorded violation. A confirmed scope
amendment first closes and validates every interval against its outgoing scope,
then records the accepted revision before replaying fixes with the new concrete
targets. Its replay creates new fix intervals; prior fix and agent intervals keep
their original scope and attribution. Recovery after acceptance uses retry and
does not create a second authorization record. A recorded scope or
check-mutation violation requires abandonment and reconciliation before a new
adoption. An incomplete observation must first become readable and complete. Restoring
corrupted exact content is permitted only after verifying the immutable
installation expectations; `restoredExact` records those restored identities
separately from contextual work. `restoredBoundaries` covers only recreated
parents of restored exact files or removal of extra directories inside a
verified skill inventory; it never exempts changes to existing directory modes.
This grants no new contextual scope.
Durable `repo-standards/state/v4` and `repo-standards/status/v2` retain intervals,
operation history, retry history, final checks and assessments. Accepting an
amendment advances the active run and status records to v3; state v4 retains its
scope revisions and authorization evidence. State v4 also
retains each prior complete v2 run's corresponding evidence in its ordered
`history`. Detailed logs remain local; the recorded outcomes and interval
evidence survive a fresh checkout. The integrity lock remains
`repo-standards/lock/v1` and binds the new state bytes. V1 sources retain their
existing execution and report formats.
Retained inspection also checks v2 exact-skill and durable product directories
against the paths implied by the recorded file inventory, so later
empty-directory edits block updates before mutation.
Retained inspection remains `repo-standards/inspection/v2` with
`repo-standards/scope-history/v2` after ordinary v2 completion. When state v4
contains accepted amendments, retained inspection uses
`repo-standards/inspection/v3` and its historical scope uses
`repo-standards/scope-history/v2` with `scopeRevision` and `amendments`.

Confirmed discovery declarations are materialized into the existing target
representation before execution. `allowedTargets.paths` is the confirmed file
list and `allowedTargets.directories` is empty. The active resolved declarations
carry those same targets; operations do not interpret discovery guidance. Empty
scope still executes its fixes and checks and requires contextual coverage review.
Deletion and creation are separate observed changes: a move grants no implicit
authority for its destination or link repairs. Excluded candidates and declarations
grant no deletion authority.
