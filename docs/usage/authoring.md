# Author a standards source

A standards repository supplies ordinary content, complete profiles and trusted
operations. The product owns adoption. The
[`author-standards` skill](installation.md#install-the-authoring-skill) guides
creation, revision, and resumption of a source, and ends at author-reviewed,
validated local material; it does not provision, commit, tag, release, or
adopt, and a local directory is not yet adoptable. Publication, below, is
separate work.

[Author format](author-format.md) defines the four declaration forms, complete
profiles, and discovery; the [Alice example](../../examples/alice/standards.yaml)
shows defaults, a complete work replacement and an employer-content exclusion.
The [Mira example](../../examples/mira/standards.yaml) uses operational guidance,
a repeat-safe fix and a different check. Guidance should give an agent
observable goals, useful evidence requirements and boundaries, while letting it
describe the actual project; generic replacement prose discards project facts.
Operations follow the [script protocol](script-protocol.md); document the tools
they require so adopters can install them deliberately before adoption.

A published working source is [repo-standards-example](https://github.com/lutzseverino/repo-standards-example),
based on synthetic Mira material. It was published with the same validation and
discovery commands below.

## Validate

Validate all profiles with an installed compatible CLI:

```sh
repo-standards source validate /path/to/standards --json
```

Validation checks declarations and references; it executes neither operations
nor probes and does not assess guidance or author-skill quality, concrete scope
safety, or semantic completeness in an unfamiliar project. The skill's
[exercise guide](../../skills/author-standards/references/operations.md) runs
operations against disposable directories through the script protocol, without
a Git repository or adoption. The separate [confirmed adoption workflow](adoption.md)
exercises integration against published sources and committed adopting
projects.

## Publish and evolve

Choose a public GitHub repository for this standards source, independently of
the product repository. Commit the root `standards.yaml`, all referenced files
and a root `LICENSE` or `LICENCE` file (recognized suffixes include `.md` and
`.txt`). Choose licensing that permits the intended copying and use. Adoption
retains root license entries and their contents alongside selected source
material and records their hashes and Git provenance. Entries may be files or
directories; neither the root entry nor its contents may contain symbolic links.
Local validation and remote acquisition reject these links with
`SOURCE_SYMLINK`. It does not infer permission from a public repository
or copy unrelated files and other profiles into retained inputs.

Set `requires.repo-standards` to an open-ended minimum: the oldest CLI version
you have tested, such as `>=1.3.0`, without an upper bound or exact version.
The range gates only which CLI versions can select this standards version from
its source. An adopter's later CLI update keeps their retained standards
whenever the new CLI supports this source format, so an upper bound protects no
one and blocks adopters from selecting your next version. Validation checks
compatibility with the running CLI and resolves **all** profiles. A stable
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

Acquire the executable and its matching documentation through
[public npm installation](installation.md). The standards source itself is an ordinary public GitHub repository.

Keep published tags immutable: an observed moved tag is rejected. For an update,
publish another stable tag and describe replacements, retired declarations,
changed scripts/prerequisites and CLI compatibility. Removing/excluding an ID
relinquishes governance and removes its installed content, except content the
adopter edited, which stays as the adopter's own. Renaming an ID
retires one and adds another. A still-declared skill replaces its whole
directory, removing obsolete resources. Adopters inspect and confirm each
update; the inspection lists each local exact-content edit that the update
replaces, and each edited target that leaves the selection and stays. One update can change their CLI
pin, standards version, source, and profile together; your declared range gates
only which CLI versions can select a standards version.
