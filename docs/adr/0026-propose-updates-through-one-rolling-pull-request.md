# Propose updates through one rolling pull request for adopters who opt in

Supersedes [ADR 0014](0014-leave-available-updates-to-the-maintainer.md) for
adopters who opt in. Under ADR 0014 an update ran only when someone asked for
one. With releases as frequent as they are, adopters fell behind or spent time
on every routine update, and nothing brought an update to them for review the
way a dependency bot does. As settled in decisions 3, 7, 9 and 10 of the
[#281 grilling outcome](https://github.com/lutzseverino/repo-standards/issues/281#issuecomment-6319174701)
and specified in [#330](https://github.com/lutzseverino/repo-standards/issues/330),
Repository Standards publishes a composite GitHub action, `action.yml` at the
repository root, that keeps an adopting repository current through one rolling
pull request or one rolling issue.

An adopter opts in by installing a caller workflow that runs the action, such as
the one Repo Canon installs. Installing it is the maintainer's standing
instruction to propose every available update. Without it, ADR 0014 holds: the
update notice states availability and an update starts only on the maintainer's
instruction.

Each run checks the pins with the pinned `outdated --json` and, when either has
an update, runs the newest published CLI's `adopt --headless --json`, so both
pins move together, always to the newest CLI. A complete update is committed on
the one rolling branch, `repo-standards/update`, force-pushed, and proposed as
an adoption pull request whose body is the adoption record and whose title
follows the adoption rule. A pin moving by a major version, or by a minor
version of a `0.x` pin, makes the title breaking, with Impact and Migration
sections. A headless update that stops opens one rolling issue with its open
questions instead, unless an optional agent command finishes it. A newer
release refreshes the open item; the same release leaves it untouched; landing
or superseding the update closes it.

This amends the architecture and glossary:

- The architecture's explicit exclusions allow the action's commits on its own
  rolling branch and its rule for available updates; the CLI still makes no
  commit, push, branch, pull request or issue.
- Roles name the action as the product repository's, and the adopting
  project's caller workflow as its opt-in.
- An **Update** stays deliberate: the opt-in is the deliberate decision, and
  merging the pull request remains the maintainer's. The **Update notice**
  leaves every update to the maintainer except those the opt-in requests.

## Considered options

- **Keep ADR 0014 for everyone.** Routine updates keep costing every adopter a
  manual run.
- **Start every available update by default.** ADR 0014 rejected this, and it
  still holds without an opt-in: the maintainer would review work they had not
  asked for.
- **Let the CLI commit and open the pull request.** That would put forge code
  and commits into a CLI whose contract is that it never commits, for every
  caller, to serve one workflow.
- **A pull request per release.** Several open update proposals would compete
  and each go stale; one rolling item always carries the newest release.

## Consequences

All forge-specific code sits in one module of the action, which a forge seam
can later replace. `GITHUB_TOKEN` is only a fallback: pull requests it opens
trigger no workflow runs, and it cannot push changes to workflow files, so a
refused push opens the rolling issue naming the reason. Remote setup stays
deferred by the headless update, and the next local `adopt` applies it. Merging
stays the maintainer's: the action never merges.
