# Keep it up to date

An adopted repository pins two versions in `.repo-standards/selection.yaml`:
the standards source's, such as Repo Canon's, and the CLI's. The CLI releases
often, with no stability promise, but every CLI release updates from the
previous one with one `adopt` and no hand edits, as the
[release policy](../reference/available-updates.md#release-policy) states.
Nothing updates until you ask, or until you opt in to automated updates.

## Check what's available

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards outdated
```

`outdated` reports whether a newer standards or CLI version is published, and
anything a newer release asks of you outside the update. It changes nothing.
The installed `repository-standards` skill runs it whenever your agent starts
work in the repository and mentions what it finds. See
[See what is available](../guides/update.md#see-what-is-available).

## Run adopt again

In an adopted repository, run `adopt` without a source to update it:

```sh
npx @lutzseverino/repo-standards adopt
```

It proposes the newest version and carries forward the earlier answers whose
subject hasn't changed, so a routine update asks little or nothing. Your agent
can run it the same way as the first adoption, with `--yes` and `--json`.
Review and commit the update as you did the adoption.
[Update an adoption](../guides/update.md) covers choosing another version,
source or profile, and keeping the current CLI.

## Opt in to automated updates

The update action is a GitHub action that runs on a schedule in your
repository. It proposes every available update as one rolling pull request,
kept current as new versions come out, or opens one rolling issue when an
update needs your answers. It never merges; you review and merge its pull
request like any other. Installing its workflow is the opt-in, as
[Automated updates](../guides/automated-updates.md) describes.
