# Project-specific contextual scope

Published specification: [Discover and confirm contextual file scope, #41](https://github.com/lutzseverino/repo-standards/issues/41).
The issue is the authoritative product specification; status statements below
record the interview, not current ticket progress.

Status: historical interview record. The final accepted simplicity review
supersedes conflicting choices below: discovery returns individual file paths,
no authored protections or directory subtraction are added, and amendments
permit additions only. The simplified design is endorsed; see
[the specification](contextual-scope-specification.md) and
[the review](contextual-scope-review.md). At interview time, ticket planning and
implementation were outside scope.
This document records the design process and does not describe available CLI
behavior. See [architecture](architecture.md) for current implementation contracts.

## Problem and scope

Repo Canon requires one standards source to identify maintained projects in
unfamiliar monorepo layouts, including projects with missing READMEs, without
treating fixtures, generated content, or organizational directories as projects.
It also requires documentation reorganization across old and new paths while
preserving exact-owned shared configuration under docs/agents.

The current explicit, disjoint target contract cannot express these needs.
Existing explicit-target sources must retain their behavior. Preserve
product-owned adoption orchestration, read-only inspection without author-code
execution, reserved targets, two-level profile resolution, and exact integrity
unless a specific contract change is agreed.

Repo Canon's standards preferences remain settled. Its separately committed
AGENTS preparation and repeat-safe GitHub setup operations remain the selected
workflows. Missing operations, automation, skill snapshots, and source manifest
are authoring work unless investigation establishes another product gap.

## Initial interview decisions, subject to the final accepted simplifications

### Q1: Semantic authority

The adoption agent interprets repository evidence and proposes project
membership. It explains inclusions, exclusions, and ambiguous cases for adopter
review. The deterministic CLI verifies concrete paths, protection rules, and
freshness; it does not establish semantic project membership. Unresolved
membership questions prevent presenting scope as complete.

For example, clients/mobile may need a README even when none exists, while a
manifest and README in test/fixtures/demo do not establish maintained-project
membership. The standards source supplies the applicable meaning of a project.

### Q2: Confirmation boundary

Discovery feeds one final inspection containing concrete contextual scope and
the rest of the proposed adoption. The adopter can correct scope before
confirming that inspection. Discovery is read-only. The inspection presents
included paths, missing files to create, exclusion rationale, protected content,
and operations. A subsequent scope change requires a fresh inspection and
confirmation. There is no separate mandatory scope approval.

### Q3: Author-supplied discovery guidance

Discovery is generic and explicitly enabled by a declaration. The author
supplies semantic discovery guidance; the product owns the procedure and
proposal format. The product does not hardcode categories such as monorepo
projects or documentation roots. Existing explicit-target behavior is preserved.

### Q4: Concrete paths, directory trees, and exact protection

Scope proposals support individual file paths and bounded directory trees.
Project READMEs normally use individual paths; documentation reorganization
can use directory trees. For the new capability, active exact-owned content
is automatically subtracted from contextual scope and its protection displayed.
Other contextual declarations remain disjoint. Confirmed directory scope
permits new descendants; adding targets outside it requires fresh confirmation.

### Q5: Declaration exclusion and path protection are distinct

Profile exclusion retains its current meaning: remove that declaration and
its operations. It does not globally prohibit another active declaration from
governing the former paths. A file that must remain outside contextual scope
requires a separate path protection, scoped to its contextual declaration as
settled in Q10. Exact author syntax remains to be designed.

### Q6: Discovery freshness

Discovery binds to the complete tracked and non-ignored project snapshot,
alongside existing Git and safety observations. Any change before adoption
requires refreshing the proposal and inspection. This conservative choice
covers new projects and evidence supporting exclusions, rather than trusting
an agent-selected list of evidence files to capture all dependencies. Ignored
content cannot silently become an untracked dependency of a scope decision.
Ignored-evidence, observation, and lifecycle details are settled in Q16,
Q20–Q25 and the consolidated specification.

### Q7: Documentation move evidence

Keep the existing deletion-plus-creation evidence model; do not add a dedicated
machine-readable move relation. The agent explains the correspondence and
preservation of useful content. Source paths, destinations, and files requiring
link repairs must all be in confirmed scope. Deterministic checks can verify
paths and links; semantic preservation remains part of agent assessment.

### Q8: Extend repository guidance

Repository guidance gains a choice between explicit targets and discovery
guidance. Discovery and contextual work use separate referenced guidance files.
Exact files, exact skills, and single-target contextual files retain their
existing forms. Syntax and compatibility are settled in Q13, Q19, and Q24.

### Q9: Two-pass inspection

When required scope is missing, inspect returns discovery instructions, a
project snapshot identity, and a blocker preventing adoption. The agent supplies
a versioned proposal using inspect --scope <file>. The resulting inspection
contains the complete proposal and its identity. Start receives the same
proposal and verifies the confirmed inspection identity. Temporary proposals
stay outside the adopting project. No separate discovery command is required.

### Q10: Declaration-local path protections

Authored path protections belong to their contextual declaration and are
inherited or replaced with the whole declaration. Exact ownership and reserved
paths remain product-enforced protections. A contextual directory may surround
protected content, but a directly requested protected file is an error.
Discovery exclusions must follow the source's guidance and include reasons;
they do not permit an adopter to skip unwanted standards.

### Q11: Complete discovery and empty scope

Every discovery declaration requires a coverage explanation, evidence
references, inclusion/exclusion reasons, and explicit unresolved questions.
An explained, reviewed empty scope is valid. Unresolved questions block
confirmation. The declaration and its operations remain active even when it
has no targets. The CLI validates evidence structure and references; the
adopter reviews semantic completeness.

### Q12: Same-pin re-adoption

An adopter can explicitly start a new adoption of the current standards and
CLI versions through fresh discovery, inspection, and confirmation. The normal
phases rerun, with existing integrity and clean-start requirements preserved.
This deliberately extends the current lifecycle, which rejects unchanged pins
with NO_UPDATE. It covers projects added after a previous complete adoption.
The invocation is settled in Q14. Scope amendments in Q15 address discovery
changes during an active run without requiring abandonment.

### Q13: Versioned compatibility

Introduce repo-standards/v2 while continuing to support v1 unchanged. Version
affected JSON interfaces explicitly. Authors deliberately migrate; older CLIs
must reject unsupported formats. Protocol applicability is settled in Q24;
package numbering follows release compatibility policy rather than mirroring
the format version number.

### Q14: Explicit re-adoption inspection

inspect --readopt requests re-adoption, followed by confirmed start --readopt
so the CLI reconstructs the same action when checking the inspection identity.
Plain retained inspection stays read-only and non-startable. The inspection
identity includes the requested adoption action.

### Q15: Confirmed amendments within an active run

Allow explicitly confirmed scope amendments within the active run. Inspection
reviews a fresh proposal against current working state; confirmation permits
continuation with revised scope. Selection and installed-content expectations
remain fixed. Previous assessments and checks are invalidated and amendment
history is preserved. Amendments never retroactively authorize earlier
out-of-scope writes. The agent rechecks scope after fixes and during contextual
assessment. Commands, phase restrictions, and historical accounting are
settled in Q21–Q22.

This adds a deliberate continuation path. It does not establish complete
ownership from an abandoned run or promise that abandonment plus a commit
makes incomplete installation restartable.

### Q16: Ignored content within confirmed scope

For the new workflow, observe complete confirmed directory trees throughout
the run, including ignored entries. Existing ignored content is protected from
contextual changes. Newly created ignored content or unsafe entries prevents
completion. Ignored files outside these trees remain outside this added
observation and cannot be hidden discovery dependencies.

### Q17: Effective scope for author operations

Operations receive the same concrete targets and protections used by inspection
and assessment. For v2, compare each fix's observed changes against its owning
declaration's effective scope. Checks remain read-only. Violations result in
incomplete adoption with changes preserved. Scripts remain trusted code with
host and network access; this is observed enforcement, not a sandbox.

### Q18: Durable discovery evidence

Retain discovery guidance, the accepted proposal and rationale, evidence
references, snapshot identities, and effective protections. Retained inspection
can explain a previous decision without the source being available. Re-adoption
requires fresh discovery; historical evidence does not establish current
coverage. Active-run amendment history is retained as required by Q15.

### Q19: Author syntax and effective overlap

A v2 repository declaration contains kind: repository, guidance, exactly one
of targets or discovery, and optional protect containing paths/directories.
Both guidance fields reference source files. Explicit v2 repository targets
may also use protections. Validate contextual overlap after subtraction so
one declaration can protect a subtree governed by another. Directly targeting
a protected file or directory is an error. Reserved-path and reserved-ancestor
bans are checked before subtraction and remain in force.

### Q20: Verifiable proposals

Bind proposals to a CLI-issued discovery request identity covering selection,
action, project snapshot, and applicable run revision. Require one entry per
discovery declaration. Evidence references observed files, directory inventories,
or target absence; the CLI derives their identities. A missing README also
needs positive evidence that its project qualifies. Normalize unordered lists
while binding rationale text into confirmation.

### Q21: Amendment eligibility and historical work

Amendment is permitted at the contextual handoff or a later contextual/check
block, once operations have definite outcomes and installed integrity passes.
Use inspect --amend-scope, followed by resume --amend-scope --scope <file>
--confirm <identity>. Before accepting it, validate earlier changes against the
outgoing scope and retain that evidence. Narrowing scope preserves previously
authorized work and file contents. An amendment cannot clear a scope violation.

### Q22: Fixes after amendment

Rerun repeat-safe fixes against revised scope, followed by fresh contextual
assessment and checks. Separate observation boundaries distinguish fix effects
from agent work. If fixes reveal another scope change, require another explicit
amendment. The selection and installed-content expectations remain unchanged.

### Q23: Stable ignored-content protection

Ignored means ignored untracked content. Tracked files remain tracked even
when their names match ignore patterns. An entry protected as ignored remains
protected for the rest of the run, including amendments; a .gitignore edit
cannot silently grant contextual write authority. These protections apply to
contextual fixes and agent work.

### Q24: Feature applicability and protocols

Explicit re-adoption is available for v1 with its existing targets and
protocols. Discovery, scope amendments, protected scopes, and stronger
observation/enforcement require v2; both explicit and discovered v2 scopes
receive those protections. Use v2 inspection, operation-input, and assessment
protocols where their shapes change. Keep the existing operation-result format.
Exact-content integrity forbids a fix from rewriting even its own exact files.

### Q25: Observation settings and ignore-input freshness

Bind relevant effective observation settings and consulted ignore inputs,
including absence, to discovery and amendment identities. Changes require
refreshed confirmation. Preserve accumulated ignored-content protections within
the run. Do not retain unrelated Git configuration or credentials.

### Q26: Only discovered targets are amendable

Amend discovered targets only. Explicit targets, authored protections, guidance,
and operations remain fixed by the selection; changing them requires a source
revision. Show added and removed scope during amendments and subsequent
adoptions. Removing governance preserves content and earlier authorized work.

## Behavior verified at interview time

- No pre-confirmation scope proposal interface exists. Current work requests
  take their targets directly from resolved declarations.
- Target validation rejects globs, root targets, and any active target overlap,
  including a contextual directory containing an exact file.
- A confirmed directory already permits new descendants. A new file inside
  that directory differs from adding an unconfirmed target outside it.
- Contextual evidence already accounts for additions, deletions, edits, and
  executable-bit changes. A move is observed as deletion plus creation; no
  dedicated rename relationship exists.
- Inspection observes affected targets and Git state, but does not hash all
  unrelated working-file bytes. Broader discovery needs an explicit freshness
  contract. Assessment snapshots cover tracked and non-ignored untracked
  content, excluding generated product state.
- Profile exclusion removes a declaration and its operations. It does not
  permanently protect its former paths from other active declarations. The
  test in test/path-validation.test.ts explicitly permits another declaration
  to target the excluded declaration's former path. Interpreting the handoff's
  phrase "profile exclusions" as a global path prohibition would change this
  contract.
- Same-pin re-adoption is currently blocked by NO_UPDATE. Retained inspection
  is read-only, and resume requires an incomplete run. Applying standards to
  newly added projects after a completed adoption therefore needs a lifecycle
  decision; it is not already supported by resume.
- Fixes run before contextual work and its initial baseline. They can change
  discovery evidence; the current product has no discovery revalidation phase.
  Retry keeps the existing scope. Abandonment preserves changes, while a new
  start still requires a clean committed project.
- Directory inspection observes ignored descendants and rejects unsafe entries,
  but subsequent contextual snapshots omit ignored untracked content. New
  ignored files or symlinks are outside that continuing evidence guarantee.
- An operation's declared prerequisite probes its executable, not a graph of
  subprocess dependencies or remote permissions. Author operations can detect
  missing gh/auth/permissions and return blocked, including after partial
  effects. This meets the accepted incomplete-setup contract; requiring those
  conditions verified before exact installation would be an additional choice.
- GitHub provisioning/readback and native issue-shape validation remain
  compatible with author operations and configuration. No additional product
  gap was established for them. Remote freshness, ownership, and rollback
  remain outside the accepted contract.
- Abandoning a partial first adoption and committing its files does not make
  it restartable. Candidate lock/runtime/skill material lacks a last-complete
  ownership baseline, and abandonment removes continuation snapshots. Updates
  can likewise leave candidate material inconsistent with prior complete
  state. Recovery needs explicit reconciliation or a designed continuation
  mechanism; same-pin re-adoption alone does not solve this.
- Discovery guidance requires explicit addition to retained-input enumeration
  and validation. References in prose are not automatically retained.
- Completed durable state retains check result messages, but not detailed
  local logs or fix results as check evidence. Authored final checks can retain
  concise GitHub readback summaries in their result messages.

Evidence: src/cli.ts, src/resolver.ts, src/paths.ts, src/inspection.ts,
src/adoption.ts, src/assessment.ts, docs/author-format.md,
docs/assessment-protocol.md, and test/path-validation.test.ts. The session
reviewed code and existing tests; it has not run new behavior tests.

## Consolidated outcome and final review

Q1–Q26 record the initial interview. The user's final correctness and complexity
review led to two accepted reductions: discovered file paths reuse existing
disjoint validation, and active scope can grow but cannot shrink or transfer
between declarations. The additional protection language and broad ignored-tree
observation promises are superseded. Source-only versus project-specific
validation and sequential-observation limits remain verified facts. Current
artifacts are:

- [Product specification](contextual-scope-specification.md).
- [Public interfaces](contextual-scope-interfaces.md).
- [Correctness and simplicity review](contextual-scope-review.md).
- [Semantic discovery decision](../adr/0003-use-agent-discovery-with-confirmed-concrete-scope.md).
- [Scope amendment decision](../adr/0004-amend-scope-without-redefining-installed-ownership.md).

The user explicitly excluded ticket planning. The agent-created local ticket
plan was removed. The user accepted both reductions and authorized to-spec;
the simplified design is endorsed and published as issue #41. The issue body
and ready-for-agent label were read back and verified. Neither implementation
nor live Repo Canon adoption has been requested.

## Source artifacts

These paths record provenance in the original authoring environment; they are
not required inputs for reading this archive or implementing issue #41.

The originating local handoff is
/tmp/repo-canon-support-grilling-handoff.0IyDgr.md. Supporting Repo Canon
artifacts live in /srv/dev/projects/repo-canon: authoring-notes.md,
design-review.md, CONTEXT.md, docs/adr/README.md, and
docs/development/{adoption-compatibility,scope-capability-specification,upstream-compatibility}.md.
