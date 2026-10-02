# Agent guidance

Before changing this repository, read `CONTRIBUTING.md`.
Read `docs/agents/project.md`, when present, for repository-specific constraints.

For setup and validation commands, read `docs/development/README.md`.

## Available updates

At the start of work, when the project runtime is installed, you may run
`.repo-standards/runtime/node_modules/.bin/repo-standards outdated --json`. It
changes nothing except an ignored cache. If it fails with `CLI_PIN_MISMATCH`,
the project runtime differs from the pin: reinstall the pinned runtime with the
command the failure names, then run `outdated` again. Mention to the maintainer
each pin it reports as `update: available`, with the pinned and newest versions.

Propose any adoption or update, in a ticket or during the current work, only
after a read-only inspection made with the public CLI through the
`adopt-standards` skill. Complete the inspection, including any scope proposal,
and cite its update class (`updateClass`), blockers (`start.blockers`), and
`identity` in the proposal. An initial adoption has no update class; say so
instead.

Treat each available update as separate work, and inspect it when the
maintainer takes it up. Carry an `exact` update on through that skill as its
own small pull request. Stop a `contextual` update at inspection and propose it
as a ticket. Continue the current work as planned either way, and keep update
changes out of the current work's branch.

## Agent skills

### Issue tracker

Issues, specifications, and tickets live in GitHub Issues, worked with the `gh`
CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context by default: a root `CONTEXT.md` and `docs/adr/`; a root
`CONTEXT-MAP.md` makes it multi-context. See `docs/agents/domain.md`.
