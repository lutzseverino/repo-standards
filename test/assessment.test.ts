import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());
const operation = (id: string) => ({ id, run: { executable: process.execPath, script: 'check.mjs', resources: [], arguments: [] },
  prerequisite: { 'version-arguments': ['--version'], version: '>=24 <25' }, 'timeout-seconds': 5 });
async function fixture(t: TestContext, script = `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Verified'}));`) {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(stringify({ format: 'repo-standards/v1', name: 'alice', description: 'Alice standards',
    requires: { 'repo-standards': '^1' }, defaults: { declarations: {
      agents: { kind: 'file', target: 'AGENTS.md', exact: 'default.md' },
      contribution: { kind: 'file', target: 'CONTRIBUTING.md', exact: 'default.md' },
      readme: { kind: 'file', target: 'README.md', guidance: 'readme.md', checks: [operation('headings')] },
      review: { kind: 'skill', name: 'review', source: 'skill' },
      layout: { kind: 'repository', guidance: 'layout.md', targets: { paths: ['config.json'], directories: ['src'] } },
    } }, profiles: { work: { description: 'Work', declarations: {
      agents: { kind: 'file', target: 'AGENTS.md', exact: 'work.md' }, contribution: { exclude: true },
    } } } }), { 'default.md': 'Default', 'work.md': 'Work instructions', 'readme.md': 'Describe setup and architecture.',
    'layout.md': 'Explain source responsibilities.', 'skill/SKILL.md': '# Review', 'check.mjs': script });
  const project = sourceFixture('', { 'README.md': '# Bob\nA queue service.', 'CONTRIBUTING.md': 'Employer policy', '.gitignore': 'ignored/\n', 'src/old.ts': '// Old' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
  const run = JSON.parse(result.stdout);
  assert.equal(run.phase, 'contextual', result.stdout + result.stderr);
  return { project, remote, env, run, resume(assessment?: unknown) {
    const args = ['resume', '--json'];
    if (assessment !== undefined) {
      const path = join(remote.support.root, 'assessment.json');
      writeFileSync(path, typeof assessment === 'string' ? assessment : JSON.stringify(assessment));
      args.push('--assessment', path);
    }
    const result = cli.run(args, project.root, env);
    return { result, report: JSON.parse(result.stdout) };
  } };
}

test('contextual handoff identifies the run, retained guidance, allowed targets and required evidence', async t => {
  const f = await fixture(t);
  assert.equal(f.run.outcome, 'incomplete');
  assert.equal(f.run.operations.length, 0);
  const request = f.run.workRequest;
  assert.equal(request.format, 'repo-standards/work-request/v1');
  assert.equal(request.run, f.run.id);
  assert.match(request.selection, /^sha256:/);
  assert.match(request.snapshot, /^sha256:/);
  assert.deepEqual(request.declarations.map((d: { id: string }) => d.id), ['layout', 'readme']);
  assert.deepEqual(request.declarations[0].allowedTargets, { paths: ['config.json'], directories: ['src'] });
  assert.equal(request.declarations[1].guidance.content, 'Describe setup and architecture.');
  assert.deepEqual(request.requiredEvidence, ['status', 'explanation', 'changedPaths', 'evidence']);
  assert.equal(readFileSync(join(f.project.root, 'AGENTS.md'), 'utf8'), 'Work instructions');
  assert.equal(readFileSync(join(f.project.root, 'CONTRIBUTING.md'), 'utf8'), 'Employer policy');
  assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
});

function submission(request: { run: string; selection: string; snapshot: string }, changedPaths = ['README.md']) {
  return { format: 'repo-standards/assessment/v1', run: request.run, selection: request.selection, snapshot: request.snapshot,
    declarations: [
      { id: 'layout', status: 'satisfied', explanation: 'Source responsibilities documented.', changedPaths: ['src/queue.ts'], evidence: ['Queue module identifies its responsibility.'] },
      { id: 'readme', status: 'satisfied', explanation: 'README describes Bob’s service.', changedPaths, evidence: ['Setup and architecture explain the queue.'] },
    ] };
}
function contextualWork(root: string) {
  writeFileSync(join(root, 'README.md'), '# Bob\n## Setup\nRun the queue worker.\n## Architecture\nsrc/queue.ts owns delivery.');
  writeFileSync(join(root, 'src/queue.ts'), '// Owns queued message delivery.');
}
test('scripted agent completes Alice work with separate assessment and check evidence and unchanged HEAD', async t => {
  const f = await fixture(t);
  const head = git(f.project.root, 'rev-parse', 'HEAD');
  contextualWork(f.project.root);
  const refreshed = f.resume();
  assert.equal(refreshed.report.phase, 'contextual', refreshed.result.stdout);
  assert.notEqual(refreshed.report.workRequest.snapshot, f.run.workRequest.snapshot);
  const { result, report } = f.resume(submission(refreshed.report.workRequest));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.outcome, 'complete');
  assert.equal(report.operations[0].result.status, 'passed');
  const status = JSON.parse(cli.run(['status', '--json'], f.project.root, f.env).stdout);
  assert.equal(status.active, null);
  assert.equal(status.assessments[0].snapshot, refreshed.report.workRequest.snapshot);
  assert.equal(status.assessments[0].declarations.length, 2);
  assert.equal(status.checks.length, 1);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), head);
  assert.notEqual(git(f.project.root, 'status', '--porcelain'), '');
  assert.equal(readFileSync(join(f.project.root, 'CONTRIBUTING.md'), 'utf8'), 'Employer policy');
});

