# Discover standards sources

```sh
repo-standards source search --json
repo-standards source search --page 2 --json
```

Search queries the public GitHub `repo-standards` topic. It returns JSON with
or without `--json`; the flag also makes failures structured. No Git project is
required. Search changes no project files, executes no author operations or
prerequisite probes, selects no profile, and starts no adoption. It uses the
same external temporary snapshots and tag-observation cache as
[direct inspection](inspection.md#inspect-with-an-already-installed-exact-cli).

For each repository on the requested page, search walks GitHub's release list
in API order until it finds a published, non-prerelease release with a stable
SemVer tag. It checks that release's immutable Git snapshot through the same
source acquisition and all-profile resolver used by inspection. This is the
first eligible release in GitHub's list, not a guarantee of the highest SemVer.
An invalid or incompatible release is reported explicitly; search does not
silently fall back to older releases. Stable tags without GitHub releases are
still usable through direct inspection but are not discoverable candidates.

| Report field | Meaning |
| --- | --- |
| `cliVersion`, `topic`, `notice` | Validation version, fixed topic and explicit reminder that discovery is not endorsement. |
| `candidates` | Sources whose inspected release snapshot validates with this CLI. Each has canonical `repository`, repository `description`, immutable `commit`, `release` (version, name, URL, publication time), source metadata/compatibility and available `profiles`. No profile is selected. |
| `rejected` | Unsupported, unavailable, malformed or incompatible candidates, with repository identity, stable error code, reason and any validation details. Includes the release when one was identified. |
| `page`, `totalCount`, `nextPage` | Requested page, GitHub's count of topic matches before validation, and next page number or `null`. Pages contain up to 30 topic matches, so a page may contain no valid candidates. |
| `incompleteResults`, `searchLimitReached` | GitHub marked its search incomplete, or its count exceeds the 1,000-result search cap. Neither report claims an exhaustive inventory. |

Follow `nextPage` to continue, up to page 34. Repository ordering and counts can
change between requests. Release lists are paginated independently. GitHub
indexing delays and API rate limits apply. Requests use the public API without
authentication; search can consume several requests per candidate because it
validates referenced content rather than trusting topic labels.

Exit status 0 means the search page was processed, including an empty page or
candidate rejections. Exit status 1 means search could not be completed; 2
means invalid CLI arguments. A page-level connection/API failure is explicit
(`SOURCE_UNAVAILABLE`), and malformed search metadata is
`INVALID_SEARCH_RESPONSE`. Candidate diagnostics include `NO_STABLE_RELEASE`,
`UNSUPPORTED_SOURCE`, `INVALID_SOURCE`, `INVALID_STANDARDS` (with precise resolver
details), acquisition integrity errors and `MOVED_TAG`. A candidate rejected for
CLI compatibility may be usable with another compatible exact CLI version;
it is not presented as a valid candidate for the running version.

Discovery is not an endorsement, trust decision or assessment of guidance
quality. Review the source, license, scripts and prerequisites yourself. Choose
one source, stable version and complete profile, then use `inspect` and the
shared confirmation workflow. A known-source inspection never calls search;
it remains usable when discovery is unavailable. See the
[author publication workflow](authoring.md#publish-and-evolve).

GitHub API references: [repository search](https://docs.github.com/en/rest/search/search#search-repositories) and [release listing](https://docs.github.com/en/rest/releases/releases#list-releases).
