# Leave archived run/v6 reports unread

Amends [ADR 0007](0007-write-and-read-one-evidence-format.md), as amended by
[ADR 0024](0024-reuse-recorded-answers-that-are-provably-unchanged.md). ADR
0024 lets an update complete from the records CLI 9.0.0 committed, but a run
report CLI 9.0.0 archived in Git's directory, when one of its runs was
abandoned or replaced, carries `repo-standards/run/v6` and still failed the
update with `RETIRED_FORMAT` until the adopter moved it out of Git's directory
by hand. As decided in
[#359](https://github.com/lutzseverino/repo-standards/issues/359#issuecomment-6349874713),
an archived run report whose format is exactly `repo-standards/run/v6` is left
where it is and not read. Archived reports are the history of runs that ended.
This CLI never adopts again in place over a run another CLI wrote, so no
current recovery depends on one.

## Consequences

Nothing is moved, deleted, rewritten or converted: the report and its run-ID
evidence directory keep their bytes, and CLI 9.0.0 still reads them. Every
reader of archived reports skips them alike, so `status` does not list them,
they are never preserved changes, and the state-integrity diagnostic never
names their runs. Uncommitted changes such a run left remain the adopter's to
finish with CLI 9.0.0, or to commit or discard. The active run record keeps its
single format: one in an older format still fails with `RETIRED_RUN`. Archived
reports in other older run formats still fail with `RETIRED_FORMAT`, newer ones
with `NEWER_FORMAT`, and malformed ones as before.

The skipped format is named explicitly rather than derived from the current
run format, so a later run-format raise neither re-enables the refusal for
these reports nor skips another format. Skipping any other format is a
separate contract decision.

## Considered options

- **Move the reports out of Git's directory automatically.** Archives sit
  outside what Git can undo; the move would add partial-failure states and need
  a destination and an evidence layout of its own.
- **Read `run/v6` through the previous-format table.** That table also governs
  the active run record, so an active `run/v6` record would no longer fail with
  `RETIRED_RUN`.
- **Decode archived `run/v6` reports separately.** A historical schema confined
  to archives would add decoding and history/recovery surface. The update only
  needs these reports to stop blocking; leaving them unread achieves that
  without another decoder.
