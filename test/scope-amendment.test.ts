import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, test, type TestContext } from 'node:test';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { filesystemFault, filesystemRenameFault } from './adoption-faults.ts';
import { stringify } from 'yaml';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

async function fixture(t: TestContext, options: { script?: string; phase?: 'fixes' | 'checks'; checkScript?: string; declarations?: Record<string, unknown>; deferStart?: boolean; exactTarget?: string; directories?: string[]; projectFiles?: Record<string, string>; workingFiles?: Record<string, string> } = {}) {
  const operation = (id: string, script: string) => ({ id, run: { executable: process.execPath, script, resources: [], arguments: [] },
    prerequisite: { 'version-arguments': ['--version'], version: '^24' }, 'timeout-seconds': 5 });
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(stringify({ format: 'repo-standards/v2', name: 'amendment', description: 'Discover documentation',
    requires: { 'repo-standards': '^1' }, defaults: { declarations: {
      docs: { kind: 'repository', guidance: 'guide.md', discovery: 'discover.md', ...(options.script ? { [options.phase ?? 'checks']: [operation('run', 'run.mjs')] } : {}),
        ...(options.checkScript ? { checks: [operation('check', 'check.mjs')] } : {}) },
      ...options.declarations,
      configuration: { kind: 'file', target: options.exactTarget ?? 'config.json', exact: 'config.json' },
    } }, profiles: { work: { description: 'Work', declarations: {} } } }),
  { 'guide.md': 'Document maintained projects.', 'discover.md': 'Find project documentation and link repairs.', 'config.json': '{}\n',
    'run.mjs': options.script ?? '', 'check.mjs': options.checkScript ?? '' });
  const project = sourceFixture('', { 'README.md': '# Project\n', 'package.json': '{}\n', 'LINKS.md': 'Links\n', ...options.projectFiles });
  for (const directory of options.directories ?? []) mkdirSync(join(project.root, directory), { recursive: true });
  commit(project.root);
  for (const [path, content] of Object.entries(options.workingFiles ?? {})) {
    mkdirSync(join(project.root, path, '..'), { recursive: true });
    writeFileSync(join(project.root, path), content);
  }
  t.after(() => { registry.close(); remote.close(); project.close(); });
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[]) => {
    const result = cli.run(args, project.root, env);
    return { result, report: JSON.parse(result.stdout) };
  };
  const scopeFile = join(remote.support.root, 'scope.json');
  function proposal(request: any, paths = ['README.md']) {
    const member = structuredClone(request.discovery.evidence.find((entry: any) => entry.kind === 'file' && entry.path === 'package.json'));
    return { format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: request.discovery.declarations.map((declaration: { id: string }) => ({ id: declaration.id, paths: declaration.id === 'docs' ? paths : [],
      coverage: 'The project manifest establishes maintained documentation and required link repairs.', evidence: [member],
      candidates: (declaration.id === 'docs' ? paths : []).map(path => ({ path, decision: 'include', reason: 'Project documentation or required link repair.',
        evidence: [member, request.discovery.evidence.find((entry: any) => entry.kind === 'file' && entry.path === path) ?? { kind: 'absence', path }] })), unresolved: [] as string[] })) };
  }
  function inspectScope(request: any, paths = ['README.md'], args = ['inspect', '--amend-scope', '--json']) {
    writeFileSync(scopeFile, JSON.stringify(proposal(request, paths)));
    return run([...args, '--scope', scopeFile]);
  }
  const initial = inspectScope(run(inspectionArgs).report, ['README.md'], inspectionArgs).report;
  const startArgs = ['start', ...inspectionArgs.slice(1), '--scope', scopeFile, '--confirm', initial.identity];
  const started = options.deferStart ? undefined : run(startArgs);
  if (started) assert.equal(started.report.phase, 'contextual', started.result.stdout);
  return { project, remote, env, run, scopeFile, proposal, inspectScope, startArgs, started: started?.report };
}

test('amendment inspection previews equal and added scope in a dirty active run without mutation', async t => {
  const f = await fixture(t);
  writeFileSync(join(f.project.root, 'README.md'), '# Improved project\n');
  const before = snapshot(f.project.root);
  const requested = f.run(['inspect', '--amend-scope', '--json']);
  assert.equal(requested.result.status, 0, requested.result.stdout);
  assert.equal(requested.report.action, 'amend-scope');
  assert.equal(requested.report.amendment.eligible, false);
  assert.equal(requested.report.amendment.blockers[0].code, 'DISCOVERY_REQUIRED');
  assert.deepEqual(requested.report.amendment.existingScope.docs, { paths: ['README.md'], directories: [] });
  for (const paths of [['README.md'], ['README.md', 'LINKS.md']]) {
    const preview = f.inspectScope(requested.report, paths);
    assert.equal(preview.result.status, 0, preview.result.stdout);
    assert.equal(preview.report.amendment.eligible, true);
    assert.deepEqual(preview.report.amendment.proposedScope.docs.paths, [...paths].sort());
    assert.equal(preview.report.amendment.run, f.started.id);
    assert.equal(preview.report.amendment.revision, f.started.inspection);
    assert.equal(preview.report.start.eligible, false);
    assert.deepEqual(preview.report.selection, f.started.selection);
    assert.ok(preview.report.amendment.observations.some((interval: any) => interval.phase === 'agent' && interval.changedPaths.includes('README.md')));
    assert.match(preview.report.amendment.nextAction, /resume --amend-scope/);
    assert.equal(f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report.identity, preview.report.identity);
  }
  assert.deepEqual(snapshot(f.project.root), before);
  assert.equal(readFileSync(join(f.project.root, 'config.json'), 'utf8'), '{}\n');
});

