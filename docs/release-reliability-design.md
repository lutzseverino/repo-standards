# Release reliability investigation design

Status: accepted for implementation through the requested implement run.
This records confirmed investigation preferences and verification criteria;
it does not replace GitHub issue specifications.
The originating work is [PR #37](https://github.com/lutzseverino/repo-standards/pull/37),
[issue #31](https://github.com/lutzseverino/repo-standards/issues/31), and
[parent #25](https://github.com/lutzseverino/repo-standards/issues/25).

## Agreed direction

- Prioritize simplification that makes the setup easier for humans and agents
  to use predictably. More automation is not itself the objective.
- An external failure may leave acceptance incomplete when the result preserves
  completed evidence, identifies the cause where established, and provides a
  precise recovery step. Automatic recovery is not required; any proposed
  retries need evidence of benefit and a bounded cost.
- Favor focused improvements within the existing workflows, helpers, and
  release procedure. If investigation establishes a need for substantial
  redesign, record it as backlog work rather than expanding this change.
- Scope easier setup to the maintainer's release preparation, checks, failure
  diagnosis, and recovery, including agents performing that work. Broader author
  and adopting-project installation improvements belong in separate backlog
  items.
- A maintainer starting without the previous conversation should be able to
  identify the current state and follow the next step without reconstructing
  release history.
- For partial publication, prefer detecting the observed state and providing
  one exact recovery action using the original validated artifacts. Automatic
  continuation is optional only if investigation demonstrates that it can stay
  small and reliably reject mismatched artifacts.

## Investigation boundaries

Inventory the whole PR's check history and distinguish repository defects,
external failures, deliberate failing tests, and cancellations. For each failure
class, link evidence, separate established causes from hypotheses, assess whether
it remains possible, and explain the proposed change or decision to leave it.

Preserve original observations and published artifacts. Keep new analysis separate
from the [public-release evidence](../acceptance/results/2026-09-12/authoring-public-release/README.md).
Preserve acceptance strength and anonymous public acquisition semantics. Do not
republish 1.1.0 or create a test release. Actual OIDC publication and
provenance remain unverified until the next real version; the authentication
probe establishes only the narrower claim documented in the release record.

## Verification criteria

Use the failure inventory to select focused checks for each resulting change.
Evaluate the maintainer experience against these concrete scenarios:

1. Starting a release: a maintainer can find the supported starting point,
   identify required setup, and distinguish prerequisites that can be checked
   beforehand from capabilities established only by actual publication.
2. Partial publication: npm already contains the version but the GitHub release
   is missing. The maintainer can identify the original validated bundle and
   the exact recovery action without attempting to republish the npm version.
   Missing or contradictory artifact identity must be reported as unresolved.
3. Public acceptance interruption: an external service prevents completion.
   Available evidence identifies the failed operation and supports the stated
   cause, completed evidence remains available, and the next action is explicit.
4. Handoff: a fresh human or agent can distinguish published artifacts, completed
   validation, pending acceptance, and remaining verification limits using the
   maintained instructions and resulting evidence.

These criteria guide investigation and verification; they do not prescribe a new
command, coordinator, or persistent state store. Exercise changed behavior with
meaningful checks and run the repository's required validation for implementation.
Simulations do not count as actual OIDC publication or live public acceptance.

## Delivery

Investigate the full history, implement supported focused improvements, record
larger justified work for the backlog, and report validation and residual limits.
Use the implement workflow and commit to the current branch as requested.
After completion, commit with conventional messages, merge PR #37 at its
existing reviewed head, and open a separate PR for this work against the resulting
main branch, as subsequently authorized. Capture reusable findings
as candidates for future standards authoring; repository fixes do not establish
confirmed author preferences for every future adopting project.

Implementation tickets and any contract changes belong in GitHub Issues under
the repository's [contribution procedure](../CONTRIBUTING.md). This note records
the interview; it is not historical release evidence.
