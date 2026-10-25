# Let agents decide what Git can undo

Amends [ADR 0017](0017-confirm-only-confirmation-required-changes.md) and the
maintainer touchpoints settled in [#307](https://github.com/lutzseverino/repo-standards/issues/307).
The first clean agent adoption required repeated maintainer answers for changes
Git could restore. On 2026-10-19, the owner chose less intervention because
adoption leaves its output uncommitted for review; [#311](https://github.com/lutzseverino/repo-standards/issues/311)
records the amended contract.

The CLI still owns all adopting-agent instructions. An agent chooses the
proposed newest stable version unless the request names another, chooses a
profile from descriptions, the request and repository evidence, and settles
scope membership from discovery guidance and project evidence with reasons.
Only an unsettled profile choice needs clarification. The agent reviews the
inspection and starts it without approval, summarizing the changes and trusted
script operations in its handoff. As amended by
[ADR 0025](0025-start-when-nothing-is-open.md), an inspection that requires no
confirmation starts with no answer, and the agent summarizes it afterwards. It reviews and confirms discarded edits,
listing each with its diff or current content in the handoff: the clean,
committed starting tree makes every discarded edit recoverable from Git.

The agent defers remote setup that is not ready, reporting why; this changes
nothing remotely, and every later run applies it once ready. As amended by
[ADR 0024](0024-reuse-recorded-answers-that-are-provably-unchanged.md), a
later update reuses the deferral without asking while the same probe still
reports it not ready. Interrupted or
incomplete runs retry repeat-safe operations without asking. Abandonment still
requires the maintainer's instruction. A contextual assessment remains blocked
when the project cannot supply the facts it needs. A fix's confirmation-required
remote overwrite still waits for the maintainer's decision, presenting each
setting's current and standard values: Git cannot restore that remote state.

## Consequences

The inspection, answers, reports and confirmation enforcement keep their formats
and behavior. For discarded edits, `--confirmed` now means the agent reviewed
and confirmed them; it no longer always means the maintainer confirmed.

Before a new run, project files stay unedited, including optional files implied
by answers; contextual work writes them after start. Git blockers still stop the
agent and notify the maintainer. Completion leaves reviewed changes uncommitted
and unstaged. Its ready-to-commit verdict describes those uncommitted changes
and is recorded before committing. If any recorded change-set path is absent
from Git's uncommitted changes, status reports not ready. An empty change set
satisfies the path condition, so a complete adoption without state errors can
remain ready after committing.

The README and skill remain single-sentence pointers. Their commands use
`npx --yes` and `adopt --json`, avoiding npm confirmation and explicitly selecting
the agent route even at a terminal. Human terminal questions stay human choices;
the terminal opening names the agent route.

## Considered options

- **Keep the previous touchpoints.** This preserves repeated approvals for
  changes the maintainer can already review and restore through Git.
- **Remove confirmation enforcement.** This would also remove the identity
  binding and protection for remote overwrites. Changing who answers preserves
  both while allowing unattended reversible work.
