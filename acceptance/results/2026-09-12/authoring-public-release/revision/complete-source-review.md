# Complete revised local source for author review

Only personal-tools retires sample output and adds brief relevant failure cases
and their reporting. The working invocation and input/output explanations remain.
README stays project-owned; the source supplies contextual guidance. The shared
exact documentation-review skill bundle changes in both profiles, but its
team-services checklist criteria are byte-identical. No declaration, target,
operation, prerequisite, or profile mapping changes.

| Declaration | personal-tools | team-services |
| --- | --- | --- |
| editor-line-endings | Exact .editorconfig, inherited | Same |
| readme-usage | Contextual README.md: revised default guidance | Complete replacement: existing service guidance |
| reproducible-bug-reports | Contextual CONTRIBUTING.md, inherited | Excluded; employer content remains outside governance |
| notes-final-newline | Contextual NOTES.md plus existing check/fix | Same inherited complete declaration |
| documentation-review | Whole exact .agents/skills/documentation-review bundle | Same bundle; unchanged team criteria |
| runbook-recovery | Absent | Added guidance for docs/runbooks directory tree |

All files below are non-executable mode 0644. This includes the entire manifest,
all referenced files and skill resources, and authoring notes. Unreferenced
scratch.txt and local-draft.txt are preserved verbatim with mode 0600 and are
not policy. Their full bytes are retained in the before/after inventories.

## standards.yaml

````
format: repo-standards/v1
name: Utility and service standards
description: Lightweight personal utility standards and focused team service documentation standards.
requires:
  repo-standards: "1.1.0"
defaults:
  declarations:
    editor-line-endings:
      kind: file
      target: .editorconfig
      exact: files/editorconfig
    readme-usage:
      kind: file
      target: README.md
      guidance: guidance/readme.md
    reproducible-bug-reports:
      kind: file
      target: CONTRIBUTING.md
      guidance: guidance/contributing.md
    notes-final-newline:
      kind: file
      target: NOTES.md
      guidance: guidance/notes.md
      checks:
        - id: final-newline
          run:
            executable: node
            script: operations/notes-final-newline.cjs
            resources: []
            arguments: [check]
          prerequisite:
            version-arguments: [--version]
            version: ">=24.0.0 <25.0.0"
          timeout-seconds: 10
      fixes:
        - id: append-final-newline
          run:
            executable: node
            script: operations/notes-final-newline.cjs
            resources: []
            arguments: [fix]
          prerequisite:
            version-arguments: [--version]
            version: ">=24.0.0 <25.0.0"
          timeout-seconds: 10
    documentation-review:
      kind: skill
      name: documentation-review
      source: skills/documentation-review
profiles:
  personal-tools:
    description: Small personal CSV and text conversion utilities.
    declarations: {}
  team-services:
    description: Team services with service documentation and recovery runbooks.
    declarations:
      readme-usage:
        kind: file
        target: README.md
        guidance: guidance/team-readme.md
      reproducible-bug-reports:
        exclude: true
      runbook-recovery:
        kind: repository
        guidance: guidance/runbooks.md
        targets:
          paths: []
          directories: [docs/runbooks]
````

## files/editorconfig

````
[*]
end_of_line = lf
insert_final_newline = true
````

## guidance/readme.md

````
# README guidance for small command-line utilities

Keep README.md brief. Include:
- A brief explanation of the utility's purpose.
- One working invocation for this project.
- A brief explanation of relevant failure cases and how the utility reports them.
- A short explanation of that invocation's input and output, including file paths or stdin/stdout where relevant.

Use the project's own facts and organization. No particular headings or setup section are required.
````

## guidance/contributing.md

````
# Reproducible bug report guidance

In the project-owned CONTRIBUTING.md, briefly explain how to report a reproducible bug.
Use the project's own facts and organization. This guidance imposes no contribution workflow rule.
````

## guidance/notes.md

````
# NOTES final newline

NOTES.md remains project-owned. When nonempty, its last byte must be LF.
An empty file is compliant; existing CRLF endings also satisfy this final-byte requirement.

The check reads only NOTES.md. The fix appends exactly one LF when missing,
keeping existing bytes and permission bits. Neither operation creates a missing
file, follows a symbolic link, handles a nonregular target, nor normalizes line
endings. Missing, unreadable, nonregular, symbolic-link, or out-of-scope targets
block; write failure also blocks the fix. Repeating a completed fix changes nothing.
````

## operations/notes-final-newline.cjs

````
const fs = require('node:fs');
const path = require('node:path');

