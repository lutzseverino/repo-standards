# Authoring notes

## Confirmed decisions
- `final-newline`: exact `files/editorconfig` shared by all profiles so tools receive consistent final newlines.
- `readme-usage`: personal and library inherit contextual `guidance/readme.md`. Actual installation/commands, a successful-invocation screenshot, weekly review, and preserved working shell examples help readers reproduce usage. Employer replaces this with team-owned facts and its real support channel in `guidance/employer-readme.md`.
- `contribution-route`: personal and library share exact `files/contributing.md`; opening an issue before a pull request coordinates work, then documented tests support review. Employer excludes this because its own contribution process governs.
- `release-notes`: library alone uses contextual `guidance/releases.md` to make changes and migration steps discoverable.

## Non-preferences
- No numeric coverage threshold; avoid prescribing a percentage without context.

## Skipped topics
- Code organization and agent behavior were skipped to focus on documentation.

## Unresolved / explicitly deferred
- Whether personal README guidance should include troubleshooting: deferred until returning to documentation.
- Review turnaround targets: no decision; explicitly deferred to a later session.
