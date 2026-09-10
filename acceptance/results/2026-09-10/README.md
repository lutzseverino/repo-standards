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

## Live source: confirmed but not yet adopted

The maintainer confirmed both [live-source inspections](live-confirmation.md),
using unmodified public CLI 1.0.0 with unauthenticated GitHub acquisition from
`lutzseverino/repo-standards-example`, published `v1.0.0`, commit
`98b53f2087a4fe8a028ac60108a9545b7b9ea289`, profile `service`.
Both inspections passed without blockers, but the subsequent starts exhausted
GitHub's shared unauthenticated API quota during source rechecks:

- [macOS incomplete report](live-macos/start.json): HTTP 403 fetching a guidance blob.
- [Linux incomplete report](live-linux/start.json): HTTP 403 fetching repository metadata.

Both reports show zero project changes and no author operations. Node prerequisite
probes passed. Their working trees remain clean; `status` reports no selection
and no active run. The runs are not claimed as completed live adoptions.
The API reported zero remaining requests and reset at `2026-09-10T15:42:43Z`.
Further live attempts must be serialized across available quota, preserving the
confirmed inspection identities and checking for changed inputs. No authenticated
transport shim or source fixture will replace this live acceptance boundary.

The outstanding release work is successful live direct adoption and a standards
update from actual public `v1.0.0` to `v1.1.0`, keeping CLI/source/profile fixed,
on macOS and Linux. A standards-update inspection requires its own confirmation.
No additional repository or npm version is needed. Parent #1 remains unchanged.

## Review and queued continuation

Both requested GPT 5.6 Terra/high reviewers found no remaining standards or spec
evidence findings. No production code changed in this continuation.

The already-confirmed live starts are queued locally in
`/tmp/repo-standards-issue11-queued-live.mjs` for 2026-09-10T15:42:50Z, with log
`/tmp/repo-standards-issue11-evidence/queued-live.log`. The process checks the
available unauthenticated quota before each sequential OS attempt and calls
ordinary `start` with the same explicitly confirmed identity. `start` performs
its own fresh inspection and rejects changed inputs before mutation; no new
selection is auto-approved. The queue stops on any unexpected outcome and does
not automate contextual edits or assessments. It has not completed at the time
of this evidence commit; its later reports must be reviewed separately.
