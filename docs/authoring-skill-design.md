# Standards authoring skill design

Status: accepted design, recorded before implementation. The authoritative
specification and implementation tracking are in
[issue #25](https://github.com/lutzseverino/repo-standards/issues/25).
The decisions below describe the full intended feature, not a claim that every
implementation slice has shipped.

## Agreed decisions

- The skill interviews an author to discover their preferences. It can also
  consult existing repositories, instructions, or saved preferences supplied
  as reference material. Observed patterns are candidates for confirmation;
  they do not automatically become author preferences.
- The output is a valid standards source: `standards.yaml` and its referenced
  files, guidance, and skills. Tool configuration can be included where the
  existing author format supports it.
- The skill recommends concrete policies and explains their trade-offs. The
  author decides whether to adopt them. Having no preference is valid and must
  not silently become the agent's preferred policy.
- Authors need no prior knowledge of profiles, declarations, or the author
  format. The interview uses concrete working scenarios and translates the
  author's answers into the format.
- The interview begins with a brief overview of testing, code organization,
  documentation, review, agent behavior, and tooling. Authors choose areas to
  explore and may explicitly skip others; exhaustive coverage is not required.
- The first version supports creating a standards source and revising an
  existing one. Revision starts by inspecting the source, then focuses on the
  requested change and any conflicts it creates.
- The skill finishes with a reviewed, validated local standards source. Creating
  its local directory and files is part of authorship. Git/GitHub repository
  provisioning and publication belong to a separate workflow; a local source
  alone is not adoptable under the current public GitHub and stable-version
  requirements.
- The skill presents small concrete drafts as preferences emerge, with examples
  of when each proposed rule applies. The author refines them during the
  interview and reviews the complete source at the end.
- Ask early about distinct working contexts. Start with one profile and add
  profiles only for meaningful differences the author confirms. Common
  declarations belong in defaults.
- The skill chooses declaration forms and explains their practical ownership
  effects in drafts. When ownership is ambiguous, ask whether projects must use
  identical content or satisfy shared intent with project-specific content.
- Generate configuration and guidance where sufficient. Propose checks, fixes,
  and author skills when they add clear value, and include them after the author
  accepts their behavior and prerequisites. A confirmed policy does not itself
  imply an enforcement mechanism.
- An explicit new author choice is intended for the current scope. Show
  conflicting existing rules and the resulting revision; ask when the scope is
  unclear, such as whether the change applies to other profiles.
- Keep lightweight authoring notes in the standards repository, recording
  confirmed decisions and rationale, explicit non-preferences, skipped topics,
  and unresolved questions. These support resuming interviews; the standards
  source remains authoritative for adoption.
- The interview is complete when the author has reviewed the source, every
  chosen topic is resolved or explicitly deferred, and validation passes.
  Deferred topics produce no invented policies. If the author confirms no
  standards, report that outcome instead of manufacturing a source to satisfy
  validation.
- Validate the source format and review how every declaration represents a
  confirmed preference. Exercise generated checks and fixes in disposable
  fixtures, including failure cases and repeated fixes. Report missing
  prerequisites and unverified behavior explicitly.
- Acceptance of the skill requires real-agent creation and revision journeys
  demonstrating faithful output, skipped preferences, profiles, and successful
  resumption.
- If notes disagree with subsequently edited standards, the current source
  remains authoritative for what is published. Surface the disagreement before
  changing the affected policy; do not restore an old rule solely from notes.
  Reconcile notes once intent is clear. Notes should be concise, suitable for a
  potentially public repository, and omit personal interview transcripts.
- Hand off the local source to the repository/publication workflow when the
  author wants to proceed. The authoring skill does not own repository
  provisioning, commits, tags, releases, or application of standards to a project.
  A separate repository-creation skill is not required for this feature.

## Existing boundaries

The author format and adoption procedure remain governed by
[architecture](architecture.md) and [author format](author-format.md).
Authorship and adoption are separate responsibilities, as recorded in
[ADR 0001](adr/0001-separate-authorship-from-adoption.md).
The authoring skill's completion boundary is recorded in
[ADR 0002](adr/0002-finish-authoring-at-a-validated-source.md).

The design extends the existing adoption skill and manual authoring workflow.
Issue #25 and its implementation tickets govern scope and acceptance; this
record preserves the agreed decisions and their boundaries.

### Agreed author-contract extension

Reserve `author-standards` as a product-owned system skill name, alongside
`adopt-standards`. Standards sources must not install a competing skill under
that name, including by targeting its repository-local skill directory through
another declaration form. Name and target validation and the public author
and architecture contracts must remain consistent with this reservation.

Reservation does not automatically install the authoring skill into adopting
projects or control unrelated global installations. Adoption keeps its existing
project-managed skill and runtime ownership. The standards schema and profile
resolution rules do not change for this feature.

## Distribution decision and findings

The [Agent Skills specification](https://agentskills.io/specification) defines
the portable skill directory and `SKILL.md` format. Its compatibility field
describes environment requirements; scripts must be self-contained or document
their dependencies.

[skills.sh](https://www.skills.sh/docs) supplies discovery and a CLI installation
path. Its [FAQ](https://www.skills.sh/docs/faq) says leaderboard listing follows
installation telemetry from GitHub-hosted skills. This is distinct from npm
delivery of the Repository Standards executable.

Offer `author-standards` through conventional skill installation and skills.sh
discovery, recommending global installation for use before or across
repositories. Retain npm delivery of the executable. Keep project adoption
governed by its installed skill and matching pinned CLI.
An independently installed skill must explain acquisition of a compatible CLI
and access to its matching documentation; npm package-relative resources must
not be silently assumed to exist after a standalone skill install.

## Acceptance criteria

1. Install the skill through the documented conventional skill route and use it
   without a product checkout, adopting project, or surrounding npm-package
   directory. Supporting resources are available and acquisition of a compatible
   CLI and matching documentation is explicit.
2. In a real-agent creation journey, an author unfamiliar with the format can
   choose topics, review concrete proposals, and obtain a source that validates
   across all profiles. Every generated policy traces to a confirmed preference;
   inferred practices and recommendations do not become policy without agreement.
3. Confirm meaningful differences between working contexts and represent them
   through defaults and complete profiles under the existing resolution rules.
   Explain exact ownership versus contextual guidance in terms the author can
   review.
4. Exercise explicit non-preferences, skipped and deferred topics, and the case
   where no standards are confirmed. None produces invented policies, and the
   no-standards outcome does not manufacture a source solely to pass validation.
5. In a real-agent revision journey, inspect an existing source, apply a changed
   preference to its intended scope, and surface conflicting rules and ambiguous
   scope. Preserve unrelated standards and changes.
6. Resume from authoring notes and the current source. If manual source edits
   disagree with notes, surface the disagreement and reconcile intent without
   restoring stale policy solely from notes. Notes omit personal transcripts.
7. Include checks, fixes, and author skills only after their behavior and
   prerequisites are accepted. Exercise generated operations in disposable
   fixtures, including check failures and repeated fixes. Report missing
   prerequisites and unverified behavior without claiming verification.
8. Finish at author-reviewed, validated local material, with chosen topics
   resolved or explicitly deferred. Hand off publication separately; do not
   claim that a local source is already adoptable or provision, publish, or adopt
   as part of the authoring skill.
9. Reject standards material that competes with the reserved `author-standards`
   name or installation target. Keep existing adoption skill installation,
   runtime pins, updates, and ownership behavior intact.
10. Document and verify the discovery/installation route with observed evidence,
    distinguishing direct installation from appearance in skills.sh rankings.
    Run the repository's required validation and record real-agent evidence
    separately from deterministic checks.

## Interview completion

All design branches are settled. Repository provisioning and publication are
explicit handoffs; creating an adopting project or a separate
`create-repository` skill is outside this feature.
