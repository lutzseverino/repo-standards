# Authoring release coverage — issue #31

Parent: [#25](https://github.com/lutzseverino/repo-standards/issues/25).
Implementation candidate: 1.1.0. Current observations are in
[the 2026-09-12 evidence record](results/2026-09-12/authoring-release/README.md). Publication and fresh delivered-skill acceptance
must succeed before this feature is called complete. The table distinguishes
current release work from historical behavioral acceptance; scripted tests do
not establish preference elicitation quality.

| Testing Decision | Evidence and scope | Release status |
| --- | --- | --- |
| 1. Standalone installation | `acceptance/prepare-author.ts <version> <evidence>` acquires a public tagged skill with isolated global installation, resources, matching external npm CLI/docs, and exact revision/hashes. No-argument setup is candidate-only. | Public 1.1.0 acquisition pending publication. |
| 2. Faithful creation | Fresh installed-skill creation must retain live author turns, small reviews, resulting files, preference mapping, and all-profile validation. Historical [creation](results/2026-09-11/authoring/creation/) is candidate evidence. | Fresh candidate journey passed; delivered-release journey blocked. |
| 3. Profiles and ownership | Installed-CLI resolution tests and historical [profiles](results/2026-09-11/authoring/profiles/) cover defaults, replacements, exclusions, additions, and ownership. | Fresh candidate journey passed; delivered-release journey blocked. |
| 4. Non-decisions | Historical creation/profiles and [no-standards](results/2026-09-11/authoring/no-standards/) distinguish candidates, skipped/deferred topics and no preference. | Fresh candidate journey passed; delivered-release journey blocked. |
| 5. Scoped revision | Historical [revision/resumption](results/2026-09-11/authoring/revision-resumption/) covers conflicts, ambiguous scope and unrelated work. | Fresh candidate journey passed; delivered-release journey blocked. |
| 6. Resumption | Same historical evidence covers a manual source edit contradicting notes and reconciliation without restoring stale policy. | Fresh candidate journey passed; delivered-release journey blocked. |
| 7. Generated operations | `test/execution.test.ts`, `test/author-workflow.test.ts`, and read-only source-validation tests; historical [accepted operations](results/2026-09-11/authoring/operations/). | Fresh candidate creation records 36 operation exercises and four unavailable-Node probes; delivered-release run blocked. |
| 8. Completion and handoff | Historical behavioral journeys record final source review, validation, and local-authoring boundary. | Fresh candidate journey passed; delivered-release journey blocked. |
| 9. Reserved identity | `test/path-validation.test.ts`: both reserved names, normalized targets across declaration forms and all profiles. | Passed in the current Linux/macOS release validation matrix. |
| 10. Adoption regression | `test/adoption.test.ts`, `test/update.test.ts`, `test/assessment.test.ts`, `test/recovery.test.ts`: exact runtime/skill pins, integrity ownership, updates, and explicit absence of automatically installed authoring. | Passed in the current Linux/macOS release validation matrix. |
| 11. Discovery evidence | Public tagged command in `docs/installation.md`; independently dated skills.sh page/search observations. Installer telemetry is disabled in acceptance. | Public tag unavailable; skills.sh rendered unavailable content and search omitted the skill at 2026-09-11 22:21 UTC. |
| 12. Release checks | `pnpm validate` and the existing macOS/Linux release matrix, plus separate installed-skill real-agent journeys. | Both OS validation jobs passed; publication failed with ENEEDAUTH. Fresh candidate agents are separate; delivered-skill journeys remain blocked. |

Stories 32–35 are covered jointly with #26: format reservation and adoption
regressions stay at the installed public CLI seam; fresh agent usefulness and
observed public acquisition/discovery are separate release evidence. Neither
reservation nor global installation changes adopting-project pins or gives the
authoring skill responsibility for provisioning, commits, publication, or adoption.
