# Retain work evidence as identities and deltas

Status: accepted design in [issue #72](https://github.com/lutzseverino/repo-standards/issues/72).
Availability follows the implementation tickets and [architecture](../development/architecture.md).

An adopting project commits its durable state through its normal workflow, so
every committed byte is material a reviewer is asked to read. Retaining each
work interval's full before and after observation maps made that state
unreadable: in the first real adoption, sixteen identical observation maps
produced a 17 MB state file, and each later completion copied the previous run's
maps forward, so the cost compounded per adoption run. No reader consumes those
maps after a complete adoption.

Commit each interval as the identities of its before and after observations plus
the delta between them: the changed paths with each path's before and after file
state, boundary changes, violations, restoration evidence, phase, scope and
operation reference. Keep the full observation maps in memory and in the
uncommitted local run report, which recovery, gap detection and scope-amendment
revalidation continue to use, so [ADR 0004](0004-amend-scope-without-redefining-installed-ownership.md)
keeps its guarantees. One module owns this slice, its committed shape and its
read-side version union.

The trade-off is that a committed interval can no longer reconstruct the project
observations it compared; it can only prove which observations it held and what
changed between them. Tamper evidence survives, because the identities bind the
delta to observations the run actually made. Reviewability of an adoption pull
request is worth more than reconstruction of state a later run re-observes
anyway. Compacting the local run report was left out: it is uncommitted, and the
module now owns serialization if that changes.