test('blocked agent evidence is retained separately and prevents checks until renewed assessment', async t => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  const request = f.resume().report.workRequest;
  const blocked = submission(request);
  blocked.declarations[0]!.status = 'blocked';
  blocked.declarations[0]!.explanation = 'Queue ownership needs maintainer clarification.';
  const { result, report } = f.resume(blocked);
  assert.equal(result.status, 1);
  assert.match(report.reason, /ASSESSMENT_BLOCKED/);
  assert.equal(report.operations.length, 0);
  assert.equal(report.assessments[0].declarations[0].status, 'blocked');
  assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
  const renewed = f.resume(submission(request));
  assert.equal(renewed.result.status, 0, renewed.result.stdout);
});

test('malformed and mismatched assessments, missing declarations and inaccurate paths stay incomplete', async t => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  const request = f.resume().report.workRequest;
  const valid = submission(request);
  const examples: { name: string; code: string; change: (value: ReturnType<typeof submission>) => unknown }[] = [
    { name: 'invalid JSON', code: 'ASSESSMENT_FORMAT', change: () => '{' },
    { name: 'null', code: 'ASSESSMENT_FORMAT', change: () => null },
    { name: 'unknown field', code: 'ASSESSMENT_FORMAT', change: value => ({ ...value, unexpected: true }) },
    { name: 'another run', code: 'ASSESSMENT_MISMATCH', change: value => ({ ...value, run: 'another' }) },
    { name: 'another selection', code: 'ASSESSMENT_MISMATCH', change: value => ({ ...value, selection: 'another' }) },
    { name: 'wrong snapshot', code: 'STALE_ASSESSMENT', change: value => ({ ...value, snapshot: 'another' }) },
    { name: 'missing declaration', code: 'ASSESSMENT_DECLARATIONS', change: value => ({ ...value, declarations: value.declarations.slice(1) }) },
    { name: 'duplicate declaration', code: 'ASSESSMENT_DECLARATIONS', change: value => ({ ...value, declarations: [value.declarations[0], value.declarations[0]] }) },
    { name: 'unknown declaration', code: 'ASSESSMENT_DECLARATIONS', change: value => { value.declarations[0]!.id = 'unknown'; return value; } },
    { name: 'no explanation', code: 'ASSESSMENT_FORMAT', change: value => { value.declarations[0]!.explanation = ' '; return value; } },
    { name: 'no evidence', code: 'ASSESSMENT_FORMAT', change: value => { value.declarations[0]!.evidence = []; return value; } },
    { name: 'array status', code: 'ASSESSMENT_FORMAT', change: value => ({ ...value, declarations: value.declarations.map(entry => ({ ...entry, status: ['satisfied'] })) }) },
    { name: 'invalid status', code: 'ASSESSMENT_FORMAT', change: value => { value.declarations[0]!.status = 'passed'; return value; } },
    { name: 'missing changed path', code: 'ASSESSMENT_PATHS', change: value => { value.declarations[0]!.changedPaths = []; return value; } },
    { name: 'extra unchanged path', code: 'ASSESSMENT_PATHS', change: value => { value.declarations[0]!.changedPaths.push('src/old.ts'); return value; } },
    { name: 'path in wrong declaration', code: 'ASSESSMENT_SCOPE', change: value => { value.declarations[0]!.changedPaths.push('README.md'); return value; } },
    { name: 'parent escape', code: 'ASSESSMENT_FORMAT', change: value => { value.declarations[0]!.changedPaths.push('../elsewhere'); return value; } },
    { name: 'duplicate path', code: 'ASSESSMENT_FORMAT', change: value => { value.declarations[0]!.changedPaths.push('src/queue.ts'); return value; } },
  ];
  for (const example of examples) await t.test(example.name, () => {
    const { result, report } = f.resume(example.change(structuredClone(valid)));
    assert.equal(result.status, 1, result.stdout);
    assert.ok(report.reason.startsWith(example.code + ':'), report.reason);
    assert.equal(report.operations.length, 0);
    assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
  });
  assert.equal(f.resume(valid).result.status, 0);
});

