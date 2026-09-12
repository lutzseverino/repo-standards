# Authoring notes

## Confirmed shared decisions

- editor-line-endings: files/editorconfig owns the entire non-executable
  .editorconfig in both profiles. Only LF endings and a final newline are set.
- readme-usage: guidance/readme.md governs project-owned README.md by default:
  brief purpose, one working invocation, a brief explanation of relevant failure
  cases and how the utility reports them, and the invocation’s input/output.
  This personal-tools revision retires the sample-output requirement so readers
  understand unsuccessful use; keep failure descriptions current. The matching
  personal-tools checklist in skills/documentation-review/references/checklist.md
  follows this rule. The whole skill bundle remains shared, while team-services
  criteria remain unchanged. No headings or setup section are required; keep
  tiny-tool documentation proportionate to maintenance effort.
- reproducible-bug-reports: guidance/contributing.md governs project-owned
  CONTRIBUTING.md by default with a brief reproducible-bug reporting explanation.
  No contribution workflow is prescribed.
- notes-final-newline: guidance/notes.md and operations/notes-final-newline.cjs
  govern only project-owned NOTES.md in both profiles. A check verifies empty
  content or a final LF byte; a fix appends exactly one missing LF, preserving
  existing bytes and permission bits and becoming unchanged on repeat. Existing
  CRLF is accepted. Missing, unreadable, nonregular, symbolic-link, and out-of-scope
  targets block; write failure blocks the fix. Neither operation creates files
  or normalizes line endings. This adds focused verification/repair beyond
  editor settings without assessing note quality. Accepted prerequisites:
  node >=24.0.0 <25.0.0, probe --version, 10-second timeout, literal check/fix
  argument, no resources, network, or credentials. Trusted scripts retain the
  invoking user's access. Maintain byte behavior and protocol/version support.
- documentation-review: skills/documentation-review owns the whole
  .agents/skills/documentation-review directory in both profiles, including its
  checklist. On ordinary requested review an agent reads the selected profile's
  guidance and scoped documents, then reports evidence, gaps, and suggested edits.
  It requires file-reading ability and a known profile; asks when unknown; needs
  no extra runtime, network, or credentials. Edits require a user request. It has
  no adoption/enforcement role and does not execute documented commands or assess
  runtime health. Maintain the checklist with the profile guidance.

## Complete profiles and rationale

personal-tools covers small personal CSV/text converters and inherits all five
shared declarations without changes.

team-services inherits editor-line-endings, notes-final-newline (including both
operations), and documentation-review. It:
- Replaces all of readme-usage with guidance/team-readme.md for the service's
  purpose, startup command, and health endpoint; tiny-tool invocation and sample
  output requirements do not carry over. Keep service facts accurate for teammates.
- Excludes reproducible-bug-reports because CONTRIBUTING.md belongs to the
  employer. Exclusion removes governance; it does not delete employer content.
- Adds runbook-recovery, with guidance/runbooks.md across the explicit
  docs/runbooks directory tree: a recovery procedure and an owner to contact.
  Maintain procedures and contacts for incident responders.

README.md, CONTRIBUTING.md when selected, NOTES.md, and runbooks remain
project-owned. Profiles are complete alternatives, not combined selections.

## Explicit non-preferences and declined contexts

No preference on indentation width or semicolons. Signed commits are not a
selected standard. No editor defaults beyond the two accepted settings.
Tutorial repositories do not get a distinct policy or profile.

## Skipped and deferred topics

CI is skipped. Whether to require tests remains explicitly deferred.

## Verification boundaries

All-profile public CLI validation establishes source structure, not behavior or
future project compliance. Operation fixtures and the same-agent documentation
review exercise are separate evidence retained outside this source. No adoption,
Git provisioning, commit, or publication is part of this authoring work.
