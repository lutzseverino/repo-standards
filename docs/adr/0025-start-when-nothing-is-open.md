# Start when nothing is open

Amends [ADR 0021](0021-let-agents-decide-what-git-can-undo.md) and
[ADR 0024](0024-reuse-recorded-answers-that-are-provably-unchanged.md). An
agent that ran `adopt` always needed a second invocation to start: the first
printed an answers-file template, and the run began only once an answers file
named the inspection's identity, even when no question was open and no change
needed confirmation. With reuse under ADR 0024, an unchanged update still took
that round trip. As settled in decision 2 of the
[#281 grilling outcome](https://github.com/lutzseverino/repo-standards/issues/281#issuecomment-6319174701)
and specified in [#328](https://github.com/lutzseverino/repo-standards/issues/328),
`adopt` starts the run in the invocation whose fresh inspection holds all of
these:

- It requires no confirmation.
- Nothing blocks the start, and no `remote-setup` answer is `resolve`.
- No question is open. An answers file, a reused answer, or a default `adopt`
  already proposes as the answer, the version and the profile, answers a
  question. A scope draft, or a prefilled proposal an answers file has not
  carried back, stays open in every mode.

The start binds the identity it just computed and follows the ordinary start
path and its blockers. Its report describes the run as before and carries the
inspection summary, so the agent summarizes it in the handoff afterwards. Git
can undo the uncommitted result. With ADR 0024, an unchanged update is one
`adopt --json` invocation.

## Consequences

An inspection that requires confirmation keeps the rules of ADR 0021: the
answers file names its identity in `confirmation` and `inspection`, and a stale
identity stays missing. Otherwise `inspection` is never missing and an answer
naming another identity stops nothing. The question stays in the template, so
`repo-standards/answers/v1` files keep working.

`adopt` without an answers file is no longer a read-only preview and can start a
run, so this is a breaking change; `inspect` is the read-only preview. A terminal
session still asks a person before every start, because human terminal
questions stay human choices.

## Considered options

- **Keep the identity round trip.** This preserves a review step the agent
  cannot skip, but for changes Git can restore it adds an invocation with no
  decision in it.
- **Start without asking at a terminal too.** This would take a start decision
  from a person who is present to make it.
