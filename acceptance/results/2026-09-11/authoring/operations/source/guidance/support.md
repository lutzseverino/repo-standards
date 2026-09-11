# Support destination

Keep the project-owned `docs/support.json` present as a JSON object.
Use either:

- `"status": "unverified"` with `"reportProblems": null` when no reporting
  destination has been supplied.
- `"status": "configured"` with a nonempty, non-whitespace `"reportProblems"`
  string containing the project's URL, email address, or reporting instructions.

Additional project fields are allowed. Configured means supplied, not verified;
no network verification or real destination is invented. The placeholder is an
acceptable unresolved support state.

The policy's repair runs when this policy is adopted. It creates only a missing
file, using the exact declared placeholder resource, and creates `docs` if needed.
It never overwrites existing destinations or malformed content. Preserve existing
file bytes; explain malformed or inconsistent content and request a maintainer's
correction. An interrupted partial file also needs manual correction.

The read-only check checks presence, JSON parsing, and the two shapes above.
It does not establish destination reachability or usefulness. Both operations
block on symlinks, unsuitable path types, or filesystem errors. If this declaration
is excluded in a future profile, neither operation runs.
