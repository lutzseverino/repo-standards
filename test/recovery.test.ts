import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { stringify } from 'yaml';
import { filesystemFault } from './adoption-faults.ts';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

async function fixture(t: TestContext, declarations: Record<string, unknown> = {}, script = '') {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(stringify({ format: 'repo-standards/v1', name: 'recovery', description: 'Recovery standards',
    requires: { 'repo-standards': '^1' }, defaults: { declarations: {
      agents: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' }, ...declarations,
    } }, profiles: { work: { description: 'Work', declarations: {} } } }), {
    'agents.md': 'Expected instructions', 'guide.md': 'Explain this project.', 'run.mjs': script,
  });
  const project = sourceFixture('', { 'README.md': 'Original project' });
  commit(project.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const inspection = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const startArgs = ['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity];
  return { remote, project, env, startArgs, head: git(project.root, 'rev-parse', 'HEAD'),
    run(args: string[], environment: NodeJS.ProcessEnv = env) { return cli.run(args, project.root, environment); },
    report(args: string[]) { const result = cli.run(args, project.root, env); return { result, report: JSON.parse(result.stdout) }; },
  };
}

test('explicit retry recovers installation after process death and verifies confirmed files before writing', async t => {
  const f = await fixture(t);
  const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/AGENTS.md')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const interrupted = f.report(['status', '--json']).report;
  assert.equal(interrupted.active.outcome, 'incomplete');
  assert.equal(interrupted.active.phase, 'installation');
  assert.ok(interrupted.active.changes.includes('AGENTS.md'));
  assert.equal(interrupted.execution, 'interrupted');
  assert.equal(f.report(f.startArgs).report.errors[0].code, 'ACTIVE_RUN');
  assert.equal(f.report(['resume', '--json']).report.errors[0].code, 'RESUME_UNAVAILABLE');
  assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
  const retried = f.report(['resume', '--retry', '--json']);
  assert.equal(retried.result.status, 0, retried.result.stdout + retried.result.stderr);
  assert.equal(retried.report.id, interrupted.active.id);
  assert.equal(retried.report.outcome, 'complete');
  assert.equal(readFileSync(join(f.project.root, 'AGENTS.md'), 'utf8'), 'Expected instructions');
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
  assert.ok(git(f.project.root, 'status', '--porcelain').length > 0);
  assert.equal(f.report(['status', '--json']).report.lastComplete.run, retried.report.id);
});

function operation(id: string) {
  return { id, run: { executable: process.execPath, script: 'run.mjs', resources: [], arguments: [] },
    prerequisite: { 'version-arguments': ['--version'], version: '^24' }, 'timeout-seconds': 10 };
}

test('uncertain fixes require explicit retry, rerun fixes, renew contextual evidence and rerun checks', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md',
    fixes: [operation('prepare')], checks: [operation('verify')] } }, `
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.operation.phase === 'fixes') {
  const marker = '.repo-standards/local/fix-attempts';
  const count = existsSync(marker) ? Number(readFileSync(marker, 'utf8')) : 0;
  writeFileSync(marker, String(count + 1));
  writeFileSync('README.md', 'Prepared project');
  if (count === 0) { process.kill(process.ppid, 'SIGKILL'); process.exit(0); }
}
console.log(JSON.stringify({format:'repo-standards/result/v1',status:input.operation.phase === 'fixes'?'changed':'passed',message:'Verified'}));`);
  assert.equal(f.run(f.startArgs).signal, 'SIGKILL');
  const stopped = f.report(['status', '--json']).report.active;
  assert.equal(stopped.phase, 'fixes');
  assert.equal(stopped.operations.length, 0);
  assert.match(stopped.uncertain.join(' '), /readme\/prepare.*uncertain/);
  assert.ok(stopped.completed.includes('AGENTS.md'));
  assert.ok(stopped.changes.includes('README.md'));
  assert.match(stopped.nextAction, /resume --retry/);
  assert.equal(f.report(['resume', '--json']).report.errors[0].code, 'RESUME_UNAVAILABLE');
  const retry = f.report(['resume', '--retry', '--json']).report;
  assert.equal(retry.phase, 'contextual');
  assert.equal(retry.operations.length, 1);
  assert.equal(retry.retryHistory[0].phase, 'fixes');
  assert.ok(retry.retryHistory[0].uncertain.length);
  assert.equal(readFileSync(join(f.project.root, '.repo-standards/local/fix-attempts'), 'utf8'), '2');
  writeFileSync(join(f.project.root, 'README.md'), 'Prepared project with specific instructions');
  const request = f.report(['resume', '--json']).report.workRequest;
  const assessment = { format: 'repo-standards/assessment/v1', run: request.run, selection: request.selection, snapshot: request.snapshot,
    declarations: [{ id: 'readme', status: 'satisfied', explanation: 'Project instructions completed.', changedPaths: ['README.md'], evidence: ['README includes specific instructions.'] }] };
  const path = join(f.remote.support.root, 'assessment.json');
  writeFileSync(path, JSON.stringify(assessment));
  const complete = f.report(['resume', '--assessment', path, '--json']);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.deepEqual(complete.report.operations.map((entry: { operation: { phase: string } }) => entry.operation.phase), ['fixes', 'checks']);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
});

