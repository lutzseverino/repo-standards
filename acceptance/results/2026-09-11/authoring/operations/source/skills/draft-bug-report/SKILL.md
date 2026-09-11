---
name: draft-bug-report
description: Draft an evidence-based Markdown bug report from a reproduction during ordinary Node CLI development, without submitting it.
---

# Draft a bug report

Use this routine when asked to turn a reproduction into a useful bug report.
This skill has no standards-adoption role. Its whole directory is owned by the
standards source. Local edits conflict with the installed baseline and block an
update. A permitted update replaces the whole unchanged skill directory,
including its resources.

## Tools and limits

Use the agent's text/file tools and shell. For a Node reproduction require Node
24: run `node --version` and verify a major version of 24 before running it.
Do not install dependencies automatically. No network or credentials are needed
for the default local workflow. Ask before using additional tools, network,
credentials, or potentially destructive actions required by a reproduction.
When these are unavailable or not authorized, draft with that attempt explicitly
unverified; do not claim a passing or failing reproduction.

Use direct command argument vectors where available. Bound each reproduction
command to 10 seconds and 1 MiB of output per stream, recording timeouts and
truncation. Use no external service to submit or upload the report.

## Workflow

1. Read the supplied reproduction and relevant local context. Identify the
   expected behavior, actual behavior, environment, command, and minimal inputs.
   Ask for essential missing information, or label it unknown in a provisional
   draft. Distinguish user-reported behavior from your own observations.
2. Inspect the proposed command and any local code it executes before running
   it. Use a harmless disposable workspace when practical. Do not run a command
   whose effects cannot be reasonably assessed; describe that limit instead.
3. Probe Node and run the safe local reproduction within the limits above.
   Keep an accurate log of the command, working directory, inputs, exit status,
   stdout/stderr, and what the result establishes. Record failed attempts too.
   Never invent runs, output, causes, or checks that did not happen.
4. Draft Markdown with: title, environment, reproduction steps, expected
   behavior, actual behavior, and attempted actions/results. Include a minimal
   useful reproduction and relevant observed output. Label suspected causes as
   hypotheses, and list unknowns or reproduction limits. Avoid disclosing secrets
   or unrelated local/personal details in the draft.
5. Return the draft in the conversation unless the user supplied an output path.
   Preserve an existing output file unless replacement was authorized. Do not
   submit the report or contact maintainers.

## Completion

The draft includes actionable reproduction steps, separates expectation from
observation, and accounts for every attempted action and any unverified claim.
State where the draft was delivered and any remaining unknowns. A successful
example exercise demonstrates only that example, not general skill usefulness.
