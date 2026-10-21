# Reuse recorded answers that are provably unchanged

Amends [ADR 0003](0003-use-agent-discovery-with-confirmed-concrete-scope.md),
as amended by [ADR 0017](0017-confirm-only-confirmation-required-changes.md),
and [ADR 0021](0021-let-agents-decide-what-git-can-undo.md). Every update asked
again for every answer its last complete adoption had already recorded: a
fresh scope for each discovery declaration, a deferral for remote setup that is
still not ready, and an assessment of each contextual declaration. An update
that changed nothing an answer was about still needed an answer round and
contextual work. As settled in decision 1 of the
[#281 grilling outcome](https://github.com/lutzseverino/repo-standards/issues/281#issuecomment-6319174701)
and specified in [#327](https://github.com/lutzseverino/repo-standards/issues/327),
an update reuses a recorded answer without asking when what it was about is
provably unchanged, and proposes the rest for review.

Inspection, discovery scripts and readiness probes still run fresh in every
invocation, and each recorded answer is classified against what they report:

- A **scope answer** is reused when the discovery declaration's discovery
  guidance and rules are hash-identical to the ones the last complete adoption
  recorded, its fresh discovery-script draft equals the draft the recorded
  entry was decided from, and every path the entry names still exists. A
  declaration without a discovery script has no draft. The inspection binds a
  reused entry as it binds any scope answer.
- A **remote setup deferral** is reused while the same probe, with an
  unchanged definition, still reports the same fix not ready. The run records
  the deferral with the fresh reason, and a ready probe applies the setup as
  before.
- An **assessment** is reused when the declaration's rules, or its adoption
  guidance when it has no rules, and the files in its scope are unchanged since
  the last complete adoption, judged after the run's fixes. When every
  contextual declaration's assessment is reused, the run accepts them, bound to
  itself, and goes on to its checks without pausing.

Anything else comes back prefilled with the recorded answer, its context
naming what changed, for the updating agent to validate and carry back as an
ordinary answer. A confirmation, a fix's overwrite answer, and a fix deferred
because the maintainer declined its overwrite are never reused: a confirmation
is about the edits the fresh inspection discards, and the others are the
maintainer's decision ([ADR 0021](0021-let-agents-decide-what-git-can-undo.md)).
An answer the agent gives itself replaces a reused one; an answer equal to the
reused one keeps it reused. Each reused answer is recorded with what made it
eligible, in the run record, durable state, `status` and the adoption record,
so its review rests on the same evidence as a fresh answer's.

## Consequences

The confirmed scope is still part of every inspection and every run; what
changes is who writes it when it is unchanged. ADR 0003's requirement that
historical scope is not evidence of current coverage is kept: a recorded scope
is reused only when the fresh evidence, the draft over the fresh observation,
reproduces what it was decided from.

Retained scope evidence keeps the draft each confirmed entry was decided from,
so the start's inspection runs discovery scripts even with a proposal. Durable
state records the reused answers and each contextual declaration's scoped
files, by identity, at completion. The formats whose keys change rise once:
`state/v8`, `scope-history/v6`, `run/v7`, `status/v9`, `work-request/v5` and
`adopt/v2`; the answers file keeps `answers/v1` and marks a reused or proposed
answer in its question's `details`.

An update must complete from the previous release's records, so this CLI also
reads `state/v7` and `scope-history/v5` as the established adoption it
updates. Those records keep no drafts and no per-declaration scope identity: a
fresh draft then matches only the recorded entry itself, and an assessment is
proven unchanged only by the whole project's work snapshot.

## Considered options

- **Keep asking every answer.** Each update repeats work whose outcome is
  already recorded and provably still holds, and an unchanged update cannot
  complete in one run.
- **Replay recorded answers with one confirmation.** A single confirmation
  would accept answers about content that changed, without naming what did.
- **Reuse answers whatever changed.** A changed guidance, rule, draft, probe or
  scoped file can invalidate the answer, so it is proposed instead.
