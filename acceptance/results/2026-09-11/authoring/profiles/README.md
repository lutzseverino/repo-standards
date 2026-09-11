# Confirmed working contexts — issue #28

Two fresh agents exercised the installed local `author-standards` candidate on
macOS with Node.js 24.11.1. The implementation agent acted as a synthetic author,
answered live drafts, and accepted every source file. This is real-agent evidence
with an evaluator author, not a human usability study or historical replay.
Neither agent received the product checkout, issue text, expected source, or
previous examples. `acceptance/prepare-author.ts` installed each isolated copy
through `skills@1.5.25`, then removed the installation input. Both agents acquired
public npm CLI **1.0.1** separately and read its matching format documentation.
This establishes local candidate skill installation and public CLI acquisition;
public skill distribution/discovery remains #31. Linux was not exercised here.

## Confirmed differences and ownership

The [live context interview](contexts/transcript.md) begins with a short topic
overview and asks about actual differences. The author accepts personal and
employer differences but rejects a language split. Small drafts explain exact
ownership, contextual intent, costs, and applicability before source generation.
The contribution-instructions ambiguity is resolved explicitly: identical whole
personal instructions, but employer-owned instructions describing the real team
process. Every resulting policy and difference maps to these accepted drafts:

| Accepted choice | Personal complete selection | Employer complete selection |
| --- | --- | --- |
| Identical final-newline editor configuration everywhere | Inherits exact `final-newline` | Inherits the same complete declaration |
| Personal issue-opening instructions; employer's actual review route | Inherits exact `contribution-route` | Replaces the whole declaration with contextual guidance; no inherited `exact` field or issue-opening rule |
| Personal installation/usage guidance; team-managed employer README outside contextual governance | Inherits contextual `readme-usage` | Excludes the declaration; no deletion of project content is requested |
| Employer colleagues need their actual vulnerability reporting channel | No security declaration | Adds contextual `vulnerability-reporting` for `SECURITY.md` |

The author reviewed and accepted all seven files in the
[resulting source](contexts/source/standards.yaml), its
[notes](contexts/source/authoring-notes.md), and the complete selection table.
Defaults plus independent `personal` and `employer` profiles use existing stable
IDs and two-level resolution, without schema changes or field merging. Both
languages use those same profiles. The shared editor configuration still requests
final newlines everywhere; the author explicitly accepted this alongside the
absence of contextual employer README governance. Skipped topics, no coverage
preference, and deferred operations produce no extra declarations.

The [final validation](contexts/validation-final.json) records the installed
command, exact version, exit 0, full stdout, and empty stderr. Its complete
resolved profiles match the accepted table, including absence of the replaced
`exact` field and excluded README ID. The agent retained a
[selection comparison](contexts/selection-comparison.md); independent
[verification](contexts/verification.json) checked profile membership, ownership
replacement, shared inheritance, no operations, workspace boundaries, installed
skill hashes, and copied source hashes/modes. All seven
[reviewed hashes](contexts/reviewed-files.json) equal the final hashes.

## No accepted differences

In the second [fresh interview](shared/transcript.md), the author explicitly wants
the same exact newline configuration for personal/employer and JavaScript/TypeScript
tools. The agent creates one `shared` profile, with one inherited declaration and
no extra policies. The author accepts all three [source files](shared/source/standards.yaml)
and notes. [Final all-profile validation](shared/validation-final.json) passes
with CLI 1.0.1, exit 0, and no errors. [Verification](shared/verification.json)
confirms the single complete selection, preserved source copies, matching installed
skill hashes, and no Git or adoption state. This freshly exercises the retained
single-profile behavior; earlier #27 evidence is not relabeled as current.

## Completion and coverage

Both transcripts finish after whole-source acceptance and final validation.
[Context handoff](contexts/completion.md) and [shared handoff](shared/completion.md)
identify local, unpublished material and leave repository provisioning/publication
to a separate workflow. No authoring agent provisioned, committed, tagged,
released, or adopted. Product evidence commits are a separate implementation task.
No generated operations were exercised. Structural validation and selection
comparison do not establish guidance usefulness or future project compliance.

This owns parent #25 story 13 and the multi-profile/ownership portion of Testing
Decisions 3, extending stories 12 and 14. It also extends all-profile validation,
notes, review, and handoff coverage. Generated operations, scoped revision,
resumption, and public skill discovery remain separate tickets.

## Deterministic validation

The existing installed CLI test for all four forms passed, demonstrating full
inheritance, replacement (including operation removal), exclusion, and addition.
Both focused release tests passed, including packaging the new profile resource.
Typechecking and build passed during development. No resolver behavior changed;
the existing public-seam tests cover its established contract, while the fresh
agent journeys cover the changed conversational behavior.

The full [`pnpm validate` run](validation.txt) exited **0** on macOS:
typecheck and build passed; **379 tests passed, 1 skipped, 0 failed** (380 total).
The skipped case requires a case-sensitive filesystem containing both `foo` and
`FOO`. The full run started before the review clarification below; the final
resource was also checked with the focused post-review packaging test.

## Independent review

### Standards

No hard standard violations or actionable code smells. One wording judgment was
fixed: the guide now says “If no meaningful differences remain accepted” in place
of “If the remaining differences are declined or deferred.” This makes clear that
declining an additional language split preserves accepted personal/employer
profiles. Both live journeys already showed that intended behavior. Their
installation hashes identify the pre-clarification candidate; this two-line prose
change occurred afterward, without changes to their accepted source or output.
The verification records preserve that distinction rather than claiming the final
guide bytes were used in the earlier interviews.

### Spec

No findings. Every #28 requirement and generated difference maps to the accepted
transcripts, source, and complete CLI selections; no schema/runtime change or
scope extension was needed.

The Standards reviewer confirmed the correction resolved the concern. The
[post-review release artifact test](release-after-review.txt) passed against the
final guide bytes. Initial findings: Standards 1 clarity judgment (fixed), Spec 0.
Remaining findings: Standards 0, Spec 0; no hard violations.
