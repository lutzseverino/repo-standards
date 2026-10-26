# How Repo Standards works

Write your setup down once. Your coding agent applies it to every repository.
This page tells the homepage's short story in words, says what the CLI and
your coding agent each do, names the tools that fit some jobs better, and
states the current limits.

## Every repository, set up its own way

Repositories differ. Each one collects its own agent instructions,
contribution guide, README, issue templates and checks, written at a different
time by a different hand. Nothing keeps them in step, so a convention settled
in one repository is copied by hand into the next, or forgotten there.

## Write the setup down once

A standards source is a published, versioned setup: agent instructions, docs,
templates and checks, written down once in a public GitHub repository and
released as versions. A source can offer profiles for different kinds of
repository. [Repo Canon](https://github.com/lutzseverino/repo-canon) is a
ready-made setup to start from, with documentation, contribution, agent
workflow and GitHub conventions. You can also write and
[publish your own](/docs/guides/author-a-source/).

## Your coding agent applies it

Adoption applies a pinned version. Ask your coding agent to run one command
with the source's URL, or run it yourself in a terminal:

```
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

The run selects a version and a profile, records them under
`.repo-standards/`, pinning that version and the CLI that ran, and applies the
version to the repository. Part of the work is exact and part needs judgment
about your repository; [who does what](#who-does-what) splits them. Every
change stays uncommitted for you to review.
[Adopt a standards source](/docs/guides/adopt/) walks through both paths.

## All alike, and kept that way

Updates move the pin. When the source publishes a newer release, `outdated`
reports it, and running `adopt` again moves the pin and applies the new
version, reviewed and committed like the first adoption. Repositories on the
same pin carry the same setup, and each keeps the content it owns. Whether and
when to update stays your decision, unless you opt in to having every update
proposed.

## Who does what

### The CLI

The CLI resolves the pinned release from GitHub, installs the source's exact
files and skills, installs the rules they keep satisfying, and runs the
source's fixes and checks. Exact files replace the tracked content at their
paths: an edit to an installed file does not survive an update. An overwrite
that discards edits needs confirmation first, and untracked content at such a
path, which Git cannot recover, stops the run instead. The CLI never commits.

### Your coding agent

Your coding agent does the contextual work. It reads the source's guidance,
finds which of your files it covers, and adapts only content your project
owns, such as its documentation, against the rules the source wrote down. It
leaves the exact files to the CLI, and the project keeps owning what it
adapts.

### You

You choose the source and ask for the adoption. Before committing, you review
the scope your agent found and every change in the uncommitted diff, through
your project's usual workflow. With an agent, only an unsettled profile choice
or an overwrite of a remote setting needs your answer during the run.

### Updates

Updates arrive when you run `adopt` again, or through the opt-in
[update action](/docs/guides/automated-updates/), a GitHub action that
proposes every available update as one rolling pull request, much like a
dependency bot. It never merges: you review and merge its pull request like
any other.

## When something else fits better

Other tools share a setup too, and for these jobs they are the better choice.

- **A new repository.** Start it from a
  [GitHub template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template),
  which copies its files and directory structure into a new repository with
  its own history, or render it from a
  [Copier](https://copier.readthedocs.io/en/stable/) template.
- **Many repositories on one stack.** If their differences fit template
  variables, use Copier: it records your answers in `.copier-answers.yml`, and
  `copier update` renders the newer tagged template and
  [reapplies your project's own changes](https://copier.readthedocs.io/en/stable/updating/).
  [Renovate's Copier manager](https://docs.renovatebot.com/modules/manager/copier/)
  proposes that update when the template tags a release. It is deterministic
  and needs no agent.
- **Generated configuration nobody edits by hand.** Use
  [projen](https://github.com/projen/projen). It synthesizes files such as
  `package.json` and GitHub workflows from a typed definition in `.projenrc`,
  and marks them read-only.
- **An Nx monorepo.** Use
  [Nx generators](https://nx.dev/docs/features/generate-code) to scaffold, and
  `nx migrate` to update package versions and run
  [the migrations](https://nx.dev/docs/features/automate-updating-dependencies)
  that change your configuration and code to match.
- **Identical files in repositories you own.** A file-sync action, such as
  [Repo File Sync Action](https://github.com/BetaHuhn/repo-file-sync-action),
  opens pull requests that copy files from one repository to others. For
  community health files such as `CONTRIBUTING.md` and issue templates, an
  organisation's public `.github` repository supplies
  [default files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
  to every repository that has no file of its own.
- **Only agent skills.** Use the
  [skills CLI](https://github.com/vercel-labs/skills), `npx skills`, which
  installs skills for many coding agents and checks them for updates.

Repo Standards fits a shared setup that is mostly prose and process, applied
across many differently shaped repositories, where part of it is exact files
and part needs judgment about each repository, and kept current by updates you
review.

## Current limits

- GitHub only: standards sources come from public GitHub repositories, and the
  update action is a GitHub action.
- No private standards sources.
- Node.js 24 or 26, on macOS or Linux.
- The contextual part needs a coding agent. Without one, the terminal walks
  you through it, and you make the edits yourself.
- One real public source today: [Repo Canon](https://github.com/lutzseverino/repo-canon).