test('surviving author processes block retry and abandonment after the CLI dies', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('wait')] } }, `
import { readFileSync, writeFileSync } from 'node:fs';
readFileSync(0, 'utf8');
writeFileSync('.repo-standards/local/author-pid', String(process.pid));
process.kill(process.ppid, 'SIGKILL');
setInterval(() => {}, 1000);`);
  assert.equal(f.run(f.startArgs).signal, 'SIGKILL');
  const pid = Number(readFileSync(join(f.project.root, '.repo-standards/local/author-pid'), 'utf8'));
  t.after(() => { try { process.kill(-pid, 'SIGKILL'); } catch {} });
  assert.equal(f.report(['status', '--json']).report.execution, 'active');
  for (const args of [['resume', '--retry', '--json'], ['abandon', '--json'], f.startArgs]) {
    assert.equal(f.report(args).report.errors[0].code, 'ACTIVE_RUN');
  }
  process.kill(-pid, 'SIGKILL');
});

test('abandon preserves actual work, historical evidence and an accessible report without moving HEAD', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md' } });
  const started = f.report(f.startArgs).report;
  writeFileSync(join(f.project.root, 'README.md'), 'Unfinished contextual work');
  const abandoned = f.report(['abandon', '--json']);
  assert.equal(abandoned.result.status, 1, abandoned.result.stdout);
  assert.equal(abandoned.report.outcome, 'incomplete');
  assert.equal(abandoned.report.abandoned, true);
  assert.equal(abandoned.report.phase, 'contextual');
  assert.match(abandoned.report.reason, /ABANDONED.*CONTEXTUAL_REQUIRED/);
  assert.match(abandoned.report.nextAction, /reconcile/i);
  assert.ok(abandoned.report.changes.includes('README.md'));
  assert.equal(readFileSync(join(f.project.root, 'README.md'), 'utf8'), 'Unfinished contextual work');
  assert.equal(readFileSync(join(f.project.root, 'AGENTS.md'), 'utf8'), 'Expected instructions');
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
  const status = f.report(['status', '--json']).report;
  assert.equal(status.active, null);
  assert.equal(status.lastComplete, null);
  assert.equal(status.abandoned[0].id, started.id);
  assert.deepEqual(status.abandoned[0].completed, started.completed);
  assert.equal(f.report(['resume', '--retry', '--json']).report.errors[0].code, 'NO_ACTIVE_RUN');
  assert.notEqual(f.report(f.startArgs).report.errors[0].code, 'ACTIVE_RUN');
});

