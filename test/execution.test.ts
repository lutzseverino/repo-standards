import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());
function operation(id: string, overrides = {}) {
  return { id, run: { executable: process.execPath, script: 'scripts/run.mjs', resources: ['scripts/data.txt'], arguments: [] },
    prerequisite: { 'version-arguments': ['--version'], version: '>=24.0.0 <25.0.0' }, 'timeout-seconds': 2, ...overrides };
}
function fixture(t: TestContext, declarations: Record<string, unknown>, script = '', exclusions = {}) {
  const remote = remoteFixture(stringify({ format: 'repo-standards/v1', name: 'script-standards', description: 'Trusted operations',
    requires: { 'repo-standards': '^1.0.0' }, defaults: { declarations }, profiles: { work: { description: 'Work', declarations: exclusions } } }),
  { 'content.md': 'Expected', 'scripts/run.mjs': script, 'scripts/data.txt': 'Resource', 'skill/SKILL.md': '# Review' });
  const project = sourceFixture('', { 'README.md': 'Project', '.gitignore': 'ignored/\n' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  return { remote, project, start(env = remote.env) {
    const inspected = cli.run(inspectionArgs, project.root, env);
    assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
    const inspection = JSON.parse(inspected.stdout);
    const result = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity], project.root, env);
    return { result, report: JSON.parse(result.stdout), inspection };
  } };
}
const exact = { kind: 'file', target: 'AGENTS.md', exact: 'content.md' };

test('every prerequisite is probed before mutation and all failures are reported', t => {
  const f = fixture(t, { instructions: { ...exact, fixes: [
    operation('missing', { run: { executable: 'repo-standards-no-such-executable', script: 'scripts/run.mjs', resources: [], arguments: [] } }),
    operation('failed', { prerequisite: { 'version-arguments': ['-e', 'process.exit(2)'], version: '*' } }),
    operation('unreadable', { prerequisite: { 'version-arguments': ['-e', 'console.log("unknown")'], version: '*' } }),
    operation('incompatible', { prerequisite: { 'version-arguments': ['-e', 'console.error("tool 1.2.3 then 24.0.0")'], version: '>=24' } }),
  ], checks: [operation('compatible')] } });
  const before = snapshot(f.project.root);
  const { result, report } = f.start();
  assert.equal(result.status, 1);
  assert.equal(report.phase, 'prerequisites');
  assert.match(report.reason, /PREREQUISITES_BLOCKED/);
  assert.deepEqual(report.prerequisites.map((p: { code: string | null }) => p.code),
    ['EXECUTABLE_MISSING', 'PROBE_FAILED', 'VERSION_UNREADABLE', 'VERSION_INCOMPATIBLE', null]);
  assert.equal(report.prerequisites[3].version, '1.2.3');
  assert.deepEqual(snapshot(f.project.root), before);
});

test('trusted operations receive literal arguments, retained resources and resolved identities in declared order', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const args = ['two words', '', '$(touch SHELL_RAN)', '; touch SHELL_RAN', '*', '--flag'];
  const first = operation('first', { run: { executable: process.execPath, script: 'scripts/run.mjs', resources: ['scripts/data.txt'], arguments: args } });
  const f = fixture(t, {
    zulu: { kind: 'skill', name: 'review', source: 'skill', fixes: [operation('z-fix')], checks: [operation('z-check')] },
    instructions: { ...exact, fixes: [first, operation('second')], checks: [operation('first-check'), operation('second-check')] },
    excluded: { kind: 'file', target: 'EXCLUDED', exact: 'content.md', fixes: [operation('excluded')] },
  }, `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
console.error(JSON.stringify({ input, cwd: process.cwd(), args: process.argv.slice(2), resource: readFileSync(new URL('./data.txt', import.meta.url), 'utf8') }));
console.log(JSON.stringify({format: 'repo-standards/result/v1', status: input.operation.phase === 'fixes' ? 'unchanged' : 'passed', message: 'Verified'}));
`, { excluded: { exclude: true } });
  const head = git(f.project.root, 'rev-parse', 'HEAD');
  const { result, report, inspection } = f.start({ ...f.remote.env, ...registry.env });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(report.outcome, 'complete');
  assert.deepEqual(report.operations.map((o: { operation: { id: string } }) => o.operation.id), ['first', 'second', 'z-fix', 'first-check', 'second-check', 'z-check']);
  const evidence = JSON.parse(readFileSync(join(f.project.root, report.operations[0].stderr), 'utf8'));
  assert.deepEqual(evidence.args, args);
  assert.equal(evidence.resource, 'Resource');
  assert.equal(evidence.cwd, f.project.root);
  assert.equal(evidence.input.format, 'repo-standards/operation/v1');
  assert.equal(evidence.input.projectRoot, f.project.root);
  assert.deepEqual(evidence.input.standards, inspection.selection.standards);
  assert.equal(evidence.input.profile, 'work');
  assert.deepEqual(evidence.input.operation, { declaration: 'instructions', phase: 'fixes', id: 'first' });
  assert.deepEqual(evidence.input.declarations.map((d: { id: string }) => d.id), ['instructions', 'zulu']);
  assert.deepEqual(evidence.input.allowedTargets, { paths: ['AGENTS.md'], directories: [] });
  assert.equal(existsSync(join(f.project.root, 'SHELL_RAN')), false);
  assert.equal(existsSync(join(f.project.root, 'EXCLUDED')), false);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), head);
  const status = JSON.parse(cli.run(['status', '--json'], f.project.root, f.remote.env).stdout);
  assert.deepEqual(status.checks.map((o: { result: { status: string } }) => o.result.status), ['passed', 'passed', 'passed']);
  assert.deepEqual(status.assessments, []);
});

