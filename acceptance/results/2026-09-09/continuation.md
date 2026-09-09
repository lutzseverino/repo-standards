# Publication continuation

The maintainer completed npm login. `npm whoami` now returns `lutzseverino`,
matching the agreed user scope. The prepared release artifact hashes were
verified against `release-bundle.json` before the actual publication attempt.

Publication of the exact prepared `1.0.0` tarball was attempted with:

```sh
npm publish ./release/lutzseverino-repo-standards-1.0.0.tgz \
  --ignore-scripts --access public --registry=https://registry.npmjs.org
```

npm initially rejected it with `E403` because account 2FA was disabled. The
maintainer enabled 2FA and approved the browser challenge on retry. Publication
then exited 0 with `+ @lutzseverino/repo-standards@1.0.0`. npm's access API
reported public access and read-write permission for the publisher, and the
dist-tag API reported `latest: 1.0.0`. Public metadata initially returned 404,
then became available with integrity matching `release-bundle.json`.
The [matching GitHub release](https://github.com/lutzseverino/repo-standards/releases/tag/v1.0.0)
contains the prepared tarball, bootstrap, checksums and metadata, at product
commit `3c5ad1c`. Credentials and recovery codes are not recorded here.

## One public learning repository

The maintainer questioned the need for another repository. Public acceptance
now uses one existing learning repository with two complete profiles rather
than creating a second public repository:

- Source: `https://github.com/lutzseverino/repo-standards-example`.
- Existing `v1.0.0`: unchanged Mira `service` selection.
- New [v1.1.0 release](https://github.com/lutzseverino/repo-standards-example/releases/tag/v1.1.0):
  commit `fa6e4bc16640e320e6d06496a910cdccb23d9223`.
- `service` explicitly excludes Alice's declarations and resolves to the same
  Mira declarations and operations as before.
- `work` excludes Mira's declarations and contribution guidance, wholly replaces
  Alice's default agent guidance with its work-specific exact file, and selects
  Alice's README/source guidance, review skill and Python check.

The [installed-CLI validation record](combined-source-validation.json) verifies
both profiles and compares their resolved declarations with the original
examples, accounting only for Alice's source-path prefix. Validation used the
prepared local tarball while public npm remained unavailable; this is not a
public-installation claim. The old stable tag was not moved. No additional
repository or personal standards were created.

These are two profiles of **one** public standards source. They are not claimed
as two independent public publishers. Independently authored source behavior
continues to have separate deterministic tests and the recorded earlier
fixture-based agent journeys. Fresh public-package/fixture-source real-agent
journeys are prepared separately; the earlier local-tarball runs are not
relabeled as current public-package evidence.

The existing example repository's main branch and its original `v1.0.0` tag
already had unrelated Git roots when cloned. `v1.1.0` extends that existing main
branch. Standards updates bind the same source URL to stable tags and exact
commits; no ancestry relationship between these releases is claimed.

## Public installation progress

Linux public installation, asset/integrity verification, packaged author
validation, live discovery, and explicit/omitted bootstrap inspection passed.
The [Linux record](public-installation-linux-success.json) uses no acquisition
fixtures. macOS first exposed a temporary-path alias issue in the acceptance
helper's npm lockfile lookup; the helper now canonicalizes temporary roots.
The corrected macOS attempt passed npm installation/integrity and author
validation, then reached GitHub's unauthenticated API rate limit during live
discovery. Its failure is retained separately and is not a passing live check.

## 1.0.1 candidate

The next actual CLI version is prepared for the independent CLI-update journey.
It includes the publication prerequisite and source-evidence documentation
corrections; the acceptance helpers now canonicalize temporary paths on macOS
and offer an explicitly labeled source-only fixture mode. The full local
`pnpm validate` passed: 327 passed, one skipped, zero failed; see
[the log](validate-1.0.1-macos.log). [Bundle identity](release-bundle-1.0.1.json)
records the exact prepared artifact. Publication succeeded; [public npm metadata](published-dist-1.0.1.json) matches
the prepared integrity. The [GitHub release](https://github.com/lutzseverino/repo-standards/releases/tag/v1.0.1)
contains its matching assets at commit `f8c6160`.

The requested GPT 5.6 Terra/high reviewers found no code defects in this follow-up.
Their documentation findings were corrected: the results index now separates
current status from historical blockers; acceptance commands require the exact
published version; fixture sessions refer to their recorded source without
claiming it is live public acquisition. Live public-source real-agent adoption and independent
published updates remain outstanding acceptance work.

## Confirmed initial journeys and remaining updates

All [four public-package/fixture-source initial journeys](public-agent/README.md)
completed after maintainer confirmation. Subsequent normal commits, fresh-clone
runtime restoration with scripts disabled and retained inspection while source
acquisition was unavailable passed on both systems. The actual public CLI
1.0.1 update inspections are prepared and await their distinct confirmations.
Live direct adoption and an actual published standards update remain outstanding.

[macOS public installation 1.0.1](public-installation-macos-1.0.1.json) passed
with no acquisition fixtures. [Linux 1.0.0](public-installation-linux-success.json)
already passed. The [additional Linux 1.0.1 attempt](public-installation-linux-1.0.1.json)
verified npm and assets, then failed discovery because GitHub returned HTTP 403
while resolving the example's annotated tag. This retained failure does not
invalidate the earlier Linux pass and is not relabeled as a successful run.
