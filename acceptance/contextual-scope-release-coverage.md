# Contextual-scope release coverage

This map owns release evidence for parent issue #41 and delivery issue #50.
Deterministic tests exercise the installed public CLI seam; their presence is
not evidence that a published package or a real-agent journey passed. Release
records belong under `acceptance/results/2026-09-14/contextual-scope-release/`.

Patch 1.2.1 publication and the focused historical-amendment retention
regression are recorded in
`acceptance/results/2026-09-14/contextual-scope-patch-1.2.1/`. That scripted
public-package/fixture-source record supplements the 1.2.0 release below; the
broad public-source and real-agent journeys remain the original 1.2.0 evidence.

Candidate CLI version: `1.2.0`. Until the evidence index records the matching
published npm integrity, GitHub release, both operating systems, and fresh agent
work, the release remains incomplete.

## Delivery criteria

| #50 criterion | Deterministic evidence | Required release evidence |
| --- | --- | --- |
| Complete outcome map and agreeing contracts | This map; `source-validation`, `scope-inspection`, `scope-adoption`, `scope-amendment`, `discovery-lifecycle`, `re-adoption`, `v2-execution`, `update`, `recovery`, `release`, and `bootstrap` tests | Final evidence index cross-checks public docs, packaged skills, results, and stated limits. |
| Published package/bootstrap and both systems | `release` and `bootstrap`; full `pnpm validate` installs packed output | Release workflow records exact npm/release integrity plus Linux and macOS validation/public installation. Fresh checkout restores runtime with `npm ci --ignore-scripts`. |
| Reusable discovery across two unfamiliar layouts | `scope-inspection`: two layouts, absent README, explained candidates, empty and unresolved scope; `scope-adoption`: both layouts and empty operations | Atlas source is interpreted afresh in Orchard and Forge by real agents using public CLI 1.2.0. |
| Useful documentation migration | `scope-adoption`: old files, destinations, introduced directory/index, repaired links, exact preservation and move evidence | Agent record contains confirmed scope, complete before/after content, link checks, and exact `docs/catalog.json` bytes. |
| Confirmed additions and recovery | `scope-amendment`: eligibility, replay, renewed assessment/checks, interval attribution, interruptions, and anti-retroactivity | Agent requests a newly discovered path, confirms a fresh amendment, recovers replay, and records the rejected retroactive case separately. |
| Re-adoption and independent updates | `discovery-lifecycle`: same-pin additions/removals, retention without source, standards and CLI updates; `re-adoption`: v1 compatibility | Agent commits a complete run, restores a fresh checkout, re-adopts 1.2.0, preserves removed-scope content, and separately exercises public 1.1.0→1.2.0 CLI and public standards revisions. |
| Independent second source and generic interface | `author-workflow`, `assessment`, and all v2 lifecycle tests use product-owned formats | Independently authored Wayfinder source uses the same installed CLI and skill for materially different service evidence and operations. |
| Separate real-agent usefulness | Scripted assessment tests remain deterministic protocol evidence only | Fresh agent transcripts explain semantic inclusion/exclusion and useful edits; the evidence index separates historical results, current observations, trusted-code limits, and availability prerequisites. |
| Honest completion | CI and scripts fail closed on missing inputs | The final index names every blocker. Issue #50 remains open while any mandatory row is missing. |

## Parent user-visible outcomes

