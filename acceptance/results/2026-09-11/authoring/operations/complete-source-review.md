# Complete source review

Local source: `/tmp/repo-standards-author-aj4hqi/workspace/node-cli-standards`.
CLI: public npm `@lutzseverino/repo-standards@1.0.1`, independently acquired; Node v24.11.1.

The accepted `support-file` declaration owns guidance and operations for the project-owned `docs/support.json`. Its repair runs when the policy is adopted; it is not a separate per-adoption menu choice. `bug-report-routine` owns the whole `.agents/skills/draft-bug-report` directory. Other topics remain deferred.

Correction to my earlier proposal: local skill edits are not silently replaced. Installed `docs/authoring.md` says local exact-content edits block an update before mutation; a permitted update replaces the whole unchanged directory. The source below reflects this. The operation scope comparison was also corrected to ignore JSON object key ordering; both orderings were exercised. Neither correction changes the accepted policy or tools.

Every source file is reproduced below, in full. All files use UTF-8 and end with one LF. The placeholder is 55 bytes, including its final LF (the manifest records the actual count).

## `authoring-notes.md`

````markdown
# Authoring notes

Confirmed context: small Node command-line tools; one `node-cli` profile.

- `support-file` maps to `guidance/support.md`, the two operation scripts, and
  `resources/support-placeholder.json`. The project owns its destination and
  extra fields. Accepted shapes are unverified/null and configured/nonempty
  instructions; configured does not imply verified. This keeps forgotten support
  visible without inventing an address. The read-only check enforces shape; the
  adopted policy runs its create-only repair using the separately reviewable
  placeholder. Existing destinations and malformed files remain byte-for-byte
  unchanged. Interrupted partial content requires manual correction.
- Both operations require Node 24, probe `node --version`, use literal empty
  argument lists, and have 10-second probe/run timeouts. They need no network or
  credentials. Trusted operations inherit user access. Excluding the owning
  declaration removes both operations. No exclusions are configured here.
- `bug-report-routine` owns the complete `skills/draft-bug-report` directory for
  `.agents/skills/draft-bug-report`. Local edits conflict with its installed
  baseline and block updates; permitted updates replace the whole unchanged
  directory. Accepted ordinary work is a Markdown draft
  with reproduction steps, expected/actual behavior, and honest attempted-action
  evidence, never submission. Node 24 and local agent text/file/shell tools are
  used, with 10-second and 1 MiB-per-stream reproduction limits. Additional
  requirements need author input; no dependency installation is automatic.

Explicit non-preferences: no shared fixed destination, no overwrite of existing
support files, no destination-verification claim, and no automatic submission.

Deferred by the author: other testing, code organization, documentation, review,
agent behavior, and tooling topics. No additional contexts or profiles requested.
No unresolved policy decisions. Exercise evidence is retained outside this source;
structural validation alone does not verify behavior or future project compliance.
````

## `guidance/support.md`

````markdown
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
````

## `operations/check-support.mjs`

````javascript
import fs from 'node:fs';
import path from 'node:path';

