# Authoring notes

## Confirmed decisions
- `final-newline`: exact `files/editorconfig` shared by all profiles so tools receive consistent final newlines.
- `readme-usage`: library retains contextual `guidance/readme.md`, including actual installation/commands, a successful-invocation screenshot, weekly review, and preserved working shell examples. Personal replaces the complete declaration with contextual `guidance/personal-readme.md`, substituting a short terminal command and expected text output for the screenshot; README content remains project-owned, and the other guidance is retained. Employer retains its replacement with team-owned facts and its real support channel in `guidance/employer-readme.md`.
- `contribution-route`: library retains exact `files/contributing.md`; opening an issue before a pull request coordinates work, then documented tests support review. Personal replaces the complete declaration with exact `files/personal-contributing.md`, removing the issue-first requirement to simplify contributions while retaining the documented-test instruction as identical whole-file content. Employer retains its exclusion because its own contribution process governs.
- `release-notes`: library alone uses contextual `guidance/releases.md` to make changes and migration steps discoverable.

## Non-preferences
- No numeric coverage threshold; avoid prescribing a percentage without context.

## Skipped topics
- Code organization and agent behavior were skipped to focus on documentation.

## Unresolved / explicitly deferred
- Whether personal README guidance should include troubleshooting: explicitly deferred until the next documentation session.
- Review turnaround targets: no decision; explicitly deferred to a later session.
