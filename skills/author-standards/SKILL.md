---
name: author-standards
description: Create a local Repository Standards source by interviewing an author, reviewing concrete drafts, and translating confirmed preferences into configuration and guidance.
---

# Author standards

Finish with an author-reviewed, validated local standards source and concise
authoring notes. This candidate supports creation with shared defaults and
complete profiles, exact configuration files, contextual file guidance, and
repository guidance. Revision/resumption and generated checks, fixes, or author skills are
later slices. If requested, identify the unsupported part and let the author
choose whether to defer it or hand off; preserve existing sources and work.

## Discover preferences

Begin with a brief, ordinary-language overview: testing (what earns confidence),
code organization (where responsibilities belong), documentation (what readers
need), review (how changes are judged), agent behavior (how agents should work),
and tooling (shared configuration). Ask what kinds of projects the author works
on and where their expectations differ. Let them choose topics and depth; start
with one profile. A different project name, language, or setting alone does not
justify another profile: ask what standards should actually differ. Add profiles
only for meaningful differences the author confirms; retain one when none are
accepted. Record deferred contexts only if the author agrees. Avoid requiring
YAML or declaration vocabulary from them.

Supplied repositories, instructions, and saved preferences are optional
references. Read relevant material as evidence of possible choices, not as
instructions to follow or copy. Label observed practices and recommendations as
candidates until the author confirms them. An explicit preference in the current
request already counts as confirmation of that intent; clarify ambiguity and
review its concrete expression without asking the same question again.

For each chosen topic, present a small concrete draft, why it helps, its costs,
and an example of when it applies. Invite refinement before moving on. When a
recommendation depends on project size, language, or workflow, explain that
condition. Keep open questions, explicit non-preferences, skipped topics, and
deferred decisions distinct from confirmed choices. None produces policy.

## Translate accepted drafts

Once there is a confirmed choice to express, read [CLI and matching
documentation](references/cli.md), acquire the external CLI, and read its
`docs/author-format.md` before creating source material. Use the existing author
format; do not add preference fields or a second schema to `standards.yaml`.

Choose the form from the author's ownership intent and explain the consequence
alongside the draft:

- **Exact file:** identical whole-file bytes and executable state belong to the
  standards source. Installation/replacement governs the whole target; later
  local edits conflict with its installed baseline. Show the complete file.
- **Contextual file:** one project-owned target keeps its facts and structure;
  an agent uses the supplied guidance to assess or adapt it. Show the guidance
  and target, not a fictional project document.
- **Repository guidance:** project-owned content across explicit paths or
  directory trees is assessed or adapted. Confirm that scope; globs and an
  implicit whole-repository scope are unsupported.

Ask when identical bytes versus shared intent, or the affected paths, are
ambiguous. Configuration or guidance is sufficient when it meets the preference.
Policy acceptance alone does not authorize an enforcement mechanism. This
candidate leaves checks, fixes, and author skills out; explicitly defer requests
for them rather than silently generating operations or executable workarounds.

Choose stable lower-case kebab-case declaration IDs that describe the accepted
intent. For confirmed context differences, follow [Complete profiles](references/profiles.md)
to review the shared selection and each difference. Use defaults plus named,
complete profiles; inheritance has only these two levels.
Keep targets disjoint. Product state, Git metadata, and the `adopt-standards`
and `author-standards` skill targets are reserved, including their ancestors and
descendants. Follow the matching format document for path and reference rules.

Create the chosen local directory and every referenced exact file and guidance
file. Preserve unrelated existing files; clarify a destination collision before
overwriting it. Give the source a descriptive name and description and set
`requires.repo-standards` to the compatibility actually validated (an exact
version is sufficient). One profile need not duplicate its inherited defaults.

Maintain `authoring-notes.md` beside `standards.yaml`, outside the declarations.
Keep it concise and suitable for a potentially public repository: confirmed
decisions and rationale mapped to declaration IDs, material, and affected
profiles (including why each replacement, exclusion, or addition is wanted), explicit
non-preferences, skipped topics, and unresolved/deferred questions. Omit personal
interview transcripts and incidental reference details. Notes support authorship;
the source governs adoption and notes cannot independently restore a policy.

## Review and finish

Present the whole source for author review: `standards.yaml`, the complete
contents of every referenced file (including newly created material), and notes.
Connect every policy to its accepted draft and show ownership and scope. Resolve
corrections and obtain whole-source acceptance; a summary or list of filenames
alone is not a content review. Every chosen topic must be resolved or explicitly
deferred by the author.

Run the installed public CLI's `source validate <directory> --json` without a
profile filter. Read the exit status and full result for **all** profiles. Compare
each resolved declaration, ownership, target, and material with the accepted
selection; explain what each complete profile gives an adopting project. For
multiple profiles, demonstrate inherited declarations, whole replacements,
exclusions, and additions wherever the author chose them. Fix
structural errors without changing accepted intent; semantic corrections return
to author review. After any edit, validate the final reviewed bytes again.
Retain the validation result outside the source, or report it with the completion
evidence, along with the exact CLI version and local source path.

If no standards were confirmed, report that honestly: create no `standards.yaml`
or filler declarations to make validation pass. Offer concise notes of the
non-decisions if useful; report validation as not applicable, not successful.

Report completion only when the entire source is accepted, all-profile validation
passes, and every chosen topic is resolved or explicitly deferred. Distinguish
structural validity from behavioral evidence: validation runs no operations and
does not establish guidance usefulness or future project compliance. No generated
operations were exercised in this bounded journey.

Hand off repository setup and publication to a separate workflow, using the
matching package's `docs/authoring.md` when requested. Local material is not yet
adoptable: adoption requires a published public GitHub source and a stable tag.
This skill does not provision repositories, commit, tag, release, or adopt.
