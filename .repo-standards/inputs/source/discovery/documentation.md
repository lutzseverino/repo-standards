# Discover documentation scope

Inspect every existing documentation root, documentation link, domain glossary,
context map, and project-specific agent guidance. Identify the individual files
needed to categorize documentation under usage, development, adr, and agents;
provide a short README for each populated documentation directory; keep the
root documentation map and the required `docs/development/README.md`; preserve
useful material; and repair links affected by any move.

Propose individual paths for every existing source, intended destination,
directory README introduction, glossary or context map that needs work,
`docs/agents/project.md` when repository-specific constraints require it, and
file whose links need repair. For a missing file, provide absence evidence plus
positive evidence for its owning topic or Project. Record each relevant
candidate as included or excluded with a reason, explain complete coverage, and
disclose unresolved questions.

Represent each applicable documentation root with its root `README.md` path and
the `README.md` path of at least one directly nested usage, development, adr, or
agents category when that root has content. This lets the read-only operation
distinguish a root at an arbitrary location from an ordinary nested directory
index. If the confirmed individual paths cannot make that distinction, leave
the root question unresolved rather than guessing that structural coverage is
complete.

Do not propose directory trees or globs. Keep the exact-owned shared files
`docs/agents/README.md`, `docs/agents/domain.md`,
`docs/agents/issue-tracker.md`, and `docs/agents/triage-labels.md` outside this
scope. Keep all other declarations' paths disjoint. A move requires authority
for its source, destination, and affected link repairs.
