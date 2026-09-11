## Author turn 1

I am returning to the standards in this directory. For personal tools only, replace the README screenshot requirement with a short terminal command and its expected text output; keep README content project-owned. Also simplify the contribution instructions. Please help me revise this and finish reviewing the local source.

## Agent progress reply

I’m using the installed author-standards skill to revise the current source. I found that personal and library share both README guidance and an exact CONTRIBUTING.md, while employer has separate README guidance and excludes the contribution file. I’ll preserve those boundaries and the existing local work while resolving the requested changes.

## Agent reply 1

I acquired the public CLI version 1.0.1 under Node.js 24.11.1. The starting source validates for all three profiles. I saved the starting files, executable states, HEAD, index, and tracked/untracked changes outside the source.

Your README change is now a personal-only replacement using separate guidance; library keeps the shared screenshot requirement, and employer keeps its team guidance. README remains project-owned: this governs what it should explain, not its exact bytes. The complete personal guidance is:

```markdown
# README usage

Describe the actual installation steps and supported commands.
Include a short terminal command demonstrating a successful invocation and its expected text output.
Review the README every week to keep instructions current.
Preserve existing shell examples that still work.
```

For a personal CLI, readers can copy its real invocation and compare the result. This is easier to maintain than a screenshot, but expected output must track behavior changes.

Contribution instructions currently replace the whole CONTRIBUTING.md with these identical bytes in personal and library:

```markdown
# Contributing

Open an issue before submitting a pull request.
Run the documented tests before submitting a pull request.
```

A smaller draft would keep only “Run the documented tests before submitting a pull request.” This removes the coordination requirement, at the cost of less advance discussion. Which profiles should receive the simplification, what wording should remain, and should CONTRIBUTING.md still be identical everywhere or project-owned? The notes also left personal README troubleshooting open; shall we resolve that now or explicitly defer it again?

## Author turn 2

Apply that contribution simplification only to personal tools: remove the open-an-issue requirement and keep 'Run the documented tests before submitting a pull request.' Keep CONTRIBUTING.md as identical whole-file content for personal tools; library and employer should keep their current standards. The personal README draft is right. Explicitly defer the troubleshooting question until my next documentation session, and keep review turnaround deferred. Please show me the whole resulting source and notes for final review.

## Agent reply 2 — whole-source review

I applied the personal-only contribution replacement. Personal CONTRIBUTING.md is standards-owned: the entire file and executable state are governed, and later project edits can conflict with its installed baseline. README guidance remains contextual, preserving project-owned facts and structure. Library and employer retain their current selections and referenced bytes.

| Declaration | Shared default | Personal complete result | Library complete result | Employer complete result |
| --- | --- | --- | --- | --- |
| final-newline | Exact .editorconfig | Inherit | Inherit | Inherit |
| readme-usage | Contextual README: screenshot, weekly review, working examples | Replace: terminal command and expected text output, weekly review, working examples | Inherit | Replace: team facts and actual support channel |
| contribution-route | Exact CONTRIBUTING: issue first and documented tests | Replace: documented tests only | Inherit | Excluded; project contribution content is outside this governance |
| release-notes | Absent | Absent | Add contextual CHANGELOG: changes and migration steps | Absent |

Each profile is an independent complete choice. The two personal replacements retain the same declaration IDs and use separate material. Troubleshooting is deferred to your next documentation session; review turnaround remains deferred. No skipped topic or non-preference creates policy.

All-profile validation passes with CLI 1.0.1 (exit 0, valid true). I checked every resolved declaration against this table; all checks and fixes lists are empty. This establishes structural validity, not future compliance or the usefulness of the guidance. No operations were generated or exercised.

Here is the whole resulting source and notes, including every referenced file. All listed files are non-executable (mode 0644).

### standards.yaml

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

### files/editorconfig

```text
root = true

[*]
insert_final_newline = true

# Maintainer annotation, not a policy change.
```

### files/contributing.md

```text
# Contributing

Open an issue before submitting a pull request.
Run the documented tests before submitting a pull request.
```

### files/personal-contributing.md

```text
# Contributing

Run the documented tests before submitting a pull request.
```

### guidance/readme.md