test('unreported out-of-scope tracked and untracked changes block completion while ignored content is excluded', async t => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  for (const path of ['CONTRIBUTING.md', 'unrelated.txt', 'src-other.txt']) await t.test(path, () => {
    const target = join(f.project.root, path);
    const before = existsSync(target) ? readFileSync(target) : null;
    writeFileSync(target, 'Unrelated work');
    const request = f.resume().report.workRequest;
    const { report } = f.resume(submission(request));
    assert.match(report.reason, /ASSESSMENT_SCOPE/);
    assert.equal(readFileSync(target, 'utf8'), 'Unrelated work');
    if (before) writeFileSync(target, before); else rmSync(target);
  });
  mkdirSync(join(f.project.root, 'ignored'));
  const request = f.resume().report.workRequest;
  writeFileSync(join(f.project.root, 'ignored/cache'), 'Ignored work');
  assert.equal(f.resume(submission(request)).result.status, 0);
});

test('changed content invalidates prior assessment and every check runs again after renewed evidence', async t => {
  const f = await fixture(t, `import { readFileSync } from 'node:fs';
console.log(JSON.stringify({format:'repo-standards/result/v1',status:readFileSync('README.md','utf8').includes('Ready')?'passed':'failed',message:'Requires readiness'}));`);
  contextualWork(f.project.root);
  const initial = submission(f.resume().report.workRequest);
  const failed = f.resume(initial);
  assert.match(failed.report.reason, /CHECKS_FAILED/);
  assert.equal(failed.report.assessments.length, 1);
  writeFileSync(join(f.project.root, 'README.md'), readFileSync(join(f.project.root, 'README.md'), 'utf8') + '\nReady');
  const stale = f.resume(initial);
  assert.match(stale.report.reason, /STALE_ASSESSMENT/);
  assert.equal(stale.report.operations.length, 1);
  const complete = f.resume(submission(f.resume().report.workRequest));
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.deepEqual(complete.report.operations.map((o: { result: { status: string } }) => o.result.status), ['failed', 'passed']);
  const status = JSON.parse(cli.run(['status', '--json'], f.project.root, f.env).stdout);
  assert.equal(status.checks.length, 1);
  assert.equal(status.checks[0].result.status, 'passed');
});

