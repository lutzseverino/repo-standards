# Leave delivery to standards sources

A product-owned `deliver` skill was considered: one skill, available in every
adopting project, that takes finished work through the project's contribution
workflow. The product does not know which part of a standards source is that
workflow. A product `deliver` would either restate the project's agent
instructions, or require the format to name a delivery document. In the second
case the product would define what delivery is and what a delivery document
holds, and every author would write to that definition. A system skill exposes
behavior that is shared across authors, and only one author defines a delivery
workflow.

Delivery stays with standards sources. A source that defines a contribution
workflow ships its own `deliver` as an author skill, with any configuration it
needs at paths it chooses. That skill can be specific about titles, commits,
validation and reviews. The product contributes only what is the same for every
author: `adopt-standards` ends with its changes uncommitted and its record
available, and a `check` command runs the adopted checks on demand so any
delivery skill can verify the work against the adopted standards.

Revisit this decision when a second, independent standards source defines its own
delivery workflow and both would gain from one shared skill. Reserving `deliver`
then renames the author skills that use that name.
