# Contextual-scope 1.2.1 patch evidence

This directory records publication and a focused scripted regression for the
`@lutzseverino/repo-standards@1.2.1` patch. The release contains the amendment
history retention fix merged in PR #62 and the shared scope validation cleanup
merged in PR #63. It was built from reviewed `main` commit
`67a88db1c81ebcb99561b2583bee353ecc516057`.

## Publication

Release workflow
[`34821044604`](https://github.com/lutzseverino/repo-standards/actions/runs/34821044604)
passed the complete repository validation on Linux (538/538) and macOS
(537/538, with the case-sensitive filesystem case skipped), published the npm
package, and created GitHub release
[`v1.2.1`](https://github.com/lutzseverino/repo-standards/releases/tag/v1.2.1).
Its publish job and Ubuntu public installation passed. The macOS public check
downloaded the release bundle and bootstrap, then exhausted the shared runner's
anonymous GitHub API quota during source and author-skill acquisition. The
retained response reports HTTP 403, zero remaining core requests, and reset
`2026-09-14T08:36:12Z`.

The release-status helper inspected the original validated bundle after that
failure and reported `published`: npm integrity, tag, commit, release, and all
four assets matched. Verification-only workflow
[`34823592703`](https://github.com/lutzseverino/repo-standards/actions/runs/34823592703)
passed Ubuntu and publisher authentication, but its first two macOS attempts
again reached shared anonymous API limits. The second attempt started with only
45 of 60 core requests available and reported reset `2026-09-14T09:09:46Z`.
After that deadline, attempt 3 retried only the failed job on 14 September at
11:11 UTC. It started with 49 of 60 core requests available and exhausted the
quota during public source acquisition, then author-skill acquisition. Its
recorded reset is `2026-09-14T11:55:44Z`.

Attempt 4 retried only that failed job after the reset. On GitHub-hosted macOS
26 Intel (`darwin` 25.6.0, `x64`, Node.js 24.11.1), the unchanged public
installation and standalone author-skill acquisition checks both passed against
release commit `67a88db1c81ebcb99561b2583bee353ecc516057`. The advisory quota
observation began with 54 of 60 core requests available; anonymous acquisition
and every assertion remained enabled. This is hosted macOS scripted
verification, not a new local or real-agent evaluation. Together with the
passing Ubuntu evidence, it completes the outstanding public platform
verification for #41 without republishing.

- `release/publication.json` records the release, workflow, registry, commit,
  and asset identities.
- `release/status.json` records the release-status recovery result.
- `release/bundle/` retains the original release metadata, checksum manifest,
  and standalone bootstrap. The npm tarball remains a GitHub release asset
  rather than a committed binary. The complete downloaded bundle passed its
  checksum manifest; the tarball SHA-512 matched both `release.json` and the
  public npm registry integrity. A fresh read-only status check at 11:12 UTC
  reconfirmed those publication identities (`release/status-final-check.json`).
- `release/initial/` preserves the first run's passing Ubuntu evidence and
  macOS quota failure.
- `release/verification-attempt-1/` through `release/verification-attempt-4/`
  preserve every verification-only result, including the earlier quota
  failures. `release/verification.json` maps the attempts to their workflow and
  artifact identities; passing Ubuntu evidence is retained from attempt 1 and
  passing macOS evidence from attempt 4. No verification-only attempt
  republishes bytes.

The earlier failed workflow
[`34801934043`](https://github.com/lutzseverino/repo-standards/actions/runs/34801934043)
was a verification-only 1.2.0 run from the then-unmerged feature branch. It did
not attempt a 1.2.1 publish. Its Ubuntu public installation passed; its macOS
public and author acquisitions exhausted anonymous API quota, while its old
branch-only contextual update script separately stopped during a public 1.1.0
start. The 1.2.1 release was therefore dispatched once from integrated `main`,
after checking that neither its npm version nor tag existed.

## Published CLI regression

`run.mjs` installed the exact public npm package into an isolated temporary
prefix with scripts disabled and matched the package-lock integrity to the
public registry. It drove that executable through a deterministic GitHub HTTPS
source fixture and a real temporary Git project:

1. Run 1 confirmed `apps/old/README.md`, started adoption, explicitly amended
   scope to add `apps/amended/README.md`, and completed with `scopeRevision: 1`
   and one retained amendment.
2. After a normal project commit and repository growth, Run 2 deliberately
   re-adopted the same standards and CLI pins while the source was unavailable.
   Its newly confirmed scope added `apps/new/README.md` and removed both prior
   paths from current scope without deleting their content.
3. After Run 2 completed, state history, retained inspection, and status all
   preserved Run 1's scope revision and complete amendment record.
4. A fresh clone made after Run 2 independently returned the same historical
   amendment evidence while the source remained unavailable.

`summary.json` records every asserted outcome and command exit. The complete
CLI reports, assessments, scope proposals, pre/post state, and selected evidence
hashes remain beside it. Exit 1 for the initial `start` and amendment/re-adoption
`start` calls is the documented contextual handoff, followed by exit 0 after
assessment completion.

## Evidence boundary

This is scripted public-package/fixture-source regression evidence. The source
fixture replaces GitHub HTTPS responses but does not replace npm acquisition,
CLI execution, Git state, adoption, amendment, re-adoption, or fresh-clone
retention. It tests the narrow 1.2.1 regression and does not claim a new agent
evaluation or live public standards-source journey.

The broad 1.2.0 public and real-agent acceptance remains in
[`../contextual-scope-release/`](../contextual-scope-release/README.md). Those
records cover Orchard, Forge, Wayfinder, live public sources, semantic
usefulness, migration, interruption recovery, public updates, and the full #41
acceptance map. This patch evidence supplements that dated release record; it
does not relabel or repeat those journeys.