const emit = (status, message) => process.stdout.write(JSON.stringify({
  format: 'repo-standards/result/v1', status, message,
}) + '\n');
const stat = (p) => {
  try { return fs.lstatSync(p); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const owner = request.declarations?.find((d) => d.id === 'support-file');
  if (request.format !== 'repo-standards/operation/v1'
      || request.operation?.declaration !== 'support-file'
      || request.operation?.phase !== 'checks'
      || request.operation?.id !== 'support-shape'
      || owner?.kind !== 'file' || owner.target !== 'docs/support.json'
      || !owner.checks?.some((op) => op.id === 'support-shape')
      || !Array.isArray(request.allowedTargets?.paths)
      || request.allowedTargets.paths.length !== 1
      || request.allowedTargets.paths[0] !== 'docs/support.json'
      || !Array.isArray(request.allowedTargets?.directories)
      || request.allowedTargets.directories.length !== 0
      || typeof request.projectRoot !== 'string'
      || !path.isAbsolute(request.projectRoot)) {
    throw new Error('Request does not authorize this support-file check.');
  }
  const root = request.projectRoot;
  if (fs.realpathSync(root) !== path.resolve(root) || !fs.lstatSync(root).isDirectory()) {
    throw new Error('Project root must be a real directory without symlink ancestors.');
  }
  const docs = stat(path.join(root, 'docs'));
  if (docs && (!docs.isDirectory() || docs.isSymbolicLink())) {
    throw new Error('docs must be a directory, not a symlink or another type.');
  }
  const target = path.join(root, 'docs/support.json');
  const file = docs ? stat(target) : null;
  if (!file) {
    emit('failed', 'docs/support.json is missing.');
  } else if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error('docs/support.json must be a regular file, not a symlink.');
  } else {
    const content = fs.readFileSync(target, 'utf8');
    let value;
    try { value = JSON.parse(content); }
    catch { emit('failed', 'docs/support.json is not valid JSON; preserve it for manual correction.'); process.exit(0); }
    const object = value !== null && typeof value === 'object' && !Array.isArray(value);
    const unverified = object && value.status === 'unverified' && value.reportProblems === null;
    const configured = object && value.status === 'configured'
      && typeof value.reportProblems === 'string' && value.reportProblems.trim().length > 0;
    emit(unverified || configured ? 'passed' : 'failed', unverified || configured
      ? 'Support shape is valid; destination verification was not performed.'
      : 'Use unverified with null reportProblems, or configured with nonempty reporting instructions.');
  }
} catch (error) {
  emit('blocked', error.message);
}
````

## `operations/create-support.mjs`

````javascript
import fs from 'node:fs';
import path from 'node:path';

