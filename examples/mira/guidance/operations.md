Read the service entry point, configuration and current operator documentation.
In docs/operations.md explain Startup, Health and Recovery for this actual
service: exact commands, listening address, a sample probe response, failure
signals, and the effect of restarting on stored data. State unsupported recovery
claims explicitly. Preserve existing warnings and escalation ownership.
The initializer supplies docs/operating-status.json only when absent; keep its
status as "unverified" because adoption does not certify a deployed service.
Checks verify structure and this honest status; agent evidence must justify
operational claims from the source and any local probes actually run.
