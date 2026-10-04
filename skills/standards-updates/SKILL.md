---
name: standards-updates
description: Report available Repository Standards updates in an adopting project. Use at the start of work in a project with a .repo-standards/selection.yaml, or when asked whether its CLI or standards pins are out of date.
disable-model-invocation: false
---

This skill reports available updates. It never starts one: an update starts
only on the maintainer's instruction.

## Read the pins

Work from the adopting project's Git root and run its pinned CLI:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards outdated --json
```

`outdated` is read-only apart from its ignored cache and needs no clean working
tree. Reinstall the pinned runtime once, then run `outdated --json` again, when:

- the executable is missing: run
  `npm ci --ignore-scripts --prefix .repo-standards/runtime`;
- `outdated` fails with `CLI_PIN_MISMATCH` and its message names a reinstall
  command: run that command from the project root it names.

If the second run fails too, or the message names no reinstall command, report
both pins as `unknown` with the diagnostic, and continue.

## Report

For each pin, `cli` and `standards`:

- `update: available`: report the pinned version and `newest`. Report the
  update class, exact or contextual, only when an inspection of that update has
  already reported its `updateClass`; otherwise say that an inspection
  establishes it.
- `update: unknown`: report `unknown` with the reason's code and message. A
  failed lookup is not an error and never stops the current work.
- `update: none`: report that the pin is current, or omit it.

## After reporting

Without the maintainer's instruction, mention the available updates and
continue the current work as planned. Don't inspect or start an update.

When the maintainer asks for an update, carry it through `adopt-standards` as a
change separate from the current work, never mixed with the current work's
changes. `adopt-standards` is manual only: on that instruction, follow
`.agents/skills/adopt-standards/SKILL.md`, which inspects the update, obtains
confirmation and starts the run from a clean working tree.