test('retry rejects installed edits and renews assessment even when project bytes stay the same', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md',
    fixes: [operation('prepare')], checks: [operation('verify')] } }, `
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
let status = 'unchanged';
if (input.operation.phase === 'checks') {
  const path = '.repo-standards/local/check-attempted';
  status = existsSync(path) ? 'passed' : 'failed';
  writeFileSync(path, 'checked');
}
console.log(JSON.stringify({format:'repo-standards/result/v1',status,message:'Checked'}));`);
  const started = f.report(f.startArgs).report;
  const old = started.workRequest;
  const path = join(f.remote.support.root, 'assessment.json');
  writeFileSync(path, JSON.stringify({ format: 'repo-standards/assessment/v1', run: old.run, selection: old.selection, snapshot: old.snapshot,
    declarations: [{ id: 'readme', status: 'satisfied', explanation: 'Existing content satisfies guidance.', changedPaths: [], evidence: ['Read original project description.'] }] }));
  assert.match(f.report(['resume', '--assessment', path, '--json']).report.reason, /CHECKS_FAILED/);
  writeFileSync(join(f.project.root, 'AGENTS.md'), 'Maintainer edit');
  assert.match(f.report(['resume', '--retry', '--json']).report.reason, /FINAL_INTEGRITY/);
  assert.equal(readFileSync(join(f.project.root, 'AGENTS.md'), 'utf8'), 'Maintainer edit');
  writeFileSync(join(f.project.root, 'AGENTS.md'), 'Expected instructions');
  const retried = f.report(['resume', '--retry', '--json']).report;
  assert.equal(retried.phase, 'contextual');
  assert.equal(retried.assessments.length, 0);
  assert.notEqual(retried.workRequest.snapshot, old.snapshot);
  assert.match(f.report(['resume', '--assessment', path, '--json']).report.reason, /STALE_ASSESSMENT/);
  assert.equal(retried.operations.filter((entry: { operation: { phase: string } }) => entry.operation.phase === 'checks').length, 1);
  const renewed = JSON.parse(readFileSync(path, 'utf8'));
  renewed.snapshot = retried.workRequest.snapshot;
  writeFileSync(path, JSON.stringify(renewed));
  const complete = f.report(['resume', '--assessment', path, '--json']);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.deepEqual(complete.report.operations.map((entry: { result: { status: string } }) => entry.result.status), ['unchanged', 'failed', 'unchanged', 'passed']);
  assert.equal(f.report(['status', '--json']).report.checks.length, 1);
});

