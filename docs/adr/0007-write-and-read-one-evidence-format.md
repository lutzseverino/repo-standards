# Write and read one evidence format, as identities and deltas

Amends [ADR 0005](0005-retain-work-evidence-as-identities-and-deltas.md).

ADR 0005 compacted committed state but kept full observation maps in the local
run report, full file bytes in every inspection report, and a read-side union
that keeps every earlier state and evidence format readable. Both adopters hit
observation limits on evidence the tool wrote, and inspection reports grew past
process capture buffers. Every report and every durable or local record now
carries identities and deltas only: path-to-hash inventories, unified diffs for
changed text, hashes for binary content. Each artifact has exactly one format
that the product writes and reads; retired formats are not converted or read.
The first breaking release drops state v1 to v4 and the older report formats,
with Repository Standards itself as the only affected adopter, which adopts
fresh. The trade-off is that an adopter on a retired format cannot update in
place; that cost is paid once, by one repository, rather than compounding as a
second mode in every later release.

[ADR 0011](0011-retain-only-the-current-run.md) amends this decision: committed
state and retained scope evidence hold the current run only, with the scope
change against the previous run stored, rather than every earlier run.
