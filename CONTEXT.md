# Repository Standards

Canonical language for a neutral product that publishes and applies versioned
repository standards.

## Language

**Product repository**:
The repository that owns the standards format, deterministic CLI, and shared
system skills.
_Avoid_: Standards repository, author repository

**Standards repository**:
An independently authored Git repository that publishes one standards source.
_Avoid_: Product repository, registry entry, policy pack

**Adopting project**:
A project repository that selects and applies one profile from one standards
source.
_Avoid_: Consumer repository, participating repository

**Standards source**:
The versioned contents published by one standards repository through its root
`standards.yaml` and referenced material.
_Avoid_: Marketplace package, registry package

**Author preference**:
An author's confirmed choice about what their standards should express.
An observed practice or an agent recommendation is only a candidate until the
author confirms it.
_Avoid_: Inferred requirement, agent default

**Authoring notes**:
An author's record of confirmed decisions and their rationale, explicit
non-preferences, skipped topics, and unresolved questions about their standards.
The notes support continued authorship; they do not govern adoption.
_Avoid_: Adoption policy, resolved selection

**Defaults**:
The shared declarations in a standards source that form the first and only
inherited level of profile resolution.
_Avoid_: Base profile, profile chain

**Profile**:
A complete named standards selection resolved from defaults plus that profile's
replacements and exclusions.
_Avoid_: Ecosystem profile, partial selection, overlay

**Declaration**:
A named, complete unit of standards material and its associated checks and
fixes that is inherited, wholly replaced, or excluded during resolution.
_Avoid_: Fragment, merge patch

**Declaration ID**:
A stable lower-case name that identifies one declaration inside a standards
source across its defaults, profiles, and published versions.
_Avoid_: Target path, global identifier

**Exact content**:
Author-owned content installed as a whole file or whole skill directory and
tracked against its installed baseline.
_Avoid_: Generated guidance, merged content

**Contextual guidance**:
Author-provided direction used by an agent to assess or adapt project-owned
content without transferring ownership of that content to the standards
source.
_Avoid_: Template, exact content

**Repository guidance**:
Contextual guidance that applies to an explicit set of project paths or
directory trees instead of one file.
_Avoid_: Global guidance, glob rule

**System skill**:
A product-owned Agent Skill that exposes shared Repository Standards behavior
and whose reserved name cannot be replaced by an author.
_Avoid_: Author skill, adoption hook

**Author skill**:
An ordinary-work Agent Skill supplied by a standards source as exact content.
It cannot replace or extend adoption behavior.
_Avoid_: System skill, adoption hook

**Inspection**:
A read-only evaluation of a standards selection and adopting project that does
not execute author code.
_Avoid_: Dry-run adoption, validation

**Inspection identity**:
A content-derived identity that binds an inspection to its exact standards
selection and relevant adopting-project state.
_Avoid_: Approval token, mutable plan file

**Adoption**:
The deliberate application of one resolved profile to an adopting project,
including exact installation, contextual work, declared fixes, and checks.
_Avoid_: File copying, installation

**Adoption run**:
One recorded execution of adoption from a confirmed inspection through a
complete or incomplete result.
_Avoid_: Transaction, deployment

**Agent assessment**:
Structured agent evidence that each contextual declaration is satisfied or
blocked for the current adopting-project state.
_Avoid_: Automated check, implicit judgment

**Complete adoption**:
An adoption run in which exact installation, fixes, contextual work, agent
assessment, checks, and durable state all succeeded.
_Avoid_: Successful script run, committed change

**Incomplete adoption**:
An adoption run in which at least one required phase did not succeed, with the
actual work and a safe next action reported.
_Avoid_: Rollback, generic failure

**Update**:
A deliberate adoption operation that moves an adopting project from its pinned
standards revision to another revision of the same source and profile.
_Avoid_: Automatic upgrade, profile switch

**Retained inputs**:
The selected standards material and provenance committed by an adopting project
so its pinned standards remain inspectable independently of source availability.
_Avoid_: Cache, working copy

**Selection**:
The current CLI version, standards source, published standards version, and
profile recorded for an adopting project.
_Avoid_: Resolved selection, desired configuration

**Resolved selection**:
The normalized complete set of active declarations produced from defaults and
one selected profile.
_Avoid_: Selection, merged profile

**Installed baseline**:
The recorded bytes and executable state of exact content at the end of the last
complete adoption.
_Avoid_: Contextual assessment, source copy