function result(status, message) {
  process.stdout.write(JSON.stringify({
    format: 'repo-standards/result/v1', status, message,
  }) + '\n');
}

let fd;
try {
  const mode = process.argv[2];
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const phase = mode === 'check' ? 'checks' : mode === 'fix' ? 'fixes' : null;
  const id = mode === 'check' ? 'final-newline' : 'append-final-newline';
  const owner = Array.isArray(request.declarations)
    ? request.declarations.find(item => item.id === 'notes-final-newline') : null;
  if (!phase || process.argv.length !== 3 ||
      request.format !== 'repo-standards/operation/v1' ||
      !['personal-tools', 'team-services'].includes(request.profile) ||
      request.operation?.declaration !== 'notes-final-newline' ||
      request.operation?.phase !== phase || request.operation?.id !== id ||
      owner?.kind !== 'file' || owner?.target !== 'NOTES.md' ||
      !Array.isArray(owner[phase]) || !owner[phase].some(op => op.id === id) ||
      !Array.isArray(request.allowedTargets?.paths) ||
      request.allowedTargets.paths.length !== 1 ||
      request.allowedTargets.paths[0] !== 'NOTES.md' ||
      !Array.isArray(request.allowedTargets?.directories) ||
      request.allowedTargets.directories.length !== 0 ||
      typeof request.projectRoot !== 'string' || !path.isAbsolute(request.projectRoot) ||
      fs.realpathSync(request.projectRoot) !== fs.realpathSync(process.cwd())) {
    throw new Error('Operation request is outside the active NOTES.md scope.');
  }
  const target = path.join(request.projectRoot, 'NOTES.md');
  const before = fs.lstatSync(target);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error('NOTES.md must be a regular file, not a symbolic link.');
  }
  fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const opened = fs.fstatSync(fd);
  if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
    throw new Error('NOTES.md changed while opening it; retry after it is stable.');
  }
  const bytes = fs.readFileSync(fd);
  fs.closeSync(fd);
  fd = undefined;
  const compliant = bytes.length === 0 || bytes[bytes.length - 1] === 10;
  if (compliant) {
    result(mode === 'check' ? 'passed' : 'unchanged', 'NOTES.md is empty or ends in LF.');
  } else if (mode === 'check') {
    result('failed', 'Nonempty NOTES.md is missing its final LF byte.');
  } else {
    fd = fs.openSync(target, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
    const current = fs.fstatSync(fd);
    if (!current.isFile() || current.dev !== opened.dev || current.ino !== opened.ino ||
        !fs.readFileSync(fd).equals(bytes)) {
      throw new Error('NOTES.md changed before repair; retry after it is stable.');
    }
    const written = fs.writeSync(fd, Buffer.from([10]), 0, 1, bytes.length);
    if (written !== 1) throw new Error('Unable to append the final LF byte.');
    fs.fchmodSync(fd, current.mode & 0o7777);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    result('changed', 'Appended one LF byte to NOTES.md; existing bytes and permission bits preserved.');
  }
} catch (error) {
  if (fd !== undefined) {
    try { fs.closeSync(fd); } catch {}
  }
  result('blocked', String(error.message));
}
````

## skills/documentation-review/SKILL.md

````
---
name: documentation-review
description: Review project documentation on request against the selected personal-tools or team-services standards, reporting concrete gaps without running documented commands.
---

# Documentation review

Use for an ordinary user-requested documentation review. This skill has no
standards adoption role. Its entire directory is source-owned and updated as a
unit. It requires an agent that can read local files and a known selected profile;
it needs no additional runtime, network, or credentials.

1. Establish whether the selected profile is personal-tools or team-services
   from the user's request or available explicit project context. Ask if unknown
   or contradictory; do not guess a profile from the language or directory names.
2. Read the selected profile's applicable guidance if available and the project
   documents within the scope below. Use the checklist in
   [Review checklist](references/checklist.md). If guidance is unavailable, say
   that the bundled checklist is the review basis. If it contradicts the
   checklist, report the mismatch rather than inventing a merged policy.
3. For personal-tools, review only README.md and CONTRIBUTING.md. For
   team-services, review README.md and runbooks under docs/runbooks/; leave
   employer-owned CONTRIBUTING.md outside this review. Do not follow symlinks
   outside the selected scope. Report missing or unreadable documents as gaps
   or limitations without inventing their contents.
4. Report concrete gaps with file paths, observed evidence, and suggested edits.
   Use the project's stated facts. If a command, output, health endpoint,
   procedure, or contact cannot be established from the reviewed documents,
   identify what needs confirmation. Do not invent working examples or owners.
