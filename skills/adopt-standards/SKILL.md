---
name: adopt-standards
description: Inspect pinned Repository Standards and guide a maintainer through confirmed exact-content adoption.
disable-model-invocation: true
---

Use the adopting project's `.repo-standards/runtime/node_modules/.bin/repo-standards`
from the project root. If dependencies are absent, restore them with
`npm ci --ignore-scripts --prefix .repo-standards/runtime`.

1. Run `status --json` to read the pins and historical adoption evidence. Run
   `inspect --json` to inspect retained standards and current project content.
2. For initial adoption in a new project, use the externally installed exact CLI
   version to run `inspect --source <public GitHub URL> --standards-version <tag>
   --profile <name> --json`. Present the disclosed CLI and source pins, exact
   replacements, matching-file claims, skill inventories, exclusions, and blockers.
3. Obtain explicit maintainer confirmation of that inspection. Only then run
   the same exact CLI and selection with `start` and `--confirm <identity>`.
   A stale inspection requires a new inspection and new confirmation.
4. Read the result. Report completion only when `outcome` is `complete`.
   Otherwise report the phase, reason, actual changes, completed or uncertain
   work, and the safe next action returned by the CLI. Preserve partial work.
5. On completion, show the uncommitted changes for review through the project's
   normal workflow. `status` records historical evidence for that run; it does
   not certify ongoing compliance after edits.

This CLI slice supports initial exact files and whole author skills. Requests
with contextual guidance, fixes, or checks are rejected before mutation.
Existing selections remain inspectable from retained inputs. Updates, contextual
execution, script execution, and interrupted-run retry require later slices.
