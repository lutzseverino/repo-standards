# Contributing

GitHub Issues hold the product specification and implementation tickets.
Implement tickets after their blockers are complete. The `ready-for-agent`
label means that requirements are settled; it does not start implementation.

Read the full assigned issue, its parent specification, and relevant
[architecture contracts](docs/architecture.md). Use the terminology in
`CONTEXT.md`. Propose a contract change explicitly if implementation reveals a
contradiction.

Create a focused branch from `main` for each implementation ticket. Include
observable acceptance tests with the behavior they validate. Link the applicable
issue in the pull request and report validation results and remaining limits.

The product uses TypeScript, ESM, Node.js 24, and pnpm. The first implementation
ticket establishes the package manifest, pinned build tooling, and aggregate
validation command. Until that ticket lands, this is a documentation baseline
with no executable product validation. Afterwards, use the declared pnpm
validation command before considering implementation complete.

The release is complete only when every acceptance criterion in the parent
specification passes, including the published installation and real-agent
journeys.
