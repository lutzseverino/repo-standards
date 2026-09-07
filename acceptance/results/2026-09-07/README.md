# Issue #9 real-agent acceptance — 2026-09-07

All four confirmed journeys completed. These are interactive agent results,
separate from deterministic tests. The same Codex implementation agent read
each installed repository-local skill, inspected each actual project, ran
project commands, wrote contextual documentation and submitted evidence through
the installed public CLI. This is a non-blind evaluation: that agent also
authored the synthetic fixtures. The Linux runs used a container, with separate
projects, local processes, edits and assessments; they did not replay macOS
assessment files or patch outputs.

| Environment | Source / profile | Result and evidence | Contextual changes |
| --- | --- | --- | --- |
| macOS 26.3 arm64 | Alice / work | [Complete](macos-alice.json) | [README and source guide](macos-alice.patch) |
| macOS 26.3 arm64 | Mira / service | [Complete](macos-mira.json) | [Harbor runbook](macos-mira.patch) |
| Debian trixie Linux arm64 | Alice / work | [Complete](linux-alice.json) | [README and source guide](linux-alice.patch) |
| Debian trixie Linux arm64 | Mira / service | [Complete](linux-mira.json) | [Harbor runbook](linux-mira.patch) |

Node was 24.11.1 throughout. Python was 3.14.6 on macOS and 3.13.5 on Linux.
The Linux image was `node:24.11.1-trixie`, digest
`sha256:a3ba81ab11bf66a1122b70a9c270257c439e6ad0d28940ad177d3e14d5efa9a5`.
CLI package 1.0.0 came from `npm pack` and a temporary loopback registry;
GitHub responses came from independently committed source fixtures. Source
commit IDs differ across OS runs because fixture commits have their own times;
selected source content, operations and guidance matched across platforms.
These runs do not prove public publication, discovery or npm-registry delivery;
that installation evidence remains issue #11.

## Confirmation and installed skill

The agent first linked each full inspection and disclosed exact pins, creates,
contextual scope, exclusions, literal operations, resources, probes, timeouts
and host/network trust. All four inspections reported no known blockers and
unverified prerequisites. The maintainer explicitly replied **“Confirm all four
inspections”** before any real-agent start. Each JSON record contains its exact
confirmed inspection identity. Start then completed prerequisite checks and
returned expected incomplete contextual work; no handoff was called complete.

Every installed system skill matched both its installed package and the reviewed
product skill, SHA-256
`e841860e8271226814ef4ca25bf9aa7b891739da044991b00b39db0d3704fa38`.
Package tarball hashes and exact source/CLI pins are recorded per run. Assessments
were written outside the projects, with refreshed snapshot identities, and
submitted using each project's `.repo-standards/runtime/node_modules/.bin/repo-standards`.

## Contextual usefulness and script evidence

Alice's project initially said only to run it with Node. The agent read the
actual package scripts, CLI, transformation and sample records, ran both queue
tests and previewed the sample. The README now provides copyable setup/test/run
commands, the observed `demo-101` output, ready-record rules, error behavior and
preview/persistence limits. A new source guide explains the real I/O versus
transformation boundary without reorganizing runtime code. The exact work
AGENTS.md and review skill were installed. Employer contribution content was
excluded and preserved byte-for-byte. Alice's Python check separately reported
`passed` for the three required headings; it does not establish prose usefulness.

Mira's source uses a different exact target, Node scripts, a retained JSON
resource, and explicit operational-document paths. Its repeat-safe initializer
reported `changed`, creating status `unverified`. The agent read Harbor's Python
server, started real loopback processes and observed health count 0, POST 204,
count 1, and count 0 after restart on each OS. The resulting runbook gives
startup/port commands, probes, failure signals and truthful recovery limits,
preserving the existing security warning and on-call ownership. The agent did
not claim the fix's status file as a contextual edit. The independent check
reported `passed` for runbook structure and unverified deployment status.

All script processes exited 0 without timeout, signal or protocol error.
Each record keeps process/script results separate from the submitted agent
assessment. Final `status` returned matching historical assessment/check evidence
and no active run. Initial/final HEAD, index equality against the inspection,
employer-content hashes, exact installation hashes, complete skill inventories
and the actual uncommitted Git status are recorded. Every adopting project kept
its original HEAD and index; the agent made no adoption commit.

## Deterministic validation and remaining release work

`pnpm validate` on macOS: **317 passed, 1 skipped, 0 failed** (318 tests including
subtests). The skip requires a case-sensitive filesystem; its matching installed
inspection test was also run on Linux. Linux typechecking and both new
`test/author-workflow.test.ts` tests passed. Those scripted assessments only
exercise protocol, heading failure/pass, retained resources, fix repeat safety
and package delivery; they are not the contextual evidence above.

Standards and specification reviews used GPT 5.6 Terra with high reasoning.
The separate Terra medium simplification review found no material code reduction.
Update, recovery and abandonment commands were checked against the public
protocols and existing deterministic tests; these four real-agent runs cover
initial adoption. Published installation and native agent integrations beyond
this Codex session remain release verification work, not claims made here.
