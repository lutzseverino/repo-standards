# Confirmed adoption

Initial adoption, deliberate updates, and explicit same-pin re-adoption install
exact files and whole author skills and execute trusted fixes and checks. Profiles with contextual guidance
return a work request after fixes and continue through the public
[assessment protocol](assessment-protocol.md). Interrupted adoption supports
explicit retry and abandonment as described below.
Public npm delivery remains issue #11.

## Inspect, confirm, and start

Use Node.js 24, npm, Git, and an [externally installed exact CLI](inspection.md#keep-the-disclosed-cli-for-start-and-recovery).
Before first adoption, have the agent read that package's
`skills/adopt-standards/SKILL.md`. After installation, use the matching
repository-local `.agents/skills/adopt-standards/SKILL.md`. First inspect the
public GitHub selection:

```sh
repo-standards inspect --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --json
```

Review the pins, proposed replacements, matching-file claims, whole-skill
inventories, guidance, declared fixes and checks, prerequisites, and blockers. After explicit maintainer confirmation, use the same
CLI version and selection, passing the report's `identity` verbatim:

```sh
repo-standards start --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --confirm 'sha256:INSPECTION_HASH' --json
```

For discovery-backed initial adoption, follow the [two-pass inspection](inspection.md#discover-contextual-file-scope-v2-sources), then pass the same `--scope <file>` proposal with the confirmed complete inspection identity to `start`. Missing, invalid, unresolved or stale scope blocks mutation.

Both commands accept `--project <directory>` and default to the current Git
working tree. Store inspection reports outside the project to keep it clean.
`--confirm` represents the maintainer's explicit confirmation; the CLI cannot
establish whether an agent obtained that confirmation truthfully.

## Update one pin at a time

For a standards update, use the currently pinned CLI and preserve the source and
profile while selecting a new stable standards tag. Inspect and review it, then
start the exact same selection with its identity:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards inspect \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.3.0 --profile work --json
.repo-standards/runtime/node_modules/.bin/repo-standards start \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.3.0 --profile work \
  --confirm 'sha256:INSPECTION_HASH' --json
```

When the candidate v2 profile has active discovery declarations, the first
inspection requires fresh project evidence. Build a new `--scope` proposal and
pass it to both the complete inspection and confirmed start. The report lists
discovered-scope additions and removals relative to the prior complete adoption;
removed scope ends governance without deleting that project-owned content.

For a CLI update, obtain the candidate exact CLI outside the project. Omit the
source flags so inspection and start use the retained current standards:

```sh
candidate_dir="$HOME/.local/share/repo-standards/cli-1.2.0"
mkdir -p "$candidate_dir"
(cd "$candidate_dir" && npm install --prefix "$candidate_dir" \
  --ignore-scripts --save-exact --no-audit --no-fund \
  @lutzseverino/repo-standards@1.2.0)
"$candidate_dir/node_modules/.bin/repo-standards" inspect --json
```

Keep that directory outside the adopting project. Review the inspection and
obtain explicit confirmation before running the same candidate executable:

```sh
"$candidate_dir/node_modules/.bin/repo-standards" start \
  --confirm 'sha256:INSPECTION_HASH' --json
```

The bootstrap provides temporary inspection only. Keep the external candidate
available for retry if installation interrupts before the project runtime is
usable. Once adoption completes, use the new project-pinned CLI normally.

## Re-adopt unchanged standards

Use the pinned project CLI with `--readopt` when repository growth should pass
through the retained current selection again without changing the standards
or CLI version:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards inspect \
  --readopt --scope /tmp/project-scope.json --json
.repo-standards/runtime/node_modules/.bin/repo-standards start \
  --readopt --scope /tmp/project-scope.json \
  --confirm 'sha256:INSPECTION_HASH' --json
```

Omit `--scope` for v1 and for v2 selections without active discovery. For v2,
first run `inspect --readopt --json`, interpret the retained discovery guidance
against fresh project evidence, then use the new proposal in the commands above.

Review and confirm the complete re-adoption inspection as a new action. Plain
`inspect --json` remains a read-only retained inspection and its identity cannot
start re-adoption. Re-adoption rejects source, profile, standards-revision, and
CLI-version changes. It requires a prior complete adoption and the same clean, committed project and
integrity checks as an initial start.

The CLI resolves the source from retained inputs, so the original standards
repository can be unavailable. It reacquires the exact pinned CLI runtime from
the configured npm registry or cache, checks prerequisites, runs fixes, requests
fresh contextual assessment when applicable, and runs checks through the shared
adoption sequence. An incomplete new run retains the prior last-complete evidence;
only successful completion advances it. Re-adoption is deliberate repository
work, not an update, resume, retry, or automatic compliance claim.

Both paths apply confirmation freshness, Git-state, prerequisite,
compatibility, and ownership checks before mutation, then use the normal fixes,
contextual assessment, checks, integrity verification, recovery, and
abandonment behavior. A standards update replaces still-declared exact content
and whole skills, including removal of obsolete skill resources, while retaining
the existing runtime, npm lockfile, and system skill. Retired and
excluded declarations keep their installed content but leave the new baselines
and no longer contribute operations. A CLI update replaces only the isolated
runtime manifests, npm lock, dependencies, and matching product-owned system
skill; project dependency manifests and package-manager choices remain outside
that runtime.

There is no force overwrite, automatic discard, source/profile switch, or
universal rollback. Only a complete run advances last-complete state and new
baselines. Both update paths leave HEAD unchanged and their actual changes
uncommitted for the project's normal workflow.

Start requires the same content-derived inspection identity, existing HEAD,
clean index and working tree, no non-ignored untracked files, safe targets,
recoverable replacement content, and unambiguous skill ownership. Git flags
that hide changes and nested submodules block this initial journey. An existing
unrelated skill conflicts even when its bytes match. Existing matching exact
files are claimed without rewriting; unrelated and excluded content remains
outside the selection.

Before installation, start probes every declared prerequisite using its literal
version arguments from the project root. It reports all missing executables,
failed probes, unreadable versions, and incompatible versions without installing
prerequisites. Inspection itself never probes them. The trusted script contract
and detailed failure behavior are documented in [Script protocol](script-protocol.md).

The CLI prepares the exact runtime outside the project with npm lifecycle
scripts disabled. The project's dependency manifest, package manager, and
`.npmrc` do not govern this installation. The configured external npm cache is
reused, including for offline acquisition of cached packages. As with the
bootstrap, content-cache symlinks are rejected and logs stay in temporary
storage so cache settings cannot redirect acquisition into the project.
After acquisition, start reacquires
the immutable source and repeats all freshness and safety checks under an
exclusive run lock. Each write checks target ancestors again. Failed preflight
or acquisition leaves project content untouched.

## Durable and local state

Review and commit these files through the adopting project's normal workflow:

| Path | Recorded material |
| --- | --- |
| `.repo-standards/selection.yaml` | Exact CLI package/version, canonical source URL, stable tag, commit SHA, and profile. |
| `.repo-standards/lock.json` | Inspection identity, immutable source and CLI pins, SHA-256 hashes and executable state for exact and retained material, runtime manifests, and last-complete state. |
| `.repo-standards/state.json` | Last-complete run, inspected HEAD, completion time, exact baselines, full skill file inventories, check and assessment evidence bound to the selection and project snapshot, and compact work evidence for this and each prior complete v2 run. |
| `.repo-standards/inputs/` | Normalized metadata, the resolved selection, a normalized single-profile manifest, selected source files/trees, and root license material. Other profiles and unrelated source material are omitted. |
| `.repo-standards/runtime/package.json`, `package-lock.json` | An isolated exact CLI dependency and npm's resolved dependency graph and integrity values. |
| `.repo-standards/.gitignore` | Ignores runtime dependencies, local reports/logs, and caches. |
| `.agents/skills/adopt-standards/` | The product-owned system skill from this exact CLI version. |
| Exact targets and `.agents/skills/<author skill>/` | The selected author-owned content and complete skill resources. |

Discovery adoption additionally retains `inputs/scope-history.json`. Its ordered
run records mark every later complete lifecycle point; entries with discovery
preserve the accepted inspection identity, source-resolved declarations, concrete
resolved selection, discovery guidance, proposal, rationale, evidence references
and observation identities. This file is included in immutable input integrity.
`inspect --json` exposes it as historical scope after completion, independently of
source availability. Discovery completion exposes inspection v2 with
scope-history v3.

Retained runs are scope evidence: each discovery run is stored once, as its
accepted inspection identity, resolved selection, source-resolved profile, and
discovery identity, proposal, absence, declarations and project observation
without the evidence array that observation implies. The named observation is
stored as its delta from that project observation: the confirmed targets and any
boundary entry naming them adds. Evidence arrays and the full named observation
are rebuilt whenever the file is read, so the historical scope a report exposes
is unchanged. The file no longer repeats the newest run at its top level.
Scope-history v2 and every earlier format stay readable; the next complete
adoption rewrites the file as v3 and carries each earlier run forward once. No
separate compaction command exists. Work intervals and final
scope-validity assessments are committed in state v5. Each
later complete v2 run moves the prior run's interval,
operation, retry, check and assessment evidence into the state's ordered
`history`, so earlier authorized work remains explainable in a fresh checkout.
An intervening v1 standards update keeps its v1 run, work-request and assessment
protocols while carrying the earlier v2 evidence in state and status v5; a later
v2 completion therefore cannot erase that history.
The v5 format makes clients that predate compact work evidence reject the
new state rather than silently overlooking it.

Committed intervals are
[work evidence](script-protocol.md#observed-scope-for-v2-adoption): the
identities of the observations a run held and the delta between them, not the
observations themselves. Each interval keeps its phase, scope, operation
reference, changed paths with their before and after file state, boundary
changes, violations and restoration evidence, so an adoption pull request stays
reviewable and a later run adds only its own evidence. Full observations remain
in memory and in the uncommitted local run report, which recovery and gap
detection still use. A project committed under state v4
or any earlier format keeps working; the next complete adoption rewrites it,
converting legacy intervals and full-map history entries into the compact form.
Historical evidence makes no current-coverage claim.

Discovery-backed standards updates, CLI updates and unchanged-pin re-adoption use
fresh proposals and preserve prior run evidence. Retry repeats fixes under the
confirmed scope and cannot authorize additional files; a scope that needs to
change is [corrected by adopting again](#correct-a-confirmed-scope).

The normalized manifest is separate from retained source files, so an author
may legitimately select their original `standards.yaml` as exact content.
References keep their original source-relative paths. The shared resolver also
interprets the retained manifest; inspection does not introduce a second format
interpreter.

Runtime `node_modules`, `.repo-standards/local/`, and caches remain ignored.
Durable progress lives at Git's `repo-standards-run.lock` path, outside tracked
content and separate for each working tree. It records the current run even if
installation is interrupted before local product reports can be created. Separate
process registrations under `repo-standards-run.lock.workers/` prevent concurrent
start, resume, retry, and abandon commands. Dead registrations do not hold an
execution lock. Saved installation material and runtime staging remain in Git's
working-tree metadata until completion or abandonment.
`.repo-standards/local/run.json` records progress once installation begins.
Neither dependencies nor run records belong in commits.

## Completion and incomplete results

`start` prints a `repo-standards/run/v1` JSON report for v1 sources and
`repo-standards/run/v2` for v2 sources. Its fields include `id`,
`inspection`, `selection`, `affected`, `outcome`, `phase`, `reason`, `changes`, `completed`,
`uncertain`, `nextAction`, `prerequisites`, `operations`, `assessments`, and contextual
`workRequest` when required. `installation.files` and `installation.runtime` record
confirmed installation progress; `uncertain` describes work whose result has not
been verified and recorded. `retryHistory` preserves prior failure reasons,
uncertainty, and assessment evidence. Its `report` path points to the local report
bytes archived before retry, including any changes made by an interrupted author
process. Archival failure blocks retry before the existing report is overwritten.
Each retry's `archivedFiles` also retains operation logs, including unrecorded
results. Archive names include content hashes so reusing an operation index
cannot replace earlier evidence.
`operations` retains recorded process results. Exit status is 0 for complete adoption, 1 for an
incomplete run or rejection, and 2 for invalid usage. Preflight rejections use
the common `valid: false` / `errors` diagnostic format.

Completion requires expected exact bytes and executable bits, whole-skill and
retained-input inventories, runtime dependencies, durable product files, and
unchanged HEAD and index. Exact and durable outputs must also be visible to
Git's normal add workflow; ignore rules hiding new adoption outputs make the
run incomplete. Verification uses the original expected installation
values; unexpected changes cannot become new baselines. Completion leaves all
changes uncommitted and releases the lock.

Fixes run serially before contextual work. Checks run after fixes for profiles
without contextual declarations; otherwise they wait for a satisfied, current agent assessment. Ordinary failed checks allow subsequent checks to collect evidence.
Blocked results, execution errors, check mutation, and integrity failures stop
the phase and preserve incomplete work. A contextual handoff is incomplete,
with no last-complete state. Apply its guidance, refresh the snapshot with
`resume --json`, and submit `resume --assessment <file> --json` to continue.

An incomplete adoption preserves changes and its lock. Its change report
observes actual Git changes and ignored product storage, including unexpected
additions; runtime dependencies are listed as one directory. The persisted
`affected` observations include author targets and the reserved system skill,
so subsequent `status` calls also find ignored files and skill resources added
after interruption, and reflect paths reconciled since the run stopped.
Until the initial ignore-file write succeeds, the Git-directory lock remains
the report and no potentially visible local run record is created.

Failure to persist final completion is reported as an incomplete `completion`
phase with explicit uncertainty and recovery guidance. Candidate state is
preserved as ignored `.repo-standards/local/incomplete-state.json` when possible,
instead of asserting a last-complete adoption. If preserving that candidate also
fails, the report identifies the uncertainty for manual recovery.

## Review completed outputs

Complete adoption leaves changes uncommitted. Review their contents before the
maintainer's normal commit workflow; a list of filenames or hashes is not a
content review. This applies to initial adoption and updates, including newly
added files alongside modified, deleted and mode-changed tracked files.

From the project root, obtain a tracked diff and a complete new-file inventory:

```sh
git --no-optional-locks diff --no-ext-diff --no-textconv --binary --
git --no-optional-locks ls-files --others --exclude-standard -z
```

Consume the second command's NUL-delimited paths without shell word splitting;
paths may contain spaces, newlines or leading dashes. For each path, read its
complete content and executable state, or invoke this argument vector directly
with the literal path substituted for `<path>`:

```text
["git", "--no-optional-locks", "diff", "--no-index", "--no-ext-diff",
 "--no-textconv", "--binary", "--", "/dev/null", "<path>"]
```

For `--no-index`, exit 1 means differences were found; treat other failures as
an incomplete review. Binary patches retain bytes and mode changes, but still
use a suitable viewer or explicit binary-aware inspection when evaluating
non-text content. Account for every enumerated path, including hidden files:
exact targets, every installed skill file, retained inputs, selection/lock/state,
`.repo-standards/.gitignore`, and runtime package manifest and lockfile. The
ordinary ignore rules exclude dependencies, caches and local execution logs;
review script outcomes from the run report separately.

Save review artifacts outside the adopting project, so they do not become new
outputs themselves. Do not stage files (including intent-to-add) to expose their
contents. Confirm HEAD, index entries and the working files remain unchanged
across review, and report any unreadable or unreviewed output explicitly. Only
the maintainer's normal workflow stages or commits the completed adoption.

## Recover or abandon an interrupted run

Use the run's exact CLI version. If installation stopped before the project-local
CLI became usable, use the externally installed CLI that started the run.

```sh
repo-standards status --json
repo-standards resume --retry --json
```

Review `active.phase`, `reason`, `changes`, `completed`, `uncertain`, and
`nextAction` first. `execution: active` means a command or recorded author
process group is still running; wait for it to finish or deliberately stop it
before recovery. Background members keep the group active even after a fix or
prerequisite probe returns. Recorded leader start identities distinguish an
unrelated live leader that reuses a process-group number; a leaderless group is
still treated conservatively as active while it has surviving members.
`execution: interrupted` means durable incomplete progress
remains without live execution. A normal contextual handoff also has no live
execution. A second start is blocked until the run is resumed or abandoned.
The CLI uses the system `ps` utility to inspect process-group membership. Worker
and group-leader identities use kernel start values: boot identity and start
ticks from Linux procfs, and microsecond start times from macOS libproc through
the packaged Koffi binding. The macOS binding ships prebuilt for arm64 and x64;
installation does not require a compiler or enabled install scripts. Recovery
is rejected if process identity or liveness cannot be determined safely.

`resume --retry` explicitly authorizes repeating trusted operations. It checks
prerequisites again, verifies confirmed installed bytes, executable state,
inventories, HEAD and index, and finishes pending installation from saved
material. A write interrupted before its progress was recorded may contain the
original inspected bytes or the expected installed bytes. Other edits block
retry for reconciliation; there is no force-overwrite. Once installation was
prepared, recovery needs neither the standards source nor fresh npm acquisition.
An interruption before preparation repeats inspection and acquisition and still
requires the original confirmation to be fresh.

Retry reruns repeat-safe fixes in declaration order, requests renewed contextual
assessment where applicable, reruns checks, and verifies final integrity before
recording completion. It retains earlier operation evidence and uncertainty as
history. Old assessments cannot satisfy a retry, even if project bytes match.
V1 keeps its existing contextual comparison baseline. V2 records separate
fix and agent observation intervals, retaining earlier observed agent edits
even when replayed fixes overwrite the same files. V2 retry cannot erase
recorded scope violations or create scope authority; see the
[observed execution contract](script-protocol.md#observed-scope-for-v2-adoption). Submit a new assessment separately after retry;
`--retry` and `--assessment` cannot be combined. Plain `resume` and
`resume --assessment` remain the contextual interface and never implicitly retry
uncertain process outcomes. A failed completion write remains incomplete until
its candidate state is verified and recovery finishes.

To end an incomplete run while keeping its work:

```sh
repo-standards abandon --json
repo-standards status --json
```

Abandon leaves project content and HEAD in place and retains incomplete evidence.
It archives the report under Git's `repo-standards-reports/<run-id>.json`; `status`
returns these reports in `abandoned`. Operation logs and local report snapshots
are copied alongside the archived report in a directory named for the run ID.
Archived operations point to those copies, so later adoption and removal of the
incomplete installation cannot overwrite their evidence. Paths are relative to
the project root, including when Git metadata lives outside the working tree.
`archivedFiles` maps original report and operation-log paths to their archived
copies, including logs written before their operation result reached the journal.
Abandonment reports `outcome: incomplete` with `abandoned: true` and exit status 1;
it does not assert successful adoption or replace last-complete evidence. The
CLI releases the run only after preserving any candidate completion state and
archiving its report. Failed preservation blocks abandonment and keeps the run
active for reconciliation. Reconcile preserved changes
through the project's normal workflow. A new initial adoption still requires a
clean project without conflicting product state and a fresh confirmed inspection.
Never remove durable run records to bypass recovery checks.

## Correct a confirmed scope

A run's confirmed scope never changes while the run is active. When contextual
review finds that coverage needs files outside it, or that a confirmed target is
mistaken, submit the blocked scope review without writing those files. The run
stays incomplete with `SCOPE_INCOMPLETE`; reported additional paths grant no
authority. Correct the scope by adopting again:

1. Preserve the work worth keeping.
2. Abandon the run with `abandon --json`. Its changes and report are retained.
3. Resolve its changes through the project's normal workflow. Commit or discard
   contextual work on project-owned files. Discard what the run installed by
   restoring `.repo-standards/`, exact content and skills to their committed
   state: the new run installs them again, and an abandoned run's product state
   is not a complete adoption. The next start requires a clean committed project.
4. Inspect again with a new discovery proposal, obtain explicit confirmation of
   the new inspection, and start it with the same proposal.

Retry repeats work under the confirmed scope and cannot correct it.

## Fresh checkout and source disappearance

Restore the runtime from committed manifests using:

```sh
npm ci --ignore-scripts --prefix .repo-standards/runtime
.repo-standards/runtime/node_modules/.bin/repo-standards status --json
.repo-standards/runtime/node_modules/.bin/repo-standards inspect --json
```

The npm package must remain available from its locked location or an npm cache.
No standards-source connection is needed for these commands. `inspect` without
source flags verifies retained input integrity and resolves the current profile
from retained material. Local edits to exact project content remain visible in
the report. With the pinned CLI, this unchanged report has `retained: true` and
is read-only. Use `--readopt` for a deliberate unchanged-pin run. With a different
exact CLI version, it discloses a CLI update that can be confirmed and started as
described above. Active v2 discovery declarations require fresh `--scope`
proposals for both actions; retained historical scope never substitutes for them.

`status` reports pins, active progress, and historical last-complete evidence
without any network request; [`outdated`](available-updates.md) reports
available CLI and standards updates.
After an abandoned update, it still returns the archived report. If the
preserved product files do not represent complete adoption, `stateError`
describes that condition; historical evidence comes from the matching archived
run and does not certify the candidate selection as complete.
It does not claim ongoing compliance after subsequent project edits. While an
initial run is incomplete, no last-complete adoption is reported. The installed
`adopt-standards` skill guides these same commands and confirmation requirements.
