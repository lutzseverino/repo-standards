# Contributing

## Issues

Use an issue for behavior changes and substantive work unless the maintainer
requests the change in a thread. Work without a ticket is a Direct change; see
[pull requests](#pull-requests). Agree on the scope and acceptance criteria
before implementation. Open issues with the repository's issue
templates. Specifications and implementation tickets live in the issue tracker;
repository documents keep durable domain language, decisions, usage guidance,
and development knowledge.

Write multi-line issue bodies to a file and pass it with `--body-file`.

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

When adding a native blocker, pass the blocking issue's numeric database ID as
`issue_id`, not its issue number or `node_id`.

## Readiness

Applying `ready-for-agent` or `ready-for-human` is the review action and needs
the repository `admin`, `maintain`, or `triage` role. After revising a contract
or posting an Agent Brief, wait for the issue-contract workflow's revision
notice before applying readiness. Editing a contract removes its readiness. A
specification or ticket can be ready while its blockers are open.

The factory picks up ready issues. Without a `model:` label it runs the
factory's default model. Name a stronger model with `model:<slug>` or
`model:<provider>/<slug>`, optionally followed by `@<effort>`, when the work
needs design judgment, has an ambiguous scope, or makes a long cross-cutting
change; create the label if the repository lacks it. A `claude-*` or `gpt-*`
slug needs no provider. Add `run:orchestrated` to a ticket for an implementer
and a reviewer that are different agents; a specification always runs that
way.

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
A Direct change is work without a ticket, requested by the maintainer in a
thread or making a minor correction, such as a typo, broken link, or formatting
fix. Write `Direct change:` and a meaningful reason instead of the issue link.

Write multi-line pull request bodies to a file and pass it with `--body-file`.

Keep the pull request template's sections in order: Summary, Evidence, Merge
Danger, and Related issue. Include checks and outcomes in Evidence, and
relevant limits in Merge Danger. Put any other material, such as scope, impact,
or migration, in a subsection of the section it belongs to.

### Opening a pull request

Open the pull request against the base branch that `docs/agents/project.md`
names, else the default branch. Its branch holds only the work: branch from the
up-to-date base, and leave unrelated changes out of its commits. Title it as
[titles and commits](#titles-and-commits) describe.

Before opening, run the required checks on the final commit. When the checkout
holds unrelated uncommitted edits, run them in a clean checkout of that commit,
such as a temporary Git worktree. Run a check that reads a diff, such as
`git diff --check`, over the whole change against the base.

Write the body with the `pr` skill, in the pull request template's sections:
the skill's Summary, Evidence and Merge Danger, then Related issue.

### Adoption pull requests

An adoption pull request holds one completed Repository Standards adoption or
update run and nothing else: the run's `changeSet` paths and `.repo-standards/`.
Before opening it, read `status --json` with the project's pinned
`.repo-standards/runtime/node_modules/.bin/repo-standards`. Open it only when
`active` is `null`, `lastComplete` is present, there is no `stateError`, and
every `changeSet` path is among the uncommitted changes; otherwise finish or
recover the run with the `adopt-standards` skill.

Title it `chore: adopt <source> <version> with CLI <version>`, naming the
source by the repository name in its URL and the versions from the record's
Selection table, such as `chore: adopt repo-canon v0.6.0 with CLI 5.1.0`. An
adoption is not breaking unless the maintainer judges it breaking for the
project.

Its body is the adoption record: the output of `status --summary`, byte for
byte, starting with its `# Repository Standards adoption record` heading. The
record omits the checks, so post their outcomes as one comment. The record
stays the body; for a breaking (`!`) title, add Impact and Migration sections
after the record.

### Merging

Merge a pull request once every required check passes on its latest head and
every review thread is answered. Squash-merge pull requests into their base
branch, using the PR title as the commit subject and its description as the
body. Preserve issue references and breaking-change explanations in the final
message.

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
