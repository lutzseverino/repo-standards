import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { directoryFixture, installCli, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

const operation = (id: string) => ({ id, run: { executable: process.execPath, script: 'operation.mjs', resources: [], arguments: ['--quiet'] },
  prerequisite: { 'version-arguments': ['--version'], version: '^24' }, 'timeout-seconds': 10 });
const manifest = stringify({ format: 'repo-standards/v2', name: 'summarized-standards', description: 'Summary fixture',
  requires: { 'repo-standards': '>=1' }, defaults: { declarations: {
    instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
    docs: { kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md', fixes: [operation('prepare')], checks: [operation('verify')] },
  } }, profiles: { work: { description: 'Work', declarations: {} } } });
const files = {
  'agents.md': 'Pinned instructions\n',
  'guidance.md': 'Keep every maintained project README useful.\n',
  'discovery.md': 'Include the README of every maintained project.\n',
  'operation.mjs': `import {readFileSync, writeFileSync} from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
let status = input.operation.phase === 'fixes' ? 'unchanged' : 'passed';
if (input.operation.id === 'prepare' && !readFileSync('apps/a/README.md', 'utf8').includes('Prepared')) { writeFileSync('apps/a/README.md', '# Project A\\nPrepared.\\n'); status = 'changed'; }
console.log(JSON.stringify({format: 'repo-standards/result/v1', status, message: input.operation.id + ' done'}));
`,
};

// No summary names a workflow the product does not own.
function assertDescriptive(summary: string) {
  assert.doesNotMatch(summary, /ticket|session|pull request/i);
}

async function fixture(t: TestContext) {
  const remote = remoteFixture(manifest, files);
  const project = sourceFixture('', { 'apps/a/README.md': '# Project A\n' });
  commit(project.root);
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => cli.run(args, project.root, env);
  const json = (args: string[]) => JSON.parse(run(args).stdout);
  const scopeFile = join(remote.support.root, 'scope.json');
  function propose(args: string[]) {
    writeFileSync(scopeFile, JSON.stringify({ format: 'repo-standards/scope/v2', declarations: [{
      id: 'docs', coverage: 'The only maintained project.',
      candidates: [{ path: 'apps/a/README.md', decision: 'include', reason: 'A maintained project README.', evidence: ['apps/a/README.md'] }], unresolved: [] }] }));
    return [...args, '--scope', scopeFile];
  }
  function assess() {
    json(['resume', '--json']);
    const review = { status: 'valid', explanation: 'The confirmed project still matches.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
    const assessment = join(remote.support.root, 'assessment.json');
    writeFileSync(assessment, JSON.stringify({ format: 'repo-standards/assessment/v3',
      declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The prepared README satisfies the guidance.', evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }] }));
    return run(['resume', '--assessment', assessment, '--json']);
  }
  return { remote, project, run, json, propose, assess };
}

test('status --summary renders the active run and then the record of the complete run', async t => {
  const f = await fixture(t);
  const args = f.propose(inspectionArgs);
  const inspection = f.json(args);
  const handoff = f.run(['start', ...args.slice(1), '--confirm', inspection.identity]);
  assert.equal(JSON.parse(handoff.stdout).phase, 'contextual', handoff.stdout);

  const active = f.json(['status', '--json']).active;
  const running = f.run(['status', '--summary']);
  assert.equal(running.status, 0, running.stderr);
  const progress = running.stdout;
  assertDescriptive(progress);
  for (const heading of ['## Selection', '## Progress', '## Operations', '## Changed paths', '## Next action', '## Identities']) assert.ok(progress.includes(`\n${heading}\n`), heading);
  assert.ok(progress.includes('| Phase | contextual |'), progress);
  assert.ok(active.nextAction.endsWith('resume --assessment <file>.'), active.nextAction);
  assert.ok(progress.includes('\n## Next action\n\nApply the selected guidance, refresh the work request with resume, and submit evidence using resume --assessment \\<file\\>.\n'), progress);
  assert.ok(progress.includes('| fixes | `docs` | `prepare` | changed | prepare done |'), progress);
  assert.ok(progress.includes(`\`${active.id}\``) && progress.includes(`\`${inspection.identity}\``), progress);

  assert.equal(f.assess().status, 0);
  commit(f.project.root);
  const status = f.json(['status', '--json']);
  assert.deepEqual(status.scopeChanges, [{ id: 'docs', additions: ['apps/a/README.md'], removals: [] }]);
  const record = f.run(['status', '--summary']);
  assert.equal(record.status, 0, record.stderr);
  assert.equal(f.run(['status', '--summary']).stdout, record.stdout);
  const summary = record.stdout;
  assertDescriptive(summary);
  for (const heading of ['## Selection', '## Operations', '## Changed paths', '## Scope changes', '## Identities']) assert.ok(summary.includes(`\n${heading}\n`), heading);
  assert.ok(summary.includes('| fixes | `docs` | `prepare` | changed | prepare done |'), summary);
  assert.ok(summary.includes('| checks | `docs` | `verify` | passed | verify done |'), summary);
  assert.ok(summary.includes('| `apps/a/README.md` | fixes |'), summary);
  assert.ok(summary.includes('| `docs` | `apps/a/README.md` | none |'), summary);
  assert.ok(summary.includes(`\`${status.lastComplete.run}\``) && summary.includes(`\`${status.lastComplete.inspection}\``) && summary.includes(`\`${status.lastComplete.head}\``), summary);
});

// The complete-run record rendered from status --json, with the given operation
// and changed-path sections between its fixed sections.
function expectedRecord(status: { selection: { cli: { version: string }; standards: { repository: string; version: string; commit: string }; profile: string };
  lastComplete: { run: string; inspection: string; head: string; completedAt: string } }, operations: string, changedPaths: string, scopeChanges: string) {
  const { selection, lastComplete } = status;
  return `# Repository Standards adoption record

## Selection

| Component | Value |
| --- | --- |
| CLI | \`${selection.cli.version}\` |
| Standards source | \`${selection.standards.repository}\` |
| Standards version | \`${selection.standards.version}\` |
| Standards commit | \`${selection.standards.commit}\` |
| Profile | \`${selection.profile}\` |

## Operations

${operations}

## Changed paths

${changedPaths}

## Scope changes

${scopeChanges}

## Identities

| Record | Value |
| --- | --- |
| Run | \`${lastComplete.run}\` |
| Inspection | \`${lastComplete.inspection}\` |
| HEAD at start | \`${lastComplete.head}\` |
| Completed at | ${lastComplete.completedAt} |
`;
}

test('the adoption record lists a path changed by fixes and agent work once, with both phases, beside the installed paths', async t => {
  const f = await fixture(t);
  const args = f.propose(inspectionArgs);
  const inspection = f.json(args);
  assert.equal(JSON.parse(f.run(['start', ...args.slice(1), '--confirm', inspection.identity]).stdout).phase, 'contextual');
  writeFileSync(join(f.project.root, 'apps/a/README.md'), '# Project A\nPrepared.\nReviewed by the agent.\n');
  const completed = f.assess();
  assert.equal(completed.status, 0, completed.stdout);
  commit(f.project.root);

  const status = f.json(['status', '--json']);
  assert.deepEqual(status.changeSet, [
    { path: '.agents/skills/adopt-standards/SKILL.md', phases: ['installation'] },
    { path: '.agents/skills/adopt-standards/agents/openai.yaml', phases: ['installation'] },
    { path: 'AGENTS.md', phases: ['installation'] },
    { path: 'apps/a/README.md', phases: ['fixes', 'agent'] },
  ]);
  const record = f.run(['status', '--summary']);
  assert.equal(record.status, 0, record.stderr);
  assert.equal(record.stdout, expectedRecord(status, `| Phase | Declaration | Operation | Result | Message |
| --- | --- | --- | --- | --- |
| fixes | \`docs\` | \`prepare\` | changed | prepare done |
| checks | \`docs\` | \`verify\` | passed | verify done |`, `| Path | Phases |
| --- | --- |
| \`.agents/skills/adopt-standards/SKILL.md\` | installation |
| \`.agents/skills/adopt-standards/agents/openai.yaml\` | installation |
| \`AGENTS.md\` | installation |
| \`apps/a/README.md\` | fixes, agent |`, `| Declaration | Added | Removed |
| --- | --- | --- |
| \`docs\` | \`apps/a/README.md\` | none |`));
});

test('a path the agent returns to its content before the run is not a changed path', async t => {
  const f = await fixture(t);
  const args = f.propose(inspectionArgs);
  const inspection = f.json(args);
  assert.equal(JSON.parse(f.run(['start', ...args.slice(1), '--confirm', inspection.identity]).stdout).phase, 'contextual');
  writeFileSync(join(f.project.root, 'apps/a/README.md'), '# Project A\n');
  const completed = f.assess();
  assert.equal(completed.status, 0, completed.stdout);

  const status = f.json(['status', '--json']);
  assert.deepEqual(status.observations.filter((interval: { changes?: object }) => interval.changes && 'apps/a/README.md' in interval.changes)
    .map((interval: { phase: string }) => interval.phase), ['fixes', 'agent']);
  assert.deepEqual(status.changeSet.map((entry: { path: string }) => entry.path), ['.agents/skills/adopt-standards/SKILL.md', '.agents/skills/adopt-standards/agents/openai.yaml', 'AGENTS.md']);
});

test('the record of an update that only installs exact content lists every installed path, from durable state alone', async t => {
  const exactManifest = (agents: string) => stringify({ format: 'repo-standards/v2', name: 'exact-standards', description: 'Exact fixture',
    requires: { 'repo-standards': '>=1' }, defaults: { declarations: {
      instructions: { kind: 'file', target: 'AGENTS.md', exact: agents },
      review: { kind: 'skill', name: 'review', source: 'review' },
    } }, profiles: { work: { description: 'Work', declarations: {} } } });
  const remote = remoteFixture(exactManifest('agents.md'), { 'agents.md': 'Pinned instructions\n', 'review/SKILL.md': '---\nname: review\ndescription: Review changes.\n---\nReview.\n', 'review/notes.md': 'Notes\n' });
  const project = sourceFixture('', { 'README.md': '# Project\n' });
  commit(project.root);
  const clone = directoryFixture('repo-standards-clone-');
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); clone.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[], root = project.root) => cli.run(args, root, env);
  const adopt = (version: string) => {
    const args = inspectionArgs.map(argument => argument === 'v1.0.0' ? version : argument);
    const report = JSON.parse(run(args).stdout);
    const started = run(['start', ...args.slice(1), '--confirm', report.identity]);
    assert.equal(JSON.parse(started.stdout).outcome, 'complete', started.stdout);
    commit(project.root);
  };
  adopt('v1.0.0');
  rmSync(join(remote.source.root, 'review/notes.md'));
  remote.addVersion('v1.1.0', exactManifest('agents.md'), { 'agents.md': 'Revised instructions\n', 'review/SKILL.md': '---\nname: review\ndescription: Review changes carefully.\n---\nReview.\n' });
  adopt('v1.1.0');

  const status = JSON.parse(run(['status', '--json']).stdout);
  assert.equal(status.selection.standards.version, 'v1.1.0');
  assert.deepEqual(status.changeSet, [
    { path: '.agents/skills/review/SKILL.md', phases: ['installation'] },
    { path: '.agents/skills/review/notes.md', phases: ['installation'] },
    { path: 'AGENTS.md', phases: ['installation'] },
  ]);
  const expected = expectedRecord(status, 'No operations ran.', `| Path | Phases |
| --- | --- |
| \`.agents/skills/review/SKILL.md\` | installation |
| \`.agents/skills/review/notes.md\` | installation |
| \`AGENTS.md\` | installation |`, 'No scope changes.');
  const record = run(['status', '--summary']);
  assert.equal(record.status, 0, record.stderr);
  assert.equal(record.stdout, expected);

  // A fresh checkout holds only the committed durable state, and renders the same record.
  git(clone.root, 'clone', '--quiet', project.root, 'checkout');
  const fresh = run(['status', '--summary'], join(clone.root, 'checkout'));
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(fresh.stdout, expected);
});

test('the record of an update lists a removed retired target and a replaced edited target once, as installation', async t => {
  const manifest = (declarations: Record<string, unknown>) => stringify({ format: 'repo-standards/v2', name: 'exact-standards', description: 'Exact fixture',
    requires: { 'repo-standards': '>=1' }, defaults: { declarations }, profiles: { work: { description: 'Work', declarations: {} } } });
  const instructions = { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' };
  const remote = remoteFixture(manifest({ instructions, notes: { kind: 'file', target: 'NOTES.md', exact: 'notes.md' } }),
    { 'agents.md': 'Pinned instructions\n', 'notes.md': 'Pinned notes\n' });
  const project = sourceFixture('', { 'README.md': '# Project\n' });
  commit(project.root);
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => cli.run(args, project.root, env);
  const adopt = (version: string) => {
    const args = inspectionArgs.map(argument => argument === 'v1.0.0' ? version : argument);
    const report = JSON.parse(run(args).stdout);
    const started = run(['start', ...args.slice(1), '--confirm', report.identity]);
    assert.equal(JSON.parse(started.stdout).outcome, 'complete', started.stdout);
    commit(project.root);
    return report;
  };
  adopt('v1.0.0');
  // A committed local edit to an installed target, which the update replaces.
  writeFileSync(join(project.root, 'AGENTS.md'), 'Locally edited instructions\n');
  commit(project.root);
  remote.addVersion('v1.1.0', manifest({ instructions }), {});
  const report = adopt('v1.1.0');
  assert.deepEqual(report.removed.map((entry: { target: string }) => entry.target), ['NOTES.md']);
  assert.deepEqual(report.discardedEdits, ['AGENTS.md']);

  const status = JSON.parse(run(['status', '--json']).stdout);
  assert.deepEqual(status.changeSet, [
    { path: 'AGENTS.md', phases: ['installation'] },
    { path: 'NOTES.md', phases: ['installation'] },
  ]);
  const record = run(['status', '--summary']);
  assert.equal(record.status, 0, record.stderr);
  assert.equal(record.stdout, expectedRecord(status, 'No operations ran.', `| Path | Phases |
| --- | --- |
| \`AGENTS.md\` | installation |
| \`NOTES.md\` | installation |`, 'No scope changes.'));
});

test('inspect --summary renders a deterministic update proposal with its class, and lists blockers', async t => {
  const f = await fixture(t);
  const args = f.propose(inspectionArgs);
  const initial = f.json(args);
  assert.equal(JSON.parse(f.run(['start', ...args.slice(1), '--confirm', initial.identity]).stdout).phase, 'contextual');
  assert.equal(f.assess().status, 0);
  commit(f.project.root);

  f.remote.addVersion('v1.1.0', manifest, { ...files, 'agents.md': 'Revised instructions\n', 'guidance.md': 'Keep every maintained project README accurate.\n' });
  const updateArgs = f.propose(inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument));
  const report = f.json(updateArgs);
  const summaryArgs = updateArgs.map(argument => argument === '--json' ? '--summary' : argument);
  const first = f.run(summaryArgs);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(f.run(summaryArgs).stdout, first.stdout);
  const summary = first.stdout;
  assertDescriptive(summary);
  for (const heading of ['## Selection', '## Update class', '## Changed declarations', '## Operations', '## Scope changes', '## Retired declarations', '## Identity']) assert.ok(summary.includes(`\n${heading}\n`), heading);
  assert.ok(!summary.includes('\n## Blockers\n'), summary);
  assert.ok(summary.includes('| Standards version | `v1.0.0` | `v1.1.0` |'), summary);
  assert.ok(summary.includes('Contextual update'), summary);
  assert.ok(summary.includes('| `docs` | guidance |'), summary);
  assert.ok(summary.includes('| `instructions` | `AGENTS.md` | modified |'), summary);
  assert.ok(summary.includes(`| fixes | \`docs\` | \`prepare\` | \`${JSON.stringify([process.execPath, 'operation.mjs', '--quiet'])}\` |`), summary);
  assert.ok(summary.includes(`\`${report.identity}\``), summary);

  // Untracked content changes the discovery observation, so it needs a new proposal.
  writeFileSync(join(f.project.root, 'untracked.txt'), 'Untracked work\n');
  const blocked = f.run(f.propose(inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument)).map(argument => argument === '--json' ? '--summary' : argument));
  assert.equal(blocked.status, 0, blocked.stderr);
  assert.ok(blocked.stdout.includes('\n## Blockers\n'), blocked.stdout);
  assert.ok(blocked.stdout.includes('`DIRTY_PROJECT`'), blocked.stdout);
});

test('inspect --summary lists removed retired targets and each discarded edit', async t => {
  const exact = (declarations: object) => stringify({ format: 'repo-standards/v2', name: 'exact-standards', description: 'Exact fixture',
    requires: { 'repo-standards': '>=1' }, defaults: { declarations }, profiles: { work: { description: 'Work', declarations: {} } } });
  const instructions = { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' };
  const remote = remoteFixture(exact({ instructions, notes: { kind: 'file', target: 'NOTES.md', exact: 'notes.md' }, legacy: { kind: 'file', target: 'LEGACY.md', exact: 'legacy.md' } }),
    { 'agents.md': 'Pinned instructions\n', 'notes.md': 'Notes\n', 'legacy.md': 'Legacy\n' });
  const project = sourceFixture('');
  commit(project.root);
  const registry = await registryFixture(cli.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const initial = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  assert.equal(cli.run(['start', ...inspectionArgs.slice(1), '--confirm', initial.identity], project.root, env).status, 0);
  commit(project.root);
  writeFileSync(join(project.root, 'AGENTS.md'), 'Maintainer instructions\n');
  writeFileSync(join(project.root, 'LEGACY.md'), 'Maintainer legacy\n');
  commit(project.root);
  remote.addVersion('v1.1.0', exact({ instructions }), { 'agents.md': 'Revised instructions\n' });
  const summaryArgs = inspectionArgs.map(argument => argument === 'v1.0.0' ? 'v1.1.0' : argument === '--json' ? '--summary' : argument);
  const result = cli.run(summaryArgs, project.root, env);
  assert.equal(result.status, 0, result.stderr);
  const summary = result.stdout;
  assertDescriptive(summary);
  assert.ok(summary.includes(`## Changed declarations

Exact content:

| Declaration | Path | Change |
| --- | --- | --- |
| \`instructions\` | \`AGENTS.md\` | modified |
| \`legacy\` | \`LEGACY.md\` | deleted |
| \`notes\` | \`NOTES.md\` | deleted |
`), summary);
  assert.ok(summary.includes(`## Discarded edits

Replacing or removing these targets discards content that is not their installed baseline:

- \`AGENTS.md\`
- \`LEGACY.md\`

## Operations`), summary);
  assert.ok(!summary.includes('\n## Blockers\n'), summary);
});

test('--summary and --json together are a usage error', async t => {
  const project = sourceFixture('');
  t.after(() => project.close());
  commit(project.root);
  for (const args of [['inspect', '--summary', '--json'], ['status', '--json', '--summary'], [...inspectionArgs, '--summary']]) {
    const result = cli.run(args, project.root);
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'USAGE');
  }
  const plain = cli.run(['status', '--summary', '--summary'], project.root);
  assert.equal(plain.status, 2);
  assert.match(plain.stderr, /^\[USAGE\]/);
});
