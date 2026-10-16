# Read repository-wide rules at the start of any work

Extends [ADR 0014](0014-leave-available-updates-to-the-maintainer.md).

The `repository-standards` skill read installed rules only before an agent
changed a file. Work that changes no file never reached them, including the
rules of repository-wide declarations, which cover the whole repository:
triaging an issue, writing tickets, applying labels, and asking the owner a
question. A source that keeps rules for that work in installed rules therefore
could not rely on an agent doing only that work reading them.

`rules` now accepts no path and prints only the repository-wide declarations'
rules. The skill that already runs at the start of work to report available
updates also runs it once, and the agent follows the printed rules throughout
that work. "Repository-wide" keeps its meaning: a declaration with rules that
covers no path, reported with coverage `repository`. The format gains no
marker, and `rules <path>` is unchanged.

## Considered options

- **A session-start hook.** It would work in only one agent, as ADR 0014 found.
- **A trigger before platform writes.** The product is platform-neutral and
  cannot see an agent's writes to an issue tracker or hosting platform.
- **An explicit author marker.** It would add to the format, which 7.0.0
  sources lack, and coverage `repository` already identifies these
  declarations.
- **Keep rules for work that changes no file in contribution guides.** The
  owner declined this on lutzseverino/repo-canon#370.

## Consequences

ADR 0014's consequence carries over: a skill description is advisory, so an
agent may not read the rules, and an agent without skill support never does. A
source that relies on start-of-work reading should require the CLI release that
adds the no-path form as its minimum. A 7.0.0 installation keeps its earlier
skill until it updates the CLI pin.