test('checks cannot mutate tracked or new project content even while adoption already has uncommitted changes', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  for (const path of ['README.md', 'NEW.txt']) await t.test(path, st => {
    const f = fixture(st, { instructions: { ...exact, checks: [operation('mutating'), operation('must-not-run')] } },
      `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(path)}, 'Mutated by check');
console.log(JSON.stringify({format: 'repo-standards/result/v1', status: 'passed', message: 'Claimed success'}));`);
    const { result, report } = f.start({ ...f.remote.env, ...registry.env });
    assert.equal(result.status, 1);
    assert.match(report.reason, /CHECK_MUTATION/);
    assert.equal(report.operations.length, 1);
    assert.ok(report.changes.includes(path));
    assert.equal(readFileSync(join(f.project.root, path), 'utf8'), 'Mutated by check');
    assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
  });
});

test('standards results and process errors remain distinct and stop only the required work', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const cases = [
    { name: 'changed', phase: 'fixes', output: `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'changed',message:'Fixed'}))`, count: 2, code: null },
    { name: 'blocked fix', phase: 'fixes', output: `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'blocked',message:'Needs help'}))`, count: 1, code: 'OPERATION_BLOCKED' },
    { name: 'failed check', phase: 'checks', output: `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'failed',message:'Not satisfied'}))`, count: 2, code: 'CHECKS_FAILED' },
    { name: 'blocked check', phase: 'checks', output: `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'blocked',message:'Needs help'}))`, count: 1, code: 'OPERATION_BLOCKED' },
    { name: 'nonzero', phase: 'fixes', output: 'console.error("Problem"); process.exit(7)', count: 1, code: 'NONZERO_EXIT' },
    { name: 'signal', phase: 'fixes', output: 'process.kill(process.pid, "SIGTERM")', count: 1, code: 'SIGNAL' },
    { name: 'timeout', phase: 'fixes', output: 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)', count: 1, code: 'TIMEOUT' },
    { name: 'malformed', phase: 'fixes', output: 'console.log("not json")', count: 1, code: 'PROTOCOL_ERROR' },
    { name: 'multiple results', phase: 'fixes', output: 'console.log("{}\\n{}")', count: 1, code: 'PROTOCOL_ERROR' },
    { name: 'wrong version', phase: 'fixes', output: 'console.log(JSON.stringify({format:"v2",status:"unchanged",message:""}))', count: 1, code: 'PROTOCOL_ERROR' },
    { name: 'wrong status', phase: 'fixes', output: 'console.log(JSON.stringify({format:"repo-standards/result/v1",status:"passed",message:""}))', count: 1, code: 'PROTOCOL_ERROR' },
  ];
  for (const example of cases) await t.test(example.name, st => {
    const f = fixture(st, { instructions: { ...exact, [example.phase]: [operation('first', { 'timeout-seconds': 1 }), operation('last')] } },
      `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0,'utf8'));
if (input.operation.id === 'first') { ${example.output} }
else console.log(JSON.stringify({format:'repo-standards/result/v1',status:input.operation.phase === 'fixes' ? 'unchanged' : 'passed',message:'Last'}));`);
    const { result, report } = f.start({ ...f.remote.env, ...registry.env });
    assert.equal(result.status, example.code ? 1 : 0, result.stdout + result.stderr);
    assert.equal(report.operations.length, example.count);
    if (example.code) assert.ok(report.reason.startsWith(example.code + ':'), report.reason);
    assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), !example.code);
    if (example.name === 'nonzero') {
      assert.equal(report.operations[0].process.exitCode, 7);
      assert.equal(report.operations[0].result, null);
      assert.match(readFileSync(join(f.project.root, report.operations[0].stderr), 'utf8'), /Problem/);
    }
    if (example.name === 'signal') assert.equal(report.operations[0].process.signal, 'SIGTERM');
    if (example.name === 'timeout') assert.equal(report.operations[0].process.timedOut, true);
    if (example.name === 'failed check') {
      assert.equal(report.operations[0].error, null);
      assert.equal(report.operations[0].result.status, 'failed');
      const status = JSON.parse(cli.run(['status', '--json'], f.project.root, f.remote.env).stdout);
      assert.equal(status.active.operations[1].result.status, 'passed');
    }
  });
});

