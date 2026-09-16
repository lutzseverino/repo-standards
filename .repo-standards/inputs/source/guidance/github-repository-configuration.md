# GitHub repository configuration guidance

Configure the adopting repository's canonical issue labels, require the stable
`PR metadata` check on the default branch, enable squash merging, disable merge
commits and rebase merging, and use the pull request title and body for the
squash commit. Preserve unrelated labels, rules, checks, and repository
settings.

The repeat-safe operations infer one unambiguous github.com repository from Git
remotes, require authenticated access and the needed permissions, apply only
missing settings, and read the result back. Review blocked and partial results
before retrying. Operation evidence describes the state at execution time; it
does not provide remote freshness, rollback, or an ownership baseline.
