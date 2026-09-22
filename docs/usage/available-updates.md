# Check for available updates

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards outdated --json
```

`outdated` reports whether an
[available update](../../CONTEXT.md#language) exists for each pin of the
adopting project's selection: a published CLI or standards version newer than
the pinned one. It reads `.repo-standards/selection.yaml`, looks up the newest
stable versions, and compares each to its pin. It runs no author code, needs no
clean working tree, and changes nothing in the project except its own ignored
cache, so it is safe to run at the start of any session. It returns JSON with or
without `--json`; the flag also makes invalid usage structured. `--project
<directory>` selects another Git working tree.

The report states availability only. It updates nothing and does not recommend
an update; what to do with one belongs to the adopted standards' own guidance.
Apply an update through inspection and confirmation as described in
[Confirmed adoption](adoption.md).

## Lookups

Each invocation makes at most one npm registry request and one GitHub request,
in parallel, each bounded to ten seconds:

- The CLI pin is compared with the versions of `@lutzseverino/repo-standards`
  published by the registry named in `npm_config_registry`, or by
  `https://registry.npmjs.org/` when it is unset. npm configuration files are
  not read.
- The standards pin is compared with the source repository's 100 most recent
  GitHub releases. A token in `GH_TOKEN`, or otherwise `GITHUB_TOKEN`, is sent
  to GitHub as bearer authorization when present; without one the request is
  anonymous and uses the anonymous API quota. The token is never sent to the npm
  registry.

A stable version is a SemVer version without a prerelease component. For the
standards pin it must also be the tag of a published GitHub release that is not
marked as a prerelease. Drafts, prereleases, and tags that are not SemVer
versions are ignored. Tags published without a GitHub release, and releases
older than the 100 most recent, are not counted.

## Report

The report has format `repo-standards/outdated/v1` and one entry per pin: `cli`,
which also names the `package`, and `standards`, which also names the source
`repository`.

| Field | Meaning |
| --- | --- |
| `pinned` | The version recorded in the selection, or `null` without a readable selection. |
| `update` | `available` when a newer stable version exists, `none` when it does not, or `unknown` when the pin could not be answered. |
| `newest` | The highest stable version published. |
| `newerStableReleases` | How many stable versions newer than the pin are published, up to and including `newest`. |
| `checkedAt` | When the answer was looked up. |
| `cached` | Whether the answer came from the cache instead of a request. |
| `reason` | For `unknown` only: a stable `code` and a `message`. |

## Degraded results

`outdated` never blocks and exits 0 whether or not each pin could be answered;
only invalid usage exits 2. A pin that cannot be answered reports
`update: unknown` with a reason, and the other pin is still answered:

| Code | Pins | Cause |
| --- | --- | --- |
| `NO_SELECTION` | Both | The directory is not a Git working tree or has no `.repo-standards/selection.yaml`. |
| `INVALID_SELECTION` | Both | The selection cannot be read or does not name a CLI and GitHub source pin. |
| `REGISTRY_UNAVAILABLE` | CLI | The registry is unreachable, timed out, or returned an error or no version list. |
| `SOURCE_UNAVAILABLE` | Standards | GitHub is unreachable, timed out, or returned an error or no release list. |
| `QUOTA_EXHAUSTED` | Standards | GitHub reports its API quota exhausted. Retry later or provide a token. |
| `NO_STABLE_RELEASE` | Either | The lookup found no stable version. |
| `LOOKUP_FAILED` | Either | The lookup failed unexpectedly. |

## Cache

Answers are cached in `.repo-standards/cache/outdated.json`, inside the product
cache directory that `.repo-standards/.gitignore` ignores. Each lookup's answer
stays valid for 24 hours for the same registry, or for the same source
repository; a second invocation within that time answers from the cache without
a request. `unknown` answers are not cached, so the next invocation looks up
again. The cache is written only when Git confirms that its path is ignored and
its directory is a safe product-state boundary; otherwise the answer stands
without a cache. Nothing else is written, the cache never binds an inspection
identity, and deleting the file forces fresh lookups.

`status` remains offline: it reports pins and evidence without any network
request and says nothing about available updates.
