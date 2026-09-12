# Local-source publication handoff

The author accepted the complete local source and exact three-file revision.
Local source: /tmp/repo-standards-31-public-release/revision-workspace/standards
Validated compatibility: repo-standards 1.1.0, using Node v24.11.1.

A separate publication workflow should choose a public GitHub source repository
and copying/use license, include a root LICENSE or LICENCE file, and commit the
reviewed root standards.yaml plus all referenced material and authoring notes.
This local source currently has no root license file. The existing scratch.txt
and local-draft.txt are unfinished author work; this handoff does not select them
for publication. Keep their existing staged/unstaged/untracked state intact.

After validating the intended committed snapshot with compatible CLI 1.1.0, publish
that same commit under a new unused stable SemVer tag. Do not move an existing
tag. Direct adoption requires a published public GitHub source and stable tag;
share its canonical URL, exact tag, and one complete profile (personal-tools or
team-services). Discovery additionally needs a published non-prerelease GitHub
release and the repo-standards topic. Source versioning and the adopter's exact
CLI version remain independent.

Describe this revision as retiring personal-tools sample output in favor of
relevant failure cases/reporting while retaining invocation and input/output.
The shared exact documentation-review bundle changes for both profiles, with
team-services criteria unchanged. Adopters review and confirm updates separately.

This handoff follows the installed 1.1.0 package's docs/authoring.md. No repository
provisioning, staging, commit, tag, release, push, or adoption was performed.
