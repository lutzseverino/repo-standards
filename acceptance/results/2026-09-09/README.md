# Issue #11 — release preparation and remaining acceptance

**Later continuation:** [2026-09-10 CLI updates and live-source status](../2026-09-10/README.md).
The four CLI updates and both live-source adoptions are now complete. Public
standards-update live exercises remain unverified and have been waived by the
maintainer as release blockers; the snapshot below predates that decision.

**Status at this snapshot: 1.0.0 and 1.0.1 are published; release acceptance remains incomplete.**
See the [publication continuation](continuation.md) for that day's operational
results. Public Linux installation passed for 1.0.0; public macOS installation
passed for 1.0.1. The repeated Linux 1.0.1 smoke reached GitHub's rate limit.
All [four public-package/fixture-source agent adoptions](public-agent/README.md)
completed, with unchanged HEAD/index and employer content. Their subsequent
normal commits, fresh-clone restoration with scripts disabled, and retained
inspection with source acquisition unavailable passed. Candidate CLI updates
await their separate confirmations; live direct adoption and the actual
published standards update remain outstanding.

The [full local 1.0.1 validation](validate-1.0.1-macos.log) passed 327 tests with
one skip and no failures. [CI at the 1.0.1 release commit](https://github.com/lutzseverino/repo-standards/actions/runs/34387780185)
also passed on macOS and Linux. No additional public repository will be created.

The sections below retain the **earlier preparation snapshot**. Authentication
and publication blockers in that snapshot have been resolved as described in
the continuation; they are not current blockers.
Parent #1 remains open and unchanged. The release implementation is committed on
the requested current branch, `main`, beginning at `ed101d4`.

## Prepared distribution

The release workflow validates on macOS/Linux, packages once, publishes the
exact tarball through authorized npm credentials, uploads the matching
standalone bootstrap and metadata to GitHub, and records public installation
checks on both OSes. The public checks compare GitHub assets with npm integrity,
validate both packaged author examples, discover the designated learning source,
and inspect with explicit/omitted bootstrap versions while preserving the project.
Manual public-agent preparation performs actual npm acquisition and creates a
disposable committed project without starting adoption or writing assessment.

The local candidate is `@lutzseverino/repo-standards@1.0.0`.
[Bundle identity](release-bundle.json) records npm integrity and SHA-256 hashes
for the package and standalone bootstrap. The generated `release/` directory
contains those artifacts, `release.json` and `SHA256SUMS`; it is ignored by Git.
[Publish dry-run](publish-dry-run.log) passed with 64 packaged files, including
the CLI, bootstrap, matching reserved skill, protocol docs and author examples.
The dry-run explicitly warned that npm authentication was missing; its final
`+` line does **not** mean publication happened or publishing access was verified.

## Validation

Development toolchain: Node.js 24.11.1, pnpm 11.20.0, npm 11.6.2.

| Run | Result | Evidence |
| --- | --- | --- |
| macOS 26.3 arm64, `pnpm validate`, initial release candidate | 326 passed, 1 skipped, 0 failed | [Full log](macos-validation.log) |
| Debian trixie Linux arm64 container, `pnpm validate`, initial release candidate | 326 passed, 1 skipped, 0 failed | [Full log](linux-validation.log) |
| Linux as unprivileged `node`, typecheck/build and focused release/bootstrap/permission/update tests after review | 9 passed, 0 skipped, 0 failed | [Focused log](linux-focused.log) |
| Final macOS release tests: repeatable artifacts and later package version | 2 passed, 0 failed | [Release log](release-final.log) |
| Broader simulated-version run before the final assertion correction | 325 passed, 1 skipped, 2 failed (the two fixed-version assertions described below) | [Historical failing log](next-version-before-corrections.log) |
| Final corrected standards/CLI update tests using simulated package 1.99.42 and candidate 1.100.0 | 2 passed, 0 failed | [Correction log](next-version-corrections.log) |

The initial full-suite snapshots precede the review corrections. macOS skips
the case-sensitive path collision test; Linux passes that test. The initial
Linux run used root and skipped unreadable-file coverage; the later unprivileged
Linux run passes that case. Linux used image `node:24.11.1-trixie`, digest
`sha256:a3ba81ab11bf66a1122b70a9c270257c439e6ad0d28940ad177d3e14d5efa9a5`,
through Colima. It is container runtime validation, not a native Linux desktop
agent integration.

The later-version regression first failed because test setup installed a
hard-coded `1.0.0` tarball. Packing/installation now follows the actual package
version; ordinary runtime assertions and simulated CLI update candidates follow
that pin. A broader run with simulated version `1.99.42` exposed two additional
tests with old version literals. Those assertions were corrected and both
affected tests passed against `1.99.42`/`1.100.0`, including runtime restoration
and matching skill checks. Deliberate bootstrap `1.0.0`/`1.1.0` fixture versions
remain explicit. Simulated versions are deterministic tests, not npm releases.

## Final review

Both reviewer agents used GPT 5.6 Terra with high reasoning, as requested.

### Standards

No remaining hard standard violations or concrete correctness findings after
follow-up review. The malformed preparation-version check was aligned, duplicate
bootstrap installation instructions were consolidated, and public acquisition
now isolates npm user/global configuration. Self-contained scripts intentionally
retain their small version checks without requiring development dependencies.

### Spec

No remaining code findings after correcting later-version test setup and every
remaining fixed runtime/skill/selection assertion. No scope creep found.
Public release and real-agent acceptance remain outstanding operational work.

Final code findings: Standards 0; Spec 0. Outstanding release acceptance: public
publication and the resulting both-OS real-agent/update journeys.

## Historical operational blockers and next actions

- `npm whoami --registry=https://registry.npmjs.org` returned `ENEEDAUTH`.
  The maintainer was asked to authenticate locally; no credentials were sent
  through chat. The GitHub `npm` environment was also absent when inspected.
  Configure publication access using [the release procedure](../../../docs/release.md).
- The [actual public npm attempt](public-installation-macos.json) returned
  `E404` for version `1.0.0`, with `passed: false`. It did not reach GitHub asset
  downloads, discovery, inspection or adoption. There is no public Linux result
  to claim while the package is unavailable.
- The existing designated public Mira learning source is
  `lutzseverino/repo-standards-example`, tag `v1.0.0`, profile `service`.
  Authorization to create `lutzseverino/repo-standards-alice-example` from the
  synthetic Alice fixture was requested and remains pending. No new source was
  created, and no personal standards were migrated.
- After publication and public-source setup, run public installation on both
  systems and perform each real-agent journey through its matching installed
  skill. Present the actual inspections for confirmation before adoption.
  Record useful contextual work, full outputs, unchanged HEAD/index, normal
  project commits, fresh-checkout restoration, retained-source use without
  source access, and independent updates using actual published standards and
  CLI versions. These journeys have not been performed for this release.

The [coverage map](../../release-coverage.md) identifies the owning behavior
tests for every parent criterion. Earlier fixture-based agent evidence remains
historical and is not relabeled as public-registry acceptance.