test('retry recovers an interrupted completion without trusting its candidate state', async t => {
  const f = await fixture(t);
  const env = filesystemFault(f.remote.support.root, f.env, 'verification', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/.repo-standards/state.json')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const stopped = f.report(['status', '--json']).report;
  assert.equal(stopped.lastComplete, null);
  assert.equal(stopped.active.outcome, 'incomplete');
  assert.equal(stopped.active.phase, 'completion');
  const complete = f.report(['resume', '--retry', '--json']);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.equal(complete.report.id, stopped.active.id);
  assert.equal(f.report(['status', '--json']).report.lastComplete.run, complete.report.id);
});

test('retry recovers before installation and from partial runtime copying without source reacquisition', async t => {
  for (const phase of ['runtime', 'runtime-copy']) await t.test(phase, async st => {
    const f = await fixture(st);
    const env = filesystemFault(f.remote.support.root, f.env, phase === 'runtime' ? 'runtime' : 'installation', phase === 'runtime'
      ? `process.kill(process.pid, 'SIGKILL');`
      : `const copy = fs.cpSync;
fs.cpSync = function(from, to, options) {
  if (String(to).endsWith('/.repo-standards/local/runtime-stage')) {
    fs.mkdirSync(to, {recursive:true});
    fs.mkdirSync(String(to) + '/semver');
    fs.writeFileSync(String(to) + '/semver/package.json', '{');
    process.kill(process.pid, 'SIGKILL');
  }
  return copy.call(this, from, to, options);
}; syncBuiltinESMExports();`);
    assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
    if (phase === 'runtime-copy') { for (const key of Object.keys(f.remote.responses)) delete f.remote.responses[key]; f.remote.save(); }
    const retry = f.report(['resume', '--retry', '--json']);
    assert.equal(retry.result.status, 0, retry.result.stdout);
    assert.equal(retry.report.outcome, 'complete');
  });
});

test('retry recovers a file staged before rename and blocks added skill resources before further installation', async t => {
  for (const changed of [false, true]) await t.test(changed ? 'added skill file' : 'staged exact file', async st => {
    const f = await fixture(st, { later: { kind: 'file', target: 'LATER.md', exact: 'agents.md' } });
    const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
const originalWrite = fs.writeFileSync;
fs.writeFileSync = function(path, data, ...args) {
  const result = originalWrite.call(this, path, data, ...args);
  if (String(path).endsWith('.tmp') && String(data) === 'Expected instructions') process.kill(process.pid, 'SIGKILL');
  return result;
}; syncBuiltinESMExports();`);
    assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
    assert.equal(existsSync(join(f.project.root, 'AGENTS.md')), false);
    if (changed) {
      mkdirSync(join(f.project.root, '.agents/skills/adopt-standards'), { recursive: true });
      writeFileSync(join(f.project.root, '.agents/skills/adopt-standards/extra.txt'), 'Maintainer resource');
    }
    const retry = f.report(['resume', '--retry', '--json']);
    if (changed) {
      assert.equal(retry.result.status, 1);
      assert.match(retry.report.reason, /INSTALLATION_CHANGED/);
      assert.equal(existsSync(join(f.project.root, 'LATER.md')), false);
    } else {
      assert.equal(retry.result.status, 0, retry.result.stdout);
      assert.equal(git(f.project.root, 'ls-files', '--others', '--exclude-standard').includes('.tmp'), false);
    }
  });
});

test('active start blocks retry and abandonment, and completed state cannot be abandoned', async t => {
  const f = await fixture(t);
  const path = join(f.remote.support.root, 'concurrent.json');
  const env = filesystemFault(f.remote.support.root, f.env, 'runtime', `
const results = [['resume', '--retry', '--json'], ['abandon', '--json']].map(args => {
  const result = spawnSync(${JSON.stringify(join(cli.root, 'node_modules/.bin/repo-standards'))}, args, {encoding:'utf8'});
  return JSON.parse(result.stdout).errors[0].code;
});
write(${JSON.stringify(path)}, JSON.stringify(results));`);
  const complete = f.run(f.startArgs, env);
  assert.equal(complete.status, 0, complete.stdout);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), ['ACTIVE_RUN', 'ACTIVE_RUN']);
  const state = readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8');
  assert.equal(f.report(['abandon', '--json']).report.errors[0].code, 'NO_ACTIVE_RUN');
  assert.equal(readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8'), state);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
});

test('abandoning an interrupted completion preserves its candidate without claiming last-complete evidence', async t => {
  const f = await fixture(t);
  const env = filesystemFault(f.remote.support.root, f.env, 'completion', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/.repo-standards/state.json')) process.kill(process.pid, 'SIGKILL');
  return result;
}; syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const candidate = readFileSync(join(f.project.root, '.repo-standards/state.json'), 'utf8');
  const destination = join(f.project.root, '.repo-standards/local/incomplete-state.json');
  mkdirSync(destination);
  assert.equal(f.report(['abandon', '--json']).report.errors[0].code, 'RECOVERY_BLOCKED');
  const blocked = f.report(['status', '--json']).report;
  assert.equal(blocked.lastComplete, null);
  assert.equal(blocked.active.outcome, 'incomplete');
  assert.deepEqual(blocked.abandoned, []);
  rmSync(destination, { recursive: true });
  assert.equal(f.report(['abandon', '--json']).report.abandoned, true);
  assert.equal(f.report(['status', '--json']).report.lastComplete, null);
  assert.equal(readFileSync(join(f.project.root, '.repo-standards/local/incomplete-state.json'), 'utf8'), candidate);
  assert.equal(readFileSync(join(f.project.root, 'AGENTS.md'), 'utf8'), 'Expected instructions');
});

test('background descendants of returned fixes and prerequisite probes retain active execution', async t => {
  const background = `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'ignore'});
child.unref();
writeFileSync(process.env.RECOVERY_GROUP_FILE, String(process.pid));`;
  for (const phase of ['fixes', 'prerequisites']) await t.test(phase, async st => {
    const op = operation('prepare');
    if (phase === 'prerequisites') op.prerequisite['version-arguments'] = ['-e', `${background}\nconsole.log(process.version);`];
    const f = await fixture(st, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [op] } },
      `${phase === 'fixes' ? background : ''}\nconsole.log(JSON.stringify({format:'repo-standards/result/v1',status:'unchanged',message:'Finished'}));`);
    const path = join(f.remote.support.root, 'group');
    const result = f.run(f.startArgs, { ...f.env, RECOVERY_GROUP_FILE: path });
    const group = Number(readFileSync(path, 'utf8'));
    st.after(() => { try { process.kill(-group, 'SIGKILL'); } catch {} });
    const report = JSON.parse(result.stdout);
    assert.equal(report.outcome, 'incomplete');
    assert.match(report.reason, /AUTHOR_PROCESS_ACTIVE/);
    assert.equal(report.phase, phase);
    assert.equal(f.report(['status', '--json']).report.execution, 'active');
    assert.equal(f.report(['resume', '--retry', '--json']).report.errors[0].code, 'ACTIVE_RUN');
    assert.equal(f.report(['abandon', '--json']).report.errors[0].code, 'ACTIVE_RUN');
    process.kill(-group, 'SIGKILL');
    const deadline = Date.now() + 3000;
    while (f.report(['status', '--json']).report.execution === 'active' && Date.now() < deadline) await setTimeout(10);
    assert.equal(f.report(['abandon', '--json']).report.abandoned, true);
  });
});

test('retry recovers completion files interrupted between staging and rename', async t => {
  const f = await fixture(t);
  const env = filesystemFault(f.remote.support.root, f.env, 'completion', `
const originalWrite = fs.writeFileSync;
fs.writeFileSync = function(path, data, ...args) {
  const result = originalWrite.call(this, path, data, ...args);
  let value;
  try { value = JSON.parse(String(data)); } catch {}
  if (String(path).endsWith('.tmp') && value?.format === 'repo-standards/state/v1') process.kill(process.pid, 'SIGKILL');
  return result;
}; syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const retry = f.report(['resume', '--retry', '--json']);
  assert.equal(retry.result.status, 0, retry.result.stdout);
  assert.equal(retry.report.outcome, 'complete');
  assert.equal(git(f.project.root, 'ls-files', '--others', '--exclude-standard').includes('.tmp'), false);
});

test('live process ownership is authoritative before any mirror of a running operation', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('wait')] } },
    'setInterval(() => {}, 1000);');
  const groupFile = join(f.remote.support.root, 'interrupted-group');
  const env = filesystemFault(f.remote.support.root, f.env, 'fixes', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  let report;
  try { report = JSON.parse(fs.readFileSync(from, 'utf8')); } catch {}
  const result = rename.call(this, from, to);
  if ((String(to).endsWith('/.repo-standards/local/run.json') || String(to).endsWith('/repo-standards-run.lock')) && report?.processGroup) {
    write(${JSON.stringify(groupFile)}, String(report.processGroup));
    process.kill(process.pid, 'SIGKILL');
  }
  return result;
}; syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const group = Number(readFileSync(groupFile, 'utf8'));
  t.after(() => { try { process.kill(-group, 'SIGKILL'); } catch {} });
  const status = f.report(['status', '--json']).report;
  assert.equal(status.execution, 'active');
  assert.equal(status.active.processGroup, group);
  for (const args of [['resume', '--retry', '--json'], ['abandon', '--json']]) {
    assert.equal(f.report(args).report.errors[0].code, 'ACTIVE_RUN');
  }
});