test('contextual work cannot corrupt installed exact content, full skills, inputs or product state', async t => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  const valid = submission(f.resume().report.workRequest);
  for (const path of ['AGENTS.md', '.agents/skills/review/SKILL.md', '.agents/skills/review/added.txt',
    '.repo-standards/inputs/source/readme.md', '.repo-standards/inputs/added.txt', '.repo-standards/selection.yaml',
    '.repo-standards/runtime/package.json', '.repo-standards/unexpected.txt']) await t.test(path, () => {
    const target = join(f.project.root, path);
    const before = existsSync(target) ? readFileSync(target) : null;
    writeFileSync(target, 'Corrupted');
    const { result, report } = f.resume(valid);
    assert.equal(result.status, 1);
    assert.match(report.reason, /FINAL_INTEGRITY/);
    assert.equal(report.operations.length, 0);
    assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
    assert.equal(readFileSync(target, 'utf8'), 'Corrupted');
    if (before) writeFileSync(target, before); else rmSync(target);
  });
  assert.equal(f.resume(valid).result.status, 0);
});

test('checks after assessment still reject mutation and exact-content corruption', async t => {
  for (const [path, code] of [['README.md', 'CHECK_MUTATION'], ['.agents/skills/review/added.txt', 'FINAL_INTEGRITY']]) await t.test(path!, async st => {
    const f = await fixture(st, `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(path)}, 'Changed during check');
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Reported success'}));`);
    contextualWork(f.project.root);
    const { result, report } = f.resume(submission(f.resume().report.workRequest));
    assert.equal(result.status, 1);
    assert.ok(report.reason.startsWith(code + ':'), report.reason);
    assert.equal(report.assessments.length, 1);
    assert.equal(report.operations.length, 1);
    assert.equal(readFileSync(join(f.project.root, path!), 'utf8'), 'Changed during check');
    assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
  });
});

test('content changing between assessment and final verification requires reassessment and fresh checks', async t => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  const valid = submission(f.resume().report.workRequest);
  const env = filesystemFault(f.remote.support.root, f.env, 'verification', `write.call(fs, 'README.md', '# Bob\\nChanged after assessment');`);
  const assessmentPath = join(f.remote.support.root, 'assessment.json');
  writeFileSync(assessmentPath, JSON.stringify(valid));
  const result = cli.run(['resume', '--assessment', assessmentPath, '--json'], f.project.root, env);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(report.reason, /STALE_ASSESSMENT/);
  assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
  const renewed = f.resume(submission(f.resume().report.workRequest));
  assert.equal(renewed.result.status, 0, renewed.result.stdout);
  assert.equal(renewed.report.operations.length, 2);
});

