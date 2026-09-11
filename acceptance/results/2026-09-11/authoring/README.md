# Local authoring candidate acceptance — issue #27

Two fresh agent sessions used conventionally installed copies of the
`author-standards` candidate on macOS arm64, Node.js 24.11.1 and npm 11.6.2.
The parent evaluator played a **synthetic author** unfamiliar with the format,
supplied live answers after seeing each draft, and accepted the complete output.
This is real-agent behavioral evidence with an evaluator acting as the author,
not a human usability study or a scripted assessment replay. Neither agent was
given the product checkout, parent specification, expected source, or earlier
examples as context; both worked in separate temporary workspaces.

## Standalone installation

Each run used `acceptance/prepare-author.ts`: actual `skills@1.5.25` acquisition
and `skills add ... --global --agent codex --copy --yes`, with child-process home
directories isolated and telemetry disabled. Setup copied only the skill into a
temporary catalog and removed the catalog after installation. There was no
adopting project, product checkout, or surrounding npm product package in either
workspace. The installed skill carried `references/cli.md`; resource SHA-256
hashes and commands are in the session records.

- Creation: [installation output](creation/installation.txt),
  [session and resource hashes](creation/journey.json).
- No standards: [installation output](no-standards/installation.txt),
  [session and resource hashes](no-standards/journey.json).

The creation agent then acquired the exact public npm CLI **1.0.1** in another
temporary directory and read that installation's matching format documentation:
[acquisition evidence](creation/cli-acquisition.md). This is **local candidate
skill installation with public npm CLI acquisition**. Public skill installation
and observed skills.sh discovery belong to #31; no listing, ranking, or public
availability of this skill is claimed. Linux was not exercised in these new
agent journeys.

## Creation and progressive review

The [live transcript](creation/transcript.md) records the six-topic overview,
chosen working context/depth, optional instruction reference, recommendations
with costs and applicability examples, draft correction, and whole-source
review and acceptance. The source is new agent output, not a copied fixture.

| Accepted preference | Result and ownership | Acceptance in transcript |
| --- | --- | --- |
| Two-space indentation for JavaScript/JSON, final newline for all files | `editor-formatting`: [exact configuration](creation/source/files/editorconfig) targets the whole `.editorconfig` | Responses 1–3; response 2 narrows the initial all-file indentation draft; response 3 accepts the revised bytes and ownership |
| A newcomer can run the tool and recognize success without prescribed headings | `newcomer-run-guide`: [contextual guidance](creation/source/guidance/readme.md) for project-owned `README.md` | Responses 1–3; response 2 adds a successful-run description |
| Keep parsing separate from independently exercisable reusable logic, only under `src` | `reusable-cli-logic`: [repository guidance](creation/source/guidance/code-organization.md) for that explicit directory tree | Responses 2–3; accepted without a fixed layout or automated operation |

[standards.yaml](creation/source/standards.yaml) defines exactly one `tools`
profile inheriting those three declarations from defaults. All five files,
including [authoring notes](creation/source/authoring-notes.md), were shown in
full and accepted in the whole-source acceptance turn. Final CLI validation ran after that acceptance:
[full command, exit status, JSON, version and reviewed-file hashes](creation/validation-final.json).
It returned exit 0, `valid: true`, no errors, and the complete resolved `tools`
profile. [Independent verification](creation/verification.json) confirms retained
bytes/modes match the review, installed skill hashes match the candidate, there
are no generated operations, and the workspace has no Git or adoption state.

The incidental tabs, 90% coverage, and single-`index.js` instruction produced no
policy. Coverage and fixed layout remained explicit non-preferences; review
rules were skipped; the website context, test strategy, and agent behavior were
explicitly deferred. Notes map accepted choices to declarations and rationale,
retain these non-decisions, and omit the interview transcript.

The agent's final turn distinguishes structural validity from guidance usefulness
and future compliance, and hands off repository setup/publication. No repository
was provisioned, committed, tagged, released, or adopted by the authoring agent;
it did not describe local material as already adoptable. No generated operations
were exercised. Committing these evidence copies to the product repository is
the implementation workflow, separate from the author's local source journey.

## No confirmed standards

In the [separate live transcript](no-standards/transcript.md), the author declines
to endorse saved tabs/coverage advice, states non-preferences, skips topics, and
explicitly defers the remainder. The only output is
[concise non-decision notes](no-standards/workspace/authoring-notes.md).
[Completion evidence](no-standards/completion.md) reports no source and validation
as not applicable. The [final inventory](no-standards/verification.json) confirms
only that notes file exists: no filler `standards.yaml`, policies, Git repository,
or adoption state. No CLI was acquired unnecessarily.

## Coverage and deterministic checks

| Parent #25 requirement | Evidence |
| --- | --- |
| Stories 1–9 | Live overview, plain-language choices, optional references, trade-offs, examples, and revised drafts |
| Stories 10–12, 14–15 | Acceptance-to-declaration mapping above; complete material; one profile; ownership/scope review; configuration/guidance without operations |
| Stories 19–21 | Whole-source acceptance, all-profile public CLI result, separate no-standards outcome |
| Stories 25–26 | Both concise public-suitable notes files; transcripts retained separately as synthetic test evidence |
| Stories 28–31 | Completion handoff, local conventional installation, global-install recommendation, external compatible CLI and matching docs; public route/discovery remains #31 |
| Testing Decisions 1, 2, 4, 8 and single-profile portion of 3 | Installed-skill journeys, revised accepted source, all non-decision cases, final review/validation/handoff, three ownership forms |

The package acceptance test first failed because the installed artifact lacked
`author-standards/SKILL.md`, then passed with both the skill and its acquisition
resource shipped. The focused `test/release.test.ts` passed both tests; skill
frontmatter validation and regular TypeScript checks also passed.

The full [`pnpm validate` log](validation.txt) records exit 0 on macOS:
typecheck and build passed; **379 tests passed, 1 skipped, 0 failed** (380 total).
The skipped case requires a case-sensitive filesystem with both `foo` and `FOO`.
After a setup-only cleanup of terminal control codes and a variable name,
`pnpm typecheck` and a fresh isolated `prepare-author.ts` installation also passed.
Deterministic checks do not establish interview quality, and these
agent journeys do not replace package, resolver, or adoption regression tests.
Distinct profiles, generated operations, revision/resumption, and public skill
discovery remain outside this ticket.

## Independent review

Two separate read-only reviewers checked the staged implementation against the
starting commit `5d5ecdee5fdd62e74d56b837ca9d013fd572a8c7` before delivery.
The Standards axis reported no documented-standard violations or actionable
baseline smells. The Spec axis reported no missing requirements, incorrect
behavior, or scope creep within #27. **Standards: 0 findings. Spec: 0 findings.**
