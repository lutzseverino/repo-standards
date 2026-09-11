# Public installation

Release status and outstanding evidence are recorded in the product repository's
`acceptance/results/` directory. The commands below require the named version
to have been published to public npm; a release bundle alone is not publication.

Use macOS or Linux with Node.js 24, npm, and Git on `PATH`. Install Node.js 24
from <https://nodejs.org/en/download> or select it with your version manager.
Author operations may require additional executables and versions; inspection
discloses these, and start checks them before changing the project.

## Install outside your project

No product checkout, TypeScript compiler, or pnpm is needed:

```sh
npm install --global --ignore-scripts --registry=https://registry.npmjs.org \
  @lutzseverino/repo-standards@1.0.0
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
  https://github.com/lutzseverino/repo-standards/releases/download/v1.0.0/repo-standards-bootstrap \
  --output "$HOME/.local/bin/repo-standards-bootstrap"
chmod 755 "$HOME/.local/bin/repo-standards-bootstrap"
```

The release also includes `SHA256SUMS` and `release.json` identifying its package
and bootstrap bytes. The bootstrap requires only Node.js 24 and npm to obtain
the CLI. From a committed adopting project, inspect the public learning source:

```sh
repo-standards-bootstrap --cli-version 1.0.0 inspect \
  --source https://github.com/lutzseverino/repo-standards-example \
  --standards-version v1.0.0 --profile service --json
```

Use the full bootstrap path if `$HOME/.local/bin` is not on `PATH`. Omit
`--cli-version 1.0.0` to select the greatest published stable version once;
stderr discloses the exact selection. Keep that version for confirmation and
start. Inspection does not change project content or run author operations.
Discovery is optional and is not an endorsement of any source.

Read the installed `skills/adopt-standards/SKILL.md` with your agent, then follow
[inspection](inspection.md) and [adoption](adoption.md) to disclose the report,
confirm its identity, start and perform contextual work. The standalone
bootstrap only inspects; retain an external installation of its selected exact
CLI for start and recovery. Adoption installs the matching repository-local
skill and runtime and leaves changes uncommitted with HEAD unchanged.

## Install the authoring skill candidate

`author-standards` guides creation of one local profile from confirmed preferences,
using configuration and guidance. It finishes at reviewed, validated local
material; repository setup and publication are separate work. Revision, distinct
profiles, and generated operations belong to later authoring slices.

For the local candidate, use the conventional
[skills CLI](https://github.com/vercel-labs/skills) with a directory containing
`author-standards/SKILL.md` and its `references/` directory (the product checkout's
`skills/` directory can supply this installation input):

```sh
npx skills@1.5.25 add /absolute/path/to/candidate-skills \
  --skill author-standards --global --agent codex --copy
```

Global installation is recommended for authors working before or across
repositories. Select your supported agent with `--agent`; `codex` is the tested
candidate route. The copied skill works after removing the installation input,
without a product checkout, adopting project, or surrounding npm package. Invoke
`author-standards` in your agent and describe how you work; optional references
are candidates for discussion, not automatically accepted policy.

The skill carries its CLI-acquisition guide at `references/cli.md`. It explains
installing the compatible exact npm CLI `@lutzseverino/repo-standards@1.0.1` in an
external directory and reading that installation's matching `docs/author-format.md`.
Node.js 24, npm, and npm registry access are needed for that acquisition; the
skill installation itself does not install the executable. An existing compatible
external CLI can be reused after checking its version and documentation.

This is **local candidate installation** evidence. Public installation and
skills.sh discovery evidence belong to
[issue #31](https://github.com/lutzseverino/repo-standards/issues/31); no public
listing or ranking is claimed. See the
[authoring acceptance procedure](https://github.com/lutzseverino/repo-standards/blob/a77f2b7f946a70ac6efb5adf3e2f15970140423f/acceptance/README.md#authoring-candidate)
for an isolated run that leaves your actual global skills untouched.

## Restore and update

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

Use the pinned CLI for a standards update and an externally installed candidate
exact CLI for a CLI update. Follow
[Update one pin at a time](adoption.md#update-one-pin-at-a-time); each update needs
its own inspection and confirmation. Source and profile switching are unsupported.

Windows, private sources, SSH and Git hosts other than public GitHub are outside
version one. Trusted author scripts have normal host and network access;
`--ignore-scripts` disables npm lifecycle scripts, not confirmed author operations.
