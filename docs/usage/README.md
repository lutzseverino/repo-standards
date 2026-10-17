# Usage

Repository Standards gives maintainers a CLI and agent skills to publish and
apply versioned repository conventions.

Start with `adopt` to apply a standards source: a repository's published
conventions. Ask your agent to run the command below with its public GitHub URL,
or run it yourself in a terminal. It installs and pins the CLI it ran without
a manual external installation.

```sh
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

A profile selects a complete set of conventions. Adoption installs shared files and skills, adapts project
documentation, and runs the publisher's checks and setup commands. Inspection
previews that work, and an update applies a new selection to an already
configured repository. Source discovery finds publishers without applying their
conventions. Installed rules state the requirements files must keep satisfying;
an assessment records an agent's judgment that project-specific work meets them.

- [Adoption](adoption.md): `adopt` in a terminal or with an agent's answers
  file, remote setup deferral, updates, and the lower-level adoption run reference.
- [Installation](installation.md): prerequisites, adoption without a manual
  install, optional CLI tools, the adoption and authoring skills, and fresh-checkout restoration.
- [Authoring](authoring.md): validating and publishing a standards source,
  and where the `author-standards` skill and author contracts fit.
- [Source discovery](discovery.md): searching the public `repo-standards` topic
  for standards sources without selecting or adopting them.
- [Inspection](inspection.md): the read-only bootstrap and inspection, its
  report and identity, update inspection, summaries, and discovery scope.
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
