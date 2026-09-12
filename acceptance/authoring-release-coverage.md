# Authoring release coverage — issue #31

Parent: [#25](https://github.com/lutzseverino/repo-standards/issues/25).
Published version: 1.1.0 at `305025e36e9f9f503135eed3dce33a7b51d373f4`.
[Public-release evidence](results/2026-09-12/authoring-public-release/README.md)
is separate from the unchanged
[original candidate record](results/2026-09-12/authoring-release/README.md).
The evaluator played the synthetic author through fresh live agent turns;
scripted tests and historical replay do not establish interview quality.

| Testing Decision | Current evidence and scope | Release status |
| --- | --- | --- |
| 1. Standalone installation | Public tagged `skills@1.5.25` installation into an isolated global home, all resources, matching external npm CLI/docs, exact revision/hashes and empty workspace. [Linux arm64](results/2026-09-12/authoring-public-release/public-author-installation-linux-arm64.json) and [Linux/macOS public CI](results/2026-09-12/authoring-public-release/public-checks-final/) passed. | Passed; Linux arm64/x64 and macOS Intel acquisition recorded. |
| 2. Faithful creation | [Fresh conversation](results/2026-09-12/authoring-public-release/creation/conversation.jsonl), incremental reviews, final source, preference mapping and all-profile validation. | Passed with the publicly installed skill; synthetic author, Linux agent runtime. |
| 3. Profiles and ownership | Accepted and validated single-profile start, then shared defaults, complete replacement, exclusion and addition; exact/contextual ownership reviewed against actual resolved public CLI output. [Whole source](results/2026-09-12/authoring-public-release/creation/14-whole-source-review.md). | Passed; no declined tutorial profile created. |
| 4. Non-decisions | Incidental indentation/signed-commit practices, no indentation/semicolon preference, skipped CI, deferred tests; separate [no-standards journey](results/2026-09-12/authoring-public-release/no-standards-evidence/conversation.md). | Passed; accepted notes only when no standards confirmed. |
| 5. Scoped revision | [Fresh revision](results/2026-09-12/authoring-public-release/revision/complete-source-review.md) clarifies ambiguous README scope and replaces a personal policy; notes and checklist align, team criteria and unfinished work preserved. | Passed; evaluator verified unchanged HEAD, raw index, file modes and staged/unstaged/untracked work. |
| 6. Resumption | [Fresh resumption](results/2026-09-12/authoring-public-release/resumption/complete-source-review.md) surfaces manual guidance versus notes/checklist/profile description, accepts current intent and reconciles only agreed material. | Passed; manual guidance and unrelated work preserved; notes omit personal transcripts. |
| 7. Generated operations | Behavior/prerequisites accepted before inclusion; [68 direct protocol invocations and four missing-runtime probes](results/2026-09-12/authoring-public-release/creation/operation-exercises.json), full requests/results and bytes/modes. Existing installed-CLI tests cover read-only validation and execution orchestration. | Passed for exercised Linux cases; other platforms/concurrency/fault cases explicitly unverified and deferred. |
| 8. Completion and handoff | Complete source reviews, live acceptance, final all-profile validation and local publication handoff in all three source journeys; accurate no-standards completion. | Passed; authoring agents did not provision, commit, publish or adopt. Git fixtures were evaluator setup only. |
| 9. Reserved identity | `test/path-validation.test.ts`: both system-skill names, normalized reserved targets across declaration forms and all profiles. | Passed in Linux/macOS validation of the unchanged bundle subsequently published as 1.1.0. |
| 10. Adoption regression | Existing installed-CLI adoption/update/assessment/recovery tests retain exact runtime/skill pins, ownership/integrity, updates and absence of automatically installed authoring. | Passed in Linux/macOS release validation and subsequent CI. |
| 11. Discovery evidence | Public release-tag installation command and independently dated [skills.sh page/search observation](results/2026-09-12/authoring-public-release/discovery.json). Telemetry disabled. | Passed as observation: direct installation succeeds, listing remains unavailable; no indexing/ranking claim. |
| 12. Release checks | Both-platform `pnpm validate`, unchanged tested artifact published on npm/GitHub, and fresh public-skill agents recorded separately. [Current CI](results/2026-09-12/authoring-public-release/ci-validation.json). | Passed; Linux/macOS public acquisition and all four fresh agent journeys completed. |

Stories 32–35 are covered jointly with #26: format reservation and adoption
regressions stay at the installed public CLI seam; fresh agent usefulness and
observed public acquisition/discovery are separate release evidence. Neither
reservation nor global installation changes adopting-project pins or gives the
authoring skill responsibility for provisioning, commits, publication, or adoption.

At the maintainer's additional request, GitHub Actions now uses npm trusted
publishing. A live OIDC exchange passed; the next real release must verify the
complete direct-publish/provenance path. The 1.1.0 publication used browser
approval of the original tested bundle. The PR remains unmerged.
