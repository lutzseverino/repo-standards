# Issue tracker

Work is tracked in GitHub Issues. Infer the repository from the Git remote and
use authenticated `gh` operations. Resolve ambiguous remotes before making a
change. GitHub shares issue and PR numbers; identify the artifact before acting.

## Reading and writing

Read the complete issue body, comments, labels, relevant parent specification,
and blockers. When reviewing a PR, also read its description and diff.
For multiline issue, PR, and comment bodies, write the exact text to a file and
pass it with `--body-file`.

Use the repository's issue and PR templates for the corresponding artifact.
Follow the title and commit rules in `CONTRIBUTING.md`. Specifications and
implementation tickets live in GitHub; local documents retain durable domain
language, decisions, usage guidance, and development knowledge.

## Implementation contracts

For directly authored specifications and tickets, the issue body carries the
implementation contract. For triaged requests, the latest Agent Brief comment
is the candidate contract; the intake body and discussion remain context.
Read the whole conversation and clarify contradictions before implementation.

Keep the upstream Agent Brief structure: Category, Summary, Current behavior,
Desired behavior, Key interfaces, Acceptance criteria, and Out of scope. Include
the upstream AI-generation preamble for a triage-generated brief.

The latest brief becomes ready only after a maintainer or explicitly authorized
triaging agent reviews it and applies the applicable readiness state. Editing
or replacing it invalidates readiness and requires renewed review. A structural
check cannot authorize an agent or approve the meaning of a contract.

The issue-contract workflow publishes the current contract revision in its one
maintained feedback comment. A revision is a SHA-256 association over the
selected contract kind, exact source bytes and source identity, and the source
edit revision. The comment also records the latest observed readiness-label
transition, or the exact GitHub issue-event ID and actor that approved the
revision. Native parent and blocker relationships remain review context rather
than part of the body or Brief revision; changing an explicit relationship in
the contract source changes its exact bytes. An unedited direct specification or
ticket created with exactly one readiness label can be associated from its
authoritative creation snapshot. For every later review and for every Agent
Brief, wait for the exact revision notice before applying readiness. Later
readiness changes use the complete authoritative label-event timeline. Removing
and re-adding readiness always creates a new review event, and delayed or
repeated workflows preserve only the latest event's association.

Applying `ready-for-agent` or `ready-for-human` is the review action. The actor
must currently have the repository `admin`, `maintain`, or `triage` role. The
triage role is the explicit authorization for a triaging agent. Names, author
associations, bot identity, headings, preambles, and structural success do not
grant authority. On a triaged request, apply the new readiness label directly;
the workflow removes the previous nonterminal workflow state after it verifies
the review. Wayfinder planning issues do not use readiness labels; their
eligibility continues to use open state, assignment, and blockers.

Incomplete or changed contracts lose readiness. Automation maintains one
actionable feedback comment and returns corrected work to review rather than
automatically declaring it ready. Use [triage labels](triage-labels.md) for the
shared states.

Direct specifications and implementation tickets produced after review by
`to-spec` or `to-tickets` keep their native issue-body contracts and readiness
labels. They do not require intake triage, an Agent Brief, or triage category
labels. A specified ticket can be ready while its implementation blockers
remain open; those blockers still prevent starting work.

## Dependencies and planning

Use GitHub's native parent/sub-issue relationships and blocking dependencies
when available. Native dependencies use the blocker's database ID; distinguish
it from the visible issue number. When these interfaces are unavailable, keep
explicit parent and blocker links in the issue body.

Before implementing a ticket, confirm its blockers are complete. A readiness
label alone does not start work or bypass dependencies.

For Wayfinder, retain its map and child-ticket formats. Link children to their
map, preserve the relevant planning labels, and follow the skill's frontier,
claiming, and resolution procedure. The four public intake/ticket templates do
not replace the formats of the installed planning workflow.

## Pull requests

**PRs as a request surface: no.** External PRs are reviewed as proposed changes;
they do not automatically enter issue triage as feature requests.

Keep PRs focused, report actual validation, and link their implementation issue
or explain an eligible small correction. Mark breaking changes with `!` in the
title and explain impact and migration in the body. Squash into the default
branch using the PR title and description, preserving those explanations and
issue references.