test('confirmed amendment accepts added scope, replays fixes, renews assessment and reruns checks', async t => {
  const f = await fixture(t, { phase: 'fixes', script: `
import { readFileSync, writeFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
for (const path of input.allowedTargets.paths) writeFileSync(path, 'Prepared ' + path + '\\n');
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'changed',message:'Prepared confirmed documentation'}));`,
    checkScript: `console.log(JSON.stringify({format:'repo-standards/result/v1',status:'passed',message:'Confirmed documentation is valid'}));` });
  const requested = f.run(['inspect', '--amend-scope', '--json']).report;
  const preview = f.inspectScope(requested, ['README.md', 'LINKS.md']).report;
  const accepted = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--json']);
  assert.equal(accepted.result.status, 1, accepted.result.stdout);
  assert.equal(accepted.report.phase, 'contextual');
  assert.equal(accepted.report.format, 'repo-standards/run/v3');
  assert.equal(accepted.report.inspection, preview.identity);
  assert.equal(accepted.report.workRequest.scope.inspection, preview.identity);
  assert.deepEqual(accepted.report.workRequest.declarations[0].allowedTargets.paths, ['LINKS.md', 'README.md']);
  assert.equal(readFileSync(join(f.project.root, 'LINKS.md'), 'utf8'), 'Prepared LINKS.md\n');
  assert.equal(accepted.report.operations.filter((entry: any) => entry.operation.phase === 'fixes').length, 2);
  assert.equal(accepted.report.assessments.length, 0);
  assert.equal(accepted.report.amendments.length, 1);
  assert.deepEqual(accepted.report.amendments[0].additions.docs, ['LINKS.md']);
  assert.equal(accepted.report.amendments[0].confirmation, preview.identity);
  assert.ok(accepted.report.amendments[0].outgoingObservation.identity.startsWith('sha256:'));
  const staleAssessment = submit(f, false, f.started.workRequest);
  assert.match(staleAssessment.report.reason, /^ASSESSMENT_SCOPE_MISMATCH:/);
  const completed = submit(f);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  assert.equal(completed.report.outcome, 'complete');
  assert.equal(completed.report.operations.filter((entry: any) => entry.operation.phase === 'checks').length, 1);
  const status = f.run(['status', '--json']).report;
  assert.equal(status.format, 'repo-standards/status/v3');
  assert.equal(status.scopeRevision, 1);
  assert.equal(status.amendments[0].confirmation, preview.identity);
  const retained = f.run(['inspect', '--json']).report;
  assert.equal(retained.format, 'repo-standards/inspection/v3');
  assert.equal(retained.historicalScope.format, 'repo-standards/scope-history/v2');
  assert.equal(retained.historicalScope.scopeRevision, 1);
  assert.equal(retained.historicalScope.amendments[0].confirmation, preview.identity);
  mkdirSync(join(f.project.root, '.repo-standards/inputs/empty'));
  const changedInventory = f.run(['inspect', '--json']);
  assert.equal(changedInventory.result.status, 0, changedInventory.result.stdout);
  assert.ok(changedInventory.report.start.blockers.some((blocker: any) => blocker.code === 'STATE_INTEGRITY'));
});

