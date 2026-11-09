# Select check location beside platform

The owner approved one check location per repository on 2026-11-06 and settled
its public keys on 2026-11-09 in
[#480](https://github.com/lutzseverino/repo-standards/issues/480#issuecomment-6734280811).
Extend the existing selection mechanism beside platform: profiles offer
`check-locations`, declarations optionally filter on that array, and selection,
answers and the CLI use `checks`. Declaration `checks` remains executable
operations. A hosting platform never implies a check location.

Omitted profile offers and supported legacy selections mean `github`;
omitted declaration filters apply at every offered location. Both filters
apply before scope and operations. Retained inputs hold the chosen location,
so offline reapplication keeps it. Headless updates stop for a choice when the
recorded location is unsupported instead of silently changing it.

This avoids multiplying profiles or introducing profile composition. Choices
per check group remain deferred until a second repository needs them; execution,
scheduling, publication and merge enforcement belong outside this selection
contract. The platform-only format exception in ADR 0027 does not apply:
changed records and reports raise their formats, with supported previous
committed formats readable under the existing compatibility policy. Script
requests add an optional `checks` field under the author-input exception.
