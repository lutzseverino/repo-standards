# Whole-source review

The personal-tools README guidance implements Author 2’s accepted exact draft.
Team-services and all other policies and bytes are preserved.

## standards.yaml

```yaml
format: repo-standards/v1
name: Practical tools and service standards
description: Shared text tooling and project-owned documentation for personal tools and team services.
requires:
  repo-standards: "1.1.0"
defaults:
  declarations:
    editorconfig:
      kind: file
      target: .editorconfig
      exact: files/editorconfig
    readme:
      kind: file
      target: README.md
      guidance: guidance/readme-personal.md
    contributing:
      kind: file
      target: CONTRIBUTING.md
      guidance: guidance/contributing.md
    notes-newline:
      kind: file
      target: docs/notes.md
      guidance: guidance/notes-newline.md
      checks:
        - id: final-newline
          run:
            executable: node
            script: operations/notes-newline.mjs
            resources: []
            arguments: [check]
          prerequisite:
            version-arguments: ["--version"]
            version: ">=24.0.0 <25.0.0"
          timeout-seconds: 10
      fixes:
        - id: append-newline
          run:
            executable: node
            script: operations/notes-newline.mjs
            resources: []
            arguments: [fix]
          prerequisite:
            version-arguments: ["--version"]
            version: ">=24.0.0 <25.0.0"
          timeout-seconds: 10
    readme-review:
      kind: skill
      name: readme-review
      source: skills/readme-review
profiles:
  personal-tools:
    description: Personal command-line tools with a runnable README example and project contribution guidance.
    declarations: {}
  team-services:
    description: Team services with operational README commands and restart limitations; employer contribution docs stay outside governance.
    declarations:
      readme:
        kind: file
        target: README.md
        guidance: guidance/readme-service.md
      contributing:
        exclude: true
      service-runbook:
        kind: file
        target: docs/runbook.md
        guidance: guidance/service-runbook.md
```

## files/editorconfig

```text
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
```

## guidance/readme-personal.md

```text
Keep README.md project-owned. Make it a concise quickstart focused on one runnable example using the project's actual command. Purpose, installation instructions, and expected output are not required. Preserve the project's facts and structure when assessing or adapting it.
```

## guidance/readme-service.md

```text
Keep README.md project-owned. Explain how to start the service, check its health,
and stop it, with real commands for this project. This replaces the personal-tool
README guidance entirely; no CLI example or expected output is required.
Preserve the project's facts and structure when assessing or adapting it.
```

## guidance/contributing.md

```text
Keep CONTRIBUTING.md project-owned. Ask contributors to run the project's documented
test command. Refer to the actual project workflow without selecting a test framework.
Preserve existing project facts and structure.
```

## guidance/service-runbook.md

```text
Keep docs/runbook.md project-owned. Document known restart limitations for this
service using actual project knowledge. Preserve its facts and structure; do not
invent limitations or assert there are none without evidence.
```

## guidance/notes-newline.md

```text
Keep docs/notes.md project-owned and require its final byte to be LF. Preserve all
existing content. An existing empty file can receive one LF byte. If the file is
missing, report a blocker; do not create missing notes content.
```

## operations/notes-newline.mjs

```javascript
import fs from 'node:fs';
import path from 'node:path';

const result = (status, message) => {
  process.stdout.write(JSON.stringify({ format: 'repo-standards/result/v1', status, message }) + '\n');
};
let fd;
try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const mode = process.argv[2];
  const phase = mode === 'check' ? 'checks' : mode === 'fix' ? 'fixes' : null;
  const id = mode === 'check' ? 'final-newline' : 'append-newline';
  const owner = request.declarations?.find(d => d.id === 'notes-newline');
  if (process.argv.length !== 3 || !phase ||
      request.format !== 'repo-standards/operation/v1' ||
      typeof request.profile !== 'string' || !request.profile ||
      request.operation?.declaration !== 'notes-newline' ||
      request.operation?.phase !== phase || request.operation?.id !== id ||
      owner?.kind !== 'file' || owner.target !== 'docs/notes.md' ||
      !owner[phase]?.some(op => op.id === id) ||
      JSON.stringify(request.allowedTargets?.paths) !== '["docs/notes.md"]' ||
      JSON.stringify(request.allowedTargets?.directories) !== '[]' ||
      typeof request.projectRoot !== 'string' || !path.isAbsolute(request.projectRoot) ||
      path.resolve(request.projectRoot) !== process.cwd()) {
    throw new Error('Request or active declaration scope is inconsistent.');
  }
  const root = request.projectRoot;
  let ancestor = path.parse(root).root;
  for (const component of path.relative(ancestor, root).split(path.sep).filter(Boolean)) {
    ancestor = path.join(ancestor, component);
    if (!fs.lstatSync(ancestor).isDirectory()) throw new Error('Project ancestry must use real directories.');
  }
  const docs = path.join(root, 'docs');
  if (!fs.lstatSync(docs).isDirectory()) throw new Error('docs must be a real directory.');
  const target = path.join(docs, 'notes.md');
  const before = fs.lstatSync(target);
  if (!before.isFile()) throw new Error('Notes must be a regular file, not a symlink.');
  fs.accessSync(target, fs.constants.R_OK | (mode === 'fix' ? fs.constants.W_OK : 0));
  const flags = (mode === 'fix' ? fs.constants.O_RDWR | fs.constants.O_APPEND : fs.constants.O_RDONLY)
    | fs.constants.O_NOFOLLOW;
  fd = fs.openSync(target, flags);
  const opened = fs.fstatSync(fd);
  if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
    throw new Error('Notes changed during opening; retry after concurrent work stops.');
  }
  const bytes = fs.readFileSync(fd);
  const terminated = bytes.length > 0 && bytes.at(-1) === 10;
  if (mode === 'check') {
    result(terminated ? 'passed' : 'failed', terminated
      ? 'docs/notes.md ends in LF.' : 'docs/notes.md needs a final LF byte.');
  } else if (terminated) {
    result('unchanged', 'docs/notes.md already ends in LF.');
  } else {
    const current = fs.fstatSync(fd);
    if (current.size !== opened.size || current.mtimeMs !== opened.mtimeMs) {
      throw new Error('Notes changed during reading; retry after concurrent work stops.');
    }
    fs.writeSync(fd, Buffer.from([10]));
    fs.fsyncSync(fd);
    result('changed', 'Appended one LF byte to docs/notes.md.');
  }
} catch (error) {
  result('blocked', `Notes newline operation blocked: ${error.message}`);
} finally {
  if (fd !== undefined) fs.closeSync(fd);
}
```

