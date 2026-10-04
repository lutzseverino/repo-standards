# Run the adopted checks

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards check --json
```

`check` runs every check of the last complete adoption against the current
working tree and reports each result. Use it between runs, for example to
check finished work against the adopted standards before delivering it. It
runs no fix and asks for no confirmation: the adoption disclosed and confirmed
these checks. It records nothing, so a passing `check` does not change the
adoption's evidence or claim continuing compliance. `--project <directory>`
selects another Git working tree.

## What runs

`check` reads the committed product state and retained inputs, verified
against the integrity lock, and nothing else: no standards source, registry or
network connection is needed. It runs the checks of the retained resolved
selection exactly as a run does, as the [script protocol](script-protocol.md)
describes:

- It first probes the prerequisites of every check. Any missing executable or
  incompatible version fails `check` with `PREREQUISITES_BLOCKED` before any
  check runs, listing every probe in the diagnostic's `details`.
- Each check receives the same `repo-standards/operation/v1` input as in a run,
  with the selection's standards and profile, every active resolved declaration,
  and its declaration's allowed targets, and the same arguments, working
  directory, timeout and output limits.
- Declarations run by ID and checks in their listed order.

Unlike a run, `check` runs every check whatever earlier checks returned, so one
invocation reports them all. The working tree need not be clean; uncommitted
work is what it checks.

## Report

With `--json`, `check` prints one `repo-standards/check/v1` object:

```json
{
  "format": "repo-standards/check/v1",
  "outcome": "failed",
  "selection": {
    "cli": {"package": "@lutzseverino/repo-standards", "version": "5.0.0"},
    "standards": {"repository": "https://github.com/alice/standards", "version": "v1.0.0", "commit": "40-character-resolved-commit-sha"},
    "profile": "work"
  },
  "checks": [
    {"declaration": "readme", "id": "headings", "status": "failed", "message": "README.md has no Usage heading.", "error": null,
     "stdout": ".repo-standards/local/checks/0.stdout", "stderr": ".repo-standards/local/checks/0.stderr"}
  ]
}
```

Each entry of `checks` names its declaration and check `id`, in execution
order. `status` is the check's result status, `passed`, `failed` or `blocked`,
with its `message`, or `error` when the check did not return a valid result: a
nonzero exit, signal, timeout, spawn failure, excess output or invalid protocol
output. `error` is then the execution error code, such as `PROTOCOL_ERROR` or
`NONZERO_EXIT`, and `message` says so; otherwise `error` is null. `stdout` and
`stderr` name the check's captured output streams, which the next `check`
replaces. `outcome` is `passed` only when every check passed, including when
there are none.

Without `--json`, `check` prints a readable summary: the selection and the count
of each status, then one line per check with its status, declaration, ID and
message, and the paths of its output logs when it did not pass. Line breaks in
a message or the profile become spaces in the summary, so each check and the
header keep one line; the JSON report keeps both values as they are.

`check` exits 0 when every check passed and 1 when any check failed, was
blocked, or did not return a valid result. A failure to run the checks at all
also exits 1, with `valid: false` and the diagnostic in `errors` under `--json`,
or the diagnostic on stderr without it; invalid usage exits 2.

## Checks that write

The script protocol requires checks to leave project content unchanged, and
`check` cannot stop a trusted script from writing. Its guarantee is bounded by
what a run observes during its check interval. Before the prerequisite probes,
and after the probes and each check, it makes that observation:

- tracked and non-ignored untracked content, the declarations' named targets,
  their ancestors and explicit directory trees, and the ignore inputs and
  observation settings, as described under
  [observed adoption scope](script-protocol.md#observed-adoption-scope), with
  the same limits;
- the inventory of the durable product state and retained inputs, other than
  the ignored `local`, `cache` and `runtime/node_modules` directories;
- the commit HEAD resolves to;
- the index's staged entries and the paths it marks skip-worktree or
  assume-unchanged.

Any difference from the first observation stops `check` with `CHECK_MUTATION`,
naming the probe or check and each changed path in the message and in
`details.paths`. Changes to HEAD and the index are named `@git/HEAD` and
`@git/index`, and changes to ignore inputs and settings are named as in a run.

`check` fails closed when the observation cannot be made. An observation after
a probe or check that cannot be made, or finds the project unsafe, is a change
that probe or check made. Examples are an unreadable index, a target replaced
by a symbolic link, nested Git metadata, or unsafe product state. It stops
`check` with `CHECK_MUTATION`: `details.cause` holds the underlying failure's
code, when it has one, such as `PROJECT_READ` or `EACCES`, and its message, and
`details.paths` holds the paths a product diagnostic names, `@git/index` for an
unreadable index. The same failure in the first observation, before any probe
or check, fails `check` with that diagnostic itself.

No later check runs after a change, and the changes are preserved for review:
`check` restores nothing. Changes outside that observation are not detected.

A probe or check that leaves its process group running stops `check` with
`AUTHOR_PROCESS_ACTIVE`, or `PROCESS_STATE` when that cannot be established.
`check` does not stop or record the group; stop it before running any command
again.

`check` itself writes only two things: its output logs, under the ignored
`.repo-standards/local/checks/`, and, while it runs, a worker registration in
Git's directory. Its logs replace the previous invocation's. It keeps a check's
logs after observing the project. When the check changed the project, it
still keeps them where it can. It never changes committed content, HEAD or the
index.

## Failures before any check runs

`check` fails with the diagnostics other commands use:

- `CLI_PIN_MISMATCH` under a CLI other than the pinned one, as for
  [`status`](adoption.md#fresh-checkout-and-source-disappearance), before
  reading any record. Only the pin is read for it.
- `GIT_VERSION_UNSUPPORTED` under Git older than 2.32, as for
  [`inspect`](inspection.md), after the pin and before reading records or
  observing the project, so Git never follows a symbolic `.gitignore` whose
  referent the observation does not bind. Before it, Git only locates the
  project root and the run record.
- `RETIRED_FORMAT` or `NEWER_FORMAT` for product records in another format.
- `ACTIVE_RUN` while an adoption run is active or incomplete, or another
  adoption command is executing. Complete or abandon the run first.
- `NO_SELECTION` when no complete adoption is recorded.
- `STATE_INTEGRITY` when the committed product state or retained inputs do not
  match the integrity lock.

Any other failure, such as a filesystem error while registering in Git's
directory, is reported as `CHECK_FAILED` with its message: under `--json` as a
`valid: false` diagnostic, and otherwise on stderr.