test('status preserves v3 when a v2 completion has abandoned amended history', async t => {
  const completed = await fixture(t);
  assert.equal(submit(completed).report.outcome, 'complete');
  const state = JSON.parse(readFileSync(join(completed.project.root, '.repo-standards/state.json'), 'utf8'));
  assert.equal(state.format, 'repo-standards/state/v4');
  assert.equal('scopeRevision' in state, false);
  assert.equal('amendments' in state, false);
  const ordinaryStatus = completed.run(['status', '--json']).report;
  assert.equal(ordinaryStatus.format, 'repo-standards/status/v2');
  assert.equal('scopeRevision' in ordinaryStatus, false);
  assert.equal('amendments' in ordinaryStatus, false);

  const amended = await fixture(t);
  const request = amended.run(['inspect', '--amend-scope', '--json']).report;
  const preview = amended.inspectScope(request, ['README.md', 'LINKS.md']).report;
  const accepted = amended.run(['resume', '--amend-scope', '--scope', amended.scopeFile, '--confirm', preview.identity, '--json']);
  assert.equal(accepted.report.format, 'repo-standards/run/v3');
  const abandoned = amended.run(['abandon', '--json']).report;
  assert.equal(abandoned.abandoned, true);

  const reports = resolve(completed.project.root, git(completed.project.root, 'rev-parse', '--git-path', 'repo-standards-reports').trim());
  mkdirSync(reports, { recursive: true });
  writeFileSync(join(reports, 'amended.json'), JSON.stringify(abandoned));
  const status = completed.run(['status', '--json']).report;
  assert.equal(status.format, 'repo-standards/status/v3');
  assert.equal(status.abandoned[0].format, 'repo-standards/run/v3');
});

test('scope amendment confirmation requires its complete standalone resume command', async t => {
  const f = await fixture(t);
  const requested = f.run(['inspect', '--amend-scope', '--json']).report;
  const preview = f.inspectScope(requested, ['README.md', 'LINKS.md']).report;
  for (const args of [
    ['resume', '--amend-scope', '--scope', f.scopeFile, '--json'],
    ['resume', '--amend-scope', '--confirm', preview.identity, '--json'],
    ['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--retry', '--json'],
    ['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--assessment', f.scopeFile, '--json'],
  ]) {
    const rejected = f.run(args);
    assert.equal(rejected.result.status, 2, rejected.result.stdout);
    assert.equal(rejected.report.errors[0].code, 'USAGE');
  }
  const stale = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', 'sha256:stale', '--json']);
  assert.equal(stale.result.status, 1, stale.result.stdout);
  assert.match(stale.report.reason, /^STALE_INSPECTION:/);
  assert.equal(f.run(['status', '--json']).report.active.inspection, f.started.inspection);
});

test('repeated and equal-scope amendments retain a chained authorization history', async t => {
  const f = await fixture(t, { checkScript: `
import { readFileSync } from 'node:fs';
const ready = readFileSync('README.md', 'utf8').includes('Ready');
console.log(JSON.stringify({format:'repo-standards/result/v1',status:ready?'passed':'failed',message:ready?'Confirmed documentation is valid':'Documentation is not ready'}));` });
  const firstRequest = f.run(['inspect', '--amend-scope', '--json']).report;
  const firstPreview = f.inspectScope(firstRequest, ['README.md', 'LINKS.md']).report;
  const first = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', firstPreview.identity, '--json']).report;
  assert.equal(first.phase, 'contextual');
  const failed = submit(f, false, first.workRequest);
  assert.match(failed.report.reason, /^CHECKS_FAILED:/);
  assert.equal(failed.report.operations.filter((entry: any) => entry.operation.phase === 'checks').length, 1);
  writeFileSync(join(f.project.root, 'README.md'), '# Ready\n');

  const secondRequest = f.run(['inspect', '--amend-scope', '--json']).report;
  const secondPreview = f.inspectScope(secondRequest, ['README.md', 'LINKS.md']).report;
  assert.deepEqual(secondPreview.amendment.additions.docs, []);
  const second = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', secondPreview.identity, '--json']).report;
  assert.equal(second.phase, 'contextual');
  assert.equal(second.scopeRevision, 2);
  assert.equal(second.amendments.length, 2);
  assert.equal(second.amendments[0].previousInspection, f.started.inspection);
  assert.equal(second.amendments[1].previousInspection, firstPreview.identity);
  assert.equal(second.amendments[1].confirmation, secondPreview.identity);
  assert.deepEqual(second.amendments[1].acceptedScope.docs.paths, ['LINKS.md', 'README.md']);
  const staleAssessment = submit(f, false, first.workRequest);
  assert.match(staleAssessment.report.reason, /^ASSESSMENT_SCOPE_MISMATCH:/);
  const completed = submit(f, false, undefined, ['README.md']);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  assert.equal(completed.report.outcome, 'complete');
  assert.equal(completed.report.operations.filter((entry: any) => entry.operation.phase === 'checks').length, 2);
});

