# Review complete profiles

Use this branch when the author confirms meaningful differences between working
contexts. Review concrete content before translating it into declarations.

For each difference, show the shared draft and the proposed alternative side by
side, with an example of a project in each context and the practical trade-off.
Ask whether ambiguous wording means identical content or shared intent: for
example, “the same contribution instructions” might mean a source-owned complete
`CONTRIBUTING.md`, or project-owned instructions describing each project's actual
workflow. Show the exact file or the contextual guidance and its target so the
author can decide without knowing the format. Ownership itself can differ by
context; confirm that choice as well as the wording.

Map accepted choices to a small selection table: declaration ID, shared default,
and the complete result for each profile. Place common declarations in defaults.
Where a shared starting declaration has accepted exceptions, keep it in defaults
and express those exceptions in profiles. Use stable IDs for the same intent:

- Omit an ID to inherit its entire default declaration.
- Repeat its ID with a complete declaration to replace it. Restate the kind,
  target/scope, content or guidance reference, and any accepted operations that
  should remain. No field, check, or fix is inherited from the replaced unit.
- Use only `exclude: true` at that ID to remove the default and its operations
  from that profile's governance. Exclusion does not delete project content.
- Add a new ID for an accepted intent specific to that profile. A renamed ID
  means retirement plus addition, not a variation of the same declaration.

Profiles resolve independently from defaults. One profile cannot inherit from
another; there are no chains, field merges, or extra schema levels. Use only the
mechanisms the accepted differences need; never invent a policy to demonstrate
all four. Each profile is the complete selection an adopting project chooses,
not a partial set to combine with another profile.

Review the table with the author alongside the complete source and notes. Trace
every differing cell to an accepted draft and rationale, including exclusions
and ownership changes. If no meaningful differences remain accepted, keep a
single profile and record the non-decisions without generating policy.

During final all-profile CLI validation, compare the resolved output against
that reviewed table: inherited declarations match the default in full,
replacements contain only their own fields and operations, excluded IDs are
absent, and added IDs appear only in the intended profiles. Return discrepancies
that change meaning to author review; retain the complete output as evidence.
