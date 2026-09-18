# Bind confirmation identity to what the run reads

Status: accepted design in the adoption-friction grilling of 2026-09-18;
specification pending.

An inspection identity bound HEAD, the index, and Git status, so any commit to
the default branch between inspection and start invalidated a confirmation. That
made proposing an update from an unrelated session hostile in practice while
adding no content safety: HEAD says nothing about the bytes adoption reads or
writes. Identity now binds the selection, resolved materials, affected bytes and
modes, the product-state inventory, and, for discovery-backed runs, the discovery
observation. HEAD is recorded in the run for provenance but is not bound. Start
still requires a clean tree. The trade-off is that an unrelated commit can sit
between inspection and start; if it changes anything the run reads, the bound
content changes and the identity with it.
