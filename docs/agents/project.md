# Repo Standards project guidance

Before designing or implementing product behavior, read the
[architecture contracts](../development/architecture.md). Keep product behavior
scoped to the agreed contract. The public author contract is
[the author format](../usage/reference/author-format.md).

Repo Canon supplies this repository's contribution and agent conventions as a
separate standards source that this repository adopts like any other project.
The product itself remains neutral for independently authored standards.

When shaping adoption work, minimize human intervention: let agents decide
what Git can undo, since adoption leaves changes uncommitted for review and
rollback. Preserve maintainer decisions for remote or host overwrites of
non-default values that Git cannot restore. Design failure states with recovery
paths that avoid manual abandonment and restart, within the existing adoption
contracts: [ADR 0021](../adr/0021-let-agents-decide-what-git-can-undo.md)
defines agent decisions and maintainer touchpoints, and
[ADR 0022](../adr/0022-replace-a-stopped-run-in-place.md) defines replacement-run
recovery and its blockers. Follow the [adoption architecture](../development/architecture.md)
for the detailed behavior.

Create a focused branch from `main` for each implementation ticket, and
validate it as [the development guide](../development/README.md) describes.
The release is complete only when every acceptance criterion in its parent
specification passes, including the evidence that specification names, such as
published installation and real-agent journeys, recorded with their pull
request, release, or workflow run and on the parent specification, as [the acceptance guide](https://github.com/lutzseverino/repo-standards/blob/main/acceptance/README.md#acceptance-records)
describes.
