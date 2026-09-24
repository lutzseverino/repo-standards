# Release 2.0.0 acceptance

This record covers the publication of `@lutzseverino/repo-standards@2.0.0`
on 23 September 2026, its verification-only published-installation acceptance
on 24 September 2026, and the acceptance of ticket #93 under specification #79.
It follows [Acceptance records](../../README.md#acceptance-records): identities
and tool summaries only. It commits no summary files because no adoption ran.

Outcomes:

- **Publication: passed.** npm, the `v2.0.0` tag, and the GitHub release match
  the validated bundle.
- **Published-installation acceptance: passed on macOS and Linux** on
  24 September 2026, in a verification-only run under ticket #110. The first
  attempt, in the release run, failed on both systems at discovery, which
  rejected the public learning source, `lutzseverino/repo-standards-example`.
  Its only releases then, v1.0.0 and v1.1.0, are `repo-standards/v1` sources
  that declare `>=1.0.0 <2.0.0`, and 2.0.0 removes that format by design. That
  source has since published `v2.0.0`, and the acceptance helper selects it.
- **Fresh self-adoption: not attempted.** The maintainer is holding it until
  Repo Canon publishes a release whose author range admits 2.0.0. This
  repository's product state and installed skills are unchanged.

## Runs

| Run | Performed by | Environment |
| --- | --- | --- |
| `Release` workflow run [35871105209](https://github.com/lutzseverino/repo-standards/actions/runs/35871105209), dispatched at `a8b89d4d00b3a4005dc912c90950ce755529bbf0` with `version=2.0.0` | GitHub-hosted runners | Validation on `ubuntu-latest` and `macos-latest`. Public acceptance on `ubuntu-latest` (Linux 6.17.0-1022-azure, x64) and `macos-26-intel` (Darwin 25.6.0, x64), Node.js 24.11.1 |
| Verification-only `Release` workflow run [35957812670](https://github.com/lutzseverino/repo-standards/actions/runs/35957812670), dispatched from branch `chore/110-acceptance-v2-example-source` (pull request #112) at `032fa4583d1b7b108165a73a4d8400aec7a69e1a` with `version=2.0.0` and `verify_published=true` | GitHub-hosted runners | Public acceptance on `ubuntu-latest` (Linux 6.17.0-1022-azure, x64) and `macos-26-intel` (Darwin 25.6.0, x64), Node.js 24.11.1, npm 11.6.2 |
| Read-only `outdated` and `inspect` with the published CLI | An implementation agent, from a local shell | Linux 7.0.0-31-generic x86_64, Node.js 24.21.0, npm 11.19.0, Git 2.53.0. The package was installed with `--ignore-scripts` into a directory outside any project |

## Publication

- Validation passed in the release run: Linux 557 of 557 tests, and macOS
  556 of 557 with one test skipped. The earlier `Validate` run
  [35868266558](https://github.com/lutzseverino/repo-standards/actions/runs/35868266558)
  for the same commit also passed on both systems.
- The `publish` job published the bundle's tarball through trusted
  publishing at 14:22 UTC, with SLSA provenance. It created the GitHub
  release [`v2.0.0`](https://github.com/lutzseverino/repo-standards/releases/tag/v2.0.0)
  with its four assets. npm `latest` is 2.0.0.
- The downloaded `release-bundle` passed its `SHA256SUMS` check. The registry
  `dist.integrity` equals the bundle's `release.json` integrity.
- `node scripts/release-status.ts 35871105209 <fresh directory>` reported state
  `published`: npm `matches`, tag `matches`, release `published`, and all four
  assets matched with none missing.

## Published-installation acceptance

### Verification run 35957812670: passed

Run 35957812670 re-ran the acceptance against the already published package
with the helper change from #110, which inspects the example source at
`v2.0.0` (commit `cb11dcb0a5cff267f33cd4a1a8e73e03a69ec3b9`) with the
`service` profile. Its `validate` and `publish` jobs were skipped, so nothing
was validated, packed, or published again. The `verify-publisher` job passed
the trusted-publisher OIDC exchange without publishing.

| Check | Linux | macOS |
| --- | --- | --- |
| Registry propagation wait | npm available at the first attempt, after 0.5 s; both release assets available by 1.0 s | npm available at the first attempt, after 1.2 s; both release assets available by 1.9 s |
| Public npm installation, version, lockfile and bundle integrity, bootstrap hash and bytes | passed | passed |
| Packaged Alice, Mira, and Atlas and checkout Wayfinder validation | passed | passed |
| Discovery of the public learning source | passed; the only candidate is `repo-standards-example` at `v2.0.0` | passed; the only candidate is `repo-standards-example` at `v2.0.0` |
| Read-only bootstrap inspection, explicit and omitted CLI version | passed; both `repo-standards/inspection/v4` reports select CLI 2.0.0 and share one identity, and the project is unchanged | passed; both `repo-standards/inspection/v4` reports select CLI 2.0.0 and share one identity, and the project is unchanged |
| Standalone authoring skill and matching CLI (`prepare-author.ts`) | passed | passed |

Every propagation subject was available at its first attempt, well inside the
300 s bound; the run started about 15 hours after publication. Each artifact's
`public-installation.json` records the attempts in `propagation`. Anonymous
GitHub API quota at job start was 37 of 60 on Linux and 60 of 60 on macOS.
Discovery still rejects other public candidates, including Repo Canon v0.2.0,
as the release run did; the acceptance requires only that the learning source
is discoverable.

### Release run 35871105209: failed

| Check | Linux | macOS |
| --- | --- | --- |
| Registry propagation wait | npm `E404` 7 times, available after 72.4 s; both release assets available by 72.8 s | npm `E404` 4 times, available after 45.3 s; both release assets available by 46.2 s |
| Public npm installation, version, lockfile and bundle integrity, bootstrap hash and bytes | passed | passed |
| Packaged Alice, Mira, and Atlas and checkout Wayfinder validation | passed | passed |
| Discovery of the public learning source | **failed** | **failed** |
| Read-only bootstrap inspection, explicit and omitted CLI version | not reached | not reached |
| Standalone authoring skill and matching CLI (`prepare-author.ts`) | passed | passed |

The wait from #80 ran live for the first time. It polls every 10 s within a
300 s bound, and it absorbed the lag that failed the 1.3.0 acceptance. Each
artifact's `public-installation.json` records every attempt in `propagation`.
Anonymous GitHub API quota at job start was 58 of 60 on Linux and 48 of 60
on macOS, so quota played no part in the failure.

The same failure reproduces locally. With the published 2.0.0,
`source search --json` rejects the example source's v1.1.0 release with
`INVALID_STANDARDS`, for two reasons. `INVALID_FORMAT` says "Expected
repo-standards/v2", and `INCOMPATIBLE_CLI` says "CLI 2.0.0 does not satisfy
>=1.0.0 <2.0.0". The acceptance helper also pinned that source's `v1.0.0` for its
bootstrap inspections. A verification-only retry cannot pass until the example
source publishes a v2 release with an open-ended range and the helper selects
it. Neither was published again, and publication needs no recovery. Both
conditions now hold, and the verification run above passed.

## Available updates

The published 2.0.0 ran `outdated --json` in a fresh clone of the released
commit, whose selection is the same as this branch's. The report has format
`repo-standards/outdated/v1`, and neither answer came from the cache:

| Pin | Pinned | Update | Newest | Newer stable releases |
| --- | --- | --- | --- | --- |
| CLI `@lutzseverino/repo-standards` | 1.2.2 | available | 2.0.0 | 2 |
| Standards `https://github.com/lutzseverino/repo-canon` | v0.1.1 | available | v0.2.0 | 1 |

Exit status was 0. The clone afterwards held only the ignored
`.repo-standards/cache/`.

## Read-only inspection against Repo Canon v0.2.0

Both runs used `inspect --source https://github.com/lutzseverino/repo-canon
--standards-version v0.2.0 --profile complete --json` with the published 2.0.0.

- **This repository in place** (branch at `67c0d72`, whose `.repo-standards`
  tree `cf0e877` matches the released commit): exit 1 with `RETIRED_FORMAT`.
  The diagnostic says ".repo-standards/state.json carries the retired format
  repo-standards/state/v4; this CLI reads only repo-standards/state/v5. Adopt
  fresh: remove the .repo-standards directory, commit, and adopt again."
  `git status --porcelain --ignored` was identical before and after.
- **A temporary clone of the released commit**, with `.repo-standards`
  removed in a local commit only: exit 1 with `INVALID_STANDARDS` and detail
  `INCOMPATIBLE_CLI` at `standards.yaml:5:19` (`/requires/repo-standards`). The
  detail says "CLI 2.0.0 does not satisfy 1.3.0. Declare an open-ended minimum
  CLI version, such as ">=1.3.0", so later CLI versions can select this
  standards version." Selection rejects v0.2.0 before the CLI reads the project.

## Outstanding

- **Fresh self-adoption, its record, and `outdated` after it.** Blocker: a Repo
  Canon release whose author range admits 2.0.0. The current v0.2.0 declares
  exactly `1.3.0`, and Repo Canon's default branch declares `>=1.3.0` but has
  no such release. When that release exists:
  - Remove and commit `.repo-standards`.
  - Remove the installed system skill directory as well. The 1.x-installed
    `adopt-standards` skill differs from the one packaged in 2.0.0, and
    [Adopt afresh over installed content](../../../docs/usage/adoption.md#adopt-afresh-over-installed-content)
    treats a system skill from another CLI version as a conflict. Author skills
    that still match the source are claimed.
  - Adopt in one confirmed run with the published 2.0.0. Use its
    `status --summary` as the adoption pull request body, and save it here as
    `status-summary.md` with the inspection and run identities.
  - Run `outdated` once and expect no available update for either pin.

## Ticket #93 acceptance

- [x] CLI 2.0.0 is published on npm with its matching GitHub release assets
  (passed; see [Publication](#publication)), and the published-installation
  acceptance passes on macOS and Linux (passed in verification run
  35957812670; see
  [Published-installation acceptance](#published-installation-acceptance)).
- [ ] Product state removed in a committed step, and fresh adoption of the
  current Repo Canon release completes in one confirmed run with the skills
  claimed. **Outstanding**; see [Outstanding](#outstanding).
- [ ] The adoption pull request body is the `status --summary` output, and this
  directory records the inspection identity, run identity, and summary.
  **Outstanding**, because no adoption ran.
- [ ] `outdated` against the fresh adoption reports no available update.
  **Outstanding**. The current pins' report is recorded in
  [Available updates](#available-updates).
- [x] Every acceptance criterion of specification #79 is checked off or
  recorded as outstanding: the section below.

## Specification #79 acceptance

Specification #79 has no separate acceptance-criteria section. Its user stories
and testing decisions are its acceptance criteria, so each one is listed here.
Tests are in `test/` and run against the packed and installed CLI. The merged
pull requests are #96 (#83), #98 (#84), #97 (#85), #94 (#86), #95 (#87),
#99 (#88), #101 (#89), #100 (#90), #102 (#91), and #103 (#92). All of them are
in the released commit.

### User stories

- [x] 1. A CLI update succeeds whenever the candidate supports the retained
  source format: #97; `update.test.ts` "a candidate CLI updates retained
  standards whose manifest range excludes it".
- [x] 2. The author range is checked only when a standards version is
  selected: #97; `update.test.ts` "a coordinated update changes the CLI and
  standards pins in one confirmed run when the new standards version requires
  the candidate", which also asserts that a selection outside the range fails
  with `INVALID_STANDARDS`. The published 2.0.0 rejects Repo Canon v0.2.0 at
  selection in the same way (see
  [Read-only inspection](#read-only-inspection-against-repo-canon-v020)).
- [x] 3. Validation and the authoring guide recommend an open-ended minimum:
  #97 (`docs/usage/authoring.md`, `docs/usage/author-format.md`, the
  `INCOMPATIBLE_CLI` message) and #103 (the author skill); the same
  `update.test.ts` coordinated-update test asserts the recommendation.
- [x] 4. The CLI pin and the standards pin change in one confirmed run: #97;
  the coordinated-update test above.
- [x] 5. Source and profile changes are ordinary updates: #97;
  `update.test.ts` "source and profile switches are updates that preserve the
  content of retired declarations".
- [x] 6. An unchanged selection starts after confirmation: #97;
  `update.test.ts` "a confirmed inspection of the unchanged selection starts a
  run that re-applies it from retained inputs" and "an unchanged selection
  with active discovery requires a fresh proposal before it starts".
- [x] 7. A read-only command reports newer stable versions and their count:
  #95; `outdated.test.ts` "outdated reports the newest stable CLI and
  standards versions and the stable releases since each pin". The published
  2.0.0 reports this repository's pins in [Available updates](#available-updates).
- [x] 8. At most one lookup per service, a one-day cache in the ignored product
  cache, and `unknown` with exit status 0: #95; `outdated.test.ts` "a second
  invocation within a day answers from the ignored product cache and changes
  nothing else in a dirty project", "an unreachable registry leaves the CLI pin
  unknown and still answers the standards pin", "an unreachable remote leaves
  the standards pin unknown and still answers the CLI pin", "exhausted GitHub
  quota leaves the standards pin unknown with exit status 0", "degraded
  answers are not cached, so the next invocation looks up again", and "a
  project without a selection reports both pins unknown and changes nothing".
- [x] 9. A GitHub token from the environment is used when present: #95;
  `outdated.test.ts` "a GitHub token from the environment is sent as
  authorization only to GitHub and only when present".
- [x] 10. `status` stays offline: #95; `outdated.test.ts` "status makes no
  network request".
- [x] 11. The inspection report states the update class: #102;
  `update-class.test.ts` "an update is exact when only exact content or the
  selection changes, including an unchanged selection".
- [x] 12. Exact only when every input is byte-identical: #102;
  `update-class.test.ts` "each change to guidance, discovery guidance,
  operations, retired declarations, or confirmed scope makes the update
  contextual".
- [x] 13. `inspect --summary` renders a deterministic proposal: #102;
  `summary.test.ts` "inspect --summary renders a deterministic update proposal
  with its class, and lists blockers".
- [x] 14. `status --summary` renders the complete or active run: #102;
  `summary.test.ts` "status --summary renders the active run and then the
  record of the complete run".
- [x] 15. The summary is the record, with the listed sections: #102; the two
  `summary.test.ts` tests above. Its use as an adoption pull request body is
  still outstanding under ticket #93 (see [Outstanding](#outstanding)).
- [x] 16. Reports carry inventories, diffs, and hashes instead of bytes: #101;
  `inspection.test.ts` "exact changes carry a unified diff for text and
  before-and-after hashes for binary content" and `adoption.test.ts` "the
  report of an established project with a large tree carries hashes and stays
  under the capture limit".
- [x] 17. The local run report records intervals as identities and deltas:
  #100; `v2-execution.test.ts` "v2 run records and completion keep work
  evidence as identities and deltas" and `discovery-lifecycle.test.ts` "a
  discovery completion stores its run once with the named observation as a
  delta".
- [x] 18. One format is written and read per artifact: #99;
  `retired-formats.test.ts` "the single committed formats are validated on
  read".
- [x] 19. Retired formats are rejected with a diagnostic naming fresh
  adoption: #99; `retired-formats.test.ts` "a retired state, scope evidence, or
  run record format is rejected with the fresh-adoption diagnostic and nothing
  is written". The published 2.0.0 gives this diagnostic for this repository's
  own state (see [Read-only inspection](#read-only-inspection-against-repo-canon-v020)).
- [x] 20. A confirmation survives an unrelated commit: #101;
  `adoption.test.ts` "a confirmation survives an unrelated commit and the run
  records HEAD at start".
- [x] 21. The identity binds what the run reads: #101; `inspection.test.ts`
  "inspection identity binds affected bytes, executable state and profile, not
  the index or HEAD", `adoption.test.ts` "changes to unrelated tracked content
  during the final source acquisition invalidate confirmation before
  mutation", and `update.test.ts` "update identities bind unexpected durable
  bytes while excluding local state, caches, and dependencies".
- [x] 22. HEAD is recorded for provenance but not bound: #101; the
  `adoption.test.ts` test named in story 20.
- [x] 23. A byte-identical skill directory is claimed at initial adoption:
  #94; `adoption.test.ts` "fresh adoption over previously installed content
  claims byte-identical skills once product state is removed" and "confirmed
  exact adoption installs whole skills, claims matching files and leaves
  durable pins uncommitted".
- [x] 24. Existing product state still blocks initial adoption: #94;
  `adoption.test.ts` "fresh adoption over previously installed content claims
  byte-identical skills once product state is removed" (`EXISTING_ADOPTION`
  before the removal) and "start rejects every invalid initial project state
  without mutation".
- [x] 25. A wrong scope is corrected by abandoning and adopting again: #96;
  `scope-adoption.test.ts` "a blocked scope review is corrected by abandoning
  the run and adopting again with a new confirmed scope".
- [x] 26. Only `repo-standards/v2` exists: #98; `source-validation.test.ts`
  "the retired repo-standards/v1 format fails with the invalid-format
  diagnostic naming only v2".
- [x] 27. Examples and fixtures use the single format: #98;
  `source-validation.test.ts` "the accepted Alice example validates unchanged
  and provides human output" and `release.test.ts` "release artifacts install
  without build tools and expose the matching CLI, bootstrap, skill and author
  documentation". At the released commit, `repo-standards/v1` appears under
  `examples/`, `acceptance/sources/`, and `test/` only in the story 26 test
  that plants it to assert its rejection.
- [x] 28. Blockers, actions, and flags of removed modes are gone: #96, #97, #98,
  and #103; `scope-adoption.test.ts` rejects `--amend-scope` as an unknown
  option and `update.test.ts` "a confirmed inspection of the unchanged
  selection starts a run that re-applies it from retained inputs" rejects
  `--readopt`.
- [x] 29. The release is 2.0.0: #103 set the version, and this record
  verifies its publication (see [Publication](#publication)).
- [ ] 30. This repository's fresh adoption of the current Repo Canon release
  with CLI 2.0.0 is the acceptance journey. **Outstanding**; see
  [Outstanding](#outstanding).
- [x] 31. Removed mechanisms are gone from the usage and development
  documentation and the architecture contracts: #103, together with the
  documentation of each removal pull request. A search of `docs/usage`,
  `docs/development`, `skills`, `README.md`, and `CONTEXT.md` for amendment,
  re-adoption, `--readopt`, and `repo-standards/v1` at the released commit
  finds only the architecture's "Removed in 2.0.0" list and the glossary's
  _Avoid_ line.
- [x] 32. The system skill describes the single update path, `outdated`, and
  `--summary` without workflow vocabulary: #103;
  `skills/adopt-standards/SKILL.md` at the released commit.

### Testing decisions

- [x] Tests observe external behavior through the existing seam: the packed
  and installed CLI run as a subprocess against fixture sources, a local Git
  remote, and a local npm registry. Each of #94 to #103 added its tests there,
  and no new seam was introduced.
- [x] Coverage to add or change: each item maps to the user story tests above.
  Coordinated pin updates are story 4, source and profile switches story 5,
  the CLI update against an excluding manifest story 1, and the range still
  rejecting a selection story 2. The unchanged-selection start is story 6,
  update class stories 11 and 12, and `outdated` stories 7 to 10. Summary
  determinism is story 13, report shapes without bytes story 16, and retired
  formats story 19. Identity stability and change are stories 20 and 21, and
  the byte-identical skill claim is story 23.
- [x] Tests for removed mechanisms are deleted, not skipped. #97 deleted the
  re-adoption suite and the independent-update blocker cases, #96 deleted the
  scope-amendment suite, and #98 converted every fixture to v2. No file under
  `test/` covers those mechanisms at the released commit.
- [ ] The acceptance journey is this repository's fresh adoption with the
  released 2.0.0 CLI against the current Repo Canon release, recorded as
  identities and the tool summary. **Outstanding**; see
  [Outstanding](#outstanding).

## Identities

- Released commit: `a8b89d4d00b3a4005dc912c90950ce755529bbf0`, tag `v2.0.0`.
- npm `@lutzseverino/repo-standards@2.0.0`: integrity
  `sha512-ZN5j6Z7hLt3yCbJUkafyDtpps5UQtZpjRK1ZHd5LZ6nBhkxovdZsMDONJNuhWGb0CeiQRnFIfOYdHjXeuysmQw==`.
- Release assets (SHA-256):
  - `lutzseverino-repo-standards-2.0.0.tgz`:
    `facca6b6d7186cabeb3568f01f61ceaeda714c460b1d350de50803fa5b5abc05`
  - `repo-standards-bootstrap`:
    `8f593d792119f9e9a623b20c1e2d680f7a0e641c54819367c7ebe2fca575c46a`
  - `release.json`:
    `02e74f2af282bc23f4f6e2b75517d1a9a8208e84cbfece18cea4ccd910a06249`
  - `SHA256SUMS`:
    `692bb0624ab5631507f447140afa3f6488eb9afa17e8fa4f6ca3452e1e05ea00`
- Packaged `skills/adopt-standards/SKILL.md` (SHA-256):
  `d733ef6c9357f3a78515783f5c019ec7c868eb4f82c8b868ecd5e58fcd152958`.
- Standalone `author-standards` skill installed by `prepare-author.ts` from
  tag `v2.0.0` (revision `a8b89d4`), with an identical inventory on Linux and
  macOS (SHA-256):
  - `SKILL.md`:
    `4f8b2e669f4c2ab309bcfc9dc2d5cf7544e1f6fd7090a74bc3654b5bf09c1d24`
  - `references/cli.md`:
    `c6fe1d7094f902127c364bdd421d3380f5202f4d8fd202fb03c2bb982dcec2ff`
  - `references/operations.md`:
    `3143ce8527dbb2ba3d2b116d569eb26f6addf752317944942651d531ca667c17`
  - `references/profiles.md`:
    `784a8b5a60d3c67f61361f829797b7bc0f005e739dbe1ed1943ef31593977851`
  - `references/revision.md`:
    `212a85d506397cdb82a598c13f9360ab26ec143316933305fc1ec7aa3b966e4f`
- This repository's current pins: CLI 1.2.2, Repo Canon v0.1.1
  (`0f313ef435c715889303ec1157f1006bee1fb9f4`), profile `complete`.
- Inspected source: Repo Canon v0.2.0, commit
  `79ff51198465248df67c6e1d6a66c95e2f964df5`.
- Public learning source for the verification run:
  `https://github.com/lutzseverino/repo-standards-example` `v2.0.0`, commit
  `cb11dcb0a5cff267f33cd4a1a8e73e03a69ec3b9`, profile `service`.
- Verification run 35957812670 checkout: commit
  `032fa4583d1b7b108165a73a4d8400aec7a69e1a`, Wayfinder source tree
  `114d8d5e667f850d7332f3c2eb02dcd5c467a77f`. On both systems it recorded the
  npm integrity and packaged `adopt-standards` hash listed above and the same
  standalone `author-standards` inventory.
- Bootstrap inspection identities in run 35957812670, each shared by the
  explicit and omitted CLI version inspections:
  - Linux: `sha256:bf988f4de00601b8da1784b94baf8226d180ecad6760e29c66a5817c4e340e54`
  - macOS: `sha256:793a126902ad37bc498ac9b7edaa7a5f9c140a656325cb71225aafa4aef4a039`
- Workflow run 35871105209 artifacts (retained until 22 December 2026):
  - `release-bundle`: the tarball, bootstrap, `release.json`, and `SHA256SUMS`.
  - `public-installation-ubuntu-latest` and
    `public-installation-macos-26-intel`: `public-installation.json` with its
    `propagation` attempts and failure, `public-author-installation.json`, and
    `public-api-quota.json`.
- Workflow run 35957812670 artifacts (retained until 23 December 2026):
  `public-installation-ubuntu-latest` and `public-installation-macos-26-intel`,
  each with a passing `public-installation.json` and its `propagation`
  attempts, `public-author-installation.json`, and `public-api-quota.json`.
- No inspection identity against Repo Canon or adoption run ID exists: both
  Repo Canon inspections failed before producing a report, and no adoption
  started. The local `outdated` and
  `inspect` output and the status helper's `status.json` stay outside the
  repository; the sections above state what they showed.

## Limits

- The workflow does not run real-agent journeys. The self-adoption is this
  release's only real-agent journey, and it is outstanding.
- The local read-only runs are Linux only. The macOS evidence comes from the
  workflow's public-installation job alone.
