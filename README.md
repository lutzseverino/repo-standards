<div align="center">
  <h1>Repository Standards</h1>
  <p>Publish and apply versioned repository standards through a CLI and agent-guided workflows.</p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=node.js&logoColor=white" alt="Node.js 24">
  </p>
</div>

## Installation

On macOS or Linux, use Node.js 24 and npm:

```sh
npm install --global --ignore-scripts @lutzseverino/repo-standards@1.3.0
repo-standards --version
```

See [installation](docs/usage/installation.md) for the standalone bootstrap,
authoring skill, and fresh-checkout restoration.

## Features

- Validate independently authored standards and complete profiles.
- Inspect published GitHub versions, exact replacements, and contextual scope.
- Adopt through confirmed operations and agent assessments, retaining evidence.
- Deliberately update standards or CLI pins, or re-adopt unchanged standards.
- Discover sources by topic without automatically selecting or adopting them.

## Usage

Validate a local standards source:

```sh
repo-standards source validate /path/to/standards-repository --json
```

Authors publish complete profiles in separate standards repositories. Adopting
projects select one profile and inspect it before confirming exact installation,
contextual work, and trusted checks and fixes. Read [authoring](docs/usage/authoring.md)
and [adoption](docs/usage/adoption.md) for these distinct workflows.

## Documentation

Start with the [documentation map](docs/README.md), [author format](docs/usage/author-format.md),
and [architecture contracts](docs/development/architecture.md). Product release
acceptance is recorded in the [release evidence](https://github.com/lutzseverino/repo-standards/tree/main/acceptance/results).
Repo Canon supplies this repository's contribution and agent conventions as a
separate standards source; the product remains neutral for independently
authored standards.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [development guide](docs/development/README.md).
Work is tracked in [GitHub Issues](https://github.com/lutzseverino/repo-standards/issues).

## License

[MIT License](LICENSE)
