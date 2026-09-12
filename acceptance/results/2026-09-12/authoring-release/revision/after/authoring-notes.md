# Authoring notes

## Confirmed decisions

- `editorconfig`: both profiles inherit exact, non-executable `files/editorconfig`
  at `.editorconfig`. Own the complete file to share UTF-8, LF, and final newlines.
- `readme`: defaults use `guidance/readme-personal.md` for project-owned README.md:
  a concise quickstart focused on one runnable example using the actual project
  command; purpose, installation instructions, and expected output are not required.
  `personal-tools` inherits this narrower guidance so the first runnable action is
  easy to find; this supersedes its former purpose and installation requirements.
  `team-services` fully replaces it with
  `guidance/readme-service.md`: actual start, health-check, and stop commands.
  The service workflow does not inherit personal-tool README requirements.
- `contributing`: personal tools inherit `guidance/contributing.md` for project-owned
  CONTRIBUTING.md, asking contributors to run the documented project test command.
  Team services exclude the entire declaration to leave employer contribution
  documents untouched; exclusion does not delete them.
- `service-runbook`: only team services add `guidance/service-runbook.md` for
  project-owned docs/runbook.md, documenting known restart limitations.
- `notes-newline`: both profiles inherit `guidance/notes-newline.md` and the Node
  check/fix in `operations/notes-newline.mjs` for project-owned docs/notes.md.
  The check reads only and tests its last byte; the fix appends exactly one LF
  if absent, including to an existing empty file, preserving original bytes/modes.
  Missing, symlinked, nonregular, inaccessible, or out-of-scope content blocks;
  missing notes are never created. Repeated repair is unchanged. Node 24 is
  accepted (`node --version`, >=24.0.0 <25.0.0), with a 10-second timeout, literal
  check/fix arguments, and no resources, extra packages, network, or credentials.
  Operations inherit caller host access; disposable exercises are not a sandbox.
- `readme-review`: both profiles inherit the whole exact `skills/readme-review`
  directory at `.agents/skills/readme-review`. On explicit invocation, an agent
  with file-reading tools compares README.md with supplied unambiguous active
  profile guidance and reports evidence-backed gaps without edits or adoption.
  No command execution, runtime, package, network, or credential is required.
  It asks for missing active guidance rather than guessing or merging profiles.

## Non-decisions and verification limits

- No preference for test frameworks or indentation size. Historical JavaScript
  semicolon usage is incidental and produces no policy.
- CI, further testing details, code organization, and agent behavior remain
  deferred. Review standards are skipped; the separately requested README review
  skill does not introduce general review policy.
- README-review content review is sufficient for this authoring session by
  explicit author choice. Real-agent usefulness and command correctness remain
  unverified. No ordinary-work agent exercise has been performed.
- Operation evidence is a direct disposable protocol exercise, not adoption or
  runtime orchestration evidence. Newline checks do not assess content usefulness.
  Exercises cover local Linux; other platforms, concurrent writers and permission
  failures are unverified. Missing Node is a prerequisite blocker, not a passing run.
- Compatibility is pinned to the externally installed 1.1.0 packed CLI candidate.
  Candidate acquisition and local validation are not evidence of public release.
  This source remains local and requires publication through a separate workflow.
