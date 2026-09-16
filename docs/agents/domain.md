# Domain documentation

Before exploring or changing code, terminology, or architecture, read the root
`CONTEXT.md`. If `CONTEXT-MAP.md` exists, use it to find the contexts relevant
to the work and read their glossaries.

Read applicable decisions under `docs/adr/` and any relevant context-local ADR
directories identified by the domain layout. Use the glossary's canonical
terms in issues, code, tests, and explanations. Surface contradictions with
existing decisions explicitly.

Missing glossaries or ADRs are normal. Domain modeling creates them when terms
or consequential decisions are resolved. A monorepo does not by itself imply
multiple domain contexts.

Documentation categories are `usage`, `development`, `adr`, and `agents` under
each applicable documentation root. Create a directory when it has content and
include a short README describing its purpose and linking useful contents.
Keep durable research with its usage or development topic. Glossaries remain
outside `docs`, at the repository or context root.
