# Orchard initial acceptance journey: inspection and decision record

Date: 2026-09-14  
Project: `/tmp/repo-standards-source-Aarb1O`  
Prepared session: `/tmp/repo-standards-public-agent-gNdlDb/journey.json`

## Exercise boundary

This is the first phase of the evaluator-requested staged-discovery exercise. I
used the product worktree only through `acceptance/cli.ts` as the prepared-session
execution bridge and wrote evidence only beneath this Orchard evidence directory.
I did not inspect product implementation, product tests, Atlas source in the
product checkout, or any other agent's evidence.

The exercise explicitly requires root `CATALOG.md` to remain outside the initial
proposal and unchanged. The CLI inventoried and hashed it as eligible evidence,
but I did not open its content during this phase. During later contextual work I
will inspect it, follow its legacy link, and, if it needs repair, stop writing to
that path until an additions-only scope amendment has been previewed and the
maintainer has explicitly confirmed the amendment. The exact target
`docs/catalog.json` is also outside contextual scope because the standards source
owns its bytes.

I stopped before `start`. No author prerequisite probe, fix, check, or contextual
edit has run.

## Installed package and environment

The exact external CLI is `@lutzseverino/repo-standards` 1.2.0 at
`/tmp/repo-standards-public-agent-gNdlDb/node_modules/.bin/repo-standards`.
The npm lock records the tarball integrity as
`sha512-upetHlGX7xhNxUiWY5V88rTyLpv2umoq9zx+y1aKfAbjA24hbPuZl3ZCFAL81rQ+fUw1aL+253O/mE7W8Agdog==`.
The installed 82-file package-tree manifest hash is
`sha256:66da0afcec7dd3879567c4134c644d1d40b79a312f20a7bbe9d608236b407273`.
The complete installed `adopt-standards/SKILL.md` hash is
`sha256:6508d7acca0ced142bb198b85b8fd194d71901b35bb865f21e4ea9c3ea52fd54`.
The tree-hash method and complete acquisition environment are in
`environment.json`.

Observed host tools were Node v24.14.0, npm 11.9.0, Git 2.47.3, Linux
6.18.34+rpt-rpi-v8 on aarch64, and glibc 2.41. The prepared environment points npm at
the public registry and imports an HTTPS response fixture. The session describes
acquisition as public npm plus an explicit GitHub-response fixture backed by the
independent Git source `/tmp/repo-standards-source-Gs4ygo` at commit
`d2f0ecb0c4fad52bc4cbf5ff223ba59d2663dd77`.

## Commands and inspection identities

Both report-producing commands ran from the Orchard Git root through the allowed
bridge:

```text
node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json inspect --source https://github.com/atlas/standards --standards-version v1.0.0 --profile maintained --json
```

The discovery-required first pass is `inspection-pass1.json`, whose SHA-256 is
`31258848cd868ccd951bbba5edf419e1b274aa65d6562bd8d10651d111c299c7`.
Its inspection identity is
`sha256:217936f84474c87bea9bb637c126b91f56e4fe101062c0ddbcd8cbf27d5e21d1`,
and its discovery request identity is
`sha256:c5a6fa99fa4559d58d3b0109a5636a0056e201a7360528487476a25d449ebfa3`.

```text
node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json inspect --source https://github.com/atlas/standards --standards-version v1.0.0 --profile maintained --scope /srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/scope-proposal.json --json
```

The final complete report is `inspection-pass2.json`, whose SHA-256 is
`ce71de18c6fc181003f901fb824f35a58ac57e444b40710a414e3578d6523d29`
(this value is verified again in the final file inventory). Its complete
inspection identity is
`sha256:88109e42f53b83a0e495dda1a5a2b4c28feb9a243ed512ff8469b29c22605842`.

The complete selection bound by that identity is:

- CLI: `@lutzseverino/repo-standards` 1.2.0.
- Standards: `https://github.com/atlas/standards`, tag `v1.0.0`, resolved commit
  `d2f0ecb0c4fad52bc4cbf5ff223ba59d2663dd77`.
