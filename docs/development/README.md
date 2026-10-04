# Development

This directory explains how to set up, validate, release, and maintain the
Repository Standards product.

## Setup and validation

Use TypeScript, ESM, Node.js 24 and pnpm at the versions in `.node-version` and
`package.json`, with npm and Git 2.32 or newer on `PATH`. Run `pnpm install --frozen-lockfile`; npm registry access or
cached dependencies are required.

During development, run `pnpm typecheck`, `pnpm lint` and `pnpm build`, then
focused tests covering the changed behavior, such as
`node --test --test-name-pattern='description' test/source-validation.test.ts`.
`pnpm lint` runs oxlint with type-aware rules, configured in `.oxlintrc.json`;
any finding, warning or error, fails it. Run `pnpm lint path ...` to lint
particular files, or `pnpm lint --fix` to apply its safe fixes.
Include observable acceptance tests with the behavior they validate. Tests
install current `dist/` output; rebuild after changing product code.

### Continuous integration

Each PR runs three parallel Linux test parts using Node's `--test-shard` and
`--test-concurrency=6` over the same files as `pnpm test`, with every file in
exactly one part. The required
checks are `validate (linux, 1/3)`, `validate (linux, 2/3)` and
`validate (linux, 3/3)`. Each part runs typechecking, linting, rejecting any
runtime cycle of static imports among the source modules (type-only imports
are exempt), and building before testing. Tests pack and install the npm
package into temporary directories, then exercise the installed public CLI
against temporary Git repositories. PR branches trigger Validate only through
`pull_request`; pushes trigger it only on `main`.

macOS runs the full `pnpm validate` after merge on pushes to `main` and in the
release workflow. A macOS failure on `main` is a bug: open an issue and fix it
in a new PR. Merges continue; the release workflow blocks publication until
macOS passes.

`pnpm validate` remains the unchanged full local run. Passing all three Linux
parts replaces a local full-suite run, so open the PR once focused checks pass.
Run additional local tests to diagnose failures when needed.

## Documents

- [Architecture contracts](architecture.md): the product's purpose and release
  boundary, module responsibilities, formats, commands, adoption and update
  behavior, acceptance criteria, exclusions, and the mechanisms removed in
  2.0.0, 4.0.0, and 5.0.0.
- [Release procedure](release.md): package contents, trusted publishing,
  release notes, recovery of a publication, and published and real-agent
  acceptance.
