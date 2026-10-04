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
- [Amend scope without redefining installed ownership](0004-amend-scope-without-redefining-installed-ownership.md):
  superseded by ADR 0009; an active run accepted confirmed additions to its
  discovered scope while keeping its selection and installed expectations.
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
- [Replace tracked content; block only untracked](0010-replace-tracked-content-block-only-untracked.md):
  the product replaces or removes tracked content at any installation target,
  lists each overwrite that discards edits in the confirmed inspection, and
  blocks only untracked content.
- [Retain only the current run](0011-retain-only-the-current-run.md):
  committed state and scope evidence hold the current run only, with its scope
  change against the previous run, so they do not grow from run to run.
- [Bind content, not location](0012-bind-content-not-location.md):
  identities and committed evidence bind the content a run reads, never the
  project root or another machine-local location; the run records the project
  root for provenance only.
- [Expose installed skills through skill links](0013-expose-installed-skills-through-skill-links.md):
  each installed skill stays in `.agents/skills`, and a product-owned link
  exposes it at `.claude/skills` for Claude Code.
- [Leave available updates to the maintainer](0014-leave-available-updates-to-the-maintainer.md):
  a product system skill reports available updates, and no standards source
  routes them; the agent starts an update only on the maintainer's instruction.
- [Leave delivery to standards sources](0015-leave-delivery-to-standards-sources.md):
  there is no product-owned `deliver` skill; a source that defines a
  contribution workflow ships its own, and the product offers on-demand checks.
- [Keep edited content that leaves the selection](0016-keep-edited-content-that-leaves-the-selection.md):
  an update removes a target that leaves the selection only when it matches its
  installed baseline; an edited one stays and becomes project-owned.
