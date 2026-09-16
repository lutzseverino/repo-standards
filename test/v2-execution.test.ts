import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { assertCompactWorkEvidence, committedState, localRunReport, observationIdentity } from './committed-evidence.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());
const operation = (id: string) => ({ id, run: { executable: process.execPath, script: 'run.mjs', resources: [], arguments: [] },
  prerequisite: { 'version-arguments': ['--version'], version: '^24' }, 'timeout-seconds': 5 });
async function fixture(t: TestContext, script: string, declarations: Record<string, unknown> = {
  readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare')], checks: [operation('verify')] },
  other: { kind: 'file', target: 'OTHER.md', guidance: 'guide.md' },
}, files = {}) {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(stringify({ format: 'repo-standards/v2', name: 'observed-scope', description: 'Observed operation scope',
    requires: { 'repo-standards': '^1' }, defaults: { declarations }, profiles: { work: { description: 'Work', declarations: {} } } }),
  { 'guide.md': 'Explain this project.', 'exact.md': 'Expected instructions', 'skill/SKILL.md': '# Review', 'run.mjs': script });
  const project = sourceFixture('', { 'README.md': 'Original', 'OTHER.md': 'Other', ...files });
  commit(project.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => { const result = cli.run(args, project.root, env); return { result, report: JSON.parse(result.stdout) }; };
  const inspection = run(inspectionArgs).report;
  const startArgs = ['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity];
  return { project, remote, env, run, startArgs, head: git(project.root, 'rev-parse', 'HEAD'), start: () => run(startArgs),
    assess(request: { run: string; selection: string; snapshot: string; declarations: { id: string }[] }, changes: Record<string, string[]> = {}) {
      const path = join(remote.support.root, 'assessment.json');
      writeFileSync(path, JSON.stringify({ format: 'repo-standards/assessment/v1', run: request.run, selection: request.selection, snapshot: request.snapshot,
        declarations: request.declarations.map(({ id }) => ({ id, status: 'satisfied', explanation: 'Guidance applied.', changedPaths: changes[id] ?? [], evidence: ['Reviewed project content.'] })) }));
      return run(['resume', '--assessment', path, '--json']);
    },
  };
}
const prelude = `import { readFileSync, writeFileSync, chmodSync, rmSync, mkdirSync, existsSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));`;
const result = `console.log(JSON.stringify({format:'repo-standards/result/v1',status:input.operation.phase==='fixes'?'changed':'passed',message:'Done'}));`;

test('v2 interrupted installation rejects added directories before writing pending files', async t => {
  for (const addition of ['.agents/skills/review/unexpected', '.repo-standards/inputs/unexpected']) await t.test(addition, async t => {
    const f = await fixture(t, '', {
      review: { kind: 'skill', name: 'review', source: 'skill' },
      zlast: { kind: 'file', target: 'Z-LAST.md', exact: 'exact.md' },
    });
    const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('/review/SKILL.md')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
    assert.equal(cli.run(f.startArgs, f.project.root, env).signal, 'SIGKILL');
    assert.equal(existsSync(join(f.project.root, 'Z-LAST.md')), false);
    mkdirSync(join(f.project.root, addition), { recursive: true });
    const rejected = f.run(['resume', '--retry', '--json']);
    assert.equal(rejected.result.status, 1, rejected.result.stdout);
    assert.match(rejected.report.reason, /INSTALLATION_CHANGED.*inventory/);
    assert.equal(existsSync(join(f.project.root, 'Z-LAST.md')), false);
    assert.equal(existsSync(join(f.project.root, addition)), true);
    rmSync(join(f.project.root, addition), { recursive: true });
    const recovered = f.run(['resume', '--retry', '--json']);
    assert.equal(recovered.result.status, 0, recovered.result.stdout);
    assert.equal(recovered.report.outcome, 'complete');
  });
});

test('v2 fixes enforce their owning declaration rather than the union of authorized paths', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('OTHER.md', 'Wrong declaration');
${result}`);
  const started = f.start();
  assert.equal(started.result.status, 1);
  assert.match(started.report.reason, /OPERATION_SCOPE.*readme\/prepare.*OTHER.md/);
  assert.equal(started.report.operations[0].result.status, 'changed');
  assert.equal(readFileSync(join(f.project.root, 'OTHER.md'), 'utf8'), 'Wrong declaration');
  const abandoned = f.run(['abandon', '--json']).report;
  assert.equal(abandoned.abandoned, true);
  assert.equal(readFileSync(join(f.project.root, 'OTHER.md'), 'utf8'), 'Wrong declaration');
  assert.equal(f.run(['status', '--json']).report.lastComplete, null);
});

test('v2 keeps named targets observable when fixes make them ignored', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') {
  writeFileSync('new.md', 'Written by fix');
  writeFileSync('.gitignore', 'new.md\\n');
}
${result}`, {
    docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: ['new.md', '.gitignore'], directories: [] }, fixes: [operation('prepare')] },
  }, { '.gitignore': '' });
  const started = f.start().report;
  assert.equal(started.phase, 'contextual');
  writeFileSync(join(f.project.root, 'new.md'), 'Agent explanation');
  const refreshed = f.run(['resume', '--json']).report;
  assert.notEqual(refreshed.workRequest.snapshot, started.workRequest.snapshot);
  const omitted = f.assess(refreshed.workRequest);
  assert.match(omitted.report.reason, /ASSESSMENT_PATHS.*new.md/);
  const complete = f.assess(refreshed.workRequest, { docs: ['new.md'] });
  assert.equal(complete.result.status, 0, complete.result.stdout);
});

