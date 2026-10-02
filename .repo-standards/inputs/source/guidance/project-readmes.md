# Project README guidance

Each maintained app, service, library, or tool with its own responsibility and
development commands is a Project and has a Project README, including internal
packages. Fixtures, generated code, and directories that only organize other
content are not Projects.

Use a plain Markdown title and a concise developer-facing description. Explain
the Project's purpose, development commands, important configuration, and
relevant documentation. State the working directory for commands when it is not
apparent. Link shared setup and contribution instructions in the root
`docs/development/README.md` and `CONTRIBUTING.md` instead of duplicating them.

Preserve useful and accurate existing content. Assess purpose, commands,
configuration, and links against repository evidence. The read-only structural
check verifies the title and local links for each confirmed path; it does not
decide Project membership or establish semantic accuracy.
