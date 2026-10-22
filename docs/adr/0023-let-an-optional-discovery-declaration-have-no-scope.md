# Let an optional discovery declaration have no scope

An empty confirmed scope makes a discovery declaration repository-wide
([ADR 0020](0020-read-repository-wide-rules-at-the-start-of-work.md)): its
rules cover every path and its checks and fixes run. A standards source can
also declare something an adopting project may not have at all, which an
empty scope would then govern everywhere. As decided in
[#325](https://github.com/lutzseverino/repo-standards/issues/325), an author
marks such a discovery declaration `optional: true`, and its scope proposal
entry may then carry `noScope: true`. A confirmed no scope keeps the
declaration and its adoption guidance for its assessment and nothing else: no
rules are installed or printed, and none of its checks or fixes run. Both scope
reviews still judge it, so the decision that nothing in the project belongs in
its scope is justified like any other scope. Without the marker, every
declaration keeps today's meaning, an empty scope included.

## Consequences

Materialization removes the declaration's `rules`, checks and fixes and marks
it `"no-scope": true` with empty targets. Rules installation, rules lookup,
execution, `check` and remote setup read only the resolved declaration, so none
of them needs its own no-scope case. The update comparison compares a no-scope
declaration as resolved and counts no scope as a scope that differs from an
empty one. The retained proposal keeps `noScope`, so an update can carry the
decision forward, and moving into or out of a scope is an ordinary contextual
update: rules installation adds the rules file or removes it with its index
entry, and project content is left in place.

No format version rises. `repo-standards/scope/v2` gains the optional `noScope`
key under the [input-format versioning rule](../development/architecture.md#format-versions),
as `repo-standards/operation/v2` gained optional `invocation`. Existing proposals
remain valid with the same meaning. A proposal is input the running CLI reads,
and an earlier CLI rejects the key as an unknown field instead of misreading
it; operation input travels in the other direction, from the CLI to author
scripts. Raising the scope format would break every existing discovery script,
which prints `repo-standards/scope/v2`. Records and reports hold the marker as
embedded proposal or declaration content under their existing keys, and `adopt`
names it in question `details`. A selection without an optional declaration
with no scope writes the same records and reports as before.

## Considered options

- **Treat an empty scope as no scope.** Existing sources rely on an empty
  scope being repository-wide, so its meaning cannot change.
- **Drop the declaration from the resolved selection.** It would then get no
  assessment, and an update would report it retired or added.
- **Keep its rules and operations, and skip them in each reader.** Every reader
  of the resolved selection would need the same exception.
