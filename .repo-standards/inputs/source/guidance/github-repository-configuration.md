# GitHub repository configuration guidance

Configure the adopting repository's canonical issue labels, enable squash
merging, disable merge commits and rebase merging, and use the pull request
title and body for the squash commit. Preserve unrelated labels, rules, checks,
and repository settings.

Requiring the stable `PR metadata` check is a plan-gated requirement: require
it on the default branch wherever GitHub offers branch protection or rulesets
for the repository. On a private repository whose plan offers neither, the
requirement is unavailable, and the next adoption or update requires the check
once GitHub offers it. GitHub runs the PR metadata validation workflow only from
the default branch, so require the check once the workflow is on the default
branch; until then the requirement is deferred, and the next adoption or update
after the workflow merges requires it.

The repeat-safe operations infer one unambiguous github.com repository from Git
remotes, require authenticated access and the needed permissions, apply only
missing settings, and read the result back. Review blocked and partial results
before retrying. Operation evidence describes the state at execution time; it
does not provide remote freshness, rollback, or an ownership baseline.
