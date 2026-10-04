# Confirmed adoption

Initial adoption and deliberate updates install exact files and whole author
skills and execute trusted fixes and checks. Profiles with contextual guidance
return a work request after fixes and continue through the public
[assessment protocol](assessment-protocol.md). Interrupted adoption supports
explicit retry and abandonment as described below.

## Inspect, confirm, and start

Use Node.js 24, npm, Git, and an [externally installed exact CLI](inspection.md#keep-the-disclosed-cli-for-start-and-recovery).
An agent adopts through the `adopt-standards` skill: before first adoption, the
one in that package's `skills/adopt-standards/`, and afterwards the matching
repository-local `.agents/skills/adopt-standards/` that adoption installs. First
inspect the public GitHub selection:

```sh
repo-standards inspect --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --json
```

Review the pins, proposed replacements and the edits they discard, matching
files and skills, whole-skill inventories, guidance, declared fixes and checks, prerequisites, and blockers. After explicit maintainer confirmation, use the same
CLI version and selection, passing the report's `identity` verbatim:

```sh
repo-standards start --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --confirm 'sha256:INSPECTION_HASH' --json
```

For discovery-backed initial adoption, follow the [two-pass inspection](inspection.md#discover-contextual-file-scope), then pass the same `--scope <file>` proposal with the confirmed complete inspection identity to `start`. Missing, invalid, unresolved or stale scope blocks mutation.

Both commands accept `--project <directory>` and default to the current Git
working tree. Store inspection reports outside the project to keep it clean.
`--confirm` represents the maintainer's explicit confirmation; the CLI cannot
establish whether an agent obtained that confirmation truthfully.

## Update the selection

An update is one inspected and confirmed run from the current selection to a
candidate selection. The candidate can change the CLI pin, the standards pin,
the source, the profile, any combination of them, or none of them. The
inspection report lists every changed component together with the previous
selection, and every update uses the same inspect, confirm, and start sequence.
The report also states whether the update is an exact update, which changes
only exact content, skills, or the selection, or a contextual update, which
changes guidance, discovery guidance, operations, retired declarations, or
confirmed scope; see [update class](inspection.md#report-and-inspection-identity).
`inspect --summary` renders the report as a [Markdown proposal](inspection.md#markdown-summary).

To select a standards version, source, or profile, pass all three source flags.
With the currently pinned CLI:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards inspect \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.3.0 --profile work --json
.repo-standards/runtime/node_modules/.bin/repo-standards start \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.3.0 --profile work \
  --confirm 'sha256:INSPECTION_HASH' --json
```

To change the CLI pin, obtain the candidate exact CLI outside the project and
run it in place of the pinned executable. Omit the source flags to keep the
retained standards, or pass them to change the standards version, source, or
profile in the same run:

```sh
candidate_dir="$HOME/.local/share/repo-standards/cli-1.2.0"
mkdir -p "$candidate_dir"
(cd "$candidate_dir" && npm install --prefix "$candidate_dir" \
  --ignore-scripts --save-exact --no-audit --no-fund \
  @lutzseverino/repo-standards@1.2.0)
"$candidate_dir/node_modules/.bin/repo-standards" inspect --json
```

Keep that directory outside the adopting project. Review the inspection and
obtain explicit confirmation before running the same candidate executable with
the same flags:

```sh
"$candidate_dir/node_modules/.bin/repo-standards" start \
  --confirm 'sha256:INSPECTION_HASH' --json
```

The bootstrap provides temporary inspection only. Keep the external candidate
available for retry if installation interrupts before the project runtime is
usable. Once adoption completes, use the new project-pinned CLI normally.

To apply the unchanged selection again, for example after the repository gains
content its standards should cover, run the pinned CLI without source flags:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards inspect --json
.repo-standards/runtime/node_modules/.bin/repo-standards start \
  --confirm 'sha256:INSPECTION_HASH' --json
```

Without source flags, inspection and start resolve the selection from retained
inputs, so the original standards repository can be unavailable. Selecting a
standards version, source, or profile requires its public source. The author's
`requires.repo-standards` range is checked only when a standards version is
selected from its source. Retained inputs are validated against the running
CLI's supported source formats, so a CLI update from retained inputs succeeds
even when the retained range excludes the candidate version.

When the candidate profile has active discovery declarations, including an
unchanged selection, the first inspection requires fresh project evidence.
Build a new `--scope` proposal and pass it to both the complete inspection and
confirmed start. The report lists discovered-scope additions and removals
relative to the prior complete adoption; removed scope ends governance without
deleting that project-owned content.

Every update applies confirmation freshness, Git-state, prerequisite,
compatibility, and ownership checks before mutation, then uses the normal
fixes, contextual assessment, checks, integrity verification, recovery, and
abandonment behavior. It replaces the retained inputs and still-declared exact
content and whole skills, including removal of obsolete skill resources.
Retired and excluded declarations, including those a changed source or profile
no longer declares, leave the new baselines and no longer contribute
operations. The run removes each of their installed targets that still matches
its installed baseline. An edited one stays in place and the project owns it:
the inspection lists it in `kept`, durable state no longer records it, and
later runs neither track nor remove it. A skill with any edited file stays
whole, with its link. An installed target
within contextual scope, as a contextual target or inside or containing one, is
not removed and stays in place as project content. Only a changed CLI pin
replaces the isolated runtime manifests, npm lock, dependencies, and matching
product-owned system skills; otherwise the existing runtime remains, and each
system skill is matched, created, or replaced with the one the pinned CLI
packages.
Project dependency manifests and package-manager choices remain outside that
runtime. An incomplete run retains the prior last-complete evidence.

Tracked content at an installation target never blocks: the run replaces it, or
removes it when the selection no longer installs the target and the project
has not edited it, and the confirmed
inspection lists each replacement or removal that discards content other than
the target's installed baseline. Git keeps what it discards. Only ignored or
untracked content, which Git cannot recover, blocks with
`UNTRACKED_REPLACEMENT`. There is no universal rollback. Only a
complete run advances last-complete state and new baselines. Every update
leaves HEAD unchanged and its actual changes uncommitted for the project's
normal workflow.

Start requires the same content-derived inspection identity, an existing
commit, clean index and working tree, no non-ignored untracked files, safe targets,
and recoverable replacement content. Git flags
that hide changes and nested submodules block this initial journey. Existing
exact files and skill directories whose complete inventory, bytes, and
executable state match the supplied content are matched without rewriting and
recorded in the new baselines. This includes a system skill when it matches
the skill packaged with this exact CLI. A differing tracked file or skill,
including a system skill, is replaced and listed among the discarded
edits; unrelated and excluded content remains outside the selection.

The identity binds what the run reads, not Git HEAD or where the project is
checked out: a commit between inspection and start that touches no affected
file, retained input, or durable product state leaves the confirmation valid,
and an inspection made in another clone of the same content confirms a start in
this one. The run records the project root and HEAD at start in its `root` and
`head` fields for provenance, and completion records only HEAD, in the state's
`lastComplete.head`; the root is never committed. HEAD and the index must then
stay unchanged until the run completes. Inspection and run reports carry hash
inventories and diffs rather than file bytes; start acquires the source again
and installs only bytes that match the confirmed hashes. See
[the inspection report](inspection.md#report-and-inspection-identity).

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

## Skill links

Every installed skill lives once, in `.agents/skills/<skill>/`, which Codex and
most agents read. Claude Code reads only `.claude/skills/`, so for each skill a
run installs, system or author, the run also installs a skill link at
`.claude/skills/<skill>`: a relative symbolic link whose text is
`../../.agents/skills/<skill>`
([ADR 0013](https://github.com/lutzseverino/repo-standards/blob/main/docs/adr/0013-expose-installed-skills-through-skill-links.md)).
Standards authors declare nothing for it.

A skill link is an ordinary installation target. A link with the same text is
matched, a missing one is created, and tracked content of any other kind, such
as a hand-made copy of the skill, is replaced and listed among the discarded
edits. Untracked content at the path blocks with `UNTRACKED_REPLACEMENT` and
is left alone. A `.claude` or `.claude/skills` that is itself a symbolic link,
or a link at the path with any other text, blocks with `UNSAFE_TARGET`; the
product never writes through a link it did not create. The inspection lists
each link with its skill and action, its identity binds the link without
following it, and durable state records each link's text. A link changed after
confirmation makes `start` fail as stale.

The product links only the skills it installs and never writes
`.claude/skills` as a whole: a skill the project wrote itself under
`.agents/skills/` gets no link, and other content in `.claude/skills/` stays
untouched. A retired skill's link is removed with the skill, and stays with it
when an edited skill is kept. A link the maintainer edited on its own, such as
one replaced by a committed file, is kept even when its unedited skill is
removed. Links are exact
content, so they never make an update contextual. Git records each link as a
symbolic link; a checkout with `core.symlinks=false` has a small text file
there instead, and Claude Code does not see that skill. Commit the links with
the run's other changes; a link that Git ignores fails completion with
`IGNORED_OUTPUT`, like any other adoption output.

## Durable and local state

Review and commit these files through the adopting project's normal workflow:

| Path | Recorded material |
| --- | --- |
| `.repo-standards/selection.yaml` | Exact CLI package/version, canonical source URL, stable tag, commit SHA, and profile. |
| `.repo-standards/lock.json` | Inspection identity, immutable source and CLI pins, SHA-256 hashes and executable state for exact and retained material, runtime manifests, and last-complete state. |
| `.repo-standards/state.json` | Last-complete run, HEAD at start, completion time, exact baselines, full skill file inventories, skill links, check and assessment evidence bound to the selection and project snapshot, and compact work evidence for this run only. |
| `.repo-standards/inputs/` | Normalized metadata, the resolved selection, a normalized single-profile manifest, selected source files/trees, and root license material. Other profiles and unrelated source material are omitted. |
| `.repo-standards/runtime/package.json`, `package-lock.json` | An isolated exact CLI dependency and npm's resolved dependency graph and integrity values. |
| `.repo-standards/.gitignore` | Ignores runtime dependencies, local reports/logs, and caches. |
| `.agents/skills/adopt-standards/` | The product-owned adoption skill from this exact CLI version, with its references. |
| `.agents/skills/standards-updates/` | The product-owned update notice from this exact CLI version, which reports [available updates](available-updates.md) to an agent. |
| Exact targets and `.agents/skills/<author skill>/` | The selected author-owned content and complete skill resources. |
| `.claude/skills/<skill>` | A skill link for every skill above, system or author: a relative symbolic link to `../../.agents/skills/<skill>`. |

Discovery adoption additionally retains `inputs/scope-history.json`, and every
later run keeps writing it. It holds the current run only: its accepted
inspection identity, resolved selection, and, when the run discovered scope, its
source-resolved declarations, discovery guidance, proposal, rationale, evidence
paths, derived absence and observation identities, together with the run's scope
change against the previous run. This file is included in immutable input integrity.
`inspect --json` exposes it as historical scope after completion, independently of
source availability, as `repo-standards/scope-history/v5` in the
`repo-standards/inspection/v6` report, and `status` reports its scope change.

Retained scope evidence stores the run's discovery once: its identity, proposal,
absence, declarations and project observation without the evidence array that
observation implies. The named observation is stored as its delta from that
project observation: the confirmed targets and any boundary entry naming them
adds. Evidence arrays and the full named observation are rebuilt whenever the
file is read. The scope change lists, for each discovery declaration whose
discovered paths changed, the paths added and removed against the previous
run's confirmed scope; it is computed when the run is planned and stored with
it. Work intervals and final scope-validity assessments are committed in
`repo-standards/state/v7`, which holds the current run's evidence only. Neither
file carries an earlier run, so neither grows with the number of runs; Git
history keeps the evidence of earlier runs.

Committed intervals are
[work evidence](script-protocol.md#observed-adoption-scope): the
identities of the observations a run held and the delta between them, not the
observations themselves. Each interval keeps its phase, scope, operation
reference, changed paths with their before and after file state, boundary
changes, violations and restoration evidence, so an adoption pull request stays
reviewable and each run commits only its own evidence. The run record and the
uncommitted local run report record intervals in this same shape, so completion
carries them into state unchanged and neither record grows with the project.
Historical evidence makes no current-coverage claim.

Each artifact has exactly one format, which this CLI both writes and reads:

| Artifact | Format |
| --- | --- |
| Durable state, `.repo-standards/state.json` | `repo-standards/state/v7` |
| Integrity lock, `.repo-standards/lock.json` | `repo-standards/lock/v1` |
| Retained scope evidence, `.repo-standards/inputs/scope-history.json` | `repo-standards/scope-history/v5` |
| Run record, local run report, and archived abandoned report | `repo-standards/run/v6` |
| `status` report | `repo-standards/status/v7` |
| Inspection report | `repo-standards/inspection/v6` |
| Work request and assessment | `repo-standards/work-request/v3`, `repo-standards/assessment/v3` |

Earlier formats are retired: they are not read, converted, or compacted. A
project whose committed files carry one
[adopts fresh](#adopt-fresh-from-a-retired-format), and a run record in one
calls for the CLI that wrote it. An agent's assessment
submission is never committed: one in an earlier format is rejected with
`ASSESSMENT_FORMAT` until it is written again in the current format.

Discovery-backed updates, including an unchanged selection, use fresh
proposals and record their scope change against the prior run. Retry repeats
fixes under the confirmed scope and cannot authorize additional files; a scope
that needs to change is [corrected by adopting again](#correct-a-confirmed-scope).

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
execution lock. Saved installation material and the completion bytes a recovery
may need to verify, both addressed by their hashes, runtime staging, and the one
observation the run's last interval ends at remain in Git's working-tree
metadata until completion or abandonment.
`.repo-standards/local/run.json` records progress once installation begins.
Neither dependencies nor run records belong in commits.

## Completion and incomplete results

`start` prints a `repo-standards/run/v6` JSON report. Its fields include `id`,
`inspection`, `selection`, `root`, `head`, `affected`, `outcome`, `phase`, `reason`, `changes`, `completed`,
`uncertain`, `nextAction`, `prerequisites`, `operations`, `assessments`, and contextual
`workRequest` when required. `root` and `head` record the canonical project
root and HEAD at start for provenance; the inspection identity binds neither,
and neither is committed. The report carries no file bytes: `affected` holds
the hash inventories of the targets at start, `completion` the hashes of the
candidate lock and state, and the work request references guidance by path and
hash. `installation.files` and `installation.runtime` record
confirmed installation progress; `uncertain` describes work whose result has not
been verified and recorded. `retryHistory` preserves prior failure reasons,
uncertainty, and assessment evidence. Its `report` path points to the local report
bytes archived before retry, including any changes made by an interrupted author
process. Archived paths are relative to Git's directory for the working tree,
which `git rev-parse --absolute-git-dir` prints, such as
`repo-standards-reports/<run-id>/<name>`, so committed retry history records no
checkout location. Archival failure blocks retry before the existing report is
overwritten.
Each retry's `archivedFiles` also retains operation logs, including unrecorded
results. Archive names include content hashes so reusing an operation index
cannot replace earlier evidence.
`operations` retains recorded process results, and `observations` records each
observation interval as identities and deltas in the
[committed interval shape](script-protocol.md#observed-adoption-scope),
without observation maps. Exit status is 0 for complete adoption, 1 for an
incomplete run or rejection, and 2 for invalid usage. Preflight rejections use
the common `valid: false` / `errors` diagnostic format.

Completion requires expected exact bytes and executable bits, whole-skill and
retained-input inventories, runtime dependencies, durable product files, and
unchanged HEAD and index. Exact and durable outputs must also be visible to
Git's normal add workflow; ignore rules hiding new adoption outputs make the
run incomplete. Verification uses the original expected installation
values; unexpected changes cannot become new baselines. Completion leaves all
changes uncommitted and releases the lock. Those changes include new untracked
files, which `git diff` omits; the `adopt-standards` skill's
[review reference](../../skills/adopt-standards/references/review.md)
describes a review of every output.

Fixes run serially before contextual work. Checks run after fixes for profiles
without contextual declarations; otherwise they wait for a satisfied, current agent assessment. Ordinary failed checks allow subsequent checks to collect evidence.
Blocked results, execution errors, check mutation, and integrity failures stop
the phase and preserve incomplete work. A contextual handoff is incomplete,
with no last-complete state. Apply its guidance, refresh the snapshot with
`resume --json`, and submit `resume --assessment <file> --json` to continue.

An incomplete adoption preserves changes and its lock. Its change report
observes actual Git changes and ignored product storage, including unexpected
additions; runtime dependencies are listed as one directory. The persisted
`affected` observations include author targets and the system skills,
so subsequent `status` calls also find ignored files and skill resources added
after interruption, and reflect paths reconciled since the run stopped.
Until the initial ignore-file write succeeds, the Git-directory lock remains
the report and no potentially visible local run record is created.

Failure to persist final completion is reported as an incomplete `completion`
phase with explicit uncertainty and recovery guidance. Candidate state is
preserved as ignored `.repo-standards/local/incomplete-state.json` when possible,
instead of asserting a last-complete adoption. If preserving that candidate also
fails, the report identifies the uncertainty for manual recovery.

## Summarize status

`status --summary` renders the status record as Markdown on stdout instead of
JSON. After a complete run it is the record of that run: the selection, every
operation with its result and message, each path the run changed, once, with
the phases that changed it, the discovered-scope additions and removals the run
made, and the run, inspection, HEAD-at-start, and completion identities. During
an active run it renders the run's selection, outcome, phase, execution and
reason, its completed and uncertain work, operations and results, changed
paths, next action, and identities. Abandoned runs and a state error are listed
when present. The same record renders the same bytes, the summary describes the
record without prescribing anything, and combining `--summary` with `--json` is
a usage error.

The changed paths are the run's net change set, which completion keeps in
durable state as `changeSet`, so the record renders from committed state alone,
in any checkout. Each entry names a path whose state at completion differs from
its state before the run, and the phases that changed it: `installation` for
exact files and skill files, including the system skills' and a retired
declaration's removed target, that the run created, replaced, or removed; `fixes` and `agent` for the paths their intervals
recorded. A path that a later phase returned to its state before the run is not
listed, verified restoration of installed content after an interruption keeps
only the installation's attribution, and product state under `.repo-standards/`
is not listed. The JSON status record of a complete adoption includes the same
`changeSet`.

The JSON status record of a complete discovery-backed adoption includes
`scopeChanges`: the additions and removals by declaration that its last complete
run made relative to the run before it, read from the retained scope evidence,
or every confirmed path for the first discovery-backed run.

Every `status --json` report uses `repo-standards/status/v7` and includes
`scopeProposal`: the last complete run's confirmed proposal, in the public
`repo-standards/scope/v2` format, or null when that run had no confirmed proposal
or no adoption has completed. It preserves the confirmed candidates, decisions,
reasons, evidence paths, coverage, and unresolved questions, with the list order
normalized at inspection. It carries no inspection or discovery identity.

The field reads only retained committed evidence and works in a fresh checkout,
offline, independently of the source flags used for inspection or an update.
During an incomplete or abandoned update, it reads the last complete adoption's
evidence from the clean commit at that run's start; the candidate proposal does
not become the last complete proposal. Carrying decisions into a later draft
still requires fresh evidence and confirmation. `status --summary` is unchanged
and does not render the proposal.

## Adopt afresh over installed content

Initial adoption never takes over existing product state in the current
formats: an established adoption inspects as an update, and any other
`.repo-standards/` content that is not
[retired](#adopt-fresh-from-a-retired-format) is an `EXISTING_ADOPTION`
blocker. Giving up readable retained state therefore remains a deliberate
change visible in Git. To adopt afresh over content that such an adoption
installed, finish or abandon any active run, remove the product state
directory, commit that removal through the project's normal workflow, and
inspect the selection again:

```sh
git rm -r --quiet .repo-standards  # tracked product state
rm -rf .repo-standards             # ignored runtime, local, and cache content
git commit -m "Remove Repository Standards product state"
```

The new inspection matches exact files and skill directories that still match
the selected source, and each system skill that matches the inspecting CLI's
packaged skill, without rewriting them. It replaces tracked content that
differs, such as a skill edited since installation or a system skill that a
different CLI version installed, and lists each such replacement among the
discarded edits. Evidence of the earlier adoption remains only in Git history.

## Adopt fresh from a retired format

Each record has one format this CLI reads. `status`, `resume`, and `abandon`
check the active run's CLI pin, or otherwise the recorded adoption's pin,
before checking any record format. A different CLI fails with
`CLI_PIN_MISMATCH` first, without changing anything.

When committed state, the integrity lock, or retained scope evidence carries an
older format, inspecting with `--source`, `--standards-version`, and
`--profile` previews a fresh adoption without anything removed or committed
first. Nothing in the retired state is read or converted, and the selection is
inspected as an initial adoption. Each of those records that is present must
still carry its own artifact's current or retired format, as a
`repo-standards/lock/v1` lock beside retired state does; any other content
there fails with `STATE_INTEGRITY`, and nothing is removed:

- `retiredState` in the report, and **Retired product state** in its summary,
  list the retired records and every file of the `.repo-standards` directory
  as content the run removes. The directory is removed whole, including its
  ignored runtime dependencies, local reports, and cache, which the identity
  doesn't bind and the report doesn't list. Local content worth keeping, such
  as a candidate state an earlier CLI preserved in
  `local/incomplete-state.json`, is copied elsewhere before `start`. The
  inspection identity binds the rest, so changing it after the inspection
  fails `start` with `STALE_INSPECTION`.
- Exact files, skills, and system skills are matched or replaced as at any
  initial adoption: without an installed baseline, every replaced target is
  listed among the discarded edits. Content that an earlier adoption installed
  and the selection no longer declares stays in place as project content.
- Confirming the inspection confirms the removal. Under its lock, `start`
  observes the same retired directory again, removes it, and then installs. The
  removal is left uncommitted with the run's other changes; HEAD and the index
  don't change. A directory that no longer matches the inspection when its
  removal begins fails the run with `INSTALLATION_CHANGED`, and nothing is
  removed. An interrupted removal is recovered with `resume --retry` like any
  interrupted installation. While the run is active, `status`, `resume`,
  and `abandon` read it rather than the retired state.

Every other command that would read a retired committed record, including
`inspect` and `start` without source flags, which inspect retained standards,
fails with `RETIRED_FORMAT` after any required pin check and before reading
further records or writing anything. The diagnostic names the record, its
retired format, and the format this CLI reads, for example:

```text
[RETIRED_FORMAT] .repo-standards/state.json carries the retired format repo-standards/state/v6; this CLI reads only repo-standards/state/v7. Adopt fresh: inspect with --source, --standards-version and --profile, and confirm that inspection; its start removes the retired .repo-standards directory.
```

Run records live in Git's directory: the active run at
`git rev-parse --git-path repo-standards-run.lock`, and abandoned runs' reports
in the `repo-standards-reports/` directory beside it. An active run record in a
retired format may hold unfinished work, so every command that reads product
records, including the fresh-adoption preview and its start, fails with
`RETIRED_RUN` and removes nothing. `outdated` is the exception: it reads only
the pinned selection and writes only its ignored cache. The diagnostic names the earlier pinned CLI when the record carries
one, and its `resume --retry` and `abandon`, which can still continue or end
the run; this CLI can't:

```text
[RETIRED_RUN] The active adoption run record .git/repo-standards-run.lock carries the retired format repo-standards/run/v5; this CLI reads only repo-standards/run/v6. It may hold unfinished work: with the earlier pinned CLI 3.2.0, resume it with resume --retry or end it with abandon, then inspect again.
```

An archived report in a retired format fails with `RETIRED_FORMAT` and names
that report: only the CLI that wrote it reads its evidence, so it is moved out
of Git's directory before this CLI continues.

A higher version of the same record format fails with `NEWER_FORMAT`, including
when a future schema no longer exposes the CLI pin where this CLI expects it:

```text
[NEWER_FORMAT] .repo-standards/state.json carries the newer format repo-standards/state/v8; this CLI reads only repo-standards/state/v7. Use the pinned CLI to read this record.
```

This diagnostic exits 1, reads no further records, and changes nothing. Use the
CLI pinned by the project or active run. A newer format never takes the
fresh-adoption path, and takes precedence over any retired record. The three
format diagnostics include `details.path`, `details.format`, and
`details.expected` in JSON output; `RETIRED_RUN` adds `details.cli` when the
run record names its CLI. Malformed or unrelated format identities fail the
record's integrity validation instead.

## Recover or abandon an interrupted run

Use the run's exact CLI version; `status`, `resume`, and `abandon` reject any
other with `CLI_PIN_MISMATCH`. If installation stopped before the project-local
CLI became usable, use the externally installed CLI that started the run. When
the project runtime manifest and npm lock do not yet both pin the run's CLI, the
diagnostic names that CLI instead of the runtime reinstall command, which could
not restore it.

`resume`, including `--retry` and `--assessment`, requires Git 2.32 or newer,
as `inspect` and `start` do. After the CLI pin check and before reading records
or observing project work, it checks the Git version. Older Git fails with
`GIT_VERSION_UNSUPPORTED`, naming the installed and minimum versions, and
changes nothing. `CLI_PIN_MISMATCH` still takes precedence under another CLI.

```sh
repo-standards status --json
repo-standards resume --retry --json
```

`status --json` reports the active run's `phase`, `reason`, `changes`,
`completed`, `uncertain`, `nextAction`, and `execution`. `execution: active`
means a command or recorded author process group is still running. Background
members keep the group active even after a fix or prerequisite probe returns.
Recorded leader start identities distinguish an unrelated live leader that
reuses a process-group number; a leaderless group is still treated
conservatively as active while it has surviving members.
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
history. Retry discards the run's accepted assessment: a new submission against
the retried request is required, even if project bytes match.
Retry records separate
fix and agent observation intervals, retaining earlier observed agent edits
even when replayed fixes overwrite the same files. Retry cannot erase
recorded scope violations or create scope authority; see the
[observed execution contract](script-protocol.md#observed-adoption-scope). Submit a new assessment separately after retry;
`--retry` and `--assessment` cannot be combined. Plain `resume` and
`resume --assessment` remain the contextual interface and never implicitly retry
uncertain process outcomes. A failed completion write remains incomplete until
its candidate state is verified and recovery finishes.

`abandon` ends an incomplete run while keeping its work:

```sh
repo-standards abandon --json
repo-standards status --json
```

Abandon leaves project content and HEAD in place and retains incomplete evidence.
It archives the report under Git's `repo-standards-reports/<run-id>.json`; `status`
returns these reports in `abandoned`. Operation logs and local report snapshots
are copied alongside the archived report in a directory named for the run ID.
Archived operations point to those copies, so later adoption and removal of the
incomplete installation cannot overwrite their evidence. Archived paths are
relative to Git's directory for the working tree, including when that directory
lives outside the working tree, as in a linked worktree.
`archivedFiles` maps original report and operation-log paths, which stay
project-relative, to their archived copies, including logs written before their operation result reached the journal.
Abandonment reports `outcome: incomplete` with `abandoned: true` and exit status 1;
it does not assert successful adoption or replace last-complete evidence. The
CLI releases the run only after preserving any candidate completion state and
archiving its report. Failed preservation blocks abandonment and keeps the run
active for reconciliation. Preserved changes stay in the working tree for the
project's normal workflow. A new initial adoption still requires a clean
project without conflicting product state and a fresh confirmed inspection.
An archived run report is moved out of Git's directory only when it carries a
[retired format](#adopt-fresh-from-a-retired-format), because this CLI cannot
read it.

## Correct a confirmed scope

A run's confirmed scope never changes while the run is active, and retry
repeats work under it. A structurally valid blocked scope review, reporting that
coverage needs files outside the scope or that a confirmed target is mistaken,
leaves the run incomplete with `SCOPE_INCOMPLETE`; its additional paths grant no
authority. A different scope takes a new run: `abandon` ends the current one and
keeps its changes, the next `start` requires a clean committed project, and the
new run's inspection, with a new discovery proposal, needs its own explicit
confirmation. Content the abandoned run installed, once restored to its
committed state, is installed again by the new run; an abandoned run's product
state is not a complete adoption.

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
the report, which has `retained: true`. With the pinned CLI it describes the
unchanged selection; with a different exact CLI version it describes a CLI
update. Either can be confirmed and started as described above. Active discovery
declarations require fresh `--scope` proposals; retained historical scope never
substitutes for them.

`status` reports pins, active progress, and historical last-complete evidence
without any network request; [`outdated`](available-updates.md) reports
available CLI and standards updates. Both require the pinned CLI. `status` takes
the pin from the active run when a run is active, otherwise from the last
complete adoption; `outdated` takes it from the committed selection. Under
another CLI version each exits 1 with `CLI_PIN_MISMATCH`, as `resume` and
`abandon` do for an active run. The diagnostic names the pinned version and,
when the runtime manifest and npm lock both pin it, the project root and the
runtime reinstall command above; otherwise it names an exact CLI installed
outside the project, as [recovery](#recover-or-abandon-an-interrupted-run)
describes. Without a recorded pin, as before an initial adoption starts, any CLI
reports. Only `inspect` and `start` accept a different exact CLI, as a candidate
CLI pin change.
After an abandoned update, `status` still returns the archived report. If the
preserved product files do not represent complete adoption, `stateError`
describes that condition; historical evidence comes from the matching archived
run and does not certify the candidate selection as complete.
It does not claim ongoing compliance after subsequent project edits. While an
initial run is incomplete, no last-complete adoption is reported. The installed
`adopt-standards` skill guides these same commands and confirmation requirements.