test('interruption during amended fix replay keeps one accepted revision and recovers by retry', async t => {
  const f = await fixture(t, { phase: 'fixes', script: `
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const marker = '.repo-standards/local/amended-fix-attempt';
if (input.allowedTargets.paths.includes('LINKS.md') && !existsSync(marker)) {
  writeFileSync(marker, 'attempted');
  writeFileSync('LINKS.md', 'Amended fix began\\n');
  process.kill(process.ppid, 'SIGKILL');
}
console.log(JSON.stringify({format:'repo-standards/result/v1',status:'changed',message:'Prepared'}));` });
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const preview = f.inspectScope(request, ['README.md', 'LINKS.md']).report;
  const killed = cli.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--json'], f.project.root, f.env);
  assert.equal(killed.signal, 'SIGKILL');
  const interrupted = f.run(['status', '--json']).report.active;
  assert.equal(interrupted.scopeRevision, 1);
  assert.equal(interrupted.amendments.length, 1);
  assert.equal(interrupted.amendments[0].confirmation, preview.identity);
  assert.equal(interrupted.phase, 'fixes');
  const recovered = f.run(['resume', '--retry', '--json']);
  assert.equal(recovered.report.phase, 'contextual', recovered.result.stdout);
  assert.equal(recovered.report.amendments.length, 1);
  assert.equal(recovered.report.retryHistory.at(-1).phase, 'fixes');
  assert.ok(recovered.report.observations.some((interval: any) => interval.interrupted));
});

test('interruption before amendment journal replacement leaves the prior revision authoritative', async t => {
  const f = await fixture(t);
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const preview = f.inspectScope(request, ['README.md', 'LINKS.md']).report;
  const env = filesystemFault(f.remote.support.root, f.env, 'scope-amendment', 'process.kill(process.pid, \'SIGKILL\');');
  const killed = cli.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--json'], f.project.root, env);
  assert.equal(killed.signal, 'SIGKILL');
  const interrupted = f.run(['status', '--json']).report.active;
  assert.equal(interrupted.inspection, f.started.inspection);
  assert.equal(interrupted.scopeRevision, undefined);
  assert.equal(interrupted.amendments, undefined);
  const accepted = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--json']);
  assert.equal(accepted.report.phase, 'contextual', accepted.result.stdout);
  assert.equal(accepted.report.scopeRevision, 1);
  assert.equal(accepted.report.amendments.length, 1);
});

test('amendments reject removal, selection changes, unsafe ownership and invalid evidence without accepting scope', async t => {
  const f = await fixture(t);
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const before = snapshot(f.project.root);
  const reject = (report: any, code: string) => assert.equal(report.errors?.[0]?.code, code, JSON.stringify(report));
  const removed = f.inspectScope(request, []).report;
  reject(removed, 'SCOPE_RECONCILIATION_REQUIRED');
  assert.match(removed.errors[0].message, /Withdrawing a mistaken target.*incomplete/);
  for (const flag of ['--source', '--standards-version', '--profile']) reject(f.run(['inspect', '--amend-scope', flag, 'changed', '--json']).report, 'SELECTION_SWITCH');
  for (const target of ['config.json', '.repo-standards/extra', '.agents/skills/adopt-standards/extra', 'README.MD']) {
    const result = f.inspectScope(request, ['README.md', target]);
    assert.equal(result.result.status, 1, result.result.stdout);
  }
  for (const mutate of [
    (value: any) => { value.declarations.push({ ...value.declarations[0], id: 'configuration' }); },
    (value: any) => { value.declarations[0].guidance = 'changed.md'; },
    (value: any) => { value.declarations[0].evidence[0].identity = 'sha256:stale'; },
    (value: any) => { value.declarations[0].paths.push('README.md'); },
  ]) {
    const value = f.proposal(request);
    mutate(value);
    writeFileSync(f.scopeFile, JSON.stringify(value));
    reject(f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report, 'INVALID_SCOPE');
  }
  const unresolved = f.proposal(request);
  (unresolved.declarations[0]!.unresolved as string[]).push('Is another project maintained?');
  writeFileSync(f.scopeFile, JSON.stringify(unresolved));
  assert.equal(f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report.amendment.blockers[0].code, 'UNRESOLVED_SCOPE');
  assert.deepEqual(snapshot(f.project.root), before);
});

test('amendment freshness binds working changes, rationale and active run evidence', async t => {
  const f = await fixture(t);
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const initial = f.inspectScope(request).report;
  const value = f.proposal(request);
  value.declarations[0]!.coverage += ' Reviewed links.';
  writeFileSync(f.scopeFile, JSON.stringify(value));
  const revised = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report;
  assert.notEqual(revised.identity, initial.identity);
  writeFileSync(join(f.project.root, 'README.md'), '# Authorized improvement\n');
  assert.equal(f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report.errors[0].code, 'STALE_SCOPE');
  const fresh = f.run(['inspect', '--amend-scope', '--json']).report;
  assert.notEqual(fresh.discovery.identity, request.discovery.identity);
  f.inspectScope(fresh);
  f.run(['resume', '--json']);
  assert.equal(f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report.errors[0].code, 'STALE_SCOPE');
});

