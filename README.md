<div align="center">
  <h1>Repository Standards</h1>
  <p>A CLI and agent skills for maintainers who publish and apply versioned repository standards.</p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Node.js-24%20%7C%2026-5FA04E?logo=node.js&logoColor=white" alt="Node.js 24 or 26">
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

On macOS or Linux, use stable Node.js 24 or 26 with its bundled npm, and Git
2.32 or newer. Node.js 22, odd majors, prereleases and future majors are excluded.
To adopt Repo Canon, give your coding agent this prompt in your repository:

```text
Run `npx --yes @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon --json` in this repository and follow what it prints.
```

Or [install the adoption skill from a verified release tag](docs/usage/guides/install.md#install-the-adoption-skill).

To run it yourself, run `adopt` in a terminal, from your committed,
clean Git working tree:

```sh
npx @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon
```

At a terminal, `adopt` asks questions and guides your edits. For an agent, it
starts the run when nothing is open, and otherwise prints an answers-file
template and next steps. It installs and pins the CLI
it ran; no manual CLI installation is needed. See
[adoption](docs/usage/guides/adopt.md) for both paths and
[installation](docs/usage/guides/install.md) for prerequisites and other tools.

## Author your own standards source

To publish your own conventions instead, author them in a separate standards
repository: read [authoring](docs/usage/guides/author-a-source.md) for that workflow and the
[author format](docs/usage/reference/author-format.md) for the source format. Adopt a
published source with the same command and its public GitHub URL in place of
Repo Canon's.

## Features

- Validate independently authored standards and complete profiles.
- Inspect published GitHub versions, exact replacements, and contextual scope.
- Adopt through disclosed operations and agent assessments, retaining evidence.
- Update any pin, the source, or the profile in one run, reviewing discarded edits from Git.
- Report available updates and render inspections and runs as Markdown summaries.
- Propose every available update as one rolling pull request through the opt-in [update action](docs/usage/guides/automated-updates.md).
- Run the adopted checks on demand against the working tree.
- Install each declaration's rules and print the rules that cover a path.
- Discover sources by topic without automatically selecting or adopting them.

## Usage

Update an adopted project with the same command, omitting the source:

```sh
npx @lutzseverino/repo-standards adopt
```

Choose a version and profile, review the proposed changes, and follow the
prompts or the agent's decisions. Setup that changes your hosting platform's
settings can be deferred while adoption completes locally. The
[architecture contracts](docs/development/architecture.md) describe the
product's behavior.

Releases are frequent and carry no stability promise. Every release must update
from the previous one in one `adopt`, without hand edits; published acceptance
verifies that path. Check `outdated` to stay current, or opt in to automated
update pull requests. See the [release policy](docs/usage/reference/available-updates.md#release-policy).

## Documentation

[Documentation](docs/README.md)

## Contributing

[Contribution guidelines](CONTRIBUTING.md)

## License

[MIT License](LICENSE)
