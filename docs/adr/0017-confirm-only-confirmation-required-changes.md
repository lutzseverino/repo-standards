# Confirm only confirmation-required changes

Amends [ADR 0003](0003-use-agent-discovery-with-confirmed-concrete-scope.md)
and [ADR 0010](0010-replace-tracked-content-block-only-untracked.md).

Every adoption and update waited for the maintainer to confirm the exact
inspection identity, and a general request to adopt didn't count. For the
maintainer, choosing a standard and asking to adopt or update it is already
the consent. The ceremony added a step to every routine update and blocked
unattended adoption, while it protected against only two real harms:
discarding a person's work, and overwriting a setting someone chose.

An adoption now waits for the maintainer only when it makes a
confirmation-required change. Inspection reports deterministically whether the
run discards edits, with one reason per discarded edit, including at a first
adoption. `start` still binds to the inspection identity on every run, and it
requires the maintainer's confirmation exactly when the inspection reports
one: it refuses to proceed without it and rejects it otherwise, so the product
enforces the rule rather than the agent's judgment. Breaking releases, scope
proposals, removing retired product state and removing unedited installed
content proceed without confirmation. A fix that would overwrite a chosen
setting reports that it needs confirmation instead, because inspection runs no
source code and cannot see settings.

## Considered options

- **Keep confirming every inspection.** Every routine update would keep its
  ceremony, and an unattended adoption could never complete.
- **Let the agent judge when to ask.** Agents would ask by habit or not at
  all; the product could not enforce either.
- **Confirm breaking releases too.** A breaking release changes what the
  author owns, which the maintainer already chose by asking for the update.

## Consequences

Confirming is no longer a review step: an agent can complete a routine
adoption alone, and the maintainer reviews its uncommitted changes through the
project's normal workflow. The `--confirmed` flag always means the maintainer
confirmed reported changes, but the CLI still cannot verify that an agent asked.
