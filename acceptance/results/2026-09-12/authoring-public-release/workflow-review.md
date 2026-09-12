# Workflow correction review

Two independent agents used the code-review skill for
`git diff 305025e36e9f9f503135eed3dce33a7b51d373f4...e866181`.
The later `d34857c` change only records unauthenticated API quota in public
acceptance; it does not change publication or acceptance assertions.

## Standards

No documented-standard breaches or actionable baseline smells found.

- Workflow conditions preserve validation before publishing. Verification mode
  skips publication and permits public installation checks despite the skipped
  dependency. OIDC verification fails independently and therefore still fails
  the overall run.
- The probe follows the release procedure's credential-handling rule:
  credentials remain in memory, redirects are rejected, response bodies and
  underlying fetch errors are suppressed, and output is restricted to anchored,
  locally defined messages.
- Evidence retains the failed attempt's commit, timestamps, and limitations
  without authentication logs or credentials. Documentation distinguishes
  authentication verification from publication permission and successful provenance.

## Spec

No findings. The maintainer's additional request to fix GitHub Actions npm
publishing is implemented through a GitHub-hosted runner, the `npm` environment,
OIDC permission, a compatible pinned npm, and removal of token authentication
and `npm whoami`. The tested-tarball publication path remains intact.

`verify_published` skips packaging and publication, so it cannot overwrite or
republish 1.1.0. The OIDC exchange validates authentication while documentation
reserves direct-publish authorization and provenance verification for the next
real release. No unrequested product behavior or contract contradiction was found.

## Observed verification

[Run 34706191543](https://github.com/lutzseverino/repo-standards/actions/runs/34706191543)
confirmed the live OIDC exchange and Linux public installation. macOS failed
with public GitHub HTTP 403 responses; later quota evidence established exhausted
unauthenticated API access. That acceptance failure is separate from the OIDC
correction and must pass on retry before claiming both-platform acquisition.

The original publish artifact remains the one validated at `305025e`; workflow
corrections do not change npm 1.1.0 or its GitHub release tag.

## Fresh acceptance evidence review

The same two independent reviewers separately audited the staged evidence against
`d34857c`, without rerunning operations or editing evidence.

Standards: no actionable documented-standard violations or heuristic findings.
The original bundle identity, GitHub tag/assets, summary links, untouched
candidate folder, distinct journey inputs, preservation comparisons and archived
operation replay were consistent. Raw patch context and captured output were
retained as evidence.

Spec: no missing reviewable inputs or unsupported acceptance claims found.
Policies trace to live accepted choices, with complete before/after sources and
reviews. Public acquisition, deterministic behavior, synthetic-author journeys,
same-agent ordinary-work reviews and discovery observations remain distinct.
The audit specifically confirmed honest missing-runtime/platform limits and the
limited OIDC authentication claim. macOS public acquisition was still pending at
review time and must be closed by an actual successful run.

## Standalone installation path correction

Both reviewers also examined `d34857c...4b72bb1` and found no actionable
standards or spec findings. Canonicalizing the temporary root fixes npm's
symlink-prefix lockfile layout without changing the published package, public
acquisition path, isolated environment or integrity assertions. The exact npm
11.6.2 reproduction fails with the symlink prefix and passes with its canonical
path; the full corrected helper also passes using that npm version and a
symlinked temporary directory on Linux.

The subsequent `f7034fd` workflow change selects the supported Intel macOS 26
pool for public acquisition after repeated shared arm64 API quota exhaustion.
Local inspection confirmed that the same two acceptance commands, assertions,
artifact retention, OIDC job and full-validation platform matrix remain intact.
The platform is recorded explicitly; changing runner pools does not establish
that anonymous API quota will always be available.

Final public acquisition in [run 34707831276](https://github.com/lutzseverino/repo-standards/actions/runs/34707831276)
passed on Linux x64 and macOS Intel, including the corrected standalone helper.
Live OIDC authentication also passed. The earlier pending macOS condition is
therefore resolved by public execution evidence.
