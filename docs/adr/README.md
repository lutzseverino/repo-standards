# Architecture decisions

This directory records the product decisions whose reversal has meaningful
cost, whose rationale would otherwise be surprising, and which involve real
alternatives.

- [Separate standards authorship from adoption execution](0001-separate-authorship-from-adoption.md):
  standards repositories supply profiles and content, while the product owns
  resolution and one adoption procedure for every author.
- [Finish authoring at a validated local standards source](0002-finish-authoring-at-a-validated-source.md):
  the authoring skill ends at a reviewed, validated local source and hands off
  publication and adoption.
- [Use agent discovery with confirmed concrete scope](0003-use-agent-discovery-with-confirmed-concrete-scope.md):
  agents propose evidence-backed file paths from author discovery guidance, and
  adopters confirm them with the inspection.
- [Retain work evidence as identities and deltas](0005-retain-work-evidence-as-identities-and-deltas.md):
  committed state keeps each work interval as observation identities and the
  delta between them.
- [Gate standards selection with the author range only](0006-gate-selection-with-the-author-range-only.md):
  the author's CLI range is checked only when a standards version is selected
  from its source.
- [Write and read one evidence format, as identities and deltas](0007-write-and-read-one-evidence-format.md):
  every report and record carries identities and deltas in exactly one format,
  and retired formats are not read.
- [Bind confirmation identity to what the run reads](0008-bind-confirmation-identity-to-what-the-run-reads.md):
  confirmation binds the content a run reads rather than Git HEAD, the index,
  or status.
- [Correct scope by adopting again, not by amending a run](0009-correct-scope-by-adopting-again.md):
  a mistaken confirmed scope is corrected by abandoning the run and adopting
  again with a new scope.
