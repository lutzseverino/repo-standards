# Authoring notes

## Confirmed decisions

- `final-newline-editorconfig` owns the entire `.editorconfig`, using the exact bytes in `files/editorconfig` and non-executable file mode. The file contains only `[*]` and `insert_final_newline = true`, with a final newline. Whole-file installation and replacement are accepted; later local edits conflict with the installed baseline.
- The `shared` profile inherits this declaration from defaults. The same tooling standard applies to personal and employer tools, whether JavaScript or TypeScript. No context-specific standards differ, so one profile is sufficient.

## Explicit non-preferences

- No indentation preference; no indentation settings are included.

## Skipped topics

- Testing, code organization, documentation, review, and agent behavior.

## Unresolved or deferred questions

- None.
