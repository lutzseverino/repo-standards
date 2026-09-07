# Confirmed exact-content adoption

Issue #4 supports initial adoption of a profile containing exact files and whole
author skills, with no contextual declarations, fixes, or checks. Such additional
requirements are rejected before project mutation. Script execution, contextual
work, updates, and interrupted-run retry belong to later implementation slices.
Public npm delivery remains issue #11.

## Inspect, confirm, and start

Use Node.js 24, npm, Git, and the exact CLI obtained by the
[bootstrap](inspection.md). First inspect the public GitHub selection:

```sh
repo-standards inspect --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --json
```

Review the pins, proposed replacements, matching-file claims, whole-skill
inventories, and blockers. After explicit maintainer confirmation, use the same
CLI version and selection, passing the report's `identity` verbatim:

```sh
repo-standards start --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --confirm 'sha256:INSPECTION_HASH' --json
```

Both commands accept `--project <directory>` and default to the current Git
working tree. Store inspection reports outside the project to keep it clean.
`--confirm` represents the maintainer's explicit confirmation; the CLI cannot
establish whether an agent obtained that confirmation truthfully.

Start requires the same content-derived inspection identity, existing HEAD,
clean index and working tree, no non-ignored untracked files, safe targets,
recoverable replacement content, and unambiguous skill ownership. Git flags
that hide changes and nested submodules block this initial journey. An existing
unrelated skill conflicts even when its bytes match. Existing matching exact
files are claimed without rewriting; unrelated and excluded content remains
outside the selection.

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
| `.repo-standards/state.json` | Last-complete run, inspected HEAD, completion time, exact baselines, full skill file inventories, and separate empty check/assessment evidence for this exact-only journey. |
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
The exclusive lock lives at Git's `repo-standards-run.lock` path, outside tracked
content and separate for each working tree. It records the current run even if
installation is interrupted before local product reports can be created.
`.repo-standards/local/run.json` records progress once installation begins.
Neither dependencies nor run records belong in commits.

## Completion and incomplete results

`start` prints a `repo-standards/run/v1` JSON report. Its fields include `id`,
`inspection`, `selection`, `affected`, `outcome`, `phase`, `reason`, `changes`, `completed`,
`uncertain`, and `nextAction`. Exit status is 0 for complete adoption, 1 for an
incomplete run or rejection, and 2 for invalid usage. Preflight rejections use
the common `valid: false` / `errors` diagnostic format.

Completion requires expected exact bytes and executable bits, whole-skill and
retained-input inventories, runtime dependencies, durable product files, and
unchanged HEAD and index. Exact and durable outputs must also be visible to
Git's normal add workflow; ignore rules hiding new adoption outputs make the
run incomplete. Verification uses the original expected installation
values; unexpected changes cannot become new baselines. Completion leaves all
changes uncommitted and releases the lock.

An incomplete installation preserves changes and its lock. Its change report
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

Read `status --json`
and the run report before intervening. Stop any still-running process first.
This slice cannot resume or abandon a run automatically. Preserve the report
outside the project, review and reconcile the reported changes against the
pre-adoption commit, and remove the Git run lock only after that reconciliation.
A new initial adoption requires a clean project without leftover product state
or reserved system skills and a newly confirmed inspection. Do not treat this
manual recovery as a rollback promise or delete unrelated project work.

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
the report. This read-only report has `retained: true`; it does not authorize an
update or re-adoption in this slice. A mismatched CLI version is rejected with
instructions to use the project's pin.

`status` reports pins, active progress, and historical last-complete evidence.
It does not claim ongoing compliance after subsequent project edits. While an
initial run is incomplete, no last-complete adoption is reported. The installed
`adopt-standards` skill guides these same commands and confirmation requirements.
