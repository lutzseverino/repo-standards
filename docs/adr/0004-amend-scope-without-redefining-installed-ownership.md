# Amend scope without redefining installed ownership

Status: superseded by [ADR 0009](0009-correct-scope-by-adopting-again.md); accepted design in [issue #41](https://github.com/lutzseverino/repo-standards/issues/41).
Availability follows the implementation tickets and [architecture](../development/architecture.md).

Discovery can reveal missing scope after installation or contextual work, while
abandoning partial adoption does not establish reusable completed ownership.
Allow explicitly confirmed additions to each declaration's discovered file scope
inside an eligible active run, keeping its selection and installed expectations
fixed. Validate earlier work against the outgoing scope before accepting
additions, preserve separate fix/agent observation intervals, replay repeat-safe
fixes, and require renewed assessment and checks. This preserves valid progress
without retroactively authorizing violations.

The final simplicity review excluded removing or transferring targets within
the run. That avoids historical ownership reassignment, at the cost of leaving
the run incomplete when correcting a mistaken target requires withdrawing it.
The user accepted this limitation. Complete scope recomputation remains possible
before initial confirmation and in a subsequent clean adoption.
