# Published CLI updates and live-source continuation

All four confirmed **CLI 1.0.0 → 1.0.1 updates completed** on the restored
projects. Each used the actual public npm package and matching installed system
skill, retaining the original source repository, standards tag, commit and
profile. No further npm authentication was needed. The earlier source fixtures
were unavailable to these retained-source updates; this is not live-source
adoption evidence.

| Journey | Completion | Review |
| --- | --- | --- |
| macOS Alice/work | [Report](macos-alice/update-complete.json) | [Verification](macos-alice/verification.json), [full diff](macos-alice/full-output.patch) |
| Linux Alice/work | [Report](linux-alice/update-complete.json) | [Verification](linux-alice/verification.json), [full diff](linux-alice/full-output.patch) |
| macOS Mira/service | [Report](macos-mira/update-complete.json) | [Verification](macos-mira/verification.json), [full diff](macos-mira/full-output.patch) |
| Linux Mira/service | [Report](linux-mira/update-complete.json) | [Verification](linux-mira/verification.json), [full diff](linux-mira/full-output.patch) |

The [confirmed inspections](../2026-09-09/public-agent/cli-update-confirmation.md)
identify the exact candidates and operations. Fresh project reads and probes
are stored as `update-project-probes.json` in each directory. Both Alice test
suites again passed two tests and produced the documented sample dispatch.
Both Harbor probes again observed accepted 0, POST 204, accepted 1, then accepted
0 after restart. The existing project documentation still satisfied unchanged
guidance, so the new agent assessments truthfully list no contextual edits.
These are fresh assessments of the current work requests, not resubmitted
initial-adoption assessments. Mira's fix preserved existing unverified status;
all declared checks passed.

Full update diffs and complete changed-file content/mode records are retained.
All new-file inventories are empty. Review verified unchanged source pins,
exact baselines and dependency structures: only the CLI version, its public
package URL/integrity, generated runtime name, and associated selection/state
changed. HEAD and staged index entries matched each confirmed inspection;
employer contribution content remained unchanged. These update outputs remain
uncommitted in the disposable clones. The separately recorded normal commits
and fresh restoration occurred in the [initial journeys](../2026-09-09/public-agent/README.md).

The [index review note](index-review-note.json) records an initial helper failure:
`git diff` refreshed index stat metadata despite `--no-optional-locks`, without
changing HEAD or staged entries. Disabling `diff.autoRefreshIndex` prevented
that refresh; all final captures show identical raw index bytes before/after
review. This is not claimed as an adoption staging change or a passing first
capture. Linux Mira's name inventory also includes the unchanged system skill;
its full bytes/mode were inspected, and the binary diff contains no skill change.

## Live source: both adoptions complete

The maintainer confirmed both [live-source inspections](live-confirmation.md),
using unmodified public CLI 1.0.0 with unauthenticated GitHub acquisition from
`lutzseverino/repo-standards-example`, published `v1.0.0`, commit
`98b53f2087a4fe8a028ac60108a9545b7b9ea289`, profile `service`.
Both inspections passed without blockers, but the first starts exhausted
GitHub's shared unauthenticated API quota during source rechecks:

- [macOS incomplete report](live-macos/start.json): HTTP 403 fetching a guidance blob.
- [Linux incomplete report](live-linux/start.json): HTTP 403 fetching repository metadata.

Those historical reports show zero project changes and no author operations.
Node prerequisite probes passed, and the saved initial status reports show no
selection or active run. After the quota reset, the [queued retries](live-retry-queue.log)
used the same confirmed identities and reached contextual handoff on both
platforms. These retries used ordinary public source acquisition without an
authenticated transport shim or source fixture.

The agent read each current work request and the actual Harbor implementation,
then adapted each project's operations document. The documents preserve the
existing security and escalation warning and describe the observed loopback
server, startup command, health counter, acceptance endpoint, restart behavior,
and recovery limits. Separate local probes observed accepted 0, POST 204,
accepted 1, then accepted 0 after restart. Each fresh assessment was submitted
through the installed public skill's assessment interface; all declared checks
and final integrity verification passed.

| Journey | Completion and assessment | Output review and normal commit |
| --- | --- | --- |
| macOS Harbor/service | [Complete](live-macos/complete.json), [assessment](live-macos/assessment.json) | [Verification](live-macos/completion-verification.json), [full diff](live-macos/full-output.patch) |
| Linux Harbor/service | [Complete](live-linux/complete.json), [assessment](live-linux/assessment.json) | [Verification](live-linux/completion-verification.json), [full diff](live-linux/full-output.patch) |

Each review captured all 18 new files and the one changed tracked document,
including full content and modes. Adoption preserved the inspected HEAD and
staged entries; output review also preserved raw index bytes. Employer-owned
contribution content remained unchanged. Only after completion and review did
the project's normal workflow commit the output: `a7143c0` on macOS and `6c0486f`
on Linux. The verification reports confirm that the commits match the reviewed
contents and leave clean working trees. Fresh-checkout restoration and source
unavailability are separately demonstrated by the initial independent-author
journeys linked above.

## Outstanding standards updates

The remaining live release exercise is updating actual public standards from
`v1.0.0` to `v1.1.0`, keeping CLI 1.0.0, source repository and `service` profile
fixed, on macOS and Linux. No additional repository or npm version is needed.
Parent #1 remains unchanged.

The first update inspections were mistakenly attempted before the normal project
commits and correctly reported `DIRTY_PROJECT` and `UNTRACKED_REPLACEMENT`:
[macOS](live-macos/standards-update-inspection.json),
[Linux](live-linux/standards-update-inspection.json). Those are historical blocked
inspections, not confirmed candidates. After committing, fresh clean-project
inspection attempts exhausted the public API quota:
[macOS](live-macos/standards-update-clean-inspection.json),
[Linux](live-linux/standards-update-clean-inspection.json). Neither update has
started. The reported quota reset is `2026-09-10T21:56:09Z`.

Read-only clean-project inspections are queued locally in
`/tmp/repo-standards-issue11-queue-inspections.mjs` for `2026-09-10T21:56:20Z`, with
log `/tmp/repo-standards-issue11-evidence/queued-standards-inspections.log`. The
process checks public quota and clean Git state, inspects each candidate, and
stops on failure. It does not confirm or start adoption. Successful reports
still require agent review and explicit maintainer confirmation of their actual
inspection identities before either standards update can start.

## Review

Both requested GPT 5.6 Terra/high reviewers found no actionable standards or
spec findings in the live-adoption completion evidence. The spec review keeps
the public standards updates explicitly outstanding. The preceding CLI-update
evidence also passed both reviews.

Validation parsed every live-report JSON file, checked confirmation and
assessment bindings, resolved local documentation links, and compared all 19
reviewed files on each OS with the actual normal commit's bytes and executable
modes. Both projects remain clean. No production code changed in this
continuation; the release validation and macOS/Linux CI results linked from the
preceding evidence remain applicable.
