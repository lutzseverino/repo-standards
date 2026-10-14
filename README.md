<div align="center">
  <h1>Repository Standards</h1>
  <p>A CLI and agent skills for maintainers who publish and apply versioned repository standards.</p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=node.js&logoColor=white" alt="Node.js 24">
  </p>
</div>

A standards source is a repository's published, versioned conventions. A
profile selects a complete set of those conventions. Adoption applies that set:
it installs shared files and skills, adapts project documentation, and runs the
publisher's checks and setup commands. An inspection previews those changes;
an update applies a new selection to an already configured repository. Rules
are the installed requirements that files must keep satisfying.

## Installation

On macOS or Linux, use Node.js 24, npm, and Git 2.32 or newer. From your
committed, clean Git working tree, ask your agent to run this command with your
standards source's public GitHub URL, or run it yourself:

```sh
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

At a terminal, `adopt` asks questions and guides your edits. For an agent, it
prints an answers-file template and next steps. It installs and pins the CLI
it ran; no manual CLI installation is needed. See
[adoption](docs/usage/adoption.md) for both paths and
[installation](docs/usage/installation.md) for prerequisites and other tools.

## Features

- Validate independently authored standards and complete profiles.
- Inspect published GitHub versions, exact replacements, and contextual scope.
- Adopt through disclosed operations and agent assessments, retaining evidence.
- Update any pin, the source, or the profile in one run, confirmed only when it discards edits.
- Report available updates and render inspections and runs as Markdown summaries.
- Run the adopted checks on demand against the working tree.
- Install each declaration's rules and print the rules that cover a path.
- Discover sources by topic without automatically selecting or adopting them.

## Usage

Update an adopted project with the same command, omitting the source:

```sh
npx @lutzseverino/repo-standards adopt
```

Choose a version and profile, review the proposed changes, and follow the
prompts or your agent's questions. Setup that changes your hosting platform's
settings can be deferred while adoption completes locally. Authors publish complete profiles in separate standards
repositories; read [authoring](docs/usage/authoring.md) for that workflow, the
[author format](docs/usage/author-format.md) for the source format, and the
[architecture contracts](docs/development/architecture.md) for the product's
behavior.

## Documentation

[Documentation](docs/README.md)

## Contributing

[Contribution guidelines](CONTRIBUTING.md)

## License

[MIT License](LICENSE)
