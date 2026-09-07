# Confirmed adoption

Initial adoption and deliberate updates install exact files and whole author
skills and execute trusted fixes and checks. Profiles with contextual guidance
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

For a CLI update, obtain the candidate exact CLI outside the project. Omit the
source flags so inspection and start use the retained current standards:

```sh
candidate_dir="$HOME/.local/share/repo-standards/cli-1.1.0"
mkdir -p "$candidate_dir"
(cd "$candidate_dir" && npm install --prefix "$candidate_dir" \
  --ignore-scripts --save-exact --no-audit --no-fund \
  @lutzseverino/repo-standards@1.1.0)
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
| `.repo-standards/state.json` | Last-complete run, inspected HEAD, completion time, exact baselines, full skill file inventories, and historical check evidence and separate assessment evidence bound to the selection and project snapshot. |
| `.repo-standards/inputs/` | Normalized metadata, the resolved selection, a normalized single-profile manifest, selected source files/trees, and root license material. Other profiles and unrelated source material are omitted. |
| `.repo-standards/runtime/package.json`, `package-lock.json` | An isolated exact CLI dependency and npm's resolved dependency graph and integrity values. |
| `.repo-standards/.gitignore` | Ignores runtime dependencies, local reports/logs, and caches. |
| `.agents/skills/adopt-standards/` | The product-owned system skill from this exact CLI version. |
| Exact targets and `.agents/skills/<author skill>/` | The selected author-owned content and complete skill resources. |

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

`start` prints a `repo-standards/run/v1` JSON report. Its fields include `id`,
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
An existing contextual comparison baseline remains in effect so retry cannot
hide earlier contextual edits. Submit a new assessment separately after retry;
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
is read-only. With a different exact CLI version, it discloses a CLI update that
can be confirmed and started as described above.

`status` reports pins, active progress, and historical last-complete evidence.
After an abandoned update, it still returns the archived report. If the
preserved product files do not represent complete adoption, `stateError`
describes that condition; historical evidence comes from the matching archived
run and does not certify the candidate selection as complete.
It does not claim ongoing compliance after subsequent project edits. While an
initial run is incomplete, no last-complete adoption is reported. The installed
`adopt-standards` skill guides these same commands and confirmation requirements.
