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
