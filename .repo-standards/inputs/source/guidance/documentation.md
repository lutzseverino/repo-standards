# Documentation guidance

Bring the documentation in line with the documentation rules in
`CONTRIBUTING.md`. The categories hold:

- usage: using, configuring, and integrating the product.
- development: building, testing, architecture, and maintenance.
- adr: consequential decisions and their rationale.
- agents: agent workflow configuration.

In the root documentation README, each category README's description states
what belongs in that category.

The root usage index, `docs/usage/README.md`, is a newcomer entry document. Its
one-sentence purpose says what the project is and who it is for, before anything
else. It contains no term defined in the repository's root `GLOSSARY.md` or in a
context glossary listed in its `GLOSSARY-MAP.md`, matched case-insensitively as
a whole word; a hyphen-joined compound, such as `on-demand`, is one word. For a
standards source or
another tool applied to a repository, explain what adopting it changes. Define
a project-specific term before using it anywhere in this index, as in the
Repository README.

The root `docs/development/README.md` is required because `CONTRIBUTING.md`
links to it. Its Setup and validation section states the project's real
prerequisites, setup, development commands, and required validation, or links
the development documents that contain them.

Point-in-time records stay with their event, as `CONTRIBUTING.md` states. An
adoption or update pull request carries the tool's summary, a release carries
its notes and any machine-readable records as release assets, and bulk raw
output remains a CI artifact. CI artifacts expire, so base each conclusion on a
lasting record, such as a pull request summary or a release asset. There is no
evidence documentation category. Remove records already committed to the
documentation; Git history retains them, and a maintained document that still
needs one cites its commit permalink.

Preserve useful, current documentation when reorganizing it. Update affected
links and account for both old and new paths. Preserve exact shared agent
configuration. Project-specific agent constraints belong in optional
`docs/agents/project.md`.

During an update, rename existing `CONTEXT.md` and `CONTEXT-MAP.md` files to
`GLOSSARY.md` and `GLOSSARY-MAP.md`, including glossaries in each context.
Preserve their content and repair links and map entries to the renamed paths.
Include both source and destination paths in the contextual documentation scope
before the complete inspection. The updated conventions use the new names.

Assess documents against their actual audience and topic. Mechanical checks
cover categories, directory READMEs, required entry points, local link targets,
the index entry form, the root usage purpose's absence of glossary terms,
one index per document, the development guide's order,
and that every Markdown document under a documentation root is in the confirmed
scope unless another declaration, such as an exact file, owns it. They do not
prove correctness or usefulness, and they do not check where records are kept.
