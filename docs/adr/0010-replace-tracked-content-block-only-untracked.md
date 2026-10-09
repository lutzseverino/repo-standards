# Replace tracked content; block only untracked

Target ownership blocked content that Git can recover. An edited installed
file stopped an update, even when the edit already held the candidate bytes. A
differing author skill without a baseline stopped adoption, and so did a
system skill that an older CLI had installed. Each block
called for a hand-made restore or removal commit in the adopting project.
Meanwhile a differing tracked exact file was simply replaced. Now one rule
holds for every installation target in every run. The product replaces tracked
content, matches content that already equals the candidate, and removes a
target that the selection no longer installs. Only untracked content, which
Git cannot recover, blocks with `UNTRACKED_REPLACEMENT`.

The confirmed inspection takes over the edit block's job of making overwrites
deliberate. It lists every target whose replacement or removal discards
content that is not its installed baseline. At an initial adoption there is no
baseline, so every replacement of existing content is listed. Confirming the
inspection confirms each listed overwrite, and the run's uncommitted diff shows
what it discarded. Installed baselines remain for this list and for removing
retired targets.

The trade-off is that an edit to installed content no longer survives an
update by default. A maintainer who wants to keep it restores it from Git after
the run, or changes the standards source. An excluded or retired declaration's
installed content is removed too, rather than left behind without an owner,
unless it lies within contextual scope, where it stays as project content, or
inside a target the selection still installs, whose own action covers it.

[ADR 0017](0017-confirm-only-confirmation-required-changes.md) amends this
decision: each listed overwrite that discards edits is a confirmation-required
change, and `start` requires the maintainer's confirmation only when the
inspection lists one, rather than for every inspection.
