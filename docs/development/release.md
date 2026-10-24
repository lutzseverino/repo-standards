# Release procedure

This procedure packages, publishes, and verifies a Repository Standards
release. Publishing a package does not by itself establish that its parent
specification's release contract has passed. Record outstanding criteria
explicitly on the parent specification, as
[the acceptance guide](../../acceptance/README.md#acceptance-records) describes.

## Start here

Use the checked-out product repository and its pinned Node.js/pnpm versions.
Choose the row that matches the observed state:

| State                                                    | Next action                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `Release` run is still queued or running               | Wait for it to finish before inspecting or retrying anything. The status helper below reports this as `in-progress` with a wait action.                                                                                                            |
| New version, no publication attempted                    | Complete the trusted-publisher setup below, update the package, the standalone authoring guide, and the public installation commands to the same exact version, write the release notes, then dispatch `Release` at the reviewed commit with them. |
| A publication attempt failed or its outcome is uncertain | Follow **Recover a publication** below before dispatching another publishing run.                                                                                                                                                                  |
| npm and the matching GitHub assets are already published | Dispatch `Release` with `verify_published: true` and the exact published version.                                                                                                                                                                  |
| Public acceptance failed                                 | Inspect that job's evidence and failure output. Follow **Retry public acceptance** below; preserve the failed attempt.                                                                                                                             |

Publication and acceptance are separate states. A successful upload or OIDC
probe does not establish complete release acceptance. The workflow does not run
the real-agent journeys; when the parent specification names one, its evidence
remains a separate completion requirement.

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
carries only product material: the compiled CLI, the bootstrap, the system
skills with their references, the Alice, Mira, and Atlas author examples, the
usage documents under `docs/usage/`, the package README, and the license. Development documents, ADRs,
agent guidance, the documentation index, `AGENTS.md`, `CONTRIBUTING.md`, and
`GLOSSARY.md` stay in the repository. Pack once and publish that same tarball.
`pnpm validate` installs a release bundle with scripts disabled and exercises its
executables and supplied author material alongside owning behavior tests.

### Package contents

`pnpm release:pack` stages the distributable package outside the checkout, with
the usage documents at their canonical `docs/usage/` paths. A packaged document
reaches unpackaged material through absolute repository URLs. An adopting
project installs the `repository-standards` skill without the package's
documents, so a contract it links uses an absolute repository URL at the
release's `v<version>` tag. The source README links
repository documents relatively, and staging rewrites each of its links that
leaves the package into an absolute repository URL on `main`; links inside the
package stay relative. A README link that leaves the repository or names
nothing in it stops packing. Use the release bundle's tarball for publication;
direct `npm pack --ignore-scripts` from the source checkout omits the README
link rewriting. Installed-CLI tests use the same staging boundary as release
packaging.

## Publish

The `Release` workflow is manually dispatched at the reviewed commit with its
exact package version and its release notes:

```sh
gh workflow run release.yml --repo lutzseverino/repo-standards \
  --ref <reviewed-ref> -f version=<version> -F notes=@<release-notes-file>
```

Open the Markdown notes with the update's derived adopter-action line, the
existing `status --json` field `impact.derived`. Prepare that line from
`inspect --json`'s `adopterAction.derived` on the same previous-release baseline before dispatch;
after publication, require it to match the line printed and retained by the
public update gate before marking the release complete. Include any
author-written actions outside adoption, what changed, breaking changes with
their migration, and the parent specification after that opening. Leave site-only changes out of
the CLI's release notes; the private site deploys independently from `main` through
Deploy site. GitHub limits a dispatch's inputs to 65,535 characters in total. The workflow refuses to publish without
notes. It validates on macOS and Linux under both Node.js 24 and 26, produces one bundle
on Linux with Node.js 24, retains the
notes as the `release-notes` artifact, authenticates through OIDC, publishes its
tarball, and attaches that bundle to the matching GitHub `v<version>` release,
whose body is the supplied notes. The workflow then runs public npm smoke
checks on both systems, after a bounded wait for registry propagation described
in **Published acceptance**, and retains JSON evidence as workflow artifacts.

Inspection predicts contextual work before the run knows which assessments it
will reuse, and describes remote setup as not ready before it may be deferred.
Its line can therefore differ from the completed update's line. If the lines
disagree, retain both and leave the release incomplete for the maintainer to
resolve the notes against the gate's actual derived action. The prediction does
not replace that evidence.

The workflow refuses an existing Git tag; inspect any partial previous publication before
retrying. An npm version cannot be overwritten, so a failed later step needs
explicit recovery using the original artifacts, not another publish attempt.

## Recover a publication

From a product checkout containing the current helper, run:

```sh
node scripts/release-status.ts <original-release-run-id> <fresh-output-directory>
```

Node.js, Git and authenticated `gh` with read access to the workflow artifacts
and repository push access to see drafts are prerequisites. This command
downloads the original validated bundle, checks
its hashes and npm integrity, resolves the public tag, and compares existing
release assets. It writes `status.json` beside the bundle and prints one exact
next action. It performs no publication or remote changes. An unknown or
contradictory state exits nonzero with evidence, without a publication command.
While the original run is still queued or running, including when its own
failure step points here, the helper reports `in-progress` with the run status
and a `gh run watch` action, exits zero, and inspects nothing further. Once
the run has finished, inspect again with a fresh destination.
Preserve the output directory; each inspection requires a fresh destination.
The verification action uses the current checkout's branch, so ensure that the
reviewed workflow/helper changes are pushed there before dispatching it.

The following explains the same state checks for manual recovery or when the
original workflow artifact has expired and must be recovered from archival inputs.

Start from the original failed `Release` run, not the current branch HEAD. Use
`gh run view <run-id> --repo lutzseverino/repo-standards --json headSha,jobs,url`
to establish the original commit and that **every required validation job passed**.
For the current workflow, require all four Linux/macOS × Node.js 24/26 matrix
cells. For historical runs before the Node.js matrix, require both original
Linux and macOS validation jobs. If validation did not pass, correct the failure
and validate before publishing.
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
If an interrupted release creation left a draft without a tag, its target must
be the full original validated commit SHA. A branch name is insufficient.

| Established state                                                          | Recovery action                                                                                                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm version is absent; original validated bundle is intact                 | Correct authentication and publish only the original tarball using **Interactive publication** below. Recheck registry integrity before proceeding.                         |
| npm integrity matches; GitHub tag/release is absent                        | Create the release at the original validated commit with the original four bundle files and the original run's release notes.                                               |
| npm integrity matches; tag matches; release exists but an asset is missing | Verify existing assets against the original bundle, then upload only missing files with `gh release upload`.                                                                |
| npm integrity matches; draft identity and body match; assets are missing   | Verify existing draft assets through authenticated GitHub asset downloads, then upload only missing original files. Re-run the status helper with a fresh output directory. |
| npm integrity matches; draft identity, body, and all four assets match     | Publish the existing draft with `gh release edit v<version> --draft=false --target <original-validated-commit>`, then re-inspect before verification-only acceptance.       |
| npm, tag, and all four release assets match                                | Run verification-only acceptance below.                                                                                                                                     |
| Any identity differs, or cannot be established                             | Stop recovery and resolve the discrepancy. Preserve the original bundle and observations.                                                                                   |

`gh release create` uploads assets to an intermediate draft before publication.
The status helper checks the authenticated release listing when the tag lookup
is absent and compares draft asset bytes through the authenticated asset API.
It also requires a draft's body to match the original run's release notes,
ignoring line endings and surrounding whitespace, because publishing the draft
makes that body the release record.
It preserves binary bytes and uses the same original-bundle hash checks as for
published assets. It never deletes drafts, overwrites existing assets, or
executes the printed action. Re-inspect after each recovery step; a draft is
not a completed publication.

For the missing-release case, after those identity checks, download the
original run's notes and create the release with them:

```sh
gh run download <run-id> --repo lutzseverino/repo-standards \
  --name release-notes --dir <fresh-notes-directory>
gh release create v<version> <original-bundle-directory>/* \
  --repo lutzseverino/repo-standards --target <original-validated-commit> \
  --title 'Repository Standards <version>' \
  --notes-file <fresh-notes-directory>/release-notes.md
```

The status helper downloads the same notes and prints this action with their
path. A run dispatched before the workflow took release notes has no
`release-notes` artifact, so the helper stops without an action; write the
notes and pass that file to `--notes-file` instead. For a draft left by such a
run, confirm its body by hand, or set it with
`gh release edit v<version> --notes-file <file>`, then follow the draft rows
manually. Use the observed version, commit and original artifact directory.
Do not rebuild an already published version, move an existing tag, overwrite
an existing asset, or rerun an entire publishing job after npm has succeeded.
Retain the original validation run alongside recovery evidence.

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
A propagation failure in `public-installation.json` names the version or asset
URL that never appeared and the elapsed wait; its `propagation.attempts` show
each observation. Confirm publication with the status helper before retrying.
The quota observation is advisory and cannot prevent the actual checks running.
A quota observation is a snapshot, not a
reservation of requests. GitHub's anonymous limits are shared by source IP;
Intel runner selection does not guarantee availability. A 403 alone does not
establish quota exhaustion. Use the actual failure and available rate-limit
headers; respect a reported reset or retry delay before another attempt. An
HTTP 403/429 with a valid `Retry-After` produces an explicit wait-until action,
even without primary-quota headers. The helper accepts delay-seconds or an
HTTP date and uses the later deadline when both retry and primary-reset
headers apply. Invalid values remain in the evidence without inventing a delay.
See [GitHub's rate-limit guidance](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
Source acquisition resolves identity and the recursive tree with a bounded set
of REST requests, then downloads Git objects through the anonymous smart Git
protocol; its REST demand is independent of blob count. Public acceptance still
exercises repeated real acquisition without credentials because REST quota and
Git transport availability are separate external dependencies.
An external interruption leaves acceptance incomplete. Keep anonymous acquisition
and all assertions intact; authenticated or fixture acquisition establishes a
different claim.

## Published acceptance

Run `node acceptance/public-installation.ts <version> <evidence.json>` on macOS
and Linux under both stable Node.js 24 and 26 after publication. It installs the public package outside a project,
validates packaged examples, discovers the public learning source, and exercises
explicit and omitted bootstrap versions without project mutation. It uses real
npm and GitHub, with no acquisition fixtures for those public paths.

It also proves the [release policy](../usage/reference/available-updates.md#release-policy)
by adopting the newest public learning-source release with the newest stable
npm CLI below `<version>`, committing that prepared baseline, and invoking
`npx --yes @lutzseverino/repo-standards@<version> adopt --json` exactly once.
The baseline uses the `work` profile, real Python 3.12 or newer before 4, a
prepared numeric CLI with checked commands, and scripted judgments of its
README and source layout. It uses an answers file and may take several rounds;
that preparation is not real-agent acceptance. The candidate update receives
no answers file, hand edits, follow-up adoption or contextual completion.
Only exit 0, outcome `complete` and the now-pinned CLI's `readyToCommit: true`
verdict pass. Questions, blockers, contextual work, retired records, other
errors and an unready result fail and remain in `updateGate` evidence. Its
`update.adopterAction` records `status.impact.derived`, which the script also
prints for the release-note opening. A missing stable predecessor fails rather
than skipping this check.

Every release, including a breaking release, must pass this gate before it is
complete. Redesign a change that cannot update in one step. A task outside
adoption is an adopter action, which the update must still complete around.

The step's internal child-process fetch observer passes through the original
requests and responses, rejects authorization, and records actual request
attempt counts without headers, bodies or query strings. External
`NODE_OPTIONS` and acquisition fixtures remain refused. `requests.githubRest`
and its per-phase counts cover GitHub REST requests across installation,
baseline and update; npm's own HTTP transport and smart Git transfers are
explicitly outside those counts. The predecessor lookup additionally makes one
public npm metadata request. `updateGate` retains both CLI versions, source
selection, commands, reports, readiness, and the measured counts. The baseline
is bounded to eight adoption rounds; normal prepared `work` adoption takes
three, followed by one candidate invocation. Quota exhaustion fails acceptance
with the original public request evidence; it is never bypassed with a token.

A successful pre-publication sample on 2026-10-22 used 17 anonymous GitHub REST
attempts: 10 to prepare and commit a baseline with public CLI 9.0.0 and learning
source v3.0.0, then seven for one unanswered local-candidate update. That
candidate still declared version 9.0.0. This measures the baseline and update
phases only, not installation, the CLI 9-to-10 pin upgrade, or the published
OS/Node matrix. It is an observed successful-path budget, not an upper bound;
retain the actual published run's counts and derived action separately.

Publication reaches the registry and release downloads eventually, so before
its assertions the script polls for the exact version's npm `dist` metadata,
then the release's `release.json` and `repo-standards-bootstrap` assets. It
retries only not-found results (npm `E404`, HTTP 404) every 10 seconds; any
other failure stops acceptance at once. npm and all release assets share one
600-second propagation budget from the first observation; each subject uses
the remaining time, and the last attempt starts at the bound.
Each attempt has its own 60-second timeout, so the wait ends at most about a
minute past the bound; a subject observed by that last attempt is accepted. A
subject still missing then fails acceptance with a diagnostic naming the
version or asset URL and the elapsed wait. The `propagation` field of the
evidence records the interval, the bound, and each attempt's subject,
timestamp, elapsed time and result; the job log prints the same lines. It also
validates the independently authored Wayfinder source from the clean workflow
checkout and records the checkout commit and source tree identity; this is
public-package/local-source validation, not live public-source acquisition. Keep
these automated checks separate from real-agent evidence.

When the parent specification names a real-agent journey, perform the
[real-agent journey](https://github.com/lutzseverino/repo-standards/blob/main/acceptance/README.md) with public npm
installations. Use the public learning source for live publication, discovery
and direct-source evidence. Independent temporary Git-source fixtures may cover
materially different authors through the same CLI and real installed skill;
label those runs public-package/fixture-source evidence, not live public-source
evidence. A second maintained public example repository is unnecessary.
Record useful contextual work
through the matching installed skill, separate script and agent evidence, full
adoption output, unchanged HEAD/index, normal project commits, fresh-checkout
restoration with scripts disabled, and retained inspection without source access.
Exercise standards and CLI updates, separately and together, using actual
published versions; a rewritten fixture manifest is not public update evidence.
Record each OS and each source independently.

Once published acceptance passes, add a short verification paragraph to the
GitHub release body: the release and verification workflow run IDs, the
systems checked, and the outcome. Keep the notes above it unchanged.

Do not label the release complete while publication, either OS, real-agent work
the parent names, or any parent criterion remains unverified. The parent remains open and unchanged.

## Product skill release

Each release carries the `repository-standards`, `author-standards`, and
`adopt-repository-standards`
skills, their references, and the matching author and protocol documentation.
Before packaging another version, update the standalone authoring guide
(`skills/author-standards/references/cli.md`) and the public installation
commands in [installation](../usage/guides/install.md) to its exact version; the
release test checks the bundled guide against the installed executable's
package version.

After publication, the workflow also runs
`node acceptance/prepare-author.ts <version> <evidence.json>` on macOS and Linux under both supported Node.js majors.
It acquires the skill through the public release-tag URL documented in
[installation](../usage/guides/install.md#install-the-authoring-skill), independently of the
npm package; then obtains the compatible public CLI/docs in an external directory.
Retain those JSON artifacts alongside existing public CLI smoke evidence.

When the parent specification names them, fresh real-agent creation, revision,
and resumption remain separate acceptance work. Record direct installation independently of dated skills.sh observations.
A ready PR, candidate test run, or public Git branch alone does not complete
the authoring acceptance.

### Adoption entry skill publication

`adopt-repository-standards` has **v8.0.0** as its first containing public tag;
that tag contains `SKILL.md` and `agents/openai.yaml`. The installation guide
and README no longer need unreleased notices for this skill. Keep the
[adoption skill installation command](../usage/guides/install.md#install-the-adoption-skill)
pinned to each new release while preserving v8.0.0 as the first containing tag.
The existing Release workflow creates the tag at the reviewed commit,
publishing the skills tree with it. No separate registry, publishing service,
or release dispatch is needed for the skill.

On macOS and Linux, verify direct installation from that public tag independently
of npm: run the documented `skills@1.5.25 add` command with isolated child-process
home and agent configuration directories, outside a product checkout and an
adopting project. Disable telemetry for acceptance and leave real global skills
untouched. Record the tag, resolved commit, command, tool versions, OS, outcome,
complete installed inventory and resource hashes. Compare the contents against
the tagged skill; only `SKILL.md` and `agents/openai.yaml` belong to this skill.
Record `disable-model-invocation: false` and
`policy.allow_implicit_invocation: true` from the installed metadata and verify
the single-sentence pointer to `adopt`, with the user-named source or Repo Canon
fallback and no restated adoption rules. The CLI owns all adopting-agent
guidance. A local-directory installation is candidate evidence
only, regardless of whether npm already carries the CLI.

Record a dated observation of the
[skills.sh directory location](https://skills.sh/lutzseverino/repo-standards/adopt-repository-standards)
and `npx skills@1.5.25 find adopt-repository-standards` separately, including any
absence or error. Discovery uses installation telemetry, so an indexing delay
neither invalidates a successful direct installation nor proves a listing exists.

After a containing public release exists, complete these README follow-ups:

- Repository Standards: retain the single-sentence CLI pointer and optional
  skill link from #307, updating the linked installation route and publication
  notice only after verifying the first containing tag.
- Repo Canon (`lutzseverino/repo-canon`): **Add the adoption skill alternative to
  the README**, beside the prompt from lutzseverino/repo-canon#507, linking the
  product's published installation instructions. This is separate work in that
  repository, not a change to make or an issue to file during this implementation.