test('amendment cannot legitimize earlier out-of-scope writes even after restoring the violated file', async t => {
  const f = await fixture(t);
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  f.inspectScope(request, ['README.md', 'LINKS.md']);
  writeFileSync(join(f.project.root, 'LINKS.md'), 'Unauthorized link repair\n');
  const before = snapshot(f.project.root);
  const rejected = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report;
  assert.equal(rejected.errors[0].code, 'ASSESSMENT_SCOPE');
  assert.match(rejected.errors[0].message, /LINKS.md/);
  assert.deepEqual(snapshot(f.project.root), before);
  // Refresh records the violated interval durably under its original scope.
  f.run(['resume', '--json']);
  writeFileSync(join(f.project.root, 'LINKS.md'), 'Links\n');
  assert.equal(f.run(['inspect', '--amend-scope', '--json']).report.errors[0].code, 'ASSESSMENT_SCOPE');
});

test('confirmed amendment refuses retroactive authorization when work changed after preview', async t => {
  const f = await fixture(t);
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const preview = f.inspectScope(request, ['README.md', 'LINKS.md']).report;
  writeFileSync(join(f.project.root, 'LINKS.md'), 'Unauthorized before confirmation\n');
  const rejected = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--json']);
  assert.equal(rejected.result.status, 1, rejected.result.stdout);
  assert.match(rejected.report.reason, /^ASSESSMENT_SCOPE:.*LINKS.md/);
  assert.equal(rejected.report.amendments, undefined);
  assert.equal(rejected.report.inspection, f.started.inspection);
  assert.equal(readFileSync(join(f.project.root, 'LINKS.md'), 'utf8'), 'Unauthorized before confirmation\n');
});

test('amendment blocks changed HEAD, index, installed expectations and observation failures', async t => {
  const f = await fixture(t);
  const amend = () => f.run(['inspect', '--amend-scope', '--json']);
  const head = git(f.project.root, 'rev-parse', 'HEAD');
  git(f.project.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'new head');
  assert.equal(amend().report.errors[0].code, 'FINAL_INTEGRITY');
  git(f.project.root, 'reset', '--soft', head);
  writeFileSync(join(f.project.root, 'README.md'), '# Staged change\n');
  git(f.project.root, 'add', 'README.md');
  assert.equal(amend().report.errors[0].code, 'FINAL_INTEGRITY');
  git(f.project.root, 'reset', '--quiet', 'HEAD', '--', 'README.md');
  const exact = join(f.project.root, 'config.json');
  for (const mutate of [() => writeFileSync(exact, 'changed'), () => chmodSync(exact, 0o755)]) {
    mutate();
    assert.equal(amend().report.errors[0].code, 'FINAL_INTEGRITY');
    writeFileSync(exact, '{}\n'); chmodSync(exact, 0o644);
  }
  const retained = join(f.project.root, '.repo-standards/inputs/standards.yaml');
  const original = readFileSync(retained);
  writeFileSync(retained, '# rewritten declarations\n');
  assert.equal(amend().report.errors[0].code, 'FINAL_INTEGRITY');
  writeFileSync(retained, original);
  writeFileSync(join(f.project.root, 'too-large'), Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.equal(amend().report.errors[0].code, 'OBSERVATION_LIMIT');
  rmSync(join(f.project.root, 'too-large'));
  assert.equal(amend().result.status, 0);
});

function submit(f: Awaited<ReturnType<typeof fixture>>, blocked = false, suppliedRequest?: any, changedPaths: string[] = []) {
  const request = suppliedRequest ?? f.run(['resume', '--json']).report.workRequest;
  const review = { status: blocked ? 'blocked' : 'valid', explanation: 'Reviewed project membership and link repairs.', evidence: ['Read project manifest.'], additionalPaths: blocked ? ['LINKS.md'] : [] };
  const value = { format: 'repo-standards/assessment/v2', run: request.run, selection: request.selection, snapshot: request.snapshot,
    scope: { inspection: request.scope.inspection, afterFixes: request.scope.afterFixes },
    declarations: [{ id: 'docs', status: 'satisfied', explanation: 'Project documentation reviewed.', changedPaths, evidence: ['README reviewed.'], scopeValidity: { afterFixes: review, current: review } }] };
  const path = join(f.remote.support.root, 'assessment.json');
  writeFileSync(path, JSON.stringify(value));
  return f.run(['resume', '--assessment', path, '--json']);
}

test('definite scope and check blocks remain eligible and preview preserves operation evidence', async t => {
  for (const blockedScope of [true, false]) await t.test(blockedScope ? 'scope block' : 'failed check', async t => {
    const f = await fixture(t, { script: "console.log(JSON.stringify({format:'repo-standards/result/v1',status:'failed',message:'Missing documentation'}));" });
    const blocked = submit(f, blockedScope);
    assert.match(blocked.report.reason, blockedScope ? /^SCOPE_INCOMPLETE:/ : /^CHECKS_FAILED:/);
    if (blockedScope) assert.match(blocked.report.nextAction, /resume --amend-scope --scope <file> --confirm <identity>/);
    const before = snapshot(f.project.root);
    const request = f.run(['inspect', '--amend-scope', '--json']);
    assert.equal(request.result.status, 0, request.result.stdout);
    const preview = f.inspectScope(request.report, ['README.md', 'LINKS.md']);
    assert.equal(preview.report.amendment.eligible, true, preview.result.stdout);
    assert.deepEqual(preview.report.amendment.operations, blocked.report.operations);
    assert.deepEqual(preview.report.amendment.assessments, blocked.report.assessments);
    assert.deepEqual(snapshot(f.project.root), before);
    const accepted = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.report.identity, '--json']);
    assert.equal(accepted.report.phase, 'contextual', accepted.result.stdout);
    assert.deepEqual(accepted.report.amendments[0].assessments, blocked.report.assessments);
    assert.deepEqual(accepted.report.operations.slice(0, blocked.report.operations.length), blocked.report.operations);
  });
});