test('v2 preserves same-file agent work across fix replay and requires renewed evidence', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', 'Prepared');
${result}`);
  const started = f.start().report;
  assert.equal(started.phase, 'contextual');
  writeFileSync(join(f.project.root, 'README.md'), 'Agent documentation');
  const oldRequest = f.run(['resume', '--json']).report.workRequest;
  const retried = f.run(['resume', '--retry', '--json']).report;
  assert.equal(retried.phase, 'contextual');
  assert.equal(readFileSync(join(f.project.root, 'README.md'), 'utf8'), 'Prepared');
  assert.notEqual(retried.workRequest.snapshot, oldRequest.snapshot);
  assert.match(f.assess(oldRequest, { readme: ['README.md'] }).report.reason, /STALE_ASSESSMENT/);
  assert.match(f.assess(retried.workRequest).report.reason, /ASSESSMENT_PATHS.*README.md/);
  const complete = f.assess(retried.workRequest, { readme: ['README.md'] });
  assert.equal(complete.result.status, 0, complete.result.stdout);
  const status = f.run(['status', '--json']).report;
  const intervals = status.observations as { phase: string; changes: Record<string, unknown>; scope: unknown }[];
  assert.deepEqual(intervals.filter(interval => Object.hasOwn(interval.changes, 'README.md')).map(interval => interval.phase), ['fixes', 'agent', 'fixes']);
  assert.ok(intervals.every(interval => interval.scope));
  assert.equal(status.checks.length, 1);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
  assert.notEqual(git(f.project.root, 'status', '--porcelain'), '');
});

test('v2 reports additions, deletions and executable changes made outside a fix scope', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') { writeFileSync('added.txt', 'Added'); rmSync('OTHER.md'); chmodSync('tool.sh', 0o755); }
${result}`, undefined, { 'tool.sh': '#!/bin/sh\n' });
  const failed = f.start().report;
  assert.match(failed.reason, /OPERATION_SCOPE/);
  assert.deepEqual(failed.observations[0].violations, ['OTHER.md', 'added.txt', 'tool.sh']);
  assert.deepEqual(failed.operations[0].process, { exitCode: 0, signal: null, error: null, timedOut: false });
  assert.equal(failed.uncertain.length, 0);
  const retried = f.run(['resume', '--retry', '--json']).report;
  assert.match(retried.reason, /OPERATION_SCOPE/);
  assert.equal(retried.operations.length, 1);
});

