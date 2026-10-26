# Install the CLI and skills

Adopting needs no installation: `adopt` installs and pins its own CLI, as
[Adopt a standards source](adopt.md) describes. Install the CLI yourself for
authoring commands or the lower-level inspection and adoption run interface,
and install a skill to start adoption or authoring from your coding agent.

Each version's [GitHub release](https://github.com/lutzseverino/repo-standards/releases)
carries its release notes, and its assets carry the publication identities. The
CLI installation commands below require the named version to have been published
to public npm; a release bundle alone is not publication. Standalone skill
installation uses a public Git release tag independently of npm publication.

Use macOS or Linux with Node.js 24 or 26, npm, and Git 2.32 or newer on `PATH`. Install Node.js 24 or 26
from <https://nodejs.org/en/download> or select it with your version manager.
Author operations may require additional executables and versions; inspection
discloses these, and start checks them before changing the project.

Only stable 24.x and 26.x are supported, with their bundled npm. Node.js 22
is outside the support policy; odd majors, prereleases and future majors are
also excluded. Windows, private sources, SSH and Git hosts other than public
GitHub are unsupported. Trusted author scripts have normal host and network
access; `--ignore-scripts` disables npm lifecycle scripts, not disclosed author
operations.

## Install outside your project

For authoring commands or the lower-level inspection and adoption run
interface, you can install the CLI separately:

```sh
npm install --global --ignore-scripts --registry=https://registry.npmjs.org \
  @lutzseverino/repo-standards@10.0.0
repo-standards --version
repo-standards source validate /path/to/your/standards-repository --json
repo-standards source search --json
```