test('retry accepts expected npm symlinks in runtime staging and unrecorded runtime installation', async t => {
  for (const point of ['staged runtime', 'installed runtime', 'linked stage root']) await t.test(point, async st => {
    const f = await fixture(st);
    const env = filesystemFault(f.remote.support.root, f.env, 'installation', point === 'installed runtime' ? `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/.repo-standards/runtime/node_modules')) process.kill(process.pid, 'SIGKILL');
  return result;
}; syncBuiltinESMExports();` : `
const copy = fs.cpSync;
fs.cpSync = function(from, to, options) {
  const result = copy.call(this, from, to, options);
  if (String(to).endsWith('/.repo-standards/local/runtime-stage')) process.kill(process.pid, 'SIGKILL');
  return result;
}; syncBuiltinESMExports();`);
    assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
    const target = join(f.project.root, point === 'installed runtime' ? '.repo-standards/runtime/node_modules' : '.repo-standards/local/runtime-stage');
    assert.equal(lstatSync(join(target, '.bin/repo-standards')).isSymbolicLink(), true);
    if (point === 'linked stage root') {
      rmSync(target, { recursive: true });
      symlinkSync(f.remote.support.root, target);
    }
    const retry = f.report(['resume', '--retry', '--json']);
    if (point === 'linked stage root') {
      assert.equal(retry.result.status, 1);
      assert.match(retry.report.reason, /UNSAFE_TARGET/);
      assert.equal(lstatSync(target).isSymbolicLink(), true);
      assert.equal(existsSync(join(f.remote.support.root, 'responses.json')), true);
    } else {
      assert.equal(retry.result.status, 0, retry.result.stdout);
      assert.equal(retry.report.outcome, 'complete');
    }
  });
});

