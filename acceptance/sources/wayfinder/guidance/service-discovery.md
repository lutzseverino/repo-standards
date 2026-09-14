# Service readiness discovery

Identify independently operated services from positive runtime and ownership
evidence. Useful evidence includes a service manifest, executable entry point,
health endpoint, and named owner. A directory name or familiar manifest name by
itself does not establish that a service is operated.

For each operated service, include an individual operations runbook and its
adjacent `operating-status.json`. Either file can be absent before adoption; use
the service's manifest, source, or nonempty directory inventory as positive
membership evidence. Existing project notes can support the decision without
becoming governed targets when they do not need edits.

Explain every inclusion and exclusion. Treat fixtures, generated inventories,
archived examples, and directories that only group teams or services as
candidates requiring evidence rather than operated services. Leave uncertain
ownership, deployment, or runtime status as an unresolved question. An explained
empty target list is valid when the evidence shows that the repository operates
no service; its readiness operations still run over that empty scope.
