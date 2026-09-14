# Orchard retained re-adoption inspection after Pear retirement

Date: 2026-09-14  
Original adopting project: `/tmp/repo-standards-source-Aarb1O`  
Fresh checkout: `/tmp/repo-standards-orchard-retired-readopt-K4BJ46`

## Repository history and correction

The completed initial adoption was committed as
`1eea3ccfd5b8852b1f0cbb1ef7900992d9fad778`. Organic Plum growth was committed
as `ebecf70af22e48928990df0402cba37bae294a96`. That growth snapshot still
contained `products/pear/service.json`, so inspection identity
`sha256:850b5a6ea0ec949e48d4bb5dfefc3e769bd41e70f4e9ebefdc69b324f6ef2fc7` is superseded and must not be confirmed.
Its complete reports remain under sibling directory `retained-readoption/` as
honest evidence.

The corrective growth commit is
`a3d4a0942816042b8d34819b309988492857c483`. It removes only
`products/pear/service.json` as Pear's positive maintained-service evidence and
removes Pear links from `CATALOG.md` and `docs/projects/index.md`. It preserves:

- `products/pear/README.md` before and after SHA-256
  `0d2fb448cb0cf739043e8b182da814d9e1249c3a7974bf0f2f7ba13d49f7a7b2`.
- `docs/projects/pear/operations.md` before and after SHA-256
  `4dfd4f629f3d0936915ef2101fb80dd39d70502491e9748b28bfc882e2d93a1b`.
- `products/pear/service.json` before SHA-256
  `eaf6d458da6b5443309f2540afcf007931d973dbf9290cf692da71162db3cf8f`;
  it is absent afterward.

The corrective commit changes no `.agents` or `.repo-standards` tracked file.
`pear-before-after.json` contains exact old/new content and hashes.

## Retained acquisition and environment

I cloned the corrective commit into a separate clean checkout and restored the
pinned runtime with public `npm ci --ignore-scripts --prefix
.repo-standards/runtime`. The installed 82-file package tree has SHA-256
`66da0afcec7dd3879567c4134c644d1d40b79a312f20a7bbe9d608236b407273`.
Both the installed project skill and package skill have SHA-256
`6508d7acca0ced142bb198b85b8fd194d71901b35bb865f21e4ea9c3ea52fd54`.

Both inspections used the project-pinned CLI at version 1.2.0 with no source,
version, or profile arguments. `NODE_OPTIONS` was unset, so the acceptance HTTPS
fixture was not imported. `HTTPS_PROXY`, `HTTP_PROXY`, and `ALL_PROXY` pointed
to closed loopback port 9 with empty `NO_PROXY`. A direct source probe failed
immediately with exit 128 and connection refused, establishing that the Atlas
source was unavailable in this command environment. The inspection nevertheless
resolved entirely from committed retained inputs. `environment.json` records the
host, command conditions, package hashes, and unchanged retained files.

## Two-pass inspection

The discovery pass command was:

```text
.repo-standards/runtime/node_modules/.bin/repo-standards inspect --readopt --json
```

It returned retained readoption inspection
`sha256:0e54923a7831ae02972b5b58d4aa23aeca6b4b1f35903ad3ac9bb3d6db474c4a`
and discovery request
`sha256:0841860ca23d68f333608537d0bc70a8af2e8114529e2f3fd3ffd2d76fe75a40`.
I read the historical scope, retained discovery guidance, and the current
project. A first proposal attempt used an absence evidence item that was not an
offered observed target; the CLI rejected it as `INVALID_SCOPE`. That diagnostic
is retained in `inspection-pass2-invalid.json`. I replaced those evidence items
with the offered `products/pear` directory observation, without changing the
scope decision.

The complete second-pass command was:

```text
.repo-standards/runtime/node_modules/.bin/repo-standards inspect --readopt --scope /srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/retained-readoption-retired-pear/scope-proposal.json --json
```