test('fixes finish before the contextual handoff and checks wait for the later assessment interface', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const f = fixture(t, { readme: { kind: 'file', target: 'README.md', guidance: 'content.md', fixes: [operation('prepare')], checks: [operation('later')] } },
    `import { readFileSync, writeFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0,'utf8'));
writeFileSync('README.md', 'Prepared');
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'changed',message:'Prepared for agent'}));`);
  const { result, report } = f.start({ ...f.remote.env, ...registry.env });
  assert.equal(result.status, 1);
  assert.equal(report.phase, 'contextual');
  assert.match(report.reason, /CONTEXTUAL_REQUIRED/);
  assert.equal(report.operations.length, 1);
  assert.equal(readFileSync(join(f.project.root, 'README.md'), 'utf8'), 'Prepared');
  assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
});

test('author phases cannot redefine exact, skill, retained-input or product-state baselines', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const paths = ['AGENTS.md', '.agents/skills/review/added.txt', '.agents/skills/review/SKILL.md',
    '.repo-standards/inputs/source/content.md', '.repo-standards/inputs/added.txt',
    '.repo-standards/selection.yaml', '.repo-standards/runtime/package.json',
    '.repo-standards/unexpected.txt', '.repo-standards/local/run.json'];
  for (const path of paths) await t.test(path, st => {
    const f = fixture(st, { instructions: { ...exact, fixes: [operation('corrupt'), operation('must-not-run')] }, review: { kind: 'skill', name: 'review', source: 'skill' } },
      `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(path)}, 'Corrupted');
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'changed',message:'Changed'}));`);
    const { result, report } = f.start({ ...f.remote.env, ...registry.env });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(report.reason, /FINAL_INTEGRITY/);
    assert.equal(report.operations.length, 1);
    assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
    if (!path.includes('/local/')) assert.equal(readFileSync(join(f.project.root, path), 'utf8'), 'Corrupted');
    assert.equal(JSON.parse(cli.run(['status', '--json'], f.project.root, f.remote.env).stdout).active.outcome, 'incomplete');
  });
});

test('prerequisite arguments stay literal and failed or hung probes block installation', t => {
  const probes = [
    operation('literal', { prerequisite: { 'version-arguments': ['-e', 'if(process.argv[1] !== "$(touch PROBE_SHELL_RAN)") process.exit(1); console.log("v24.11.1")', '$(touch PROBE_SHELL_RAN)'], version: '^24.0.0' } }),
    operation('signal', { prerequisite: { 'version-arguments': ['-e', 'process.kill(process.pid,"SIGTERM")'], version: '*' } }),
    operation('timeout', { prerequisite: { 'version-arguments': ['-e', 'setInterval(()=>{},1000)'], version: '*' }, 'timeout-seconds': 1 }),
  ];
  const f = fixture(t, { instructions: { ...exact, checks: probes } });
  const before = snapshot(f.project.root);
  const { report } = f.start();
  assert.deepEqual(report.prerequisites.map((p: { code: string | null }) => p.code), [null, 'PROBE_FAILED', 'PROBE_FAILED']);
  assert.deepEqual(snapshot(f.project.root), before);
});

test('the first observed version wins across probe streams and long valid timeouts do not overflow', async t => {
  const registry = await registryFixture(cli.root);
  t.after(() => registry.close());
  const f = fixture(t, { instructions: { ...exact, checks: [operation('first-version', {
    prerequisite: { 'version-arguments': ['-e', 'console.error("1.2.3"); setTimeout(()=>console.log("24.11.1"),100)'], version: '>=24' },
  })] } });
  const before = snapshot(f.project.root);
  const { report } = f.start();
  assert.equal(report.prerequisites[0].version, '1.2.3');
  assert.equal(report.prerequisites[0].code, 'VERSION_INCOMPATIBLE');
  assert.deepEqual(snapshot(f.project.root), before);
  const long = fixture(t, { instructions: { ...exact, fixes: [operation('long-timeout', { 'timeout-seconds': 2147484 })] } },
    `setTimeout(()=>console.log(JSON.stringify({format:'repo-standards/result/v1',status:'unchanged',message:'Finished'})),50);`);
  const { result } = long.start({ ...long.remote.env, ...registry.env });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('version probes cannot fabricate a version by joining stdout and stderr fragments', t => {
  const f = fixture(t, { instructions: { ...exact, checks: [operation('split-streams', {
    prerequisite: { 'version-arguments': ['-e', 'process.stdout.write("1.2"); setTimeout(()=>process.stderr.write(".3"),30)'], version: '1.2.3' },
  })] } });
  const before = snapshot(f.project.root);
  const { report } = f.start();
  assert.equal(report.prerequisites[0].version, null);
  assert.equal(report.prerequisites[0].code, 'VERSION_UNREADABLE');
  assert.match(report.reason, /PREREQUISITES_BLOCKED/);
  assert.deepEqual(snapshot(f.project.root), before);
});
