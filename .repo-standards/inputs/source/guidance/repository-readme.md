# Repository README guidance

Target the adopting repository's top-level `README.md`. Preserve accurate,
useful project facts and write the document for someone discovering the
repository.

Start with a centered title, followed by a one-sentence description that says
what the project is, and badges. Badges cover the languages and runtimes a user
or contributor needs, not file formats, and a runtime badge carries the
required major version. Preserve useful existing badges after verifying their
labels and links against repository evidence. Do not add badges for every
development dependency.

Keep applicable recognized sections in this relative order: Installation,
Features, Usage, Configuration, Documentation, Contributing, License.
Installation is the first section when it applies. Omit sections that do not
apply, and place useful project-specific sections between recognized sections
where they best help the reader.

Give the shortest working user installation path and one representative usage
example. When the project is used through another tool, Installation shows how
to install that tool and how to point it at the project. Install commands carry
no version numbers. Distinguish user installation from contributor setup. Write
each Features item as one line starting with a verb. Keep prose concise, aiming
for roughly 300 words without treating that target as a limit. Move detailed
explanations to the appropriate documentation category and link them from the
README.

The Contributing, Documentation, and License sections are pointers. Each
contains only its link, as a plain paragraph, and nothing else: no surrounding
prose, additional links, lists, quotations, tables, or images. The Contributing
section links to `CONTRIBUTING.md`. When documentation exists, the
Documentation section links to `docs/README.md`, which lists the documents;
otherwise omit the section. The License section links to the root `LICENSE`
file, and its label is the actual repository license name. The separate
`repository-license` declaration establishes that file according to the
[Repository license guidance](repository-license.md).

Report evidence for descriptions, commands, technology choices, badges, and
links. The read-only structural check covers title centering, section order,
the required Contributing and Documentation sections when their targets exist,
Contributing, Documentation, and License sections holding only their link as a
plain paragraph, and consistency between a single root license file and the
License section. It does not establish factual accuracy, badge choice, command
behavior, Features wording, license correctness, or prose quality, and it does
not enforce the approximate word-count guidance.
