# Scoped revision and reconciled resumption — issue #30

Two fresh authoring agents use the same isolated, conventionally installed local
candidate on Linux arm64, with Node.js 24.11.1. The implementation agent acts as a
synthetic returning author and responds live to drafts and questions. This is
real-agent behavioral evidence with an evaluator author, not a human usability
study. The authoring agents receive only the installed skill, existing synthetic
source, and their opening request; the resumption agent receives no earlier
conversation. The source is an acceptance fixture, not anyone's actual standards.

`acceptance/prepare-author.ts` installs the candidate with `skills@1.5.25` into an
isolated global directory and removes its installation input. `journey.json`
records installation arguments, exact resource hashes, platform, and tool versions;
`installation.txt` records the installer output. The authoring agents acquire the
compatible public npm CLI separately. This demonstrates local candidate skill
installation and public CLI acquisition; public skill distribution/discovery and
macOS execution are not demonstrated by this run.

The evaluator prepares an existing Git repository with complete `personal`,
`library`, and `employer` profiles. Shared defaults include exact newline settings,
contextual README guidance, and exact contribution instructions. Employer replaces
README guidance and excludes contribution governance; library adds release notes.
The fixture includes staged and unstaged edits to the same tracked draft, a tracked
annotation in referenced configuration, an untracked referenced employer guidance
file, an untracked binary file, and an executable untracked shell draft. Setup
commits only the original fixture before the authoring session; the authoring
agents perform no repository provisioning, staging, commits, publication, or adoption.

Before/after source directories retain every non-Git file, including binary bytes
and executable state. Snapshot records retain HEAD, index entries and hash, Git
status, staged/unstaged diffs, and per-file hashes/modes. The manual source edit
between sessions is evaluator work and is recorded separately from agent changes.

## Revision

The [live revision transcript](revision/transcript.md) begins with an explicit
personal-only preference: replace screenshots with a terminal command and its
expected text output while keeping README content project-owned. The agent
inspected the source and notes, validated every starting profile, identified shared
references, and applied a complete personal replacement with separate guidance.
It did not ask for the same policy confirmation again.

“Also simplify the contribution instructions” was ambiguous. The agent showed the
existing exact content, offered a smaller draft and its coordination trade-off,
and asked for profiles, retained wording, and ownership. The synthetic author
accepted removal of the issue-first requirement for personal only, retaining the
documented-test instruction as exact whole-file content. Library and employer
keep their prior standards. Troubleshooting and review turnaround were explicitly
deferred. The author then reviewed all referenced contents, notes, and the complete
selection table and accepted the revision.

The agent initially described non-executable files as mode 0644, while the actual
reviewed manifest recorded 0600 from the environment's umask. An appended
[correction](revision/mode-correction-verification.json) verifies every archived
reviewed file and records author acceptance of the actual modes. Original turns
are preserved; this was a reporting correction, not a permission or content edit.
The resumption source was not accessed during that correction.

## Resumption

The [manual edit](manual-edit.diff) removes the weekly-review sentence from personal
README guidance after the revision; it leaves the old notes and the library rule
unchanged. The fresh resumption agent reads current files and notes without the
prior conversation. It identifies the disagreement, quotes the missing policy,
explains the affected profile, and leaves it unchanged while asking for intent.
It also offers a concrete troubleshooting draft with an applicability example and
trade-off. These are actual live responses, not scripted assessment outputs.

The author confirms the manual removal was deliberate for personal only, accepts
troubleshooting with an evidence requirement, and retains the non-preference,
skipped topics, and deferred review-turnaround question. The agent adds the refined
guidance, reconciles the stale note, and removes troubleshooting from unresolved
questions. The [complete live resumption review](resumption/transcript.md) covers
all referenced files, notes, ownership, and each complete profile. The author
accepts the whole result before final validation and publication handoff.

## Preservation and validation

[Independent verification](verification.json) is separate from conversational
usefulness. It compares complete before/after file inventories, bytes and modes,
HEAD, index bytes and entries, staged diffs, and unaffected resolved profiles.
Revision changes only `standards.yaml` and notes and adds two personal-profile
files. Resumption changes only personal README guidance and notes. No original
file disappears, the manual removal is not restored, and the library rule remains.
All unrequested source material and pre-existing tracked/untracked work survives.
The checker also compares every final referenced file and notes with the full
content actually shown in the accepted transcripts. Recheck the retained evidence
with `python acceptance/results/2026-09-11/authoring/revision-resumption/verify.py`
from the product checkout; this verifies artifacts, not a replay of agent behavior.

Both agents' final all-profile CLI results have exit 0 and `valid: true`. Separate
independent CLI invocations validate all four archived source snapshots; their
full results establish that library and employer resolved selections are unchanged.
The agent final reports remain distinct: [revision](revision/validation-final.json)
and [resumption](resumption/validation-final.json). Declarations contain no checks
or fixes. No generated operations or adopting-project behavior are exercised here;
structural validity does not establish future compliance or guidance usefulness.

The publication handoff leaves the source local and unpublished. The resumption
agent correctly flags an older installed publication guide's stale statement
that public npm delivery is pending, while retaining actual successful registry
acquisition as evidence. No product CLI or format change was needed for this slice.

This covers #30's explicit/ambiguous scope and conflicting rules, source-first
resumption, reconciled public-suitable notes, full review, all-profile validation,
and separate preservation evidence. It owns parent #25 stories 22–24 and 27,
extends 25–26, and covers Testing Decisions 5 and 6. The fixture has one existing
source with three profiles; generated operations, public skill discovery, and
untested operating systems remain outside this evidence.

## Deterministic checks

The packaging regression was observed failing before the revision guide existed
([red result](packaging-red.txt)). After implementation, typechecking and build
passed, and [all 22 focused release/source-validation tests](focused-validation.txt)
passed. Skill frontmatter validation and all bundled reference links passed.
The [installation verification](installation-verification.json) confirms the
installed skill hashes still equal the final candidate; no skill edit followed
these live sessions. Full `pnpm validate` is running separately and its final
result will be retained before this ticket is considered complete.
