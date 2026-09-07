# Issue #10 — live source publication and discovery

The user designated `lutzseverino/repo-standards-example` and authorized creation
from the synthetic Mira example, publication of `v1.0.0`, and the
`repo-standards` topic. This is a working learning example, not a migration of
the maintainer's personal standards. The independently committed source includes
the Mira material, an explanatory README, and the product's MIT license.

- Public source: [repo-standards-example](https://github.com/lutzseverino/repo-standards-example).
- Stable release: [v1.0.0](https://github.com/lutzseverino/repo-standards-example/releases/tag/v1.0.0).
- Validated and published commit: `98b53f2087a4fe8a028ac60108a9545b7b9ea289`.
- [Recorded commands, reports, package hash and preservation evidence](source-publication.json).

On macOS with Node.js 24.11.1, the independently packed and installed public CLI
validated every profile of the committed local source. The same commit was
pushed, given an annotated stable tag and published as a non-draft,
non-prerelease GitHub release. The topic was added through the GitHub CLI using
the authorized account. Source search then reached the real unauthenticated
GitHub API and returned that exact repository, release and commit, its description,
CLI compatibility and available `service` profile. No remote fixtures or network
interception were used. Five unrelated topic matches were explicitly rejected
for having no stable release; they were not presented as valid selections.

The installed CLI then inspected the known URL, version and profile directly.
The report identifies the same source commit and includes `LICENSE` in the
inputs to retain. Recursive snapshots verified every file's bytes and mode,
including Git state, remained unchanged, and HEAD was unchanged. This journey
performed publication, discovery and read-only inspection; it did not confirm or
start adoption. Script execution and contextual usefulness have separate
[real-agent evidence](README.md).

CLI package `1.0.0` was installed from a freshly packed tarball outside the
product checkout using `npm install --ignore-scripts`. The record includes its
SHA-256. This proves live GitHub publication/discovery with the distributable
CLI; public npm-registry delivery remains issue #11.

Deterministic installed-CLI coverage in `test/search.test.ts` uses remote GitHub
fixtures and covers stable release pagination, candidate validation/rejections,
search pagination and incomplete results, failure diagnostics, no author code
or probe execution, project preservation, and direct inspection despite a
discovery outage. Full validation results are recorded after final review.
