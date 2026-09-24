# Correct scope by adopting again, not by amending a run

Status: accepted design in the adoption-friction grilling of 2026-09-18;
specified in [issue #79](https://github.com/lutzseverino/repo-standards/issues/79).
Implemented by [issue #83](https://github.com/lutzseverino/repo-standards/issues/83) in
[PR #96](https://github.com/lutzseverino/repo-standards/pull/96) and released in
[CLI 2.0.0](https://github.com/lutzseverino/repo-standards/releases/tag/v2.0.0).
Supersedes [ADR 0004](0004-amend-scope-without-redefining-installed-ownership.md).

Scope amendment let an active run add discovered scope without abandoning its
progress, at the cost of a preview command, an amendment format, a third
inspection format, revalidation, and replay. No real adoption used it. With
confirmation identity bound to content ([ADR 0008](0008-bind-confirmation-identity-to-what-the-run-reads.md)),
read-only inspection cheap, and fixes repeat-safe by contract, a mistaken scope
is corrected by abandoning the run, committing or discarding its changes, and
adopting again with a new confirmed scope. The trade-off is a rough edge: an
abandoned run leaves uncommitted changes that must be resolved before the next
start. That cost is paid rarely; the amendment machinery was paid on every
release.
