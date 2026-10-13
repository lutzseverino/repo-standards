---
name: babysit
description: Babysit an opened pull request through checks and review until it merges. Use right after opening a pull request, or when asked to babysit or land one.
---

Take the pull request to its merge. `CONTRIBUTING.md` holds the merge
conditions and the wording rules.

1. Wait with `node <this skill's directory>/wait.mjs <number>`, run in the
   repository root in the foreground until it exits; it waits for the checks
   and the configured reviewer's review of the head, silently. Use a command
   timeout of 600000 ms where supported, and ask for the longest wait each
   time the command yields. The exit code
   says what comes next. Here, "checks passed" also covers no check arriving
   within 5 minutes of a push GitHub recorded, with no unfinished or failed
   workflow run for the head:
   - `0`: checks passed and the configured reviewer reviewed, or no reviewer is configured; go to step 2.
   - `2`: the listed checks failed; go to step 2.
   - `3` or `4`: checks passed and the configured reviewer did not review this head (`3`
     unavailable, `4` for the reason its line gives); go to step 2 and follow
     `CONTRIBUTING.md` for merging without that review.
   - `5`: still waiting; run it again.
   - `1`: follow [Credentials](../../../CONTRIBUTING.md#credentials) for a
     permission refusal; otherwise fix the invocation or other `gh` error and
     run it again.

2. Verify each failing check and review finding against the source.
3. Fix the real findings `CONTRIBUTING.md` does not let you decline, and answer
   every review thread as it requires, following its
   [comment rules](../../../CONTRIBUTING.md#comments).
4. When pushed fixes change enough to warrant another look, comment
   to re-request review of the new head when a reviewer is configured, using
   its `request.comment` and following the
   [comment rules](../../../CONTRIBUTING.md#comments). After any push or
   re-request, return to step 1.
5. Once the merge conditions hold on the latest head, run
   `node <this skill's directory>/merge.mjs <number> <SHA>`, where `<SHA>` is
   the full SHA that starts the wait's latest line. Exit `0` means merged;
   `2` means the head changed, so return to step 1; `1` means follow
   [Credentials](../../../CONTRIBUTING.md#credentials) for a permission refusal;
   otherwise fix the invocation or other `gh` error and
   run it again.
6. Stop.

## Reviewer configuration

The optional repository-owned `.github/pull-request-reviewer.json` is data
only. Repo Canon installs no file or preset; its check validates the file when
present. The factory does not read it. Without the file, the wait reports only
checks.

Every field below is required except `finished`. Unknown fields are invalid.

- `version`: `1`.
- `account`: the reviewer's nonempty GitHub login, including `[bot]` when part
  of the login.
- `request.comment`: a nonempty, trimmed string. A request comment's whole
  trimmed body must equal it; a mention within other text never counts.
- `request.onOpen`: boolean; whether opening the pull request counts as a
  request. A push never counts.
- `finished`: optional object with a nonempty `commentMarker` and a `line`
  regular expression, interpreted with the Unicode flag and named `sha` and
  `at` groups. A matching line in a comment by `account` containing the marker
  completes a review when `sha` prefixes the head and `at` parses as a time at
  or after the latest request. A GitHub review by `account` on the exact head
  also completes a review, even without `finished`, when it approves or
  requests changes, has a nonempty body, or has an inline comment that starts
  a new thread. A pending review never completes one. A `COMMENTED` review
  with an empty body and only replies to existing threads never completes one.
- `unavailable`: array of nonempty reply texts; an empty array is valid. A
  comment by `account` at or after the request containing one of these texts
  marks the reviewer unavailable. Any comment by `account` after the
  request counts as a response.
- `bounds.responseMinutes` and `bounds.reviewMinutes`: positive finite numbers
  measured from the latest request.

For example, a repository that uses Codex can configure:

```json
{
  "version": 1,
  "account": "chatgpt-codex-connector[bot]",
  "request": {
    "comment": "@codex review",
    "onOpen": true
  },
  "finished": {
    "commentMarker": "<!-- codex-pull-request-review-summary -->",
    "line": "\\bCompleted\\b.*datetime=\"(?<at>[^\"]+)\".*`(?<sha>[0-9a-f]{7,40})`"
  },
  "unavailable": [
    "create an environment for this repo",
    "create a Codex account"
  ],
  "bounds": {
    "responseMinutes": 5,
    "reviewMinutes": 30
  }
}
```
