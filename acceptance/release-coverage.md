# First-release coverage

The row numbers match `docs/architecture.md` and the corresponding parent #1
release criteria. Test files own deterministic behavior; issue #11 adds public
distribution evidence without moving those tests into a separate implementation.
Run `pnpm validate` on macOS and Linux. A listed test is coverage, not a claim
that the current public release passed it.

| Criterion | Owning installed-CLI tests | Live release evidence required |
| --- | --- | --- |
| 1. All declaration forms, resolution and diagnostics | `source-validation`, `path-validation`, `operation-validation` | Publicly installed CLI validates author material. |
| 2. Public source publication, discovery and direct adoption | `search`, `acquisition`, `author-workflow` | Existing [source publication](results/2026-09-07/source-publication.md); repeat discovery and direct adoption with public npm. |
| 3. Read-only inspection | `inspection`, `bootstrap`, `search` | Public bootstrap snapshots before/after. |
| 4. Freshness, Git/target safety and prerequisites | `inspection`, `adoption`, `execution` | Both-OS validation of the release implementation. |
| 5. Alice work into Bob | `assessment`, `author-workflow` | Real agent uses public package and installed skill; useful README/source guidance and preserved employer content. |
| 6. Materially different independent source | `assessment`, `author-workflow` | Mira/Harbor real-agent journey through the same public package and skill. |
| 7. Separate evidence and rejected invalid work | `assessment`, `execution`, `adoption`, `recovery` | Preserve actual agent submissions separately from script results. |
| 8. Uncommitted completion, unchanged HEAD, restore and retention | `adoption`, `update` | Review/commit complete outputs normally, fresh clone, `npm ci --ignore-scripts`, inspect retained material without source access. |
| 9. Independent updates and ownership protection | `update`, `acquisition` | Use two actual public standards revisions and two actual npm CLI versions. |
| 10. Retirement preserves content | `update` | Covered by owning behavior validation. |
| 11. Interruption, concurrency and abandonment | `recovery`, `adoption`, `assessment` | Covered by actual process-death/concurrency tests on both systems. |
| 12. Public distribution and matching skill on both OSes | `release`, `bootstrap`, all above | Workflow public installation JSON plus separate macOS/Linux real-agent records. |

Names in the test column refer to `test/<name>.test.ts`. The earlier
[real-agent records](results/2026-09-07/README.md) used a temporary registry and
acquisition fixtures. They establish the recorded contextual work but do not
count as public npm installation or published update evidence.

`acceptance/public-installation.ts` records public npm integrity, tool/OS versions,
installed skill hash, author validation, live discovery, explicit/omitted CLI
versions, inspection identities and project preservation. It does not adopt,
submit an assessment, exercise updates or claim real-agent usefulness.