test('v2 preserves explicit directory scope, ignored descendants and the limit for unlisted ignored siblings', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') {
  rmSync('docs/old.md'); mkdirSync('docs/sub', {recursive:true});
  writeFileSync('docs/sub/new.md', 'Prepared'); chmodSync('docs/tool.sh', 0o755);
  writeFileSync('ignored/sibling', 'Outside the bounded observation promise');
}
${result}`, {
    docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: [], directories: ['docs'] }, fixes: [operation('prepare')], checks: [operation('verify')] },
  }, { 'docs/old.md': 'Old', 'docs/tool.sh': '#!/bin/sh\n', '.gitignore': 'docs/sub/\nignored/\n' });
  // The ignored sibling is not a target or a discovery dependency.
  mkdirSync(join(f.project.root, 'ignored'));
  const started = f.start().report;
  assert.equal(started.phase, 'contextual', started.reason);
  assert.deepEqual(started.observations[0].changedPaths, ['docs/old.md', 'docs/sub/new.md', 'docs/tool.sh']);
  writeFileSync(join(f.project.root, 'docs/sub/new.md'), 'Agent documentation');
  const request = f.run(['resume', '--json']).report.workRequest;
  const completed = f.assess(request, { docs: ['docs/sub/new.md'] });
  assert.equal(completed.result.status, 0, completed.result.stdout);
});

test('v2 checks remain read-only even for ignored named targets and keep operation outcomes separate', async t => {
  const f = await fixture(t, `${prelude}
writeFileSync('new.md', input.operation.phase);
if (input.operation.phase === 'fixes') writeFileSync('.gitignore', 'new.md\\n');
${result}`, {
    docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: ['new.md', '.gitignore'], directories: [] }, fixes: [operation('prepare')], checks: [operation('verify')] },
  }, { '.gitignore': '' });
  const started = f.start().report;
  const failed = f.assess(started.workRequest).report;
  assert.match(failed.reason, /CHECK_MUTATION.*docs\/verify.*new.md/);
  assert.equal(failed.assessments[0].declarations[0].status, 'satisfied');
  assert.equal(failed.operations[1].result.status, 'passed');
  assert.deepEqual(failed.observations.at(-1).violations, ['new.md']);
  assert.equal(readFileSync(join(f.project.root, 'new.md'), 'utf8'), 'checks');
});

test('v2 exact declarations cannot redefine bytes, executable state or complete skill inventories with their own fixes', async t => {
  for (const [name, mutation, declaration] of [
    ['bytes', "writeFileSync('AGENTS.md', 'Corrupted');", { kind: 'file', target: 'AGENTS.md', exact: 'exact.md' }],
    ['mode', "chmodSync('AGENTS.md', 0o755);", { kind: 'file', target: 'AGENTS.md', exact: 'exact.md' }],
    ['inventory', "writeFileSync('.agents/skills/review/added.md', 'Added');", { kind: 'skill', name: 'review', source: 'skill' }],
  ] as const) await t.test(name, async st => {
    const f = await fixture(st, `${prelude}\n${mutation}\n${result}`, { exact: { ...declaration, fixes: [operation('prepare')] } });
    const failed = f.start().report;
    assert.match(failed.reason, /FINAL_INTEGRITY/);
    assert.equal(failed.operations[0].result.status, 'changed');
    assert.deepEqual(failed.observations[0].violations, []);
    const retry = f.run(['resume', '--retry', '--json']).report;
    assert.match(retry.reason, /FINAL_INTEGRITY/);
    assert.equal(retry.operations.length, 1);
    assert.equal(f.run(['status', '--json']).report.lastComplete, null);
  });
});

test('v2 incomplete observations block author progression and preserve its definite outcome', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', Buffer.alloc(8 * 1024 * 1024 + 1));
${result}`);
  const failed = f.start().report;
  assert.match(failed.reason, /OBSERVATION_LIMIT/);
  assert.equal(failed.operations[0].result.status, 'changed');
  assert.equal(failed.observations[0].after, undefined);
  assert.match(f.run(['resume', '--retry', '--json']).report.reason, /OBSERVATION_LIMIT/);
  writeFileSync(join(f.project.root, 'README.md'), 'Reconciled');
  const retry = f.run(['resume', '--retry', '--json']).report;
  assert.match(retry.reason, /OBSERVATION_LIMIT/);
  assert.equal(retry.observations[0].interrupted, undefined);
  assert.equal(retry.observations[0].operationIndex, 0);
  assert.equal(retry.operations[0].result.status, 'changed');
  const abandoned = f.run(['abandon', '--json']).report;
  assert.equal(abandoned.abandoned, true);
  assert.ok(abandoned.uncertain.some((message: string) => message.includes('observation')));
});