- Profile: `maintained`.
- Adopting project: `/tmp/repo-standards-source-Aarb1O`, HEAD
  `5f64286bb6d2262a1517ce321219783fb6ba7d58`, clean status and unchanged index.

The first proposed index path was `docs/projects/README.md`. Scope validation
rejected it because a missing README requires positive membership evidence in
its own directory, which does not yet exist. That full diagnostic remains in
`inspection-pass2-invalid.json`. I changed the introduced index to
`docs/projects/index.md`. A later review also found that my initial prose
overstated the evidence as build/deploy commands. The manifest actually supplies
ownership and a start command; the legacy guide supplies deployment health-check
and recovery instructions. I corrected the rationale and retained the preceding
valid report in `inspection-pass2-preclarification.json` before producing the
final identity above.

## Candidate decisions and concrete scope

Pear is the only included maintained project. Its directory lacks a README, but
`products/pear/service.json` positively names the service `pear-api`, owner
`orchard-runtime`, and operating command `node server.mjs`. The separate tracked
`legacy/pear-operations.md` documents health-check failure after deployment and
recovery by restoring the previous image while retaining the failed revision.
Together these establish ownership and operational/deployment evidence without
relying on the absent README.

The final contextual scope has four individual paths:

- `products/pear/README.md`: new project README.
- `legacy/pear-operations.md`: old source, individually authorized for deletion
  after its useful content is preserved.
- `docs/projects/pear/operations.md`: individual migration destination.
- `docs/projects/index.md`: introduced documentation index.

The exclusions are evidence-backed:

- `fixtures/sample` is excluded because its sole manifest is exactly
  `{"name":"fixture-only"}`.
- `generated/site` is excluded because its README says the file is generated and
  must remain unchanged.
- `teams` is excluded because `teams/runtime.md` says it groups people and is not
  a deployable project.

No candidate is unresolved. Root `CATALOG.md` is deliberately deferred under the
exercise boundary above and grants no initial write authority. Exact
`docs/catalog.json` is separately source-owned and excluded from contextual
scope.

## Exact target content and migration plan

The exact declaration `documentation-catalog` will create
`docs/catalog.json` with these exact UTF-8 bytes (including the final newline):

```json
{
  "format": "atlas-documentation/v1"
}
```

The following contextual content is the concrete planned agent work after a
confirmed start and contextual handoff. It is disclosed for review now; it has
not been written.

`products/pear/README.md`:

~~~markdown
# Pear API

Pear API is maintained by the `orchard-runtime` team.

## Run

From `products/pear`, start the service with:

```sh
node server.mjs
```

## Operations

See the [operations guide](../../docs/projects/pear/operations.md) for deployment
health checks and recovery.
~~~

`docs/projects/pear/operations.md` preserves the complete old source verbatim:

```markdown
# Pear API operations

Start the service with `node server.mjs`. If health checks fail after a deploy,
restore the previous image and keep the failed revision for investigation.
```

`docs/projects/index.md`:

```markdown
# Project documentation

- [Pear API](../../products/pear/README.md)
- [Pear API operations](pear/operations.md)
```

After preserving those bytes, `legacy/pear-operations.md` will be deleted. The
migration therefore treats deletion and creation as separate authorized changes.
No undocumented setup command or project purpose is invented; later contextual
review may use newly inspected in-scope evidence, and any newly required path
must go through the explicit amendment flow.

## Operations, prerequisites, and trust boundary

The standards declare two operations, both owned by
`project-documentation`, both using retained source script
`operations/markdown-ending.mjs`, whose SHA-256 is
`cc333786362309d1e05db95acb7c634539ab5e99cbad96998c7172177009511d`.
The exact script is:

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

The operation details are:

1. Fix `normalize-markdown-ending`: executable `node`, script above, resources
   `[]`, literal arguments `[]`, timeout 30 seconds.
2. Check `verify-markdown-ending`: executable `node`, same script, resources
   `[]`, literal arguments `[]`, timeout 30 seconds.

Each prerequisite probe is the literal vector `["node", "--version"]`, run from
the project root, with required npm SemVer range `>=24.0.0 <25.0.0` and the same
30-second timeout. Each operation invocation is the direct vector
`["node", "<absolute-retained-operations/markdown-ending.mjs>"]`, with JSON input
on stdin, from `/tmp/repo-standards-source-Aarb1O`. There is no shell expansion.

