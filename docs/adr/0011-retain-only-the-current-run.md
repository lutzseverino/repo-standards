# Retain only the current run

Amends [ADR 0005](0005-retain-work-evidence-as-identities-and-deltas.md) and
[ADR 0007](0007-write-and-read-one-evidence-format.md).

ADRs 0005 and 0007 made each run's committed evidence compact, but every
completion still carried all earlier runs forward: durable state kept an ordered
history of each prior run's work evidence, and the retained scope evidence kept
every earlier discovery run with its full project observation. Committed
evidence therefore grew with every run. Repo Canon's scope evidence grew from
348 KB to 576 KB in one run, and its state doubled. No reader looks further
back than the previous run, and only for its confirmed scope, to report what a
new run added and removed.

Committed evidence now holds the current run only. Durable state keeps the
current run's work evidence. Retained scope evidence keeps the current run's
discovery in full and its scope change against the previous run, computed when
the run is planned from the confirmed inspection and the recorded adoption it
updates. `status` reports that stored change instead of comparing two stored
runs, and nothing reads an earlier run from committed evidence. Repeated
updates keep committed state and scope evidence at a constant size.

The trade-off is that a fresh checkout no longer explains an earlier run's
authorized work or scope from the committed files alone. Git history keeps
every earlier run's committed evidence, in the adoption commits that reviewers
already read, so that explanation is a checkout away rather than a growing cost
of every later run. Formats whose shape changed are raised and their earlier
versions retired, as ADR 0007 requires.