test('v2 interrupted fixes preserve uncertain intervals through explicit retry and require fresh agent assessment', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') {
  const marker = '.repo-standards/local/attempt';
  writeFileSync('README.md', 'Prepared');
  if (!existsSync(marker)) { writeFileSync(marker, 'Attempted'); process.kill(process.ppid, 'SIGKILL'); process.exit(0); }
}
${result}`);
  const killed = cli.run(f.startArgs, f.project.root, f.env);
  assert.equal(killed.signal, 'SIGKILL');
  const stopped = f.run(['status', '--json']).report.active;
  assert.equal(stopped.operations.length, 0);
  assert.equal(stopped.observations[0].after, undefined);
  assert.equal(f.run(['resume', '--json']).report.errors[0].code, 'RESUME_UNAVAILABLE');
  const retry = f.run(['resume', '--retry', '--json']).report;
  assert.equal(retry.phase, 'contextual', retry.reason);
  assert.equal(retry.observations[0].interrupted, true);
  assert.deepEqual(retry.observations[0].changedPaths, ['README.md']);
  assert.equal(retry.observations[0].phase, 'fixes');
  assert.equal(retry.retryHistory[0].phase, 'fixes');
  assert.ok(retry.retryHistory[0].uncertain.length);
  const completed = f.assess(retry.workRequest);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  assert.equal(f.run(['status', '--json']).report.observations[0].interrupted, true);
});

test('v2 retry records agent edits after rejected evidence before replay can overwrite them', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', 'Prepared');
${result}`);
  const started = f.start().report;
  const rejected = f.assess(started.workRequest, { readme: ['README.md'] }).report;
  assert.match(rejected.reason, /ASSESSMENT_PATHS/);
  writeFileSync(join(f.project.root, 'README.md'), 'Agent change after rejection');
  const retried = f.run(['resume', '--retry', '--json']).report;
  assert.equal(retried.phase, 'contextual');
  assert.match(f.assess(retried.workRequest).report.reason, /ASSESSMENT_PATHS.*README.md/);
  assert.equal(f.assess(retried.workRequest, { readme: ['README.md'] }).result.status, 0);
});

test('v2 refuses unsafe named ancestors and stale assessments after observation settings change', async t => {
  const f = await fixture(t, `${prelude}\n${result}`, {
    docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: ['docs/new.md'], directories: [] } },
  });
  const started = f.start().report;
  writeFileSync(join(f.project.root, 'docs'), 'Unsafe non-directory ancestor');
  assert.match(f.run(['resume', '--json']).report.reason, /OBSERVATION_UNSAFE/);
  rmSync(join(f.project.root, 'docs'));
  git(f.project.root, 'config', 'core.filemode', 'false');
  assert.match(f.assess(started.workRequest).report.reason, /STALE_ASSESSMENT/);
  assert.equal(f.run(['status', '--json']).report.lastComplete, null);
});


