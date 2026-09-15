# Development

Build, test, and maintain the Repository Standards product. The
[architecture contracts](../architecture.md) define product behavior; the
[release procedure](../release.md) covers packaging and publication.

## Setup and validation

Use TypeScript, ESM, Node.js 24 and pnpm at the versions in `.node-version` and
`package.json`. Run `pnpm install --frozen-lockfile`; npm registry access or
cached dependencies are required.

During development, run `pnpm typecheck` and `pnpm build`, then focused tests
covering the changed behavior, such as
`node --test --test-name-pattern='description' test/source-validation.test.ts`.
Include observable acceptance tests with the behavior they validate. Tests
install current `dist/` output; rebuild after changing product code.

## Review and integration

Once implementation and focused checks are ready, open the PR so automatic
Codex review and CI run alongside independent Standards and Spec reviews.
Do not wait for those reviews or a full local test run before opening the PR.

CI runs `pnpm validate` on macOS and Linux: typechecking, building, packing,
and installing the npm package into temporary directories, then testing the
installed public CLI against temporary Git repositories. Passing full CI
satisfies the full-suite requirement; duplicating it locally is optional.
Run additional local tests to diagnose failures when needed.

Before merging, complete independent reviews, resolve actionable findings,
obtain a positive Codex review, and require green macOS and Linux validation
for the final changes. Reassess review coverage after changes and request a
Codex rereview when their scope warrants it. Link the applicable issue and
report actual validation results and remaining limits in the PR.
