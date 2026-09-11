# Accepted behavior and disposable exercises

Use this branch when configuration or guidance leaves a concrete need for a
check, fix, or ordinary-work author skill. Read the acquired CLI's matching
`docs/author-format.md` and `docs/script-protocol.md` using [the acquisition
guide](cli.md). Those documents define the format and operation protocol.

## Propose and obtain acceptance

Explain the additional value over configuration/guidance, then show a small
behavior proposal before including material in the source:

- What triggers it, which declaration and paths it governs, and what it leaves
  alone. Explain profile exclusions and any limitations of the check's evidence.
- For a check, what passes, fails, or blocks and how it stays read-only. For a
  fix, precisely what it changes or preserves, when it blocks, and why retrying
  after a partial run is safe. For a skill, its ordinary-work invocation, actions,
  expected output, and whole-directory ownership; it has no adoption role.
- Tools, versions, version probes, literal arguments, timeouts, resources, and
  any network, credential, or host-access needs. Trusted operations inherit the
  invoking user's access; disposable fixtures are not a sandbox. Skill tools and
  prerequisites belong in the skill material, not new YAML fields.

Ask for acceptance of that behavior and those prerequisites. A policy-only yes
is insufficient. Explicit acceptance already given in the current request counts;
return for review when the behavior, scope, or prerequisites change. Record the
accepted choice and rationale in authoring notes, not the private conversation.

## Generate the whole material

Use the four existing declaration forms. Checks/fixes belong to their owning
declaration and disappear with its exclusion; replacement restates the whole
declaration. Generate every referenced script and resource, preserving their
source-relative layout. Use declared literal argument vectors without a shell.
Scripts read the versioned stdin request, active resolved declarations and
`allowedTargets`, and respect the selected scope. A fix observes current content
and makes only missing changes. Checks leave project content unchanged.

Return exactly the protocol's result object on stdout, human logs on stderr,
and zero exit for ordinary result statuses, including a failed check or blocked
fix. Report process failures separately. Use the matching protocol's allowed
statuses for each phase; a successful process exit alone is not a passing check.

For an author skill, generate a complete `SKILL.md` with its name, description,
ordinary-work steps and completion criteria, plus every referenced resource.
Use a non-reserved skill name. Review all material and its ownership with the
author; format validation checks references, not instruction quality.

## Exercise operations without adoption

Validate the local source with the installed public CLI, retaining the complete
all-profile JSON outside the source. Validation is read-only: it executes neither
author operations nor prerequisite probes. Use its resolved declarations to
construct exercises; do not implement another YAML resolver or add an authoring
CLI command.

Create disposable project-content fixtures outside the source and working
projects. They need no Git repository. Copy only the selected scripts and declared
resources to a separate temporary retained-source directory, keeping relative
paths, so undeclared resource dependencies cannot hide in the original source.
Keep requests, results, and the exercise harness outside project fixtures too.

For each active operation:

1. Separately run the declared executable with its literal version-probe
   arguments from the fixture root, bounded by the declared timeout. Compare the
   observed version with the declared range as the matching protocol describes.
   If missing, failed, unreadable, or incompatible, record the actual blocker and
   leave that operation unverified. Do not silently install or substitute tools.
2. Build a `repo-standards/operation/v1` request using the validated profile's
   complete resolved declarations, its actual owning declaration/phase/operation
   ID, absolute fixture `projectRoot`, and the owner's exact `allowedTargets`.
   Supply syntactically valid, explicitly synthetic standards provenance in the
   protocol's repository/version/commit fields; this is fixture metadata, not a
   publication claim. File owners allow one path, skill owners their whole target
   directory, and repository owners their declared paths/directory trees.
3. Invoke `[executable, absolute-copied-script, ...run.arguments]` directly with
   fixture-root cwd, the JSON request on stdin, and bounded timeout/output. For
   example, a Node exercise can use `spawnSync(executable, [script, ...args],
   { cwd: projectRoot, input: JSON.stringify(request), encoding: 'utf8',
   timeout: timeoutSeconds * 1000, maxBuffer: 1024 * 1024, shell: false })`.
   Capture process status, stdout, stderr and parsed result separately. Check the
   exact result fields/format and phase-appropriate status against the protocol.
4. Run the check on violating content first; expect a zero-exit `failed` result
   with a useful reason. Exercise an applicable blocked case. Run the fix on
   repairable content, inspect the actual change, then repeat it and expect
   `unchanged` with identical bytes/modes. Check the repaired fixture and expect
   `passed`. Also exercise any promised preservation or partial-retry behavior.
5. Compare full fixture inventories, bytes and modes around each invocation.
   Every check must preserve them, including when failed or blocked; fixes must
   preserve content outside allowed scope. Include unrelated sentinel content and
   relevant excluded material. Select operations only from resolved declarations:
   an excluded declaration contributes no invocation. Preserve literal arguments
   (including spaces or shell-looking text where relevant) and verify behavior
   with only declared resources available.

Adapt fixtures to accepted behavior instead of inventing policies to fit a test.
Keep this exercise separate from standards adoption: do not call `inspect`,
`start`, or `resume`, provision/commit a repository, publish a source, or add
local-directory adoption. Product acceptance separately reuses its installed-CLI
author-operation/adoption fixtures to verify runtime enforcement. A direct
protocol exercise demonstrates the generated script, not the CLI's integrity,
prerequisite orchestration, or adoption lifecycle.

## Review evidence and limits

Retain fixture inputs, requests, actual command vectors, tool versions, process
and protocol results, and before/after comparisons outside the generated source.
Report failure → repair → repeated fix → passing check only when observed. Name
untested platforms, branches, unavailable tools, external services and other
limits. If behavior fails its accepted intent, correct and rerun it; changes to
the accepted proposal return to author review.

Exercise an author skill in a disposable ordinary-work task when its tools are
available. Record the actual actions/output and who evaluated usefulness. A
content review or valid directory alone is not behavioral verification; if no
agent exercise occurred, say so and obtain explicit deferral of that verification.
Author skills use their ordinary agent interface, not the operation JSON protocol.

Return to whole-source review with complete generated material and separate
structural, operation, and author-skill evidence. Resolve or explicitly defer
remaining verification with the author, then validate the final reviewed source
again. Completion hands off publication; it makes no claim of adoption.
