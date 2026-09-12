# Review checklist

## personal-tools

README.md should remain brief and contain:
- A brief explanation of the utility's purpose.
- One working invocation for the project.
- A brief explanation of relevant failure cases and how the utility reports them.
- A short explanation of its input/output, including paths or stdin/stdout where relevant.

No particular headings or setup section are required. Review the documentation
of an invocation; do not execute it or assert it works without execution evidence.

CONTRIBUTING.md should briefly explain how to report a reproducible bug.
No contribution workflow is prescribed.

## team-services

README.md should explain the service's purpose, startup command, and health
endpoint using project facts. No tiny-tool invocation or sample output is
required beyond the startup command.

Runbooks under docs/runbooks/ should describe a recovery procedure and identify
an owner to contact. Use the actual procedures and ownership information.
CONTRIBUTING.md is outside this profile's governance and this review.