## skills/readme-review/SKILL.md

```text
---
name: readme-review
description: Review a project README against its active standards guidance and report gaps.
disable-model-invocation: true
---

# Review the README

Use for ordinary work when the author invokes readme-review. Produce a report;
keep project files unchanged and leave adoption to its separate workflow.

## Inputs and tools

Use an agent's local file-reading tools. No runtime, package installation,
network access, or credentials are required. Receive the README path, active
profile identity, and its applicable resolved README guidance from the caller.
If the active guidance is unavailable or ambiguous, ask the caller for it and
leave the review pending. Never infer a profile from the project type or combine
guidance from different profiles.

## Review

1. Read the supplied active guidance and README. Name the profile, guidance
   source, and README path in the report. If the README is missing or unreadable,
   report that blocker without creating it.
2. Assess every requirement in that guidance against the README as written.
   Report each as satisfied, missing, or uncertain with supporting quotations
   or line references and concise suggestions for gaps. Do not invent facts or
   impose requirements from another profile.
3. Assess command examples from their written content only. Do not run commands
   or edit files. Distinguish documented commands from verified command correctness.
4. Finish when every applicable requirement has a reported outcome, evidence,
   and any uncertainty. State that command correctness remains unverified by
   this review. This report is ordinary-work feedback, not an adoption assessment.

The standards source owns this whole skill directory; updates replace it as a unit.
```

## authoring-notes.md

```text
# Authoring notes

## Confirmed decisions

- `editorconfig`: both profiles inherit exact, non-executable `files/editorconfig`
  at `.editorconfig`. Own the complete file to share UTF-8, LF, and final newlines.
- `readme`: defaults use `guidance/readme-personal.md` for project-owned README.md:
  a concise quickstart focused on one runnable example using the actual project
  command; purpose, installation instructions, and expected output are not required.
  `personal-tools` inherits this narrower guidance so the first runnable action is
  easy to find; this supersedes its former purpose and installation requirements.
  `team-services` fully replaces it with
  `guidance/readme-service.md`: actual start, health-check, and stop commands.
  The service workflow does not inherit personal-tool README requirements.
- `contributing`: personal tools inherit `guidance/contributing.md` for project-owned
  CONTRIBUTING.md, asking contributors to run the documented project test command.
  Team services exclude the entire declaration to leave employer contribution
  documents untouched; exclusion does not delete them.
- `service-runbook`: only team services add `guidance/service-runbook.md` for
  project-owned docs/runbook.md, documenting known restart limitations.
- `notes-newline`: both profiles inherit `guidance/notes-newline.md` and the Node
  check/fix in `operations/notes-newline.mjs` for project-owned docs/notes.md.
  The check reads only and tests its last byte; the fix appends exactly one LF
  if absent, including to an existing empty file, preserving original bytes/modes.
  Missing, symlinked, nonregular, inaccessible, or out-of-scope content blocks;
  missing notes are never created. Repeated repair is unchanged. Node 24 is
  accepted (`node --version`, >=24.0.0 <25.0.0), with a 10-second timeout, literal
  check/fix arguments, and no resources, extra packages, network, or credentials.
  Operations inherit caller host access; disposable exercises are not a sandbox.
- `readme-review`: both profiles inherit the whole exact `skills/readme-review`
  directory at `.agents/skills/readme-review`. On explicit invocation, an agent
  with file-reading tools compares README.md with supplied unambiguous active
  profile guidance and reports evidence-backed gaps without edits or adoption.
  No command execution, runtime, package, network, or credential is required.
  It asks for missing active guidance rather than guessing or merging profiles.

## Non-decisions and verification limits

- No preference for test frameworks or indentation size. Historical JavaScript
  semicolon usage is incidental and produces no policy.
- CI, further testing details, code organization, and agent behavior remain
  deferred. Review standards are skipped; the separately requested README review
  skill does not introduce general review policy.
- README-review content review is sufficient for this authoring session by
  explicit author choice. Real-agent usefulness and command correctness remain
  unverified. No ordinary-work agent exercise has been performed.
- Operation evidence is a direct disposable protocol exercise, not adoption or
  runtime orchestration evidence. Newline checks do not assess content usefulness.
  Exercises cover local Linux; other platforms, concurrent writers and permission
  failures are unverified. Missing Node is a prerequisite blocker, not a passing run.
- Compatibility is pinned to the externally installed 1.1.0 packed CLI candidate.
  Candidate acquisition and local validation are not evidence of public release.
  This source remains local and requires publication through a separate workflow.
```

## Unrelated preserved file: scratch.txt

```text
Unrelated unfinished experiment. Preserve these bytes.
```
