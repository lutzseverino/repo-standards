# Usage

Repo Standards is for maintainers who work with coding agents: write your setup down once, and your coding agent applies it to every repository.

A standards source is a published, versioned setup: agent instructions, docs,
templates and checks that its author wrote down once. Adopting one with a
single command changes your repository. It installs the source's exact files
and skills, which replace the tracked content at their paths, and an overwrite
that discards edits needs confirmation first. It adapts only content your
project owns, such as its documentation, installs the rules those files keep
satisfying, and runs the source's checks. Every change stays uncommitted for
you to review. [Repo Canon](https://github.com/lutzseverino/repo-canon) is a
ready-made setup to start from.

```sh
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

Ask your coding agent to run it with the source's public GitHub URL, or run it
yourself in a terminal; [Adopt a standards source](guides/adopt.md) walks
through both. The command installs and pins the CLI it ran, so nothing needs
installing first.

- [Guides](guides/README.md): task pages for adopting, updating, running the
  adopted checks, automated updates, writing and publishing a standards source,
  and finding one.
- [Reference](reference/README.md): the exact contracts agents and authors rely
  on: the adoption run, inspection, the author format, the script and
  assessment protocols, and the reports of `outdated`, `check` and `rules`.
