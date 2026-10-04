# Development

This directory explains how to set up, validate, release, and maintain the
Repository Standards product.

## Setup and validation

Use TypeScript, ESM, Node.js 24 and pnpm at the versions in `.node-version` and
`package.json`, with npm and Git 2.32 or newer on `PATH`. Run `pnpm install --frozen-lockfile`; npm registry access or
cached dependencies are required.

During development, run `pnpm typecheck` and `pnpm build`, then focused tests
covering the changed behavior, such as
`node --test --test-name-pattern='description' test/source-validation.test.ts`.
Include observable acceptance tests with the behavior they validate. Tests
install current `dist/` output; rebuild after changing product code.

### Continuous integration

CI runs `pnpm validate` on macOS and Linux for every PR: typechecking,
rejecting any runtime cycle of static imports among the source modules
(type-only imports are exempt), building, packing, and installing the npm
package into temporary directories, then testing the installed public CLI
against temporary Git repositories.
Both validation jobs are the required checks for merging, and passing them
replaces a local full-suite run, so open the PR once focused checks pass. Run
additional local tests to diagnose failures when needed.

## Documents

- [Architecture contracts](architecture.md): the product's purpose and release
  boundary, module responsibilities, formats, commands, adoption and update
  behavior, acceptance criteria, exclusions, and the mechanisms removed in
  2.0.0 and 4.0.0.
- [Release procedure](release.md): package contents, trusted publishing,
  release notes, recovery of a publication, and published and real-agent
  acceptance.
