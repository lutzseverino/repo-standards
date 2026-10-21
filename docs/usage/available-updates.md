# Check for available updates

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards outdated
.repo-standards/runtime/node_modules/.bin/repo-standards outdated --json
```

`outdated` reports whether an
[available update](https://github.com/lutzseverino/repo-standards/blob/main/GLOSSARY.md#language)
exists for each pin of the adopting project's selection: a published CLI or
standards version newer than the pinned one. It reads
`.repo-standards/selection.yaml`, looks up the newest stable versions, and
compares each to its pin. It runs no author code, needs no
clean working tree, and changes nothing in the project except its own ignored
cache, so it is safe to run at the start of any session. Without `--json` it
renders a [Markdown report](#output-formats); with `--json` it returns the
[JSON report](#report) and also makes invalid usage and the
[pinned CLI](#pinned-cli) failure structured. `--project <directory>` selects
another Git working tree.

The report states availability only. It updates nothing and does not recommend
an update; whether to update is the maintainer's decision. Adoption installs the
model-invocable `repository-standards` system skill, which reports this result to
an agent, also reads the repository-wide [installed rules](rules.md) at the
start of any work and looks up the rules covering a file before changing it,
and starts no update; `outdated` remains the complete interface without an
agent. Apply an update through inspection and start as described in
[Adoption](adoption.md). To have every available update proposed as a pull
request instead, opt in to the [update action](automated-updates.md).

## Output formats

Without `--json`, `outdated` prints a Markdown report. The same report renders
the same bytes, and rendering makes no request and changes nothing beyond what
the JSON form does. The report holds:

- A Pins table with one row for the CLI package and one for the standards
  source: the pinned and newest versions, the update (`available`, `none` or
  `unknown`), the number of newer stable releases, when the answer was looked up
  and whether the lookup was `fresh` or `cached`. A value the report does not
  have reads `unknown`, and a pin or source the selection does not record reads
  `not recorded`.
- An Adopter actions table, present when a newer stable release exists: each
  newer release with the one-line [adopter action](#adopter-actions) its author
  wrote, `none` when it sets none, or `unreadable` with the reason code and
  message when its `standards.yaml` could not be read. A line below it says the
  line derived from an update comes from `adopt` and `inspect`.
- An Unknown results table, present only when a pin could not be answered: the
  pin, the reason's code and its message. It covers a missing selection and a
  failed lookup of either pin while the other is still answered.

The values agree with the [JSON report](#report), which carries every field
the Markdown does and stays the interface for scripts. Both formats state
availability only; neither prescribes or starts an update. `status` keeps its
own Markdown record and says nothing about available updates.

### Migration from the JSON default

Before 8.0.0, `outdated` printed the JSON report with or without `--json`. It
prints Markdown unless `--json` is given. Scripts that parse the report add
`--json`; the flag has always been accepted. The `repository-standards` system
skill already passes `--json`.

### Migration to `outdated/v2`

The JSON report is now `repo-standards/outdated/v2`, and its `standards` entry
gains `adopterActions` when the lookup answers (see
[Adopter actions](#adopter-actions)). Scripts that compare the `format` value
accept `v2`; every other field is unchanged. An older ignored cache is not
read, so the first invocation looks up again.

## Pinned CLI

Run `outdated` with the CLI the selection pins. When the selection records a CLI
pin and the running CLI is another version, `outdated` makes no lookup, writes
no cache, and exits 1 with `CLI_PIN_MISMATCH`. The message names the pinned
version and, when the committed runtime manifest and its npm lock both pin that
version, the project root and the command, run there, that reinstalls the
project runtime from them:

```sh
npm ci --ignore-scripts --prefix .repo-standards/runtime
```

When either file is missing, unreadable, or pins another version, the message
names an exact CLI installed outside the project instead.

A stale project runtime therefore never reports availability. With `--json`
the failure is `valid: false` with the diagnostic in `errors`; without it the
diagnostic goes to stderr. Without a readable selection no pin is recorded, so
every CLI reports both pins `unknown` as described under
[Degraded results](#degraded-results). To change the CLI pin, inspect with the
candidate exact CLI instead; see
[Update the selection](adoption.md#update-the-selection).

## Adopter actions

An update can ask adopters for something outside adoption. A source author
writes that as the optional `adopter-action` field of the root `standards.yaml`
([author format](author-format.md#adopter-action)). For each newer stable
standards release, `outdated` reads that release's `standards.yaml` at its tag
once, through the GitHub request helper, and reports the line: an Adopter
actions table in Markdown and `adopterActions` in JSON, oldest release first.
Each entry has the release `version` and its `action`, which is `null` when the
release sets none. A release whose file cannot be read, such as an unreachable
file or an invalid line, reports a `reason` with a `code` and `message` for that
release alone, and the report still answers.

`outdated` runs no inspection, so it cannot derive the rest of the line, which
depends on the update class, the project's declarations and remote setup. That
line comes from [`adopt` and `inspect`](inspection.md#markdown-summary). The
adopter actions are present when the standards pin was answered, an empty list
when no release is newer, and absent when it is `unknown`.

## Lookups

Each invocation looks up the npm registry and GitHub releases in parallel, then
reads the `standards.yaml` of each newer stable release, so a pin behind by `n`
releases costs one registry request, the pages of the release list, and `n`
file requests. Each file request is bounded to ten seconds too.
The registry request and each request in the paginated release lookup are
bounded to ten seconds:

- The CLI pin is compared with the versions of `@lutzseverino/repo-standards`
  published by the registry named in `npm_config_registry`, or by
  `https://registry.npmjs.org/` when it is unset. npm configuration files are
  not read.