This installs both `repo-standards` and `repo-standards-bootstrap`. If your global
prefix is not writable, use the external directory installation in
[inspection](../reference/inspection.md#keep-the-disclosed-cli-for-start-and-recovery).
Do not add the CLI to your adopting project's dependency manifest.

Alternatively download the standalone bootstrap from the matching GitHub release:

```sh
mkdir -p "$HOME/.local/bin"
curl --fail --location \
  https://github.com/lutzseverino/repo-standards/releases/download/v10.0.0/repo-standards-bootstrap \
  --output "$HOME/.local/bin/repo-standards-bootstrap"
chmod 755 "$HOME/.local/bin/repo-standards-bootstrap"
```

The release also includes `SHA256SUMS` and `release.json` identifying its package
and bootstrap bytes. The bootstrap requires only Node.js 24 or 26 and npm to obtain
the CLI. From a committed adopting project, inspect the public learning source:

```sh
repo-standards-bootstrap --cli-version 10.0.0 inspect \
  --source https://github.com/lutzseverino/repo-standards-example \
  --standards-version v3.0.0 --profile service --json
```

Use the full bootstrap path if `$HOME/.local/bin` is not on `PATH`. Omit
`--cli-version 10.0.0` to select the greatest published stable version once;
stderr discloses the exact selection. Keep that version for
start. Inspection does not change project content or run author operations;
the only author scripts it runs are read-only
[remote setup](../reference/adoption-run.md#remote-setup) readiness probes.
Discovery is optional and is not an endorsement of any source.

The standards format, including [remote setup](../reference/adoption-run.md#remote-setup), names
no hosting platform: a source's own probes and fixes decide what a platform
needs. Source acquisition is the known blocker to platform independence: it
accepts only public `github.com` sources.

The standalone bootstrap only inspects; to drive [inspection](../reference/inspection.md)
and [inspect and start](../reference/adoption-run.md#inspect-and-start) directly, retain an
external installation of its selected exact CLI for start and recovery.

## Install the adoption skill

The product provides three separate skills: `adopt-repository-standards` starts
adoption in an adopting project, `author-standards` helps publishers author a
standards source, and the project-local `repository-standards` looks up installed
rules and reports updates after adoption. Adoption installs only the last of
these automatically. `repository-standards` replaces `standards-updates`; an
update removes the
old skill and its Claude link when unedited. Edited old copies stay as
project-owned content under the normal retirement policy.

`adopt-repository-standards` is a single-sentence pointer to `adopt`, using the
standards source you name, with Repo Canon as the fallback. The CLI owns all
adopting-agent guidance. The entry command uses `npx --yes` and `adopt --json`
so npm and a terminal cannot start an interactive conversation. The agent
decides what Git can undo and records its decisions in the review handoff;
only an unsettled profile choice or a remote setting overwrite needs your
answer. See [adoption with an agent](adopt.md#with-an-agent).

The first public release containing this skill is **v8.0.0**; that tag contains
`skills/adopt-repository-standards`. The command below selects this release's
matching skill. A tag that predates v8.0.0 cannot install it. Use the same
[skills CLI](https://github.com/vercel-labs/skills) route as for authoring:

```sh
npx skills@1.5.25 add https://github.com/lutzseverino/repo-standards/tree/v10.0.0/skills/adopt-repository-standards \
  --skill adopt-repository-standards --global --agent codex --copy
```

Global installation makes the skill available before and across adopting
projects. Select your supported agent with `--agent`; `codex` is the acceptance
route. Invoke `adopt-repository-standards` by name or ask naturally, for example,
“Set up shared repository conventions in this repository.” The installation
contains only `SKILL.md` and `agents/openai.yaml`, with implicit invocation enabled
in both settings. The macOS or Linux, Node.js 24, npm, and Git prerequisites above
still apply. Installing this skill does not install the CLI or alter a project's
runtime pin; `adopt` manages its own runtime when invoked.

For unreleased development only, replace the public URL with a local directory
containing this skill. That establishes candidate installation, not installation
from a published release.

Direct installation is independent of the
[adoption skill directory page](https://skills.sh/lutzseverino/repo-standards/adopt-repository-standards).
As with the authoring listing below, the [directory FAQ](https://skills.sh/docs/faq)
describes discovery through skills CLI installation telemetry. Observed on
2026-10-26: the page exists, shows the skill as first seen that day, and lists
no install count yet. It appeared after one telemetry-enabled installation from
the release tag above. Record direct release-tag installation separately from a
dated directory observation; listing, indexing time, and ranking are not
release guarantees.

## Install the authoring skill

`author-standards` guides creation, revision, and resumption from confirmed
preferences. It finishes with reviewed, validated local material and authoring
notes; repository provisioning and standards publication are separate work.

Use the conventional [skills CLI](https://github.com/vercel-labs/skills) to
install the skill from the product's public release tag:

```sh
npx skills@1.5.25 add https://github.com/lutzseverino/repo-standards/tree/v10.0.0/skills/author-standards \
  --skill author-standards --global --agent codex --copy
```

The named release must exist before running this command. Global installation is
recommended for authors working before or across repositories. Select your
supported agent with `--agent`; `codex` is the acceptance route. The installation
contains `SKILL.md` and `references/cli.md`, `profiles.md`, `operations.md`, and
`revision.md`. It works independently of a product checkout, adopting project,
or surrounding npm package. Invoke `author-standards` in your agent and describe
how you work. Optional references supply candidates for discussion, not policy.

The bundled `references/cli.md` explains installing the exact compatible npm CLI
`@lutzseverino/repo-standards@10.0.0` in an external directory, then reading that
installation's matching author format and script protocol documents.
Node.js 24 or 26, npm, and registry access are required. Installing the skill does not
install its CLI, change an adopting project's runtime pin, or install authoring
into adopting projects. Adoption continues to manage its matching local
`repository-standards` skill independently.

Direct installation is independent of the
[skills.sh directory](https://skills.sh/lutzseverino/repo-standards/author-standards).
The [directory FAQ](https://skills.sh/docs/faq) describes its discovery process.
Observed on 2026-10-26: the page exists, shows the skill as first seen that day,
and lists no install count yet. It appeared after one telemetry-enabled
installation from the release tag above. Listing, indexing time, and ranking are
third-party observations, not release guarantees. Record dated observations
separately from installation results.

For unreleased development only, replace the public URL with a local directory
containing the skill. That is candidate installation, even if its CLI comes
from public npm. The
[acceptance procedure](https://github.com/lutzseverino/repo-standards/blob/main/acceptance/README.md#published-authoring-installation)
provides isolated installation without changing your real global skills.
