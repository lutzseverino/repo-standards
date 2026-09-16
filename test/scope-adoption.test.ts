import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';

const cli = installCli();
after(() => cli.close());
const operation = (id: string) => ({ id, run: { executable: process.execPath, script: 'run.mjs', resources: [], arguments: [] },
  prerequisite: { 'version-arguments': ['--version'], version: '^24' }, 'timeout-seconds': 5 });
const script = `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify({format:'repo-standards/result/v1',status:input.operation.phase==='fixes'?'unchanged':'passed',message:JSON.stringify(input.allowedTargets)}));`;
async function fixture(t: TestContext, base = 'components/odd/nested', files = {}, runScript = script) {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(stringify({ format: 'repo-standards/v2', name: 'discovered-adoption', description: 'Documentation for maintained projects',
    requires: { 'repo-standards': '^1' }, defaults: { declarations: {
      docs: { kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md', fixes: [operation('prepare')], checks: [operation('verify')] },
      configuration: { kind: 'file', target: 'docs/config.json', exact: 'config.json' },
    } }, profiles: { work: { description: 'Work', declarations: {} } } }),
  { 'guidance.md': 'Preserve useful documentation and repair links around exact configuration.', 'discovery.md': 'Find maintained projects using manifests and ownership; exclude fixtures, generated output, and organizational directories.', 'config.json': '{"shared":true}\n', 'run.mjs': runScript });
  const project = sourceFixture('', { [`${base}/package.json`]: '{"name":"maintained"}', 'fixtures/fake/package.json': '{}', ...files });
  commit(project.root);
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => { const result = cli.run(args, project.root, env); return { result, report: JSON.parse(result.stdout) }; };
  const request = run(inspectionArgs).report;
  const member = request.discovery.evidence.find((e: { kind: string; path: string }) => e.kind === 'file' && e.path === `${base}/package.json`);
  const excluded = request.discovery.evidence.find((e: { kind: string; path: string }) => e.kind === 'file' && e.path === 'fixtures/fake/package.json');
  const proposal = { format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: [{ id: 'docs', paths: [`${base}/README.md`],
    coverage: 'The manifest and ownership identify one maintained project. Fixture manifests do not establish membership.', evidence: [member, excluded],
    candidates: [{ path: `${base}/README.md`, decision: 'include', reason: 'Maintained project needs documentation.', evidence: [member, { kind: 'absence', path: `${base}/README.md` }] },
      { path: 'fixtures/fake', decision: 'exclude', reason: 'A test fixture, not a maintained project.', evidence: [excluded] }], unresolved: [] as string[] }] };
  const scopeFile = join(remote.support.root, 'scope.json');
  function inspect() {
    writeFileSync(scopeFile, JSON.stringify(proposal));
    return run([...inspectionArgs, '--scope', scopeFile]);
  }
  return { project, remote, env, run, request, proposal, scopeFile, inspect,
    start(identity: string) { return run(['start', ...inspectionArgs.slice(1), '--scope', scopeFile, '--confirm', identity]); } };
}

test('one confirmed discovery scope starts initial adoption and passes concrete files to fixes', async t => {
  const f = await fixture(t);
  const inspected = f.inspect();
  assert.equal(inspected.result.status, 0, inspected.result.stdout);
  assert.deepEqual(inspected.report.start.blockers, []);
  const started = f.start(inspected.report.identity);
  assert.equal(started.result.status, 1, started.result.stdout);
  assert.equal(started.report.phase, 'contextual', started.result.stdout);
  assert.equal(started.report.operations.length, 1);
  assert.deepEqual(JSON.parse(started.report.operations[0].result.message), { paths: ['components/odd/nested/README.md'], directories: [] });
  assert.equal(readFileSync(join(f.project.root, 'docs/config.json'), 'utf8'), '{"shared":true}\n');
  assert.equal(existsSync(join(f.project.root, 'components/odd/nested/README.md')), false);
});

test('discovery handoff requires versioned coverage review after fixes and at assessment', async t => {
  const f = await fixture(t);
  const started = f.start(f.inspect().report.identity).report;
  const request = started.workRequest;
  assert.equal(request.format, 'repo-standards/work-request/v2');
  assert.equal(request.scope.inspection, started.inspection);
  assert.equal(request.scope.afterFixes, request.snapshot);
  assert.equal(request.declarations[0].discovery.content.startsWith('Find maintained projects'), true);
  const assessmentFile = join(f.remote.support.root, 'assessment.json');
  const review = { status: 'valid', explanation: 'After fixes the maintained project is still the only applicable project.', evidence: ['Reviewed the project manifest and excluded fixture.'], additionalPaths: [] };
  const assessment = { format: 'repo-standards/assessment/v2', run: request.run, selection: request.selection, snapshot: request.snapshot,
    scope: { inspection: request.scope.inspection, afterFixes: request.scope.afterFixes },
    declarations: [{ id: 'docs', status: 'satisfied', explanation: 'Reviewed guidance.', changedPaths: [], evidence: ['No content changes in this protocol exercise.'], scopeValidity: { afterFixes: review, current: review } }] };
  writeFileSync(assessmentFile, JSON.stringify(assessment));
  const complete = f.run(['resume', '--assessment', assessmentFile, '--json']);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.equal(complete.report.outcome, 'complete');
  assert.equal(complete.report.operations.length, 2);
});

interface Request {
  run: string; selection: string; snapshot: string; scope: { inspection: string; afterFixes: string };
}
function assessment(request: Request, changedPaths: string[] = []) {
  const review = { status: 'valid', explanation: 'The maintained project and migration files remain fully covered; exclusions still apply.',
    evidence: ['Reviewed project manifest, existing documentation, destinations, and links.'], additionalPaths: [] as string[] };
  return { format: 'repo-standards/assessment/v2', run: request.run, selection: request.selection, snapshot: request.snapshot,
    scope: { inspection: request.scope.inspection, afterFixes: request.scope.afterFixes },
    declarations: [{ id: 'docs', status: 'satisfied', explanation: 'Deleted legacy source and created the confirmed destination with its useful setup and recovery instructions preserved; repaired navigation.', changedPaths,
      evidence: ['Destination preserves setup and recovery instructions, and navigation links to it.'], scopeValidity: { afterFixes: structuredClone(review), current: structuredClone(review) } }] };
}
function submit(f: Awaited<ReturnType<typeof fixture>>, value: unknown) {
  const path = join(f.remote.support.root, 'assessment.json');
  writeFileSync(path, JSON.stringify(value));
  return f.run(['resume', '--assessment', path, '--json']);
}
function setScopeTargets(f: Awaited<ReturnType<typeof fixture>>, targets: string[]) {
  const entry = f.proposal.declarations[0]!;
  entry.paths = targets;
  entry.candidates = [entry.candidates[1]!, ...targets.map(path => {
    const observed = f.request.discovery.evidence.find((e: { kind: string; path: string }) => e.kind === 'file' && e.path === path);
    return { path, decision: 'include', reason: 'Individually planned migration source, destination, introduction, project README, or link repair.',
      evidence: observed ? [observed] : [...entry.evidence, ...f.request.discovery.evidence.filter((e: { kind: string; path: string }) => e.kind === 'directory' && e.path === dirname(path)), { kind: 'absence', path }] };
  })];
}

test('two unfamiliar layouts complete a useful migration around exact configuration and retain historical scope in a fresh checkout', async t => {
  for (const base of ['apps/widget', 'components/odd/nested']) await t.test(base, async t => {
    const useful = '# Operations\n\nSetup: node server.js\n\nRecovery: restore the last snapshot.\n';
    const f = await fixture(t, base, { 'old/operations.md': useful, 'INDEX.md': '[Operations](old/operations.md)\n',
      'docs/config.json': '{"shared":true}\n', 'generated/project/README.md': 'Generated; preserve.', 'organization/overview.md': 'Organizational; preserve.' });
    const targets = [`${base}/README.md`, 'old/operations.md', 'docs/projects/operations.md', 'docs/README.md', 'INDEX.md'];
    setScopeTargets(f, targets);
    for (const [candidate, file, reason] of [
      ['generated/project', 'generated/project/README.md', 'Generated output is not a maintained project.'],
      ['organization', 'organization/overview.md', 'An organizational grouping, not an independently maintained project.'],
    ]) f.proposal.declarations[0]!.candidates.push({ path: candidate!, decision: 'exclude', reason: reason!,
      evidence: [f.request.discovery.evidence.find((entry: { kind: string; path: string }) => entry.kind === 'file' && entry.path === file)] });
    const inspected = f.inspect().report;
    const start = f.start(inspected.identity).report;
    assert.equal(start.phase, 'contextual');
    const before = start.workRequest.scope.afterFixes;
    mkdirSync(join(f.project.root, 'docs/projects'), { recursive: true });
    writeFileSync(join(f.project.root, 'docs/projects/operations.md'), useful);
    rmSync(join(f.project.root, 'old/operations.md'));
    writeFileSync(join(f.project.root, 'docs/README.md'), '# Documentation\n\n[Operations](projects/operations.md)\n');
    writeFileSync(join(f.project.root, 'INDEX.md'), '[Operations](docs/projects/operations.md)\n');
    writeFileSync(join(f.project.root, `${base}/README.md`), '# Maintained project\n\nRun node server.js. Recovery instructions are in the repository documentation.\n');
    const refreshed = f.run(['resume', '--json']).report.workRequest;
    assert.equal(refreshed.scope.afterFixes, before);
    assert.notEqual(refreshed.snapshot, before);
    const completed = submit(f, assessment(refreshed, targets));
    assert.equal(completed.result.status, 0, completed.result.stdout);
    assert.equal(readFileSync(join(f.project.root, 'docs/projects/operations.md'), 'utf8'), useful);
    assert.equal(existsSync(join(f.project.root, 'old/operations.md')), false);
    assert.equal(readFileSync(join(f.project.root, 'docs/config.json'), 'utf8'), '{"shared":true}\n');
    assert.equal(readFileSync(join(f.project.root, 'generated/project/README.md'), 'utf8'), 'Generated; preserve.');
    const status = f.run(['status', '--json']).report;
    // The committed interval keeps each changed path's before and after state.
    const migration = status.observations.find((entry: { phase: string; changes: Record<string, unknown> }) => entry.phase === 'agent' && Object.hasOwn(entry.changes, 'old/operations.md'));
    assert.equal(migration.changes['old/operations.md'].before.type, 'file');
    assert.equal(migration.changes['old/operations.md'].after.type, 'missing');
    assert.equal(migration.changes['docs/projects/operations.md'].before.type, 'missing');
    assert.equal(migration.changes['docs/projects/operations.md'].after.type, 'file');
    assert.match(status.assessments[0].declarations[0].explanation, /preserved/);
    commit(f.project.root);
    const checkout = join(f.remote.support.root, 'checkout');
    git(f.project.root, 'clone', '--quiet', f.project.root, checkout);
    writeFileSync(join(f.remote.support.root, 'responses.json'), '{}');
    const retained = f.run(['inspect', '--project', checkout, '--json']);
    assert.equal(retained.result.status, 0, retained.result.stdout);
    assert.equal(retained.report.format, 'repo-standards/inspection/v2');
    assert.equal(retained.report.retained, true);
    assert.equal(retained.report.historicalScope.format, 'repo-standards/scope-history/v2');
    assert.equal(retained.report.historicalScope.evidence, 'historical');
    assert.equal(retained.report.historicalScope.inspection, inspected.identity);
    assert.deepEqual(retained.report.historicalScope.resolved, inspected.resolved);
    assert.deepEqual(retained.report.historicalScope.discovery.proposal, inspected.discovery.proposal);
    assert.deepEqual(retained.report.historicalScope.discovery.absence, inspected.discovery.absence);
    assert.deepEqual(retained.report.historicalScope.sourceResolved, inspected.sourceResolved);
    assert.equal(retained.report.start.eligible, false);
  });
});

test('missing, invalid, unresolved, stale and dirty discovery starts preserve the project before mutation', async t => {
  const f = await fixture(t);
  const inspection = f.inspect().report;
  const reject = (report: { errors: { code: string }[] }, code: string) => {
    assert.equal(report.errors[0]!.code, code);
    assert.equal(existsSync(join(f.project.root, '.repo-standards')), false);
    assert.equal(existsSync(join(f.project.root, 'docs/config.json')), false);
    assert.equal(f.run(['status', '--json']).report.active, null);
  };
  reject(f.run(['start', ...inspectionArgs.slice(1), '--confirm', inspection.identity]).report, 'STALE_INSPECTION');
  writeFileSync(f.scopeFile, '{}');
  reject(f.start(inspection.identity).report, 'INVALID_SCOPE');
  f.proposal.declarations[0]!.unresolved = ['Is this project maintained?'];
  const unresolved = f.inspect().report;
  reject(f.start(unresolved.identity).report, 'START_BLOCKED');
  f.proposal.declarations[0]!.unresolved = [];
  f.proposal.declarations[0]!.coverage += ' Changed rationale.';
  f.inspect();
  reject(f.start(inspection.identity).report, 'STALE_INSPECTION');
  writeFileSync(join(f.project.root, '.git/info/exclude'), '# new observation input\n');
  reject(f.start(inspection.identity).report, 'STALE_SCOPE');
  writeFileSync(join(f.project.root, 'unrelated.txt'), 'Uncommitted');
  const request = f.run(inspectionArgs).report;
  f.proposal.request = request.discovery.identity;
  const dirty = f.inspect().report;
  reject(f.start(dirty.identity).report, 'START_BLOCKED');
  assert.equal(readFileSync(join(f.project.root, 'unrelated.txt'), 'utf8'), 'Uncommitted');
});

test('explained empty discovery scope retains fixes, coverage assessment and checks', async t => {
  const f = await fixture(t, 'fixtures/example');
  const entry = f.proposal.declarations[0]!;
  entry.paths = [];
  entry.candidates = [{ path: 'fixtures/example', decision: 'exclude', reason: 'Fixture project; there are no maintained projects here.', evidence: entry.evidence }, entry.candidates[1]!];
  entry.coverage = 'This repository contains test fixtures only; no maintained project requires documentation.';
  const start = f.start(f.inspect().report.identity).report;
  assert.equal(start.phase, 'contextual');
  assert.equal(start.workRequest.declarations.length, 1);
  assert.deepEqual(JSON.parse(start.operations[0].result.message), { paths: [], directories: [] });
  const completed = submit(f, assessment(start.workRequest));
  assert.equal(completed.result.status, 0, completed.result.stdout);
  assert.deepEqual(completed.report.operations.map((op: { operation: { phase: string } }) => op.operation.phase), ['fixes', 'checks']);
  assert.deepEqual(JSON.parse(completed.report.operations[1].result.message), { paths: [], directories: [] });
});

test('scope-validity omissions, mismatched identities and additional file needs block checks without new authority', async t => {
  const f = await fixture(t);
  const start = f.start(f.inspect().report.identity).report;
  const valid = assessment(start.workRequest);
  const oldProtocol = { ...valid, format: 'repo-standards/assessment/v1' };
  assert.match(submit(f, oldProtocol).report.reason, /ASSESSMENT_FORMAT/);
  const noReview = JSON.parse(JSON.stringify(valid));
  delete noReview.declarations[0].scopeValidity;
  assert.match(submit(f, noReview).report.reason, /ASSESSMENT_FORMAT/);
  assert.match(submit(f, { ...valid, scope: { ...valid.scope, afterFixes: 'invented' } }).report.reason, /ASSESSMENT_SCOPE_MISMATCH/);
  for (const phase of ['afterFixes', 'current'] as const) {
    const incomplete = structuredClone(valid);
    incomplete.declarations[0]!.scopeValidity[phase].status = 'blocked';
    incomplete.declarations[0]!.scopeValidity[phase].additionalPaths = ['new-destination.md'];
    const blocked = submit(f, incomplete).report;
    assert.match(blocked.reason, /SCOPE_INCOMPLETE/);
    assert.match(blocked.nextAction, /Additional paths grant no authority/);
    assert.deepEqual(blocked.assessments, [incomplete]);
    assert.equal(blocked.operations.length, 1);
    assert.equal(existsSync(join(f.project.root, 'new-destination.md')), false);
  }
  const invalidStatus = JSON.parse(JSON.stringify(valid));
  invalidStatus.declarations[0].scopeValidity.current.status = ['valid'];
  assert.match(submit(f, invalidStatus).report.reason, /ASSESSMENT_FORMAT/);
  const falseValid = structuredClone(valid);
  falseValid.declarations[0]!.scopeValidity.current.additionalPaths = ['new-destination.md'];
  assert.match(submit(f, falseValid).report.reason, /ASSESSMENT_FORMAT/);
  const complete = submit(f, valid);
  assert.equal(complete.result.status, 0, complete.result.stdout);
});

test('discovered contextual changes reject stale, omitted and false evidence before completing with fresh evidence', async t => {
  const f = await fixture(t, 'apps/widget', { 'stable.md': 'Stable' });
  setScopeTargets(f, ['apps/widget/README.md', 'stable.md']);
  const start = f.start(f.inspect().report.identity).report;
  const target = f.proposal.declarations[0]!.paths[0]!;
  writeFileSync(join(f.project.root, target), '# Project\n\nRun node server.js.\n');
  assert.match(submit(f, assessment(start.workRequest, [target])).report.reason, /STALE_ASSESSMENT/);
  const refreshed = f.run(['resume', '--json']).report.workRequest;
  assert.match(submit(f, assessment(refreshed)).report.reason, /ASSESSMENT_PATHS.*omitted/);
  assert.match(submit(f, assessment(refreshed, [target, 'invented.md'])).report.reason, /ASSESSMENT_SCOPE/);
  assert.match(submit(f, assessment(refreshed, [target, 'stable.md'])).report.reason, /ASSESSMENT_PATHS.*did not change/);
  const complete = submit(f, assessment(refreshed, [target]));
  assert.equal(complete.result.status, 0, complete.result.stdout);
});

test('unconfirmed migration destinations and exact corruption preserve incomplete work and installed expectations', async t => {
  for (const target of ['invented.md', 'docs/config.json']) await t.test(target, async t => {
    const f = await fixture(t);
    const start = f.start(f.inspect().report.identity).report;
    const installedLock = readFileSync(join(f.project.root, '.repo-standards/lock.json'), 'utf8');
    writeFileSync(join(f.project.root, target), 'Preserve this failed work');
    const request = f.run(['resume', '--json']).report;
    const rejected = target === 'invented.md' ? submit(f, assessment(request.workRequest)).report : request;
    assert.match(rejected.reason, target === 'invented.md' ? /ASSESSMENT_SCOPE/ : /FINAL_INTEGRITY/);
    assert.equal(readFileSync(join(f.project.root, target), 'utf8'), 'Preserve this failed work');
    assert.equal(readFileSync(join(f.project.root, '.repo-standards/lock.json'), 'utf8'), installedLock);
    assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
    assert.equal(rejected.operations.length, start.operations.length);
  });
});

test('discovered fixes and checks enforce confirmed files through the established v2 observation contract', async t => {
  for (const phase of ['fixes', 'checks']) await t.test(phase, async t => {
    const f = await fixture(t, 'apps/widget', {}, script.replace("console.log(JSON.stringify", `if (input.operation.phase === '${phase}') { const { writeFileSync } = await import('node:fs'); writeFileSync('outside.md', 'Operation violation'); }\nconsole.log(JSON.stringify`));
    const start = f.start(f.inspect().report.identity).report;
    const failed = phase === 'fixes' ? start : submit(f, assessment(start.workRequest)).report;
    assert.match(failed.reason, phase === 'fixes' ? /OPERATION_SCOPE.*outside.md/ : /CHECK_MUTATION.*outside.md/);
    assert.equal(readFileSync(join(f.project.root, 'outside.md'), 'utf8'), 'Operation violation');
    assert.equal(failed.outcome, 'incomplete');
    assert.equal(existsSync(join(f.project.root, '.repo-standards/state.json')), false);
  });
});

test('discovered scope survives retry with separate earlier agent evidence and renewed post-fix coverage identity', async t => {
  const f = await fixture(t, 'apps/widget', {}, script.replace('console.log(JSON.stringify', `if (input.operation.phase === 'fixes') { const { writeFileSync } = await import('node:fs'); writeFileSync(input.allowedTargets.paths[0], '# Prepared by fix'); }\nconsole.log(JSON.stringify`));
  const started = f.start(f.inspect().report.identity).report;
  assert.equal(started.phase, 'contextual');
  writeFileSync(join(f.project.root, 'apps/widget/README.md'), '# Agent documented the maintained project');
  const oldRequest = f.run(['resume', '--json']).report.workRequest;
  const retried = f.run(['resume', '--retry', '--json']).report;
  assert.equal(retried.phase, 'contextual');
  assert.equal(retried.workRequest.scope.inspection, oldRequest.scope.inspection);
  assert.notEqual(retried.workRequest.scope.afterFixes, oldRequest.scope.afterFixes);
  assert.equal(readFileSync(join(f.project.root, 'apps/widget/README.md'), 'utf8'), '# Prepared by fix');
  assert.match(submit(f, assessment(oldRequest, ['apps/widget/README.md'])).report.reason, /ASSESSMENT_SCOPE_MISMATCH|STALE_ASSESSMENT/);
  assert.match(submit(f, assessment(retried.workRequest)).report.reason, /ASSESSMENT_PATHS/);
  const complete = submit(f, assessment(retried.workRequest, ['apps/widget/README.md']));
  assert.equal(complete.result.status, 0, complete.result.stdout);
  const status = f.run(['status', '--json']).report;
  assert.deepEqual(status.observations.filter((entry: { changes: Record<string, unknown> }) => Object.hasOwn(entry.changes, 'apps/widget/README.md')).map((entry: { phase: string }) => entry.phase), ['fixes', 'agent', 'fixes']);
  assert.equal(status.retryHistory.length, 1);
});

test('interrupted pre-install discovery can retry its relative proposal from another working directory', async t => {
  const f = await fixture(t);
  const inspected = f.inspect().report;
  const env = filesystemFault(f.remote.support.root, f.env, 'runtime', `
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  const result = rename.call(this, from, to);
  if (String(to).endsWith('repo-standards-run.lock')) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();`);
  const interrupted = cli.run(['start', ...inspectionArgs.slice(1), '--scope', relative(f.project.root, f.scopeFile), '--confirm', inspected.identity], f.project.root, env);
  assert.equal(interrupted.signal, 'SIGKILL');
  assert.equal(existsSync(join(f.project.root, '.repo-standards')), false);
  const elsewhere = join(f.remote.support.root, 'runner');
  mkdirSync(elsewhere);
  const recovered = cli.run(['resume', '--retry', '--project', f.project.root, '--json'], elsewhere, f.env);
  const report = JSON.parse(recovered.stdout);
  assert.equal(report.phase, 'contextual', recovered.stdout);
  assert.equal(report.workRequest.scope.inspection, inspected.identity);
  assert.deepEqual(report.workRequest.scope.proposal, inspected.discovery.proposal);
});
