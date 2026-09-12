# Resumed authoring 1.1.0 release — issue #31

The maintainer authorized release continuation on 2026-09-12. This record
preserves the resumed attempt separately from the unchanged
[original candidate evidence](../authoring-release/README.md). Public delivery
and fresh delivered-skill journeys remain blocked; this directory name describes
the intended acceptance phase, not a successful publication.

The [Release run](https://github.com/lutzseverino/repo-standards/actions/runs/34678342082)
at `305025e36e9f9f503135eed3dce33a7b51d373f4` passed `pnpm validate` on both
platforms: Linux passed 380 tests; macOS passed 379, with the existing
case-sensitive-filesystem test skipped. Neither platform reported failures.
[Workflow metadata](release-workflow.json) records the jobs and timestamps.

The publish job verified the bundle and successfully authenticated to npm as
`lutzseverino`. At 06:41:22 UTC, npm rejected publication with `EOTP`, requiring
a one-time password. GitHub release creation was not reached, and public
installation jobs were skipped. No authentication logs or credentials are
retained here. Successful identity verification does not establish the token's
publish permissions or 2FA compatibility; its private configuration and the
package's token policy have not been inspected.

At 06:46 UTC, unauthenticated public requests confirmed that npm 1.1.0 and the
GitHub v1.1.0 release both remained unavailable (HTTP 404). The exact observations
are in [publication-availability.json](publication-availability.json).

The original workflow bundle was downloaded and every entry in its
`SHA256SUMS` was verified locally. [release.json](release.json) and
[SHA256SUMS](SHA256SUMS) retain its identity; the tarball remains in the workflow's
`release-bundle` artifact. These metadata files do not claim public npm integrity.

The maintainer must check the package-scoped granular token's direct-publish
permission and 2FA bypass setting, and whether the package permits such tokens,
as documented in [the release procedure](../../../../docs/release.md).
Do not weaken a policy that disallows tokens or place an OTP in CI. After access
is corrected, first recheck npm and GitHub for any partial publication. If both
are still absent, rerun the failed jobs of run `34678342082` to publish the same
tested bundle at the same commit. If publication has occurred, recover using
the original artifacts instead of attempting to overwrite the npm version.

After publication, retain both platforms' public installation artifacts and
perform fresh creation, revision, resumption, and no-confirmed-standards agent
journeys using the delivered installed skill. Keep dated discovery observations
separate. No new public acquisition or agent usefulness evidence exists yet;
issue #31 and parent #25 remain open, and PR #37 remains unmerged.