test('v2 observes gaps between completed fixes before another operation can accept a new baseline', async t => {
  const f = await fixture(t, `${prelude}\n${result}`, {
    readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare'), operation('again')] },
  });
  const env = filesystemFault(f.remote.support.root, f.env, 'fixes', `
const nextWrite = fs.writeFileSync;
let changed = false;
fs.writeFileSync = function(path, data, ...args) {
  const result = nextWrite.call(this, path, data, ...args);
  let value; try { value = JSON.parse(String(data)); } catch {}
  if (!changed && value?.completed?.some(item => item.startsWith('fixes: readme/prepare'))) {
    changed = true; write.call(fs, 'OTHER.md', 'Changed between operations');
  }
  return result;
};
syncBuiltinESMExports();`);
  const started = JSON.parse(cli.run(f.startArgs, f.project.root, env).stdout);
  assert.match(started.reason, /ASSESSMENT_SCOPE.*OTHER.md/);
  assert.equal(started.operations.length, 1);
  assert.equal(readFileSync(join(f.project.root, 'OTHER.md'), 'utf8'), 'Changed between operations');
});

test('v2 observes named ancestor deletion, root mode changes, and empty directories created by checks', async t => {
  for (const [name, mutation, phase, code] of [
    ['ancestor', "rmSync('docs', {recursive:true});", 'fixes', 'OPERATION_SCOPE'],
    ['root', "chmodSync('.', 0o755);", 'fixes', 'OPERATION_SCOPE'],
    ['empty directory', "mkdirSync('unrelated');", 'checks', 'CHECK_MUTATION'],
  ]) await t.test(name!, async st => {
    const f = await fixture(st, `${prelude}\nif (input.operation.phase === '${phase}') { ${mutation} }\n${result}`, {
      docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: ['docs/new.md'], directories: [] },
        fixes: [operation('prepare')], checks: [operation('verify')] },
    });
    mkdirSync(join(f.project.root, 'docs'));
    const started = f.start().report;
    const failed = phase === 'checks' ? f.assess(started.workRequest).report : started;
    assert.match(failed.reason, new RegExp(code!));
  });
});

test('v2 retry permits verified restoration of an exact file without granting agent authority over it', async t => {
  const f = await fixture(t, `${prelude}
const marker = '.repo-standards/local/attempt';
if (!existsSync(marker)) { writeFileSync(marker, 'attempted'); writeFileSync('AGENTS.md', 'Corrupted'); }
${result}`, { exact: { kind: 'file', target: 'AGENTS.md', exact: 'exact.md', fixes: [operation('prepare')] } });
  assert.match(f.start().report.reason, /FINAL_INTEGRITY/);
  writeFileSync(join(f.project.root, 'AGENTS.md'), 'Expected instructions');
  const retry = f.run(['resume', '--retry', '--json']);
  assert.equal(retry.result.status, 0, retry.result.stdout);
  assert.equal(readFileSync(join(f.project.root, 'AGENTS.md'), 'utf8'), 'Expected instructions');
  assert.equal(retry.report.observations[1].restoredExact['AGENTS.md'].type, 'file');
});