test('a definite blocked check can accept an amendment before retry', async t => {
  const f = await fixture(t, { script: "console.log(JSON.stringify({format:'repo-standards/result/v1',status:'blocked',message:'Need another documented path'}));" });
  const blocked = submit(f);
  assert.match(blocked.report.reason, /^OPERATION_BLOCKED:/);
  const request = f.run(['inspect', '--amend-scope', '--json']);
  assert.equal(request.result.status, 0, request.result.stdout);
  const preview = f.inspectScope(request.report, ['README.md', 'LINKS.md']);
  assert.equal(preview.report.amendment.eligible, true, preview.result.stdout);
  const accepted = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.report.identity, '--json']);
  assert.equal(accepted.report.phase, 'contextual', accepted.result.stdout);
  assert.equal(accepted.report.scopeRevision, 1);
  assert.equal(accepted.report.amendments[0].confirmation, preview.report.identity);
});

test('a rejected amendment preserves the prior check-failure recovery path', async t => {
  const f = await fixture(t, { script: "console.log(JSON.stringify({format:'repo-standards/result/v1',status:'failed',message:'Missing documentation'}));" });
  const blocked = submit(f);
  assert.match(blocked.report.reason, /^CHECKS_FAILED:/);
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const preview = f.inspectScope(request, ['README.md', 'LINKS.md']).report;
  const rejected = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', 'sha256:stale', '--json']);
  assert.match(rejected.report.reason, /^STALE_INSPECTION:/);
  const status = f.run(['status', '--json']).report.active;
  assert.equal(status.phase, blocked.report.phase);
  assert.equal(status.reason, blocked.report.reason);
  const fault = filesystemRenameFault(f.remote.support.root, f.env, 'checks', "process.kill(process.pid, 'SIGKILL');");
  const killed = cli.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', 'sha256:stale', '--json'], f.project.root, fault);
  assert.equal(killed.signal, 'SIGKILL');
  const afterInterruption = f.run(['status', '--json']).report.active;
  assert.deepEqual(afterInterruption, status);
  const resumed = submit(f, false, blocked.report.workRequest);
  assert.match(resumed.report.reason, /^CHECKS_FAILED:/, resumed.result.stdout);
  assert.notEqual(preview.identity, 'sha256:stale');
});

test('amendment resume rejects active runs without discovered scope as unavailable', async t => {
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(stringify({ format: 'repo-standards/v1', name: 'explicit', description: 'Explicit targets',
    requires: { 'repo-standards': '^1' }, defaults: { declarations: {
      docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: ['README.md'], directories: [] } },
      configuration: { kind: 'file', target: 'config.json', exact: 'config.json' },
    } }, profiles: { work: { description: 'Work', declarations: {} } } }),
  { 'guide.md': 'Review project documentation.', 'config.json': '{}\n' });
  const project = sourceFixture('', { 'README.md': '# Project\n' });
  t.after(() => { registry.close(); remote.close(); project.close(); });
  commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const inspected = JSON.parse(cli.run(inspectionArgs, project.root, env).stdout);
  const started = cli.run(['start', ...inspectionArgs.slice(1), '--confirm', inspected.identity], project.root, env);
  assert.equal(JSON.parse(started.stdout).phase, 'contextual', started.stdout);
  const scope = join(remote.support.root, 'scope.json');
  writeFileSync(scope, '{}');
  const rejected = cli.run(['resume', '--amend-scope', '--scope', scope, '--confirm', 'sha256:inapplicable', '--json'], project.root, env);
  const report = JSON.parse(rejected.stdout);
  assert.equal(rejected.status, 1, rejected.stdout);
  assert.match(report.reason, /^AMENDMENT_UNAVAILABLE:/);
  assert.doesNotMatch(report.reason, /Cannot read properties/);
});

