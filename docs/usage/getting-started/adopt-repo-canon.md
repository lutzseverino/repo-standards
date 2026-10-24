# Adopt Repo Canon in five minutes

This page adopts [Repo Canon](https://github.com/lutzseverino/repo-canon), a
ready-made setup to start from, in one of your repositories.
[What Repo Standards does](what-repo-standards-does.md) explains the terms it
uses.

## Before you start

- Use macOS or Linux with Node.js 24 or 26, its bundled npm, and Git 2.32 or
  newer.
- Start from a Git repository with at least one commit and no uncommitted
  changes, so Git can show and undo everything the adoption changes.
- Optionally, set a GitHub token in `GH_TOKEN`. Without one, the CLI shares
  GitHub's anonymous quota with everyone on your IP address; see
  [GitHub requests and tokens](../reference/github-requests.md).

## Ask your coding agent

Give your coding agent this prompt in the repository:

```text
Run `npx --yes @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon --json` in this repository and follow what it prints.
```

The command prints the agent's instructions, so nothing needs installing first.
The agent picks the newest version and a profile: Repo Canon's `standard`
profile, or `factory` for a repository a factory serves. It then reviews the
proposed changes, adapts your documentation and leaves the result uncommitted.
It comes back to you only for what it can't settle itself, such as an unclear
profile choice or a change that would overwrite a setting someone chose on
GitHub, which Git can't undo.

## Or run it yourself

In a terminal, from the repository's root:

```sh
npx @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon
```

`adopt` asks its questions one at a time, each with a proposed answer: the
version, the profile, and which of your files each part of the setup covers. It
shows the proposed changes and asks before it starts. Then it walks you through
the edits to your own files, running Repo Canon's checks after each one.

## What changes in the repository

- **`.repo-standards/`** records the selection, the source version and profile
  adopted with the CLI version, in `selection.yaml`. It also holds a copy of
  the adopted source, the installed rules, the run's state and a pinned CLI in
  `runtime/`, whose installed dependencies Git ignores.
- **Repo Canon's exact files** are installed, such as `AGENTS.md`,
  `CONTRIBUTING.md`, issue and pull request templates and workflows under
  `.github/`, and agent skills under `.agents/skills/`. Each replaces what was
  at its path.
- **Your own files**, such as `README.md` and `docs/`, are edited to meet Repo
  Canon's rules. They stay yours.
- **GitHub settings**, such as labels and merge settings, are applied when the
  repository is ready for them, and otherwise deferred to a later run.

## Review it before committing

1. Read the diff with `git diff`, and list the new files it omits with
   `git ls-files --others --exclude-standard`.
2. Check what was discarded. The run starts only after each overwrite that
   discards edits is confirmed, at a terminal by you or by the agent after it
   reviews the diff. Git still has every one of those edits in your last
   commit.
3. Review the scope: the files the run chose to cover, such as which documents
   count as your documentation. It needs no confirmation of its own. If it
   missed a file, apply the setup again once it's committed, as
   [Apply the same version again](../guides/update.md#apply-the-same-version-again)
   describes.
4. Run the pinned CLI's verdict before committing, because afterwards it
   reports the changes as no longer ready:

   ```sh
   .repo-standards/runtime/node_modules/.bin/repo-standards status --summary
   ```

   It should say **Ready to commit**. Its output is the adoption record, which
   can serve as the pull request body.

Commit through your usual workflow. [Adopt a standards source](../guides/adopt.md)
covers every step in detail, including recovering a run that stopped.
