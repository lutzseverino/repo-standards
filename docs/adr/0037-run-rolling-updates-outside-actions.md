# Run rolling updates outside Actions

Amends [ADR 0026](0026-propose-updates-through-one-rolling-pull-request.md)'s
composite-only publication decision. Repositories at `runner` or
`self-reported` check locations need the same rolling update without GitHub
Actions. Following the owner's 2026-11-20 acceptance recorded in
[#538](https://github.com/lutzseverino/repo-standards/issues/538), publish
`repo-standards-update` as a separate executable of the package, compiled from
the same source that the composite action runs unbuilt from its pinned Git
tree. Keeping one implementation preserves rolling-item, headless-update and
token behavior across both entry points; it avoids TypeScript stripping under
`node_modules` and preserves the action's inputs.

A standards source owns its optional `update-command`, one nonempty line of
plain text retained with the installed release's metadata. `outdated` is the
single interface for the update notice: at `runner` or `self-reported` it
reports that command as optional `standards.updateCommand` and one Markdown
line. Missing, unreadable or invalid metadata yields no command. The public
report rises to `outdated/v3`, while the cache stays `outdated-cache/v2` because
the command needs no lookup. Older CLIs reject the additive source field, so
a source using it raises its minimum CLI version.

The executable takes a repository, clean dedicated default-branch checkout and
token; invocation requests one run. Scheduling stays with the adopter.
[ADR 0014](0014-leave-available-updates-to-the-maintainer.md) still governs the
notice: it only reports the command and starts nothing without the maintainer's
instruction. The shared update implementation alone commits on its rolling
branch; the CLI still makes no commit, push, branch, pull request or issue.

## Considered options

- Keep the update available only as a composite action: repositories without
  Actions cannot propose the same updates.
- Duplicate the update procedure in an off-Actions script: the two entry points
  would acquire separate behavior and token handling.
- Put platform writes in the CLI: this would break its no-commit contract for
  every caller to serve one opt-in update flow.
- Read source metadata directly in the notice skill: this would expose product
  state layout instead of keeping `outdated` as the notice's interface.
