<div align="center">
  <h1>Repository Standards</h1>
  <p>A CLI and agent skills for maintainers who publish and apply versioned repository standards.</p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=node.js&logoColor=white" alt="Node.js 24">
  </p>
</div>

Repository Standards gives a repository a maintainer's shared conventions in
one command: contribution and agent instructions, skills, templates, and checks
that keep files in line, taken from a published, versioned set.
[Repo Canon](https://github.com/lutzseverino/repo-canon) is a ready-made set of
conventions to start from.

A standards source is a repository's published, versioned conventions; Repo
Canon is one. A profile selects a complete set of those conventions. Adoption
applies that set: it installs shared files and skills, adapts project
documentation, and runs the publisher's checks and setup commands. An
inspection previews those changes; an update applies a new selection to an
already configured repository. Rules are the installed requirements that files
must keep satisfying.

## Installation

On macOS or Linux, use Node.js 24, npm, and Git 2.32 or newer. To adopt Repo
Canon, give your coding agent this prompt in your repository:

```text
Adopt Repo Canon in this repository. First check that the Git working tree is
clean and committed; if it isn't, stop and tell me. Then run
`npx @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon`
and follow the next steps it prints. Ask me each question it raises instead of
answering for me, and leave its changes uncommitted for me to review.
```

To run it yourself, use the same command in a terminal, from your committed,
clean Git working tree:

```sh
npx @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon
```

At a terminal, `adopt` asks questions and guides your edits. For an agent, it
prints an answers-file template and next steps. It installs and pins the CLI
it ran; no manual CLI installation is needed. See
[adoption](docs/usage/adoption.md) for both paths and
[installation](docs/usage/installation.md) for prerequisites and other tools.

## Author your own standards source

To publish your own conventions instead, author them in a separate standards
repository: read [authoring](docs/usage/authoring.md) for that workflow and the
[author format](docs/usage/author-format.md) for the source format. Adopt a
published source with the same command and its public GitHub URL in place of
Repo Canon's.

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
settings can be deferred while adoption completes locally. The
[architecture contracts](docs/development/architecture.md) describe the
product's behavior.

## Documentation

[Documentation](docs/README.md)

## Contributing

[Contribution guidelines](CONTRIBUTING.md)

## License

[MIT License](LICENSE)
