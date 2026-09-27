# Retain work evidence as identities and deltas

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
operation reference. One module owns this slice and its committed shape.

The trade-off is that a committed interval can no longer reconstruct the project
observations it compared; it can only prove which observations it held and what
changed between them. Tamper evidence survives, because the identities bind the
delta to observations the run actually made. Reviewability of an adoption pull
request is worth more than reconstruction of state a later run re-observes
anyway. [ADR 0007](0007-write-and-read-one-evidence-format.md) amends this
decision: the local run report and every inspection and run report now carry
the same identities and deltas, and only one format is read.
