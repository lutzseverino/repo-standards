# Correctness and simplicity review

Status: both simplifications below and their trade-offs were accepted after
the final review. They supersede the conflicting earlier interview choices.
The simplified design is endorsed and the user requested to-spec. Ticket
planning is explicitly outside scope.

## Judgment

The core design addresses the required product features. At review I did not
endorse the broader draft as the simplest sufficient design. I had recommended general
protected-directory scope and shrinking active scope too readily, before
comparing them with a solution that resolves discovery to existing explicit
file targets. The added capabilities are useful, but the original Repo Canon
requirements do not require them.

Keep semantic discovery in the agent, source-owned criteria, deterministic
path verification, one complete confirmation, snapshot freshness, existing
exact/reserved protections, source/profile invariants, and deliberate re-adoption.
Keep the distinction between product support and unfinished Repo Canon scripts,
workflow automation, and skill/source authorship.

## Required features versus a smaller scope representation

| Required outcome | Discovery resolving to individual file paths |
| --- | --- |
| Find maintained projects at unfamiliar locations | Agent applies the same semantic criteria and proposes each project README |
| Create missing READMEs | Explicit target paths may be absent before adoption |
| Exclude fixtures, generated output, and organizational directories | Proposal records exclusions and their reasons; no filenames are inferred from folder conventions alone |
| Reorganize arbitrary old documentation | Enumerate old source files, intended destination filenames, directory READMEs, and affected link-repair files before confirmation |
| Preserve exact configuration inside docs | Omit exact files from contextual scope and reject accidental overlap using existing validation |
| Account for moves | Existing deletion-plus-creation evidence accounts for both paths |
| Reject unconfirmed writes | Existing observed-path membership applies to the confirmed file list |
| Apply standards after a repository gains projects | Explicit same-pin re-adoption refreshes discovery |

This keeps location-independent coverage. It changes when filenames must be
chosen: discovery must plan destinations and link repairs before editing.
Another destination requires additional confirmation. Large migrations have
longer proposals; the CLI can group them for review without granting an entire
directory. Operations must use confirmed filenames rather than inventing new
ones under broad directory authority.

Existing source-authored directory targets can retain their current disjoint
behavior. The new discovery capability can return only individual file paths.
That avoids introducing authored protect syntax, contextual directory subtraction,
protected-subtree partitioning between declarations, and protection-aware
operation inputs solely to solve these requirements. Exact/reserved collisions
remain errors rather than a new subtractive ownership language.

The accepted simplification revises Q4–Q5, Q10, Q16–Q19, and Q24 where they introduce new directory
and protection behavior. It does not silently preserve the later promise to
observe all ignored siblings throughout an enclosing tree: unlisted ignored
content retains the existing observation limitation. Named targets and their
ancestors still require safety checks, and the original exact-owned inventories
remain protected. Retain freshness binding to the eligible project snapshot and
relevant ignore inputs; do not claim that trusted scripts are sandboxed.

## Narrow the active-run recovery capability

Keep a confirmed path for scope expansion during an active run: abandonment
does not supply an automatic clean restart, so removing recovery entirely is
not an equivalent simplification. However, supporting expansion, narrowing,
historical ownership changes, fix replay, interruption, and stale evidence at
once adds substantial state-machine work.

The accepted design permits additions only, monotonically per declaration.
No path moves between declarations and previously authorized targets remain
authorized for the run. Validate all observed changes against the outgoing
scope before accepting additions, persist that validation and the new revision
together, replay repeat-safe fixes, and require fresh assessment/checks.

This still needs durable confirmation records and separate fix/agent observation
intervals. A single final scope union is insufficient: it would retroactively
authorize earlier writes. A single resettable post-fix baseline is also
insufficient: replayed fixes can erase evidence of earlier agent work.

The real cost of expansion-only scope is that it cannot revoke or transfer a
mistaken target after adoption starts. If correct completion requires withdrawing
that target, the run must remain incomplete and use explicit reconciliation;
do not silently claim accurate final governance. Scope can be recomputed freely
before initial confirmation or on a later clean re-adoption. The user explicitly
accepted this limitation, superseding narrowing in Q15/Q21/Q26.

## Correctness constraints that must survive simplification

- Validate earlier writes against the old scope before any expansion; never
  validate an entire run only against its final union of targets.
- Keep fix and agent evidence separate across retries and scope changes. Do
  not reset a baseline in a way that makes earlier work disappear.
- Retain exact baselines, HEAD/index invariants, process-outcome checks, and
  explicit confirmation of current state during active-run continuation.
- Bind relevant observation settings and ignore inputs at confirmation points.
  Clarify expected adoption changes versus external drift during execution;
  the pre-start snapshot cannot remain byte-identical after authorized writes.
- Retain semantic scope validation after fixes and during assessment. Valid
  path evidence does not prove that fixtures were correctly classified.
- Specify source and protocol version changes only where the resulting public
  contracts actually differ. Sharing the existing normalized target model is
  preferable to maintaining two independent execution engines.

## Evidence and limits

This is a design/code review, not a test of implemented discovery. The original
requirements are in the Repo Canon scope-capability specification and adoption
compatibility audit. Product evidence: src/paths.ts already rejects overlapping
exact/contextual targets; src/model.ts represents explicit repository paths;
src/assessment.ts already accepts absent targets and accounts for creations and
deletions through snapshots. src/adoption.ts currently maintains one contextual
baseline, which cannot by itself implement historical amendment accounting.

An independent factual review checked both smaller alternatives against those
original scenarios and identified the planning and recovery limitations above.
At review time, no product implementation, publication, or new runtime validation
had been performed. After the user accepted the simplifications, to-spec published
[the final specification as issue #41](https://github.com/lutzseverino/repo-standards/issues/41).
No implementation or new runtime validation accompanied publication.