It returned a complete retained `repo-standards/inspection/v3` report with
identity
`sha256:ac6ca2894bee92291b10db3b12b836f9e7864852520053775d1c53bee83841f8`.
The unchanged selection is CLI `@lutzseverino/repo-standards` 1.2.0, source
`https://github.com/atlas/standards` at tag `v1.0.0` and commit
`d2f0ecb0c4fad52bc4cbf5ff223ba59d2663dd77`, profile `maintained`, action
`readopt`, and project HEAD `a3d4a0942816042b8d34819b309988492857c483`.
The report has no blockers; prerequisites remain intentionally not checked until
start.

## Fresh current scope

Historical authorization covered `CATALOG.md`, `docs/projects/index.md`,
`docs/projects/pear/operations.md`, `legacy/pear-operations.md`, and
`products/pear/README.md` after amendment. It is historical evidence and does not
determine current coverage.

The fresh proposal scopes exactly three current files to
`project-documentation`:

- `CATALOG.md`
- `docs/projects/index.md`
- `products/plum/README.md`

Plum is included because `products/plum/service.json` supplies positive
`orchard-runtime` ownership and the concrete `node server.mjs` operating command.
Its README records purpose, setup state, and operation. The two shared navigation
files both link to Plum, and both links resolve.

The proposal excludes both preserved Pear documentation files. Without
`products/pear/service.json`, the current project has no independent positive
ownership plus build or deployment evidence for Pear. The README's historical prose
and operations guide alone do not establish current maintenance. This exclusion
does not authorize their deletion, and both remain byte-identical. The sample
fixture is excluded because its manifest marks fixture data; the generated site
is excluded because its README forbids hand editing; and `teams` is excluded
because its document says the directory is organizational and not deployable.
Exact `docs/catalog.json` is excluded from contextual scope and remains the
source-owned exact content. There are no migrations, introduced destinations, or
broken links in the current snapshot.

## Exact content and trusted operations

`docs/catalog.json` already matches the retained exact bytes:

```json
{
  "format": "atlas-documentation/v1"
}
```

Re-adoption would therefore record an exact `match`. The retained skill and all
source inputs also match their installed ownership baselines.

The declared fix is `project-documentation/normalize-markdown-ending`; the check
is `project-documentation/verify-markdown-ending`. Both invoke `node` directly
on retained `operations/markdown-ending.mjs`, SHA-256
`cc333786362309d1e05db95acb7c634539ab5e99cbad96998c7172177009511d`,
with resources `[]`, literal arguments `[]`, project-root working directory, and
30-second timeout. Each prerequisite is direct argv `node --version`, required
range `>=24.0.0 <25.0.0`. The script reads the operation JSON from stdin and
visits only the three confirmed Markdown targets. In fixes it appends a final
newline to any existing Markdown target lacking one; in checks it reports such
targets as failed. All three currently end in a newline, but inspection has run
neither operation.

Confirmation authorizes this retained script as trusted code. Probes and
operations inherit the invoking user's host, environment, and network access.
Empty resources are retention declarations rather than a sandbox. There is no
shell expansion. The closed-proxy inspection environment demonstrates retained
inspection without source acquisition; a later start under the same stated
environment still has host filesystem access and whatever effective network
access that environment permits.

## Read-only inspection proof

Across both valid inspection passes, the rejected proposal attempt, and final
verification, HEAD stayed
`a3d4a0942816042b8d34819b309988492857c483`, status stayed clean, the index hash
stayed `2302f8be5365a7eeb6fd4e26fb2dcec10f2c105f404117fdcf8a9fbe2fc23557`,
and both working and cached diffs remained empty. `read-only-verification.json`
contains the comparisons. Before confirmation, no prerequisite, fix, check,
exact write, state write, or contextual edit ran in the fresh checkout.

## Explicit confirmation

