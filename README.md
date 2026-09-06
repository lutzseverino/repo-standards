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
identity without changing the project or running author code. Publication,
discovery, and adoption remain future implementation tickets. The package has
not been published to npm.

- [Architecture and acceptance criteria](docs/architecture.md)
- [Author format and CLI diagnostics](docs/author-format.md)
- [Bootstrap and public inspection](docs/inspection.md)
- [Domain language](CONTEXT.md)
- [Implementation work](https://github.com/lutzseverino/repo-standards/issues)
- [Contributing](CONTRIBUTING.md)

## Planned distribution

- npm package: `@lutzseverino/repo-standards`
- CLI executable: `repo-standards`
- Initial environments: macOS and Linux with Node.js 24 and npm
- Product implementation: TypeScript, ESM, and pnpm

The maintainer's personal standards are a separate future standards repository.

## Try source validation

With Node.js 24 and the pnpm version in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm validate
pnpm pack
npm install --global ./lutzseverino-repo-standards-1.0.0.tgz --ignore-scripts
repo-standards source validate ./examples/alice
repo-standards source validate ./examples/alice --json
```

An omitted directory uses the current directory. Validation needs neither a
clean working tree nor installed author prerequisites. The JSON result includes
the normalized resolved selection for every profile, or structured errors.

## License

[MIT](LICENSE)
