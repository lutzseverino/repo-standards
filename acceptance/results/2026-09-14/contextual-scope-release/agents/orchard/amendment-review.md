# Orchard additions-only scope amendment review

The active run is `91c11a5c-6f3f-49ce-a06b-63af550f9d39`. Its currently
accepted revision is the original complete inspection identity
`sha256:88109e42f53b83a0e495dda1a5a2b4c28feb9a243ed512ff8469b29c22605842`.

The complete additions-only amendment preview is
`amendment-pass2.json` (SHA-256
`2f4a2e12e4116fab998bd3bb06bfb855a3c98a94626538cc1cfe39a27c86f38b`).
Its action is `amend-scope`, its amendment is eligible with no amendment
blockers, and its confirmation identity is:

`sha256:d5f595360e04ed5a105024d3f354ba40083aceb6155b9c269bcab63d08bf1d21`

The report's `start` section contains the expected `AMENDMENT_ONLY` blocker:
this identity can only continue the active run and cannot start another
adoption.

## Selection

- CLI: `@lutzseverino/repo-standards` 1.2.0, now invoked from the installed
  project-local runtime.
- Standards: `https://github.com/atlas/standards`, `v1.0.0`, commit
  `d2f0ecb0c4fad52bc4cbf5ff223ba59d2663dd77`.
- Profile: `maintained`.
- Project: `/tmp/repo-standards-source-Aarb1O`, HEAD
  `5f64286bb6d2262a1517ce321219783fb6ba7d58`, unchanged index.

## Why the addition is required

At the contextual handoff I inspected `CATALOG.md` without editing it. Its exact
70-byte UTF-8 content is:

```markdown
# Orchard catalog

- [Pear API operations](legacy/pear-operations.md)
```

Its content SHA-256 is
`c64590338589c892f251e47a3d382c1a32be52b7c3e2e4a0757a66b017eaadee`,
its discovery evidence identity is
`sha256:66b12bb1732d8cd39c145a7bb8c9d85dbd7393e7cdcdbdc994a36f49f60e6c11`,
and it remains clean in Git. The accepted migration deletes
`legacy/pear-operations.md`, so leaving this file out of scope would create a
broken link. The proposal adds only `CATALOG.md` so the link can be repaired to
the already authorized destination. The exact intended replacement content is:

```markdown
# Orchard catalog

- [Pear API operations](docs/projects/pear/operations.md)
```

No bytes have been written to `CATALOG.md`.

## Full existing and proposed scope

Existing scope:

- `documentation-catalog` paths: `docs/catalog.json`; directories: none.
- `project-documentation` paths: `docs/projects/index.md`,
  `docs/projects/pear/operations.md`, `legacy/pear-operations.md`, and
  `products/pear/README.md`; directories: none.

Proposed scope:

- `documentation-catalog` paths: `docs/catalog.json`; directories: none.
- `project-documentation` paths: `CATALOG.md`, `docs/projects/index.md`,
  `docs/projects/pear/operations.md`, `legacy/pear-operations.md`, and
  `products/pear/README.md`; directories: none.

The only addition is `project-documentation: CATALOG.md`. No target is removed,
transferred, or changed under `documentation-catalog`. Exact
`docs/catalog.json` remains source-owned and outside contextual scope. The full
proposal, including all retained candidate decisions and exclusions, is in
`amended-scope-proposal.json` (SHA-256
`a97f22acc8c47f37716a21a168c7773cbe36285c0ed5d74895c73ecdbe347a17`).

## Prior work and observations

The confirmed `start` report is `start.json` (SHA-256
`1f4272831b3d41e28d21d5495115e86de9650749d1107a7aaf8315233bb6447d`).
It installed the exact `docs/catalog.json`, the project-local system skill,
retained inputs, isolated runtime, selection and lock data. Both Node
prerequisite probes succeeded and reported version 24.21.0. The first fix ran
successfully with result `unchanged` and message “Markdown endings already
satisfy the source.” The run then stopped incomplete in phase `contextual`, as
expected.

The amendment preview retains the recorded successful fix, has no assessments,
and shows no agent changed paths, boundary changes, or observation violations.
HEAD and the index are unchanged. The current working-tree additions are the
confirmed installation outputs; none of the contextual migration targets has
been edited.

## Full operation disclosure

The amendment does not change operations. It will replay the fix after
acceptance and later run the check after fresh contextual work and assessment.
Both operations are owned by `project-documentation`:

1. Fix `normalize-markdown-ending`: executable `node`, script
   `operations/markdown-ending.mjs`, resources `[]`, literal arguments `[]`,
   timeout 30 seconds.
2. Check `verify-markdown-ending`: executable `node`, the same script, resources
   `[]`, literal arguments `[]`, timeout 30 seconds.

For each operation the prerequisite probe is literal vector
`["node", "--version"]`, required range `>=24.0.0 <25.0.0`, from the project
root with the same 30-second timeout. The direct operation vector is
`["node", "<absolute retained operations/markdown-ending.mjs>"]`, also from the
project root. The script SHA-256 is
`cc333786362309d1e05db95acb7c634539ab5e99cbad96998c7172177009511d`;
its exact bytes are:

```javascript
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const changed = [];
const invalid = [];

for (const target of input.allowedTargets.paths) {
  if (!target.endsWith('.md') || !existsSync(target) || !lstatSync(target).isFile()) continue;
  const path = resolve(target);
  const content = readFileSync(path);
  if (content.length > 0 && content.at(-1) === 0x0a) continue;
  if (input.operation.phase === 'fixes') {
    writeFileSync(path, Buffer.concat([content, Buffer.from('\n')]));
    changed.push(target);
  } else invalid.push(target);
}

const failed = input.operation.phase === 'checks' && invalid.length > 0;
console.log(JSON.stringify({
  format: 'repo-standards/result/v1',
  status: failed ? 'failed' : changed.length > 0 ? 'changed' : input.operation.phase === 'checks' ? 'passed' : 'unchanged',
  message: failed
    ? `Markdown files without a final newline: ${invalid.join(', ')}`
    : changed.length > 0 ? `Added final newlines: ${changed.join(', ')}` : 'Markdown endings already satisfy the source.',
}));
```

The probes and scripts are trusted code with the invoking user's host,
environment, and network access. Declared resources govern retention and do not
sandbox execution. This inspection preview executed none of them. Acceptance
will replay the fix across the five proposed contextual paths, including
`CATALOG.md`, and will require a fresh contextual assessment and check.

## Confirmation boundary

No `resume --amend-scope` command has run. After explicit confirmation, the
bound continuation command would be:

```text
node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json --local resume --amend-scope --scope /srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/amended-scope-proposal.json --confirm sha256:d5f595360e04ed5a105024d3f354ba40083aceb6155b9c269bcab63d08bf1d21 --json
```
