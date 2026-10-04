# Leave available updates to the maintainer

What to do with an available update was left to the adopted standards'
own guidance. One standards source therefore made every contextual update a
separate tracked work item, and almost every release of that source was
contextual. An update with no agent work still became planned work, against
the intent that updates never block and add no churn.

The product now owns the update notice: a model-invocable system skill
that runs `outdated`, reinstalls the pinned runtime when it reports
`CLI_PIN_MISMATCH`, and tells the agent which updates are available. The notice
states availability only. Without a maintainer's instruction, the agent mentions
the update and continues its current work. Once the maintainer asks for the
update, the agent carries it as a change separate from that work. No standards
source routes updates, and `updateClass` stays in the inspection report as
information for the reviewer, not as a routing input.

## Considered options

- **Leave the notice to standards sources.** Each source would repeat it, and
  its rules would govern product behavior.
- **A section of `adopt-standards`.** That skill only runs when someone invokes
  it, so the notice would come only after someone had already chosen to update.
- **A session-start hook.** It would work in only one agent.
- **Start every available update by default.** Each update needs an inspection
  and the maintainer's confirmation, so the maintainer would review work they
  had not asked for.

## Consequences

A skill description is advisory: an agent may not invoke the notice, and an
agent without skill support never sees it. `outdated` stays the complete
interface for a maintainer who wants no agent involved.
