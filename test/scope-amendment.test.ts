import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import { chmodSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { filesystemFault } from './adoption-faults.ts';
import { stringify } from 'yaml';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';
import { registryFixture } from './registry-fixture.ts';

const cli = installCli();
after(() => cli.close());

async function fixture(t: TestContext, options: { script?: string; phase?: 'fixes' | 'checks'; declarations?: Record<string, unknown>; deferStart?: boolean } = {}) {
  const operation = { id: 'run', run: { executable: process.execPath, script: 'run.mjs', resources: [], arguments: [] },
    prerequisite: { 'version-arguments': ['--version'], version: '^24' }, 'timeout-seconds': 5 };
  const registry = await registryFixture(cli.root);
  const remote = remoteFixture(stringify({ format: 'repo-standards/v2', name: 'amendment', description: 'Discover documentation',
    requires: { 'repo-standards': '^1' }, defaults: { declarations: {
      docs: { kind: 'repository', guidance: 'guide.md', discovery: 'discover.md', ...(options.script ? { [options.phase ?? 'checks']: [operation] } : {}) },
      ...options.declarations,
      configuration: { kind: 'file', target: 'config.json', exact: 'config.json' },
    } }, profiles: { work: { description: 'Work', declarations: {} } } }),
  { 'guide.md': 'Document maintained projects.', 'discover.md': 'Find project documentation and link repairs.', 'config.json': '{}\n', 'run.mjs': options.script ?? '' });
  const project = sourceFixture('', { 'README.md': '# Project\n', 'package.json': '{}\n', 'LINKS.md': 'Links\n' });
  commit(project.root);
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
    assert.match(preview.report.amendment.nextAction, /not yet available/i);
    assert.equal(f.run(['inspect', '--amend-scope', '--scope', f.scopeFile, '--json']).report.identity, preview.report.identity);
  }
  assert.deepEqual(snapshot(f.project.root), before);
  assert.equal(readFileSync(join(f.project.root, 'config.json'), 'utf8'), '{}\n');
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

function submit(f: Awaited<ReturnType<typeof fixture>>, blocked = false) {
  const request = f.run(['resume', '--json']).report.workRequest;
  const review = { status: blocked ? 'blocked' : 'valid', explanation: 'Reviewed project membership and link repairs.', evidence: ['Read project manifest.'], additionalPaths: blocked ? ['LINKS.md'] : [] };
  const value = { format: 'repo-standards/assessment/v2', run: request.run, selection: request.selection, snapshot: request.snapshot,
    scope: { inspection: request.scope.inspection, afterFixes: request.scope.afterFixes },
    declarations: [{ id: 'docs', status: 'satisfied', explanation: 'Project documentation reviewed.', changedPaths: [], evidence: ['README reviewed.'], scopeValidity: { afterFixes: review, current: review } }] };
  const path = join(f.remote.support.root, 'assessment.json');
  writeFileSync(path, JSON.stringify(value));
  return f.run(['resume', '--assessment', path, '--json']);
}

test('definite scope and check blocks remain eligible and preview preserves operation evidence', async t => {
  for (const blockedScope of [true, false]) await t.test(blockedScope ? 'scope block' : 'failed check', async t => {
    const f = await fixture(t, { script: "console.log(JSON.stringify({format:'repo-standards/result/v1',status:'failed',message:'Missing documentation'}));" });
    const blocked = submit(f, blockedScope);
    assert.match(blocked.report.reason, blockedScope ? /^SCOPE_INCOMPLETE:/ : /^CHECKS_FAILED:/);
    const before = snapshot(f.project.root);
    const request = f.run(['inspect', '--amend-scope', '--json']);
    assert.equal(request.result.status, 0, request.result.stdout);
    const preview = f.inspectScope(request.report, ['README.md', 'LINKS.md']);
    assert.equal(preview.report.amendment.eligible, true, preview.result.stdout);
    assert.deepEqual(preview.report.amendment.operations, blocked.report.operations);
    assert.deepEqual(preview.report.amendment.assessments, blocked.report.assessments);
    assert.deepEqual(snapshot(f.project.root), before);
  });
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

test('installed exact files and skills cannot supply amendment discovery evidence', async t => {
  const f = await fixture(t);
  const request = f.run(['inspect', '--amend-scope', '--json']).report;
  const installed = (path: string) => path === 'config.json' || path.startsWith('.agents/skills/adopt-standards');
  assert.ok(request.discovery.evidence.every((entry: any) => !installed(entry.path)));
  assert.ok(!request.discovery.observation.inventories['.'].includes('config.json'));
  assert.ok(!request.discovery.observation.inventories['.agents/skills'].includes('.agents/skills/adopt-standards'));
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
  for (const [kind, path] of [['file', 'config.json'], ['directory', '.agents/skills/adopt-standards']]) {
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
