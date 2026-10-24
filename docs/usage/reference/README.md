# Reference

This reference holds the exact contracts of Repo Standards: the formats, protocols, commands and reports that agents and authors rely on.

- [Adoption run](adoption-run.md): the `adopt` command, its answers file and
  results, inspect and start, confirmation, remote setup, updates, skill links,
  durable state, completion, status, and recovery.
- [Inspection](inspection.md): the read-only bootstrap and inspection, its
  report and identity, update inspection, summaries, and discovery scope.
- [Author format](author-format.md): the `repo-standards/v2` source format,
  its declarations, profiles, checks and fixes, and validation errors.
- [Script protocol](script-protocol.md): how trusted checks, fixes and
  discovery scripts run, report results, and are observed.
- [Assessment protocol](assessment-protocol.md): contextual work requests,
  agent assessment submissions, and discovery scope reviews.
- [Available updates report](available-updates.md): the read-only `outdated`
  report of newer CLI and standards versions, its cache, and the release
  policy.
- [Check](check.md): what `check` runs, its report, how it detects checks that
  write, and its failures.
- [Installed rules](rules.md): the rules adoption installs, their index, the
  `rules` lookup by path, and how failed checks cite them.
- [GitHub requests and tokens](github-requests.md): the GitHub requests the
  CLI makes, their quota, and how a token authenticates them.
