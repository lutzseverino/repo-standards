# Repository Standards project guidance

Before designing or implementing product behavior, read the root `CONTEXT.md`,
the [architecture contracts](../development/architecture.md), the full assigned GitHub
issue, its parent specification, and blockers. Keep product behavior scoped to
the agreed contract; report contradictions and propose contract changes
explicitly. The public author contract is [the author format](../usage/author-format.md).

Create a focused branch from `main` for each implementation ticket. Follow
[development and validation](../development/README.md), including the PR timing
and the [review tier](../development/README.md#review-tiers) for the change
kind: its independent reviews and required checks.
The release is complete only when every acceptance criterion in its parent
specification passes, including published installation and real-agent journeys,
recorded as [the acceptance guide](../../acceptance/README.md#acceptance-records)
describes.