- The standards pin is compared with the source repository's published GitHub
  releases across all pages. A token in `GH_TOKEN`, or otherwise `GITHUB_TOKEN`, is sent
  to GitHub as bearer authorization when present; without one the request is
  anonymous and uses the anonymous API quota. Values are trimmed; empty or
  whitespace-only values count as absent.
  Release reads and exact-tag resolution use Postern's `ReleaseSource`;
  other source-verification reads keep their GitHub boundary.
  A token uses the authenticated quota and is never recorded in reports or caches,
  or sent to the npm registry or on Git object downloads. A rejected token
  (HTTP 401) reports `SOURCE_UNAVAILABLE` with no anonymous retry.
  Quota retry guidance prefers a usable `retry-after` over `x-ratelimit-reset`
  when both arrive.

A stable version is a SemVer version without a prerelease component. For the
standards pin it must also be the tag of a published GitHub release that is not
marked as a prerelease. Drafts, prereleases, and tags that are not SemVer
versions are ignored. Tags published without a GitHub release are not counted.

## Report

With `--json`, the report has format `repo-standards/outdated/v2` and one entry per pin: `cli`,
which also names the `package`, and `standards`, which also names the source
`repository`.

| Field                 | Meaning                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pinned`              | The version recorded in the selection, or `null` without a readable selection.                                                    |
| `update`              | `available` when a newer stable version exists, `none` when it does not, or `unknown` when the pin could not be answered.         |
| `newest`              | The highest stable version published.                                                                                             |
| `newerStableReleases` | How many stable versions newer than the pin are published, up to and including `newest`.                                          |
| `checkedAt`           | When the answer was looked up.                                                                                                    |
| `cached`              | Whether the answer came from the cache instead of a request.                                                                      |
| `reason`              | For `unknown` only: a stable `code` and a `message`.                                                                              |
| `adopterActions`      | Standards pin only, when answered: each newer release's `version`, author-written `action` or `null`, and `reason` if unreadable. |

## Degraded results

`outdated` never blocks and exits 0 whether or not each pin could be answered;
only a [CLI other than the pin](#pinned-cli) exits 1, and invalid usage exits 2.
A pin that cannot be answered reports `update: unknown` with a reason, and the
other pin is still answered:

| Code                   | Pins      | Cause                                                                                                                             |
| ---------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NO_SELECTION`         | Both      | The directory is not a Git working tree or has no `.repo-standards/selection.yaml`.                                               |
| `INVALID_SELECTION`    | Both      | The selection cannot be read or does not name a CLI and GitHub source pin.                                                        |
| `REGISTRY_UNAVAILABLE` | CLI       | The registry is unreachable, timed out, or returned an error or no version list.                                                  |
| `SOURCE_UNAVAILABLE`   | Standards | GitHub is unreachable, timed out, or returned an error or no release list.                                                        |
| `QUOTA_EXHAUSTED`      | Standards | GitHub reports its API quota exhausted. The message names the usable reset time or retry delay and `GH_TOKEN` and `GITHUB_TOKEN`. |
| `NO_STABLE_RELEASE`    | Either    | The lookup found no stable version.                                                                                               |
| `LOOKUP_FAILED`        | Either    | The lookup failed unexpectedly.                                                                                                   |

## Cache

Answers are cached in `.repo-standards/cache/outdated.json`, inside the product
cache directory that `.repo-standards/.gitignore` ignores. Each lookup's answer
stays valid for 24 hours for the same registry, or for the same source
repository, and each release's adopter action stays valid for 24 hours for the
same release; a second invocation within that time answers from the cache
without a request. `unknown` answers and unreadable releases are not cached, so
the next invocation looks up again. The cache is written only when Git confirms that its path is ignored and
its directory is a safe product-state boundary; otherwise the answer stands
without a cache. Nothing else is written, the cache never binds an inspection
identity, and deleting the file forces fresh lookups.

`status` remains offline: it reports pins and evidence without any network
request and says nothing about available updates.
