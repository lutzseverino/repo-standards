# Accepted operations and author skill — issue #29

A fresh authoring agent used the conventionally installed local candidate on
Linux arm64, Node.js 24.11.1, and npm 11.19.0. The parent evaluator played a
**synthetic author**, answering live after each proposal and reviewing the actual
generated material. This is real-agent workflow evidence, not a human usability
study or a scripted interview replay. The agent received the installed skill,
an empty external workspace, and the opening request; it was instructed not to
read the product checkout, examples, or earlier journeys.

## Installation and accepted choices

`acceptance/prepare-author.ts` installed the candidate with `skills@1.5.25`
using isolated child-process home directories, then removed the installation
input. [Installation output](installation.txt) and [session metadata](journey.json)
record the command and hashes of the skill and its two bundled guides. The
[tested candidate snapshot](tested-skill/SKILL.md) preserves those exact bytes;
the later integration with #28 is recorded separately below. The agent
separately acquired public npm CLI **1.0.1** and its matching format/protocol
documentation. This demonstrates local candidate skill installation with public
CLI acquisition, not public skill installation or discovery. macOS was not run.

The [live transcript](transcript.md) records the author's choices and acceptance
before source creation, plus the actual commands, corrections, and final review.

| Confirmed preference | Generated material and ownership |
| --- | --- |
| Keep each project's own support destination, with an honest unverified placeholder when absent | `support-file`: [contextual guidance](source/guidance/support.md) for project-owned `docs/support.json` |
| Catch a missing or malformed support file without claiming destination verification | [Read-only check](source/operations/check-support.mjs), Node 24, empty literal argument list, 10-second timeout |
| Create only a missing file; preserve all existing bytes, including malformed/partial content | [Repeat-safe fix](source/operations/create-support.mjs) with a separately declared [placeholder resource](source/resources/support-placeholder.json); same Node prerequisite and timeout |
| Draft a Markdown bug report with reproduction steps, expectations, observations and actual attempted-action evidence; never submit it | `bug-report-routine`: complete ordinary-work [author skill](source/skills/draft-bug-report/SKILL.md), with accepted local tools and bounded Node reproduction |

The source has one `node-cli` profile inheriting both declarations. Other topics
were explicitly deferred. [Authoring notes](source/authoring-notes.md) map choices
to material and record limits without copying the conversation. The transcript
is synthetic acceptance evidence kept outside the generated source.

Live review clarified that the declared repair runs with adoption of its owning
policy, and local edits to an exact skill block updates; permitted updates
replace the whole unchanged directory. Review also caught an order-sensitive
`allowedTargets` comparison. The agent corrected it without changing accepted
scope and added reordered-object exercises before final review.

## Actual operation outcomes

The agent's [exercise harness](exercise-operations.mjs) invoked generated scripts
directly through `repo-standards/operation/v1`, using the public CLI's resolved
declarations. It copied only each script and its declared resources into an
external retained-source layout. Requests contain explicitly synthetic provenance;
no Git repository was provisioned and no source was committed, published,
inspected, or adopted.

[Full summary](operation-evidence/summary.json) records **25 successful exercise
assertions**, including intentionally failed/blocked protocol results:

- Missing file: zero-exit `failed` check, then `changed` fix, `unchanged` repeat,
  and `passed` check. Only the allowed file and its missing parent were created.
- Configured destinations, malformed JSON, and partial files remained identical
  in bytes and modes. The check passed configured content and failed bad content.
  Directory-only partial state was repaired successfully.
- Unsuitable filesystem types, symlinks, and wrong allowed scope returned
  `blocked` without mutation. Valid reordered JSON scope fields worked.
- Every check, including failed and blocked checks, preserved the full fixture
  inventory. Unrelated sentinel files and a local skill remained unchanged.
- [Controlled missing Node](operation-evidence/controlled-missing-node.json)
  used an empty executable search path. Both probes actually returned `ENOENT`;
  neither operation ran and that fixture's behavior remained **unverified**.
  The available-Node exercises separately observed version 24.11.1.

Individual numbered JSON records retain requests, literal command vectors,
prerequisite output, process status, parsed results, and complete before/after
inventories with base64 file bytes and modes. These snapshots preserve the fixture
inputs/outputs without committing symlinks pointing at temporary directories.
The original absolute paths identify this run; the harness is its recorded
exercise, not a new product command or portable fixture runner.