Inspection executed neither probe nor operation. The report therefore says
`start.eligible: null`, `start.prerequisites: "not-checked"`, and has zero known
blockers. The manually observed Node v24.14.0 appears compatible but is not CLI
prerequisite evidence; `start` will probe it.

Confirmation authorizes trusted code. The probes and operations inherit the
invoking user's host, environment, and network access. The empty resource list
controls retained inputs only and is not a sandbox. The CLI observes project
changes around operations, but that observation is not continuous isolation.

## Read-only verification

`project-before.txt` and `project-after.txt` each contain the project HEAD,
porcelain-v2 status, complete staged index entries, and a sorted SHA-256/mode
snapshot of every regular file outside `.git`. `cmp` returned 0. HEAD remained
`5f64286bb6d2262a1517ce321219783fb6ba7d58`; status stayed clean; and
`git diff --cached --quiet` returned 0. Thus both inspection passes and my project
review left HEAD, index, and project content unchanged.

## Confirmation boundary

The reviewable confirmation token is the complete inspection identity
`sha256:88109e42f53b83a0e495dda1a5a2b4c28feb9a243ed512ff8469b29c22605842`.
Starting would require the same exact CLI, selection, proposal, and identity.
No `start` command was run in this phase.

If the maintainer explicitly confirms that identity and the disclosures above,
the next command would be:

```text
node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json start --source https://github.com/atlas/standards --standards-version v1.0.0 --profile maintained --scope /srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/scope-proposal.json --confirm sha256:88109e42f53b83a0e495dda1a5a2b4c28feb9a243ed512ff8469b29c22605842 --json
```

## Maintainer confirmation

I reviewed the complete report and proposal. I explicitly confirm inspection identity `sha256:88109e42f53b83a0e495dda1a5a2b4c28feb9a243ed512ff8469b29c22605842` for CLI 1.2.0, Atlas fixture-source commit d2f0ecb0c4fad52bc4cbf5ff223ba59d2663dd77 at v1.0.0, profile maintained, exact docs/catalog.json, the four disclosed contextual paths, and both disclosed trusted Node operations with their host/environment/network access. Append this confirmation verbatim to transcript.md. Run confirmed start with the same proposal. At contextual handoff, inspect root CATALOG.md; do not edit it. Preview a complete additions-only scope amendment that adds CATALOG.md for its legacy link repair, disclose the amended identity and full old/new scope and operations, then stop and ask for a second explicit confirmation before `resume --amend-scope`. Record full JSON and content observations.

## Confirmed start and amendment preview

The confirmed start produced run `91c11a5c-6f3f-49ce-a06b-63af550f9d39`
and stopped at the expected contextual handoff. Its full JSON is `start.json`.
Exact installation completed; both Node probes succeeded with version 24.21.0;
the fix `project-documentation/normalize-markdown-ending` returned `unchanged`;
checks await contextual work and assessment.

I then read the installed project-local adoption skill and its amendment and
assessment protocols. I inspected root `CATALOG.md` without editing it. Its exact
content and Git observation are in `catalog-observation.json`; its sole link
points to `legacy/pear-operations.md`, which the confirmed migration will delete.

I ran the read-only active-run discovery pass and saved its full JSON as
`amendment-pass1.json`. I prepared the complete additions-only
`amended-scope-proposal.json`, retaining all four contextual paths and all prior
candidate decisions while adding only `CATALOG.md`. I then saved the full
eligible preview as `amendment-pass2.json`. Its amendment identity is
`sha256:d5f595360e04ed5a105024d3f354ba40083aceb6155b9c269bcab63d08bf1d21`.

The exact old and new scopes, prior operation evidence, unchanged operations and
script bytes, proposed catalog content, trust boundary, hashes, and bound resume
command are disclosed in `amendment-review.md`. No contextual file has been
edited and no amendment has been accepted.

## Amendment confirmation

