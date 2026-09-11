Author turn 1: I am back for my next documentation session. Please resume the unfinished personal README troubleshooting decision from the authoring notes. Help me settle that question and finish reviewing the local source.

Assistant turn 1:

I’m using the installed author-standards skill to resume the saved documentation decision. The current source validates with the public CLI 1.0.1, and I have recorded its files and existing Git work before editing.

The unfinished question is personal README troubleshooting. A small draft for the project-owned README.md is: “When a recurring user problem is known, describe its symptom and a verified recovery step. Omit troubleshooting when no such problem is known.” This helps users recover without requiring an empty section; the cost is keeping recovery steps accurate. For example, a command with a known missing-configuration error would document that error and the working setup command. This would extend only personal’s existing readme-usage guidance; library and employer would retain their current guidance.

I also found a notes/source disagreement: the notes say personal retains the other shared README guidance, which includes “Review the README every week to keep instructions current.” That sentence is present in guidance/readme.md for library but absent from guidance/personal-readme.md. I have preserved the source while this is unresolved.

Would you use the troubleshooting draft as written or refine it, and should personal retain its current absence of a weekly-review requirement or restore that requirement?

Author turn 2: I deliberately removed the weekly-review rule from personal guidance between sessions; keep it removed there, leave the library rule alone, and correct the stale note. I accept the troubleshooting idea for personal tools only, with this refinement: document a concrete recurring error and a verified corrective step only when the project has evidence of that problem; otherwise omit it rather than invent an error or a troubleshooting section. Keep README project-owned. No coverage percentage preference; keep code organization and agent behavior skipped, and review turnaround explicitly deferred. Please show the concrete revised guidance and the whole source and notes for final review.

Assistant turn 2:

Personal keeps README.md project-owned and has no weekly-review requirement. Library retains its weekly-review rule. The revised personal guidance adds only evidence-backed troubleshooting, exactly as you requested; the stale note is corrected.

The complete selections are:

| Declaration | Shared default | Personal | Library | Employer |
|---|---|---|---|---|
| final-newline | Exact .editorconfig | Inherited | Inherited | Inherited |
| readme-usage | Contextual README.md, screenshot and weekly review | Complete replacement: terminal text example, no weekly review, evidence-backed troubleshooting | Inherited | Complete replacement: team facts and support channel |
| contribution-route | Exact CONTRIBUTING.md, issue first and tests | Complete replacement: tests only | Inherited | Excluded; employer process governs |
| release-notes | Absent | Absent | Added contextual CHANGELOG.md | Absent |

Exact files govern the whole target’s bytes and executable state; all three exact source files are non-executable. README and changelog guidance adapts project-owned content at the named target. All existing files outside the two edits are preserved. Here is the entire source, including every referenced file and the notes:

`standards.yaml`

```yaml
format: repo-standards/v1
name: harbor-working-standards
description: Synthetic returning author's personal, library, and employer standards
requires:
  repo-standards: '1.0.1'
defaults:
  declarations:
    final-newline:
      kind: file
      target: .editorconfig
      exact: files/editorconfig
    readme-usage:
      kind: file
      target: README.md
      guidance: guidance/readme.md
    contribution-route:
      kind: file
      target: CONTRIBUTING.md
      exact: files/contributing.md
profiles:
  personal:
    description: Personal command-line tools
    declarations:
      readme-usage:
        kind: file
        target: README.md
        guidance: guidance/personal-readme.md
      contribution-route:
        kind: file
        target: CONTRIBUTING.md
        exact: files/personal-contributing.md
  library:
    description: Published libraries
    declarations:
      release-notes:
        kind: file
        target: CHANGELOG.md
        guidance: guidance/releases.md
  employer:
    description: Employer-managed projects
    declarations:
      readme-usage:
        kind: file
        target: README.md
        guidance: guidance/employer-readme.md
      contribution-route:
        exclude: true
```

`files/editorconfig`

```text
root = true

[*]
insert_final_newline = true

# Maintainer annotation, not a policy change.
```

`files/contributing.md`

```text
# Contributing

Open an issue before submitting a pull request.
Run the documented tests before submitting a pull request.
```

`files/personal-contributing.md`

```text
# Contributing

Run the documented tests before submitting a pull request.
```

`guidance/readme.md`

```text
# README usage

Describe the actual installation steps and supported commands.
Include a screenshot demonstrating a successful invocation.
Review the README every week to keep instructions current.
Preserve existing shell examples that still work.
```

