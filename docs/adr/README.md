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
  agents propose evidence-backed file paths from author discovery guidance;
  amended by ADR 0017, adopters review the proposal with the inspection and no
  longer confirm it; superseded in part by ADR 0019, which allows discovery
  scripts; amended by ADR 0024, an update reuses a scope whose discovery
  evidence is unchanged.
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
  and retired formats are not read; amended by ADR 0024, an update also reads
  the previous release's durable state and scope evidence.
- [Bind confirmation identity to what the run reads](0008-bind-confirmation-identity-to-what-the-run-reads.md):
  confirmation binds the content a run reads rather than Git HEAD, the index,
  or status.
- [Correct scope by adopting again, not by amending a run](0009-correct-scope-by-adopting-again.md):
  a mistaken confirmed scope is corrected by a new run with a new scope;
  amended by ADR 0022, that run replaces the stopped one in place instead of
  needing it abandoned and resolved by hand.
- [Replace tracked content; block only untracked](0010-replace-tracked-content-block-only-untracked.md):
  the product replaces or removes tracked content at any installation target,
  lists each overwrite that discards edits in the inspection, and
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
  routes them; the agent starts an update only on the maintainer's instruction;
  superseded by ADR 0026 for adopters who opt in to the update action.
- [Leave delivery to standards sources](0015-leave-delivery-to-standards-sources.md):
  there is no product-owned `deliver` skill; a source that defines a
  contribution workflow ships its own, and the product offers on-demand checks.
- [Keep edited content that leaves the selection](0016-keep-edited-content-that-leaves-the-selection.md):
  an update removes a target that leaves the selection only when it matches its
  installed baseline; an edited one stays and becomes project-owned.
- [Confirm only confirmation-required changes](0017-confirm-only-confirmation-required-changes.md):
  asking to adopt is the maintainer's consent; `start` requires confirmation
  only when the inspection reports discarded edits, and a fix's overwrite of a
  chosen setting is confirmed through `resume --confirmed`.
- [Add a private Astro site workspace](0018-add-a-private-astro-site-workspace.md):
  a static website shares repository tooling and deploys independently to
  GitHub Pages from `main`.
- [Run declared discovery scripts read-only during inspection](0019-run-declared-discovery-scripts-read-only.md):
  a discovery declaration may name a script, declared and bounded like a check,
  that inspection runs in a copy of the project to draft a scope proposal and
  its open questions; it never decides scope.
- [Read repository-wide rules at the start of any work](0020-read-repository-wide-rules-at-the-start-of-work.md):
  the `repository-standards` skill runs `rules` with no path at the start of
  any work, so rules that govern work changing no file reach the agent.
- [Let agents decide what Git can undo](0021-let-agents-decide-what-git-can-undo.md):
  agents decide reversible adoption choices and confirm discarded edits after
  review; remote setting overwrites remain the maintainer's decision; amended
  by ADR 0024, an update reuses a remote setup deferral while its probe still
  reports it not ready.
- [Replace a stopped run in place](0022-replace-a-stopped-run-in-place.md):
  a changed scope answer, or adopting after abandonment, starts a new run over
  the stopped run's recorded changes, whose change set covers both; a declined
  overwrite defers its fix, and abandonment exits 0.
- [Let an optional discovery declaration have no scope](0023-let-an-optional-discovery-declaration-have-no-scope.md):
  an author marks a discovery declaration optional, and a scope proposal may
  then give it no scope, which installs none of its rules and runs none of its
  operations while both scope reviews still judge it.
- [Reuse recorded answers that are provably unchanged](0024-reuse-recorded-answers-that-are-provably-unchanged.md):
  an update gives a recorded scope answer, remote setup deferral or assessment
  again without asking when what it was about is unchanged, proposes the rest
  for review, never replays a confirmation, and records every reused answer.
- [Start when nothing is open](0025-start-when-nothing-is-open.md):
  `adopt` starts the run in the invocation whose fresh inspection needs no
  confirmation, has no blocker, and leaves no question open, binding the
  identity it computed; a terminal still asks first.
- [Propose updates through one rolling pull request for adopters who opt in](0026-propose-updates-through-one-rolling-pull-request.md):
  a published GitHub action, installed by the adopter's caller workflow, runs
  the newest CLI's headless update and keeps one rolling pull request or issue
  current; the CLI still never commits.
- [Choose the platform inside each profile](0027-choose-the-platform-inside-each-profile.md):
  a profile declares the hosting platforms it supports and its
  platform-specific declarations, the project selects its platform separately
  as part of the selection, and release-source reads go through Postern.
- [Keep generated shadcn source read-only](0028-keep-generated-shadcn-source-read-only.md):
  the website's shadcn components are pinned registry output guarded by
  checksums, pages import them through `components/app/`, and shared styling
  targets their `data-slot` instead of editing them.
- [Leave archived run/v6 reports unread](0029-leave-archived-run-v6-reports-unread.md):
  run reports CLI 9.0.0 archived in Git's directory are skipped by every reader,
  never moved or converted, so they no longer block an update.
- [Localize the website through MessageFormat 2 catalogs](0030-localize-the-site-through-mf2-catalogs.md):
  the site's strings are MF2 messages in per-area catalogs and per-locale prose
  behind one `format()`, with no runtime fallback, a parity and staleness check,
  English at the root and other locales under their own prefix, while agent
  surfaces, the CLI and `/docs/` stay English.
