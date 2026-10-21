# Adoption

Use `adopt` for your first adoption and every update. Ask your agent to run it,
or run it yourself in a terminal: both paths select a version and profile,
review the proposed changes, and complete the same adoption run.

## Adopt with one command

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
[GitHub requests and tokens](installation.md#github-requests-and-tokens).

```sh
export GH_TOKEN=<token>
```

Then run `adopt`, substituting your standards source's public GitHub URL:

```sh
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

- **In a terminal:** `adopt` asks questions, shows the proposed changes, and
  [walks you through contextual work](#in-a-terminal), running checks after
  your edits and writing the assessment from your answers.
- **With an agent:** `adopt --json` prints an [answers-file template](#answers-file)
  and next steps, even in a terminal. The agent decides what Git can undo,
  fills the file, makes the requested edits, and submits assessments.

The CLI owns the adopting agent's instructions; the README prompt and optional
`adopt-repository-standards` skill only point to it. Before a new run, Git
blockers make its next steps stop the agent and notify the maintainer to resolve
the pending work. Active runs continue with their expected uncommitted changes.
On completion, its agent guidance hands those changes to the maintainer for
review without committing them. Terminal completion addresses a person who can
review and commit through the project's normal workflow.

Adoption installs exact files, whole author skills, and each declaration's
[rules](rules.md), adapts project-owned content, and runs the publisher's
trusted fixes and checks. Review the resulting changes and commit them through
your project's usual workflow; `adopt` leaves them uncommitted.

The full form is `adopt [<GitHub URL>] [--standards-version <tag>]
[--profile <name>] [--answers <file>] [--project <directory>] [--json]`. In an
adopted project, `adopt` without a source updates the current selection. When
the source cannot be reached, it proposes the current version and profile and
applies them again from the retained standards, as `inspect` and `start` do
without source flags; its report says so next to the selection. When GitHub
refuses to list the source's releases because the API quota is exhausted or it
rejected the token in `GH_TOKEN` or `GITHUB_TOKEN`, `adopt` fails with
`QUOTA_EXHAUSTED` or `SOURCE_UNAVAILABLE` and writes nothing instead. To apply
the current version again on purpose, pass it with
`--standards-version <current version>`, which still applies it from the
retained standards when the source cannot be read.

Run with a terminal as its input and output, and without `--answers` or
`--json`, `adopt` asks a person its questions; see [In a terminal](#in-a-terminal).
Otherwise, without an answers file, `adopt` prints its questions as an answers-file
template, with the inspection of the selection it proposes and the next steps,
and changes nothing. It runs what inspection runs: remote setup readiness
probes and, when discovery is required, declared discovery scripts. The agent
saves the template outside the project, records its decisions, and runs
`adopt --answers <file>`. Project files stay unedited until the run starts;
files implied by answers are written during contextual work. With a
filled answers file, `adopt` names each missing answer, asks the questions that
follow from the answers, and starts the run once none remain and nothing blocks
it. A question that depends on an answer appears once that answer is given: the
profile's questions follow the profile, and remote setup readiness follows a
complete scope, since inspection probes only an unblocked selection. A run
starts only an inspection the answers file names, so the agent reviews the
current inspection before starting and summarizes it in the handoff.

`adopt` installs the exact CLI that ran it into the project's
[runtime](#durable-and-local-state) and records it as the CLI pin. Ordinary
projects need no external installation. Before a run, its next steps name the
same exact CLI through `npx`, except for the
[product checkout collision](#adopting-in-the-product-checkout); once a run has installed the pinned runtime,
`.repo-standards/runtime/node_modules/.bin/repo-standards`, they continue and
recover the run with it. With an active run,
`adopt --answers <file>` continues it, advancing it by at most one step: a
confirmed fix, or submitted assessments. A source, version, or profile that
differs from the active run's selection fails with `ACTIVE_RUN`.

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
declaration has [no scope](inspection.md#no-scope), proposing yes when the
draft has none, and asks why unless the draft already says so. A scope that inspection rejects is asked again. `adopt` then shows the inspection and asks to start the run, which
answers `inspection`. Declining a confirmation or the start changes nothing.
In an update, each [reused answer](#reused-answers) is shown with why it was
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
[reused](#reused-answers), unless one of its checks fails.

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
[adopts again in place](#adopt-again-in-place) with the new scope.

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

The agent reviews the inspection and answers with its current identity to
start. It reviews each discarded edit's diff, or current content where no diff
is available, and confirms the identity itself: the clean, committed starting
tree makes those edits recoverable from Git. It defers remote setup that is not
ready, changing nothing remotely; every later run applies it once ready. In an
update, it keeps each [reused answer](#reused-answers) unless the project calls
for another, and validates each recorded answer proposed for review. Its
handoff records these decisions, the reused answers, the inspection's trusted
script operations, each discarded edit with its diff or current content, and
each deferral reason.

Continue with the exact command in the next steps, for example:

```sh
npx --yes @lutzseverino/repo-standards@9.0.0 adopt --answers /tmp/adoption-answers.json
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
it, and `adopt` [adopts again in place](#adopt-again-in-place). Interrupted or
incomplete runs retry their repeat-safe operations with `resume --retry` without
another approval; abandonment remains your decision. A fix's
confirmation-required overwrite of a remote setting still needs your decision,
with each setting's current and standard values presented first, because Git
cannot restore remote state. When you decline it, the agent answers `defer`,
and the run completes without that fix.

On completion, the agent reviews every output and leaves it uncommitted and
unstaged for your normal workflow. The `status` ready-to-commit verdict describes
the uncommitted changes: record it before committing, because afterwards
`status` reports those changes not ready.

### Defer remote setup

Before writing anything, `adopt` probes setup that changes the hosting
platform's settings. If a tool, remote, sign-in, or role is missing, choose
`defer` at the terminal prompt or answer the answers file's `remote-setup`
question with `defer`. Adoption can then complete locally; `status` and the
adoption record list what was deferred. Choosing `resolve` stops without
writing, so you can fix readiness first.

A later `adopt` run probes remote setup again and applies it once ready. While
the same probe still reports it not ready, the update
[reuses](#reused-answers) the recorded deferral without asking. See the
[remote setup reference](#remote-setup) for readiness, records, and recovery.

### Updates with adopt

In an adopted project, omit the source to update the current selection:

```sh
npx @lutzseverino/repo-standards adopt
```

This offers the newest stable standards release and the profiles, with the
same terminal prompts or answers-file path. Pass a new source URL to change
sources, or use `--standards-version` and `--profile` to choose them explicitly.
Running through `npx` installs and pins the CLI it ran. To keep the current
CLI pin while updating standards, use the project runtime instead:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards adopt
```

Each update reviews changes, obtains confirmation when required, and completes
one run. See [Update the selection](#update-the-selection) for the detailed
update contract and lower-level commands.

#### Reused answers

An update carries the last complete adoption's recorded answers forward
([ADR 0024](https://github.com/lutzseverino/repo-standards/blob/main/docs/adr/0024-reuse-recorded-answers-that-are-provably-unchanged.md)).
Inspection, discovery scripts and readiness probes still run fresh, and each
recorded answer is reused without asking only when what it was about is
provably unchanged:

- A `scope:<declaration>` answer, when the declaration's discovery guidance and
  rules are hash-identical to the recorded ones, its discovery script's fresh
  draft equals the draft the recorded entry was decided from, and every
  candidate and evidence path the entry names still exists. A declaration
  without a discovery script has no draft. Scope evidence the previous release
  recorded keeps no drafts, so a fresh draft then matches only the recorded
  entry itself. The inspection binds a reused entry as it binds any scope
  answer.
- The `remote-setup` answer `defer`, when every remote setup that is not ready
  was deferred as remote setup and its probe, with an unchanged script,
  arguments, resources and prerequisite, still reports it not ready. The run
  records the deferral with the fresh reason.
- An `assessment:<declaration>` answer, when the declaration's rules, or its
  adoption guidance when it has no rules, and the files in its scope are
  unchanged since the last complete adoption, judged after the run's fixes, so
  a fix that changes a scoped file makes it ineligible. Durable state the
  previous release recorded proves this only by the whole project's work
  snapshot. When every assessment is reused, the run goes straight to its
  checks.

The report lists each reused answer in `reused`, with what made it eligible,
and its question's `details.reused` holds the same evidence. Every other
recorded answer comes back prefilled for review: its question's context names
what changed and its `details.changed` lists it; a scope question's
`details.draft` holds the fresh draft. It stays missing until the answers file
carries it back, which needs no other confirmation. A `confirmation`, a `fix:`
overwrite answer, and a fix deferred because the maintainer declined its
overwrite are never reused, and `version` and `profile` keep their proposals.
An answer of your own replaces a reused one and is not listed as reused; an
answer equal to the reused one keeps it reused. The run record, durable state,
`status`, and the adoption record list every reused answer.

### Adopting in the product checkout

When the project's root `package.json` names `@lutzseverino/repo-standards`
at the requested CLI version, npm can satisfy pinned `npx` from that local
package. In an unbuilt product checkout its `dist/cli.js` is absent, so the
command can exit 127 with `repo-standards: not found`. Building alone is not a
reliable remedy. Adding `--project` does not fix this: npm resolves its package
from the working directory before the CLI reads that option.

Use the supported [external exact-CLI installation](inspection.md#keep-the-disclosed-cli-for-start-and-recovery)
instead. Start with a clean, committed checkout. Replace the project path and
`9.0.0` with the intended checkout and exact published candidate version:

```sh
adoption_project="/absolute/path/to/repo-standards"
adoption_cli=$(mktemp -d /tmp/repo-standards-cli.XXXXXX)
(cd "$adoption_cli" && npm install --prefix "$adoption_cli" \
  --ignore-scripts --save-exact --no-audit --no-fund \
  @lutzseverino/repo-standards@9.0.0)
"$adoption_cli/node_modules/.bin/repo-standards" --version
"$adoption_cli/node_modules/.bin/repo-standards" adopt \
  --project "$adoption_project" --json
```

This updates an existing selection; for an initial adoption, supply the source
URL too. The package is acquired outside the checkout with install scripts
disabled, without a build or a self-dependency. Keep the installation and answers
outside the project: template generation changes no tracked content, HEAD or
index. Save and fill the printed template at, for example,
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
[recovery](#recover-or-abandon-an-interrupted-run) describes. Do not change the
candidate version midway through a run.

## Protocol reference

`adopt` drives [inspection](inspection.md), [inspect and start](#inspect-and-start),
and [resume](#recover-or-abandon-an-interrupted-run). These remain available
for callers that need the lower-level adoption run interface described below.
The [script protocol](script-protocol.md) defines author operations; the
[assessment protocol](assessment-protocol.md) defines contextual work evidence.
Neither protocol needs to be read to start with `adopt`.

### Answers file

The answers file, `repo-standards/answers/v1`, is the JSON object `adopt`
prints: `format`, the `source` URL, and `questions`. Each question has an `id`,
the `question` to ask, its `context`, optional `choices` and `details`, and an
`answer`, which is `null` until answered. `adopt` reads only each question's
`id` and `answer`, and ignores the answer to a question it does not ask at
that stage, such as one for a declaration of another profile. It rejects other
fields, an ID of no question kind below, a repeated ID, and an answer of the
wrong kind with `ANSWERS_FORMAT`, and an answers file inside the project with
`ANSWERS_LOCATION`. A file of at most 2 MiB is read.

| `id`                       | Asked when                                                                       | `answer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                  | Always; the template proposes the newest stable release.                         | A stable tag from `choices`, the source's stable releases newest first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `profile`                  | Always; proposed for an update or a single profile.                              | A profile `name` from `choices`, each with its `description`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `scope:<declaration>`      | For each active discovery declaration, and while a run is stopped for its scope. | Its [scope entry](inspection.md#discover-contextual-file-scope) without `id`: `coverage`, `candidates`, and `unresolved`, and `noScope` for [no scope](inspection.md#no-scope), which an optional declaration's question offers with `details.optional`. A discovery script's draft is proposed; it stays missing while it has open questions or until an answers file carries it back. In an update, a [reused](#reused-answers) recorded entry is answered, and one proposed for review stays missing until carried back. A stopped run proposes its confirmed entry, and a changed one [replaces the run in place](#adopt-again-in-place). |
| `remote-setup`             | When a remote setup probe is not ready.                                          | `defer` to complete adoption without it, or `resolve` to stop, writing nothing. In an update, a [reused](#reused-answers) deferral is answered `defer`, and one whose probe changed is proposed as `defer` and stays missing until carried back.                                                                                                                                                                                                                                                                                                                                                                                              |
| `confirmation`             | When the inspection requires confirmation.                                       | The inspection identity confirmed after reviewing discarded edits, by the agent or a person at a terminal. `details` names the identity and the discarded edits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `inspection`               | Once inspected; the template carries the identity.                               | The identity of the inspection the answers file was written against. A run starts only when it names the current inspection; a new or changed inspection is printed again for review first.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `fix:<declaration>/<fix>`  | When a fix stopped the run for confirmation.                                     | One of `choices`: the run's inspection identity, once the maintainer confirms the overwrite its `context` names, or `defer`, once they decline it, which [defers the fix](#defer-a-declined-overwrite).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `assessment:<declaration>` | For each declaration of contextual work.                                         | Its [assessment](assessment-protocol.md#assessment-submission) judgment without `id`: `status`, `explanation`, `evidence`, and `scopeValidity` for a discovered declaration. `details.noScope` marks a declaration with no scope, which allows no edit. A [reused](#reused-answers) recorded judgment is answered; one proposed for review stays missing until the answers file carries an answer.                                                                                                                                                                                                                                            |

The question's ID names the declaration of a `scope:` or `assessment:`
answer; an `id` inside the answer is ignored. An answers file confirms a
confirmation-required change only by naming the identity the agent reviewed for
discarded edits, or the maintainer confirmed for a remote setting overwrite. An answer naming another identity, such as
one confirmed before the inspection changed, stays missing, and the run does
not start or continue. Version and profile flags must agree with the answers
file, and so must a source given with it.

### Stages and results

`adopt` prints Markdown for the agent: what it needs, the selection, missing
answers, blockers, the inspection summary with each discarded edit's diff, or what replaces a skill or skill link it has none for, the
discovery and adoption guidance of discovery declarations, the run and its
failed checks, each contextual declaration's installed rules and adoption
guidance, the reused answers, the answers file, and the next steps. `--json`
prints the same as a `repo-standards/adopt/v2` report, whose `reused` lists
each [reused answer](#reused-answers) by question `id`, `kind`, and the
`evidence` that made it eligible, and whose `outcome` is one of:

| `outcome`          | Meaning                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answers-required` | Questions in `missing` need answers, including a fix's confirmation or deferral in an active run; before a run, nothing was changed.                                                                                            |
| `blocked`          | Inspection `blockers`, a `resolve` remote setup answer, or a start that stopped before writing anything, with its `run.reason`.                                                                                                 |
| `contextual`       | The run waits for contextual work: `contextual` lists each declaration's allowed targets, rules, and adoption guidance, and `failedChecks` each failure of the latest check round, which cites its rules in the run's `reason`. |
| `complete`         | The run completed; its changes are uncommitted.                                                                                                                                                                                 |
| `incomplete`       | The run needs recovery, such as a repeat-safe retry or a changed scope answer that replaces it in place, or the maintainer's decision about abandonment.                                                                        |

For contextual work, the agent edits the allowed targets, answers each
`assessment:<declaration>`, and runs `adopt --answers <file>` with the pinned
runtime. It refreshes the work request at the current project, submits the
assessments, and runs the checks. A run that has just reached contextual work
asks for new assessments, except those it reuses, which are answered with the
recorded judgment; after failed checks, the answers just submitted are carried
for renewal. A reused assessment whose scoped files the contextual work changes
is proposed for review again instead of submitted. Without a terminal, `adopt` never retries or abandons a
run itself: its next steps name the pinned `resume --retry`, which the agent
runs without asking because its operations are repeat-safe, and `abandon`,
which needs the maintainer's instruction. A run stopped for its scope carries
its `scope:<declaration>` questions, answered with its confirmed scope; a
changed answer [replaces the run in place](#adopt-again-in-place).

Exit status is 0 for a complete run and for a template printed without an
answers file, 1 for every other result or rejection, 2 for invalid usage, and
130 for a terminal session the person interrupted.
Rejections use the common `valid: false` / `errors` diagnostic format with
`--json`.

## Inspect and start

[`adopt`](#adopt-with-one-command) drives these commands and needs no CLI
installed outside the project. To run them yourself, use Node.js 24 or 26, npm, Git,
and an [externally installed exact CLI](inspection.md#keep-the-disclosed-cli-for-start-and-recovery).
First inspect the public GitHub selection:

```sh
repo-standards inspect --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work --json
```

The report lists the pins, proposed replacements and the edits they discard,
matching files and skills, whole-skill inventories, guidance, declared fixes and
checks, prerequisites, and blockers. Use the same CLI version and selection to
start, passing the report's `identity` verbatim:

```sh
repo-standards start --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work \
  --identity 'sha256:INSPECTION_HASH' --json
```

For discovery-backed initial adoption, follow the [two-pass inspection](inspection.md#discover-contextual-file-scope), then pass the same `--scope <file>` proposal with the complete inspection's identity to `start`. Missing, invalid, unresolved or stale scope blocks mutation.

Both commands accept `--project <directory>` and default to the current Git
working tree. Store inspection reports outside the project to keep it clean.

### Confirmation-required changes

Asking to adopt or update a selection is the maintainer's consent, so most runs
start with the identity alone. An agent reviews and confirms discarded edits
recoverable from Git; a fix's remote setting overwrite waits for the maintainer
because Git cannot restore that state. Inspection finds the discarded edits: the
report's [`confirmation`](inspection.md#report-and-inspection-identity) says
whether the run discards any, with one reason for each target in
`discardedEdits`, at an initial adoption as at an update. Breaking source changes, scope proposals,
removing retired product state, and removing unedited installed content need
no confirmation.

When `confirmation.required` is true, `start` without `--confirmed` fails with
`CONFIRMATION_REQUIRED`, naming each discarded edit, and changes nothing. After
the discarded edits have been reviewed and confirmed, start the same inspection with
`--confirmed` added:

```sh
repo-standards start --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work \
  --identity 'sha256:INSPECTION_HASH' --confirmed --json
```

`start` accepts `--confirmed` only when the inspection requires it, and fails
with `CONFIRMATION_NOT_REQUIRED` otherwise. For discarded edits, the agent
confirms after reviewing what Git can restore; a person using the terminal
confirms their own review. The CLI enforces the identity, but cannot verify
that review occurred. The identity binds every start,
confirmed or not: a project that changed since inspection fails with
`STALE_INSPECTION` either way.

Inspection runs no fix, so it cannot see the settings a fix would
overwrite. A fix that would change or remove an existing setting holding a
different value instead returns `confirmation-required`, having changed
nothing, with a message naming the setting and both values; creating a missing
setting needs no confirmation. The [script protocol](script-protocol.md#overwriting-a-setting)
defines the result. The run stops there, resumably: it stays incomplete in the
`fixes` phase, with a `reason` starting `CONFIRMATION_REQUIRED:` that names the
fix and its message, the fix's result in `operations`, and a `nextAction`
naming `resume --confirmed`. After the maintainer confirms that overwrite,
continue the run:

```sh
repo-standards resume --confirmed --json
```

It reruns that fix with `overwriteAllowed: true`, then the fixes after it,
which may each stop for their own confirmation, and continues as the run
would have, to contextual work or checks and completion. Fixes accepted before
the stop are not run again. Without confirmation the run stays stopped: plain
`resume` and `resume --assessment` fail with `CONFIRMATION_REQUIRED` and change
nothing, `resume --retry` repeats the fixes and stops at the same fix again,
and `abandon` ends the run as it ends any other. `resume --confirmed` is
accepted only by a run stopped for a fix's confirmation, failing with
`CONFIRMATION_NOT_REQUIRED` otherwise, and cannot be combined with `--retry` or
`--assessment`.

### Defer a declined overwrite

When the maintainer declines the overwrite, defer the fix instead of ending
the run:

```sh
repo-standards resume --defer --json
```

`adopt` does the same for the answer `defer` to the fix's `fix:<declaration>/<id>`
question, and its terminal for the choice `defer`. The run records the whole
fix as deferred, never as a script result, with the reason
`The maintainer declined the overwrite:` followed by the fix's message, which
names each declined setting. It then continues with the fixes after it, to
contextual work or checks and completion, as a confirmed fix would. A retry
of the same run skips the deferred fix. At completion, durable state keeps the
deferral in `deferred`, which `status --json` reports and the adoption record's
Operations table lists with the result `deferred`, as it lists
[deferred remote setup](#remote-setup). Every later run runs the fix again and
stops again for confirmation while the setting still differs. `resume --defer`
is accepted only by a run stopped for a fix's confirmation, failing with
`CONFIRMATION_NOT_REQUIRED` otherwise, and cannot be combined with `--retry`,
`--assessment`, or `--confirmed`. A fix applies whole or not at all: no run
creates a fix's missing settings while skipping its overwrites.

### Remote setup

A fix that changes the hosting platform's settings, such as its labels or merge
rules, can declare itself [remote setup](author-format.md#remote-setup), with a
readiness probe. Inspection runs every remote setup probe before anything is
written and reports each one in
[`remoteSetup`](inspection.md#remote-setup-readiness) as ready, or not ready
with the probe's reason, such as a missing tool, remote, sign-in, or role.

When every remote setup is ready, the run applies each one as it applies any
fix. When one is not ready, `start` fails with `REMOTE_SETUP_NOT_READY`, naming
each such fix and its reason, and writes nothing, not even a run record.
Resolve the reason and inspect again, or defer remote setup and complete
adoption locally:

```sh
repo-standards start --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.2.3 --profile work \
  --identity 'sha256:INSPECTION_HASH' --defer-remote-setup --json
```

`--defer-remote-setup` defers each remote setup that is not ready and changes
nothing for one that is ready. A deferred remote setup runs neither its fix nor
its fix's prerequisite probe. The CLI records it as deferred, not as a script
result, with the probe's reason: in the run's `deferred`, and at completion in
durable state, where `status --json` reports it as `deferred` and the adoption
record's Operations table lists it with the result `deferred`; see
[summarize status](#summarize-status). Retry and recovery keep the deferral its
start chose. A retry of a start interrupted before installation repeats the
inspection, probes included, and its identity check, so a probe whose answer
changed since inspection makes it stale like any other change; nothing was
installed yet, so abandon the run and inspect again.

Every later run, an update or the unchanged selection applied again, probes
every remote setup again, including deferred ones. A ready one runs as any fix
does, and the completion that follows records no deferral for it. One still
not ready stops the run again unless it is deferred again; `adopt`
[reuses](#reused-answers) the recorded deferral while the same probe still
reports it not ready. Remote setup names no platform; the probe decides
readiness.

## Update the selection

An update is one inspected run from the current selection to a
candidate selection. The candidate can change the CLI pin, the standards pin,
the source, the profile, any combination of them, or none of them. The
inspection report lists every changed component together with the previous
selection. `adopt` drives the same inspect and start sequence, with
[confirmation](#confirmation-required-changes) only when the report requires it.
The report also states whether the update is an exact update, which changes
only exact content, skills, or the selection, or a contextual update, which
changes guidance, a contextual declaration's rules, discovery guidance,
operations, retired declarations, or confirmed scope; see [update class](inspection.md#report-and-inspection-identity).
`inspect --summary` renders the report as a [Markdown proposal](inspection.md#markdown-summary).

To select a standards version, source, or profile, pass all three source flags.
With the currently pinned CLI:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards inspect \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.3.0 --profile work --json
.repo-standards/runtime/node_modules/.bin/repo-standards start \
  --source https://github.com/OWNER/STANDARDS \
  --standards-version v1.3.0 --profile work \
  --identity 'sha256:INSPECTION_HASH' --json
```

To change the CLI pin, obtain the candidate exact CLI outside the project and
run it in place of the pinned executable. Omit the source flags to keep the
retained standards, or pass them to change the standards version, source, or
profile in the same run:

```sh
candidate_dir="$HOME/.local/share/repo-standards/cli-9.0.0"
mkdir -p "$candidate_dir"
(cd "$candidate_dir" && npm install --prefix "$candidate_dir" \
  --ignore-scripts --save-exact --no-audit --no-fund \
  @lutzseverino/repo-standards@9.0.0)
"$candidate_dir/node_modules/.bin/repo-standards" inspect --json
```

Keep that directory outside the adopting project. Start with the same
candidate executable and flags:

```sh
"$candidate_dir/node_modules/.bin/repo-standards" start \
  --identity 'sha256:INSPECTION_HASH' --json
```

The bootstrap provides temporary inspection only. Keep the external candidate
available for retry if installation interrupts before the project runtime is
usable. Once adoption completes, use the new project-pinned CLI normally.

To apply the unchanged selection again, for example after the repository gains
content its standards should cover, run the pinned CLI without source flags:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards inspect --json
.repo-standards/runtime/node_modules/.bin/repo-standards start \
  --identity 'sha256:INSPECTION_HASH' --json
```

Without source flags, inspection and start resolve the selection from retained
inputs, so the original standards repository can be unavailable. Selecting a
standards version, source, or profile requires its public source. The author's
`requires.repo-standards` range is checked only when a standards version is
selected from its source. Retained inputs are validated against the running
CLI's supported source formats, so a CLI update from retained inputs succeeds
even when the retained range excludes the candidate version.

When the candidate profile has active discovery declarations, including an
unchanged selection, the first inspection requires fresh project evidence.
Build a new `--scope` proposal and pass it to both the complete inspection and
its start; `adopt` builds it from the recorded entries it
[reuses](#reused-answers) and the answers it asks for. The report lists discovered-scope additions and removals
relative to the prior complete adoption; removed scope ends governance without
deleting that project-owned content.

Every update applies inspection freshness, confirmation, Git-state, prerequisite,
compatibility, and ownership checks before mutation, then uses the normal
fixes, contextual assessment, checks, integrity verification, recovery, and
abandonment behavior. It replaces the retained inputs and still-declared exact
content and whole skills, including removal of obsolete skill resources.
Retired and excluded declarations, including those a changed source or profile
no longer declares, leave the new baselines and no longer contribute
operations. The run removes each of their installed targets that still matches
its installed baseline. An edited one stays in place and the project owns it:
the inspection lists it in `kept`, durable state no longer records it, and
later runs neither track nor remove it. A skill with any edited file stays
whole, with its link. An installed target
within contextual scope, as a contextual target or inside or containing one, is
not removed and stays in place as project content. Only a changed CLI pin
replaces the isolated runtime manifests, npm lock, dependencies, and matching
product-owned system skills; otherwise the existing runtime remains, and each
system skill is matched, created, or replaced with the one the pinned CLI
packages.
Project dependency manifests and package-manager choices remain outside that
runtime. An incomplete run retains the prior last-complete evidence.

Tracked content at an installation target never blocks: the run replaces it, or
removes it when the selection no longer installs the target and the project
has not edited it, and the
inspection lists each replacement or removal that discards content other than
the target's installed baseline, each one a
[confirmation-required change](#confirmation-required-changes). Git keeps what
it discards. Only ignored or
untracked content, which Git cannot recover, blocks with
`UNTRACKED_REPLACEMENT`. There is no universal rollback. Only a
complete run advances last-complete state and new baselines. Every update
leaves HEAD unchanged and its actual changes uncommitted for the project's
normal workflow.

Start requires the same content-derived inspection identity, an existing
commit, clean index and working tree, no non-ignored untracked files, safe targets,
and recoverable replacement content. Git flags
that hide changes and nested submodules block this initial journey. Existing
exact files and skill directories whose complete inventory, bytes, and
executable state match the supplied content are matched without rewriting and
recorded in the new baselines. This includes a system skill when it matches
the skill packaged with this exact CLI. A differing tracked file or skill,
including a system skill, is replaced and listed among the discarded
edits; unrelated and excluded content remains outside the selection.

The identity binds what the run reads, not Git HEAD or where the project is
checked out: a commit between inspection and start that touches no affected
file, retained input, or durable product state leaves the identity valid,
and an inspection made in another clone of the same content starts a run in
this one. The run records the project root and HEAD at start in its `root` and
`head` fields for provenance, and completion records only HEAD, in the state's
`lastComplete.head`; the root is never committed. HEAD and the index must then
stay unchanged until the run completes. Inspection and run reports carry hash
inventories and diffs rather than file bytes; start acquires the source again
and installs only bytes that match the inspected hashes. See
[the inspection report](inspection.md#report-and-inspection-identity).

Before installation, start probes every declared prerequisite using its literal
version arguments from the project root. It reports all missing executables,
failed probes, unreadable versions, and incompatible versions without installing
prerequisites. Inspection itself never probes them. The trusted script contract
and detailed failure behavior are documented in [Script protocol](script-protocol.md).

The CLI prepares the exact runtime outside the project with npm lifecycle
scripts disabled. The project's dependency manifest, package manager, and
`.npmrc` do not govern this installation. The configured external npm cache is
reused, including for offline acquisition of cached packages. As with the
bootstrap, content-cache symlinks are rejected and logs stay in temporary
storage so cache settings cannot redirect acquisition into the project.
After acquisition, start reacquires
the immutable source and repeats all freshness and safety checks under an
exclusive run lock. Each write checks target ancestors again. Failed preflight
or acquisition leaves project content untouched.

## Skill links

Every installed skill lives once, in `.agents/skills/<skill>/`, which Codex and
most agents read. Claude Code reads only `.claude/skills/`, so for each skill a
run installs, system or author, the run also installs a skill link at
`.claude/skills/<skill>`: a relative symbolic link whose text is
`../../.agents/skills/<skill>`
([ADR 0013](https://github.com/lutzseverino/repo-standards/blob/main/docs/adr/0013-expose-installed-skills-through-skill-links.md)).
Standards authors declare nothing for it.

A skill link is an ordinary installation target. A link with the same text is
matched, a missing one is created, and tracked content of any other kind, such
as a hand-made copy of the skill, is replaced and listed among the discarded
edits. Untracked content at the path blocks with `UNTRACKED_REPLACEMENT` and
is left alone. A `.claude` or `.claude/skills` that is itself a symbolic link,
or a link at the path with any other text, blocks with `UNSAFE_TARGET`; the
product never writes through a link it did not create. The inspection lists
each link with its skill and action, its identity binds the link without
following it, and durable state records each link's text. A link changed after
inspection makes `start` fail as stale.

The product links only the skills it installs and never writes
`.claude/skills` as a whole: a skill the project wrote itself under
`.agents/skills/` gets no link, and other content in `.claude/skills/` stays
untouched. A retired skill's link is removed with the skill, and stays with it
when an edited skill is kept. A link the maintainer edited on its own, such as
one replaced by a committed file, is kept even when its unedited skill is
removed. Links are exact
content, so they never make an update contextual. Git records each link as a
symbolic link; a checkout with `core.symlinks=false` has a small text file
there instead, and Claude Code does not see that skill. Commit the links with
the run's other changes; a link that Git ignores fails completion with
`IGNORED_OUTPUT`, like any other adoption output.

## Durable and local state

Review and commit these files through the adopting project's normal workflow:

| Path                                                        | Recorded material                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.repo-standards/selection.yaml`                            | Exact CLI package/version, canonical source URL, stable tag, commit SHA, and profile.                                                                                                                                                 |
| `.repo-standards/lock.json`                                 | Inspection identity, immutable source and CLI pins, SHA-256 hashes and executable state for exact and retained material, runtime manifests, and last-complete state.                                                                  |
| `.repo-standards/state.json`                                | Last-complete run, HEAD at start, completion time, exact baselines, full skill file inventories, skill links, check and assessment evidence bound to the selection and project snapshot, and compact work evidence for this run only. |
| `.repo-standards/inputs/`                                   | Normalized metadata, the resolved selection, a normalized single-profile manifest, selected source files/trees, and root license material. Other profiles and unrelated source material are omitted.                                  |
| `.repo-standards/rules/`                                    | The [installed rules](rules.md) of every active declaration that has rules, and the generated `README.md` index of what each covers.                                                                                                  |
| `.repo-standards/runtime/package.json`, `package-lock.json` | An isolated exact CLI dependency and npm's resolved dependency graph and integrity values.                                                                                                                                            |
| `.repo-standards/.gitignore`                                | Ignores runtime dependencies, local reports/logs, and caches.                                                                                                                                                                         |
| `.repo-standards/.gitattributes`                            | Marks product state `linguist-generated`, so it never counts toward GitHub language statistics.                                                                                                                                       |
| `.agents/skills/repository-standards/`                      | The product-owned model-invocable skill from this exact CLI version, which looks up [installed rules](rules.md) before file changes and reports [available updates](available-updates.md).                                            |
| Exact targets and `.agents/skills/<author skill>/`          | The selected author-owned content and complete skill resources.                                                                                                                                                                       |
| `.claude/skills/<skill>`                                    | A skill link for every skill above, system or author: a relative symbolic link to `../../.agents/skills/<skill>`.                                                                                                                     |

Discovery adoption additionally retains `inputs/scope-history.json`, and every
later run keeps writing it. It holds the current run only: its accepted
inspection identity, resolved selection, and, when the run discovered scope, its
source-resolved declarations, discovery guidance, proposal, rationale, evidence
paths, derived absence and observation identities, together with the run's scope
change against the previous run. This file is included in immutable input integrity.
`inspect --json` exposes it as historical scope after completion, independently of
source availability, as `repo-standards/scope-history/v6` in the
`repo-standards/inspection/v8` report, and `status` reports its scope change.
It also keeps each discovery script's draft that the confirmed entry was
decided from, which a later update compares with the fresh draft to
[reuse the scope answer](#reused-answers).

Retained scope evidence stores the run's discovery once: its identity, proposal,
absence, declarations and project observation without the evidence array that
observation implies. The named observation is stored as its delta from that
project observation: the confirmed targets and any boundary entry naming them
adds. Evidence arrays and the full named observation are rebuilt whenever the
file is read. The scope change lists, for each discovery declaration whose
discovered paths changed, the paths added and removed against the previous
run's confirmed scope; it is computed when the run is planned and stored with
it. Work intervals and final scope-validity assessments are committed in
`repo-standards/state/v8`, which holds the current run's evidence only, with
the answers it reused and each contextual declaration's scoped files, by
identity, at completion. Neither
file carries an earlier run, so neither grows with the number of runs; Git
history keeps the evidence of earlier runs.

Committed intervals are
[work evidence](script-protocol.md#observed-adoption-scope): the
identities of the observations a run held and the delta between them, not the
observations themselves. Each interval keeps its phase, scope, operation
reference, changed paths with their before and after file state, boundary
changes, violations and restoration evidence, so an adoption pull request stays
reviewable and each run commits only its own evidence. The run record and the
uncommitted local run report record intervals in this same shape, so completion
carries them into state unchanged and neither record grows with the project.
Historical evidence makes no current-coverage claim.

Each artifact has exactly one format, which this CLI both writes and reads:

| Artifact                                                             | Format                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Durable state, `.repo-standards/state.json`                          | `repo-standards/state/v8`                                        |
| Integrity lock, `.repo-standards/lock.json`                          | `repo-standards/lock/v1`                                         |
| Retained scope evidence, `.repo-standards/inputs/scope-history.json` | `repo-standards/scope-history/v6`                                |
| Run record, local run report, and archived abandoned report          | `repo-standards/run/v7`                                          |
| `status` report                                                      | `repo-standards/status/v9`                                       |
| Inspection report                                                    | `repo-standards/inspection/v8`                                   |
| Work request and assessment                                          | `repo-standards/work-request/v5`, `repo-standards/assessment/v3` |

An update also reads `repo-standards/state/v7` and
`repo-standards/scope-history/v5`, the formats the previous release wrote, as
the adoption it updates, so that it [reuses](#reused-answers) what those
records prove. Every other earlier format is retired: it is not read,
converted, or compacted. A project whose committed files carry one
[adopts fresh](#adopt-fresh-from-a-retired-format), and a run record in one
calls for the CLI that wrote it. An agent's assessment
submission is never committed: one in an earlier format is rejected with
`ASSESSMENT_FORMAT` until it is written again in the current format.

Discovery-backed updates, including an unchanged selection, inspect fresh
proposals, whose entries `adopt` [reuses](#reused-answers) when their fresh
evidence is unchanged, and record their scope change against the prior run. Retry repeats
fixes under the confirmed scope and cannot authorize additional files; a scope
that needs to change is [corrected by adopting again](#correct-a-confirmed-scope).

The normalized manifest is separate from retained source files, so an author
may legitimately select their original `standards.yaml` as exact content.
References keep their original source-relative paths. The shared resolver also
interprets the retained manifest; inspection does not introduce a second format
interpreter.

Runtime `node_modules`, `.repo-standards/local/`, and caches remain ignored.
Durable progress lives at Git's `repo-standards-run.lock` path, outside tracked
content and separate for each working tree. It records the current run even if
installation is interrupted before local product reports can be created. Separate
process registrations under `repo-standards-run.lock.workers/` prevent concurrent
start, resume, retry, and abandon commands. Dead registrations do not hold an
execution lock. Saved installation material and the completion bytes a recovery
may need to verify, both addressed by their hashes, runtime staging, and the one
observation the run's last interval ends at remain in Git's working-tree
metadata until completion or abandonment.
`.repo-standards/local/run.json` records progress once installation begins.
Neither dependencies nor run records belong in commits.

## Completion and incomplete results

`start` prints a `repo-standards/run/v7` JSON report. Its fields include `id`,
`inspection`, `selection`, `root`, `head`, `affected`, `outcome`, `phase`, `reason`, `changes`, `completed`,
`uncertain`, `nextAction`, `prerequisites`, `operations`, `deferred`, `reused`, `assessments`, and contextual
`workRequest` when required. `reused` lists each [reused answer](#reused-answers)
by question `id`, `kind`, and `evidence`: those `adopt` reused for its start and
each assessment the run reused. `deferred` lists each fix the run defers, by
`declaration`, fix `id`, and `reason`: [remote setup](#remote-setup) that is
not ready, with the probe's reason, and each
[declined overwrite](#defer-a-declined-overwrite). `root` and `head` record the canonical project
root and HEAD at start for provenance; the inspection identity binds neither,
and neither is committed. The report carries no file bytes: `affected` holds
the hash inventories of the targets at start, `completion` the hashes of the
candidate lock and state, and the work request references guidance by path and
hash. `installation.files` and `installation.runtime` record
confirmed installation progress; `uncertain` describes work whose result has not
been verified and recorded. `retryHistory` preserves prior failure reasons,
uncertainty, and assessment evidence. Its `report` path points to the local report
bytes archived before retry, including any changes made by an interrupted author
process. Archived paths are relative to Git's directory for the working tree,
which `git rev-parse --absolute-git-dir` prints, such as
`repo-standards-reports/<run-id>/<name>`, so committed retry history records no
checkout location. Archival failure blocks retry before the existing report is
overwritten.
Each retry's `archivedFiles` also retains operation logs, including unrecorded
results. Archive names include content hashes so reusing an operation index
cannot replace earlier evidence.
`operations` retains recorded process results, and `observations` records each
observation interval as identities and deltas in the
[committed interval shape](script-protocol.md#observed-adoption-scope),
without observation maps. Exit status is 0 for complete adoption, 1 for an
incomplete run or rejection, and 2 for invalid usage. Preflight rejections use
the common `valid: false` / `errors` diagnostic format.

Completion requires expected exact bytes and executable bits, whole-skill and
retained-input inventories, runtime dependencies, durable product files, and
unchanged HEAD and index. Exact and durable outputs must also be visible to
Git's normal add workflow; ignore rules hiding new adoption outputs make the
run incomplete. Verification uses the original expected installation
values; unexpected changes cannot become new baselines. Completion leaves all
changes uncommitted and releases the lock. Those changes include new untracked
files, which `git diff` omits; review them too, such as with
`git ls-files --others --exclude-standard -z`, as `adopt`'s next steps describe.

Fixes run serially before contextual work. Checks run after fixes for profiles
without contextual declarations; otherwise they wait for a satisfied, current agent assessment. Ordinary failed checks allow subsequent checks to collect evidence.
Blocked results, execution errors, check mutation, and integrity failures stop
the phase and preserve incomplete work. A fix that needs confirmation to
overwrite a setting stops the run until [`resume --confirmed`](#confirmation-required-changes). A contextual handoff is incomplete,
with no last-complete state. Apply its guidance, refresh the snapshot with
`resume --json`, and submit `resume --assessment <file> --json` to continue.

An incomplete adoption preserves changes and its lock. Its change report
observes actual Git changes and ignored product storage, including unexpected
additions; runtime dependencies are listed as one directory. The persisted
`affected` observations include author targets and the system skills,
so subsequent `status` calls also find ignored files and skill resources added
after interruption, and reflect paths reconciled since the run stopped.
Until the initial ignore-file write succeeds, the Git-directory lock remains
the report and no potentially visible local run record is created.

Failure to persist final completion is reported as an incomplete `completion`
phase with explicit uncertainty and recovery guidance. Candidate state is
preserved as ignored `.repo-standards/local/incomplete-state.json` when possible,
instead of asserting a last-complete adoption. If preserving that candidate also
fails, the report identifies the uncertainty for manual recovery.

## Summarize status

`status` prints a Markdown record with a **Ready to commit** verdict.
`status --summary` prints the same record; `status --json` returns
`readyToCommit`, a boolean, and `readinessReasons`, the failing conditions as
messages (empty when ready). The verdict is true only when:

- no adoption run is active;
- a last complete run is recorded;
- there is no `stateError`;
- every path in that run's `changeSet` is among Git's uncommitted changes.

Staged, unstaged, and non-ignored untracked paths count as uncommitted, including
deleted paths and both ends of a rename. A path already committed or reverted
makes the verdict false, even when unrelated changes remain. A complete run
with an empty change set satisfies the path condition. The verdict describes
readiness for the project's commit workflow; it does not run checks or certify
ongoing compliance. Producing a status report still exits 0 when the verdict is
false; CLI pin, format, and integrity failures still fail as documented below.
Readiness depends on the checkout's current Git status, so the verdict can
differ between checkouts holding the same committed adoption state.

`status --summary` renders the status record as Markdown on stdout instead of
JSON. After a complete run it is the record of that run: the selection, every
operation with its result and message, then each deferred fix with the result
`deferred` and its reason, such as [remote setup](#remote-setup) with the
probe's reason or a [declined overwrite](#defer-a-declined-overwrite),
each path the run changed, once, with
the phases that changed it, the discovered-scope additions and removals the run
made, and the run, inspection, HEAD-at-start, and completion identities. A
`### Reused answers` subsection of its Operations section lists each
[reused answer](#reused-answers) with why it was eligible, adding no level-1 or
level-2 heading, so the record stays a Repo Canon adoption record. During
an active run it renders the run's selection, outcome, phase, execution and
reason, its completed and uncertain work, operations and results, then its
deferred fixes and reused answers, changed paths, next action, and identities. Abandoned runs and a state error are listed
when present. The same record renders the same bytes, the summary describes the
record without prescribing anything, and combining `--summary` with `--json` is
a usage error.

The changed paths are the run's net change set, which completion keeps in
durable state as `changeSet`, so the changed-path table renders from committed
state alone, in any checkout. Each entry names a path whose state at completion differs from
its state before the run, and the phases that changed it: `installation` for
exact files and skill files, including the system skills' and a retired
declaration's removed target, that the run created, replaced, or removed; `fixes` and `agent` for the paths their intervals
recorded. A path that a later phase returned to its state before the run is not
listed, verified restoration of installed content after an interruption keeps
only the installation's attribution, and product state under `.repo-standards/`
is not listed. A run that [adopts again in place](#adopt-again-in-place)
covers the changes of the run it replaced too, relative to the HEAD that run
started from. The JSON status record of a complete adoption includes the same
`changeSet`.

The JSON status record of a complete adoption also includes `deferred`: each
fix its last complete run deferred, by `declaration`, fix `id`, and `reason`,
or an empty list. An active run reports its own `deferred`. Every JSON status
record includes `reused`: the [reused answers](#reused-answers) of the active
run, or else of the last complete run, or an empty list.

The JSON status record of a complete discovery-backed adoption includes
`scopeChanges`: the additions and removals by declaration that its last complete
run made relative to the run before it, read from the retained scope evidence,
or every confirmed path for the first discovery-backed run.

Every `status --json` report uses `repo-standards/status/v9` (raised from v8 for
`reused`) and includes
`scopeProposal`: the last complete run's confirmed proposal, in the public
`repo-standards/scope/v2` format, or null when that run had no confirmed proposal
or no adoption has completed. It preserves the confirmed candidates, decisions,
reasons, evidence paths, coverage, and unresolved questions, with the list order
normalized at inspection. It carries no inspection or discovery identity.

The field reads only retained committed evidence and works in a fresh checkout,
offline, independently of the source flags used for inspection or an update.
During an incomplete or abandoned update, it reads the last complete adoption's
evidence from the clean commit at that run's start; the candidate proposal does
not become the last complete proposal. An update reuses the proposal's entries
only when fresh evidence reproduces what they were decided from, as
[reused answers](#reused-answers) describes. `status --summary` does not render
the proposal.

## Adopt afresh over installed content

Initial adoption never takes over existing product state in the current
formats: an established adoption inspects as an update, and any other
`.repo-standards/` content that is not
[retired](#adopt-fresh-from-a-retired-format) is an `EXISTING_ADOPTION`
blocker. Giving up readable retained state therefore remains a deliberate
change visible in Git. To adopt afresh over content that such an adoption
installed, finish or abandon any active run, remove the product state
directory, commit that removal through the project's normal workflow, and
inspect the selection again:

```sh
git rm -r --quiet .repo-standards  # tracked product state
rm -rf .repo-standards             # ignored runtime, local, and cache content
git commit -m "Remove Repository Standards product state"
```

The new inspection matches exact files and skill directories that still match
the selected source, and each system skill that matches the inspecting CLI's
packaged skill, without rewriting them. It replaces tracked content that
differs, such as a skill edited since installation or a system skill that a
different CLI version installed, and lists each such replacement among the
discarded edits. Evidence of the earlier adoption remains only in Git history.

## Adopt fresh from a retired format

Each record has one format this CLI reads. `status`, `resume`, and `abandon`
check the active run's CLI pin, or otherwise the recorded adoption's pin,
before checking any record format. A different CLI fails with
`CLI_PIN_MISMATCH` first, without changing anything.

When committed state, the integrity lock, or retained scope evidence carries an
older format, inspecting with `--source`, `--standards-version`, and
`--profile` previews a fresh adoption without anything removed or committed
first. Nothing in the retired state is read or converted, and the selection is
inspected as an initial adoption. Each of those records that is present must
still carry its own artifact's current or retired format, as a
`repo-standards/lock/v1` lock beside retired state does; any other content
there fails with `STATE_INTEGRITY`, and nothing is removed:

- `retiredState` in the report, and **Retired product state** in its summary,
  list the retired records and every file of the `.repo-standards` directory
  as content the run removes. The directory is removed whole, including its
  ignored runtime dependencies, local reports, and cache, which the identity
  doesn't bind and the report doesn't list. Local content worth keeping, such
  as a candidate state an earlier CLI preserved in
  `local/incomplete-state.json`, is copied elsewhere before `start`. The
  inspection identity binds the rest, so changing it after the inspection
  fails `start` with `STALE_INSPECTION`.
- Exact files, skills, and system skills are matched or replaced as at any
  initial adoption: without an installed baseline, every replaced target is
  listed among the discarded edits. Content that an earlier adoption installed
  and the selection no longer declares stays in place as project content.
- Removing the retired state is not a
  [confirmation-required change](#confirmation-required-changes). Under its lock, `start`
  observes the same retired directory again, removes it, and then installs. The
  removal is left uncommitted with the run's other changes; HEAD and the index
  don't change. A directory that no longer matches the inspection when its
  removal begins fails the run with `INSTALLATION_CHANGED`, and nothing is
  removed. An interrupted removal is recovered with `resume --retry` like any
  interrupted installation. While the run is active, `status`, `resume`,
  and `abandon` read it rather than the retired state.

Every other command that would read a retired committed record, including
`inspect` and `start` without source flags, which inspect retained standards,
fails with `RETIRED_FORMAT` after any required pin check and before reading
further records or writing anything. The diagnostic names the record, its
retired format, and the format this CLI reads, for example:

```text
[RETIRED_FORMAT] .repo-standards/state.json carries the retired format repo-standards/state/v6; this CLI reads only repo-standards/state/v8. Adopt fresh: inspect with --source, --standards-version and --profile, and start that inspection, which removes the retired .repo-standards directory.
```

Run records live in Git's directory: the active run at
`git rev-parse --git-path repo-standards-run.lock`, and abandoned runs' reports
in the `repo-standards-reports/` directory beside it. An active run record in a
retired format may hold unfinished work, so every command that reads product
records, including the fresh-adoption preview and its start, fails with
`RETIRED_RUN` and removes nothing. `outdated` is the exception: it reads only
the pinned selection and writes only its ignored cache. The diagnostic names the earlier pinned CLI when the record carries
one, and its `resume --retry` and `abandon`, which can still continue or end
the run; this CLI can't:

```text
[RETIRED_RUN] The active adoption run record .git/repo-standards-run.lock carries the retired format repo-standards/run/v5; this CLI reads only repo-standards/run/v7. It may hold unfinished work: with the earlier pinned CLI 3.2.0, resume it with resume --retry or end it with abandon, then inspect again.
```

An archived report in a retired format fails with `RETIRED_FORMAT` and names
that report: only the CLI that wrote it reads its evidence, so it is moved out
of Git's directory before this CLI continues.

A higher version of the same record format fails with `NEWER_FORMAT`, including
when a future schema no longer exposes the CLI pin where this CLI expects it:

```text
[NEWER_FORMAT] .repo-standards/state.json carries the newer format repo-standards/state/v9; this CLI reads only repo-standards/state/v8. Use the pinned CLI to read this record.
```

This diagnostic exits 1, reads no further records, and changes nothing. Use the
CLI pinned by the project or active run. A newer format never takes the
fresh-adoption path, and takes precedence over any retired record. The three
format diagnostics include `details.path`, `details.format`, and
`details.expected` in JSON output; `RETIRED_RUN` adds `details.cli` when the
run record names its CLI. Malformed or unrelated format identities, including
a same-prefix version that is not `vN` such as `repo-standards/state/vnext`,
are not classified as retired or newer. They fail integrity validation when
a command reads that record.

## Recover or abandon an interrupted run

Use the run's exact CLI version; `status`, `resume`, and `abandon` reject any
other with `CLI_PIN_MISMATCH`. If installation stopped before the project-local
CLI became usable, use the externally installed CLI that started the run. When
the project runtime manifest and npm lock do not yet both pin the run's CLI, the
diagnostic names that CLI instead of the runtime reinstall command, which could
not restore it.

`resume`, including `--retry` and `--assessment`, requires Git 2.32 or newer,
as `inspect` and `start` do. After the CLI pin check and before reading records
or observing project work, it checks the Git version. Older Git fails with
`GIT_VERSION_UNSUPPORTED`, naming the installed and minimum versions, and
changes nothing. `CLI_PIN_MISMATCH` still takes precedence under another CLI.

```sh
repo-standards status --json
repo-standards resume --retry --json
```

`status --json` reports the active run's `phase`, `reason`, `changes`,
`completed`, `uncertain`, `nextAction`, and `execution`. `execution: active`
means a command or recorded author process group is still running. Background
members keep the group active even after a fix or prerequisite probe returns.
Recorded leader start identities distinguish an unrelated live leader that
reuses a process-group number; a leaderless group is still treated
conservatively as active while it has surviving members.
`execution: interrupted` means durable incomplete progress
remains without live execution. A normal contextual handoff also has no live
execution. A second start is blocked until the run is resumed or abandoned.
The CLI uses the system `ps` utility to inspect process-group membership. Worker
and group-leader identities use kernel start values: boot identity and start
ticks from Linux procfs, and microsecond start times from macOS libproc through
the packaged Koffi binding. The macOS binding ships prebuilt for arm64 and x64;
installation does not require a compiler or enabled install scripts. Recovery
is rejected if process identity or liveness cannot be determined safely.

`resume --retry` explicitly authorizes repeating trusted operations. It checks
prerequisites again, verifies inspected installed bytes, executable state,
inventories, HEAD and index, and finishes pending installation from saved
material. A write interrupted before its progress was recorded may contain the
original inspected bytes or the expected installed bytes. Other edits block
retry for reconciliation; there is no force-overwrite. Once installation was
prepared, recovery needs neither the standards source nor fresh npm acquisition.
An interruption before preparation repeats inspection and acquisition and still
requires the original inspection identity to be fresh; the run's start already
carried any confirmation that inspection required.

Retry reruns repeat-safe fixes in declaration order, requests renewed contextual
assessment where applicable, reruns checks, and verifies final integrity before
recording completion. It retains earlier operation evidence and uncertainty as
history. Retry discards the run's accepted assessment: a new submission against
the retried request is required, even if project bytes match.
Retry records separate
fix and agent observation intervals, retaining earlier observed agent edits
even when replayed fixes overwrite the same files. Retry cannot hide
recorded scope violations or create scope authority, though restoring a
violating path to its state before the run reconciles its violation; see the
[observed execution contract](script-protocol.md#observed-adoption-scope). Submit a new assessment separately after retry;
`--retry` and `--assessment` cannot be combined. Plain `resume` and
`resume --assessment` remain the contextual interface and never implicitly retry
uncertain process outcomes. A run stopped because a fix needs confirmation to
overwrite a setting continues with
[`resume --confirmed`](#confirmation-required-changes) once the maintainer
confirms, or with [`resume --defer`](#defer-a-declined-overwrite) once they
decline. A failed completion write remains incomplete until
its candidate state is verified and recovery finishes.

`abandon` ends an incomplete run while keeping its work:

```sh
repo-standards abandon --json
repo-standards status --json
```

Abandon leaves project content and HEAD in place and retains incomplete evidence.
It archives the report under Git's `repo-standards-reports/<run-id>.json`; `status`
returns these reports in `abandoned`. Operation logs and local report snapshots
are copied alongside the archived report in a directory named for the run ID.
Archived operations point to those copies, so later adoption and removal of the
incomplete installation cannot overwrite their evidence. Archived paths are
relative to Git's directory for the working tree, including when that directory
lives outside the working tree, as in a linked worktree.
`archivedFiles` maps original report and operation-log paths, which stay
project-relative, to their archived copies, including logs written before their operation result reached the journal.
Abandonment reports `outcome: incomplete` with `abandoned: true` and exits 0
once the run is abandoned; every refusal, such as `NO_ACTIVE_RUN` or a live
author process, exits 1. The report does not assert successful adoption or
replace last-complete evidence. The
CLI releases the run only after preserving any candidate completion state and
archiving its report, with the run's saved installation and the observation
its last interval ends at, which adopting again in place reads. Failed
preservation blocks abandonment and keeps the run active for reconciliation.
Preserved changes stay in the working tree. Run `adopt` in that checkout to
[adopt again in place](#adopt-again-in-place) over them, or reconcile them
through the project's normal workflow; any other new run requires a clean
project without conflicting product state and a fresh inspection.
An archived run report is moved out of Git's directory only when it carries a
[retired format](#adopt-fresh-from-a-retired-format), because this CLI cannot
read it.

## Correct a confirmed scope

A run's confirmed scope never changes while the run is active, and retry
repeats work under it. A structurally valid blocked scope review, reporting that
coverage needs files outside the scope or that a confirmed target is mistaken,
leaves the run incomplete with `SCOPE_INCOMPLETE`; its additional paths grant no
authority. Agent work outside the allowed targets, `ASSESSMENT_SCOPE`, and a
blocked assessment, `ASSESSMENT_BLOCKED`, also stop the run. A different scope
takes a new run, and `adopt` starts it in place.

### Adopt again in place

While a run is stopped for one of these reasons, its `adopt` report carries
each discovered declaration's `scope:<declaration>` question, answered with the
confirmed scope entry. Change that answer to cover the files the work needs,
such as a path `ASSESSMENT_SCOPE` names, and run `adopt --answers <file>` again.
In a terminal, choose to change the scope from the incomplete-run menu. A scope
answer is Git-undoable, so an agent changes it without asking. `adopt` then
replaces the run in the same checkout:

1. It archives the run's report as abandonment does, marked `abandoned: true`
   with a reason starting `REPLACED:`, keeping its changes.
2. It inspects the unchanged selection with the new scope, defaulting the
   version, profile, and remote setup deferral to the replaced run's, and asks
   for the new inspection's identity before starting.
3. It starts a new run over the replaced run's changes.

`adopt` in a checkout where a run was abandoned does the same from step 2,
defaulting the scope to the abandoned run's as well; so do `inspect` and
`start` of that selection. A start over a run's preserved changes requires
the checkout to still hold what the run left: its HEAD and index, its verified
installation, and each uncommitted path outside product state in the state the
run's last observation recorded. The Git start blockers exempt exactly those
paths. Any other uncommitted change still blocks with `DIRTY_PROJECT`, naming
its path, and the agent stops and tells the maintainer. Selecting another CLI,
source, version, or profile does not adopt in place. The last complete
adoption an update replaces is read from the HEAD the run started from, since
the checkout's product state is the run's own.

The new run keeps the installed runtime, reruns every fix, which is
repeat-safe, and asks for renewed assessments: the preserved contextual work
stays in the tree, is attributed to agent work, and must lie within the new
scope. Its change set and adoption record cover every change relative to the
HEAD the first run started from, with the phases that made each. The
replaced run's own evidence stays in its archived report.

Without changing the scope, a run stopped for `ASSESSMENT_SCOPE` also recovers
by restoring each named path, as its next steps say. Abandoning, committing or
discarding the changes, and adopting again from a clean checkout remains
possible, but no stop requires it.

## Fresh checkout and source disappearance

Restore the runtime from committed manifests using:

```sh
npm ci --ignore-scripts --prefix .repo-standards/runtime
.repo-standards/runtime/node_modules/.bin/repo-standards status --json
.repo-standards/runtime/node_modules/.bin/repo-standards inspect --json
```

The npm package must remain available from its locked location or an npm cache.
No standards-source connection is needed for these commands. `inspect` without
source flags verifies retained input integrity and resolves the current profile
from retained material. Local edits to exact project content remain visible in
the report, which has `retained: true`. With the pinned CLI it describes the
unchanged selection; with a different exact CLI version it describes a CLI
update. Either can be started as described above. Active discovery
declarations require fresh `--scope` proposals; retained historical scope never
substitutes for them.

`status` reports pins, active progress, and historical last-complete evidence
without any network request; [`outdated`](available-updates.md) reports
available CLI and standards updates. Both require the pinned CLI, and so does
[`rules`](rules.md#look-up-the-rules-for-a-path), which reads the installed
rules without any network request. `status` takes
the pin from the active run when a run is active, otherwise from the last
complete adoption; `outdated` takes it from the committed selection. Under
another CLI version each exits 1 with `CLI_PIN_MISMATCH`, as `resume` and
`abandon` do for an active run. The diagnostic names the pinned version and,
when the runtime manifest and npm lock both pin it, the project root and the
runtime reinstall command above; otherwise it names an exact CLI installed
outside the project, as [recovery](#recover-or-abandon-an-interrupted-run)
describes. Without a recorded pin, as before an initial adoption starts, any CLI
reports. Only `inspect` and `start` accept a different exact CLI, as a candidate
CLI pin change.
After an abandoned update, `status` still returns the archived report. If the
preserved product files do not represent complete adoption, `stateError`
describes that condition and names the abandoned run and the way forward,
adopting again in place; historical evidence comes from the matching archived
run and does not certify the candidate selection as complete. `check` and
`rules` name the same way forward in their `STATE_INTEGRITY` diagnostic.
It does not claim ongoing compliance after subsequent project edits. While an
initial run is incomplete, no last-complete adoption is reported. `adopt`'s
next steps guide these same commands and confirmation requirements.
