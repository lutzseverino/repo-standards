# Repository Standards

Publish and apply versioned repository standards through deterministic tooling
and agent-guided workflows.

Repository Standards is a neutral product for independently authored standards.
An author publishes complete profiles in a standards repository. An adopting
project selects one profile and uses the shared CLI and adoption skill to
install exact content, apply contextual guidance, and collect check evidence.

## Project status

The version-one architecture is agreed. This repository contains the product
design and implementation specification; the CLI is not implemented or released.

- [Architecture and acceptance criteria](docs/architecture.md)
- [Domain language](CONTEXT.md)
- [Implementation work](https://github.com/lutzseverino/repo-standards/issues)
- [Contributing](CONTRIBUTING.md)

## Planned distribution

- npm package: `@lutzseverino/repo-standards`
- CLI executable: `repo-standards`
- Initial environments: macOS and Linux with Node.js 24 and npm
- Product implementation: TypeScript, ESM, and pnpm

The maintainer's personal standards are a separate future standards repository.

## License

[MIT](LICENSE)
