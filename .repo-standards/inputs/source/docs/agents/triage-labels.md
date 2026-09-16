# Triage labels

Use the following shared workflow-state names.

| State | Meaning |
| --- | --- |
| `needs-triage` | Requires review or renewed review |
| `needs-info` | Waiting for information needed to evaluate the request |
| `ready-for-agent` | Reviewed and sufficiently specified for agent implementation |
| `ready-for-human` | Reviewed and requires human implementation |
| `wontfix` | Will not be actioned |

Triage assigns one category, `bug` or `enhancement`, and one workflow state to
a triaged request. Readiness describes the contract; it does not dispatch work
or imply that all implementation blockers have closed.

Wayfinder uses `wayfinder:map` for its planning issue and `wayfinder:research`,
`wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task` for child issues.
These planning labels do not themselves grant readiness.

Use the approval and invalidation rules in [the tracker configuration](issue-tracker.md)
when interpreting or changing readiness. Structural checks can remove readiness;
passing them never grants it.
