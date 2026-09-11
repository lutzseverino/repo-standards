# Authoring release coverage — issue #31

Parent: [#25](https://github.com/lutzseverino/repo-standards/issues/25).
Implementation candidate: 1.1.0. Publication and fresh delivered-skill acceptance
must succeed before this feature is called complete. The table distinguishes
current release work from historical behavioral acceptance; scripted tests do
not establish preference elicitation quality.

| Testing Decision | Evidence and scope | Release status |
| --- | --- | --- |
| 1. Standalone installation | `acceptance/prepare-author.ts <version> <evidence>` acquires a public tagged skill with isolated global installation, resources, matching external npm CLI/docs, and exact revision/hashes. No-argument setup is candidate-only. | Public 1.1.0 acquisition pending publication. |
| 2. Faithful creation | Fresh installed-skill creation must retain live author turns, small reviews, resulting files, preference mapping, and all-profile validation. Historical [creation](results/2026-09-11/authoring/creation/) is candidate evidence. | Fresh release journey pending. |
| 3. Profiles and ownership | Installed-CLI resolution tests and historical [profiles](results/2026-09-11/authoring/profiles/) cover defaults, replacements, exclusions, additions, and ownership. | Fresh release journey pending. |
| 4. Non-decisions | Historical creation/profiles and [no-standards](results/2026-09-11/authoring/no-standards/) distinguish candidates, skipped/deferred topics and no preference. | Fresh release journey pending. |
| 5. Scoped revision | Historical [revision/resumption](results/2026-09-11/authoring/revision-resumption/) covers conflicts, ambiguous scope and unrelated work. | Fresh release journey pending. |
| 6. Resumption | Same historical evidence covers a manual source edit contradicting notes and reconciliation without restoring stale policy. | Fresh release journey pending. |
| 7. Generated operations | `test/execution.test.ts`, `test/author-workflow.test.ts`, and read-only source-validation tests; historical [accepted operations](results/2026-09-11/authoring/operations/). | Fresh release acceptance and actual verification limits pending. |
| 8. Completion and handoff | Historical behavioral journeys record final source review, validation, and local-authoring boundary. | Fresh release journey pending. |
| 9. Reserved identity | `test/path-validation.test.ts`: both reserved names, normalized targets across declaration forms and all profiles. | Current `pnpm validate` results to be recorded. |
| 10. Adoption regression | `test/adoption.test.ts`, `test/update.test.ts`, `test/assessment.test.ts`, `test/recovery.test.ts`: exact runtime/skill pins, integrity ownership, updates, and explicit absence of automatically installed authoring. | Current supported-platform results to be recorded. |
| 11. Discovery evidence | Public tagged command in `docs/installation.md`; independently dated skills.sh page/search observations. Installer telemetry is disabled in acceptance. | Direct acquisition and third-party observations to be recorded separately. |
| 12. Release checks | `pnpm validate` and the existing macOS/Linux release matrix, plus separate installed-skill real-agent journeys. | Publication, both OS results and fresh agent evidence pending. |

Stories 32–35 are covered jointly with #26: format reservation and adoption
regressions stay at the installed public CLI seam; fresh agent usefulness and
observed public acquisition/discovery are separate release evidence. Neither
reservation nor global installation changes adopting-project pins or gives the
authoring skill responsibility for provisioning, commits, publication, or adoption.
