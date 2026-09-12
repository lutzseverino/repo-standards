# Authoring 1.1.0 public release acceptance — issue #31

Version 1.1.0 is published. Fresh creation, no-standards, revision, and resumption
journeys are complete. Public CLI/bootstrap/discovery and standalone authoring
acquisition passed on Linux and macOS; live npm trusted-publisher authentication
also passed.
The original [candidate evidence](../authoring-release/README.md) remains unchanged
and is not substituted for these public-release observations.

## Publication and authentication recovery

The [original Release run](https://github.com/lutzseverino/repo-standards/actions/runs/34678342082)
validated commit `305025e36e9f9f503135eed3dce33a7b51d373f4` on both platforms:
Linux passed 380 tests; macOS passed 379, with one existing filesystem-dependent
skip and no failures. Its bundle hashes verified, but npm rejected token-authenticated
publication with `EOTP` after successful identity verification. See
[workflow metadata](release-workflow.json) and the earlier
[unavailable-version observations](publication-availability.json).

The maintainer completed npm browser sign-in and a separate publication approval.
The evaluator published the original workflow tarball, without rebuilding it.
At 16:39 UTC, public registry metadata confirmed 1.1.0 and the exact original
bundle integrity: [publication.json](publication.json), [release.json](release.json)
and [SHA256SUMS](SHA256SUMS). The
[GitHub release](https://github.com/lutzseverino/repo-standards/releases/tag/v1.1.0)
uses that same validated commit and all four original bundle files;
[release metadata](github-release.json) records its assets. The temporary local
npm session was logged out and its configuration/cache removed. No credentials
or authentication logs are retained in this evidence.

At the maintainer's request, the PR also changes future GitHub Actions publication
to npm trusted publishing through OIDC. The maintainer configured the package's
trusted publisher for `lutzseverino/repo-standards`, `release.yml`, environment
`npm`, and direct publishing. The workflow no longer consumes `NPM_TOKEN` or
runs `npm whoami`; it uses compatible pinned npm and an OIDC-enabled publish job.
The live `verify-publisher` job passed in
[run 34706191543](https://github.com/lutzseverino/repo-standards/actions/runs/34706191543).
This proves workflow authentication, not the full direct-publish/provenance path,
which requires the next actual version. No extra version was published to test it.
[Two-axis review](workflow-review.md) found no unresolved workflow defects.

## Public acquisition and discovery

[Local public acquisition](public-author-installation-linux-arm64.json) used
`skills@1.5.25` and the public v1.1.0 tag to install only `author-standards` into
an isolated global home. It then followed the installed guide to acquire npm
CLI 1.1.0 and matching documents in a separate external directory. The author
workspace stayed empty; no adopting project or product checkout was needed.
All required resources, exact tag revision, file hashes, public npm/release
integrity, documentation and packaged examples verified. Its environment was
Linux arm64 kernel `6.18.34+rpt-rpi-v8`, Node 24.11.1 and npm 11.19.0.

The workflow's Linux x64 public CLI/bootstrap/discovery and standalone authoring
acquisition checks passed. The [first](public-checks-attempt1/),
[second](public-checks-attempt2/) and [third](public-checks-attempt3/) attempts
retain independent results. macOS encountered HTTP 403 while obtaining public
GitHub data. [Quota evidence](macos-api-quota.json) confirmed 0/60 core API
requests remaining, with reset at 17:08:38 UTC.

After reset, the [fourth attempt](public-checks-attempt4/) passed public
CLI/bootstrap/discovery on macOS arm64, then exposed a standalone acceptance
helper bug: npm 11.6.2 recorded unexpected lockfile keys when its installation
prefix traversed macOS's `/var` symlink. Commit `4b72bb1` canonicalizes the
temporary root, matching the existing public CLI helper. The exact npm version
[reproduction](npm-prefix-reproduction.json), its [script](reproduce-npm-prefix.py)
and a [complete fixed-helper run with a symlinked temporary directory](public-author-symlink-root.json)
on Linux are retained. Those checks establish the fix locally, not macOS acceptance.
The [fifth attempt](public-checks-attempt5/) exhausted the shared macOS arm64
runner's API quota again before reaching the installation step.

Commit `f7034fd` selects the supported `macos-26-intel` runner for public
acquisition; full implementation CI still uses `macos-latest` arm64. Assertions
were not weakened and authenticated responses were not substituted for public
acquisition. All earlier failed observations remain intact.

The [final run 34707831276](https://github.com/lutzseverino/repo-standards/actions/runs/34707831276)
passed both public checks on Linux x64 and macOS Intel, plus live OIDC
verification. [Workflow metadata](public-checks-34707831276.json) and the
[complete installation records](public-checks-final/) retain actual runtime,
commands, tag revision, package/resource hashes and outcomes. This closes the
macOS acquisition blocker with an actual public installation of 1.1.0.

[The dated skills.sh observation](discovery.json) is independent of installation:
the page returned HTTP 200 but visibly reported 404/unavailable content, and
`skills find author-standards` omitted this repository. The public release-tag
installation succeeded despite that listing result. No indexing or ranking
promise is made. Acceptance disables installer telemetry.

## Fresh real-agent journeys

Four fresh agents used the publicly installed skill and external CLI/docs.
The evaluator acted as a synthetic author through live turns; this is not a
human usability study. All agent runtime execution was Linux arm64 with Node
24.11.1. No macOS agent or native desktop integration is claimed. The creation
agent supplied a newly authored source; returning agents saw that existing
source and their opening author request, without prior conversations or examples.

[Creation conversation](creation/conversation.jsonl) records the skill overview,
a light interview, an [incidental-practice reference](creation/input-reference.md),
a requested recommendation, refinement and incremental content review. The
[single-profile source](creation/06-single-profile-source/) was accepted and
validated before adding confirmed team differences. The
[whole-source review](creation/14-whole-source-review.md) and
[final source](creation/final-source/) cover shared exact EditorConfig, project-owned
README/CONTRIBUTING guidance, a complete team README replacement, employer
CONTRIBUTING exclusion, team runbook addition, shared NOTES operations and a
whole exact documentation-review skill. No tutorial profile, indentation-width,
semicolon, signed-commit, CI, or test policy was inferred. CI is skipped and a
test policy is explicitly deferred. [Completion](creation/completion.json)
records final acceptance, matching reviewed bytes/modes, both valid profiles
and no provisioning, commit, publication or adoption.

[Operation evidence](creation/operation-exercises.json) contains 68 actual direct
protocol invocations, all with expected results and preservation assertions,
plus four missing-Node probes. Cases include failed check, repair, unchanged
repeat, passing check, empty/LF/CRLF/binary content, missing/symlink/directory/FIFO,
unreadable/unwritable and out-of-scope targets. Requests, prerequisite results,
process outputs, full before/after bytes and modes, and unrelated/employer
sentinels are retained. [The original harness](creation/exercise-operations.py)
and [validation input](creation/11-two-profile-validation.json) are preserved;
[archive replay](creation/archive-replay.json) separately passed all 72 records.
This is direct operation evidence, not an adoption-lifecycle run.

[No confirmed standards](no-standards-evidence/conversation.md) produced only
[accepted non-decision notes](no-standards-workspace/authoring-notes.md).
No filler manifest, Git repository or validation claim was created.

[Revision](revision/complete-source-review.md) surfaced that the sample-output
rule belonged only to personal-tools. The author selected that scope before
editing and accepted replacement with failure-case guidance. Only its guidance,
personal checklist section and matching notes changed; team criteria stayed
unchanged. [Evaluator verification](revision/evaluator-verification.json) and
[completion](revision/completion.json) compare against the initial fixture.

[Resumption](resumption/complete-source-review.md) surfaced the manual runbook
edit's conflict with old notes, checklist and profile description. The author
confirmed on-call lookup/escalation superseded recovery/named-owner requirements.
Only notes, the team checklist section and profile description were reconciled;
the manual guidance bytes stayed intact. The stable declaration and project-owned
scope were preserved. [Evaluator verification](resumption/evaluator-verification.json)
and [completion](resumption/completion.json) record the resulting state.

The evaluator provisioned the returning-author Git fixtures, including existing
staged and unstaged scratch work and an untracked draft. The authoring agents
preserved HEAD, raw index bytes/entries, file set, all modes and that unfinished
work. Before/final sources, exact diffs, complete reviews, live acceptance and
final all-profile validation are retained separately for each journey. Notes
record decisions, not personal transcripts. No authoring agent provisioned,
committed, published or adopted a standards source.

## Verification limits

The generated documentation skill received complete content review and actual
same-agent ordinary-work exercises during creation, revision and resumption.
The evaluator accepted those narrow findings as useful. They are not independent
usability studies and do not establish that documented commands, health checks,
or recovery/escalation actions work. Unchanged NOTES operations were not rerun
by the returning agents, and no new behavior claim was made for them.

The author explicitly deferred macOS operation execution, concurrency,
interruption, disk-full/I/O injection and other unexercised prerequisite/skill
scenarios listed in the full reviews. Structural validation does not execute
operations or establish future project compliance. These accurately disclosed
limits are separate from mandatory macOS public acquisition, which passed in
the final run above.

[Current implementation CI](ci-validation.json) passed on both platforms after
the workflow corrections. Its installed-CLI tests retain reservation, adoption
pins, integrity/ownership, update and no-automatic-authoring-installation coverage.
The [coverage map](../../../authoring-release-coverage.md) separates all twelve
criteria. PR #37 remains ready and unmerged; issues #31 and #25 remain open.
