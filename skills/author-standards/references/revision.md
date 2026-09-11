# Revise current standards and resume decisions

Read the existing `standards.yaml`, its referenced material, and relevant
`authoring-notes.md` before proposing a revision. Inspect all profiles and shared
references to understand who receives each affected declaration. Use the installed
CLI and matching format guide from [CLI acquisition](cli.md) to resolve the
current source. If it is invalid, report diagnostics and establish intended
meaning before a repair that changes policy.

Record the starting work before edits: current source contents and executable
state, and, in an existing Git checkout, HEAD, index, tracked changes, and
untracked files. Read affected working files, including untracked referenced
material. Preserve staged and unstaged work, unrelated content within edited
files, and unrelated profiles, declarations, and referenced material. Authoring
does not require a clean checkout. Keep comparison evidence outside the source;
leave commits and staging to its normal repository workflow.

## Establish authority and scope

The current source governs published policy. Notes explain prior decisions and
unfinished questions; they are not another policy input. Compare relevant notes
with actual source content before relying on them. If they disagree, show the
specific rule, its current expression or absence, the older note, and the affected
profiles. Establish the author's intent before changing that policy. Preserve
the current material while intent is unclear; notes alone cannot restore a rule.

An explicit new preference already authorizes its stated scope. Show the
conflicting current rule and the concrete change, then apply that preference
without asking for the same confirmation again. Ask only for missing decisions:
which profiles or paths, whether a shared default should change, or an unresolved
ownership choice. If the request already settles a source/notes disagreement,
reconcile it directly and explain the result. Otherwise leave that policy
unchanged until clarified; independent, unambiguous work may continue.

Trace each requested change through defaults, profile replacements/exclusions,
and all references to the affected file or directory. A shared file can govern
several profiles even when its path sits under one profile's directory. Show who
would be affected before editing it. For a scoped exception, retain the shared
material and use a complete same-ID replacement with separate material as needed.
Follow [Complete profiles](profiles.md); retain existing checks, fixes, resources,
and exclusions unless their change is part of the accepted scope. A replacement
must carry the whole intended declaration. Keep stable IDs for the same intent.

## Continue from notes

Resume the relevant unresolved questions with their recorded rationale; distinguish
them from explicit non-preferences and skipped topics. Let the author choose which
to reopen. Offer small drafts with trade-offs and applicability examples for new
decisions, while preserving choices outside the request. Missing notes are not
permission to infer preferences; start from current policy and the author's request.

Reconcile affected notes after intent is settled: record the current decision,
reason, material/declaration IDs and profiles; supersede stale statements so a
future session cannot mistake them for current choices. Retain useful rationale,
non-preferences, skipped topics, and questions still unresolved or explicitly
deferred. Keep notes concise and suitable for a public repository, outside the
declarations, without personal interview transcripts. An unresolved disagreement
stays visibly unresolved and the policy remains unchanged.

## Review the resulting source

Continue the main skill's whole-source content review and all-profile validation,
including unchanged material. Explain the resulting selections and conflicts
resolved, with each change traced to author intent. Chosen questions must be
resolved or explicitly deferred before completion; an ambiguous policy change
cannot be claimed complete merely because the existing source validates.

Compare final content and executable state with the starting work and inspect
the diff, including new files. Verify unaffected profile selections and referenced
bytes separately from whether the conversation was useful. In Git, also verify
unchanged HEAD and index and preservation of pre-existing tracked and untracked
work. Report actual differences and any unverified preservation. After final edits,
validate all profiles again and hand off the reviewed local revision to the
separate publication workflow.
