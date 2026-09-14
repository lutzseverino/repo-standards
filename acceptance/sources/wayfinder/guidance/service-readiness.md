# Service readiness guidance

Give each confirmed service a concise operations runbook with these sections:
Startup, Health, Recovery, and Known limitations. Derive commands and behavior
from the actual project. When practical, start the service locally and probe its
documented loopback health endpoint. Record what was observed separately from
what remains unverified.

Preserve useful project facts and warnings. Explain restart behavior, state that
can be lost, and a safe recovery action. Do not claim that deployment, external
permissions, production health, or rollback succeeded unless they were actually
observed. Update the adjacent `operating-status.json` with `observed` or
`unverified` for startup, health, and restart, plus a nonempty evidence list.

Do not rewrite service code, manifests, fixtures, generated output, or
organizational indexes. Those files can provide discovery or assessment evidence
without becoming contextual targets. The exact root `.editorconfig` remains
source-owned and outside this declaration.
