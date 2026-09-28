# Documentation guidance

Use categories under each applicable documentation root:

- usage: using, configuring, and integrating the product.
- development: building, testing, architecture, and maintenance.
- adr: consequential decisions and their rationale.
- agents: agent workflow configuration.

Create categories only when they have content. Put durable research findings
with their usage or development topic. Keep domain glossaries at the repository
or context root and use `CONTEXT-MAP.md` only when multiple domain contexts
actually exist.

Every documentation directory has a README that is its index. The README
starts with a one-sentence purpose, followed by one `[Title](path): description`
list item per entry: each other document in the directory and each
subdirectory's README. The root documentation README's entries are the category
READMEs, and their descriptions state what belongs in each category. Every
document under a documentation root is listed in exactly one index: its
directory's README, or for a directory README, its parent's. Other documents
link to that index or cite a document in context, and never repeat the list.
The exact shared `docs/agents/README.md` stays as installed; it cites the
optional `docs/agents/project.md` in context instead of listing it.

The root `docs/development/README.md` is required because the shared
`CONTRIBUTING.md` links to it. It gives its purpose, then a Setup and
validation section, then its index. Setup and validation states the project's
real prerequisites, setup, development commands, and required validation, or
links the development documents that contain them.

Documentation holds maintained material only, kept current with the project. A
point-in-time record, an account of one release, adoption, validation run, or
exercise as it stood when that event happened, stays with the pull request,
release, or CI run it records: an adoption or update pull request carries the
tool's summary, a release carries its notes and any machine-readable records as
release assets, and bulk raw output remains a CI artifact. CI artifacts expire,
so base each conclusion on a lasting record, such as a pull request summary or
a release asset. There is no evidence documentation category. Maintained
documents cite a record by its identity, such as a tag, run ID, or commit
permalink. Remove records already committed to the documentation;
Git history retains them, and a maintained document that still needs one cites
its commit permalink.

Preserve useful, current documentation when reorganizing it. Update affected
links and account for both old and new paths. Delete a superseded maintained
document rather than keeping it under a historical label, and repair the links
to it. Preserve exact shared agent configuration. Project-specific agent
constraints belong in optional `docs/agents/project.md`.

Assess documents against their actual audience and topic. Mechanical checks
cover categories, directory READMEs, required entry points, and local link
targets. They do not prove correctness or usefulness, and they do not check
index format, that each document has one index, or where records are kept.

Use the associated v2 discovery guidance to propose every existing
documentation file, glossary, and index, plus new and link-repair paths.
Review the evidence, candidate decisions, unresolved questions, complete
coverage, and concrete paths in the full inspection before confirming any
write. Keep exact shared agent configuration outside this scope. Scope that
omits a file grants no authority to change it, and a confirmed scope does not
change during a run. When a run needs a file outside its scope, do not write
that file: submit the blocked scope review, abandon the run, resolve its
changes, and adopt again with a fresh discovery proposal that includes the
file. After a complete adoption, the next update's fresh discovery covers it.
