---
name: adopt-standards
description: Inspect pinned Repository Standards and guide a maintainer through confirmed adoption, contextual work, and evidence submission.
disable-model-invocation: true
---

Use the adopting project's `.repo-standards/runtime/node_modules/.bin/repo-standards`
from the project root. If dependencies are absent, restore them with
`npm ci --ignore-scripts --prefix .repo-standards/runtime`.

1. Run `status --json` to read the pins and historical adoption evidence. Run
   `inspect --json` after complete adoption to inspect retained standards and
   current project content. For an incomplete or interrupted run, read the recovery
   commands in `.repo-standards/runtime/node_modules/@lutzseverino/repo-standards/docs/adoption.md`.
   Present actual changes, confirmed progress, uncertain operations, and the safe
   next action. Wait while `execution` is active. On the maintainer's explicit
   retry instruction use `resume --retry --json`; on an abandonment instruction
   use `abandon --json` and report the preserved work and archived report.
   If installation left the project-local CLI unusable, use the externally
   installed exact version recorded in the run. After retry returns a contextual
   request, continue at step 4 with renewed evidence. For an ordinary contextual
   handoff, continue at step 4 without retrying fixes.
2. For initial adoption in a new project, use the externally installed exact CLI
   version to run `inspect --source <public GitHub URL> --standards-version <tag>
   --profile <name> --json`. Present the disclosed CLI and source pins, exact
   replacements, matching-file claims, skill inventories, exclusions, guidance,
   declared fixes and checks, literal invocations, prerequisite probes, and blockers.
   Explain that these operations are trusted code with host access.
3. Obtain explicit maintainer confirmation of that inspection. Only then run
   the same exact CLI and selection with `start` and `--confirm <identity>`.
   A stale inspection requires a new inspection and new confirmation.
4. When the run returns `workRequest`, read the assessment protocol at
   `.repo-standards/runtime/node_modules/@lutzseverino/repo-standards/docs/assessment-protocol.md`.
   Apply each declaration's guidance to the actual project within its explicit
   allowed paths and directory trees. Preserve exact and excluded content.
   After edits, run `resume --json` to refresh the snapshot. Assess every
   contextual declaration as satisfied or blocked with an explanation, all
   observed changed paths since fixes, and supporting evidence. Store the JSON
   outside the project or under `.repo-standards/local/` and submit
   `resume --assessment <file> --json`. A stale assessment requires a refreshed
   request and renewed evidence. Report blockers and preserve partial work.
5. Read the result. Report completion only when `outcome` is `complete`.
   Otherwise report the phase, reason, actual changes, completed or uncertain
   work, and the safe next action returned by the CLI. Preserve partial work.
6. On completion, show the uncommitted changes for review through the project's
   normal workflow. `status` records historical evidence for that run; it does
   not certify ongoing compliance after edits.

Existing selections remain inspectable from retained inputs. Updates require a
later slice. Abandonment preserves incomplete work and never asserts completion.
