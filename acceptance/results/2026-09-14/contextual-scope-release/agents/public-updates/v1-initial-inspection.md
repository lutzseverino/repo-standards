# Public v1 initial-adoption inspection

## Acquisition and inspected identity

- Acquisition: the prepared external runtime was installed from public npm with exact dependency `@lutzseverino/repo-standards@1.1.0`; its lock record is retained in `session.json`.
- CLI executable: `/tmp/repo-standards-public-agent-F559Ph/node_modules/.bin/repo-standards`
- Observed CLI package identity: `@lutzseverino/repo-standards` version `1.1.0`.
- Runtime used for inspection: Node.js `v24.21.0`.
- Public standards source: `https://github.com/lutzseverino/repo-standards-example`
- Standards tag: `v1.0.0`
- Resolved public commit: `98b53f2087a4fe8a028ac60108a9545b7b9ea289`
- Profile: `service`
- Adopting project: `/tmp/repo-standards-source-xL9AFg`
- Bound project HEAD: `b4a70099a28dac117ceca13d6732348bd4b0a956`
- Inspection identity: `sha256:cdfeb35cebeffd65fee9813de541fc372bec1e4c1865b68c7eb9f6988ee0173a`
- Full report: `v1-initial-inspection.json` (file SHA-256 `41236a08be37b05905ed4f92271ad9b1a4dc116f4af7c6514c411a663d27d7ca`).

The report was created by direct public inspection with the exact command selection above. The project was clean before and after inspection, HEAD remained the bound commit, and the index diff remained empty. Inspection did not run prerequisite probes, fixes, or checks.

## Eligibility and current project observations

- `start.eligible` is `null` because author prerequisites are deliberately `not-checked` until start.
- There are no known start blockers.
- Git status is empty and `project.hidden` is empty.
- Existing `.repo-standards/` product state is missing.
- The product-owned `adopt-standards` system skill is missing.
- There are no author-declared skills in this profile, so there is no author-skill inventory or unrelated-skill exclusion to reconcile.
- There are no contextual directory targets or implicit globs. The only allowed contextual paths are `docs/operations.md` and `docs/operating-status.json`.

## Exact content and ownership

Declaration `editor-settings` creates the standards-owned exact file `.editorconfig`. Its supplied bytes are:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

The supplied file is non-executable and has SHA-256 `76565420d6347129e8c1b99ae259c764efa836509053365541eacebc5c27e188`. The current target is missing, so this is a create with no replacement or matching-file claim.

Declaration `operations-guide` leaves its contextual targets project-owned. `docs/operations.md` currently contains only the Harbor title, platform on-call escalation ownership, and the warning that the unauthenticated demonstration service must remain on loopback until security review. `docs/operating-status.json` is missing. The guidance requires useful, source-grounded Startup, Health, and Recovery documentation while preserving those warnings and ownership statements, and requires status to remain `unverified`.

Initial adoption also creates product-owned durable state under `.repo-standards/`, including the pinned runtime and retained inputs. The runtime dependencies and local run records are ignored implementation state; the commit review must account for all non-ignored durable outputs.

## Trusted operations disclosed before confirmation

Both operations run from the adopting project root with the host environment and network access. Their declared resources are retained inputs, not a sandbox. Inspection ran none of them, and the prerequisite remains unverified until start.

1. Fix `operations-guide/initialize-status`
   - Literal executable and arguments: `node` with `[]` (the CLI supplies the retained script `operations/initialize-status.mjs` through its operation protocol).
   - Working directory: `/tmp/repo-standards-source-xL9AFg`.
   - Timeout: 10 seconds.
   - Prerequisite probe: `node ["--version"]`; required range `>=24.0.0 <25.0.0`; inspection status `not-checked`.
   - Resources: none.
   - Behavior from the exact inspected script: validate the operation protocol and allowed target, then create `docs/operating-status.json` as `{ "status": "unverified" }` only when absent; otherwise preserve it.
   - Script SHA-256: `53c0cacb1fbef5eb302885da5672ca3384c5e45819ccc6edce2451b24fad052c`.

2. Check `operations-guide/operational-evidence`
   - Literal executable and arguments: `node` with `[]` (the CLI supplies the retained script `operations/check-operations.mjs` through its operation protocol).
   - Working directory: `/tmp/repo-standards-source-xL9AFg`.
   - Timeout: 10 seconds.
   - Prerequisite probe: `node ["--version"]`; required range `>=24.0.0 <25.0.0`; inspection status `not-checked`.
   - Resource: non-executable `operations/required-sections.json`, exact bytes `["Startup", "Health", "Recovery"]\n`, SHA-256 `fc1bde1264915f81b0c7458c82953f8ff456e08fdaaf18347b991261b0a402cd`.
   - Behavior from the exact inspected script: require `## Startup`, `## Health`, and `## Recovery` in `docs/operations.md`, and require `docs/operating-status.json` to parse with status exactly `unverified`.
   - Script SHA-256: `5c6378a3dc077e981cc80be7e30db408d5dafae4c84295bba95aeb6cde1ead53`.

The full report retains every supplied input byte, both complete script bodies, normalized manifest, exact project observations, and the existing `docs/operations.md` bytes for review.

## Confirmation boundary

No start command has been issued. Confirmation must be explicitly tied to inspection identity `sha256:cdfeb35cebeffd65fee9813de541fc372bec1e4c1865b68c7eb9f6988ee0173a`, CLI `1.1.0`, standards `v1.0.0` at commit `98b53f2087a4fe8a028ac60108a9545b7b9ea289`, profile `service`, and the two disclosed trusted operations above.

## Evaluator confirmation

I reviewed the complete public v1 inspection and explicitly confirm identity `sha256:cdfeb35cebeffd65fee9813de541fc372bec1e4c1865b68c7eb9f6988ee0173a`, public CLI 1.1.0, standards repository `https://github.com/lutzseverino/repo-standards-example` tag v1.0.0 at `98b53f2087a4fe8a028ac60108a9545b7b9ea289`, profile service, exact `.editorconfig`, contextual `docs/operations.md` and `docs/operating-status.json`, and both disclosed trusted operations, prerequisites, target scope, and observation limits. Append this confirmation verbatim. Start and complete the v1 adoption, author useful truthful Harbor docs/status, submit assessment/checks, capture full public acquisition and integrity evidence, then commit the completed adoption normally. Next inspect the independent public standards update to v1.1.0 while keeping CLI 1.1.0, record the complete update proposal/effects, and stop before confirmation with its exact identity. Do not combine or start the CLI update yet.
