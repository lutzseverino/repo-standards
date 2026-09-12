# Authoring 1.1.0 release candidate — issue #31

This run prepares the feature for review; **public delivery is blocked**. No
1.1.0 publication, successful published acquisition, or delivered-skill agent
acceptance is claimed. Dates in raw evidence use UTC (2026-09-11); this directory
uses the evaluator's local date (Europe/Madrid, 2026-09-12).

## Identities and installation

The candidate was built from `f52fcd13646e18ca9d4b3c96a4e9bc4cf038754e`;
[candidate-bundle.json](candidate-bundle.json) records the exact 1.1.0 tarball
integrity. The separately packed [CI bundle](ci-bundle.json) has different
archive integrity because of file permissions: [comparison](bundle-comparison.json)
confirms identical paths, file bytes, and executable states, with only other
permission bits differing. These remain distinct artifacts.
[candidate-installation.json](candidate-installation.json) records
`skills@1.5.25`, all installed resource hashes, command output, Node 24.11.1,
npm 11.19.0, and Linux arm64 kernel `6.18.34+rpt-rpi-v8`.

The conventional installer copied only the skill into an isolated global home;
the local installation input was then removed, leaving an empty workspace.
A separate external npm installation used the packed 1.1.0 candidate with
`--ignore-scripts`. This is candidate skill and candidate CLI evidence. It is
neither public acquisition nor a native desktop-agent integration.

The [public acquisition attempt](public-acquisition-blocked.json) failed because
`v1.1.0` was not published. The public mode saved exact command/exit evidence
without substituting a local input. A separate
[missing npm exercise](missing-npm.json) verifies failed setup still writes
evidence when the executable cannot be found.

## Third-party discovery observation

At 2026-09-11 22:21 UTC, the direct skills.sh URL returned HTTP 200 with a title
naming `author-standards`, but the visible page rendered 404/unavailable content.
The `skills@1.5.25 find author-standards` command succeeded but omitted this skill
from its results. [discovery.json](discovery.json) preserves the requests,
status, interpretation and search output. No successful listing or ranking was
observed. Acceptance disabled installer telemetry; these observations do not
establish that telemetry-driven indexing was requested or will occur.

## Fresh agent evidence

A fresh agent received only the installed skill, empty workspace, opening author
request, and explicit candidate CLI location. The evaluator played a synthetic
author through live turns; this is not a human usability study. Conversation and
resulting source evidence are retained separately from authoring notes. Additional
fresh agents cover no confirmed standards and returning-author work.

The [creation conversation](creation/conversation.md) retained live choices,
recommendations, refinement and final acceptance. The
[complete reviewed source](creation/full-source-review.md) and
[source files](creation/source/) express exact shared editor configuration,
personal README/contribution guidance, a full service README replacement,
contribution exclusion, and service runbook addition. No indent-size, framework,
semicolon, CI, or general review policy was inferred. Defaults and both resolved
profiles passed [final validation](creation/validation-final.json).

The [operation evidence](creation/operations.json) records 36 real direct-protocol
invocations across both profiles, with failed/passing read-only checks, changed
and repeated unchanged fixes, empty existing files, missing files, scope errors,
symlinks and nonregular targets. Four empty-PATH Node probes blocked affected
execution without installing anything. Before/after inventories include bytes
and modes and preserve unrelated/employer material. The author accepted these
behaviors and Node prerequisites before inclusion. The generated ordinary-work
skill received content review; its agent usefulness and command correctness
remain unverified by explicit author acceptance. Concurrent writers, permission
failures, and operation execution on other operating systems remain untested.
[Completion evidence](creation/completion-evidence.json) records final acceptance,
unchanged reviewed bytes/modes, all-profile validity and the local boundary.

The separate [revision conversation](revision/conversation.md) began with an
ambiguous README change. The fresh agent surfaced both current profile rules and
asked for scope before editing. After the author selected only `personal-tools`,
the [diff](revision/evidence/final.diff) changed only its guidance and matching
notes; [preservation evidence](revision/evidence/preservation.json) verifies
unchanged team material, unrelated files and `scratch.txt`. The author reviewed
and accepted the entire resulting source, followed by
[final validation](revision/evidence/accepted-validation.json). These local sources
had no Git checkout; HEAD/index preservation was not applicable.