I reviewed the complete amendment preview and prior work. I explicitly confirm amendment identity `sha256:d5f595360e04ed5a105024d3f354ba40083aceb6155b9c269bcab63d08bf1d21` for the additions-only `project-documentation: CATALOG.md` expansion, the unchanged exact ownership and selection, and the unchanged disclosed trusted operations. Append this confirmation verbatim. Exercise one controlled real process interruption: preserve the original session, create an evidence-directory session copy whose `env.NODE_OPTIONS` appends the file URL for `interrupt-after-operation-spawn.mjs`, then invoke the bound `resume --amend-scope` once with `REPO_STANDARDS_ACCEPTANCE_INTERRUPT=after-operation-spawn`. This harness is acceptance-only process control and must not alter the package, source, or project. Capture command status/signal and then use the normal original session to record `status --json`, verifying whether the amendment identity/revision was durably accepted and execution is interrupted. Stop without retrying and return the status plus the exact safe retry request; do not edit contextual targets yet.

## Controlled interruption and durable status

I preserved the original session at
`/tmp/repo-standards-public-agent-gNdlDb/journey.json`; its SHA-256 remains
`274fe4c7f9e6dbcc5bc844f142b7ee7601d53997a1c9c668c3861c5a8cc80a98`.
I created `interruption-session.json`, retaining all original session data and
changing only `env.NODE_OPTIONS` from:

```text
--import=file:///tmp/repo-standards-source-rw4Gzf/https-fixture.mjs
```

to:

```text
--import=file:///tmp/repo-standards-source-rw4Gzf/https-fixture.mjs --import=file:///srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/interrupt-after-operation-spawn.mjs
```

The normalized session hashes after deleting `env.NODE_OPTIONS` are identical:
`00f8685dd149310710c086b58d4e83aca33990056ceb7973ae109d75daa0465e`.
The interruption-session SHA-256 is
`5944e68be2a07c4bcfa39f6abf808cec1fff0951f38eca05b6ffc7f238200519`,
and the hook SHA-256 is
`e4a3543d1b8ce0feeedcb3f1a35fc6f6a4bb77767a8b360aa4f1f12354447dbf`.

A first session-copy shell command used a mistyped nonexistent evidence path and
exited 2 before it could write a file. I corrected the path, verified the
semantic diff above, and invoked the bound confirmed continuation exactly once:

```text
REPO_STANDARDS_ACCEPTANCE_INTERRUPT=after-operation-spawn node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/interruption-session.json --local resume --amend-scope --scope /srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/amended-scope-proposal.json --confirm sha256:d5f595360e04ed5a105024d3f354ba40083aceb6155b9c269bcab63d08bf1d21 --json
```

The bridge returned exit status 1 with no signal on the outer bridge process;
both captured streams are empty. The imported harness deterministically sends
`SIGKILL` to the inner CLI immediately after its first operation spawn. The
bridge maps the signaled child's null status to exit 1, so the inner signal is
recorded as harness-controlled `SIGKILL`, while the observed bridge signal is
null. `interruption-command-status.txt`, `interruption.stdout`, and
`interruption.stderr` preserve those observations.

I then invoked project-local `status --json` through the unchanged original
session. The command returned exit status 0; its complete report is
`status-after-interruption.json`. A mistyped path affected only my first attempt
to write the separate two-line status-command metadata after that successful
query; the complete JSON report was already saved correctly. I recreated the
metadata as `status-after-interruption-command.txt` and did not issue another
status query.

The durable report says `execution: interrupted`. Active run
`91c11a5c-6f3f-49ce-a06b-63af550f9d39` is now `repo-standards/run/v3`, with
`scopeRevision: 1` and active inspection
`sha256:d5f595360e04ed5a105024d3f354ba40083aceb6155b9c269bcab63d08bf1d21`.
Its amendment record contains the confirmed identity and accepted addition
`project-documentation: CATALOG.md`, proving the amendment was durably accepted
before interruption. The run is incomplete in phase `fixes`; the replayed
`project-documentation/normalize-markdown-ending` has an open observation at
operation index 1 and uncertainty “process outcome uncertain until recorded.”
There is no last-complete adoption.

