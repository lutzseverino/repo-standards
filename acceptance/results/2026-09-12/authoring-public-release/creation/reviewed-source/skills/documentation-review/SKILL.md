---
name: documentation-review
description: Review project documentation on request against the selected personal-tools or team-services standards, reporting concrete gaps without running documented commands.
---

# Documentation review

Use for an ordinary user-requested documentation review. This skill has no
standards adoption role. Its entire directory is source-owned and updated as a
unit. It requires an agent that can read local files and a known selected profile;
it needs no additional runtime, network, or credentials.

1. Establish whether the selected profile is personal-tools or team-services
   from the user's request or available explicit project context. Ask if unknown
   or contradictory; do not guess a profile from the language or directory names.
2. Read the selected profile's applicable guidance if available and the project
   documents within the scope below. Use the checklist in
   [Review checklist](references/checklist.md). If guidance is unavailable, say
   that the bundled checklist is the review basis. If it contradicts the
   checklist, report the mismatch rather than inventing a merged policy.
3. For personal-tools, review only README.md and CONTRIBUTING.md. For
   team-services, review README.md and runbooks under docs/runbooks/; leave
   employer-owned CONTRIBUTING.md outside this review. Do not follow symlinks
   outside the selected scope. Report missing or unreadable documents as gaps
   or limitations without inventing their contents.
4. Report concrete gaps with file paths, observed evidence, and suggested edits.
   Use the project's stated facts. If a command, output, health endpoint,
   procedure, or contact cannot be established from the reviewed documents,
   identify what needs confirmation. Do not invent working examples or owners.
5. Keep the review read-only unless the user explicitly requests edits. Do not
   execute documented commands, make network requests, assess runtime health,
   run enforcement checks, change standards selection, or invoke adoption.
6. Finish with the selected profile, reviewed paths, findings (or an explicit
   no-gaps result), and verification limits. A prose review cannot establish
   that commands work, outputs are accurate, or recovery procedures succeed.

Maintain the checklist alongside the source's profile guidance. Updates replace
this whole skill directory, including its resources.
