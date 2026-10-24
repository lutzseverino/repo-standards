# GitHub requests and tokens

This page states which GitHub requests the CLI makes and how it authenticates
them. [Before you start](../guides/adopt.md#before-you-start) shows how to set
a token for adoption.

## Requests and quotas

Public source acquisition uses a bounded set of GitHub REST requests to resolve
the repository, immutable tag, commit and tree, then obtains all source objects
through Git's anonymous smart protocol. The number of REST requests does not grow
with the source's file count. The CLI keeps each verified source outside the
project, in `$XDG_CACHE_HOME/repo-standards/` or `~/.cache/repo-standards/`,
and reuses it only once its bytes match their Git identities. A later command
or answer round then makes two REST requests, plus one per annotated tag
object, resolving the repository and its tag afresh. A complete guided adoption
with a lightweight tag makes at most 16, plus one per additional page of
releases. Annotated tags add one request per object on each observation,
including start's second observation after it acquires the runtime.
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
