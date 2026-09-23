import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, inspectionArgs, remoteFixture } from './remote-fixture.ts';
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
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(manifest, files);
  const project = sourceFixture('', { 'apps/a/README.md': '# Project A\n' });
  commit(project.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => cli.run(args, project.root, env);
  const json = (args: string[]) => JSON.parse(run(args).stdout);
  const scopeFile = join(remote.support.root, 'scope.json');
  function propose(args: string[]) {
    const request = json(args);
    const evidence = request.discovery.evidence.find((entry: { kind: string; path: string }) => entry.kind === 'file' && entry.path === 'apps/a/README.md');
    writeFileSync(scopeFile, JSON.stringify({ format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: [{
      id: 'docs', paths: ['apps/a/README.md'], coverage: 'The only maintained project.', evidence: [evidence],
      candidates: [{ path: 'apps/a/README.md', decision: 'include', reason: 'A maintained project README.', evidence: [evidence] }], unresolved: [] }] }));
    return [...args, '--scope', scopeFile];
  }
  function assess() {
    const work = json(['resume', '--json']).workRequest;
    const review = { status: 'valid', explanation: 'The confirmed project still matches.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
    const assessment = join(remote.support.root, 'assessment.json');
    writeFileSync(assessment, JSON.stringify({ format: 'repo-standards/assessment/v2', run: work.run, selection: work.selection, snapshot: work.snapshot,
      scope: { inspection: work.scope.inspection, afterFixes: work.scope.afterFixes },
      declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The prepared README satisfies the guidance.', changedPaths: [], evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }] }));
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
  assert.ok(summary.includes('| `apps/a/README.md` | fixes | `docs/prepare` |'), summary);
  assert.ok(summary.includes('| `docs` | `apps/a/README.md` | none |'), summary);
  assert.ok(summary.includes(`\`${status.lastComplete.run}\``) && summary.includes(`\`${status.lastComplete.inspection}\``) && summary.includes(`\`${status.lastComplete.head}\``), summary);
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
