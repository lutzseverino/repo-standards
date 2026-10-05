---
name: deliver
description: Take completed work, including an adoption run's uncommitted changes, through the contribution workflow to an opened pull request with its checks reported.
disable-model-invocation: true
---

Deliver completed work as one focused pull request, following this repository's
contribution workflow. The workflow's rules live in `CONTRIBUTING.md`; this
skill sequences them and never overrides them. Delivery ends at an opened pull
request with its checks reported. Merging belongs to review.

## 1. Read the rules

Read these before acting, and keep them as the authority for every later step:

- `CONTRIBUTING.md`: issues, validation, titles and commits, and pull requests.
- `.github/PULL_REQUEST_TEMPLATE.md`: the description's sections and their order.
- `docs/development/README.md`: its Setup and validation section names the
  required checks.
- `docs/agents/issue-tracker.md`: how to read issues and pull requests.
- `docs/agents/project.md`, when present: project constraints, such as branch
  naming or a base branch, that supplement the shared rules.

Resolve the **delivery base**: the base branch `docs/agents/project.md` names,
else the default branch. Every later step branches from, compares with, and
opens the pull request against `origin/<base>`.

Done when you can name the required checks, the template's sections, any
project constraint on branches, and the delivery base.

## 2. Establish the work and its link

The work is what the maintainer names, or else everything that differs from
`origin/<base>`: commits on the current branch and uncommitted changes.
Ask when the tree mixes unrelated changes and the maintainer has not said which
belong.

The work is an **adoption run** when its uncommitted changes include
`.repo-standards/`. Read `status --json` with the project's pinned
`.repo-standards/runtime/node_modules/.bin/repo-standards`. Deliver it only when
`active` is `null`, `lastComplete` is present, there is no `stateError`, and
every `changeSet` path is among the uncommitted changes; otherwise stop, and
tell the maintainer to finish or recover the run with `adopt-standards`. The
run's work is its `changeSet` paths and `.repo-standards/`, and its record is
the output of `status --summary`. The record describes only the run, so its
pull request holds only the run. Establish, from the maintainer or from the
session that ran the adoption, whether the run's paths changed after it
completed. If they did, the record no longer describes the work: return it to
`adopt-standards`, or, when the maintainer wants the edits delivered with the
run, describe the run and its edits with the template.

Find the link the pull request rules require: the related issue, from the
maintainer, the branch, or the commits, read with its comments; or, for an
eligible small correction, its reason. An adoption run needs neither when its
record is the description. When work needs an issue and has none, stop and ask.

Done when the work's paths and its issue, small-correction reason, or adoption
record are known.

## 3. Branch

Put the work on a branch that holds only this work, created from the up-to-date
`origin/<base>` when the current branch is the base branch or carries other
work. Carry the work's uncommitted changes onto it unchanged, and leave
any unrelated uncommitted changes uncommitted.

Done when `git log origin/<base>..HEAD` shows only this work's commits.

## 4. Commit and title

Write the pull request's title, which the squash merge makes the final commit
subject, as the rules for titles and commits require. An adoption run's title
names, from the record's Selection table, the source by the repository name in
its URL, the selected version, and the CLI version, such as
`chore: adopt repo-canon v0.4.1 with CLI 4.0.0`. It is not breaking by default,
because an adoption changes the adopted conventions rather than the project's
interface; mark it breaking only when the maintainer judges the run breaking for
the project, and step 6 then explains its impact and migration. Commit only the
work's uncommitted changes, with the title as the commit subject, staging only
the work's paths. Commits already on the branch stay as they are.

Done when `git status` shows no part of the work left uncommitted.

## 5. Validate

Check that the changed behavior has the tests the validation rules ask for; when
it lacks them, stop and report. Run every required check from the development
guide on the committed work, plus the focused tests for the changed behavior.
When unrelated uncommitted changes remain, leave them in place and run the
checks in a clean checkout of the final commit: a temporary `git worktree add`,
removed afterwards. A check that reads a diff, such as `git diff --check`, sees
only unstaged changes in its bare form: run it over the pull request's whole
change instead, against `origin/<base>...HEAD`. Record each command and its
outcome as you run it. Fix a failure that the work caused, within the work's
scope, commit the fix, and run the checks again; stop and report any other
failure.

Done when every required check has run on the final commit and each outcome is
recorded.

## 6. Describe

Write the description from the template, as the pull request rules require.
For a non-breaking adoption run whose paths are unchanged since completion, use
the record as the description instead, as those rules allow. A breaking
adoption run uses the template, so that it can explain the impact and
migration.

Done, for a template description, when every template section is present in
its order, and the Validation section lists only checks that actually ran and
explains any required check that did not. Done, for an adoption record, when
the description is the `status --summary` output byte for byte, its first line
the `# Repository Standards adoption record` heading.

## 7. Open and report

Push the branch and open the pull request against the delivery base with the
title and description. When the record is the description, post the step 5
outcomes as one pull request comment, because the record leaves them out.

Wait for the pull request's checks to finish, for example with
`gh pr checks <number> --watch`. When no check has registered yet, wait briefly
and look again. Report to the maintainer:

- the pull request URL and title;
- each local check and its outcome;
- each pull request check and its outcome, naming any failure with its details,
  or that the repository reported none.

Done when every pull request check has a final outcome, or none registered, and
the report states each one as observed.
