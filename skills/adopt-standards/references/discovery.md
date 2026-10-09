# Build the scope proposal

An inspection whose selection has active discovery declarations returns a
`discovery` field and the `DISCOVERY_REQUIRED` start blocker. Each such
declaration needs a fresh proposal at every inspection: initial adoption and
every update, including one that applies an unchanged selection again.
`historicalScope` explains what an earlier run was authorized to change; it
does not prove current coverage and never substitutes for a proposal, even
when the original source is unavailable for retained work.

The proposal format, its validation, and the fields the CLI derives are defined
by the
[scope contract](https://github.com/lutzseverino/repo-standards/blob/v5.1.1/docs/usage/inspection.md#discover-contextual-file-scope).

## Judge the candidates

1. Read each declaration's discovery guidance, which says where its contextual
   guidance applies, and the contextual guidance itself, which says what the
   work does there. Both are in the report by source path and hash.
2. Inspect the eligible evidence in the real repository, not only its
   inventory. Hashes and directory listings establish what was observed; they
   do not prove that a candidate is a maintained project.
3. Decide each candidate against the author's criteria and explain the
   decision. Explain exclusions such as fixtures, generated output, and
   organizational directories. Explain the membership of a missing README.
4. Enumerate individual files: existing files, planned migration destinations,
   directory introductions, and the link-repair files around exact-owned
   content. An included candidate is always a single file. Directories and
   exact or reserved paths can only be excluded, and no candidate is a glob.
5. Resolve membership questions with the maintainer. A question that remains
   goes in `unresolved`, which keeps the inspection reviewable but never
   startable.

An explained empty scope is valid: it retains the declaration, its guidance,
and its operations.

## Write and inspect the proposal

Write the proposal outside the adopting project. For each active discovery
declaration it holds only your judgment: the candidates, each with its path,
decision, reason, and supporting evidence paths taken from
`discovery.evidence`; the coverage explanation; and the unresolved questions.
Copy no identities. The CLI derives the request binding, each evidence path's
identity, the absence of each planned file, and the included paths.

Run the same inspection again with `--scope <file>` and correct the proposal
until one complete inspection is reviewable. Present that inspection as the
skill describes, and pass the same file to `start` with its identity.
A change after inspection matters only when it alters the inspection
identity, which `start` reconstructs. A change outside everything the identity
binds leaves the identity valid. For a discovery-backed selection the
observation spans the tracked and non-ignored tree, so most commits do alter
it. Then `start` rejects the stale identity: inspect again, review the proposal
against the fresh evidence, and start with the new identity.

## Recheck coverage during contextual work

A discovery work request carries the accepted proposal and the post-fix
snapshot. Before editing, evaluate the discovery criteria again against the
project as fixes left it, and keep that evidence for the `afterFixes` review.
Before submitting, evaluate them once more against the refreshed project for
the `current` review. Each time, review the included and excluded candidates,
missing READMEs, planned destinations and links, and any explained empty
scope. These are your judgments; the CLI checks their structure and identity,
not their truth.

When coverage needs a file outside the confirmed scope, or a confirmed target
is mistaken, do not write that file. Submit a `blocked` review naming the
additional paths or the withdrawn target, as
[assessment](assessment.md#submit-the-assessment) describes, then
[correct the scope](recovery.md#correct-a-confirmed-scope).
