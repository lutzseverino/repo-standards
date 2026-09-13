# Release procedure

Issue #11 owns public distribution and release integration. Publishing a package
does not close parent #1 or establish that its full release contract has passed.
Record outstanding criteria explicitly in `acceptance/results/`.

## Start here

Use the checked-out product repository and its pinned Node.js/pnpm versions.
Choose the row that matches the observed state:

| State | Next action |
| --- | --- |
| New version, no publication attempted | Complete the trusted-publisher setup below, update the package and standalone authoring guide to the same exact version, then dispatch `Release` at the reviewed commit. |
| A publication attempt failed or its outcome is uncertain | Follow **Recover a publication** below before dispatching another publishing run. |
| npm and the matching GitHub assets are already published | Dispatch `Release` with `verify_published: true` and the exact published version. |
| Public acceptance failed | Inspect that job's evidence and failure output. Follow **Retry public acceptance** below; preserve the failed attempt. |

Publication and acceptance are separate states. A successful upload or OIDC
probe does not establish complete release acceptance. The workflow does not run
the real-agent journeys; their evidence remains a separate completion requirement.

## Trusted-publisher setup

The normal release path uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
through GitHub Actions. In the existing package's npm settings, configure user
`lutzseverino`, repository `repo-standards`, workflow filename `release.yml`,
environment `npm`, and permission for direct `npm publish`. Configure GitHub's
`npm` environment access according to the repository's release policy.
The publisher label is descriptive only.

The workflow uses an OIDC-enabled GitHub-hosted publish job with compatible pinned
Node.js/npm versions. Local browser login and `npm whoami` do not verify this
configuration. Account policy may require 2FA and disallow traditional tokens
while allowing trusted publishing. Keep credentials and authentication response
bodies out of repository files and evidence.

For an existing published version, `verify_published: true` exercises the OIDC
exchange without publishing or staging a package. It checks workflow/environment
authentication only: direct-publish permission and automatic provenance for this
public package/repository are established by the next real publication. Never
publish a dummy version to test authentication. A dry run checks packaging, not
publication authorization. See **Interactive publication** only when local
publication is actually needed.

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
authenticates through OIDC, publishes its tarball, and attaches that bundle to the
matching GitHub `v<version>` release. The workflow then runs public npm smoke
checks on both systems and retains JSON evidence as workflow artifacts.
It refuses an existing Git tag; inspect any partial previous publication before
retrying. An npm version cannot be overwritten, so a failed later step needs
explicit recovery using the original artifacts, not another publish attempt.

## Recover a publication

From a product checkout containing the current helper, run:

```sh
node scripts/release-status.ts <original-release-run-id> <fresh-output-directory>
```

Node.js, Git and authenticated `gh` with read access to the workflow artifacts
are prerequisites. This command downloads the original validated bundle, checks
its hashes and npm integrity, resolves the public tag, and compares existing
release assets. It writes `status.json` beside the bundle and prints one exact
next action. It performs no publication or remote changes. An unknown or
contradictory state exits nonzero with evidence, without a publication command.
Preserve the output directory; each inspection requires a fresh destination.
The verification action uses the current checkout's branch, so ensure that the
reviewed workflow/helper changes are pushed there before dispatching it.

The following explains the same state checks for manual recovery or when the
original workflow artifact has expired and must be recovered from archival inputs.

Start from the original failed `Release` run, not the current branch HEAD. Use
`gh run view <run-id> --repo lutzseverino/repo-standards --json headSha,jobs,url`
to establish the original commit and that **both validation jobs passed**.
If validation did not pass, correct the failure and validate before publishing.
A run's overall failure does not mean its npm publication failed.

Download that run's `release-bundle` into a fresh directory:

```sh
gh run download <run-id> --repo lutzseverino/repo-standards \
  --name release-bundle --dir <fresh-bundle-directory>
```

Verify all artifact hashes from `release.json` and `SHA256SUMS`, then inspect the
exact npm version and the GitHub tag/release. A missing artifact, an unavailable
service, or an authentication failure leaves state unknown; do not treat it as
proof that publication is absent. Compare registry `dist.integrity` with the
original bundle's `integrity`. Resolve the tag to the original validated commit;
`target_commitish` alone is not proof of tag identity.