The original external package-tree manifest hash remains
`66da0afcec7dd3879567c4134c644d1d40b79a312f20a7bbe9d608236b407273`.
The standards fixture remains clean at
`d2f0ecb0c4fad52bc4cbf5ff223ba59d2663dd77`. All contextual target contents
remain unchanged: `CATALOG.md`, the legacy operations source, and Pear manifest
retain their prior hashes, while all three planned new contextual files remain
absent. Only the CLI's authorized durable amendment state changed.

Per the installed recovery protocol, retry will explicitly authorize repeating
the trusted fixes under the accepted five-path scope, then require a fresh
contextual assessment and checks. The exact safe command, using the normal
original session, is:

```text
node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json --local resume --retry --json
```

I stopped without running it and without editing contextual targets.

## Authorized retry

I have inspected status-after-interruption.json and the accepted amended scope. I explicitly authorize retrying the uncertain trusted fix now. Run exactly `node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json --local resume --retry --json`, append this instruction verbatim to the transcript, then complete the contextual assessment and check under the accepted five-path scope. Capture all commands/results, final status, exact binary diff, source/project/package integrity, and limitations under the existing orchard evidence directory. Do not commit the project yet; stop after the run is complete.

## Retry, contextual migration, and completed run

I ran the authorized retry command exactly from the product worktree, using the
unchanged original session. It returned exit 1 solely for the expected contextual
handoff. `retry.json` is the complete `repo-standards/run/v3` report. It retains
the interrupted interval and its archived report/log paths, then records a
successful replay of `project-documentation/normalize-markdown-ending` with
status `unchanged`. The refreshed run stayed bound to selection
`sha256:0894cdc09b074779050f35d3ad4a81d2712ec6168c09a26833eff7bf053cc605`,
amended inspection `sha256:d5f595360e04ed5a105024d3f354ba40083aceb6155b9c269bcab63d08bf1d21`,
and scope revision 1. Its post-fix identity is
`sha256:b37fe16b1fa0549db258bb18a5cc0a395ed8d68017a95ef6420653f32cd7ef92`.

I rechecked the maintained-project evidence and changed exactly the five
confirmed contextual paths. `CATALOG.md` now points to
`docs/projects/pear/operations.md`; `legacy/pear-operations.md` is deleted;
`docs/projects/pear/operations.md` preserves the old file's exact 162 bytes and
SHA-256 `4dfd4f629f3d0936915ef2101fb80dd39d70502491e9748b28bfc882e2d93a1b`;
`products/pear/README.md` records the observed Pear name, `orchard-runtime`
owner, `node server.mjs` run command, absence of a separately documented setup
step, and operations link; and `docs/projects/index.md` links the README and
operations guide. All four relative Markdown links resolve. The exact file
`docs/catalog.json` remains byte-identical with SHA-256
`04d157addc02894509d9ec06a16d1467eab2587bb4e4e3149f0a2131070bcb36`.

The normal refresh command was:

```text
node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json --local resume --json
```

It returned the expected contextual handoff at snapshot
`sha256:05cd9c6c2c81c7d3c0d82fdcbd51d3f97fd6f994632361d61080910cde205ac0`.
I submitted `assessment.json`, a fresh `repo-standards/assessment/v2` covering
all five changes. Both required `afterFixes` and `current` scope reviews are
`valid`, include concrete evidence, and have empty `additionalPaths` arrays.
The submission command was:

```text
node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json --local resume --assessment /srv/dev/projects/repo-standards-issue-50/acceptance/results/2026-09-14/contextual-scope-release/agents/orchard/assessment.json --json
```

Before that correct submission, I accidentally invoked Node with the nonexistent
bridge path `/srv/dev/projects/repo-standards-issue-50/acceptasch/cli.ts` and a
malformed nonexistent session argument. Node exited immediately with
`MODULE_NOT_FOUND`; it did not enter the CLI, execute trusted code, or change the
product, adopting project, package, or run state. This operator error was visible
in the tool output but had no captured file, so I record it candidly here.

