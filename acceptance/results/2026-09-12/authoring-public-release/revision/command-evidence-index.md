# Command evidence index

- agent-start-git.json: initial HEAD, status, complete unstaged/staged binary diffs, index entries, and untracked inventory commands and outputs.
- agent-initial-validation.json: complete initial CLI output (exit 0).
- agent-edit-record.json: exact accepted old/new substitutions applied by the inline Python editing command.
- agent-review-validation-process.json and agent-review-validation.json: CLI argv/exit/stderr and full result.
- agent-review-git.json: full pre-acceptance Git command/output comparisons.
- final-commands.json: final CLI version, Node version, all-profile validation, HEAD, index entries, status, staged/unstaged/untracked and scratch-only diffs, all argv/cwd/exit/stdout/stderr.

Read commands used cat on the installed author-standards SKILL.md and references/revision.md, references/cli.md, references/profiles.md, references/operations.md; matching package docs/author-format.md and docs/authoring.md; and evaluator before.json. Source files were read into agent-start-source.json, agent-review-source.json, and final-source.json by inline Python. The initial source inventory accidentally included .git binary files, produced a UnicodeDecodeError before writing the source inventory, and was immediately repeated excluding .git. This did not modify source or Git content. Final preservation proves the raw index matches the evaluator's initial hash.

Whole inline Python tool inputs remain in the session tool transcript; this index records their durable inputs/results and is not a verbatim shell transcript.