I reviewed the corrected fresh retained re-adoption inspection after Pear retirement. I explicitly confirm readoption inspection identity `sha256:ac6ca2894bee92291b10db3b12b836f9e7864852520053775d1c53bee83841f8`, the retained Atlas v1.0.0 and CLI 1.2.0 selection, exact catalog, the recomputed three-path current scope for Plum/navigation, and the evidence-backed removal of both preserved Pear documentation paths from current governance. Append this confirmation verbatim. Run `start --readopt`, complete any contextual assessment and checks without deleting or changing either excluded Pear file, and record scope delta, full completion status, hashes proving Pear bytes survived, fresh-checkout HEAD/index integrity, restored public runtime details, failed source acquisition, operation input/outcome, and explicit historical-versus-current limitations in retained-readoption-retired-pear/. Then proceed with the separate prepared retroactive session only to review/audit its already captured rejection evidence; do not attempt to complete or reconcile that intentionally incomplete run. Finish after all Orchard evidence is indexed.

## Completed re-adoption

My first start shell attempt contained a malformed output-redirection path. Bash
rejected the redirection before launching the CLI, so it produced no run or
project change. I then ran the exact confirmed command correctly:

```text
.repo-standards/runtime/node_modules/.bin/repo-standards start --readopt --scope /srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/retained-readoption-retired-pear/scope-proposal.json --confirm sha256:ac6ca2894bee92291b10db3b12b836f9e7864852520053775d1c53bee83841f8 --json
```

`start.json` records run `6eda44d4-2a19-4436-b4b5-7499f809dced`. Both Node
prerequisite probes observed 24.21.0 in the required range. The fix exited 0 and
reported `unchanged`, then the run reached its expected contextual handoff. A
normal `resume --json` returned current and post-fix identity
`sha256:f15be3a4b241063e55a5f2598c2b81ce6e720db6303384878c15f9f91654d62e`.

No contextual file needed an edit. `assessment.json` is a fresh
`repo-standards/assessment/v2` with `changedPaths: []`, concrete Plum and Pear
evidence, and both required scope-validity reviews marked valid with no
additional paths. Submitting it ran the check, which exited 0 and reported
`passed`: all confirmed Markdown endings already satisfy the source.
`completion.json` records outcome and phase `complete`.

The final `status --json` has no active run and records this run as last complete
at unchanged HEAD `a3d4a0942816042b8d34819b309988492857c483`. The index is
unchanged and unstaged. Completion updated five expected tracked Repository
Standards state files: resolved current scope, scope history, lock, runtime lock,
and state. `final-tracked.diff` and `final-output-inventory.json` preserve their
complete old/new bytes and modes; there are no non-ignored untracked files or
executable-bit changes. The runtime lock's generated package name changed during
the public runtime restoration and re-adoption, and its new hash is bound by the
updated lock.

After completion, the excluded Pear README still has SHA-256
`0d2fb448cb0cf739043e8b182da814d9e1249c3a7974bf0f2f7ba13d49f7a7b2`
and its operations guide still has SHA-256
`4dfd4f629f3d0936915ef2101fb80dd39d70502491e9748b28bfc882e2d93a1b`.
`products/pear/service.json` remains absent. Exact `docs/catalog.json`, the
installed skill, and the 82-file CLI package tree retain their expected hashes.

`scope-delta.json` distinguishes the old five-path historical scope from the new
three-path current scope. A last-complete status is evidence for this completed
run at this snapshot; it does not promise future compliance. Excluding the Pear
documents removes them from current declaration governance but does not mark
them false, delete them, or erase the earlier run's authorization and migration
history.

## Retroactive rejection audit

I then reviewed the separate evidence in `../retroactive/` without invoking its
CLI or changing its project. `10-audit.md` and `11-audit.json` record the finding:
the confirmed four-path scope excluded `CATALOG.md`; bytes were added there
before an amendment was requested; `inspect --amend-scope` rejected that request
with `ASSESSMENT_SCOPE` and no identity; and status preserves the original run as
incomplete with no last-complete adoption. I did not resume, retry, amend,
abandon, or reconcile that intentionally incomplete session.
