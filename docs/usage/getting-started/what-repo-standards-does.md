# What Repo Standards does

Write your setup down once. Your coding agent applies it to every repository.

A repository's _setup_ is how work happens there: its agent instructions, docs,
templates and checks. Repo Standards is a command-line tool, published as
`@lutzseverino/repo-standards`, that writes one setup into many repositories
and keeps it there. It is for maintainers with many repositories, often on
mixed stacks, who work with coding agents.

## Every repository is set up its own way

Each repository grows its own setup. One has a contribution guide and another
doesn't; one checks pull request titles and another accepts anything; one
tells agents how to open a pull request and another leaves them to guess. A
coding agent that moves between them follows whatever each one says, and
nothing stops them drifting further apart.

## Write the setup down once

Write the setup down once, in a repository of its own, and publish versions of
it as releases. A _standards source_ is a published, versioned setup. A source
offers one or more _profiles_: a profile is a complete, named selection of the
source's setup, such as one for every repository and a larger one for
repositories with an extra workflow.

[Repo Canon](https://github.com/lutzseverino/repo-canon) is a ready-made setup
to start from. To publish your own instead,
[write a standards source](../guides/author-a-source.md).

## Your coding agent applies it

_Adoption_ applies one profile of a standards source to a repository. You give
your coding agent one command, and Repo Standards prints what the agent needs
to do next. An adoption:

- installs the source's exact files and agent skills. Each one replaces the
  tracked content at its path, and an overwrite that discards edits needs
  confirmation first. Untracked content at such a path, which Git can't
  recover, stops the run instead;
- adapts only content your project owns, such as its README and
  documentation. The project keeps owning that content;
- installs the source's _rules_: plain statements of what the setup requires of
  the files they cover, or of the whole repository;
- runs the source's _checks_: scripts that verify the repository meets those
  rules.

Every change stays uncommitted, for you to review and commit like any other
change. [Adopt Repo Canon in five minutes](adopt-repo-canon.md) walks through
one.

## They're all alike, and kept that way

Every repository that adopts the same profile ends up with the same setup, and
it doesn't drift afterwards. The rules stay installed in `.repo-standards/rules/`,
and an installed skill has your agent look up the rules that cover a file
before it changes the file. The checks run again whenever you ask, against your
working tree, as [Run the adopted checks](../guides/run-checks.md) describes.

When the source publishes a new version, the same command moves each
repository to it. [Keep it up to date](keep-it-up-to-date.md) shows how.
