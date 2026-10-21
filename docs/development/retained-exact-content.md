# Retained inputs that duplicate installed exact content

An adoption retains a byte copy of every exact file and skill it installs, under
`.repo-standards/inputs/source/`. This investigation of
[#333](https://github.com/lutzseverino/repo-standards/issues/333), part of
[#281](https://github.com/lutzseverino/repo-standards/issues/281), asks whether
those copies can go when they are byte-identical to their installed targets. It
recommends and changes no behavior.

Two kinds of statement appear below. **Observed** statements come from a command
printed here, run at the named commit. **Read** statements come from the source
at `b9a0534` (CLI 9.0.0) and were not exercised.

## Summary

- Observed: the headline figure overstates what could be dropped. Of the 27 exact
  files whose retained copy equals its target (445,613 bytes), 10 (343,144
  bytes) are also resources of checks, which run from the retained inputs, so a
  copy must stay. Dropping the rest saves 17 files and 102,469 bytes, 12.9% of
  the retained source. Skills add 53 files and 163,062 bytes.
- Observed: Git stores identical content once, and the copies are 0% to 10% of
  the changed bytes in five recent adoption pull requests.
- Read: the copy is the only local source of the standards' bytes once an
  installed target is edited, and it is what keeps `inspect` and `start` working
  without the source. Dropping it weakens those guarantees.
- Recommendation: keep everything (Option A) and record the decision.

## Measurements (observed)

Clone each repository at its commit:

```sh
git clone https://github.com/lutzseverino/repo-standards && git -C repo-standards checkout b9a0534233463b7f7f70ad8e76dffe2d96d24c57
git clone https://github.com/lutzseverino/repo-canon && git -C repo-canon checkout e570942786dec51b1628b8fd2bbf3f196c381660
git clone https://github.com/lutzseverino/postern && git -C postern checkout 2af4fbe7cd7dcbd21dcad16ac39efdeccc5ca002
```

Save this as `measure.py` and run `python3 measure.py <clone>` for each. It
compares each exact declaration's retained source (`inputs/resolved.json` names
`exact` and `target`) with its target, byte for byte, and does the same for each
skill directory against `.agents/skills/<name>`. A copy that a script, resource,
guidance, discovery or rules reference also names counts as shared.

```python
import json, os, sys

root = sys.argv[1]
source = os.path.join(root, ".repo-standards/inputs/source")
declarations = json.load(open(os.path.join(root, ".repo-standards/inputs/resolved.json")))["declarations"]


def tree(path):
    """Every file under path (or path itself), keyed relative to it."""
    if os.path.isfile(path):
        return {"": path}
    return {
        os.path.relpath(os.path.join(directory, name), path): os.path.join(directory, name)
        for directory, _, names in os.walk(path)
        for name in names
    }


def read(path):
    with open(path, "rb") as file:
        return file.read()


def references(declaration):
    """Source paths a declaration points at other than its installed content."""
    paths = [declaration[key] for key in ("guidance", "discovery", "rules") if key in declaration]
    operations = declaration.get("fixes", []) + declaration.get("checks", [])
    operations += [op["remote-setup"]["probe"] for op in operations if "remote-setup" in op]
    if "discovery-script" in declaration:
        operations.append(declaration["discovery-script"])
    for operation in operations:
        paths += [operation["run"]["script"], *operation["run"]["resources"]]
    return paths


referenced = {
    os.path.normpath(os.path.join(path, name))
    for declaration in declarations
    for path in references(declaration)
    for name in tree(os.path.join(source, path))
}

retained = [os.path.join(d, n) for d, _, names in os.walk(source) for n in names]
print(f"retained source: {len(retained)} files, {sum(map(os.path.getsize, retained))} bytes")

for kind, field in (("file", "exact"), ("skill", "source")):
    chosen = [d for d in declarations if d["kind"] == kind and field in d]
    identical = files = size = shared_files = shared_size = 0
    for declaration in chosen:
        copy = os.path.join(source, declaration[field])
        target = (
            os.path.join(root, declaration["target"])
            if kind == "file"
            else os.path.join(root, ".agents/skills", declaration["name"])
        )
        a, b = tree(copy), tree(target) if os.path.exists(target) else {}
        if not a or a.keys() != b.keys() or any(read(a[k]) != read(b[k]) for k in a):
            continue
        identical += 1
        for name, path in a.items():
            files += 1
            size += os.path.getsize(path)
            if os.path.normpath(os.path.join(declaration[field], name)) in referenced:
                shared_files += 1
                shared_size += os.path.getsize(path)
    print(
        f"{kind}: {len(chosen)} declarations, {identical} byte-identical to their target"
        f" ({files} files, {size} bytes); {shared_files} files ({shared_size} bytes)"
        f" are also referenced by a script, resource, guidance or rules;"
        f" droppable {files - shared_files} files ({size - shared_size} bytes)"
    )
```

| Repository, commit       | Retained source    | Exact files identical to target | Of those, also referenced elsewhere | Droppable exact files | Identical skill files (declarations) |
| ------------------------ | ------------------ | ------------------------------- | ----------------------------------- | --------------------- | ------------------------------------ |
| repo-standards `b9a0534` | 117 files, 794,745 | 27 of 27 declarations, 445,613  | 10 files, 343,144                   | 17 files, 102,469     | 53 files, 163,062 (18 of 18)         |
| repo-canon `e570942`     | 117 files, 794,745 | 24 of 27 declarations, 406,008  | 9 files, 325,961                    | 15 files, 80,047      | 49 files, 143,760 (17 of 18)         |
| postern `2af4fbe`        | 118 files, 807,054 | 27 of 27 declarations, 447,422  | 10 files, 343,144                   | 17 files, 104,278     | 54 files, 172,419 (18 of 18)         |

Sizes are bytes. The first row reproduces the 117-file, 794,745-byte and
27-file, 445,613-byte figures in #333. All three adopt Repo Canon's `factory`
profile, so their retained sources are alike and the rows are not independent
evidence about other sources. The shared files are vendored `marked` and
`parse5` and their licenses, `operations/lib/rendered-markdown.mjs`, and license
files that a check lists as a resource.

Repo Canon is its own standards source, so its installed targets move on after
adoption. Three exact files and one skill differ from their retained copies
there. That is the only divergence observed; the other two repositories carry
no edited target.

Git keeps one object for identical content. At `b9a0534`, `AGENTS.md` and
`.repo-standards/inputs/source/AGENTS.md` are the same blob:

```sh
git -C repo-standards ls-tree -r b9a0534233463b7f7f70ad8e76dffe2d96d24c57 | grep ' AGENTS.md$\|inputs/source/AGENTS.md$'
```

The duplication therefore costs working-tree size and entries in a pull
request's file list, not repository size. To see how much of an adoption pull
request's diff it is, save this as `diffshare.py` and run
`python3 diffshare.py repo-standards <commit>...` with the commits below. It
sums the bytes of added and removed lines.

```python
import json, subprocess, sys

repository, *commits = sys.argv[1:]


def git(*args):
    return subprocess.run(["git", "-C", repository, *args], capture_output=True, text=True).stdout


def changed_bytes(commit, path):
    """Bytes of the lines the commit adds or removes in path."""
    diff = git("diff", "-U0", "--no-color", f"{commit}^", commit, "--", path)
    return sum(
        len(line)
        for line in diff.splitlines()
        if line[0:1] in "+-" and not line.startswith(("+++", "---"))
    )


for commit in commits:
    resolved = json.loads(git("show", f"{commit}:.repo-standards/inputs/resolved.json"))
    copies = {
        f".repo-standards/inputs/source/{d['exact']}": d["target"]
        for d in resolved["declarations"]
        if d["kind"] == "file" and "exact" in d
    }
    paths = git("diff", "--name-only", f"{commit}^", commit).split("\n")[:-1]
    sizes = {path: changed_bytes(commit, path) for path in paths}
    total = sum(sizes.values())
    copy = sum(sizes.get(path, 0) for path in copies)
    target = sum(sizes.get(path, 0) for path in copies.values())
    print(f"{commit[:7]}: {total} changed bytes; retained exact copies {copy} ({100 * copy / total:.1f}%), their targets {target}")
```

| Adoption pull request (commit)                  | Changed bytes | Retained exact copies |
| ----------------------------------------------- | ------------- | --------------------- |
| #298 `b32f720ef776a2d13a3689f79774908df7db76e2` | 90,922        | 9,329 (10.3%)         |
| #293 `7170d9b112ca5717bc9be6918a0c7eea8beb9469` | 51,562        | 0 (0.0%)              |
| #272 `579cb4647d33bc01098b7ff1b491e8726d97e975` | 238,340       | 4,126 (1.7%)          |
| #267 `cb9d42c0a473d8255eef906e47d5b3c95c572e1e` | 101,269       | 3,560 (3.5%)          |
| #256 `a33d8c061d5c971eca1ba91886cc662a030c704a` | 584,691       | 42,915 (7.3%)         |

The targets change by the same amount, so the pair is at most about 20% of an
adoption pull request. Most changed bytes are other retained inputs, the lock
and state, and the rest of the product state. From the CLI that ships #324,
an adoption marks `.repo-standards/**` generated, which collapses all of it in
review.

## Readers (read)

Option names are defined [below](#options). In short, Option B omits a droppable
copy and reads the installed target after checking it against its recorded
baseline, and Option C omits it and reads the verified source snapshot cache.
Option A, keeping everything, changes none of these.

A copy is droppable unless a check, fix, probe or discovery script reads the
same path. `execution.ts` `execute` runs those from `.repo-standards/inputs/source`
so that editing an installed file cannot change what a check runs, and the 10
shared files in this repository keep their copies under every option.

- **The lock and final integrity** — `installation.ts` `planInstallation` puts
  each retained input and each exact target in `files`, and `baselines(files)`
  becomes the lock's `files`, so both hashes are recorded (and the target's again
  in `state.json` `baselines`). `verifyInstallation`, called from
  `adoption-run.ts` when an interrupted installation or completion is recovered
  and before a resume runs retained scripts, and from `preserved-run.ts`,
  verifies every planned file and compares the inputs
  directory with the plan ("Retained input inventory changed"). It verifies the
  target from the plan, never from its copy. _B, C:_ the plan omits the copy and
  the inventory check follows the plan; nothing new can fail.
- **The recorded adoption reader** — `recorded-state.ts` `readFrom` and
  `verifiedProductFiles` match every `.repo-standards/` entry of the lock against
  disk before reading it. Installed targets are outside that directory and are
  not verified, because editing them is allowed
  ([ADR 0010](../adr/0010-replace-tracked-content-block-only-untracked.md)).
  _B:_ the copy's lock entry is gone and the target must be verified against its
  baseline on use; a mismatch is an ordinary state and needs its own outcome,
  not `STATE_INTEGRITY`. _C:_ verification is unchanged.
- **Retained inspection and reapplying the selection without the source** —
  `RecordedAdoption.source()` checks the inputs inventory against the lock and
  returns the `RetainedSource` (`root`, `paths`, `manifest`) that
  `inspection.ts` `inspectForStart` uses in place of an acquired source. Its
  callers are `adoption.ts` `inspectRetained`, `retainedInspection` and
  `startRetained`, which serve `inspect` and `start` without source flags
  (re-applying the selection, or a CLI pin change), and `adopt.ts`, which falls
  back to it when the source is unavailable. `resolver.ts` `validateSource` with
  `paths.ts` `Paths.reference`, and `skill-invocation.ts` `validateSkillInvocation`
  (which reads each skill's `SKILL.md`), require every `exact` and skill `source`
  path to exist in that root. _B:_ `source()` must lay the verified target bytes
  into the root, as `commitFiles(...).inputs()` already does for committed state.
  _C:_ it must acquire the snapshot, which needs GitHub (see Option C).
- **Where retained bytes become the candidate** — `inspection.ts`
  `inspectForStart` sets `desiredExact[...] = observe(join(source.root, ...))`.
  This is the only place retained exact bytes are read as content. It feeds
  `materials.exact`, which `planInstallation` installs, and `changedFiles` and
  `exactDelta`, which produce `exact[].files` and the discarded-edit diffs
  (before is the observed target, after is the candidate). _B:_ with an unedited
  target the candidate equals the target, so the files and identity are the same.
  With an edited target the candidate is gone: the edit's diff, its replacement
  and the identity of a retained inspection cannot be produced. _C:_ the same,
  unless the snapshot is reachable.
- **A fresh checkout** — the committed tree carries the targets as of the commit,
  and `npm ci` restores only the runtime. `status`, `check` and `inspect` read the
  recorded adoption as above. `check.ts` `check` calls `recorded.source()` only
  to verify integrity and then runs checks from the retained scripts, so under B
  it must keep working with an edited target, which means `source()` needs a
  scripts-only mode. _B:_ unedited targets work. _C:_ nothing works, because the
  cache is per machine and never committed.
- **The inspection identity** — `inspectForStart` hashes the whole report. It
  includes `inputs` (a hash inventory of every referenced input, exact paths
  included), `exact[].files` and `project.affected`, all computed from observed
  bytes, never from an inventory of the inputs directory. Unchanged hashes give
  an unchanged identity. _B, C:_ the hashes must still be available, as they are
  in the lock and `state.json`.
- **Edited and kept targets** — `target-ownership.ts` `judgeTargetOwnership` and
  `isBaseline` compare the target with `state.json` `baselines`. Replacement of
  an edit (ADR 0010) and keeping an edited retired target
  ([ADR 0016](../adr/0016-keep-edited-content-that-leaves-the-selection.md))
  decide from hashes alone, and the update replaces `.repo-standards/inputs`
  whole (`planInstallation` `replaceTrees`), so a kept target has no copy.
  _B, C:_ unaffected, except that replacing an edit needs the candidate bytes
  above.
- **Retired-format paths** — `recorded-state.ts` `rejectUnsupportedRecords` fails
  `RETIRED_FORMAT` or `NEWER_FORMAT` from the records' format identifiers, and a
  fresh adoption over retired state removes `.repo-standards` whole. Neither
  reads retained exact bytes. _B, C:_ unaffected, but see the format question
  under Option B.
- **The update comparison** — `update-comparison.ts` `compareUpdate` reads
  hashes of guidance, discovery, rules, scripts and resources from the lock
  (`retainedFiles`). Exact content never affects the update class. _B, C:_
  unaffected; a shared file keeps its entry.
- **A stopped run's previous adoption** — `recorded-state.ts`
  `readCommittedAdoption` and `commitFiles`, used by `preserved-run.ts`, read the
  last complete adoption from the commit an incomplete or abandoned update
  started from, with `committedFiles(root, commit, ".repo-standards")`. The
  working tree's targets belong to the stopped run. _B:_ the layout must also read
  each target's blob at that commit and verify it against that commit's lock.
  _C:_ it needs the snapshot instead.

Scenarios, from those readers:

| Scenario                                                                   | A (keep) | B (read target)                | C (snapshot cache) |
| -------------------------------------------------------------------------- | -------- | ------------------------------ | ------------------ |
| Unedited targets, source reachable                                         | works    | works                          | works              |
| Fresh checkout, unedited targets, source gone                              | works    | works                          | fails              |
| Edited target, `inspect` or `start` without source flags, source reachable | works    | fails for that file            | works, online only |
| Edited target, source gone                                                 | works    | fails for that file            | fails              |
| `check` with an edited target                                              | works    | works only with a scripts mode | works              |

## Options

**A. Keep everything.** No format change, no change to the offline and
source-unavailable guarantees (architecture
[acceptance criterion 8](architecture.md#acceptance-criteria) and
[Fresh checkout and source disappearance](../usage/adoption.md#fresh-checkout-and-source-disappearance)),
no migration, no SemVer class.

**B. Record only the hash of a copy that matches its target, and read the
installed target.**

- _Format:_ the copy leaves `inputs/source/` and the lock's `files`. No key is
  needed, since `resolved.json` already maps `exact` to `target` and a skill's
  `source` to its directory. An earlier CLI would reject the new layout, though,
  and the architecture's rule is that "a value an earlier reader would reject
  counts as a change" ([Durable state](architecture.md#durable-state-and-ownership)).
  If that raises `repo-standards/lock/v1`, every existing adoption becomes
  retired state and needs a fresh adoption. Whether a different layout under the
  same keys raises the format is the owner's decision.
- _Guarantees:_ unchanged for unedited targets. For an edited target, the
  documented behavior that "local edits to exact project content remain visible
  in the report" of a retained inspection is lost, and so is replacing the edit
  without the source.
- _Migration:_ with a reader that accepts both layouts and no format raise, the
  first update rewrites `.repo-standards/inputs` whole and deletes the copies in
  that pull request. With a raise, a fresh adoption per adopter.
- _SemVer:_ major with a format raise, or if the edited-target limitation counts
  as breaking the documented guarantee, as the 9.0.0 release decided for an
  incompatible contract. Minor only if the owner accepts the limitation as
  outside the guarantee and the reader tolerates both layouts.

**C. Fall back to the verified source snapshot cache.**

- _Format:_ the same as B.
- _Guarantees:_ the cache lives outside the project at
  `$XDG_CACHE_HOME/repo-standards/`, is never committed, and an acquisition
  "resolves the repository's public identity and the selected tag through
  GitHub ... before it reuses anything"
  ([Source reuse](architecture.md#source-reuse-and-the-request-budget)). So a
  fresh checkout, another machine, or a source that is gone cannot read the
  exact content: criterion 8 fails for every adoption. As the fallback for an
  edited target only (B with C), the loss narrows to an edited target with an
  unreachable source, and retained inspection starts to need the network there.
- _Migration:_ the same as B.
- _SemVer:_ major, since it removes a documented guarantee outright.

## Recommendation

Choose **Option A: keep everything**, and record why.

- The saving is small beside the headline. Droppable exact copies are 12.9% of
  this repository's retained source; with skills, 33.4% (265,531 of 794,745
  bytes), and Git stores none of it twice.
- In review, the copies are at most 10.3% of an adoption pull request's changed
  bytes, and #324 collapses them in review for adoptions made with the CLI that ships it.
- The cost falls on the contracts the retained inputs exist for: retained
  inspection without the source, replacing an edit without the source, a
  stopped run's previous adoption, and a lock format that may force every
  adopter into a fresh adoption.
- The one divergence observed (Repo Canon, a source repository) is what the copy
  protects against.

Revisit if a source ships large exact files that no check reads, so that the
droppable share grows well past a third of the retained bytes, or if a
source-independent way to recover the installed baseline bytes appears. Neither
holds at the measured commits.

Follow-up ticket, not filed:

- **Record why retained inputs keep installed exact content.** Add an ADR (the
  next number after 0022) that states the decision with its reasons: the copy is
  the candidate for retained inspection, for replacing an edit and for a stopped
  run, and shared files are check resources. Add one sentence to Durable state
  and ownership in the architecture contracts, linking it. Cite #333 for the
  measurements, and delete this document in the same change, as the
  documentation rules ask for superseded material.

Should the owner choose B instead, the work splits into two tickets, neither
recommended here:

- **Read installed exact targets as retained exact content.** The recorded
  adoption reader, retained inspection, committed-state layout and planning of
  inputs, with the format decision above and a defined outcome for an edited
  target.
- **Give `check` a scripts-only retained source.** Keep `check` independent of
  the exact content so that an edited target cannot fail it.