| Stories | Observable outcome | Owning deterministic evidence | Release observation |
| --- | --- | --- | --- |
| 1–4 | Authors separate discovery from contextual guidance on a v2 repository declaration; all profiles validate without executing code. | `source-validation` v1/v2 all-profile, reference, strict-field, and no-execution cases | Public 1.2.0 validates packaged Atlas and the checkout's independently authored Wayfinder source. |
| 5–8 | Agents include maintained projects without READMEs, explain inclusions/exclusions, and leave uncertainty blocking. | `scope-inspection` two-layout and empty/unresolved cases | Orchard/Forge proposal and unresolved rehearsal records. |
| 9–10 | Explained empty scope remains active, including operations. | `scope-inspection` and `scope-adoption` empty-scope cases | Empty-scope rehearsal records operation input/outcome. |
| 11–12 | One read-only inspection shows concrete files, changes, operations, exclusions, and executes no author code. | `scope-inspection`; `inspection`; `bootstrap` | Public bootstrap and agent before/after snapshots. |
| 13–14 | Migration sources, destinations, introductions and repairs are confirmed individually; exact content stays outside contextual scope. | `scope-adoption` migration/exact cases; `path-validation` | Completed migration and exact catalog hash. |
| 15–16 | Freshness binds relevant state and operations/assessments consume the same concrete targets. | `scope-inspection` stale/observation cases; `scope-adoption`; `v2-execution` | Reinspection and operation-input records. |
| 17–18 | Creates, edits, deletes and modes are accounted for; violations/corruption leave preserved incomplete work. | `scope-adoption`; `v2-execution` | Full project inventory/diff and a separate rejected-work record. |
| 19–23 | Eligible additions require explicit fresh confirmation; earlier violations remain violations; selection/install/run identity stays fixed; removals/transfers are rejected. | `scope-amendment` addition, transfer, removal, freshness, integrity, and retroactivity cases | Agent amendment plus negative rehearsals. |
| 24–25 | Expanded scope replays fixes, renews assessment/checks, and retains interval evidence across retries. | `scope-amendment`; `v2-execution`; `recovery` | Completed amended run and interruption recovery history. |
| 26–29 | Same-pin re-adoption recomputes scope, reports removals without deletion, works from retained inputs, and preserves v1 behavior. | `discovery-lifecycle`; `re-adoption`; `update` | Fresh checkout/source-unavailable re-adoption plus public 1.1.0 v1 compatibility. |
| 30 | Another author uses the same generic interfaces. | `author-workflow`; generic resolver/inspection/execution tests | Wayfinder/Relay record and independent source-authoring record. |

## Parent testing requirements

| Requirement | Owning installed-CLI evidence | Release evidence needed |
| --- | --- | --- |
| Primary public CLI seam | Every listed test installs packed `dist/` through `test/installed-cli.ts`. | Linux/macOS `pnpm validate` on the exact release commit and registry integrity match. |
| Observable bytes, modes, identities, results and safe actions | `scope-*`, `v2-execution`, `update`, `recovery` | Retained JSON, content inventories, diffs, mode/hash records, and CLI exit statuses. |
| Source format and v1 compatibility | `source-validation`, `re-adoption` | Public 1.2.0 validates packaged Atlas and checkout Wayfinder; public 1.1.0 supplies v1 inspection. |
| Semantic discovery | `scope-inspection` structural guarantees | Two fresh agents evaluate unfamiliar layouts; deterministic proposals are not relabeled as semantic proof. |
| Read-only/fresh inspection and observation failures | `scope-inspection`, `inspection` | Bootstrap/inspection project snapshots and a stale-proposal rehearsal. |
| Ownership and migration | `scope-adoption`, `path-validation`, `v2-execution` | Complete migrated content, exact catalog preservation, and rejected unconfirmed target. |
| Scoped execution | `v2-execution`, `execution` | Actual fix/check inputs and outcomes remain separate from agent assessment. |
| Amendment/replay/interruption | `scope-amendment`, `v2-execution`, `recovery` | Accepted amendment history and recoverable interruption record. |
| Re-adoption and updates | `discovery-lifecycle`, `re-adoption`, `update`, `acquisition` | Same-pin retained journey plus actual public standards and CLI version changes. |
| Both operating systems and separate agents | Full `pnpm validate` on Linux/macOS | Workflow artifacts per OS; agent records identify runtime and agent independently. |

## Evidence boundaries

Author operations are trusted code with the host, environment, and network access;
their retained resources are not a sandbox. Inspection validates structure and
observations, not semantic truth or continuous compliance. Historical scope
explains prior authorization; it does not assert current applicability. A public
package does not make fixture-backed standards sources live public sources, and
a deterministic scripted assessment does not establish agent usefulness.

Publishing 1.2.0 requires npm trusted-publisher access and the GitHub `npm`
environment. New standards revisions require their original public source;
retained inputs only support inspection and fresh discovery of an already pinned
selection. Registry, GitHub, Node.js 24, npm, Git, operation prerequisites, and
runner availability remain distinct prerequisites and must be reported from the
actual attempt.