| Established state | Recovery action |
| --- | --- |
| npm version is absent; original validated bundle is intact | Correct authentication and publish only the original tarball using **Interactive publication** below. Recheck registry integrity before proceeding. |
| npm integrity matches; GitHub tag/release is absent | Create the release at the original validated commit with the original four bundle files. |
| npm integrity matches; tag matches; release exists but an asset is missing | Verify existing assets against the original bundle, then upload only missing files with `gh release upload`. |
| npm, tag, and all four release assets match | Run verification-only acceptance below. |
| Any identity differs, or cannot be established | Stop recovery and resolve the discrepancy. Preserve the original bundle and observations. |

For the missing-release case, after those identity checks:

```sh
gh release create v<version> <original-bundle-directory>/* \
  --repo lutzseverino/repo-standards --target <original-validated-commit> \
  --title 'Repository Standards <version>' \
  --notes 'Published artifacts; release acceptance is tracked separately.'
```

Use the observed version, commit and original artifact directory. Do not rebuild
an already published version, move an existing tag, overwrite an existing asset,
or rerun an entire publishing job after npm has succeeded. Retain the original
validation run alongside recovery evidence.

## Interactive publication

This is the recovery/initial-publication path. The account needs access to the
`@lutzseverino` npm scope. A GitHub login does not grant npm access. Enable
[npm two-factor authentication](https://docs.npmjs.com/configuring-two-factor-authentication/)
and complete browser authentication outside the repository:

```sh
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm access list packages --json --registry=https://registry.npmjs.org
```

An empty package list does not prove permission to create a new scoped package.
Successful identity verification also does not establish publish permission or
satisfy an OTP requirement. Publish the original validated tarball, approve through
npm when requested, and compare public registry integrity with `release.json`:

```sh
npm publish <original-tarball> --ignore-scripts --access public \
  --registry=https://registry.npmjs.org
npm view @lutzseverino/repo-standards@<version> dist --json \
  --registry=https://registry.npmjs.org
```

Record package/version, commit, registry integrity, release URL and validation
runs. Remove temporary authentication configuration after use; retain no tokens,
OTPs or authentication logs.

## Retry public acceptance

After npm and GitHub publication are verified, use the workflow implementation
containing any helper corrections and the exact published version:

```sh
gh workflow run release.yml --repo lutzseverino/repo-standards \
  --ref <reviewed-workflow-ref> -f version=<published-version> \
  -F verify_published=true
```

This mode skips validation, packaging and publication, while running OIDC
verification and both OS public checks independently. Preserve each attempt's
artifacts, including failures. To retry only failed jobs in an existing run, use
`gh run rerun <verification-run-id> --failed`; this uses that run's original
workflow code. Dispatch a new verification run when helper code has changed.

Inspect `public-installation.json`, `public-author-installation.json`, and
`public-api-quota.json` in the failed job's uploaded artifacts. The author helper
retains selected headers on failed HTTP responses; both installation helpers
record assertion failures and print a retry command with a fresh evidence path.
The quota observation is advisory and cannot prevent the actual checks running.
A quota observation is a snapshot, not a
reservation of requests. GitHub's anonymous limits are shared by source IP;
Intel runner selection does not guarantee availability. A 403 alone does not
establish quota exhaustion. Use the actual failure and available rate-limit
headers; respect a reported reset or retry delay before another attempt. An
external interruption leaves acceptance incomplete. Keep anonymous acquisition
and all assertions intact; authenticated or fixture acquisition establishes a
different claim.

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

## Authoring feature delivery

Issue #31 adds `author-standards` and the reserved-identity CLI changes to the
same npm/release process. Version 1.1.0 carries both system skills, standalone
authoring references, and matching author/protocol documentation. Before
packaging another version, update the authoring acquisition guide and public
installation commands to its exact version; the release test checks the bundled
guide against the installed executable's package version.

After publication, the workflow also runs
`node acceptance/prepare-author.ts <version> <evidence.json>` on macOS and Linux.
It acquires the skill through the public release-tag URL documented in
[installation](installation.md#install-the-authoring-skill), independently of the
npm package; then obtains the compatible public CLI/docs in an external directory.
Retain those JSON artifacts alongside existing public CLI smoke evidence.

Fresh real-agent creation, revision, and resumption remain separate acceptance
work. Record direct installation independently of dated skills.sh observations.
The [authoring coverage map](https://github.com/lutzseverino/repo-standards/blob/main/acceptance/authoring-release-coverage.md)
maps all twelve criteria and identifies missing release evidence. A ready PR,
candidate test run, or public Git branch alone does not complete issue #31.