test('active and uncertain author operations require stopping and explicit retry before amendment', async t => {
  const f = await fixture(t, { phase: 'fixes', deferStart: true,
    script: "console.log(JSON.stringify({format:'repo-standards/result/v1',status:'unchanged',message:'Prepared'}));" });
  const active = join(f.remote.support.root, 'active-inspection.json');
  const env = filesystemFault(f.remote.support.root, f.env, 'fixes', `
    const inspected = spawnSync(process.execPath, [process.argv[1], 'inspect', '--amend-scope', '--json'], {encoding:'utf8'});
    fs.writeFileSync(${JSON.stringify(active)}, inspected.stdout);
    process.kill(process.pid, 'SIGKILL');
  `);
  const interrupted = cli.run(f.startArgs, f.project.root, env);
  assert.equal(interrupted.signal, 'SIGKILL');
  assert.equal(JSON.parse(readFileSync(active, 'utf8')).errors[0].code, 'ACTIVE_RUN');
  const before = snapshot(f.project.root);
  const uncertain = f.run(['inspect', '--amend-scope', '--json']).report;
  assert.equal(uncertain.errors[0].code, 'AMENDMENT_RETRY_REQUIRED');
  assert.match(uncertain.errors[0].message, /resume --retry/);
  assert.deepEqual(snapshot(f.project.root), before);
  const retry = f.run(['resume', '--retry', '--json']);
  assert.equal(retry.report.phase, 'contextual', retry.result.stdout);
  assert.equal(f.run(['inspect', '--amend-scope', '--json']).result.status, 0);
});

test('amendment cannot transfer a previously authorized file between discovered declarations', async t => {
  const f = await fixture(t, { declarations: { other: { kind: 'repository', guidance: 'guide.md', discovery: 'discover.md' } } });
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const value = f.proposal(request);
  const docs = value.declarations[0];
  value.declarations[1] = { ...docs, id: 'other' };
  value.declarations[0] = { ...docs, paths: [], candidates: [] };
  writeFileSync(f.scopeFile, JSON.stringify(value));
  const before = snapshot(f.project.root);
  const rejected = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']);
  assert.equal(rejected.report.errors[0].code, 'SCOPE_RECONCILIATION_REQUIRED');
  assert.deepEqual(snapshot(f.project.root), before);
});

test('surviving author process blocks read-only amendment after the CLI dies', async t => {
  const f = await fixture(t, { phase: 'fixes', deferStart: true, script: `
import { readFileSync, writeFileSync } from 'node:fs';
readFileSync(0, 'utf8');
writeFileSync('.repo-standards/local/author-pid', String(process.pid));
process.kill(process.ppid, 'SIGKILL');
setInterval(() => {}, 1000);` });
  assert.equal(cli.run(f.startArgs, f.project.root, f.env).signal, 'SIGKILL');
  const pid = Number(readFileSync(join(f.project.root, '.repo-standards/local/author-pid'), 'utf8'));
  t.after(() => { try { process.kill(-pid, 'SIGKILL'); } catch {} });
  const before = snapshot(f.project.root);
  assert.equal(f.run(['inspect', '--amend-scope', '--json']).report.errors[0].code, 'AUTHOR_PROCESS_ACTIVE');
  assert.deepEqual(snapshot(f.project.root), before);
  process.kill(-pid, 'SIGKILL');
});

test('amendment binds consulted ignore inputs and never hides a previously named target', async t => {
  const f = await fixture(t, { declarations: { ignores: { kind: 'file', target: '.gitignore', guidance: 'guide.md' } } });
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  f.inspectScope(request);
  writeFileSync(join(f.project.root, '.gitignore'), 'future.md\n');
  assert.equal(f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report.errors[0].code, 'STALE_SCOPE');
  const fresh = f.run(['inspect', '--amend-scope', '--json']).report;
  assert.notEqual(fresh.discovery.identity, request.discovery.identity);
  const preview = f.inspectScope(fresh, ['README.md', 'future.md']).report;
  assert.equal(preview.amendment.eligible, true);
  assert.equal(preview.discovery.namedObservation.targets['future.md'].type, 'missing');
  // The named addition is still not authorized by this preview.
  writeFileSync(join(f.project.root, 'future.md'), 'Ignored but explicitly named now');
  const stale = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']);
  assert.equal(stale.result.status, 1, stale.result.stdout);
});

test('accepted ignored additions remain visible in active change reports', async t => {
  const f = await fixture(t, { declarations: { ignores: { kind: 'file', target: '.gitignore', guidance: 'guide.md' } } });
  writeFileSync(join(f.project.root, '.gitignore'), 'future.md\n');
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const preview = f.inspectScope(request, ['README.md', 'future.md']).report;
  assert.equal(preview.discovery.namedObservation.targets['future.md'].type, 'missing');
  const accepted = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--json']);
  assert.equal(accepted.report.phase, 'contextual', accepted.result.stdout);
  writeFileSync(join(f.project.root, 'future.md'), 'Authorized ignored documentation\n');
  const status = f.run(['status', '--json']).report;
  assert.ok(status.active.changes.includes('future.md'), JSON.stringify(status.active.changes));
});

