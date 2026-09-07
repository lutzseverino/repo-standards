# Author a standards source

A standards repository supplies ordinary content, complete profiles and trusted
operations. The product owns adoption. Start with the four declaration forms in
[Author format](author-format.md); the [Alice example](../examples/alice/standards.yaml)
shows defaults, a complete work replacement and an employer-content exclusion.
The [Mira example](../examples/mira/standards.yaml) uses operational guidance,
a repeat-safe fix and a different check.

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

Publish the source as a public GitHub repository containing the root
`standards.yaml`, referenced content and a license suitable for retained copies.
Tag the intended commit with a stable SemVer such as `v1.0.0`. Share the canonical
GitHub URL, exact stable tag and profile for direct inspection. Add the
`repo-standards` GitHub topic if you want discovery. Publication/discovery release
verification is tracked separately from these authoring steps; public npm
installation remains issue #11.

Keep published tags immutable: an observed moved tag is rejected. For an update,
publish another stable tag and describe replacements, retired declarations,
changed scripts/prerequisites and CLI compatibility. Removing/excluding an ID
preserves installed content and relinquishes governance. Renaming an ID retires
one and adds another. A still-declared skill replaces its whole directory,
removing obsolete resources. Adopters inspect and confirm each update; local
exact-content edits block it before mutation. Their CLI pin can change
independently within your declared compatible range.
