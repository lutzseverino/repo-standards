# Release procedure

Issue #11 owns public distribution and release integration. Publishing a package
does not close parent #1 or establish that its full release contract has passed.
Record outstanding criteria explicitly in `acceptance/results/`.

## Access prerequisite

The publisher needs an npm account allowed to publish
`@lutzseverino/repo-standards` under the agreed `@lutzseverino` scope. A GitHub
login does not grant npm access. Enable account two-factor authentication using
[npm's setup instructions](https://docs.npmjs.com/configuring-two-factor-authentication/)
before the first interactive publication; login alone is insufficient. Then authenticate outside
the repository with `npm login --registry=https://registry.npmjs.org`, then run:

```sh
npm whoami --registry=https://registry.npmjs.org
npm access list packages --json --registry=https://registry.npmjs.org
```

For a new package, the account must own the user scope or have appropriate
organization access. An empty package list does not prove permission to create
it. `npm publish --dry-run` verifies packaging, not authorization; successful
publication followed by public retrieval is the final access evidence. Never
commit tokens, npm configuration containing credentials, or authentication logs.
Use interactive authentication/2FA for local publication. For the workflow,
configure `NPM_TOKEN` as an environment secret in GitHub's `npm` environment,
with publish access scoped to this package and compatible npm 2FA settings.
Configure environment access according to the repository's release policy.

The workflow uses token authentication and does not request attestations.
See npm's [publish documentation](https://docs.npmjs.com/cli/commands/npm-publish/)
for scoped public access and authentication requirements.

## Build and inspect a bundle

Use `.node-version` and the `packageManager` version. Set a new exact stable
version in `package.json` for each release. Never reuse an already published
version for changed bytes. From the selected release commit:

```sh
pnpm install --frozen-lockfile
pnpm validate
pnpm release:pack
```

The output directory `release/` must not exist. The bundle contains the npm
tarball, executable standalone bootstrap, `SHA256SUMS`, and `release.json`
(package/version, npm integrity, and SHA-256 artifact hashes). The package
includes compiled CLI code, its matching reserved system skill, public protocol
documents and both author examples. Pack once and publish that same tarball.
`pnpm validate` installs a release bundle with scripts disabled and exercises its
executables and supplied author material alongside owning behavior tests.

## Publish

The `Release` workflow is manually dispatched at the reviewed commit with its
exact package version. It validates on macOS and Linux, produces one bundle,
checks npm access, publishes its tarball, and attaches that bundle to the
matching GitHub `v<version>` release. The workflow then runs public npm smoke
checks on both systems and retains JSON evidence as workflow artifacts.
It refuses an existing Git tag; inspect any partial previous publication before
retrying. An npm version cannot be overwritten, so a failed later step needs
explicit recovery using the original artifacts, not another publish attempt.

For an initial local release using an authenticated npm account:

```sh
npm publish ./release/lutzseverino-repo-standards-1.0.0.tgz \
  --ignore-scripts --access public --registry=https://registry.npmjs.org
npm view @lutzseverino/repo-standards@1.0.0 dist --json \
  --registry=https://registry.npmjs.org
```

Compare the registry integrity with `release.json`. Create the `v1.0.0` GitHub
release at the reviewed commit and upload all four bundle files. Record the
commit, registry version/integrity, release URL, authentication account (never
its credentials), and validation runs. First-time authentication may require
interactive npm 2FA; complete that through npm, not by storing an OTP in files.

## Published acceptance

Run `node acceptance/public-installation.ts <version> <evidence.json>` on macOS
and Linux after publication. It installs the public package outside a project,
validates packaged examples, discovers the public learning source, and exercises
explicit and omitted bootstrap versions without project mutation. It uses real
npm and GitHub, with no acquisition fixtures. Keep these automated checks
separate from real-agent evidence.

Then perform the [real-agent journey](https://github.com/lutzseverino/repo-standards/blob/main/acceptance/README.md) with public npm
installations. Use the public learning source for live publication, discovery
and direct-source evidence. Independent temporary Git-source fixtures may cover
materially different authors through the same CLI and real installed skill;
label those runs public-package/fixture-source evidence, not live public-source
evidence. A second maintained public example repository is unnecessary.
Record useful contextual work
through the matching installed skill, separate script and agent evidence, full
adoption output, unchanged HEAD/index, normal project commits, fresh-checkout
restoration with scripts disabled, and retained inspection without source access.
Exercise independent standards and CLI updates using actual published versions;
a rewritten fixture manifest is not public update evidence. Record each OS and
each source independently. The coverage map in
`acceptance/release-coverage.md` points to the owning deterministic tests.

Do not label the release complete while publication, either OS, real-agent work,
or any parent criterion remains unverified. The parent remains open and unchanged.
