# Run the adopted checks

An adopted standards source ships checks: scripts that verify the repository
still meets its rules. Adoption runs them once; `check` runs them again
whenever you want, for example on finished work before you deliver it.

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards check
```

`check` runs every check of the last complete adoption against the current
working tree, uncommitted work included, and reports each result. It runs no
fix, asks for no confirmation, and needs no network: it reads only the
committed adoption state. It records nothing, so a passing `check` neither
changes the adoption's evidence nor claims continuing compliance.
`--project <directory>` selects another Git working tree.

## Read the result

The summary names the selection and counts each status, then gives one line
per check: its status, `passed`, `failed` or `blocked`, its declaration, ID
and message. A check that did not pass also names its declaration's installed
rules and the paths of its output logs, under the ignored
`.repo-standards/local/checks/`. Every check runs, whatever the earlier ones
returned, so one invocation reports them all.

`check` exits 0 when every check passed and 1 when any did not, or when the
checks could not run at all; invalid usage exits 2. `--json` prints the
[`repo-standards/check/v2` report](../reference/check.md#report) for scripts.

## Fix a failure

Read the rules the failure names. They state what the check enforces, and
`rules <path>` prints the rules covering any file:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards rules README.md
```

Fix the files, then run `check` again. When `check` cannot run at all, its
diagnostic says why:

- `PREREQUISITES_BLOCKED`: an executable a check needs is missing or the wrong
  version; install it and run again.
- `CLI_PIN_MISMATCH`: the CLI is not the pinned one; restore the runtime with
  `npm ci --ignore-scripts --prefix .repo-standards/runtime`.
- `ACTIVE_RUN`: an adoption run is still open; finish or abandon it first.

Checks must leave the project unchanged. When a check or its prerequisite
probe changes it anyway, `check` stops with `CHECK_MUTATION`, naming each
changed path. No later check runs, and the changes stay in place for review.

See the [check reference](../reference/check.md) for the full report and
failure contract, and [installed rules](../reference/rules.md) for the
`rules` lookup.