`guidance/personal-readme.md`

```text
# README usage

Describe the actual installation steps and supported commands.
Include a short terminal command demonstrating a successful invocation and its expected text output.
Preserve existing shell examples that still work.
Document a concrete recurring error and a verified corrective step only when the project has evidence of that problem; otherwise omit it rather than invent an error or a troubleshooting section.
```

`guidance/employer-readme.md`

```text
# Employer README

Keep team-owned facts and document the actual internal support channel.
```

`guidance/releases.md`

```text
# Release notes

Describe user-visible changes and migration steps for each released version.
```

`authoring-notes.md`

```text
# Authoring notes

## Confirmed decisions
- `final-newline`: exact `files/editorconfig` shared by all profiles so tools receive consistent final newlines.
- `readme-usage`: library retains contextual `guidance/readme.md`, including actual installation/commands, a successful-invocation screenshot, weekly review, and preserved working shell examples. Personal replaces the complete declaration with contextual `guidance/personal-readme.md`, substituting a short terminal command and expected text output for the screenshot; README content remains project-owned, installation/command guidance and working shell examples are retained, and the weekly-review requirement is deliberately absent for personal tools. Personal troubleshooting describes a concrete recurring error and a verified corrective step only when project evidence supports that problem; otherwise it is omitted, avoiding invented errors or empty troubleshooting sections. Employer retains its replacement with team-owned facts and its real support channel in `guidance/employer-readme.md`.
- `contribution-route`: library retains exact `files/contributing.md`; opening an issue before a pull request coordinates work, then documented tests support review. Personal replaces the complete declaration with exact `files/personal-contributing.md`, removing the issue-first requirement to simplify contributions while retaining the documented-test instruction as identical whole-file content. Employer retains its exclusion because its own contribution process governs.
- `release-notes`: library alone uses contextual `guidance/releases.md` to make changes and migration steps discoverable.

## Non-preferences
- No numeric coverage threshold; avoid prescribing a percentage without context.

## Skipped topics
- Code organization and agent behavior were skipped to focus on documentation.

## Unresolved / explicitly deferred
- Review turnaround targets: no decision; explicitly deferred to a later session.
```

Do you accept this whole source and notes, including the revised personal troubleshooting guidance, with review turnaround still explicitly deferred?

Author turn 3: I accept the whole source, every referenced file, the complete profile selections, and the reconciled notes as shown. The personal troubleshooting decision is resolved, the deliberate removal of personal weekly review remains in effect, and review turnaround stays explicitly deferred. Finish with final all-profile validation and preservation checks, and hand off publication separately.

Assistant turn 3:

The accepted local source is complete at `/tmp/repo-standards-author-BydzfE/workspace/standards`.

Final all-profile validation with the publicly acquired `@lutzseverino/repo-standards@1.0.1` CLI exited 0 with `valid: true`, no errors, and empty stderr. I checked each resolved selection against the reviewed source: personal has the exact editor configuration, tests-only contribution file and project-owned README guidance with evidence-backed troubleshooting and no weekly-review rule; library retains its shared contribution and README rules plus release notes; employer retains its README replacement and contribution exclusion. Every resolved check/fix list is empty.

Only `guidance/personal-readme.md` and `authoring-notes.md` changed. File hashes and modes confirm all other bytes and executable states were preserved, including the existing editor configuration annotation and scratch files. HEAD, index and the pre-existing staged changes are unchanged; unrelated unstaged and untracked work is preserved. The troubleshooting decision is resolved; review turnaround remains explicitly deferred, with the non-preference and skipped topics retained.

Evidence, including the complete transcript, reviewed contents, acquisition commands, final JSON, session diff and preservation report, is in `/tmp/repo-standards-30-evidence/resumption`.

Validation establishes structural validity; it does not establish guidance usefulness or future project compliance. No generated operations were exercised.

Publication is handed off separately using the installed package’s `docs/authoring.md`: choose a public GitHub source and suitable license, select and commit the intended reviewed files through the normal repository workflow, validate the committed snapshot, and publish an immutable stable SemVer tag. Discovery additionally requires a published release and the `repo-standards` topic. Share the source URL, stable tag and one complete profile for adoption. This source remains local and is not yet adoptable; no provisioning, staging, commit, tag, publication or adoption was performed.

The installed publication guide contains a stale statement that public npm delivery is pending; this session’s successful registry installation is recorded as the acquisition evidence.