test('v2 retry restores complete exact skill inventories and their necessary directories', async t => {
  for (const mode of ['removed', 'added']) await t.test(mode, async st => {
    const mutation = mode === 'removed' ? "rmSync('.agents/skills/review', {recursive:true});"
      : "mkdirSync('.agents/skills/review/unexpected'); writeFileSync('.agents/skills/review/unexpected/extra.md', 'Extra');";
    const f = await fixture(st, `${prelude}
const marker = '.repo-standards/local/attempt';
if (!existsSync(marker)) { writeFileSync(marker, 'attempted'); ${mutation} }
${result}`, { review: { kind: 'skill', name: 'review', source: 'skill', fixes: [operation('prepare')] } });
    assert.match(f.start().report.reason, /FINAL_INTEGRITY/);
    if (mode === 'removed') {
      mkdirSync(join(f.project.root, '.agents/skills/review'));
      writeFileSync(join(f.project.root, '.agents/skills/review/SKILL.md'), '# Review');
    } else rmSync(join(f.project.root, '.agents/skills/review/unexpected'), { recursive: true });
    const retry = f.run(['resume', '--retry', '--json']);
    assert.equal(retry.result.status, 0, retry.report.reason);
    assert.equal(readFileSync(join(f.project.root, '.agents/skills/review/SKILL.md'), 'utf8'), '# Review');
    assert.ok(Object.keys(retry.report.observations[1].restoredBoundaries).includes(mode === 'removed' ? '.agents/skills/review' : '.agents/skills/review/unexpected'));
  });
});

test('v2 exact skill integrity includes empty directories during execution, recovery and retained inspection', async t => {
  const f = await fixture(t, `${prelude}
const marker = '.repo-standards/local/attempt';
if (!existsSync(marker)) { writeFileSync(marker, 'attempted'); mkdirSync('.agents/skills/review/empty'); }
${result}`, { review: { kind: 'skill', name: 'review', source: 'skill', fixes: [operation('prepare')] } });
  const failed = f.start().report;
  assert.match(failed.reason, /FINAL_INTEGRITY.*Skill inventory/);
  assert.equal(failed.operations[0].result.status, 'changed');
  assert.deepEqual(failed.observations[0].violations, []);
  assert.match(f.run(['resume', '--retry', '--json']).report.reason, /FINAL_INTEGRITY/);
  rmSync(join(f.project.root, '.agents/skills/review/empty'), { recursive: true });
  const recovered = f.run(['resume', '--retry', '--json']);
  assert.equal(recovered.result.status, 0, recovered.result.stdout);
  mkdirSync(join(f.project.root, '.agents/skills/review/another-empty'));
  const retained = f.run(['inspect', '--json']).report;
  assert.ok(retained.start.blockers.some((blocker: { code: string; path: string }) => blocker.code === 'INSTALLED_CONTENT_EDITED' && blocker.path === '.agents/skills/review'));
});

test('v2 protects durable product directories while permitting generated local and cache directories', async t => {
  for (const target of ['inputs/unexpected', 'runtime/unexpected', 'unexpected']) await t.test(target, async st => {
    const phase = target.startsWith('runtime') ? 'checks' : 'fixes';
    const f = await fixture(st, `${prelude}
mkdirSync('.repo-standards/local/scratch', {recursive:true});
mkdirSync('.repo-standards/cache/scratch', {recursive:true});
const marker = '.repo-standards/local/attempt';
if (input.operation.phase === '${phase}' && !existsSync(marker)) {
  writeFileSync(marker, 'attempted'); mkdirSync('.repo-standards/${target}');
}
${result}`);
    const started = f.start().report;
    const failed = phase === 'checks' ? f.assess(started.workRequest).report : started;
    assert.match(failed.reason, /FINAL_INTEGRITY.*product state inventory/);
    assert.equal(failed.operations.at(-1).result.status, phase === 'checks' ? 'passed' : 'changed');
    assert.match(f.run(['resume', '--retry', '--json']).report.reason, /FINAL_INTEGRITY/);
    rmSync(join(f.project.root, '.repo-standards', target), { recursive: true });
    const retry = f.run(['resume', '--retry', '--json']).report;
    assert.equal(retry.phase, 'contextual', retry.reason);
    assert.equal(f.assess(retry.workRequest).result.status, 0);
    mkdirSync(join(f.project.root, '.repo-standards', target));
    const retained = f.run(['inspect', '--json']).report;
    assert.ok(retained.start.blockers.some((blocker: { code: string; path: string }) => blocker.code === 'STATE_INTEGRITY' && blocker.path === '.repo-standards'));
  });
});

