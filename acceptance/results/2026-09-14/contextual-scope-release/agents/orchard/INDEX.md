# Orchard evidence index

## Initial adoption and controlled recovery

- `environment.json`, `session.json`, and `hashes.txt`: prepared-session,
  package, skill, host, and artifact identities.
- `inspection-pass1.json`, `scope-proposal.json`, and `inspection-pass2.json`:
  initial two-pass discovery and confirmed inspection
  `sha256:88109e42f53b83a0e495dda1a5a2b4c28feb9a243ed512ff8469b29c22605842`.
- `start.json`, `catalog-observation.json`, `amended-scope-proposal.json`, and
  `amendment-pass2.json`: contextual handoff and confirmed scope amendment
  `sha256:d5f595360e04ed5a105024d3f354ba40083aceb6155b9c269bcab63d08bf1d21`.
- `interruption-*`, `status-after-interruption.json`, and
  `interruption-status-summary.json`: controlled interruption and durable uncertain
  operation evidence.
- `retry.json`, `assessment.json`, `completion.json`, and `final-status.json`:
  authorized retry and complete initial run
  `91c11a5c-6f3f-49ce-a06b-63af550f9d39`.
- `operation-inputs.json`, `operation-results.json`, `integrity.json`,
  `link-checks.json`, and `final-*`: operation, link, binary diff, full-content,
  mode, HEAD, index, package, fixture, and exact-byte review.
- `transcript.md`: chronological decision record, confirmations, commands,
  operator errors, trust boundaries, outcomes, and limitations.

## Corrected retained re-adoption after repository growth

Directory `retained-readoption-retired-pear/` contains the complete clean
readoption journey at corrective commit
`a3d4a0942816042b8d34819b309988492857c483`:

- `inspection-pass1.json`, `scope-proposal.json`, `inspection-pass2-invalid.json`,
  and `inspection-pass2.json`: fresh retained discovery, one diagnosed proposal
  evidence error, and confirmed inspection
  `sha256:ac6ca2894bee92291b10db3b12b836f9e7864852520053775d1c53bee83841f8`.
- `pear-before-after.json`, `project-observations.json`, `environment.json`,
  `source-acquisition.*`, and `read-only-verification.json`: retirement bytes,
  clean checkout, restored public runtime, closed-source environment, package
  identity, and inspection read-only proof.
- `start.json`, `resume-refresh.json`, `assessment.json`, `completion.json`, and
  `final-status.json`: complete zero-contextual-change re-adoption run
  `6eda44d4-2a19-4436-b4b5-7499f809dced`.
- `scope-delta.json`, `operation-record.json`, `completion-integrity.json`,
  `final-content-review.json`, `final-output-inventory.json`, and
  `final-tracked.diff`: historical/current scope distinction, exact operation
  evidence, complete durable-output content/mode review, and post-run integrity.
- `review.md`: full selection, proposal, confirmation, execution, trust boundary,
  recovery history, output review, and limitations.

The earlier inspection
`sha256:850b5a6ea0ec949e48d4bb5dfefc3e769bd41e70f4e9ebefdc69b324f6ef2fc7`
at Plum-growth commit `ebecf70af22e48928990df0402cba37bae294a96` is recorded as
superseded in `retained-readoption-retired-pear/review.md`; Pear still had its
service manifest in that snapshot, so that identity was never confirmed or
started.

## Retroactive authorization rejection

Directory `retroactive/` contains the separate intentionally incomplete negative
session. `01-*` through `09-*` are its captured inspection, confirmation, start,
out-of-scope edit, rejected amendment, status, hashes, and diff. `10-audit.md`
and `11-audit.json` are the read-only audit: the CLI rejected retroactive scope
authorization with `ASSESSMENT_SCOPE`, issued no amendment identity, and retained
the run as incomplete. No completion or reconciliation was attempted.

`artifact-index.json` inventories evidence file sizes and SHA-256 hashes.
`hashes.txt` is the line-oriented checksum index for every evidence file except
itself.
