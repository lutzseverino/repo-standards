# Retroactive-authorization rejection

This isolated negative rehearsal used the public 1.2.0 CLI and Atlas source. The
confirmed initial inspection `sha256:157e21137e1d6d70690f9f6e895e131f24e350780eb34df45da8759327d331c4`
authorized four contextual paths and deliberately excluded `CATALOG.md`.

After `start` reached contextual work, the evaluator appended one line to the
out-of-scope `CATALOG.md`. A read-only `inspect --amend-scope` was then attempted
so the path could be proposed as an addition. The CLI rejected the request with
`ASSESSMENT_SCOPE` before it issued an amendment identity: earlier work changed
`CATALOG.md` outside the outgoing scope, so later confirmation cannot authorize
it. The active run remains incomplete and the unauthorized bytes remain
preserved for reconciliation. `docs/catalog.json`, which is exact-owned, was not
changed.

This intentionally incomplete session is separate from the successful Orchard
journey. It demonstrates fail-closed attribution; it is not a completed
adoption or evidence of current compliance.
