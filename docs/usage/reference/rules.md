# Installed rules

A declaration's rules state what it requires of the files it covers, for as
long as the project stays adopted. The rules of a repository-wide declaration
cover the whole repository, so they govern any work in the project, including
work that changes no file, such as triaging an issue or writing a ticket. A
standards source names them with a declaration's `rules` field; see
[rules and adoption guidance](author-format.md#rules-and-adoption-guidance).
Its adoption guidance holds the run's one-time steps and is kept only with the
retained inputs.

Adoption installs the model-invocable `repository-standards` system skill for
agents. At the start of any work, including work that changes no file, it
runs the pinned CLI's `rules` with no path and follows the printed
repository-wide rules. Before changing a file it runs `rules <path>` and
follows the printed rules, including repository-wide rules. The skill also
reports [available updates](available-updates.md); it states no requirements
of its own. Standards sources need no pointer to the rules in their agent
guidance.

## What adoption installs

Adoption installs the rules of every active declaration at
`.repo-standards/rules/<declaration ID>.md`, byte for byte as the source
supplies them. They are exact content the CLI owns: the lock records them, the
completion verifies them, and an edit to one fails the next command that reads
the recorded adoption with `STATE_INTEGRITY`. Adopt again to change them. An
update replaces the whole directory, so a declaration that leaves the selection
takes its rules with it, and a selection without rules has no directory.

The CLI also writes `.repo-standards/rules/README.md`, an index for people
browsing the project. It names the selection the rules come from and lists each
rules file with its declaration and what it covers:

- an exact or contextual file declaration covers its target;
- repository guidance with explicit targets covers each target path and each
  directory tree;
- a discovered declaration covers its confirmed scope;
- a declaration that covers no path, such as a discovered declaration whose
  confirmed scope is empty, is repository-wide and covers the whole
  repository;
- an [optional](author-format.md#optional-discovery) declaration confirmed
  with [no scope](inspection.md#no-scope) has no installed rules: the index
  does not list it, and `rules` never prints it, with or without a path. An
  update that moves it into a scope installs its rules, and one that moves it
  out removes them and their index entry.

Rules are installed during the run's exact installation, before its fixes, so
an agent doing contextual work reads them in place. Contextual work is assessed
against them: when an update changes a contextual declaration's rules, it is a
contextual update and that declaration is assessed again.

## Look up the rules for a path

```text
repo-standards rules [<path>] [--project <directory>] [--json]
```

`rules` prints the installed rules covering `<path>`, followed in declaration
ID order by the rules of every repository-wide declaration. The path is named
from the current directory, need not exist yet, and must lie inside the
project; a path outside it is a usage error. A path is covered when it equals a
covered path or lies inside a covered directory tree.

The command reads only the last complete adoption, which it verifies against
the lock as `status` does, and makes no network call. It needs the
[pinned CLI](adoption-run.md#fresh-checkout-and-source-disappearance). Without a complete adoption
it fails with `NO_SELECTION`, and during an active or incomplete run with
`ACTIVE_RUN`. During contextual work in such a run, the skill reads the
installed index and its covering rules directly, including repository-wide
rules; the contextual work request also names the declaration's rules. These
are the candidate selection's rules, installed before contextual work, rather
than the previous complete adoption's rules.

The text output starts with `Rules covering <path>:`, then gives each
declaration a heading naming its ID, its installed rules file, and whether it
covers the path or the whole repository, followed by the rules as installed.
When nothing covers the path it prints `No installed rules cover <path>.` and
exits `0`. A path that resolves to the project root is shown as `.` in both,
as in `Rules covering .:`; its JSON `path` is `""`, unlike the `null` of a
lookup with no path.

With no path, `rules` prints only the rules of the repository-wide
declarations, in declaration ID order. The text output starts with
`Repository-wide rules:` and gives each declaration the same heading, naming
the whole repository. When no declaration is repository-wide, including a
selection without rules, it prints `No repository-wide rules are installed.`
and exits `0`. It reads and verifies the recorded adoption exactly as the
path lookup does and fails the same way: `NO_SELECTION`, `ACTIVE_RUN`, the
pinned CLI error, and `STATE_INTEGRITY` for an edited rules file. `rules
<path>` still appends the repository-wide rules.

With `--json`, stdout is one `repo-standards/rules/v1` object:

| Field   | Value                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `path`  | The project-relative path looked up, or `null` with no path.                                                                                                             |
| `rules` | Each covering declaration in ID order: its `declaration` ID, its `coverage` (`path`, `directory`, or `repository`), the installed rules `path`, and the rules `content`. |

Errors use the same envelope and exit codes as [`check`](check.md#report).

## Failed checks cite the rules

A failed check names its declaration's installed rules, so the agent fixing the
failure reads the requirement it enforces. The [`check`](check.md#report)
report gives the rules path of each result that did not pass, and an adoption
run that stops with `CHECKS_FAILED` names each failed check with its rules in
its reason.
