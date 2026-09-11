# Repository Standards

Publish and apply versioned repository standards through deterministic tooling
and agent-guided workflows.

Repository Standards is a neutral product for independently authored standards.
An author publishes complete profiles in a standards repository. An adopting
project selects one profile and uses the shared CLI and adoption skill to
install exact content, apply contextual guidance, and collect check evidence.

## Project status

Local source validation, pinned public GitHub inspection, and a standalone
bootstrap are implemented through distributable artifacts. Inspection reports
content, guidance, operations, prerequisites, conflicts, and an inspection
identity without changing the project or running author code. Confirmed initial
adoption installs exact content and a pinned runtime, preflights prerequisites,
and runs trusted fixes and checks with durable evidence. Contextual profiles
return explicit agent work after fixes and resume through snapshot-bound
assessments before checks and completion. Interrupted runs support explicit retry
or abandonment with preserved work and reports. Standards revisions and exact CLI
versions update independently through the same inspected, confirmed adoption
procedure. The packaged system skill guides confirmation, project-specific
contextual work and public assessment submission. Topic-based source search
validates stable release candidates without selecting or adopting them; the
author workflow covers ordinary GitHub publication.
Public publication and release completion are tracked separately in
[release evidence](acceptance/results/). Publication alone does not establish
that every release acceptance criterion has passed.

- [Architecture and acceptance criteria](docs/architecture.md)
- [Public installation and restoration](docs/installation.md)
- [Release procedure](docs/release.md)
- [Author workflow and publication](docs/authoring.md)
- [Standalone authoring skill candidate](docs/installation.md#install-the-authoring-skill-candidate)
- [Source discovery](docs/discovery.md)
- [Author format and CLI diagnostics](docs/author-format.md)
- [Bootstrap and public inspection](docs/inspection.md)
- [Confirmed adoption and durable state](docs/adoption.md)
- [Trusted script protocol](docs/script-protocol.md)
- [Contextual work and assessment protocol](docs/assessment-protocol.md)
- [Real-agent acceptance](acceptance/README.md)
- [Domain language](CONTEXT.md)
- [Implementation work](https://github.com/lutzseverino/repo-standards/issues)
- [Contributing](CONTRIBUTING.md)

## Distribution

- npm package: `@lutzseverino/repo-standards`
- CLI executable: `repo-standards`
- Initial environments: macOS and Linux with Node.js 24 and npm
- Product implementation: TypeScript, ESM, and pnpm

The maintainer's personal standards are a separate future standards repository.

## Install the published CLI

Once the release version is available on public npm, use Node.js 24 and npm;
no product checkout or pnpm is needed:

```sh
npm install --global --ignore-scripts @lutzseverino/repo-standards@1.0.0
repo-standards --version
repo-standards source validate /path/to/standards-repository --json
```

An omitted directory uses the current directory. Validation needs neither a
clean working tree nor installed author prerequisites. The JSON result includes
the normalized resolved selection for every profile, or structured errors.
See [public installation](docs/installation.md) for the standalone bootstrap,
initial adoption and fresh-checkout restoration, or [contributing](CONTRIBUTING.md)
for product development.

## License

[MIT](LICENSE)
