# Update an adoption

An update moves an adopted repository to a newer setup: a new version of its
standards source, another source or profile, a new CLI, or any combination of
them. Each update is one adoption run, reviewed and committed like the first
[adoption](adopt.md).

## See what is available

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards outdated
```

`outdated` reports whether a newer CLI or standards version is published for
each pin, and each newer release's adopter action: something its author asks
of you outside adoption. It changes nothing in the project and is safe to run
at any time; the installed `repository-standards` skill runs it at the start
of an agent's work. Whether to update is your decision. See
[the available-updates report](../reference/available-updates.md) for its
output and the [release policy](../reference/available-updates.md#release-policy).

## Update with one command

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
one run. With every recorded answer [reused](#answers-an-update-reuses), nothing else
open and no confirmation required, `adopt --json` is the whole update: it
starts the run in that invocation, which exits 0 with its changes ready to
commit. See [Update the selection](../reference/adoption-run.md#update-the-selection) for the detailed
update contract and lower-level commands.

### Answers an update reuses

An update carries the last complete adoption's answers forward when what they
were about is provably unchanged: a discovered scope whose guidance, rules and
fresh draft match and whose paths all still exist, a deferral of remote setup
that is still not ready, and an assessment whose rules and scoped files are
unchanged. Every other recorded answer comes back prefilled for review, with
what changed. A confirmation is never reused. See
[Reused answers](../reference/adoption-run.md#reused-answers) for the exact
conditions.

## Apply the same version again

To apply the current selection again, for example after the repository gains
or moves content its standards should cover, keep both pins: run the pinned
runtime and pass the current standards version.

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards adopt \
  --standards-version <current version>
```

Without `--standards-version`, `adopt` proposes the newest stable release. The
pinned runtime keeps the CLI pin, and the run applies the retained standards
again even when the source cannot be read. A discovered scope whose recorded
paths no longer all exist comes back with a fresh draft for review. See
[Update the selection](../reference/adoption-run.md#update-the-selection).

## Change the CLI pin

`npx @lutzseverino/repo-standards@<version> adopt` installs and pins the CLI it
ran, so it changes the CLI pin and the standards version in one run. In the
product's own checkout, use an external exact CLI instead, as
[Adopting in the product checkout](adopt.md#adopting-in-the-product-checkout)
describes.

## Update without anyone answering

`adopt --headless` updates an established adoption without asking anybody,
for a scheduled job or another unattended caller. It completes only when every
answer is reused, nothing blocks it and no confirmation is required, and it
defers every remote setup to the next local `adopt`. Otherwise it stops with
the questions that remain. See
[Update headlessly](../reference/adoption-run.md#update-headlessly). To have
every available update proposed as a pull request, opt in to
[automated updates](automated-updates.md).

## Review and commit

Review an update as you would an adoption:
[review the changes](adopt.md#review-the-changes), then
[commit them](adopt.md#commit-the-adoption). The inspection also states the
update class. An exact update changes only exact content, skills or the
selection, so no contextual work is asked for again. A contextual update
changes guidance, rules of a contextual declaration, discovery, operations,
retired declarations or scope, so the affected declarations are assessed
again. See [update class](../reference/inspection.md#report-and-inspection-identity).
An update also removes installed content that leaves the selection, unless it
was edited or lies within contextual scope: that content stays in place as the
project's own.
