# Authoring notes

The `tools` profile covers small internal Node command-line tools and inherits all three declarations from defaults.

## Confirmed decisions

- `editor-formatting` → `files/editorconfig`: the standards source owns the entire non-executable `.editorconfig`; replacement covers the whole file and local edits conflict with its installed baseline. Two-space indentation applies to JavaScript (`.js`, `.cjs`, `.mjs`) and JSON; final newlines apply to all files. Shared editor settings support consistent formatting.
- `newcomer-run-guide` → `guidance/readme.md`: project-owned `README.md` should give newcomers required setup, an invocation example, and its successful outcome. Commands and prerequisites stay accurate; headings and structure are not prescribed. This provides a usable starting point with a small maintenance burden.
- `reusable-cli-logic` → `guidance/code-organization.md`: project-owned content only within the `src/` directory tree is covered. Separate parsing from independently exercisable reusable logic to make that logic usable without command-line simulation. No automated check or fix was requested or included.

## Explicit non-preferences

- No coverage percentage threshold.
- No fixed folder layout or requirement to keep all code in one entry file.

## Skipped

- Review rules for this session.

## Deferred and open for later

- Personal website context.
- Test strategy.
- Agent-behavior rules.

These notes record authorship decisions; only the declarations and referenced material govern adoption. The source contains no checks, fixes, or author skills.
