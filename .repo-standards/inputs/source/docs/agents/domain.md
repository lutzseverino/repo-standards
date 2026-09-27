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
each applicable documentation root. Create a directory when it has content.
Every documentation directory has a README index: a one-sentence purpose, then
one `[Title](path): description` item per entry. List each document under a
documentation root in exactly one index: its directory's README, or for a
directory README, its parent's. Other documents link to that index or cite a
document in context, and never repeat the list. The installed
`docs/agents/README.md` stays as is and cites the optional
`docs/agents/project.md` in context. The root `docs/development/README.md`
gives its purpose, then a Setup and validation section, then its index. Keep
durable research with its usage or development topic. Glossaries remain outside
`docs`, at the repository or context root.

Documentation holds maintained material only. A point-in-time record, such as
an account of one release, adoption, or validation run, stays with the pull
request, release, or CI run it records, and documents cite it by identity, such
as a tag, run ID, or commit permalink. Delete a superseded document rather than
keeping it under a historical label, and repair the links to it.
