---
name: babysit
description: Babysit an opened pull request through checks and review until it merges. Use right after opening a pull request, or when asked to babysit or land one.
---

Take the pull request to its merge. `CONTRIBUTING.md` holds the merge
conditions and the wording rules.

1. Watch the pull request until every check finishes and each requested review
   arrives. Use the host's watch tool; without one, run
   `gh pr checks <number> --watch`, then poll for reviews.
2. Verify each failing check and review finding against the source.
3. Fix the real findings `CONTRIBUTING.md` does not let you decline, and answer
   every review thread as it requires.
4. When pushed fixes change enough to warrant another look, comment
   `@codex review` to re-request review of the new head. After any push, return
   to step 1.
5. Squash-merge once the merge conditions hold on the latest head.
6. Stop.