5. Keep the review read-only unless the user explicitly requests edits. Do not
   execute documented commands, make network requests, assess runtime health,
   run enforcement checks, change standards selection, or invoke adoption.
6. Finish with the selected profile, reviewed paths, findings (or an explicit
   no-gaps result), and verification limits. A prose review cannot establish
   that commands work, outputs are accurate, or recovery procedures succeed.

Maintain the checklist alongside the source's profile guidance. Updates replace
this whole skill directory, including its resources.
````

## skills/documentation-review/references/checklist.md

````
# Review checklist

## personal-tools

README.md should remain brief and contain:
- A brief explanation of the utility's purpose.
- One working invocation for the project.
- A brief explanation of relevant failure cases and how the utility reports them.
- A short explanation of its input/output, including paths or stdin/stdout where relevant.

No particular headings or setup section are required. Review the documentation
of an invocation; do not execute it or assert it works without execution evidence.

CONTRIBUTING.md should briefly explain how to report a reproducible bug.
No contribution workflow is prescribed.

## team-services

README.md should explain the service's purpose, startup command, and health
endpoint using project facts. No tiny-tool invocation or sample output is
required beyond the startup command.

Runbooks under docs/runbooks/ should describe a recovery procedure and identify
an owner to contact. Use the actual procedures and ownership information.
CONTRIBUTING.md is outside this profile's governance and this review.
````

## guidance/team-readme.md

````
# README guidance for team services

Explain the service's purpose, its startup command, and its health endpoint using the project's actual facts.
Use the project's own organization. No CLI-usage invocation or sample output is required beyond the requested startup command.
````

## guidance/runbooks.md

````
# Runbook recovery guidance

Runbooks under docs/runbooks/ must describe a recovery procedure and identify an owner to contact.
Keep the runbooks project-owned and use the service's actual procedures and ownership information.
````

## authoring-notes.md

````
# Authoring notes

## Confirmed shared decisions

- editor-line-endings: files/editorconfig owns the entire non-executable
  .editorconfig in both profiles. Only LF endings and a final newline are set.
- readme-usage: guidance/readme.md governs project-owned README.md by default:
  brief purpose, one working invocation, a brief explanation of relevant failure
  cases and how the utility reports them, and the invocation’s input/output.
  This personal-tools revision retires the sample-output requirement so readers
  understand unsuccessful use; keep failure descriptions current. The matching
  personal-tools checklist in skills/documentation-review/references/checklist.md
  follows this rule. The whole skill bundle remains shared, while team-services
  criteria remain unchanged. No headings or setup section are required; keep
  tiny-tool documentation proportionate to maintenance effort.
- reproducible-bug-reports: guidance/contributing.md governs project-owned
  CONTRIBUTING.md by default with a brief reproducible-bug reporting explanation.
  No contribution workflow is prescribed.
- notes-final-newline: guidance/notes.md and operations/notes-final-newline.cjs
  govern only project-owned NOTES.md in both profiles. A check verifies empty
  content or a final LF byte; a fix appends exactly one missing LF, preserving
  existing bytes and permission bits and becoming unchanged on repeat. Existing
  CRLF is accepted. Missing, unreadable, nonregular, symbolic-link, and out-of-scope
  targets block; write failure blocks the fix. Neither operation creates files
  or normalizes line endings. This adds focused verification/repair beyond
  editor settings without assessing note quality. Accepted prerequisites:
  node >=24.0.0 <25.0.0, probe --version, 10-second timeout, literal check/fix
  argument, no resources, network, or credentials. Trusted scripts retain the
  invoking user's access. Maintain byte behavior and protocol/version support.
- documentation-review: skills/documentation-review owns the whole
  .agents/skills/documentation-review directory in both profiles, including its
  checklist. On ordinary requested review an agent reads the selected profile's
  guidance and scoped documents, then reports evidence, gaps, and suggested edits.
  It requires file-reading ability and a known profile; asks when unknown; needs
  no extra runtime, network, or credentials. Edits require a user request. It has
  no adoption/enforcement role and does not execute documented commands or assess
  runtime health. Maintain the checklist with the profile guidance.

## Complete profiles and rationale

personal-tools covers small personal CSV/text converters and inherits all five
shared declarations without changes.

