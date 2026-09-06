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

The product uses TypeScript, ESM, Node.js 24, and pnpm. Use the versions in
`.node-version` and `package.json`, then run `pnpm install --frozen-lockfile`.
Run `pnpm validate` before considering implementation complete: it typechecks,
builds, packs and installs the npm package into a temporary directory, and tests
the installed public CLI against temporary Git repositories. Package installation
requires npm registry access or cached dependencies. CI runs the same command
on macOS and Linux.

During development, run `pnpm typecheck` and `pnpm build`, then a focused test
with `node --test --test-name-pattern='description' test/source-validation.test.ts`.
Tests install the current `dist/` output; rebuild after changing product code.
The public author contract is documented in `docs/author-format.md`.

The release is complete only when every acceptance criterion in the parent
specification passes, including the published installation and real-agent
journeys.