test('v2 completion commits compact work evidence and keeps full observations local', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', 'Prepared');
${result}`);
  const started = f.start().report;
  assert.equal(started.phase, 'contextual');
  writeFileSync(join(f.project.root, 'OTHER.md'), 'Agent documentation');
  const refreshed = f.run(['resume', '--json']).report;
  const completed = f.assess(refreshed.workRequest, { other: ['OTHER.md'] });
  assert.equal(completed.result.status, 0, completed.result.stdout);

  const state = committedState(f.project.root);
  assert.equal(state.format, 'repo-standards/state/v5');
  assertCompactWorkEvidence(state);
  const intervals = state.observations!;
  assert.deepEqual(intervals.filter(interval => interval.operation)
    .map(interval => `${interval.phase}:${interval.operation!.declaration}/${interval.operation!.id}:${interval.operationIndex}`),
  ['fixes:readme/prepare:0', 'checks:readme/verify:1']);
  assert.ok(intervals.some(interval => interval.phase === 'agent'));
  const fix = intervals.find(interval => interval.operation?.id === 'prepare')!;
  assert.deepEqual(Object.keys(fix.changes!), ['README.md']);
  assert.equal(fix.changes!['README.md']!.before.type, 'file');
  assert.equal(fix.changes!['README.md']!.after.type, 'file');
  assert.notEqual(fix.changes!['README.md']!.before.sha256, fix.changes!['README.md']!.after.sha256);
  assert.deepEqual(fix.boundaryChanges, {});
  assert.deepEqual(fix.violations, []);
  assert.deepEqual(fix.scope, { readme: { paths: ['README.md'], directories: [] } });
  const agent = intervals.find(interval => interval.phase === 'agent' && Object.hasOwn(interval.changes ?? {}, 'OTHER.md'))!;
  assert.equal(agent.changes!['OTHER.md']!.after.type, 'file');
  // Adjacent intervals chain, so the committed identities remain tamper-evident.
  for (const [index, interval] of intervals.entries()) if (index) assert.equal(interval.before, intervals[index - 1]!.after);

  // Full observations remain in the local run report, not in committed state.
  const report = localRunReport(f.project.root);
  const local = report.observations!;
  assert.equal(local.length, intervals.length);
  assert.ok(Object.hasOwn(local[0]!.before.files, 'README.md'));
  assert.equal(observationIdentity(local[0]!.before), intervals[0]!.before);
  assert.equal(observationIdentity(local[0]!.after), intervals[0]!.after);

  const status = f.run(['status', '--json']).report;
  assert.equal(status.format, 'repo-standards/status/v5');
  assert.deepEqual(status.observations, intervals);
  assert.deepEqual(status.history, []);
});

test('a committed legacy state is read and compacted by the next complete adoption', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', 'Prepared');
${result}`);
  const started = f.start().report;
  writeFileSync(join(f.project.root, 'OTHER.md'), 'Agent documentation');
  assert.equal(f.assess(f.run(['resume', '--json']).report.workRequest, { other: ['OTHER.md'] }).result.status, 0);
  commit(f.project.root);

  // A project adopted before compaction retains full observation maps.
  const observed = (sha256: string) => ({
    files: { 'README.md': { type: 'file', sha256, executable: false } },
    boundaries: { '.': { type: 'directory', mode: 493 } },
    settings: { 'core.ignorecase': 'false' },
    ignores: { '.gitignore': { location: '.gitignore', state: { type: 'missing' } } },
  });
  const before = observed('a'.repeat(64));
  const after = observed('b'.repeat(64));
  const legacyIntervals = [
    { phase: 'fixes', scope: { readme: { paths: ['README.md'], directories: [] } },
      operation: { declaration: 'readme', phase: 'fixes', id: 'prepare' }, operationIndex: 0,
      before, after, changedPaths: ['README.md'], boundaryChanges: [], violations: [], interrupted: true },
    { phase: 'agent', scope: { readme: { paths: ['README.md'], directories: [] } },
      before: after, after, changedPaths: [], boundaryChanges: [], violations: [] },
    { phase: 'checks', scope: { readme: { paths: ['README.md'], directories: [] } },
      operation: { declaration: 'readme', phase: 'checks', id: 'verify' }, operationIndex: 1,
      before: after, after, changedPaths: [], boundaryChanges: [], violations: [] },
  ];
  const current = committedState(f.project.root) as unknown as Record<string, unknown>;
  const legacyLastComplete = { run: 'c0ffee00-0000-4000-8000-000000000000', inspection: 'sha256:legacy',
    completedAt: '2026-01-01T00:00:00.000Z', head: '0'.repeat(40) };
  const amendments = [{ format: 'repo-standards/scope-amendment/v1', revision: 1, previousInspection: 'sha256:legacy-previous' }];
  const legacy = { ...current, format: 'repo-standards/state/v4',
    history: [{ lastComplete: legacyLastComplete, observations: legacyIntervals, operations: [], retryHistory: [],
      checks: [], assessments: [], scopeRevision: 1, amendments }],
    observations: legacyIntervals };
  const statePath = join(f.project.root, '.repo-standards/state.json');
  const lockPath = join(f.project.root, '.repo-standards/lock.json');
  const rewrite = (state: unknown) => {
    const bytes = JSON.stringify(state, null, 2) + '\n';
    writeFileSync(statePath, bytes);
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.state.sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    commit(f.project.root);
  };
  rewrite(legacy);

  const legacyStatus = f.run(['status', '--json']).report;
  assert.equal(legacyStatus.format, 'repo-standards/status/v4');
  assert.deepEqual(legacyStatus.observations[0].before, before);
  assert.equal(legacyStatus.history.length, 1);

  const readopted = f.run(['inspect', '--readopt', '--json']).report;
  assert.deepEqual(readopted.start.blockers, []);
  const restarted = f.run(['start', '--readopt', '--confirm', readopted.identity, '--json']).report;
  assert.equal(restarted.phase, 'contextual');
  writeFileSync(join(f.project.root, 'OTHER.md'), 'Renewed agent documentation');
  const recompleted = f.assess(f.run(['resume', '--json']).report.workRequest, { other: ['OTHER.md'] });
  assert.equal(recompleted.result.status, 0, recompleted.result.stdout);

  const compacted = committedState(f.project.root);
  assert.equal(compacted.format, 'repo-standards/state/v5');
  assertCompactWorkEvidence(compacted);
  assert.equal(compacted.history!.length, 2);
  const [legacyRun, previousRun] = compacted.history!;
  assert.deepEqual(legacyRun!.lastComplete, legacyLastComplete);
  assert.equal(legacyRun!.scopeRevision, 1);
  assert.deepEqual(legacyRun!.amendments, amendments);
  assert.equal(previousRun!.lastComplete.run, started.id);
  for (const run of [legacyRun!, previousRun!]) {
    assert.deepEqual(run.observations.map(interval => interval.phase), ['fixes', 'agent', 'checks']);
    const [converted] = run.observations;
    assert.equal(converted!.before, observationIdentity(before));
    assert.equal(converted!.after, observationIdentity(after));
    assert.deepEqual(converted!.changes, { 'README.md': { before: before.files['README.md'], after: after.files['README.md'] } });
    assert.deepEqual(converted!.boundaryChanges, {});
    assert.equal(converted!.interrupted, true);
    assert.deepEqual(converted!.operation, { declaration: 'readme', phase: 'fixes', id: 'prepare' });
    assert.equal(converted!.operationIndex, 0);
  }

  // The committed guarantee is enforced on read, not only when writing.
  rewrite({ ...(compacted as unknown as Record<string, unknown>), observations: legacyIntervals });
  assert.equal(f.run(['inspect', '--readopt', '--json']).report.errors[0].code, 'STATE_INTEGRITY');
});