```text
# README usage

Describe the actual installation steps and supported commands.
Include a screenshot demonstrating a successful invocation.
Review the README every week to keep instructions current.
Preserve existing shell examples that still work.
```

### guidance/personal-readme.md

```text
# README usage

Describe the actual installation steps and supported commands.
Include a short terminal command demonstrating a successful invocation and its expected text output.
Review the README every week to keep instructions current.
Preserve existing shell examples that still work.
```

### guidance/employer-readme.md

```text
# Employer README

Keep team-owned facts and document the actual internal support channel.
```

### guidance/releases.md

```text
# Release notes

Describe user-visible changes and migration steps for each released version.
```

### authoring-notes.md

```text
# Authoring notes

## Confirmed decisions
- `final-newline`: exact `files/editorconfig` shared by all profiles so tools receive consistent final newlines.
- `readme-usage`: library retains contextual `guidance/readme.md`, including actual installation/commands, a successful-invocation screenshot, weekly review, and preserved working shell examples. Personal replaces the complete declaration with contextual `guidance/personal-readme.md`, substituting a short terminal command and expected text output for the screenshot; README content remains project-owned, and the other guidance is retained. Employer retains its replacement with team-owned facts and its real support channel in `guidance/employer-readme.md`.
- `contribution-route`: library retains exact `files/contributing.md`; opening an issue before a pull request coordinates work, then documented tests support review. Personal replaces the complete declaration with exact `files/personal-contributing.md`, removing the issue-first requirement to simplify contributions while retaining the documented-test instruction as identical whole-file content. Employer retains its exclusion because its own contribution process governs.
- `release-notes`: library alone uses contextual `guidance/releases.md` to make changes and migration steps discoverable.

## Non-preferences
- No numeric coverage threshold; avoid prescribing a percentage without context.

## Skipped topics
- Code organization and agent behavior were skipped to focus on documentation.

## Unresolved / explicitly deferred
- Whether personal README guidance should include troubleshooting: explicitly deferred until the next documentation session.
- Review turnaround targets: no decision; explicitly deferred to a later session.
```

Do you accept this entire source, all referenced file contents, and the notes as the completed local revision?

## Author turn 3

I accept the entire source, every referenced file, the profile selection table, and the authoring notes as shown. Troubleshooting and review turnaround are explicitly deferred as recorded. Finish the local revision after validating the final reviewed bytes and checking preservation; leave publication to a separate workflow.

## Agent final reply

The accepted local revision is complete at `/tmp/repo-standards-author-BydzfE/workspace/standards`.

Personal tools now use project-owned README guidance requiring a short terminal command and expected text output, and an exact CONTRIBUTING.md containing only the documented-test instruction. Library and employer selections and referenced bytes are unchanged. Troubleshooting and review turnaround remain explicitly deferred.

The final reviewed bytes pass all-profile validation with public CLI 1.0.1 under Node.js 24.11.1: exit 0, `valid: true`, no diagnostics. Final hashes and modes match the whole-source review. Only `standards.yaml` and `authoring-notes.md` changed; `guidance/personal-readme.md` and `files/personal-contributing.md` were added. HEAD, index, staged work, existing executable states, all other existing files, and pre-existing untracked material are preserved.

Evidence is in `/tmp/repo-standards-30-evidence/revision`, including the actual validation command, full JSON and exit status, review transcript, reviewed/final manifests, comparison diff, and preservation results. Validation establishes structural validity; no operations were generated or exercised, and future project compliance remains untested. Publication is a separate workflow: local source is not yet adoptable without a public GitHub source and stable tag. No provisioning, staging, commit, tag, publication, or adoption was performed.

## Evidence correction: reviewed file modes

The original whole-source review reply incorrectly stated that all listed files had mode 0644. The preserved reviewed-manifest.json records their actual modes as 0600, which are non-executable. Verification against archived reviewed-source files confirms that every archived file hash and mode matches that manifest. This correction changes only the evidence statement; no file-mode change was requested or performed. Original conversation turns and manifests remain unchanged. The live source was neither read nor changed for this correction.

Synthetic author clarification: I accept the archived reviewed file bytes and actual non-executable modes shown in reviewed-manifest.json; no permission-mode change was requested.

Verification details are retained in mode-correction-verification.json.