test('an existing ignored addition starts the amended revision without false authorship', async t => {
  const content = 'Existing ignored documentation\n';
  const f = await fixture(t, { projectFiles: { '.gitignore': 'future.md\n' }, workingFiles: { 'future.md': content } });
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const proposal = f.proposal(request, ['README.md', 'future.md']);
  const candidate = proposal.declarations[0].candidates.find((entry: any) => entry.path === 'future.md');
  const contentHash = createHash('sha256').update(content).digest('hex');
  const identity = createHash('sha256').update(JSON.stringify({ type: 'file', sha256: contentHash, executable: false })).digest('hex');
  candidate.evidence = [...proposal.declarations[0].evidence, { kind: 'file', path: 'future.md', identity: `sha256:${identity}` }];
  writeFileSync(f.scopeFile, JSON.stringify(proposal));
  const preview = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report;
  assert.equal(preview.amendment.eligible, true);
  const accepted = f.run(['resume', '--amend-scope', '--scope', f.scopeFile, '--confirm', preview.identity, '--json']);
  assert.equal(accepted.report.phase, 'contextual', accepted.result.stdout);
  const completed = submit(f);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  assert.equal(completed.report.outcome, 'complete');
});

test('installed exact files and skills cannot supply amendment discovery evidence', async t => {
  const f = await fixture(t);
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const installed = (path: string) => path === 'config.json' || path === '.agents' || path === '.agents/skills' || path.startsWith('.agents/skills/adopt-standards');
  assert.ok(request.discovery.evidence.every((entry: any) => !installed(entry.path)));
  assert.ok(!request.discovery.observation.inventories['.'].includes('config.json'));
  assert.ok(!request.discovery.observation.inventories['.'].includes('.agents'));
  const preview = f.inspectScope(request, ['README.md', 'LINKS.md']).report;
  assert.equal(preview.amendment.eligible, true);
  assert.ok(preview.discovery.namedObservation.evidence.every((entry: any) => !installed(entry.path)));
  // A separate initial inspection can observe these files. Even their real
  // identities cannot turn installed output into amendment membership evidence.
  const evidenceProject = sourceFixture('', { 'config.json': '{}\n' });
  t.after(() => evidenceProject.close());
  cpSync(join(f.project.root, '.agents'), join(evidenceProject.root, '.agents'), { recursive: true });
  commit(evidenceProject.root);
  const inspected = f.run([...inspectionArgs, '--project', evidenceProject.root]);
  assert.equal(inspected.result.status, 0, inspected.result.stdout);
  const ordinary = inspected.report;
  for (const [kind, path] of [['file', 'config.json'], ['directory', '.agents/skills/adopt-standards'], ['directory', '.agents/skills'], ['directory', '.agents']]) {
    const value = f.proposal(request);
    const reference = ordinary.discovery.evidence.find((entry: any) => entry.kind === kind && entry.path === path);
    assert.ok(reference);
    value.declarations[0].evidence = [reference];
    value.declarations[0].candidates[0].evidence = [reference];
    writeFileSync(f.scopeFile, JSON.stringify(value));
    const before = snapshot(f.project.root);
    const rejected = f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']);
    assert.equal(rejected.report.errors[0].code, 'INVALID_SCOPE', rejected.result.stdout);
    assert.deepEqual(snapshot(f.project.root), before);
  }
});

test('amendment prunes installed-only ancestors while preserving pre-existing directories and project work', async t => {
  const f = await fixture(t, { exactTarget: 'generated/nested/config.json', directories: ['.agents/skills'],
    declarations: { notes: { kind: 'file', target: 'generated/notes.md', guidance: 'guide.md' } } });
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const directories = (report: any) => report.discovery.evidence.filter((entry: any) => entry.kind === 'directory').map((entry: any) => entry.path);
  assert.deepEqual(directories(request), ['.', '.agents', '.agents/skills']);
  const preview = f.inspectScope(request).report;
  assert.equal(preview.amendment.eligible, true);
  assert.deepEqual(preview.discovery.namedObservation.inventories['.'], ['.agents', 'LINKS.md', 'README.md', 'package.json', 'standards.yaml']);
  writeFileSync(join(f.project.root, 'generated/notes.md'), 'Authorized project-owned notes.\n');
  const withNotes = f.run(['inspect', '--amend-scope', '--json']).report;
  assert.ok(directories(withNotes).includes('generated'));
  assert.ok(!directories(withNotes).includes('generated/nested'));
  assert.deepEqual(withNotes.discovery.observation.inventories.generated, ['generated/notes.md']);
  assert.equal(f.inspectScope(withNotes, ['README.md', 'LINKS.md']).report.amendment.eligible, true);
});
