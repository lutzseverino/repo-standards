<div align="center">
  <h1>Repository Standards</h1>
  <p>A CLI and agent skills for publishing and applying versioned repository standards.</p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=node.js&logoColor=white" alt="Node.js 24">
  </p>
</div>

## Installation

On macOS or Linux, use Node.js 24, npm, and Git 2.32 or newer:

```sh
npm install --global --ignore-scripts @lutzseverino/repo-standards
repo-standards --version
```

See [installation](docs/usage/installation.md) for the standalone bootstrap,
authoring skill, and fresh-checkout restoration.

## Features

- Validate independently authored standards and complete profiles.
- Inspect published GitHub versions, exact replacements, and contextual scope.
- Adopt through confirmed operations and agent assessments, retaining evidence.
- Update any pin, the source, or the profile in one confirmed run.
- Report available updates and render inspections and runs as Markdown summaries.
- Run the adopted checks on demand against the working tree.
- Discover sources by topic without automatically selecting or adopting them.

## Usage

Validate a local standards source:

```sh
repo-standards source validate /path/to/standards-repository --json
```

Authors publish complete profiles in separate standards repositories. Adopting
projects select one profile and inspect it before confirming exact installation,
contextual work, and trusted checks and fixes. Read [authoring](docs/usage/authoring.md)
and [adoption](docs/usage/adoption.md) for these distinct workflows, the
[author format](docs/usage/author-format.md) for the source format, and the
[architecture contracts](docs/development/architecture.md) for the product's
behavior.

## Documentation

[Documentation](docs/README.md)

## Contributing

[Contribution guidelines](CONTRIBUTING.md)

## License

[MIT License](LICENSE)
