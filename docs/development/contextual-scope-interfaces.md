# Contextual scope interfaces

Status: final simplified design accepted after the correctness review.
The authoritative product specification is [issue #41](https://github.com/lutzseverino/repo-standards/issues/41),
with a [historical snapshot](contextual-scope-specification.md).
Earlier directory-subtraction and shrinking-scope proposals are superseded.
This record predates implementation. See [architecture](architecture.md),
[inspection](../usage/inspection.md), and [adoption](../usage/adoption.md) for implemented behavior
and remaining lifecycle work; the full intended interface below is not a claim
of current availability.

## Author format and target resolution

Introduce repo-standards/v2. Repository guidance retains its contextual guidance
reference and uses exactly one of explicit targets or a discovery-guidance
reference. Both guidance files are ordinary retained source files. Other
content forms, operations, and two-level profile resolution remain unchanged.

Discovery returns individual file paths only, including missing files. It does
not return directory write scopes or use authored protect fields. Existing
explicit directory targets retain their current disjoint behavior. Reject all
exact/contextual, contextual/contextual, reserved, ancestor, case-folded, and
Unicode-normalized target conflicts through the existing target rules. Observe
named targets and ancestors for symlinks, special files, and other unsafe state.

The source's resolved selection stays immutable. Repository state validates
project-specific proposals and materializes their targets into the existing
explicit-path representation used by execution. Operations receive concrete
paths without implementing discovery themselves.

## Proposal and confirmation

Use repo-standards/scope/v1 for the proposal. It binds to a CLI-issued discovery
request identity containing selection, action, eligible project snapshot,
relevant observation settings and consulted ignore inputs including absence,
and applicable active-run/scope revision.

A proposal contains exactly one entry per active discovery declaration. Each
entry includes concrete file paths, coverage explanation, candidate inclusion
and exclusion reasons, evidence references, and unresolved questions. Evidence
can identify observed files, directory inventories, or target absence; the CLI
derives observations. A missing project README also requires positive project
membership evidence. Empty scope requires evidence and retains operations.

Normalize unordered lists and reject duplicates. Rationale text remains bound
to confirmation. Invalid fields, targets, or evidence cannot authorize work;
unresolved questions produce an inspectable non-startable result. Semantic
correctness remains agent judgment reviewed by the adopter.

Without required scope, inspect returns the request and blocks start. Supply
--scope to inspect for the complete adoption report, and give start the same
proposal with --confirm. Proposal files remain outside the adopting project.
Initial start requires a clean committed project and all existing prerequisites.

Observation failures block rather than silently truncate. Named targets remain
observed even if their ignore classification changes; no new guarantee covers
all unlisted ignored siblings. Confirmations bind relevant ignore inputs without
retaining unrelated configuration or credentials. Runtime observations use the
current authorized phase and scope revision rather than requiring the entire
pre-start snapshot to remain unchanged after adoption writes.

## Addition-only amendments

Use inspect --amend-scope for read-only inspection of an active run, optionally
with --scope. Use resume --amend-scope with --scope and --confirm to accept the
proposal and continue execution. The active run supplies the immutable selection
and installed expectations. These actions are distinct from initial start.

Each discovered declaration's proposed paths must be a superset of its current
paths. Equality allows reconfirming current scope against fresh state. Removal,
transfer between declarations, explicit-target changes, or changes to selection,
guidance, and operations are rejected. Correcting a mistaken target that must be
withdrawn leaves the run incomplete with a reconciliation explanation. There is
no automatic restart promise after abandonment.

Amendments are eligible at contextual handoff or a later contextual/scope/check
block after operations have definite outcomes and installed integrity passes.
No author process may remain active. Preserve HEAD and index while binding the
run's current working changes to confirmation. Resolve uncertain work with the
existing explicit retry before amendment. Do not combine amendment confirmation
with --assessment or --retry in one invocation.

Validate earlier observed work against the outgoing scope before accepting
additions. Persist that validation together with the accepted scope revision
and confirmation. A final target union cannot substitute for these records.
Keep separate fix and agent observation intervals so replay does not erase
prior work or misattribute effects.

After acceptance, replay repeat-safe fixes on expanded targets, then require
fresh contextual assessment and checks. Scope must still be semantically valid
after fixes and in assessment; further file additions need fresh confirmation.
Exact installation expectations never change during amendment.

## Re-adoption and retention

Use inspect --readopt and start --readopt to explicitly re-adopt the current
retained selection. Include --scope for discovery declarations and --confirm
on start. Matching action flags ensure start reconstructs the same inspection.
Ordinary retained inspection remains read-only and non-startable.

Re-adoption and amendment flags are mutually exclusive. Re-adoption starts a new
clean run; it cannot change pins, source, or profile. It works for v1 explicit
selections and v2 sources. Recompute discovery freely between runs and report
scope additions/removals without deleting content whose governance ended.

Retain discovery guidance, accepted proposals and rationale, evidence references
and observation identities, concrete scope, confirmations, and attribution
records sufficient to explain earlier work. Retained inspection reports history;
re-adoption requires fresh discovery even when the original source is unavailable.

## Compatibility and protocols

Keep v1 author schemas and default execution behavior. v2 adds discovery and
per-fix observed scope enforcement, reusing existing target and execution logic.
Version inspection and assessment where their shapes change to carry discovery,
revision, or scope-validity evidence. Keep the existing operation-result format
and reuse operation-input format/targets when their shape is unchanged. No
protection-aware operation protocol or separate v2 execution engine is required.

Checks remain read-only and exact bytes, modes, and inventories stay immutable,
including against an exact declaration's own fix. Scripts remain trusted host
and network code; observed enforcement is not sandboxing or continuous monitoring.
