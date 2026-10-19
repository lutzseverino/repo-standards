# Replace a stopped run in place

Amends [ADR 0009](0009-correct-scope-by-adopting-again.md). In the first clean
agent adoption of lutzseverino/postern, a stopped run could only be ended:
correcting its scope meant abandoning it, committing or discarding its changes,
and adopting again, and after abandonment the agent restarted from a fresh
clone, repeating every answer. On 2026-10-19 the owner asked for a recovery
path that does not involve restarting;
[#312](https://github.com/lutzseverino/repo-standards/issues/312) records the
contract.

A scope correction is still a new run with a new confirmed scope, and an
active run's scope still never changes: scope amendment stays removed. The new
run no longer needs the old one abandoned and resolved by hand. A changed scope
answer to a run stopped for its scope, or `adopt` in a checkout where a run was
abandoned, replaces that run in place: its report is archived as abandonment
archives it, the unchanged selection is inspected with the new scope, and a new
run starts over the changes the old one left. The Git start blockers exempt
exactly the uncommitted state the old run's last observation recorded, and the
last complete adoption an update replaces is read from the HEAD the old run
started from. Fixes run again because they are repeat-safe, the preserved
contextual work is reassessed under the new scope, and the new run's change
set covers every change since that HEAD. A scope answer is Git-undoable, so
the agent may change it without asking.

Abandonment exits 0 once it succeeds, and a fix's declined overwrite defers
the whole fix instead of leaving abandonment as the only alternative: the run
records it as deferred and continues, and every later run runs it again.

## Consequences

Abandonment archives the run's saved installation and its last observation
beside its report, so a later start can verify what the run left and carry its
changes. The run, state, inspection, and adoption report formats keep their
keys: a deferred fix uses remote setup's deferral record, the scope questions
of a stopped run are ordinary answers-file questions, and the changes a
replaced run left travel in the new run's saved installation. The replaced
run's own evidence stays in its archived report, not in committed state, which
still holds the current run only
([ADR 0011](0011-retain-only-the-current-run.md)).

Any uncommitted change the old run did not record still stops the agent with
`DIRTY_PROJECT`, under #307's stop-and-tell rule, and selecting another CLI,
source, version, or profile does not adopt in place.

## Considered options

- **Keep correcting by adopting again from a clean checkout.** Its rough edge
  was meant to be paid rarely, but the first clean agent adoption paid it and
  restarted from a fresh clone.
- **Amend the active run's scope.** ADR 0009 removed that machinery: replaying
  fixes and revalidating outgoing scope inside one run cost every release. A
  replacement run reuses the ordinary inspection, start, and change-set
  machinery instead.
- **Apply part of a declined fix.** Creating missing settings while skipping
  overwrites needs a fix-protocol change across standards sources; deferring
  the whole fix needs none.
