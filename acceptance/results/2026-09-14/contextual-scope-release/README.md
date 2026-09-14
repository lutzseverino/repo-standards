# Contextual-scope 1.2.0 release evidence

This directory records the published-path and separate real-agent evidence for
issue #50 and the full acceptance map in issue #41. The candidate commit was
`9ab60775bcb2ad35076a929cb7de78a01a4576ec`; release workflow
[34796996665](https://github.com/lutzseverino/repo-standards/actions/runs/34796996665)
completed successfully and published npm package
`@lutzseverino/repo-standards@1.2.0` and GitHub release
[`v1.2.0`](https://github.com/lutzseverino/repo-standards/releases/tag/v1.2.0).

## Published release

- `release/validation-summary.json` records exact workflow/job IDs and results.
  Linux passed 538/538 tests. macOS passed 537/538 with the existing
  case-sensitive-filesystem case skipped on that runner filesystem. Neither OS
  failed a test.
- Public installation passed on Ubuntu and macOS Intel. Each artifact identifies
  package 1.2.0, npm integrity
  `sha512-upetHlGX7xhNxUiWY5V88rTyLpv2umoq9zx+y1aKfAbjA24hbPuZl3ZCFAL81rQ+fUw1aL+253O/mE7W8Agdog==`,
  the packaged Atlas source, bootstrap behavior, a clean checkout-bound
  installation, and the matching adoption-skill hash.
- `release/npm.json`, `release/github-release.json`, `release/release.json`, and
  `release/SHA256SUMS` retain registry, release, workflow, and artifact identity.
  The original workflow artifacts are retained under `release/ubuntu/` and
  `release/macos/`. They were recovered from workflow 34796996665 during the
  final audit after a broad `release/` ignore rule omitted them from the initial
  evidence commit. `release/validation-summary.json` identifies the recovery,
  original jobs, log excerpts, and artifact hashes; this is historical release
  evidence, not a new validation run.

## Real-agent journeys

### Atlas on two unfamiliar layouts

Fresh GPT-5.6 Sol agents used the public 1.2.0 package and installed adoption
skill without product implementation or test access.

- `agents/forge/` records an unresolved Hammer fixture question blocking the
  first inspection, then an evidence-backed proposal and confirmed completion.
  It migrated `guides/hammer.md` to `docs/projects/hammer.md`, introduced and
  repaired indexes, preserved useful content, kept exact `docs/catalog.json`
  unchanged, and excluded fixture, generated, and organizational candidates.
- `agents/orchard/` records a Pear project with no initial README. The agent
  confirmed four paths, discovered root `CATALOG.md` during the eligible active
  run, obtained a separate additions-only confirmation, then recovered a
  controlled interruption after durable amendment acceptance. Replayed fixes,
  fresh assessment, and checks completed while retaining separate operation and
  agent intervals. The final migration moved the legacy guide, introduced the
  README and index, repaired links, and preserved exact catalog bytes.
- `agents/forge/empty-scope/` records explained empty contextual scope. The
  declaration remained active: its fix and check both ran with an empty concrete
  target list, and the adoption completed.
- `agents/orchard/retroactive/` is a deliberately incomplete negative session.
  It preserves an out-of-scope `CATALOG.md` edit and the `ASSESSMENT_SCOPE`
  rejection from `inspect --amend-scope`; no later identity was issued that
  could retrospectively authorize the earlier write.

### Fresh retained same-pin re-adoption

`agents/orchard/retained-readoption-retired-pear/` records a normal committed
initial adoption followed by committed repository growth and a fresh checkout.
The public runtime was restored with `npm ci --ignore-scripts`. Direct source
acquisition failed as recorded, while retained inputs still supplied historical
inspection and fresh discovery. The explicitly confirmed same-pin 1.2.0/v1.0.0
re-adoption added current Plum coverage and removed Pear README/operations from
current scope. Both removed-scope Pear files retained identical bytes and were
not deleted. The completed status, scope delta, exact integrity, operation
record, and clean-start HEAD/index evidence are retained.

### Independent Wayfinder source

`agents/wayfinder/` records a different source and service-oriented journey
through the same generic source, inspection, execution, assessment, and
lifecycle interfaces. The agent selected Relay from owner, executable startup,
and health-endpoint evidence; excluded fixture, generated, group, and unchanged
notes; and kept exact `.editorconfig` outside contextual scope. The source's fix
initialized structured status and its check consumed a separate required-section
resource. The agent ran Relay on loopback, observed health before and after a
restart, wrote a useful runbook and truthful status, and left unavailable
production facts explicitly unverified. `source-authorship.md` records the
separate source-author and adopter roles.

### Public v1 and independent updates

`agents/public-updates/` records public GitHub and npm behavior against the
existing v1 source format: a real-agent CLI 1.1.0/source v1.0.0 adoption, a
separate confirmed standards-only update to source v1.1.0 with CLI 1.1.0 held
fixed, and a separate CLI-only update to public 1.2.0 from retained v1.1.0
inputs. Anonymous quota failures are preserved apart from the successful
isolated-runner completion, assessments, checks, integrity, and normal commits.

## Acceptance map

The repository-level map at
`acceptance/contextual-scope-release-coverage.md` maps all 30 parent stories and
testing decisions to deterministic installed-CLI tests and these release
observations. The following evidence closes the delivery rows:

| Delivery outcome | Observable evidence |
| --- | --- |
| Contracts and product-owned skills agree | Coverage map plus successful full validation and packaged-skill public artifacts |
| Published package/bootstrap on Linux/macOS | Release summary and per-OS public-installation artifacts |
| One source, two unfamiliar layouts | Forge and Orchard inspections, rationale, diffs, inventories, and completion records |
| Useful migration and exact preservation | Forge/Orchard final diffs, link checks, exact hashes, and assessments |
| Additions, replay, interruption, anti-retroactivity | Orchard amendment/retry history and separate retroactive rejection |
| Empty and unresolved scope | Forge empty-scope completion and unresolved blocking inspection |
| Same-pin growth-adoption, removals, fresh retained discovery | Orchard retained fresh checkout and scope delta |
| v1 plus independent standards/CLI updates | Public agent v1 completion plus isolated-runner standards and CLI update records |
| Second independent source | Wayfinder authorship, inspection, operation, probe, and completion records |
| Semantic usefulness distinct from protocol | Fresh-agent transcripts/reviews versus deterministic CI artifacts |

## Evidence boundaries and remaining limits

A successful source validation proves source structure, references, and static
conflicts; it does not prove semantic discovery in an unknown project. Agent
rationale and observed project facts supply that judgment. Historical retained
scope explains past authorization; only a fresh inspection describes current
coverage. Structural checks establish current reported compliance at their
observation time and do not turn historical results into continuous monitoring.

Author operations are trusted code with host, environment, and network access.
Observed before/after filesystem evidence is not a sandbox or an atomic host
snapshot. The product does not claim complete observation of unlisted ignored
siblings. Public npm/GitHub acquisition, Node 24, subprocess dependencies,
permissions, network access, and remote-service availability remain separate
runtime prerequisites. Wayfinder's local Relay observations do not establish
production state. No required release prerequisite or external blocker remained at completion.