test('a fast author operation cannot have its local report corruption overwritten by spawn journaling', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('corrupt'), operation('must-not-run')] } }, `
import { writeFileSync } from 'node:fs';
writeFileSync('.repo-standards/local/run.json', 'Corrupted');
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'unchanged',message:'Claimed success'}));`);
  const env = filesystemFault(f.remote.support.root, f.env, 'fixes', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  let report;
  try { report = JSON.parse(fs.readFileSync(from, 'utf8')); } catch {}
  if (String(to).endsWith('/repo-standards-run.lock') && report?.processGroup) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && fs.readFileSync('.repo-standards/local/run.json', 'utf8') !== 'Corrupted') {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  return rename.call(this, from, to);
}; syncBuiltinESMExports();`);
  const result = f.run(f.startArgs, env);
  const report = JSON.parse(result.stdout);
  assert.equal(report.operations.length, 1, result.stdout);
  assert.match(report.reason, /FINAL_INTEGRITY/);
  assert.equal(readFileSync(join(f.project.root, '.repo-standards/local/operations/0.altered-run.json'), 'utf8'), 'Corrupted');
});

test('retry preserves a report altered by an author after killing the CLI', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare')] } }, `
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
readFileSync(0, 'utf8');
const marker = '.repo-standards/local/attempted';
if (!existsSync(marker)) {
  writeFileSync(marker, 'yes');
  process.kill(process.ppid, 'SIGKILL');
  writeFileSync('.repo-standards/local/run.json', 'Interrupted author evidence');
}
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'unchanged',message:'Finished'}));`);
  assert.equal(f.run(f.startArgs).signal, 'SIGKILL');
  const deadline = Date.now() + 3000;
  while (f.report(['status', '--json']).report.execution === 'active' && Date.now() < deadline) await setTimeout(10);
  const journal = join(f.project.root, '.git/repo-standards-run.lock');
  const interrupted = readFileSync(journal, 'utf8');
  const archive = join(f.project.root, '.git/repo-standards-reports');
  writeFileSync(archive, 'Storage unavailable');
  assert.equal(f.report(['resume', '--retry', '--json']).result.status, 1);
  assert.equal(readFileSync(journal, 'utf8'), interrupted);
  assert.equal(readFileSync(join(f.project.root, '.repo-standards/local/run.json'), 'utf8'), 'Interrupted author evidence');
  rmSync(archive);
  const retry = f.report(['resume', '--retry', '--json']).report;
  assert.equal(retry.phase, 'contextual');
  assert.equal(typeof retry.retryHistory[0].report, 'string');
  assert.equal(readFileSync(join(f.project.root, retry.retryHistory[0].report), 'utf8'), 'Interrupted author evidence');
});

test('abandoned operation logs remain readable after reconciliation and another adoption', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare')] } }, `
import { readFileSync } from 'node:fs';
readFileSync(0, 'utf8');
console.error(process.env.RUN_MESSAGE);
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'unchanged',message:process.env.RUN_MESSAGE}));`);
  const first = JSON.parse(f.run(f.startArgs, { ...f.env, RUN_MESSAGE: 'First run' }).stdout);
  const original = first.operations[0];
  const stdout = readFileSync(join(f.project.root, original.stdout), 'utf8');
  const stderr = readFileSync(join(f.project.root, original.stderr), 'utf8');
  assert.equal(f.report(['abandon', '--json']).report.abandoned, true);
  // The maintainer removes the incomplete installation before a new inspection.
  for (const path of ['.repo-standards', '.agents', 'AGENTS.md']) rmSync(join(f.project.root, path), { recursive: true, force: true });
  const inspection = f.report(inspectionArgs).report;
  const second = JSON.parse(f.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], { ...f.env, RUN_MESSAGE: 'Second run' }).stdout);
  assert.equal(second.phase, 'contextual');
  const archived = f.report(['status', '--json']).report.abandoned[0].operations[0];
  assert.equal(readFileSync(join(f.project.root, archived.stdout), 'utf8'), stdout);
  assert.equal(readFileSync(join(f.project.root, archived.stderr), 'utf8'), stderr);
  assert.notEqual(archived.stdout, second.operations[0].stdout);
});

test('same-second process identities distinguish reused worker and author process numbers', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare')] } }, `
import { readFileSync } from 'node:fs';
readFileSync(0, 'utf8');
process.kill(process.ppid, 'SIGKILL');`);
  const loader = join(f.remote.support.root, 'coarse-process-time.mjs');
  writeFileSync(loader, `import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const spawn = cp.spawnSync;
