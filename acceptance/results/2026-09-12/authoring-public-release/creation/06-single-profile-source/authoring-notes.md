# Authoring notes

## Confirmed decisions

The personal-tools profile covers small personal CSV and text conversion utilities.
It inherits all three default declarations; there are no replacements, exclusions,
or additions.

- editor-line-endings: files/editorconfig owns the entire .editorconfig file,
  with non-executable state. Set only LF endings and a final newline; these are
  the shared exact editor settings.
- readme-usage: guidance/readme.md governs the project-owned README.md. Keep
  documentation brief while explaining purpose, one working invocation with
  concrete sample output, and its input/output. No headings or setup section
  are required, keeping maintenance proportionate to tiny tools.
- reproducible-bug-reports: guidance/contributing.md governs project-owned
  CONTRIBUTING.md. Briefly explain how to report a reproducible bug; no
  contribution workflow is prescribed.

All declarations apply to personal-tools. Guidance preserves project facts and
organization. No checks, fixes, or author skills have been selected.

## Explicit non-preferences

No preference on indentation width or semicolons. Signed commits are not a
selected standard. No editor defaults beyond the two accepted settings.

## Skipped topics

CI is skipped.

## Deferred and unresolved decisions

Whether to require tests is deferred. Team-service differences remain for a
later discussion; this source currently defines only personal-tools.
