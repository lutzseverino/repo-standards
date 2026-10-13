# Usage

Repository Standards gives maintainers a CLI and agent skills to publish and
apply versioned repository conventions.

A standards source is a repository's published conventions; a profile
selects a complete set. Adoption installs shared files and skills, adapts project
documentation, and runs the publisher's checks and setup commands. Inspection
previews that work, and an update applies a new selection to an already
configured repository. Source discovery finds publishers without applying their
conventions. Installed rules state the requirements files must keep satisfying;
an assessment records an agent's judgment that project-specific work meets them.

- [Installation](installation.md): public npm installation, the standalone
  bootstrap, the authoring skill, and fresh-checkout restoration.
- [Authoring](authoring.md): validating and publishing a standards source,
  and where the `author-standards` skill and author contracts fit.
- [Source discovery](discovery.md): searching the public `repo-standards` topic
  for standards sources without selecting or adopting them.
- [Inspection](inspection.md): the read-only bootstrap and inspection, its
  report and identity, update inspection, summaries, and discovery scope.
- [Adoption](adoption.md): adoption and updates with `adopt` and its answers
  file, confirmation-required changes, durable and local state, completion,
  status summaries, recovery commands, and fresh adoption.
- [Available updates](available-updates.md): the read-only `outdated` report
  of newer CLI and standards versions and its cache.
- [Adopted checks](check.md): running the adopted checks on demand with
  `check`, its report, and how it detects checks that write.
- [Installed rules](rules.md): the rules adoption installs, their index, the
  `rules` lookup by path, and how failed checks cite them.
- [Author format](author-format.md): the `repo-standards/v2` source format,
  its declarations, profiles, checks and fixes, and validation errors.
- [Script protocol](script-protocol.md): how trusted checks, fixes and
  discovery scripts run, report results, and are observed.
- [Assessment protocol](assessment-protocol.md): contextual work requests,
  agent assessment submissions, and discovery scope reviews.
