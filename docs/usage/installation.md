# Public installation

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
also excluded.

## Adopt without a manual installation

Optionally, set a GitHub token before you start. Without one, the CLI uses
GitHub's anonymous API quota, which every user and tool on your IP address
shares, so repeated adoption rounds and other users can exhaust it; a token
raises the allowance. The CLI reads `GH_TOKEN`, or `GITHUB_TOKEN` when
`GH_TOKEN` is unset or empty, and sends it only on its GitHub REST requests.
Signing in to `gh` alone does not authenticate them. Public sources need no
credentials; see [GitHub requests and tokens](#github-requests-and-tokens).

```sh
export GH_TOKEN=<token>
```

From a committed, clean Git working tree, ask your agent to run this command
with your standards source's public GitHub URL, or run it yourself:

```sh
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

At a terminal, `adopt` asks questions and walks you through edits and checks.
Without a terminal, it prints an answers-file template and the agent's next
steps. It installs and pins the exact CLI it ran into the project's runtime,
leaving changes uncommitted. No product checkout, TypeScript compiler, pnpm,
or manual external CLI installation is needed. Follow the
[adoption guide](adoption.md) for both paths, remote setup deferral, and updates.

## Install outside your project

For authoring commands or the lower-level inspection and adoption run
interface, you can install the CLI separately:

```sh
npm install --global --ignore-scripts --registry=https://registry.npmjs.org \
  @lutzseverino/repo-standards@7.2.0
repo-standards --version
repo-standards source validate /path/to/your/standards-repository --json
repo-standards source search --json
```

This installs both `repo-standards` and `repo-standards-bootstrap`. If your global
prefix is not writable, use the external directory installation in
[inspection](inspection.md#keep-the-disclosed-cli-for-start-and-recovery).
Do not add the CLI to your adopting project's dependency manifest.

Alternatively download the standalone bootstrap from the matching GitHub release:

```sh
mkdir -p "$HOME/.local/bin"
curl --fail --location \
  https://github.com/lutzseverino/repo-standards/releases/download/v7.2.0/repo-standards-bootstrap \
  --output "$HOME/.local/bin/repo-standards-bootstrap"
chmod 755 "$HOME/.local/bin/repo-standards-bootstrap"
```

The release also includes `SHA256SUMS` and `release.json` identifying its package
and bootstrap bytes. The bootstrap requires only Node.js 24 or 26 and npm to obtain
the CLI. From a committed adopting project, inspect the public learning source:

```sh
repo-standards-bootstrap --cli-version 7.2.0 inspect \
  --source https://github.com/lutzseverino/repo-standards-example \
  --standards-version v2.0.0 --profile service --json
```

Use the full bootstrap path if `$HOME/.local/bin` is not on `PATH`. Omit
`--cli-version 7.2.0` to select the greatest published stable version once;
stderr discloses the exact selection. Keep that version for
start. Inspection does not change project content or run author operations;
the only author scripts it runs are read-only
[remote setup](adoption.md#remote-setup) readiness probes.
Discovery is optional and is not an endorsement of any source.

The standards format, including [remote setup](adoption.md#remote-setup), names
no hosting platform: a source's own probes and fixes decide what a platform
needs. Source acquisition is the known blocker to platform independence: it
accepts only public `github.com` sources.

The standalone bootstrap only inspects; to drive [inspection](inspection.md)
and [inspect and start](adoption.md#inspect-and-start) directly, retain an
external installation of its selected exact CLI for start and recovery.

## GitHub requests and tokens

Public source acquisition uses a bounded set of GitHub REST requests to resolve
the repository, immutable tag, commit and tree, then obtains all source objects
through Git's anonymous smart protocol. The number of REST requests does not grow
with the source's file count. The CLI keeps each verified source outside the
project, in `$XDG_CACHE_HOME/repo-standards/` or `~/.cache/repo-standards/`,
and reuses it only once its bytes match their Git identities. A later command
or answer round then makes two REST requests, resolving the repository and its
tag afresh, and a complete guided adoption with a lightweight tag makes at most
16, plus one per annotated tag object and per additional page of releases.
Deleting the cache only makes the next command acquire the source again.
Every GitHub REST request, including inspection,
start, source search and the `outdated` releases lookup, uses `GH_TOKEN`, or
otherwise `GITHUB_TOKEN`, as bearer authorization when present. Values are
trimmed; empty or whitespace-only values count as absent. A token uses the authenticated API quota instead of the shared
anonymous quota and is never sent on Git object downloads or recorded in output,
retained inputs or caches. Private sources remain unsupported. An exhausted
quota fails inspection, start and search with `QUOTA_EXHAUSTED`, naming the
retry time or delay when available and both token variables, preferring
`retry-after` over `x-ratelimit-reset` when both arrive. Retry after the
reported reset rather than repeatedly restarting a failed command. A rejected
token (HTTP 401) is `SOURCE_UNAVAILABLE`, without anonymous retry. `outdated`
reports either failure as `unknown` and still exits 0. Credentials are not
required for supported public sources.

## Install the adoption skill

The product provides three separate skills: `adopt-repository-standards` starts
adoption in an adopting project, `author-standards` helps publishers author a
standards source, and the project-local `repository-standards` looks up installed
rules and reports updates after adoption. Adoption installs only the last of
these automatically.

`adopt-repository-standards` delegates to `adopt` and follows the CLI's next
steps. It uses the standards source you name, with Repo Canon as the fallback,
checks for a clean, committed Git working tree, and leaves decisions and review
with the maintainer.

This skill is unreleased; **v7.1.0 does not contain it**. For published installation,
replace `<release-tag>` below with a public release tag that contains
`skills/adopt-repository-standards`. A tag that predates the skill cannot install
it. Use the same [skills CLI](https://github.com/vercel-labs/skills) route as for
authoring:

```sh
npx skills@1.5.25 add https://github.com/lutzseverino/repo-standards/tree/<release-tag>/skills/adopt-repository-standards \
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
describes discovery through skills CLI installation telemetry. The link is a
directory location, not evidence that indexing has happened. After publication,
record direct release-tag installation separately from a dated directory
observation; listing, indexing time, and ranking are not release guarantees.

## Install the authoring skill

`author-standards` guides creation, revision, and resumption from confirmed
preferences. It finishes with reviewed, validated local material and authoring
notes; repository provisioning and standards publication are separate work.

Use the conventional [skills CLI](https://github.com/vercel-labs/skills) to
install the skill from the product's public release tag:

```sh
npx skills@1.5.25 add https://github.com/lutzseverino/repo-standards/tree/v7.2.0/skills/author-standards \
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
`@lutzseverino/repo-standards@7.2.0` in an external directory, then reading that
installation's matching `docs/usage/author-format.md` and
`docs/usage/script-protocol.md`.
Node.js 24 or 26, npm, and registry access are required. Installing the skill does not
install its CLI, change an adopting project's runtime pin, or install authoring
into adopting projects. Adoption continues to manage its matching local
`repository-standards` skill independently.

Direct installation is independent of the
[skills.sh directory](https://skills.sh/lutzseverino/repo-standards/author-standards).
The [directory FAQ](https://skills.sh/docs/faq) describes its discovery process;
listing, indexing time, and ranking are third-party observations, not release
guarantees. Record dated observations separately from installation results.

For unreleased development only, replace the public URL with a local directory
containing the skill. That is candidate installation, even if its CLI comes
from public npm. The
[acceptance procedure](https://github.com/lutzseverino/repo-standards/blob/main/acceptance/README.md#published-authoring-installation)
provides isolated installation without changing your real global skills.

## Restore and update

The model-invocable `repository-standards` skill looks up
[installed rules](rules.md) before changing a project file and reports
[available updates](available-updates.md). It replaces `standards-updates`;
an update removes the old skill and its Claude link when unedited. Edited old
copies stay as project-owned content under the normal retirement policy.

After reviewing all adoption output, commit through your project's usual
workflow, including retained inputs, runtime manifest/lock, state, exact content,
skills and contextual changes. Dependencies and local execution records remain
ignored. In a fresh checkout:

```sh
npm ci --ignore-scripts --prefix .repo-standards/runtime
.repo-standards/runtime/node_modules/.bin/repo-standards status --json
.repo-standards/runtime/node_modules/.bin/repo-standards inspect --json
```

The lock restores the exact CLI and dependencies. Retained standards remain
inspectable if their source disappears. Restoring the runtime still requires
its npm package and dependencies to be available or cached; new standards
versions still require the source. These are independent availability limits.
Status reports historical adoption evidence, not ongoing compliance.

Use [`adopt`](adoption.md#updates-with-adopt) again to update the standards
version, source, profile, or CLI pin. Each update is one inspection and one
run; no manual external CLI installation is required.

Windows, private sources, SSH and Git hosts other than public GitHub are
unsupported. Trusted author scripts have normal host and network access;
`--ignore-scripts` disables npm lifecycle scripts, not disclosed author operations.
