# Automated updates

The update action keeps an adopting repository current through one rolling
pull request, or one rolling issue when an update needs answers, much like a
dependency bot. It is a composite GitHub action published at the root of
[`lutzseverino/repo-standards`](https://github.com/lutzseverino/repo-standards).

Installing a workflow that runs it is opting in: it is the maintainer's standing
instruction to propose every available update
([ADR 0026](https://github.com/lutzseverino/repo-standards/blob/main/docs/adr/0026-propose-updates-through-one-rolling-pull-request.md)).
Without it, an [available update](../reference/available-updates.md) waits for the
maintainer to ask for it. The action never merges: the maintainer reviews and
merges its pull request like any other.

## Caller workflow

Run the action on a schedule and on demand, from a checkout of the default
branch. Pin it by the full commit SHA of a release, with the release tag in a
comment:

```yaml
name: Repo Standards update

on:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  issues: write

concurrency:
  group: repo-standards-update
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: lutzseverino/repo-standards@<full-commit-sha> # <release tag>
        with:
          token: ${{ secrets.REPO_STANDARDS_UPDATE_TOKEN }}
```

The workflow needs Git, `bash`, and network access to npm and GitHub. The
action sets up Node.js 24 with `actions/setup-node`, which later steps of the
job also use.

## Inputs

| Input           | Default        | Meaning                                                                                                                                   |
| --------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `token`         | `github.token` | The token for the CLI's GitHub requests, as `GH_TOKEN`, the push of the rolling branch, and the rolling pull request and issue.           |
| `agent-command` | none           | A shell command run in the checkout when the headless update stops, with the headless report's path in `REPO_STANDARDS_REPORT`. Optional. |

### Token

Use a GitHub App installation token, for example one created in the job by an
action such as `actions/create-github-app-token`. Pull requests it opens
trigger the repository's workflows, so their checks run, and the App can be
granted permission to change workflow files, which an update may install.

`GITHUB_TOKEN`, the default, is the fallback, with these GitHub limits:

- Pull requests it opens trigger no workflow runs, so required checks never
  report until someone pushes to the branch or closes and reopens the pull
  request.
- It cannot push changes to `.github/workflows/` files. When an update changes
  one, GitHub refuses the push and the action opens the rolling issue naming
  the reason instead.

Either token needs `contents: write`, `pull-requests: write` and
`issues: write`. The action masks the token, never writes it to the pull
request, issue or report, and passes it to the CLI only as `GH_TOKEN`, so the
CLI's GitHub requests use the authenticated quota.

### Agent command

Without `agent-command`, an update that stops opens the rolling issue. With it,
the action runs the command in the checkout through `bash`, with
`REPO_STANDARDS_REPORT` naming the
[headless update's](../reference/adoption-run.md#update-headlessly) `adopt --json` report, from
which the agent answers the open questions through `adopt --answers`. When the
command exits 0 and `status --json` then reports the update ready to commit, the
action continues as for a complete update; otherwise it opens the rolling
issue. The command does not receive the action's token; give it the
credentials it needs, such as its own `GH_TOKEN`, in the step's `env`.

## What each run does

1. It restores the pinned runtime with
   `npm ci --ignore-scripts --prefix .repo-standards/runtime` and runs the
   pinned `outdated --json`. When a pin reports `unknown`, the run fails with
   its reason and opens or changes nothing. When both pins report `none`, it
   closes any rolling pull request or issue whose update has landed and stops.
2. Otherwise it runs the newest published CLI's headless update,
   `npx --yes @lutzseverino/repo-standards@<newest> adopt --headless --json`,
   so both pins move together, always to the newest CLI and the newest
   standards release.
3. A complete update is recorded with `status --summary`, which reports it ready
   to commit, committed on the rolling branch `repo-standards/update` and
   force-pushed, and proposed as the rolling pull request against the default
   branch.
4. An update that stops, finished by no agent command, or whose push is
   refused, opens or refreshes the rolling issue.

At most one rolling pull request or issue is open at a time:

- A newer release refreshes it: a force-push of the rolling branch, and an
  edited title and body.
- The same release leaves it untouched, with no new commit, edit or comment. To
  have the action try a release again, close its issue and run the workflow.
- When the default branch's selection reaches its versions, the update has
  landed and the action closes it with a comment.
- When a pull request replaces an issue, or an issue a pull request, the action
  closes the one that no longer applies with a comment linking its successor.

The headless update defers every remote setup and never writes to the hosting
platform. After merging, run the pinned `adopt` in a clean checkout, which
applies the deferred remote setup once its probe is ready.

## The pull request

The pull request follows the
[adoption pull request rules](https://github.com/lutzseverino/repo-standards/blob/main/CONTRIBUTING.md#adoption-pull-requests):

- Its body is the adoption record that `status --summary` printed, byte for
  byte. Its Operations table lists each deferred remote setup with its reason.
- Its title is `chore: adopt <source> <version> with CLI <version>`, naming the
  source by the repository name in its URL and the versions from the record's
  selection, such as `chore: adopt repo-canon v0.17.0 with CLI 10.0.0`.
- When either pin moves by a major version, or by a minor version of a `0.x`
  pin, which SemVer allows to break, the title is `chore!:` and the record is
  followed by Impact and Migration sections. They name each pin's move, the
  update class from the inspection, the deferred remote setup, and the release
  notes to read before merging.

## The issue

The rolling issue's body has `Problem`, `Desired outcome` and
`Additional context` sections, the shape of a feature request. It carries:

- why the update ended there: the headless outcome, the agent command's result
  and the readiness reasons, or the refused push's message;
- the target CLI and standards versions and each pin's move;
- the adopter's action: the update class and the deferred remote setup;
- the open questions: the missing answers, marking each prefilled proposal
  awaiting review, the blockers, the contextual declarations awaiting
  assessment, and failed checks;
- how to finish the update in a clean checkout with the newest CLI's `adopt`;
- a hidden marker, by which later runs find the issue and its target.

## Limits

- GitHub is the only supported forge. All of the action's GitHub-specific code
  sits in one module.
- The action never merges, enables auto-merge, applies remote setup, or
  provisions agent credentials, and it schedules nothing itself.
- The CLI still makes no commit, push, branch, pull request or issue; only the
  action commits, and only on its rolling branch.
