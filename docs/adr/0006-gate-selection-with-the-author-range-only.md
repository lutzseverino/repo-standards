# Gate standards selection with the author range only

Status: accepted design in the adoption-friction grilling of 2026-09-18;
specified in [issue #79](https://github.com/lutzseverino/repo-standards/issues/79).
Implemented by [issue #85](https://github.com/lutzseverino/repo-standards/issues/85) in
[PR #97](https://github.com/lutzseverino/repo-standards/pull/97) and released in
[CLI 2.0.0](https://github.com/lutzseverino/repo-standards/releases/tag/v2.0.0).

An author's `requires.repo-standards` range says which CLI versions the author
tested when an adopter selects that standards version. Repository Standards
also re-validated the range from the retained manifest during a CLI update, so
an exact or upper-bounded range stranded every established adopter: the pinned
CLI could not select the next standards version, and the next CLI could not
update the retained one. The range now gates selection of a standards version
only. A CLI update validates the retained standards against the candidate CLI's
supported source formats, which the product owns. Authors are told to declare an
open-ended minimum. The trade-off is that an adopter can run a CLI the author
never tested against their standards; the format version carries that
compatibility promise instead of the author.
