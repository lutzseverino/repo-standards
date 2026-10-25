# Adopt a standards source

A standards source is a published, versioned setup: the agent instructions,
docs, templates and checks its author wrote down once. Adopting one applies that
setup to your repository with one command. Ask your coding agent to run it, or
run it yourself in a terminal: both paths select a version, a profile and its
hosting platform, review the proposed changes, and complete the same adoption
run. [Repo Canon](https://github.com/lutzseverino/repo-canon) is a ready-made
setup to start from.

## What adoption changes

An adoption run:

- installs the source's exact files and whole skills. Each one replaces the
  tracked content at its path; an overwrite that discards edits needs
  confirmation first, as [Review the changes](#review-the-changes) describes.
  Untracked content at such a path, which Git cannot recover, blocks the run
  instead of being replaced;
- installs each declaration's [rules](../reference/rules.md), the requirements
  the files they cover keep satisfying for as long as the project stays
  adopted;
- adapts only project-owned content, such as your documentation, following
  the source's adoption guidance; the project keeps owning that content;
- runs the source's trusted fixes and checks.

`adopt` leaves every change uncommitted for you to review and commit through
your project's usual workflow. It installs the exact CLI that ran it into
`.repo-standards/runtime/` and pins it. No product checkout, TypeScript
compiler, pnpm, or manual external CLI installation is needed.

## Before you start

Use macOS or Linux with Node.js 24 or 26, npm, and Git 2.32 or newer. Run from a Git
working tree with an existing commit and no uncommitted changes.

Only stable 24.x and 26.x are supported, with their bundled npm. Node.js 22
is outside the support policy; odd majors, prereleases and future majors are
also excluded.

Optionally, set a GitHub token before you start. Without one, the CLI uses
GitHub's anonymous API quota, which every user and tool on your IP address
shares, so repeated adoption rounds and other users can exhaust it; a token
raises the allowance. The CLI reads `GH_TOKEN`, or `GITHUB_TOKEN` when
`GH_TOKEN` is unset or empty, and sends it only on its GitHub REST requests.
Signing in to `gh` alone does not authenticate them. Adoption of a public
source needs no credentials; see
[GitHub requests and tokens](../reference/github-requests.md).

```sh
export GH_TOKEN=<token>
```

## Adopt with one command

Run `adopt`, substituting your standards source's public GitHub URL:

```sh
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

- **With an agent:** `adopt --json`, even in a terminal, starts the run when
  nothing is open and nothing blocks it; otherwise it prints an
  [answers-file template](../reference/adoption-run.md#answers-file) and next
  steps. The agent decides what Git can undo, fills the file, makes the
  requested edits, and submits assessments. See [With an agent](#with-an-agent).
- **In a terminal:** `adopt` asks questions, shows the proposed changes, and
  walks you through contextual work, running checks after your edits and
  writing the assessment from your answers. See [In a terminal](#in-a-terminal).

The CLI owns the adopting agent's instructions; the README prompt and the
optional [`adopt-repository-standards` skill](install.md#install-the-adoption-skill)
only point to it. Before a new run, Git blockers make its next steps stop the
agent and notify the maintainer to resolve the pending work. Active runs
continue with their expected uncommitted changes. On completion, its agent
guidance hands those changes to the maintainer for review without committing
them. Terminal completion addresses a person who can review and commit through
the project's normal workflow.

The [adoption run reference](../reference/adoption-run.md#the-adopt-command)
gives the full command line and exactly when `adopt` starts a run.

### With an agent

The agent entry command uses `--yes` to avoid npm's installation prompt and
`--json` to select the answers-file route even in a terminal:

```sh
npx --yes @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS --json
```

The printed template stays outside the project. The agent chooses the proposed
newest stable version unless your request names another, and a profile from
its descriptions, your request, and repository evidence. Only an unsettled
profile choice comes back to you. It reviews each scope draft against discovery
guidance and the real project, deciding unresolved membership from evidence
with reasons. Project files stay unedited until the run starts, including
optional files implied by a scope answer.

When the inspection requires no confirmation, the agent needs no answer to
start: `adopt` starts the run over the inspection it computes, and the agent
reviews that inspection's summary and the uncommitted result afterwards, which
Git can undo. When it requires confirmation, the agent reviews each discarded
edit's diff, or current content where no diff is available, and answers
`confirmation` and `inspection` with the current identity itself: the clean,
committed starting tree makes those edits recoverable from Git. It defers remote setup that is not
ready, changing nothing remotely; every later run applies it once ready. In an
update, it keeps each [reused answer](../reference/adoption-run.md#reused-answers) unless the project calls
for another, and validates each recorded answer proposed for review. Its
handoff records these decisions, the reused answers, the inspection's trusted
script operations, each discarded edit with its diff or current content, and
each deferral reason.

Continue with the exact command in the next steps, for example:

```sh
npx --yes @lutzseverino/repo-standards@10.0.0 adopt --answers /tmp/adoption-answers.json
```

Use the CLI version printed by your own run. Once the pinned runtime is
installed, the next steps use it instead:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards adopt --answers /tmp/adoption-answers.json
```

For contextual work, follow the returned rules and adoption guidance, edit only
the allowed targets, and add each declaration's assessment to the answers
file before continuing. An assessment stays `blocked` when the project does
not support the facts it needs. When the work needs a file the confirmed scope
misses, the agent changes the scope answer without asking, since Git can undo
it, and `adopt` [adopts again in place](../reference/adoption-run.md#adopt-again-in-place). Interrupted or
incomplete runs retry their repeat-safe operations with `resume --retry` without
another approval; abandonment remains your decision. A fix's
confirmation-required overwrite of a remote setting still needs your decision,
with each setting's current and standard values presented first, because Git
cannot restore remote state. When you decline it, the agent answers `defer`,
and the run completes without that fix.

On completion, the agent reviews every output and leaves it uncommitted and
unstaged for your normal workflow. The `status` ready-to-commit verdict describes
the uncommitted changes: record it before committing. If any recorded change-set
path is absent from Git's uncommitted changes, `status` reports not ready. An
empty change set satisfies the path condition, so a complete adoption without
state errors can remain ready after committing.

### In a terminal

In a terminal, `adopt` asks the answers file's questions one at a time, each
with its context and its proposed answer as the default: the version, newest
stable release first; the profile, listing each description, by name or by its
number in the list; each discovery
declaration's scope; remote setup deferral when a probe is not ready; and the
confirmation of confirmation-required changes, showing each discarded edit's
diff. A discovery script's open questions are asked as prompts, and the person
accepts the drafted files or lists the files the declaration covers, one per
line, with the reason. For an optional declaration, it first asks whether the
declaration has [no scope](../reference/inspection.md#no-scope), proposing yes when the
draft has none, and asks why unless the draft already says so. A scope that inspection rejects is asked again. `adopt` then shows the inspection and asks to start the run, which
answers `inspection`: a terminal asks a person before every start, whether or
not the inspection requires confirmation. Declining a confirmation or the start
changes nothing.
In an update, each [reused answer](../reference/adoption-run.md#reused-answers) is shown with why it was
reused and is not asked, and a recorded answer proposed for review is offered
as the default, with what changed.

Once the run waits for contextual work, `adopt` first asks, for each
discovered declaration, whether its confirmed scope covers every file it should
as the run's fixes left the project, before any edit. It keeps these answers
for the rest of the session. Then it walks each contextual declaration in turn:

1. It shows the declaration's allowed targets, installed rules, adoption
   guidance and, for a discovered declaration, discovery guidance.
2. It waits while the person edits, until they press Enter or type `blocked`.
3. It runs the declaration's checks against the working tree and shows each
   result. While a check fails, it shows the failure and the declaration's
   rules again, and waits for another edit.
4. Once the checks pass, it asks whether the declaration is done, or blocked
   with a reason.

A declaration with no scope is not walked: its scope reviews ask whether no
project file belongs in its scope, and it is assessed satisfied when they say
none does. Nor is a declaration whose recorded assessment is
[reused](../reference/adoption-run.md#reused-answers), unless one of its checks fails.

Once every declaration is walked, it asks again, for each discovered
declaration, whether the confirmed scope covers every file it should now.
At either review, a scope can be blocked because it misses files, membership
is unresolved, or a confirmed target must be withdrawn. The person lists any
missing files, one per line, ending with an empty line; the list may be empty.
Then `adopt` asks for a reason, asking again if it is empty. The review records
the reason and any missing files, with the confirmed scope as evidence.
A blocked scope ends the questions at once, and the declarations it stops
are assessed blocked, naming it: the run stops `SCOPE_INCOMPLETE`, where the
person can change the scope, abandon the run, or stop. Changing it asks the
scope question again from the confirmed scope, and `adopt` then
[adopts again in place](../reference/adoption-run.md#adopt-again-in-place) with the new scope.

These checks run read-only inside the waiting run, as `check` runs them, from
its installation once verified, and record nothing: the run's own check round after the assessment decides.
`adopt` writes the assessment from the answers, citing each check result and
the maintainer's confirmation, and submits it. When the run's checks then fail,
it walks the failing declarations again. A failed check of a declaration
without contextual work, which no contextual edit fixes, waits for the person
to resolve it and then runs every check again with the same assessment. A blocked declaration leaves the run
incomplete, its reason naming the declaration; running `adopt` again walks the
contextual work again.

An interruption at a prompt, `Ctrl-C` or the end of input, fails with
`INTERRUPTED` and exit status 130. Answers given before the start are held only in memory, so nothing was
changed; once a run has started, running `adopt` again continues it where it
stopped. A run interrupted during its operations is incomplete: `adopt` shows
its reason and asks whether to retry the interrupted work, as `resume --retry`
does, abandon the run, or stop. A run stopped for its scope also offers to
change the scope, which replaces the run in place. A fix that stops the run for
confirmation asks whether to overwrite the setting, defer the fix, or stop.
Choosing to resolve remote setup that is not ready stops at once, writing
nothing.

### Defer remote setup

Before writing anything, `adopt` probes setup that changes the hosting
platform's settings. If a tool, remote, sign-in, or role is missing, choose
`defer` at the terminal prompt or answer the answers file's `remote-setup`
question with `defer`. Adoption can then complete locally; `status` and the
adoption record list what was deferred. Choosing `resolve` stops without
writing, so you can fix readiness first.

A later `adopt` run probes remote setup again and applies it once ready. While
the same probe still reports it not ready, the update
[reuses](../reference/adoption-run.md#reused-answers) the recorded deferral without asking. A
[headless update](../reference/adoption-run.md#update-headlessly) defers every remote setup, even one that
is ready, and the next local `adopt` applies it. See the
[remote setup reference](../reference/adoption-run.md#remote-setup) for readiness, records, and recovery.

## Review the changes

Asking to adopt a standards source is the consent to apply it, so most runs
start without a confirmation step. Review the run's inspection and its
uncommitted result:

- **Discarded edits.** When an exact file or skill replaces tracked content
  other than what an earlier adoption installed there, the inspection lists
  each such overwrite, with its diff, as a
  [confirmation-required change](../reference/adoption-run.md#confirmation-required-changes).
  At a first adoption there is no earlier installation, so every replacement
  of existing content is listed. The run starts only once the overwrites are
  confirmed: by you at a terminal, or by the agent after it reviews each diff,
  because Git can restore those edits from the clean starting commit. Removing
  unedited installed content, breaking source changes and scope proposals need
  no confirmation.
- **Remote setting overwrites.** A fix that would change a setting on the
  hosting platform that already holds a different value stops the run for your
  decision, with the setting's current and standard values, because Git cannot
  restore remote state. Confirm the overwrite, or decline it to
  [defer that fix](../reference/adoption-run.md#defer-a-declined-overwrite).
- **Discovered scope.** For a declaration whose files depend on the project,
  such as its documentation, adoption proposes the files it covers, drafted by
  the source's discovery script where it has one. Review that scope with the
  inspection; it needs no confirmation of its own. Once a run starts, the
  reviewed scope is its confirmed scope, which stays fixed for that run. The agent decides
  unresolved membership from repository evidence and records its reasons; at a
  terminal you accept the drafted files or list them yourself. If the
  contextual work needs other files, change the scope as
  [Recover a stopped run](#recover-a-stopped-run) describes.
- **The result.** Review the uncommitted diff and the new untracked files,
  which `git diff` omits, for example with
  `git ls-files --others --exclude-standard -z`. The agent's handoff, and the
  adoption record that `status --summary` prints, list the decisions, the
  reused answers, the trusted operations, the discarded edits and each
  deferral.

## Commit the adoption

Check the pinned CLI's verdict before committing:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards status --summary
```

Its **Ready to commit** verdict describes the uncommitted changes: record it
before committing. If any recorded change-set path is absent from Git's
uncommitted changes, `status` reports not ready. An empty change set satisfies
the path condition, so a complete adoption without state errors can remain ready
after committing. The same output is the adoption record, which can serve as the
pull request body.
After reviewing all adoption output, commit through your project's usual
workflow, including retained inputs, runtime manifest/lock, state, exact content,
skills and contextual changes. Dependencies and local execution records remain
ignored. In a fresh checkout:

```sh
npm ci --ignore-scripts --prefix .repo-standards/runtime
.repo-standards/runtime/node_modules/.bin/repo-standards status --json
.repo-standards/runtime/node_modules/.bin/repo-standards inspect --json
```

The lock restores the exact CLI and dependencies. Retained standards remain
inspectable if their source disappears. Restoring the runtime still requires
its npm package and dependencies to be available or cached; new standards
versions still require the source. These are independent availability limits.
Status reports historical adoption evidence, not ongoing compliance.

Once adopted, the model-invocable `repository-standards` skill looks up the
[installed rules](../reference/rules.md) before an agent changes a project file
and reports [available updates](../reference/available-updates.md).
[Run the adopted checks](run-checks.md) to check later work against the
adopted standards, and [update](update.md) when a newer setup is published.

## Recover a stopped run

A run that stops keeps its changes in the working tree. Run `adopt` again in
the same checkout, with the pinned runtime once the run has installed it:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards adopt
```

It continues the run where it stopped and prints what it needs next.

- **Interrupted or incomplete operations.** At a terminal, `adopt` offers to
  retry the interrupted work, abandon the run, or stop. Without a terminal,
  its next steps name `resume --retry`, which an agent runs without asking
  because the run's operations are repeat-safe.
- **A scope that misses files.** When the contextual work needs a file outside
  the scope, or a scope review blocks it, change the scope answer and run
  `adopt --answers <file>` again; at a terminal, choose to change the scope.
  `adopt` then replaces the run in place, keeping its changes. See
  [Adopt again in place](../reference/adoption-run.md#adopt-again-in-place).
- **Abandoning.** `abandon` ends the run and keeps its changes; it needs the
  maintainer's decision. Running `adopt` in that checkout then adopts again in
  place over them, or you commit or discard them through your normal workflow.

[Recover or abandon an interrupted run](../reference/adoption-run.md#recover-or-abandon-an-interrupted-run)
holds the full recovery contract.

## Adopting in the product checkout

When the project's root `package.json` names `@lutzseverino/repo-standards`
at the requested CLI version, npm can satisfy pinned `npx` from that local
package. In an unbuilt product checkout its `dist/cli.js` is absent, so the
command can exit 127 with `repo-standards: not found`. Building alone is not a
reliable remedy. Adding `--project` does not fix this: npm resolves its package
from the working directory before the CLI reads that option.

Use the supported [external exact-CLI installation](../reference/inspection.md#keep-the-disclosed-cli-for-start-and-recovery)
instead. Start with a clean, committed checkout. Replace the project path and
`10.0.0` with the intended checkout and exact published candidate version:

```sh
adoption_project="/absolute/path/to/repo-standards"
adoption_cli=$(mktemp -d /tmp/repo-standards-cli.XXXXXX)
(cd "$adoption_cli" && npm install --prefix "$adoption_cli" \
  --ignore-scripts --save-exact --no-audit --no-fund \
  @lutzseverino/repo-standards@10.0.0)
"$adoption_cli/node_modules/.bin/repo-standards" --version
"$adoption_cli/node_modules/.bin/repo-standards" adopt \
  --project "$adoption_project" --json
```

This updates an existing selection; for an initial adoption, supply the source
URL too. The package is acquired outside the checkout with install scripts
disabled, without a build or a self-dependency. Keep the installation and answers
outside the project: a round that prints the template changes no tracked
content, HEAD or index, and a round that finds nothing open starts the run.
Save and fill the printed template at, for example,
`$adoption_cli/answers.json`, then continue in the same shell:

```sh
"$adoption_cli/node_modules/.bin/repo-standards" adopt \
  --answers "$adoption_cli/answers.json" --project "$adoption_project" --json
```

Reuse that exact candidate for every answer round and interrupted-installation
recovery; keep the external installation until the run completes. Generated
next steps use `adoption_cli` and explicitly name the target project for this
collision. Set the variable again if you change shells. Once an active run has
a matching usable project runtime, its next steps switch to that runtime.
If it is unavailable, use the external executable with `resume --retry` or
`abandon`, and the same `--project`, on the maintainer's instruction as
[recovery](../reference/adoption-run.md#recover-or-abandon-an-interrupted-run) describes. Do not change the
candidate version midway through a run.