const emit = (status, message) => process.stdout.write(JSON.stringify({
  format: 'repo-standards/result/v1', status, message,
}) + '\n');
const stat = (p) => {
  try { return fs.lstatSync(p); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const owner = request.declarations?.find((d) => d.id === 'support-file');
  if (request.format !== 'repo-standards/operation/v1'
      || request.operation?.declaration !== 'support-file'
      || request.operation?.phase !== 'fixes'
      || request.operation?.id !== 'create-support-placeholder'
      || owner?.kind !== 'file' || owner.target !== 'docs/support.json'
      || !owner.fixes?.some((op) => op.id === 'create-support-placeholder')
      || !Array.isArray(request.allowedTargets?.paths)
      || request.allowedTargets.paths.length !== 1
      || request.allowedTargets.paths[0] !== 'docs/support.json'
      || !Array.isArray(request.allowedTargets?.directories)
      || request.allowedTargets.directories.length !== 0
      || typeof request.projectRoot !== 'string'
      || !path.isAbsolute(request.projectRoot)) {
    throw new Error('Request does not authorize this support-file repair.');
  }
  const root = request.projectRoot;
  if (fs.realpathSync(root) !== path.resolve(root) || !fs.lstatSync(root).isDirectory()) {
    throw new Error('Project root must be a real directory without symlink ancestors.');
  }
  const docsPath = path.join(root, 'docs');
  let docs = stat(docsPath);
  if (docs && (!docs.isDirectory() || docs.isSymbolicLink())) {
    throw new Error('docs must be a directory, not a symlink or another type.');
  }
  const target = path.join(docsPath, 'support.json');
  const file = docs ? stat(target) : null;
  if (file) {
    if (!file.isFile() || file.isSymbolicLink()) {
      throw new Error('docs/support.json must be a regular file, not a symlink.');
    }
    emit('unchanged', 'Existing support file preserved byte-for-byte; use the check for shape assessment.');
  } else {
    const placeholder = fs.readFileSync(new URL('../resources/support-placeholder.json', import.meta.url));
    if (!docs) {
      try { fs.mkdirSync(docsPath); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      docs = fs.lstatSync(docsPath);
      if (!docs.isDirectory() || docs.isSymbolicLink()) throw new Error('Unsafe docs path.');
    }
    let fd;
    try { fd = fs.openSync(target, 'wx', 0o644); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = fs.lstatSync(target);
      if (!current.isFile() || current.isSymbolicLink()) throw new Error('Unsafe support path.');
      emit('unchanged', 'A support file now exists; preserved without overwrite.');
      process.exit(0);
    }
    try { fs.writeFileSync(fd, placeholder); }
    finally { fs.closeSync(fd); }
    emit('changed', 'Created docs/support.json with unverified support and no invented destination.');
  }
} catch (error) {
  emit('blocked', error.message);
}
````

## `resources/support-placeholder.json`

````json
{
  "status": "unverified",
  "reportProblems": null
}
````

## `skills/draft-bug-report/SKILL.md`

````markdown
---
name: draft-bug-report
description: Draft an evidence-based Markdown bug report from a reproduction during ordinary Node CLI development, without submitting it.
---

# Draft a bug report

Use this routine when asked to turn a reproduction into a useful bug report.
This skill has no standards-adoption role. Its whole directory is owned by the
standards source. Local edits conflict with the installed baseline and block an
update. A permitted update replaces the whole unchanged skill directory,
including its resources.

## Tools and limits

Use the agent's text/file tools and shell. For a Node reproduction require Node
24: run `node --version` and verify a major version of 24 before running it.
Do not install dependencies automatically. No network or credentials are needed
for the default local workflow. Ask before using additional tools, network,
credentials, or potentially destructive actions required by a reproduction.
When these are unavailable or not authorized, draft with that attempt explicitly
unverified; do not claim a passing or failing reproduction.

Use direct command argument vectors where available. Bound each reproduction
command to 10 seconds and 1 MiB of output per stream, recording timeouts and
truncation. Use no external service to submit or upload the report.

## Workflow

1. Read the supplied reproduction and relevant local context. Identify the
   expected behavior, actual behavior, environment, command, and minimal inputs.
   Ask for essential missing information, or label it unknown in a provisional
   draft. Distinguish user-reported behavior from your own observations.
2. Inspect the proposed command and any local code it executes before running
   it. Use a harmless disposable workspace when practical. Do not run a command
   whose effects cannot be reasonably assessed; describe that limit instead.
3. Probe Node and run the safe local reproduction within the limits above.
   Keep an accurate log of the command, working directory, inputs, exit status,
   stdout/stderr, and what the result establishes. Record failed attempts too.
   Never invent runs, output, causes, or checks that did not happen.
4. Draft Markdown with: title, environment, reproduction steps, expected
   behavior, actual behavior, and attempted actions/results. Include a minimal
   useful reproduction and relevant observed output. Label suspected causes as
   hypotheses, and list unknowns or reproduction limits. Avoid disclosing secrets
   or unrelated local/personal details in the draft.
5. Return the draft in the conversation unless the user supplied an output path.
   Preserve an existing output file unless replacement was authorized. Do not
   submit the report or contact maintainers.

## Completion

The draft includes actionable reproduction steps, separates expectation from
observation, and accounts for every attempted action and any unverified claim.
State where the draft was delivered and any remaining unknowns. A successful
example exercise demonstrates only that example, not general skill usefulness.
````

## `standards.yaml`

````yaml
format: repo-standards/v1
name: Small Node CLI support standards
description: Project-owned support destinations and evidence-based bug report drafts.
requires:
  repo-standards: "1.0.1"
defaults:
  declarations:
    support-file:
      kind: file
      target: docs/support.json
      guidance: guidance/support.md
      checks:
        - id: support-shape
          run:
            executable: node
            script: operations/check-support.mjs
            resources: []
            arguments: []
          prerequisite:
            version-arguments: ["--version"]
            version: ">=24.0.0 <25.0.0"
          timeout-seconds: 10
      fixes:
        - id: create-support-placeholder
          run:
            executable: node
            script: operations/create-support.mjs
            resources: [resources/support-placeholder.json]
            arguments: []
          prerequisite:
            version-arguments: ["--version"]
            version: ">=24.0.0 <25.0.0"
          timeout-seconds: 10
    bug-report-routine:
      kind: skill
      name: draft-bug-report
      source: skills/draft-bug-report
profiles:
  node-cli:
    description: Small Node command-line tools.
    declarations: {}
````

## Structural validation

Command: `/tmp/repo-standards-author-aj4hqi/cli/node_modules/.bin/repo-standards source validate /tmp/repo-standards-author-aj4hqi/workspace/node-cli-standards --json` with the supplied Node directory first in PATH. Exit 0. Full current result:

```json
{
  "valid": true,
  "errors": [],
  "source": {
    "format": "repo-standards/v1",
    "name": "Small Node CLI support standards",
    "description": "Project-owned support destinations and evidence-based bug report drafts.",
    "requires": {
      "repo-standards": "1.0.1"
    }
  },
  "profiles": {
    "node-cli": {
      "description": "Small Node command-line tools.",
      "declarations": [
        {
          "id": "bug-report-routine",
          "checks": [],
          "fixes": [],
          "kind": "skill",
          "name": "draft-bug-report",
          "source": "skills/draft-bug-report"
        },
        {
          "id": "support-file",
          "checks": [
            {
              "id": "support-shape",
              "run": {
                "executable": "node",
                "script": "operations/check-support.mjs",
                "resources": [],
                "arguments": []
              },
              "prerequisite": {
                "version-arguments": [
                  "--version"
                ],
                "version": ">=24.0.0 <25.0.0"
              },
              "timeout-seconds": 10
            }
          ],
          "fixes": [
            {
              "id": "create-support-placeholder",
              "run": {
                "executable": "node",
                "script": "operations/create-support.mjs",
                "resources": [
                  "resources/support-placeholder.json"
                ],
                "arguments": []
              },
              "prerequisite": {
                "version-arguments": [
                  "--version"
                ],
                "version": ">=24.0.0 <25.0.0"
              },
              "timeout-seconds": 10
            }
          ],
          "kind": "file",
          "target": "docs/support.json",
          "guidance": "guidance/support.md"
        }
      ]
    }
  }
}
```

Validation ran no operations or prerequisite probes. It establishes source structure and references for all profiles (one profile here), not behavioral correctness. Final reviewed bytes will be validated again after acceptance.

## Actual operation exercises

Ran `node /tmp/repo-standards-author-aj4hqi/exercise-operations.mjs`, exit 0. The harness used the public validation result's full resolved declarations and copied each operation to a separate retained directory containing only its script and declared resources. It used direct argument vectors, synthetic GitHub/version/commit fixture provenance, 10-second timeouts, and 1 MiB stream limits. Each invocation separately probed the declared Node prerequisite; all 25 available-tool probes observed 24.11.1 and satisfied `>=24.0.0 <25.0.0`.

| Exercise | Process exit | Protocol status | Changed paths |
| --- | --- | --- | --- |
| 01-missing-check | 0 | failed | none |
| 02-create | 0 | changed | docs, docs/support.json |
| 03-repeat-fix | 0 | unchanged | none |
| 04-repaired-check | 0 | passed | none |
| 05-configured-preserved | 0 | unchanged | none |
| 06-configured-check | 0 | passed | none |
| 07-malformed-check | 0 | failed | none |
| 08-malformed-preserved | 0 | unchanged | none |
| 09-partial-retry | 0 | unchanged | none |
| 10-partial-check | 0 | failed | none |
| 11-directory-only-retry | 0 | changed | docs/support.json |
| 12-directory-only-check | 0 | passed | none |
| 13-invalid-shape | 0 | failed | none |
| 14-directory-check | 0 | blocked | none |
| 15-directory-fix | 0 | blocked | none |
| 16-docs-file-check | 0 | blocked | none |
| 17-docs-file-fix | 0 | blocked | none |
| 18-docs-symlink-check | 0 | blocked | none |
| 19-docs-symlink-fix | 0 | blocked | none |
| 20-file-symlink-check | 0 | blocked | none |
| 21-file-symlink-fix | 0 | blocked | none |
| 22-scope-check | 0 | blocked | none |
| 23-scope-fix | 0 | blocked | none |
| 24-reordered-scope-check | 0 | passed | none |
| 25-reordered-scope-fix | 0 | unchanged | none |

Checks preserved complete fixture inventories, bytes, and modes. Repairs preserved unrelated sentinel files and an unrelated local skill. Existing configured, malformed, and partial support files remained byte-for-byte and mode-for-mode identical. Created placeholder bytes matched the declared resource exactly. Directory-only retry completed the missing file; partial-file retry preserved the partial file. External symlink-target sentinel content remained unchanged.

Controlled missing-Node case: both probes ran with PATH set to an empty fixture directory. Each returned spawn error `ENOENT`, without a parsed version or successful prerequisite. No operation was invoked and the complete project fixture inventory remained unchanged. No software was installed to resolve this controlled condition. This is separate from the real available-Node successes.

Full evidence is in `operation-evidence/*.json`: literal vectors, requests, probe versions/results, process status, stdout/stderr, parsed results, and complete before/after byte/mode inventories. `controlled-missing-node.json` records the isolated missing-tool case. Initial 23-run results remain separately in `operation-evidence-initial`; final 25-run results include reordered `allowedTargets` object keys.

Limits: direct protocol exercises do not test CLI adoption, prerequisite orchestration, or recovery lifecycle. Linux arm64 only. Permission-denied errors, hostile concurrent filesystem changes, and actual process-kill timing were not exercised. Partial-run states were constructed directly. There are no excluded declarations in this single accepted profile.

## Actual ordinary-work skill exercise

The authoring agent read and applied the generated skill to an explicitly synthetic, authorized harmless Node reproduction. This was an actual agent exercise, not an operation-protocol invocation or merely a content review. The agent inspected the complete two-line code and README, probed Node 24.11.1, then ran `node add.mjs 2 3` once: exit 0, stdout `23\n`, empty stderr, no timeout or output-limit error. The expectation `5` came from the fixture README. Fixture bytes/modes remained unchanged. No dependencies were installed, network accessed, or report submitted.

`skill-evidence/exercise-request.md`, `execution.json`, and `report.md` retain the task, commands/results, and output. The same authoring agent evaluated the draft against the accepted required sections and honesty requirements; no independent human usefulness evaluation is claimed. The evidence establishes only this example.

Complete generated draft:

````markdown
# Addition CLI prints `23` instead of `5` for arguments `2 3`

Environment: Node v24.11.1 on Linux arm64. This is a synthetic two-line local
fixture, with no package dependencies or release version.

## Reproduction steps

1. Save this as `add.mjs` in an empty directory:

   ```js
   const [left, right] = process.argv.slice(2);
   console.log(left + right);
   ```

2. From that directory, run `node add.mjs 2 3`.

## Expected behavior

The fixture README specifies the numeric sum `5` on stdout.

## Actual behavior

I reproduced stdout `23` followed by a newline, with exit status 0 and empty
stderr. The supplied symptom was also `23`; it is now observed for this example.

## Attempted actions and results

- Read the fixture README and all of `add.mjs`. The code only reads command-line
  arguments and writes stdout; it accesses no files, network, or credentials.
- Ran `node --version` from the fixture directory: exit 0, stdout `v24.11.1`,
  empty stderr.
- Ran `node add.mjs 2 3` once from the same directory: exit 0, stdout `23`,
  empty stderr. The command had a 10-second timeout and 1 MiB-per-stream output
  limit; neither limit was reached.
- Compared the fixture files before and after: bytes and modes were unchanged.

The exact disposable working directory and process records are retained in the
local exercise evidence; the reproduction above needs only its own directory.

## Limits

No other inputs, Node versions, or platforms were tested. No fix was attempted.
The string `+` operation is a possible cause inferred from the source, not a
separately tested fix. This draft was produced locally and was not submitted.
````

The source has not been published or adopted. Adoption requires a public GitHub source and a stable tag, handled by a separate workflow. No Git repository, commit, tag, release, or adoption was created.

Please review all source contents and evidence above. Do you accept this whole source and the stated exercise limits, with the other topics still deferred?
