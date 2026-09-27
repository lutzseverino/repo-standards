# Development

This directory explains how to set up, validate, review, release, and maintain
the Repository Standards product.

## Setup and validation

Use TypeScript, ESM, Node.js 24 and pnpm at the versions in `.node-version` and
`package.json`. Run `pnpm install --frozen-lockfile`; npm registry access or
cached dependencies are required.

During development, run `pnpm typecheck` and `pnpm build`, then focused tests
covering the changed behavior, such as
`node --test --test-name-pattern='description' test/source-validation.test.ts`.
Include observable acceptance tests with the behavior they validate. Tests
install current `dist/` output; rebuild after changing product code.

### Review and integration

Once implementation and focused checks are ready, open the PR so CI and the
independent reviews run alongside each other. Do not wait for the reviews or a
full local test run before opening the PR.

CI runs `pnpm validate` on macOS and Linux for every PR: typechecking,
rejecting any runtime cycle of static imports among the source modules
(type-only imports are exempt), building, packing, and installing the npm
package into temporary directories, then testing the installed public CLI
against temporary Git repositories.
Passing full CI satisfies the full-suite requirement; duplicating it locally is
optional. Run additional local tests to diagnose failures when needed.

#### Review tiers

Review depth follows the kind of change. A PR that mixes kinds, or whose kind
is unclear, takes the tier for product code and behavior. Every tier requires
the same checks; the tiers differ only in review depth.

| Change kind | Reviews | Checks |
| --- | --- | --- |
| Documentation-only | One independent review | Required CI checks, including macOS and Linux validation, green on the final commit |
| Exact update of this repository's own adoption | One independent review | Required CI checks, including macOS and Linux validation, green on the final commit |
| Product code and behavior | Independent Standards and Spec reviews | Required CI checks, including macOS and Linux validation, green on the final commit |

- **Documentation-only** changes touch only documentation: guides, ADRs, the
  glossary, and READMEs. They change no source, tests, scripts, workflows,
  packaging, examples, or system skills.
- An **exact update** of this repository's own adoption is one whose inspection
  reports the update class `exact`; its diff holds only managed exact content,
  installed skills, and the committed adoption files under `.repo-standards/`:
  the selection, lock, durable state, retained inputs, and, when the CLI pin
  changes, the runtime manifests.
- **Product code and behavior** covers everything else, including tests,
  scripts, workflows, packaging, examples, system skills, and contextual
  updates of this repository's own adoption.

A single independent review reads the whole diff against its linked issue, or
against its stated purpose for a small correction. For an exact update it also
confirms the inspection's update class and that the diff holds nothing else.

Before merging, complete the tier's reviews, resolve actionable findings or
state why each is rejected, and require the tier's checks for the final
changes. When follow-up commits materially change reviewed content, review them
again at the same tier. An automated review configured on the repository may
run alongside; handle its actionable findings like other review findings, but
it is not a merge condition. Link the applicable issue and report actual
validation results and remaining limits in the PR.

## Documents

- [Architecture contracts](architecture.md): the product's purpose and release
  boundary, module responsibilities, formats, commands, adoption and update
  behavior, acceptance criteria, exclusions, and the mechanisms removed in 2.0.0.
- [Release procedure](release.md): package contents, trusted publishing,
  release notes, recovery of a publication, and published and real-agent
  acceptance.
