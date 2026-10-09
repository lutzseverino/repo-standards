# Do and judge contextual work

A run report with `phase: contextual` and a `workRequest` is the expected
incomplete handoff after installation and fixes. The request, the submission
format, freshness, and the diagnostics are defined by the
[assessment protocol](https://github.com/lutzseverino/repo-standards/blob/v5.1.1/docs/usage/assessment-protocol.md).

## Do the work

1. For a discovery request, first recheck coverage as
   [discovery](discovery.md#recheck-coverage-during-contextual-work) describes.
   Additional-path evidence alone grants no authority: when more files are
   needed or a confirmed target is mistaken, write none of them.
2. For each declaration in the request, read its retained guidance, at
   `guidance.retained`, and its `allowedTargets`. A directory entry allows the
   directory and everything beneath it; a path allows only that file.
3. Inspect the real project files you need to understand the project's
   purpose, commands, and behavior.
4. Apply the guidance usefully within the allowed targets. Preserve project
   facts, exact content and skills, excluded content such as an employer's
   files, and unrelated work. Keep your notes and the submission outside the
   project or in `.repo-standards/local/`; any other new file is an observed
   change.
5. When guidance requires work outside the allowed targets, or facts the
   project doesn't support, leave that work undone and assess the declaration
   as `blocked`, explaining the decision the maintainer needs to make.

## Judge each declaration

- Account for every contextual declaration, including one the project already
  satisfies.
- Cite concrete project content or command outcomes you observed as evidence.
- Keep your judgment separate from script results. A passing structural check
  alone does not establish that the content is useful.
- For a migration, explain which useful content of its source each destination
  preserves.

## Submit the assessment

1. After your last edit, refresh the request with `resume --json`. Keep the
   project unchanged from then until the submission is accepted.
2. Write a `repo-standards/assessment/v3` document. For each declaration give
   only its `id`, `status` (`satisfied` or `blocked`), `explanation`, and
   `evidence`. For a discovered declaration add both scope-validity reviews,
   `afterFixes` and `current`, after reviewing coverage again at the refreshed
   snapshot. A
   review is `valid` with no additional paths, or `blocked` with its
   explanation and any `additionalPaths`. Copy no identities or changed paths:
   the CLI binds the assessment to the active run and derives each change from
   the run's work evidence.
3. Run `resume --assessment <file> --json`.

`STALE_ASSESSMENT` means the project changed after the refresh. Refresh again,
reassess every contextual declaration, and submit renewed evidence. After an
ordinary `CHECKS_FAILED` result, correct the content and submit a renewed
assessment the same way. Any other failed or uncertain operation is recovered
by an explicit retry or abandoned, as [recovery](recovery.md) describes. After
a retry, submit a new assessment against the retried request even when the
project's bytes are unchanged.

A `blocked` declaration or scope review leaves the run incomplete before
checks. Report it to the maintainer with the decision it needs; a blocked scope
review is resolved by
[correcting the scope](recovery.md#correct-a-confirmed-scope).
