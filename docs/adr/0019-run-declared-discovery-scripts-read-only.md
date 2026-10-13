# Run declared discovery scripts read-only during inspection

Supersedes in part
[ADR 0003](0003-use-agent-discovery-with-confirmed-concrete-scope.md).

ADR 0003 left discovery to agents interpreting prose and excluded
author-executed discovery hooks. In practice, sources wrote scope drafters
anyway, and their guidance told agents to run them by hand from a path it
hard-coded. Each agent then ran author code that no declaration disclosed or
bounded.

A declaration with discovery may now name a discovery script, declared like a
check: executable, script, resources, prerequisite and timeout. When discovery
is required, `inspect` probes its prerequisite and runs it. A source's checks
and fixes already run as trusted author code in the adopting project, so a
discovery script adds no new kind of trust. It carries the same bounds: a
declared invocation, retained script and resources, a prerequisite probe, a
timeout, and one process group. It is also read-only. It runs in a copy of the
project's observed files, and any change it makes to that copy fails the
inspection, as a timeout does, so the project is unchanged either way. The
copy protects the project, not the host: like checks and fixes, the script
remains trusted code.

The script never decides. Its only output is a draft scope proposal for its
declaration, with the questions it cannot answer. The person or agent answers
those questions and submits the proposal with `inspect --scope`. The CLI never
accepts a proposal with unanswered questions, and the draft is reviewed with
the inspection, like a proposal an agent writes alone. Prose discovery guidance
remains valid, with or without a script.

The rest of ADR 0003 stands: discovery yields concrete file paths, the proposal
is reviewed with the inspection, and, as
[ADR 0017](0017-confirm-only-confirmation-required-changes.md) decides,
confirmation is needed only for a confirmation-required change.

## Considered options

- **Keep discovery prose only.** Sources would keep shipping undisclosed
  drafters that agents run by hand, with no prerequisite, timeout or
  read-only bound.
- **Let the script decide scope.** Membership is a judgment the maintainer
  owns. A script that decided it would turn its open questions into silent
  defaults.
- **Run the script in the project and detect writes afterwards.** A script
  that wrote would leave the project changed after inspection failed.

## Consequences

Inspection runs declared discovery scripts and their prerequisite probes, but
only when discovery is required. Source validation still runs no author code.
A failing script stops inspection until its source fixes it. The script sees
the project's tracked and non-ignored files without Git metadata, which is the
same set discovery evidence comes from.