These exercises demonstrate generated behavior, not the CLI adoption lifecycle
or a sandbox. No exclusion was invented in this one-profile source; excluded
operations and nonempty/shell-looking literal arguments are covered separately by
the installed-CLI tests. Permission-denied paths, hostile concurrent filesystem
changes, actual process-kill interruption, and macOS were not exercised here.
Partial retry was checked through constructed partial states.

## Author-skill exercise and completion

The authoring agent read and applied the generated skill to a harmless local
[addition fixture](skill-evidence/fixture/add.mjs). The [exercise request](skill-evidence/exercise-request.md),
[actual process evidence](skill-evidence/execution.json), and [Markdown draft](skill-evidence/report.md)
show the supplied expected sum `5`, observed stdout `23`, Node version and command,
unchanged fixture bytes/modes, and explicit untested cases. No report was submitted.
The synthetic author read the complete draft and accepted it as useful **for this
example only**. The same authoring agent performed the skill exercise; this is not
an independent human evaluation or evidence of general usefulness.

The [whole-source review](complete-source-review.md) showed every source file in
full and separated structural validation, operation evidence, and skill evidence.
After the author's final live acceptance, [completion evidence](completion-evidence.json)
recorded a fresh all-profile validation: exit **0**, `valid: true`, no errors,
and the complete resolved `node-cli` profile. All seven source hashes/modes
matched the reviewed inventory. [Independent verification](verification.json)
also confirms the archived bytes match that review, installed skill hashes match
the tested candidate snapshot, and the executed retained scripts/resource match
the final source.

The final workspace contains the seven source files and no Git or adoption state.
The [completion handoff](completion.md) leaves repository setup and publication
to a separate workflow; this local source is not yet adoptable. Committing these
copies to the product repository belongs to implementation, outside the authoring
journey. Original absolute paths in raw records identify the disposable run;
the archive retains final numbered operation records, not the superseded initial
23-run directory mentioned in the transcript.

## Deterministic validation and review

The package acceptance test first failed because the new operation exercise
guide was absent, then passed with the guide shipped in the installed artifact.
Regular typechecking and build passed. Focused source/operation validation passed
**23 tests**; installed author-operation/execution tests passed **38 tests**,
including resources, literal arguments, exclusions, failure semantics, read-only
checks, repeat fixes, prerequisites, and unchanged runtime integrity behavior.

The full [pnpm validate log](validation.txt) is recorded at completion.
The [earlier partial run](validation-before-integration.txt) was deliberately
stopped with SIGTERM when #28 landed on `main`, so final validation could run
against the integrated branch. It is not a successful full-suite result.
Two independent read-only reviewers examined the staged implementation and
evidence against starting commit `9f47d6b3807a0747e9a5fb7584a017674a753faf`.
**Standards: 0 findings** (no documented-standard violations or actionable
baseline smells). **Spec: 0 findings** (no missing/partial requirements, incorrect
behavior, or scope creep). Both explicitly left the ongoing full-suite result
for confirmation before commit; their review does not establish that result.

## Integration with profile authoring

Main advanced to `ed24778db3d102cf1cbb20c30b52ea010c83ec94` (#28 / PR #34)
during this work. The delivery branch combines confirmed-context profiles with
accepted operations and skills, preserving both bundled guides and package-test
coverage. Revision/resumption remains deferred. The original fresh journey above
predates this integration and is not presented as execution of the final bytes.

A [new conventional installation](integration/journey.json) records the combined
skill and all three guide hashes, independently compared with the final candidate.
The [integration replay](integration/integration-evidence.md) read those exact
instructions, copied the accepted source unchanged, validated all profiles, and
repeated all 25 actual protocol exercises successfully. Its [JSON evidence](integration/integration-evidence.json)
and numbered records preserve actual results, including both unavailable-Node
probes. This is a deterministic replay by the same authoring agent, not another
fresh conversation or new author-skill usefulness exercise. Large inventories of
the original temporary npm installation remain external to this archive; accepted
source hashes and the complete resolved result are included.

Both independent reviewers also reviewed the integrated diff against `ed24778`:
**Standards: 0 findings; Spec: 0 findings**. The combined installed-package release
test passed after conflict resolution. Full `pnpm validate` is still pending;
the running log must not be read as a completed validation result.

Deterministic checks are separate from the real-agent
interview and skill exercise. This slice covers parent #25 stories **16–18** and
Testing Decisions **7**, with all-profile validation and final review in the
bounded one-profile journey. Revision, distinct-profile generation, public skill
discovery, and release evidence for additional operating systems remain outside
this ticket.
