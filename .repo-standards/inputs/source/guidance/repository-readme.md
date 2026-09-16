# Repository README guidance

Target the adopting repository's top-level `README.md`. Preserve accurate,
useful project facts and write the document for someone discovering the
repository.

Start with a centered title, followed by a one-sentence description and badges
for the major languages, frameworks, and runtimes actually used. Preserve
useful existing badges after verifying their labels and links against repository
evidence. Do not add badges for every development dependency.

Keep applicable recognized sections in this relative order: Installation,
Features, Usage, Configuration, Documentation, Contributing, License.
Installation is the first section when it applies. Omit sections that do not
apply, and place useful project-specific sections between recognized sections
where they best help the reader.

Give the shortest working user installation path and one representative usage
example. Distinguish user installation from contributor setup. Keep prose
concise, aiming for roughly 300 words without treating that target as a limit.
Move detailed explanations to the appropriate documentation category and link
them from the README.

The Contributing section links to `CONTRIBUTING.md`. When documentation exists,
the Documentation section links to `docs/README.md`. The License section
contains only a link whose label is the actual repository license name and whose
target is the root `LICENSE` file. If the repository has no clear, single
license, ask the maintainer to identify it; never select or infer a license for
the project.

Report evidence for descriptions, commands, technology choices, badges, and
links. The read-only structural check covers title centering, section order,
required navigation links when their targets exist, and consistency between a
single root license file and the License section. It does not establish factual
accuracy, badge choice, command behavior, license correctness, or prose quality,
and it does not enforce the approximate word-count guidance.
