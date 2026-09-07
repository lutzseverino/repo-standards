# Author a standards source

A standards repository supplies ordinary content, complete profiles and trusted
operations. The product owns adoption. Start with the four declaration forms in
[Author format](author-format.md); the [Alice example](../examples/alice/standards.yaml)
shows defaults, a complete work replacement and an employer-content exclusion.
The [Mira example](../examples/mira/standards.yaml) uses operational guidance,
a repeat-safe fix and a different check.

A published working source is [repo-standards-example](https://github.com/lutzseverino/repo-standards-example),
based on synthetic Mira material. Its [recorded publication journey](https://github.com/lutzseverino/repo-standards/blob/main/acceptance/results/2026-09-07/source-publication.md)
uses the same validation and discovery commands below.

## Choose ownership and write guidance

Use exact files or whole author-skill directories for material you intend to
own byte-for-byte. Use contextual file guidance for project-owned documentation
and repository guidance for explicit paths or directory trees. Guidance should
give an agent observable goals, useful evidence requirements and boundaries,
while letting it describe the actual project. Avoid generic replacement prose
that discards project facts. Authors cannot replace `adopt-standards` or add
adoption hooks; author skills support ordinary work after installation.

Give declarations stable lower-case kebab-case IDs. A profile inherits omitted
IDs, replaces a same-ID declaration in full, excludes a default declaration
with `exclude: true`, or adds a new ID. Replacement must restate its checks and
fixes. Exclusion removes associated operations as well as guidance/content.
Publish complete profiles: adopters select one profile without filtering it.

## Implement and validate operations

Read [Script protocol](script-protocol.md). Declare literal invocation arguments,
all retained resources, executable version probes/ranges and timeouts. Read the
resolved selection and allowed targets from versioned stdin JSON. Return one
result on stdout and human logs on stderr. Respect scope and exclusions; make
fixes safe to repeat and checks read-only. Resources are retention declarations,
not restrictions on host or network access. Document required tools so adopters
can install them deliberately before adoption.

Validate all profiles with an installed compatible CLI:

```sh
repo-standards source validate /path/to/standards --json
```

Validation checks declarations and references; it executes neither operations
nor probes and does not assess guidance quality. Exercise scripts and real
contextual work in disposable committed adopting projects using the
[confirmed adoption workflow](adoption.md). Check blocked and repeat outcomes,
exclusions, retained resources, unchanged HEAD and uncommitted outputs.
Record scripted checks separately from the agent's contextual evidence.

## Publish and evolve

Choose a public GitHub repository for this standards source, independently of
the product repository. Commit the root `standards.yaml`, all referenced files
and a root `LICENSE` or `LICENCE` file (recognized suffixes include `.md` and
`.txt`). Choose licensing that permits the intended copying and use. Adoption
retains root license files alongside selected source material and records their
hashes and Git provenance. It does not infer permission from a public repository
or copy unrelated files and other profiles into retained inputs.

Set `requires.repo-standards` to the CLI SemVer range you have tested. Validation
checks compatibility with the running CLI and resolves **all** profiles. A stable
standards version and the adopter's exact CLI package version are independent;
use a new standards version when you change material or compatibility.

After validating the committed contents with a compatible installed CLI, publish
the same commit. The following commands run in your standards repository; replace
`OWNER/SOURCE` and choose an unused version. They require GitHub CLI access with
permission to push and publish releases in that repository:

```sh
repo-standards source validate . --json
git status --short
# Commit any intended changes and validate that commit before publication.
git tag -a v1.0.0 -m 'Standards v1.0.0'
git push origin HEAD
git push origin refs/tags/v1.0.0
gh release create v1.0.0 --repo OWNER/SOURCE --verify-tag \
  --title 'Standards v1.0.0' --notes 'Initial stable standards release.'
gh repo edit OWNER/SOURCE --add-topic repo-standards
repo-standards source search --json
```

The release must be published, not a draft or prerelease, and its tag must be
stable SemVer, such as `1.0.0` or `v1.0.0`. Direct inspection needs only the stable
Git tag; discovery additionally requires a GitHub release and the
`repo-standards` topic. A release's tagged snapshot must contain the exact root
`standards.yaml` path and pass validation; merely adding the file to the default
branch does not repair an older release. Publication uses ordinary GitHub
features and does not add workflows or create a marketplace entry.

Confirm your repository, tag and commit in the [search report](discovery.md).
GitHub indexing can lag behind publication; check the topic and release, then
retry later. Share the canonical URL, exact stable tag and one profile for
[direct inspection](inspection.md), which does not depend on discovery:

```sh
repo-standards inspect --source https://github.com/OWNER/SOURCE \
  --standards-version v1.0.0 --profile work --project /path/to/project --json
```

Public npm delivery of the product remains issue #11; until that release, the
[README](../README.md#try-source-validation) describes installing its packed
artifact. The standards source itself is an ordinary public GitHub repository.

Keep published tags immutable: an observed moved tag is rejected. For an update,
publish another stable tag and describe replacements, retired declarations,
changed scripts/prerequisites and CLI compatibility. Removing/excluding an ID
preserves installed content and relinquishes governance. Renaming an ID retires
one and adds another. A still-declared skill replaces its whole directory,
removing obsolete resources. Adopters inspect and confirm each update; local
exact-content edits block it before mutation. Their CLI pin can change
independently within your declared compatible range.