test('a second independent author uses fixes, repository configuration and runbook evidence through the same handoff', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(stringify({ format: 'repo-standards/v1', name: 'charlie-operations', description: 'Service operations standards',
    requires: { 'repo-standards': '^1' }, defaults: { declarations: {
      operations: { kind: 'repository', guidance: 'ops.md', targets: { paths: ['service.json'], directories: ['runbooks'] },
        fixes: [operation('prepare')], checks: [operation('verify')] },
    } }, profiles: { work: { description: 'Production service', declarations: {} } } }), {
    'ops.md': 'Record a service owner, incident command and a service-specific recovery procedure.',
    'check.mjs': `import { readFileSync, writeFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0,'utf8'));
if (input.operation.phase === 'fixes') writeFileSync('service.json', JSON.stringify({owner:'payments'}));
const status = input.operation.phase === 'fixes' ? 'changed' : JSON.parse(readFileSync('service.json','utf8')).owner === 'payments' && readFileSync('runbooks/recovery.md','utf8').includes('Replay failed payments') ? 'passed' : 'failed';
console.log(JSON.stringify({format:'repo-standards/result/v1',status,message:'Service operations verified'}));`,
  }, [], 'charlie/operations');
  const project = sourceFixture('', { 'README.md': '# Payments API' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const args = inspectionArgs.map(arg => arg === 'https://github.com/alice/standards' ? 'https://github.com/charlie/operations' : arg);
  const inspected = cli.run(args, project.root, env);
  const inspection = JSON.parse(inspected.stdout);
  assert.equal(inspected.status, 0, inspected.stdout);
  const started = JSON.parse(cli.run(['start', ...args.slice(1), '--confirm', inspection.identity], project.root, env).stdout);
  assert.equal(started.phase, 'contextual');
  assert.equal(started.operations[0].result.status, 'changed');
  assert.equal(readFileSync(join(project.root, 'service.json'), 'utf8'), '{"owner":"payments"}');
  mkdirSync(join(project.root, 'runbooks'));
  writeFileSync(join(project.root, 'runbooks/recovery.md'), 'Incident command: payments on-call. Replay failed payments using the queue.');
  const request = JSON.parse(cli.run(['resume', '--json'], project.root, env).stdout).workRequest;
  const path = join(remote.support.root, 'assessment.json');
  writeFileSync(path, JSON.stringify({ format: 'repo-standards/assessment/v1', run: request.run, selection: request.selection, snapshot: request.snapshot,
    declarations: [{ id: 'operations', status: 'satisfied', explanation: 'Owner recorded and payments recovery documented.', changedPaths: ['runbooks/recovery.md'], evidence: ['service.json names payments; runbook gives the replay procedure.'] }] }));
  const resumed = cli.run(['resume', '--assessment', path, '--json'], project.root, env);
  assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
  assert.deepEqual(JSON.parse(resumed.stdout).operations.map((o: { result: { status: string } }) => o.result.status), ['changed', 'passed']);
});

test('assessment accounts for deleted tracked files and executable changes', async t => {
  const f = await fixture(t);
  contextualWork(f.project.root);
  const before = f.resume().report.workRequest;
  rmSync(join(f.project.root, 'src/old.ts'));
  chmodSync(join(f.project.root, 'src/queue.ts'), 0o755);
  assert.match(f.resume(submission(before)).report.reason, /STALE_ASSESSMENT/);
  const assessment = submission(f.resume().report.workRequest);
  assessment.declarations[0]!.changedPaths.push('src/old.ts');
  const { result } = f.resume(assessment);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.project.root, 'src/old.ts')), false);
});

test('only one resume can execute checks for an active contextual adoption', async t => {
  const f = await fixture(t, `import { writeFileSync } from 'node:fs';
writeFileSync('.repo-standards/local/check-started', 'started');
setTimeout(()=>console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Verified'})),1000);`);
  contextualWork(f.project.root);
  const assessment = submission(f.resume().report.workRequest);
  const path = join(f.remote.support.root, 'assessment.json');
  writeFileSync(path, JSON.stringify(assessment));
  const child = spawn(join(cli.root, 'node_modules/.bin/repo-standards'), ['resume', '--assessment', path, '--json'], { cwd: f.project.root, env: f.env });
  t.after(() => child.kill());
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const finished = new Promise<number | null>((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
  const deadline = Date.now() + 5000;
  while (!existsSync(join(f.project.root, '.repo-standards/local/check-started')) && child.exitCode === null && Date.now() < deadline) await setTimeout(10);
  assert.equal(existsSync(join(f.project.root, '.repo-standards/local/check-started')), true, output);
  const concurrent = cli.run(['resume', '--assessment', path, '--json'], f.project.root, f.env);
  assert.equal(concurrent.status, 1, concurrent.stdout);
  assert.equal(JSON.parse(concurrent.stdout).errors[0].code, 'ACTIVE_RUN');
  assert.equal(await finished, 0, output);
  assert.equal(JSON.parse(output).operations.length, 1);
});
