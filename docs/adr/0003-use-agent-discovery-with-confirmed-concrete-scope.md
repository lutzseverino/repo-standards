# Use agent discovery with confirmed concrete scope

Status: superseded in part by
[ADR 0019](0019-run-declared-discovery-scripts-read-only.md), which replaces
the exclusion of author-executed discovery hooks with read-only discovery
scripts.

Authors need contextual standards that apply across unfamiliar project layouts,
but maintained-project membership is a semantic judgment. Authors therefore
provide discovery guidance, agents propose evidence-backed concrete scope, and
adopters confirm it together with the complete adoption inspection; the CLI
verifies structure, path safety, ownership conflicts, and freshness. Discovery
materializes individual file paths using the existing disjoint target model.
This deliberately avoids a product-specific classifier and author-executed discovery hooks at the
cost of requiring reviewed agent judgment before adoption.

Decision confirmed in the contextual-scope interview and final simplicity review.
Planning destination filenames before confirmation avoids adding a protected
directory language while retaining location-independent coverage.

[ADR 0017](0017-confirm-only-confirmation-required-changes.md) amends this
decision: adopters no longer confirm a scope proposal. A proposal is reviewed
with the inspection, and the run waits for the maintainer only for a
confirmation-required change.

[ADR 0024](0024-reuse-recorded-answers-that-are-provably-unchanged.md) amends
the fresh scope of every update: an update reuses a recorded scope answer
whose discovery guidance, rules and fresh draft are unchanged and whose paths
still exist, and proposes any other recorded answer for review.