A further fresh agent resumed after an evaluator's
[manual runbook edit](resumption/manual-edit.diff). The
[resumption conversation](resumption/conversation.md) surfaced the disagreement
with both the old notes and profile description before editing. The author
confirmed that the new on-call/escalation guidance deliberately retired the
restart rule. The [agent diff](resumption/evidence/source.diff) reconciles only
the notes and profile description; the manual guidance, unrelated material and
scratch file remain unchanged. The author accepted the whole source and limits,
and [validation](resumption/evidence/accepted-validation.json) passed both profiles.
Notes contain concise policy decisions, not interview transcripts. No deferred
question became new policy, and no provisioning, commit, publication, or adoption
occurred in any authoring workspace.

The [no-standards conversation](no-standards-conversation.md) produced only
[notes](no-standards/authoring-notes.md). No `standards.yaml`, validation claim,
Git repository, publication, or adoption was created.

## Validation and review

The installed-package release test first failed on the old 1.0.1 CLI acquisition
pin after selecting version 1.1.0. Updating the guide made both release tests
pass. Typechecking passed again after improving failure evidence. The existing [release workflow](https://github.com/lutzseverino/repo-standards/actions/runs/34653583774)
passed its full validation matrix at `f52fcd1`: Ubuntu 24.04.5 passed all 380 tests;
macOS 26.6.2 arm64 passed 379 with one existing case-sensitive-filesystem test
skipped. Both used Node 24.11.1 and pnpm 11.20.0. The subsequent
[validation workflow](https://github.com/lutzseverino/repo-standards/actions/runs/34653688439)
also passed both operating systems at `f3e8372`. Step output is preserved in
[Linux](validate-linux.txt) and [macOS](validate-macos.txt), with ANSI styling and
trailing whitespace removed. The separate local Linux arm64 full-suite outcome is recorded in the
[PR validation summary](https://github.com/lutzseverino/repo-standards/pull/37).

Reservation, exact runtime/skill pins, ownership/integrity, independent updates,
and explicit absence of automatic authoring-skill installation ran as part of
these existing installed-CLI tests. They remain deterministic regression evidence,
separate from the Linux-only fresh agent journeys.

The release reached its publication job after both matrix checks passed and the
bundle hashes verified. It failed at `npm whoami` with `ENEEDAUTH`: `NPM_TOKEN`
was unavailable. `npm publish` and GitHub release creation were not reached;
public-installation jobs were skipped. See [failure output](publication-failure.txt)
and [workflow/job metadata](release-workflow.json). To complete #31, configure the
package-scoped credential in GitHub's `npm` environment, dispatch the existing
Release workflow at the reviewed final commit for 1.1.0, retain both OS public
acquisition results, then repeat fresh creation/revision/resumption using that
publicly installed skill. Keep discovery observations dated even if listing
remains unavailable.

Two independent agents reviewed `main...f52fcd1` using the code-review skill:

- Standards: no hard violations; one optional suggestion to share acceptance
  command/acquisition helpers. The npm failure-evidence edge case was fixed and
  manually verified at `f3e8372`.
- Spec: no implementation defects or scope creep; public delivery and fresh
  delivered-feature/platform evidence remained acceptance gaps.

The [coverage map](../../../authoring-release-coverage.md) maps all twelve parent
Testing Decisions, distinguishing deterministic, candidate, published,
real-agent, and third-party evidence. Issue #31 remains open while release gates
are incomplete.

## Replay the recorded operation exercises

The original harness and its draft validation input are retained unchanged.
With Node.js 24 on Linux, reconstruct their working layout in a disposable
external directory. From the product checkout:

```sh
author_evidence_dir="$PWD/acceptance/results/2026-09-12/authoring-release/creation"
author_replay_dir="$(mktemp -d)"
mkdir "$author_replay_dir/evidence"
cp -R "$author_evidence_dir/source" "$author_replay_dir/local-standards"
cp "$author_evidence_dir/exercise.mjs" "$author_evidence_dir/validation-draft.json" \
  "$author_replay_dir/evidence/"
(cd "$author_replay_dir" && node evidence/exercise.mjs)
```

This exercises the already-generated operations and writes a new `operations.json`
in the disposable evidence directory. It is deterministic replay, not a fresh
agent journey. The original recorded outputs remain unchanged. Final evidence
review identified the missing draft input; retaining it and replaying this layout
resolved that finding.