team-services inherits editor-line-endings, notes-final-newline (including both
operations), and documentation-review. It:
- Replaces all of readme-usage with guidance/team-readme.md for the service's
  purpose, startup command, and health endpoint; tiny-tool invocation and sample
  output requirements do not carry over. Keep service facts accurate for teammates.
- Excludes reproducible-bug-reports because CONTRIBUTING.md belongs to the
  employer. Exclusion removes governance; it does not delete employer content.
- Adds runbook-recovery, with guidance/runbooks.md across the explicit
  docs/runbooks directory tree: a recovery procedure and an owner to contact.
  Maintain procedures and contacts for incident responders.

README.md, CONTRIBUTING.md when selected, NOTES.md, and runbooks remain
project-owned. Profiles are complete alternatives, not combined selections.

## Explicit non-preferences and declined contexts

No preference on indentation width or semicolons. Signed commits are not a
selected standard. No editor defaults beyond the two accepted settings.
Tutorial repositories do not get a distinct policy or profile.

## Skipped and deferred topics

CI is skipped. Whether to require tests remains explicitly deferred.

## Verification boundaries

All-profile public CLI validation establishes source structure, not behavior or
future project compliance. Operation fixtures and the same-agent documentation
review exercise are separate evidence retained outside this source. No adoption,
Git provisioning, commit, or publication is part of this authoring work.
````

## Exact revision diff

```diff
diff --git a/authoring-notes.md b/authoring-notes.md
index e175168..aef936f 100644
--- a/authoring-notes.md
+++ b/authoring-notes.md
@@ -5,9 +5,14 @@
 - editor-line-endings: files/editorconfig owns the entire non-executable
   .editorconfig in both profiles. Only LF endings and a final newline are set.
 - readme-usage: guidance/readme.md governs project-owned README.md by default:
-  brief purpose, one working invocation with concrete sample output, and its
-  input/output. No headings or setup section are required; keep tiny-tool
-  documentation proportionate to maintenance effort.
+  brief purpose, one working invocation, a brief explanation of relevant failure
+  cases and how the utility reports them, and the invocation’s input/output.
+  This personal-tools revision retires the sample-output requirement so readers
+  understand unsuccessful use; keep failure descriptions current. The matching
+  personal-tools checklist in skills/documentation-review/references/checklist.md
+  follows this rule. The whole skill bundle remains shared, while team-services
+  criteria remain unchanged. No headings or setup section are required; keep
+  tiny-tool documentation proportionate to maintenance effort.
 - reproducible-bug-reports: guidance/contributing.md governs project-owned
   CONTRIBUTING.md by default with a brief reproducible-bug reporting explanation.
   No contribution workflow is prescribed.
diff --git a/guidance/readme.md b/guidance/readme.md
index 30d6b03..672747f 100644
--- a/guidance/readme.md
+++ b/guidance/readme.md
@@ -2,7 +2,8 @@
 
 Keep README.md brief. Include:
 - A brief explanation of the utility's purpose.
-- One working invocation for this project, alongside concrete sample output.
+- One working invocation for this project.
+- A brief explanation of relevant failure cases and how the utility reports them.
 - A short explanation of that invocation's input and output, including file paths or stdin/stdout where relevant.
 
 Use the project's own facts and organization. No particular headings or setup section are required.
diff --git a/skills/documentation-review/references/checklist.md b/skills/documentation-review/references/checklist.md
index 9c4240c..fc76143 100644
--- a/skills/documentation-review/references/checklist.md
+++ b/skills/documentation-review/references/checklist.md
@@ -4,7 +4,8 @@
 
 README.md should remain brief and contain:
 - A brief explanation of the utility's purpose.
-- One working invocation for the project, alongside concrete sample output.
+- One working invocation for the project.
+- A brief explanation of relevant failure cases and how the utility reports them.
 - A short explanation of its input/output, including paths or stdin/stdout where relevant.
 
 No particular headings or setup section are required. Review the documentation
```

## Verification

Public CLI 1.1.0 on Node v24.11.1 returned exit 0 and valid:true for both profiles.
Resolved declarations exactly match the initial selection; guidance and checklist
bytes contain the accepted change. Existing HEAD, staged diff/index entries, and
untracked-file list are unchanged. Every existing file mode is unchanged. Only
the three accepted files differ in content; scratch.txt staged/unstaged content
and local-draft.txt remain intact. Structural validation does not run operations
or establish project compliance. The same-agent disposable skill exercise
confirmed the revised distinction and unchanged team criteria; its full review
is in skill-exercise-review.md. Existing NOTES check/fix behavior was unchanged
and not rerun in this revision; no new passing claim is made.
