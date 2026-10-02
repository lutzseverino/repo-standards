# Contributing

## Issues

Use an issue for behavior changes and substantive work. Small corrections need
no issue; see [pull requests](#pull-requests). Agree on the scope and acceptance
criteria before implementation. Open issues with the repository's issue
templates. Specifications and implementation tickets live in the issue tracker;
repository documents keep durable domain language, decisions, usage guidance,
and development knowledge.

Use short, descriptive issue titles in sentence case and the project's
terminology. Name the observed failure for bugs, the desired capability for
features, the action for implementation tickets, and the capability being
specified for specifications. Avoid redundant type prefixes, issue numbers,
and trailing periods; aim for roughly 72 characters without a hard limit.

## Implementation contracts

A directly authored specification or implementation ticket carries its
implementation contract in its issue body and needs no intake triage, Agent
Brief, or category label. A triaged request's contract is its latest Agent
Brief comment; the intake body and discussion remain context.

Before implementing, read the whole issue, its discussion, its parent
specification, and its blockers, and clarify contradictions. Start a ticket
only after its blockers are closed.

## Readiness

Applying `ready-for-agent` or `ready-for-human` is the review action and needs
the repository `admin`, `maintain`, or `triage` role. After revising a contract
or posting an Agent Brief, wait for the issue-contract workflow's revision
notice before applying readiness. Editing a contract removes its readiness. A
specification or ticket can be ready while its blockers are open.

## Development setup

See the [development guide](docs/development/README.md) for prerequisites,
local setup, and development commands.

## Validation

Add or update tests for changed behavior where applicable. Run the required
checks documented in the development guide before requesting review.

## Titles and commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
for pull request titles and final commits on the default branch:

```text
fix(cli): reject incompatible standards versions
feat!: remove the legacy configuration format
```

Use lowercase types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`,
`ci`, `style`, `chore`, or `revert`. An optional scope names a stable component
or project. Write a concise action without a trailing period, preserving
proper names and identifiers. Use `style` for formatting changes.

Mark breaking changes with `!` and explain their impact and migration in the
message body. Prefer Conventional Commits during development; temporary
work-in-progress commits are allowed.

## Pull requests

Keep each pull request focused. Describe the problem and resulting change,
report the checks you ran and their outcomes, and link the relevant issue.
Small corrections, such as typos, broken links, and formatting, need no issue:
write `Small correction:` and its reason instead of the link. Reviewers judge
whether a correction is small.

Keep the pull request template's sections in the template's order, adding
Limits last when relevant. Put any other material, such as scope, impact, or
migration, in a subsection of the section it belongs to. An adoption or update
pull request may instead use the Repository Standards adoption record as its
description, starting with the record's
`# Repository Standards adoption record` heading.

Address review feedback and ensure required checks pass before merging.
Squash-merge pull requests into the default branch, using the PR title as the
commit subject and its description as the body. Preserve issue references and
breaking-change explanations in the final message.

## Documentation

Documentation categories are `usage`, `development`, `adr`, and `agents` under
each applicable documentation root. Create a directory when it has content.
Every documentation directory has a README index: a one-sentence purpose, then
one `[Title](path): description` item per entry. List each document under a
documentation root in exactly one index: its directory's README, or for a
directory README, its parent's. Other documents link to that index or cite a
document in context, and never repeat the list. The installed
`docs/agents/README.md` stays as is and cites the optional
`docs/agents/project.md` in context. The root `docs/development/README.md`
gives its purpose, then a Setup and validation section, then its index. Keep
durable research with its usage or development topic. Glossaries remain outside
`docs`, at the repository or context root.

Documentation holds maintained material only. A point-in-time record, such as
an account of one release, adoption, or validation run, stays with the pull
request, release, or CI run it records, and documents cite it by identity, such
as a tag, run ID, or commit permalink. Delete a superseded document other than
an ADR rather than keeping it under a historical label, and repair the links to
it.

An ADR is never deleted. When a later ADR supersedes it, keep it and add a
status line under its title that names and links the superseding ADR. A
superseded ADR is maintained material, not a point-in-time record.