cp.spawnSync = function(command, args, ...options) {
  const result = spawn.call(this, command, args, ...options);
  if (command === 'ps' && args.includes('lstart=') && result.stdout?.trim()) {
    result.stdout = result.stdout.replace(/.*?(\\s+\\S+\\s*)$/, 'Mon Sep  7 14:00:00 2026$1');
  }
  return result;
}; syncBuiltinESMExports();`);
  const env = { ...f.env, NODE_OPTIONS: `${f.env.NODE_OPTIONS ?? ''} --import=${loader}` };
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const journal = join(f.project.root, '.git/repo-standards-run.lock');
  const stopped = JSON.parse(readFileSync(journal, 'utf8'));
  assert.equal(typeof stopped.processGroupIdentity, 'string');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(-unrelated.pid!, 'SIGKILL'); } catch {} });
  // Model numeric reuse without relying on the host to recycle a particular PID.
  stopped.processGroup = unrelated.pid;
  writeFileSync(journal, JSON.stringify(stopped, null, 2) + '\n');
  mkdirSync(`${journal}.workers`, { recursive: true });
  writeFileSync(join(`${journal}.workers`, `${unrelated.pid}-${stopped.processGroupIdentity}-stale`), '');
  assert.equal(JSON.parse(f.run(['status', '--json'], env).stdout).execution, 'interrupted');
  assert.equal(JSON.parse(f.run(['abandon', '--json'], env).stdout).abandoned, true);
  assert.doesNotThrow(() => process.kill(unrelated.pid!, 0));
});

test('abandon archives operation output written before its result reached the journal', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare')] } },
    `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'unchanged',message:'Unrecorded output'}));`);
  const env = filesystemFault(f.remote.support.root, f.env, 'fixes', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/operations/0.stdout')) process.kill(process.pid, 'SIGKILL');
  return result;
}; syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const path = '.repo-standards/local/operations/0.stdout';
  const output = readFileSync(join(f.project.root, path), 'utf8');
  assert.equal(f.report(['status', '--json']).report.active.operations.length, 0);
  const abandoned = f.report(['abandon', '--json']).report;
  assert.equal(abandoned.abandoned, true);
  assert.equal(abandoned.operations.length, 0);
  assert.equal(typeof abandoned.archivedFiles?.[path], 'string');
  rmSync(join(f.project.root, '.repo-standards'), { recursive: true });
  assert.equal(readFileSync(join(f.project.root, abandoned.archivedFiles[path]), 'utf8'), output);
});

test('retry retains unrecorded operation output before reusing its log index', async t => {
  const f = await fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare')] } },
    `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'unchanged',message:process.env.RUN_MESSAGE}));`);
  const env = filesystemFault(f.remote.support.root, { ...f.env, RUN_MESSAGE: 'Before interruption' }, 'fixes', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/operations/0.stdout')) process.kill(process.pid, 'SIGKILL');
  return result;
}; syncBuiltinESMExports();`);
  assert.equal(f.run(f.startArgs, env).signal, 'SIGKILL');
  const path = '.repo-standards/local/operations/0.stdout';
  const original = readFileSync(join(f.project.root, path), 'utf8');
  const retry = JSON.parse(f.run(['resume', '--retry', '--json'], { ...f.env, RUN_MESSAGE: 'Retried output' }).stdout);
  assert.equal(retry.phase, 'contextual');
  const archived = retry.retryHistory[0].archivedFiles?.[path];
  assert.equal(typeof archived, 'string');
  assert.equal(readFileSync(join(f.project.root, archived), 'utf8'), original);
  assert.notEqual(readFileSync(join(f.project.root, path), 'utf8'), original);
  assert.equal(f.report(['abandon', '--json']).report.abandoned, true);
  assert.equal(readFileSync(join(f.project.root, archived), 'utf8'), original);
});
