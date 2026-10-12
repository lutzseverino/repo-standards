---
name: babysit
description: Babysit an opened pull request through checks and review until it merges. Use right after opening a pull request, or when asked to babysit or land one.
---

Take the pull request to its merge. `CONTRIBUTING.md` holds the merge
conditions and the wording rules.

1. Wait with `node <this skill's directory>/wait.mjs <number>`, run in the
   foreground until it exits; it waits for the checks and Codex's review of the
   head, silently. On Claude Code, set the command timeout to 600000 ms. On
   Codex, ask for the longest wait each time the command yields. The exit code
   says what comes next:
   - `0`: checks passed and Codex reviewed; go to step 2.
   - `2`: the listed checks failed; go to step 2.
   - `3` or `4`: checks passed and Codex did not review this head (`3`
     unavailable, `4` for the reason its line gives); go to step 2 and follow
     `CONTRIBUTING.md` for merging without that review.
   - `5`: still waiting; run it again.
   - `1`: fix the invocation or `gh` access and run it again.

2. Verify each failing check and review finding against the source.
3. Fix the real findings `CONTRIBUTING.md` does not let you decline, and answer
   every review thread as it requires.
4. When pushed fixes change enough to warrant another look, comment
   `@codex review` to re-request review of the new head. After any push or
   re-request, return to step 1.
5. Once the merge conditions hold on the latest head, squash-merge with
   `gh pr merge <number> --squash --match-head-commit <SHA>`, where `<SHA>` is
   the full SHA that starts the wait's latest line. If GitHub refuses because
   the head no longer matches, return to step 1.
6. Stop.
