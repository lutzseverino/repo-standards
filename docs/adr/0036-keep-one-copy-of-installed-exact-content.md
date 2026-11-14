# Keep one copy of installed exact content

An adopting repository keeps each installed exact file and exact skill once.
Retained inputs record an installed file's hash instead of a second copy of its
bytes, and the CLI reads the installed target after checking it against that
baseline; when the target was edited, it reads the verified source snapshot
instead. A file that a check, fix, probe or discovery script runs or reads as a
resource keeps its retained copy, so editing an installed file still cannot
change what a check runs. This takes Option B with Option C's fallback from the
retained exact content investigation
([`docs/development/retained-exact-content.md`](../development/retained-exact-content.md)),
whose recommendation to keep everything was never recorded as a decision, and
accepts the costs it lists: the edited-target guarantee now depends on the
snapshot, the lock format may need a raise, and the change takes its SemVer
class. [#519](https://github.com/lutzseverino/repo-standards/issues/519) carries
the change.

The owner chose this on 2026-11-13 ("Agreed."), in specification
[lutzseverino/repo-canon#1061](https://github.com/lutzseverino/repo-canon/issues/1061),
recorded in
[#519](https://github.com/lutzseverino/repo-standards/issues/519#issuecomment-6867482335).
#519 found what the second copy costs agents: a path search for one script
returned both copies, every grep over an adopter returned each rule or skill hit
twice, and an agent could open a stale retained copy instead of the current
one. It measured 129 to 132 identical blobs, about 1.05 MB per adopter, about
half of those bytes in check and run resources. The owner's direction for the
audit that found it was "Making sure we're not just building on top of stuff
and actually refactoring for ease of use, better long-term design."

## Considered options

- Keep everything (the investigation's Option A): rejected, because the
  duplicates outside check and run resources grew to 36.8% of the retained
  bytes, at the investigation's own revisit trigger, and their cost falls on
  every agent reading an adopter.
