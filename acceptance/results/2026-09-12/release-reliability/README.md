# PR #37 release reliability investigation

This is a new analysis of the original PR history at `37fa6de4`. Historical
release observations and artifacts remain unchanged. The agreed scope is in
[the design note](../../../../docs/release-reliability-design.md).

## Whole-branch check inventory

[Captured run metadata](run-inventory.json) contains all 29 runs returned by
`gh run list --branch feat/31-public-authoring-release --limit 100` before these
changes: 21 Validate runs (16 successful, five canceled, none failed), and eight
Release runs (one successful, seven failed). Every run has one attempt.

| Run | Workflow/event | Head | Result |
| --- | --- | --- | --- |
| [34653583774](https://github.com/lutzseverino/repo-standards/actions/runs/34653583774) | Release/workflow_dispatch | `f52fcd13` | failure |
| [34653584101](https://github.com/lutzseverino/repo-standards/actions/runs/34653584101) | Validate/push | `f52fcd13` | success |
| [34653688439](https://github.com/lutzseverino/repo-standards/actions/runs/34653688439) | Validate/push | `f3e8372b` | success |
| [34653803072](https://github.com/lutzseverino/repo-standards/actions/runs/34653803072) | Validate/pull_request | `f3e8372b` | success |
| [34654925215](https://github.com/lutzseverino/repo-standards/actions/runs/34654925215) | Validate/push | `ff8a7a49` | success |
| [34654928425](https://github.com/lutzseverino/repo-standards/actions/runs/34654928425) | Validate/pull_request | `ff8a7a49` | success |
| [34655066171](https://github.com/lutzseverino/repo-standards/actions/runs/34655066171) | Validate/push | `305025e3` | success |
| [34655069717](https://github.com/lutzseverino/repo-standards/actions/runs/34655069717) | Validate/pull_request | `305025e3` | success |
| [34678342082](https://github.com/lutzseverino/repo-standards/actions/runs/34678342082) | Release/workflow_dispatch | `305025e3` | failure |
| [34679056194](https://github.com/lutzseverino/repo-standards/actions/runs/34679056194) | Validate/push | `5d010d62` | success |
| [34679057886](https://github.com/lutzseverino/repo-standards/actions/runs/34679057886) | Validate/pull_request | `5d010d62` | success |
| [34705876628](https://github.com/lutzseverino/repo-standards/actions/runs/34705876628) | Validate/push | `2925b137` | success |
| [34705878542](https://github.com/lutzseverino/repo-standards/actions/runs/34705878542) | Validate/pull_request | `2925b137` | cancelled |
| [34705920611](https://github.com/lutzseverino/repo-standards/actions/runs/34705920611) | Release/workflow_dispatch | `2925b137` | failure |
| [34706187121](https://github.com/lutzseverino/repo-standards/actions/runs/34706187121) | Validate/push | `e8661816` | cancelled |
| [34706189121](https://github.com/lutzseverino/repo-standards/actions/runs/34706189121) | Validate/pull_request | `e8661816` | cancelled |
| [34706191543](https://github.com/lutzseverino/repo-standards/actions/runs/34706191543) | Release/workflow_dispatch | `e8661816` | failure |
| [34706315926](https://github.com/lutzseverino/repo-standards/actions/runs/34706315926) | Validate/push | `d34857ca` | success |
| [34706318227](https://github.com/lutzseverino/repo-standards/actions/runs/34706318227) | Validate/pull_request | `d34857ca` | success |
| [34706328017](https://github.com/lutzseverino/repo-standards/actions/runs/34706328017) | Release/workflow_dispatch | `d34857ca` | failure |
| [34707349623](https://github.com/lutzseverino/repo-standards/actions/runs/34707349623) | Release/workflow_dispatch | `d34857ca` | failure |
| [34707542741](https://github.com/lutzseverino/repo-standards/actions/runs/34707542741) | Validate/push | `4b72bb1d` | success |
| [34707546453](https://github.com/lutzseverino/repo-standards/actions/runs/34707546453) | Validate/pull_request | `4b72bb1d` | success |
| [34707566894](https://github.com/lutzseverino/repo-standards/actions/runs/34707566894) | Release/workflow_dispatch | `4b72bb1d` | failure |
| [34707831591](https://github.com/lutzseverino/repo-standards/actions/runs/34707831591) | Validate/push | `f7034fd2` | cancelled |
| [34707831276](https://github.com/lutzseverino/repo-standards/actions/runs/34707831276) | Release/workflow_dispatch | `f7034fd2` | success |
| [34707834023](https://github.com/lutzseverino/repo-standards/actions/runs/34707834023) | Validate/pull_request | `f7034fd2` | cancelled |
| [34707934503](https://github.com/lutzseverino/repo-standards/actions/runs/34707934503) | Validate/push | `37fa6de4` | success |
| [34707937149](https://github.com/lutzseverino/repo-standards/actions/runs/34707937149) | Validate/pull_request | `37fa6de4` | success |

The five cancellations overlap later work. The handoff says they were deliberate
runner management; run metadata establishes cancellation and timing, not the
operator's intent. They are not evidence of a failing assertion. Push and PR runs
both execute the full matrix, but use branch and prospective merge checkouts
respectively. Preserve both validation targets; cancel only superseded runs for
the same event and ref.

## Failure classes

| Class and trigger | Evidence and established cause | Remaining risk and disposition |
| --- | --- | --- |
| Missing publication setup | [34653583774](https://github.com/lutzseverino/repo-standards/actions/runs/34653583774): both validations passed; `npm whoami` returned `ENEEDAUTH`, before publication. [Candidate record](../authoring-release/README.md#validation-and-review) identifies the missing token. | Preventable setup/sequencing problem in the earlier token workflow. OIDC already replaces that dependency. Put the normal trusted-publisher setup first in the release guide; local login belongs to its own recovery branch. |
| Identity passed, publication rejected | [34678342082](https://github.com/lutzseverino/repo-standards/actions/runs/34678342082): original bundle validated, token publication returned `EOTP`. [Publication record](../authoring-public-release/README.md#publication-and-authentication-recovery) records approved publication of that same tarball. | Identity, package permission and publication approval are distinct. Earlier guidance to configure a token did not establish that account policy would permit it. Retain the OIDC migration; document the narrower proof of its exchange probe and the explicit recovery path after partial publication. |
| Public HTTP 403, early attempts | [34705920611](https://github.com/lutzseverino/repo-standards/actions/runs/34705920611), [34706191543](https://github.com/lutzseverino/repo-standards/actions/runs/34706191543): [attempt 1](../authoring-public-release/public-checks-attempt1/) and [attempt 2](../authoring-public-release/public-checks-attempt2/) contain macOS public metadata HTTP 403, with no retained rate-limit headers. | Quota exhaustion is consistent with later observations, but cannot be independently established for each early response. Do not relabel these as proven quota incidents. Improve future diagnostics at the failing response. |
| Exhausted or almost exhausted public quota | [34706328017](https://github.com/lutzseverino/repo-standards/actions/runs/34706328017): the same job's quota snapshot had 0/60 remaining before failures. [34707566894](https://github.com/lutzseverino/repo-standards/actions/runs/34707566894): snapshot at 17:13:30 UTC had 1/60 remaining, used 59, reset 1789235909, followed by failed acquisition. | External shared-IP capacity is the immediate constraint; the acquisition's request demand contributes. A runner with one request cannot complete the two inspections. Keep anonymous semantics, retain evidence, and give an explicit retry after the indicated reset. Do not add speculative retries. |
| npm prefix traverses a symlink | [34707349623](https://github.com/lutzseverino/repo-standards/actions/runs/34707349623): macOS public CLI succeeded, then author helper failed reading lock integrity. [Reproduction](../authoring-public-release/npm-prefix-reproduction.json) shows npm 11.6.2 keys differ between aliased and canonical prefixes. | Repository helper defect, already fixed by `4b72bb1`. Preserve canonicalization and the direct integrity comparison; the fix also passed later real macOS acquisition. Do not introduce a permissive lockfile search that could accept the wrong installed package. |
| Missing executable loses useful setup evidence | [Missing-npm exercise](../authoring-release/missing-npm.json) and `f3e8372` show the prerequisite probe moved inside the evidence-retention boundary. | A local negative exercise exposed a real helper gap. Already corrected; retain evidence on future command failures. This was not a failing Validate Actions run. |
| Stale guide pin after package version change | [Candidate validation record](../authoring-release/README.md#validation-and-review) records an intentionally failing installed-package test for the old 1.0.1 guide after selecting 1.1.0. `f52fcd1` updates the guide and adds the guard. | Expected development red test, demonstrating a useful release seam. Keep the guard and make synchronized version updates explicit in release preparation. No CI regression is established. |
| Superseded and duplicate validation | [Inventory](run-inventory.json): ten pushed heads have both push and PR runs; five runs were canceled. | Duplicate cost is real, but the two events validate different Git states. Preserve both; use concurrency per event/ref so superseded work has a predictable lifecycle. Cancellation motives beyond the recorded handoff remain unverified. |

## Mechanisms and limits

The [successful verification run](https://github.com/lutzseverino/repo-standards/actions/runs/34707831276)
ran public acquisition on Linux and Intel macOS and passed OIDC exchange. Its
validation and publication jobs were intentionally skipped. This proves the
recorded installation and exchange behavior; actual OIDC direct publication and
provenance still require the next real version. No new version is justified for
this investigation.

GitHub documents anonymous REST limits by source IP and distinguishes primary
and secondary limits. A rate-limit snapshot does not reserve future capacity;
403 alone is not a classification. See [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
The Intel pool mitigated the observed incident; its quota availability remains
external. [Selected live log extracts](quota-log-extracts.json) preserve the relevant
observations without copying full logs. The fifth run started before its recorded reset, so immediate retries
would not have addressed the observed constraint.

The pinned example has eight blobs. The current acquisition code requests
repository metadata, tag ref, commit, recursive tree and each blob: twelve core
requests for one lightweight-tag inspection, before discovery. The public helper
runs explicit and omitted-version bootstrap inspections independently: at least
24 core requests when they use that acquisition path. This explains why nearly
exhausted runners fail, while it does not establish that this project consumed
all prior quota on the shared IP. Request consolidation through Git archive
acquisition would change product acquisition/integrity behavior and deserves a
separate design and ticket if this constraint remains frequent.

[Current npm documentation](https://docs.npmjs.com/trusted-publishers/) confirms
that trusted publishing is workflow-bound and requires compatible Node/npm.
The existing versions satisfy those prerequisites. The live exchange probe
remains useful authentication evidence, and replacing it with `whoami` or a
packaging dry run would lose that signal. Full publication is deliberately left
for the next real release.

The existing release job serializes publication with a repository-wide group.
Keep that behavior: canceling an in-flight publication can create an ambiguous
outcome. Acceptance jobs deliberately run independently of the exchange probe
in verification mode so authentication failure does not discard public evidence.

## Reusable candidates for future standards

These are candidates for a later authoring conversation, not confirmed universal
policies or an already published standards source:

- A maintainer can find the normal entry point, prerequisites and explicit
  recovery branch without reading historical incident records.
- Publication records immutable artifact identity separately from acceptance.
  Recovery reuses validated artifacts and reports uncertainty explicitly.
- Failed checks retain evidence and explain the next action. Classify external
  failures from evidence; retries have a reason and a limit.
- Agent-facing instructions distinguish authentication, publication permission,
  actual publication and completed acceptance.
- Retain useful regression checks and distinguish deliberate red development
  tests, superseded work and external acceptance interruptions.

The existing standards format can express these through contextual file or
repository guidance, optional checks, and ordinary-work author skills. Exact
workflow files are appropriate only where projects should share identical
content. npm-specific settings, runner selection and this package's artifact
names stay project-specific unless explicitly confirmed for a profile.

## Backlog and verification

Potential follow-up: reduce public acquisition request demand if real failures
continue after better diagnostics. Preserve immutable Git identity and byte
verification, and evaluate the change at the installed public CLI seam. A new
release coordinator or persistent publication store is not justified by this
history: the npm registry, Git tags, original run and bundle already provide
recoverable state.

The new read-only `scripts/release-status.ts` was exercised against the original
Release run 34678342082 and the live public registries. Its [actual report](live-status.json)
matched the original validated commit, npm integrity, Git tag, and all four
GitHub release assets, and printed verification-only dispatch as the next action.
That command was not executed by the status helper. The recorded local bundle
path and branch describe that observation, not permanent recovery inputs.

Focused command tests use simulated external executables/HTTP to cover partial
publication, missing assets, unknown state, mismatched integrity/tag, damaged
bundles, evidence preservation, quota diagnostics, unexplained 403, transport
failure and assertion failure. These simulations do not establish public
installation, account permissions or actual publication.

Both independent reviews inspected `37fa6de4...27121ec` using the code-review
skill. The full validation result is recorded below.

### Standards

No documented-standard violations found. Changes stay within maintainer tooling
and documentation, preserve the public CLI/author contracts, and test observable
commands at the confirmed seam. The repeated quoting/hash operations do not
justify shared infrastructure for this focused change. **0 findings.**

### Spec

No missing requirements, scope creep or incorrect implementation found. The
review confirmed the history classification, identity-checked recovery, preserved
anonymous acceptance and archival evidence, and explicit standards candidates
and backlog limits. **0 findings.**

Review summary: Standards 0 findings; Spec 0 findings. No blocking issue on
either axis.

### Full validation

`pnpm install --frozen-lockfile` and `pnpm validate` passed on Linux arm64 with
Node.js 24.11.1 and pnpm 11.20.0. The full suite ran once after implementation:
393 tests passed, with zero failures, cancellations or skips; typechecking and
build passed as part of the same command. Test duration was 2,275,997.530244 ms.
The new 13 command tests also passed in focused development runs. Both workflow
files passed YAML parsing and embedded shell syntax checks.

The full suite repeatedly installs and exercises the package against temporary
Git repositories. Its local cost is retained rather than weakening acceptance;
focused files provide the development feedback loop. Hosted platform results
belong to the follow-up PR checks.
