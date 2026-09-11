# Authoring notes

## Confirmed decisions

- `final-newline`: Both profiles inherit the identical, non-executable `.editorconfig` from `files/editorconfig`. Whole-file ownership and replacement are intentional so supporting editors share the final-newline setting. This configuration does not prove every file complies.
- `contribution-route`: The personal profile inherits the exact, non-executable `CONTRIBUTING.md` from `files/personal-contributing.md`: open an issue before a large change. Whole-file ownership and replacement are accepted for this simple personal workflow. The employer profile replaces the entire declaration with project-owned `CONTRIBUTING.md` guided by `guidance/employer-contribution-route.md`, because each team must describe its actual review route. The personal issue-opening rule does not carry over.
- `readme-usage`: The personal profile inherits project-owned `README.md` guidance from `guidance/readme-usage.md`, because readers need accurate installation and usage instructions. The employer profile excludes this declaration completely because team-managed READMEs must remain outside governance; exclusion leaves project content in place.
- `vulnerability-reporting`: Only the employer profile adds project-owned `SECURITY.md` guidance from `guidance/vulnerability-reporting.md`, because colleagues need the team's actual internal reporting channel. Unknown channels require asking the project team, never inventing an address.
- `personal` and `employer` are separate complete choices because ownership and governed documents differ. JavaScript and TypeScript follow the same expectations; no language-specific profile is needed.

## Non-preferences, skipped topics, and deferrals

- No coverage percentage preference; no coverage policy is generated.
- Testing, code organization, and agent behavior are skipped.
- Automated checks and fixes are deferred; no operations are generated.
- No other authoring decisions remain unresolved. Actual employer review and reporting details are project facts to establish during contextual assessment.

These notes explain the accepted source; they do not independently govern adoption. The material is local and unpublished. Validation establishes structural validity, not guidance usefulness or future project compliance.