The correct submission returned exit 0. `completion.json` is the complete final
run report: outcome and phase are `complete`, exact installation and runtime are
verified, the retried fix is `unchanged`, and
`project-documentation/verify-markdown-ending` exited 0 with result `passed` and
message `Markdown endings already satisfy the source.` `operation-results.json`
retains all operation observations and retry history. `operation-inputs.json`
records every operation attempt's exact argv, cwd, retained script, resources,
arguments, prerequisite, effective allowed targets, trust boundary, and result.
The CLI does not retain raw stdin bytes, so that artifact explicitly labels the
semantic protocol objects as reconstructed from retained inputs and run
identity; JSON key serialization and trailing bytes are an honest unavailable
detail.

The final project-local status command was:

```text
node /srv/dev/projects/repo-standards-issue-50/acceptance/cli.ts /tmp/repo-standards-public-agent-gNdlDb/journey.json --local status --json
```

It exited 0. `final-status.json` is `repo-standards/status/v4`, has no active
run, and names run `91c11a5c-6f3f-49ce-a06b-63af550f9d39` as `lastComplete` at
unchanged HEAD `5f64286bb6d2262a1517ce321219783fb6ba7d58`.

## Completed-output review and integrity

I read the installed-all-completed-outputs section of the installed adoption
documentation, then reviewed the binary tracked diff and the complete content
and executable state of every non-ignored untracked file. `final-tracked.diff`
is the exact binary-capable tracked diff. `final-untracked.diff` concatenates an
individual binary-capable `/dev/null` diff for each NUL-enumerated new file.
`final-untracked-inventory.json`, `final-untracked-content-review.txt`, and
`final-working-tree-inventory.json` preserve full content, base64 bytes, size,
mode, executable state, and SHA-256 for every reviewed output. There are 19
non-ignored untracked files; none is executable. New files have filesystem mode
0600 in this disposable project and Git records only the expected non-executable
file state.

`integrity.json` records the final checks. Project HEAD remains
`5f64286bb6d2262a1517ce321219783fb6ba7d58`; the index byte listing matches the
pre-inspection listing; and `git diff --cached --quiet` exits 0. The external
82-file package and isolated runtime package each retain tree digest
`66da0afcec7dd3879567c4134c644d1d40b79a312f20a7bbe9d608236b407273`;
the installed project skill matches the external skill; `npm ls --all --json`
exits 0. The independent standards fixture is clean at
`d2f0ecb0c4fad52bc4cbf5ff223ba59d2663dd77`. The original session hash remains
`274fe4c7f9e6dbcc5bc844f142b7ee7601d53997a1c9c668c3861c5a8cc80a98`.

The usefulness conclusions remain agent judgments. The source evidence provides
Pear's name, owner, start command, health-check response, and rollback guidance,
but no install/build procedure or broader product purpose; the README says the
missing setup fact directly rather than inventing one. The trusted check verifies
only final newlines. Completion proves the captured run and files at its final
snapshot, not continuing compliance after later edits. No repository was staged
or committed during this completed run.

## Subsequent committed growth and retained re-adoption

After explicit authorization, I committed the completed adoption as
`1eea3ccfd5b8852b1f0cbb1ef7900992d9fad778`, committed Plum growth as
`ebecf70af22e48928990df0402cba37bae294a96`, and corrected the growth model with
commit `a3d4a0942816042b8d34819b309988492857c483`, which removes Pear's service
manifest and its shared-navigation links while preserving both Pear documents
byte-for-byte. In a fresh checkout with the public runtime restored and source
acquisition blocked, retained re-adoption inspection
`sha256:ac6ca2894bee92291b10db3b12b836f9e7864852520053775d1c53bee83841f8`
was explicitly confirmed and completed as run
`6eda44d4-2a19-4436-b4b5-7499f809dced`. Current contextual scope contains only
`CATALOG.md`, `docs/projects/index.md`, and `products/plum/README.md`; historical
scope remains historical evidence. Full records are in
`retained-readoption-retired-pear/`.

I also audited the separate retroactive-authorization rehearsal solely from its
captured evidence. Its attempted post-edit amendment correctly failed with
`ASSESSMENT_SCOPE`; the run remains intentionally incomplete and unreconciled.
The audit is in `retroactive/10-audit.md` and `retroactive/11-audit.json`.
