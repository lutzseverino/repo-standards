# Contributing

## Before contributing

Use an issue for behavior changes and substantive work. Agree on the scope and
acceptance criteria before implementation. Small corrections, such as typos,
broken links, and formatting, may explain their purpose directly in a pull
request.

Use short, descriptive issue titles in sentence case and the project's
terminology. Name the observed failure for bugs, the desired capability for
features, the action for implementation tickets, and the capability being
specified for specifications. Avoid redundant type prefixes, issue numbers,
and trailing periods; aim for roughly 72 characters without a hard limit.

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
report the checks you ran and their outcomes, and link the relevant issue when
one is required. Include remaining limitations when relevant.

Address review feedback and ensure required checks pass before merging.
Squash-merge pull requests into the default branch, using the PR title as the
commit subject and its description as the body. Preserve issue references and
breaking-change explanations in the final message.
