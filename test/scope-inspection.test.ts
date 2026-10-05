import type { Declaration, ErrorReport, FileInventory, Inspection, Run, SourceDeclaration } from './json-reports.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chmodSync, lstatSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { embeddedContent, installCli, sha256, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture, startArgs } from './remote-fixture.ts';
import { adoptionFixture } from './adoption-fixture.ts';

const cli = installCli();
after(() => cli.close());
const source = `format: repo-standards/v2
name: scoped-standards
description: Discover maintained projects
requires: {repo-standards: ">=1.0.0"}
defaults:
  declarations:
    project-docs:
      kind: repository
      guidance: guidance.md
      discovery: discovery.md
    instructions:
      kind: file
      target: AGENTS.md
      exact: exact.md
profiles:
  work:
    description: Work
    declarations: {}
`;
const material = { 'guidance.md': 'Document each maintained project.', 'discovery.md': 'Use project membership evidence; exclude fixtures, generated output, and organizational directories.', 'exact.md': 'Exact instructions' };

// Every included file that does not exist yet is exempt from evidence, with
// no rule of its own for README files.
test('an included missing file needs no evidence paths and inspection records its absence', (t) => {
  const path = 'app/notes.md';
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'app/package.json': '{}' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const proposal = { format: 'repo-standards/scope/v2', declarations: [{
    id: 'project-docs', coverage: 'The app needs a planned documentation file.',
    candidates: [{ path, decision: 'include', reason: 'Document the app.', evidence: [] }], unresolved: [],
  }] };
  const proposalFile = join(remote.support.root, 'scope.json');
  writeFileSync(proposalFile, JSON.stringify(proposal));
  const before = snapshot(project.root);
  const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as Inspection);
  assert.deepEqual(report.start.blockers, []);
  assert.deepEqual(report.discovery!.proposal, proposal);
  assert.deepEqual((report.resolved.declarations.find((d: { id: string }) => d.id === 'project-docs')! as Extract<Declaration, { kind: 'repository' }>).targets, { paths: [path], directories: [] });
  assert.deepEqual(report.discovery!.namedObservation!.targets[path], { type: 'missing' });
  assert.deepEqual(report.discovery!.absence!.map((ref: { kind: string; path: string }) => [ref.kind, ref.path]), [['absence', path]]);
  assert.match(report.discovery!.absence![0]!.identity, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(snapshot(project.root), before);
});

test('a missing documentation README can cite evidence outside its empty directory and be confirmed', async t => {
  const f = await adoptionFixture(t, cli, source, { files: material, project: { 'package.json': '{"name":"documentation-project"}' }, commit: false });
  const { remote, project } = f;
  mkdirSync(join(project.root, 'docs'));
  commit(project.root);
  const proposal = { format: 'repo-standards/scope/v2', declarations: [{
    id: 'project-docs', coverage: 'The project needs a documentation index.',
    candidates: [{ path: 'docs/README.md', decision: 'include', reason: 'The root manifest establishes the project.', evidence: ['package.json'] }], unresolved: [],
  }] };
  const proposalFile = join(remote.support.root, 'scope.json');
  writeFileSync(proposalFile, JSON.stringify(proposal));
  const args = [...inspectionArgs, '--scope', proposalFile];
  const report = f.inspect(args);
  assert.deepEqual(report.start.blockers, []);
  assert.deepEqual(report.discovery!.proposal, proposal);
  assert.equal(report.discovery!.absence![0]!.path, 'docs/README.md');
  const started = f.run(startArgs(report.identity, args));
  assert.equal(started.status, 1, started.stdout + started.stderr);
  const run = (JSON.parse(started.stdout) as Run);
  assert.equal(run.phase, 'contextual', started.stdout);
  assert.deepEqual(run.workRequest!.scope!.proposal, proposal);
});

test('selected discovery returns a blocked inspection requesting eligible evidence, and prevents start, without changing the project or executing author code', (t) => {
  const yaml = source.replace('      discovery: discovery.md\n', `      discovery: discovery.md
      fixes:
        - id: fix
          run: {executable: ./probe, script: script.js, resources: [], arguments: []}
          prerequisite: {version-arguments: ["--version"], version: ">=24.0.0"}
          timeout-seconds: 5
`) + `  explicit:
    description: Excludes discovery
    declarations:
      project-docs: {exclude: true}
  replacement:
    description: Replaces discovery with explicit scope
    declarations:
      project-docs:
        kind: repository
        guidance: guidance.md
        targets: {paths: [README.md], directories: []}
`;
  const remote = remoteFixture(yaml, { ...material, 'script.js': 'process.exit(99);' });
  const project = sourceFixture('', { 'apps/widget/package.json': '{"name":"widget"}', '.gitignore': 'private/\n', 'private/token': 'private',
    'probe': '#!/bin/sh\ntouch SENTINEL\necho 24.0.0\n' });
  t.after(() => { remote.close(); project.close(); });
  chmodSync(join(project.root, 'probe'), 0o755);
  commit(project.root);
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as Inspection);
  assert.equal(report.start.eligible, false);
  assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'DISCOVERY_REQUIRED'));
  assert.match(report.discovery!.identity, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(report.discovery!.declarations[0], { id: 'project-docs', source: 'discovery.md', sha256: sha256(material['discovery.md']), executable: false });
  assert.deepEqual(embeddedContent(report), []);
  assert.ok(report.discovery!.evidence.some((e: { kind: string; path: string }) => e.kind === 'file' && e.path === 'apps/widget/package.json'));
  assert.ok(!JSON.stringify(report.discovery).includes('private/token'));
  assert.deepEqual(snapshot(project.root), before);
  const started = cli.run(startArgs(report.identity), project.root, remote.env);
  assert.equal(started.status, 1, started.stdout + started.stderr);
  assert.deepEqual(snapshot(project.root), before);
  for (const profile of ['explicit', 'replacement']) {
    const result = cli.run(inspectionArgs.map(arg => arg === 'work' ? profile : arg), project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = (JSON.parse(result.stdout) as Inspection);
    assert.equal(report.source!.format, 'repo-standards/v2');
    assert.equal(report.start.eligible, true);
    assert.deepEqual(report.operations, [], 'Excluding or replacing discovery removes its fixes');
    assert.deepEqual(snapshot(project.root), before);
  }
});

test('an unfamiliar layout produces a complete normalized scope report including its missing project README', (t) => {
  const remote = remoteFixture(source, material);
  t.after(() => remote.close());
  const base = 'components/odd/nested';
  const project = sourceFixture('', { [`${base}/package.json`]: '{"name":"widget"}', 'fixtures/fake/package.json': '{}', 'generated/project/README.md': 'Generated' });
  t.after(() => project.close());
  commit(project.root);
  const member = `${base}/package.json`;
  const excluded = 'fixtures/fake/package.json';
  const proposal = { format: 'repo-standards/scope/v2', declarations: [{
    id: 'project-docs', coverage: 'The maintained widget is the only project; fixtures and generated output are not maintained projects.',
    candidates: [
      { path: `${base}/README.md`, decision: 'include', reason: 'Manifest establishes maintained project membership.', evidence: [member, dirname(member)] },
      { path: 'fixtures/fake', decision: 'exclude', reason: 'Test fixture, not a maintained project.', evidence: [excluded] },
    ], unresolved: [],
  }] };
  const proposalFile = join(remote.support.root, 'scope.json');
  const inspect = () => {
    writeFileSync(proposalFile, JSON.stringify(proposal));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return (JSON.parse(result.stdout) as Inspection);
  };
  const before = snapshot(project.root);
  const report = inspect();
  assert.deepEqual((report.resolved.declarations.find((d: { id: string }) => d.id === 'project-docs')! as Extract<Declaration, { kind: 'repository' }>).targets, { paths: [`${base}/README.md`], directories: [] });
  assert.equal((report.sourceResolved!.declarations.find((d: { id: string }) => d.id === 'project-docs')! as Extract<SourceDeclaration, { kind: 'repository'; discovery: string }>).discovery, 'discovery.md');
  assert.match(report.manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.guidance.find((d: { id: string }) => d.id === 'project-docs')!.sha256, sha256(material['guidance.md']));
  assert.equal((report.exact[0]!.files[0]!.after as FileInventory).sha256, sha256(material['exact.md']));
  assert.deepEqual(report.start.blockers, []);
  proposal.declarations[0]!.candidates[0]!.evidence.reverse();
  proposal.declarations[0]!.candidates.reverse();
  assert.equal(inspect().identity, report.identity);
  proposal.declarations[0]!.coverage += ' Reviewed by the adopter.';
  assert.notEqual(inspect().identity, report.identity);
  assert.deepEqual(snapshot(project.root), before);
});

test('a proposal holding only the agent judgment is accepted, and the CLI derives its binding, evidence identities and included paths', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'apps/widget/package.json': '{"name":"widget"}', 'apps/docs/README.md': '# Docs\n', 'fixtures/fake/package.json': '{}' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const request = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
  const proposal = { format: 'repo-standards/scope/v2', declarations: [{
    id: 'project-docs', coverage: 'Widget and docs are the maintained projects; the fixture is test data.',
    candidates: [
      { path: 'apps/widget/README.md', decision: 'include', reason: 'The manifest establishes a maintained project.', evidence: ['apps/widget/package.json', 'apps/widget'] },
      { path: 'fixtures/fake', decision: 'exclude', reason: 'Test fixture, not a maintained project.', evidence: ['fixtures/fake/package.json'] },
      { path: 'apps/docs/README.md', decision: 'include', reason: 'The README documents a maintained project.', evidence: ['apps/docs/README.md'] },
    ], unresolved: [] as string[],
  }] };
  const proposalFile = join(remote.support.root, 'scope.json');
  const inspect = () => {
    writeFileSync(proposalFile, JSON.stringify(proposal));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return (JSON.parse(result.stdout) as Inspection);
  };
  const before = snapshot(project.root);
  const report = inspect();
  assert.deepEqual(report.start.blockers, []);
  assert.equal(report.discovery!.identity, request.discovery!.identity);
  assert.deepEqual((report.resolved.declarations.find((d: { id: string }) => d.id === 'project-docs')! as Extract<Declaration, { kind: 'repository' }>).targets, { paths: ['apps/docs/README.md', 'apps/widget/README.md'], directories: [] });
  assert.deepEqual(report.discovery!.absence!.map((ref: { kind: string; path: string }) => [ref.kind, ref.path]), [['absence', 'apps/widget/README.md']]);
  assert.match(report.discovery!.absence![0]!.identity, /^sha256:[a-f0-9]{64}$/);
  const candidates = report.discovery!.proposal!.declarations[0]!.candidates;
  assert.deepEqual(candidates.map((c: { path: string }) => c.path), ['apps/docs/README.md', 'apps/widget/README.md', 'fixtures/fake']);
  assert.deepEqual(candidates[1]!.evidence, ['apps/widget', 'apps/widget/package.json']);
  assert.deepEqual(Object.keys(report.discovery!.proposal!.declarations[0]!).sort(), ['candidates', 'coverage', 'id', 'unresolved']);
  for (const path of ['apps/widget/package.json', 'apps/widget', 'fixtures/fake/package.json', 'apps/docs/README.md']) {
    assert.ok(report.discovery!.evidence.some((e: { path: string; identity: string }) => e.path === path && e.identity.startsWith('sha256:')), path);
  }

  // Order is normalized; every piece of proposal text feeds the identity.
  proposal.declarations[0]!.candidates.reverse();
  proposal.declarations[0]!.candidates[2]!.evidence.reverse();
  assert.equal(inspect().identity, report.identity);
  const variants: ((p: typeof proposal) => void)[] = [
    p => { p.declarations[0]!.coverage += ' Reviewed.'; },
    p => { p.declarations[0]!.candidates[0]!.reason += ' Reviewed.'; },
    p => { p.declarations[0]!.candidates[0]!.evidence.push('apps'); },
    p => { p.declarations[0]!.unresolved.push('Is the fixture ever published?'); },
    p => { p.declarations[0]!.unresolved.push('Is the docs project still maintained?'); },
  ];
  const original = structuredClone(proposal);
  const identities = new Set([report.identity]);
  for (const vary of variants) {
    vary(proposal);
    identities.add(inspect().identity);
    Object.assign(proposal, structuredClone(original));
  }
  assert.equal(identities.size, variants.length + 1);
  assert.deepEqual(snapshot(project.root), before);
});

test('a proposal for a selection without active discovery declarations is rejected', (t) => {
  const remote = remoteFixture(source.replace('      discovery: discovery.md', '      targets: {paths: [README.md], directories: []}'), material);
  const project = sourceFixture('', { 'README.md': 'Project' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const proposalFile = join(remote.support.root, 'scope.json');
  writeFileSync(proposalFile, JSON.stringify({ format: 'repo-standards/scope/v2', declarations: [] }));
  const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const error = (JSON.parse(result.stdout) as ErrorReport).errors[0];
  assert.equal(error!.code, 'INVALID_SCOPE');
  assert.match(error!.message, /no active discovery declarations.*without --scope/);
});

test('empty scope retains declarations and operations while unresolved scope blocks adoption', (t) => {
  const operations = source.replace('      discovery: discovery.md', `      discovery: discovery.md
      checks:
        - id: verify
          run: {executable: node, script: check.mjs, resources: [], arguments: []}
          prerequisite: {version-arguments: [--version], version: ">=24.0.0 <25.0.0"}
          timeout-seconds: 10`);
  const remote = remoteFixture(operations, { ...material, 'check.mjs': 'throw new Error("Inspection must not execute this");' });
  const project = sourceFixture('', { 'README.md': 'An organizational repository with no maintained projects.' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const request = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
  assert.equal(request.operations[0]!.id, 'verify');
  const proposal = { format: 'repo-standards/scope/v2', declarations: [{ id: 'project-docs', coverage: 'No maintained projects exist here.', candidates: [], unresolved: [] as string[] }] };
  const proposalFile = join(remote.support.root, 'scope.json');
  const inspect = () => {
    writeFileSync(proposalFile, JSON.stringify(proposal));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return (JSON.parse(result.stdout) as Inspection);
  };
  const empty = inspect();
  assert.deepEqual((empty.resolved.declarations.find((d: { id: string }) => d.id === 'project-docs')! as Extract<Declaration, { kind: 'repository' }>).targets, { paths: [], directories: [] });
  assert.equal(empty.operations[0]!.id, 'verify');
  assert.equal(empty.guidance.find((g: { id: string }) => g.id === 'project-docs')!.sha256, sha256(material['guidance.md']));
  proposal.declarations[0]!.unresolved.push('Is the archived component still maintained?');
  const unresolved = inspect();
  assert.equal(unresolved.start.eligible, false);
  assert.ok(unresolved.start.blockers.some((b: { code: string }) => b.code === 'UNRESOLVED_SCOPE'));
  assert.notEqual(unresolved.identity, empty.identity);
  const started = cli.run(startArgs(empty.identity), project.root, remote.env);
  assert.equal(started.status, 1);
  assert.ok(!JSON.stringify(snapshot(project.root)).includes('.repo-standards'));
});

test('a proposal is rejected for its format, its declarations, its evidence, and unsafe or overlapping ownership', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'app/package.json': '{}', 'other.txt': 'other', '.gitignore': 'ignored.txt\n', 'ignored.txt': 'private' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const request = (JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout) as Inspection);
  const member = 'app/package.json';
  const original = { format: 'repo-standards/scope/v2', declarations: [{ id: 'project-docs', coverage: 'One maintained app.',
    candidates: [{ path: 'app/README.md', decision: 'include', reason: 'App manifest.', evidence: [member] }], unresolved: [] as string[] }] };
  type Proposal = typeof original;
  const proposalFile = join(remote.support.root, 'scope.json');
  // The error code, and where the message points at the fix, a fragment of it.
  function rejected(text: string, code: string, message?: RegExp) {
    writeFileSync(proposalFile, text);
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const error = (JSON.parse(result.stdout) as ErrorReport).errors[0];
    assert.equal(error!.code, code, result.stdout);
    if (message) assert.match(error!.message, message);
  }
  const changed = (mutate: (p: Proposal) => void) => { const proposal = structuredClone(original); mutate(proposal); return JSON.stringify(proposal); };
  const evidence = (path: string, decision: string) => (p: Proposal) => { p.declarations[0]!.candidates[0] = { path, decision, reason: 'Needs evidence.', evidence: [] }; };
  for (const [mutate, message] of [
    [p => { p.format = 'repo-standards/scope/v1'; Object.assign(p, { request: request.discovery!.identity }); }, /repo-standards\/scope\/v2/],
    [p => { p.format = 'repo-standards/scope/v99'; }],
    [p => { Object.assign(p, { extra: true }); }],
    [p => { Object.assign(p, { request: request.discovery!.identity }); }, /format, declarations/],
    [p => { Object.assign(p.declarations[0]!, { paths: [] }); }, /id, coverage, candidates, unresolved/],
    [p => { Object.assign(p.declarations[0]!, { evidence: [] }); }, /id, coverage, candidates, unresolved/],
    [p => { p.declarations = []; }, /missing.*project-docs/i],
    [p => { p.declarations.push(p.declarations[0]!); }],
    [p => { p.declarations.push({ ...p.declarations[0]!, id: 'instructions' }); }, /not active discovery declarations.*instructions/i],
    [p => { p.declarations[0]!.id = 'instructions'; }],
    [p => { p.declarations[0]!.id = 'unknown'; }, /project-docs[\s\S]*unknown|unknown[\s\S]*project-docs/],
    [p => { p.declarations[0]!.coverage = ''; }],
    [p => { p.declarations[0]!.candidates.push(p.declarations[0]!.candidates[0]!); }],
    [p => { p.declarations[0]!.candidates[0]!.evidence.push(member); }],
    [p => { p.declarations[0]!.candidates[0]!.evidence = [{ kind: 'file', path: member } as unknown as string]; }],
    [p => { p.declarations[0]!.candidates[0]!.decision = 'maybe'; }],
    [p => { p.declarations[0]!.candidates[0]!.evidence = ['app/missing.json']; }, /app\/missing\.json.*discovery observation/],
    [p => { p.declarations[0]!.candidates[0]!.evidence = ['ignored.txt']; }, /ignored\.txt.*discovery observation/],
    [p => { p.declarations[0]!.candidates[0]!.evidence = ['app/README.md']; }, /app\/README\.md.*discovery observation/],
    // Naming an ignored file as a target does not make it evidence.
    [p => { p.declarations[0]!.candidates[0] = { path: 'ignored.txt', decision: 'include', reason: 'Named.', evidence: ['ignored.txt'] }; }, /ignored\.txt.*discovery observation/],
    ...[['app/package.json', 'include'], ['app/package.json', 'exclude'], ['app', 'exclude'], ['app/notes.md', 'exclude'], ['app/README.md', 'exclude']]
      .map(([path, decision]) => [evidence(path!, decision!), /requires at least one evidence path/] as const),
  ] as [(p: Proposal) => void, RegExp?][]) rejected(changed(mutate), 'INVALID_SCOPE', message);
  // A duplicate key is rejected, and a retired format is reported even beside one.
  rejected(JSON.stringify(original).replace('"coverage":', '"coverage":"Duplicate","coverage":'), 'INVALID_SCOPE');
  rejected(JSON.stringify({ ...original, format: 'repo-standards/scope/v1' }).replace('"coverage":', '"coverage":"Duplicate","coverage":'), 'INVALID_SCOPE', /repo-standards\/scope\/v2/);
  for (const [path, code] of [['.', 'UNSAFE_PATH'], ['../escape', 'UNSAFE_PATH'], ['docs/*.md', 'UNSAFE_PATH'], ['app', 'UNSAFE_TARGET'], ['AGENTS.md', 'TARGET_OVERLAP'],
    ['.git/config', 'RESERVED_TARGET'], ['.repo-standards/state.json', 'RESERVED_TARGET'], ['.agents/skills/author-standards/SKILL.md', 'RESERVED_TARGET'],
    // A system skill's link path and its ancestors are reserved too.
    ['.claude/skills/adopt-standards', 'RESERVED_TARGET'], ['.claude/skills/standards-updates/README.md', 'RESERVED_TARGET'], ['.claude', 'RESERVED_TARGET']] as const) {
    rejected(changed(p => { p.declarations[0]!.candidates[0]!.path = path; }), code);
  }
  assert.equal(lstatSync(join(project.root, '.claude'), { throwIfNoEntry: false }), undefined);
});

test('discovery requests become stale after project, selection, and consulted ignore inputs change', (t) => {
  const remote = remoteFixture(source + '  other:\n    description: Other\n    declarations: {}\n', material);
  const project = sourceFixture('', { 'app/package.json': '{}', '.gitignore': 'ignored.txt\n', 'ignored.txt': 'private' });
  t.after(() => { remote.close(); project.close(); });
  git(project.root, 'config', 'core.ignorecase', 'false');
  commit(project.root);
  const request = () => {
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return (JSON.parse(result.stdout) as Inspection);
  };
  const first = request();
  assert.equal(request().identity, first.identity);
  writeFileSync(join(project.root, 'ignored.txt'), 'Ignored unrelated sibling changes are outside the promise.');
  assert.equal(request().identity, first.identity);
  const proposalFile = join(remote.support.root, 'scope.json');
  writeFileSync(proposalFile, JSON.stringify({ format: 'repo-standards/scope/v2', declarations: [{ id: 'project-docs', coverage: 'No maintained projects.', candidates: [], unresolved: [] }] }));
  const proposed = () => (JSON.parse(cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env).stdout) as Inspection).identity;
  const confirmed = proposed();
  writeFileSync(join(project.root, 'app/package.json'), '{"name":"changed"}');
  const second = request();
  assert.notEqual(second.discovery!.identity, first.discovery!.identity);
  // The same proposal inspected against the changed project is a new inspection.
  assert.notEqual(proposed(), confirmed);
  writeFileSync(join(project.root, '.git/info/exclude'), '# no classification change\n');
  const third = request();
  assert.notEqual(third.discovery!.identity, second.discovery!.identity);
  const ignore = join(remote.support.root, 'global-ignore');
  git(project.root, 'config', 'core.excludesFile', ignore);
  const missingIgnore = request();
  writeFileSync(ignore, '');
  const emptyIgnore = request();
  assert.notEqual(emptyIgnore.discovery!.identity, missingIgnore.discovery!.identity);
  writeFileSync(ignore, '# a changed consulted input\n');
  const changedIgnore = request();
  assert.notEqual(changedIgnore.discovery!.identity, emptyIgnore.discovery!.identity);
  git(project.root, 'config', 'credential.test-secret', 'MUST-NOT-BE-RETAINED');
  assert.equal(request().identity, changedIgnore.identity);
  assert.ok(!JSON.stringify(request()).includes('MUST-NOT-BE-RETAINED'));
  git(project.root, 'config', 'core.ignorecase', 'true');
  assert.notEqual(request().discovery!.identity, changedIgnore.discovery!.identity);
  const other = (JSON.parse(cli.run(inspectionArgs.map(arg => arg === 'work' ? 'other' : arg), project.root, remote.env).stdout) as Inspection);
  assert.notEqual(other.discovery!.identity, request().discovery!.identity);
});

test('discovery fails closed on unreadable evidence, unsafe named ancestors, aliases, and observation limits', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'app/package.json': '{}', 'alias/Readme.md': 'Existing', 'unicode/Cafe\u0301.md': 'Existing', 'obstacle': 'A file' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const request = () => cli.run(inspectionArgs, project.root, remote.env);
  const memberFile = join(project.root, 'app/package.json');
  chmodSync(memberFile, 0);
  assert.equal((JSON.parse(request().stdout) as ErrorReport).errors[0]!.code, 'OBSERVATION_READ');
  chmodSync(memberFile, 0o644);
  const large = join(project.root, 'large.bin');
  writeFileSync(large, Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.equal((JSON.parse(request().stdout) as ErrorReport).errors[0]!.code, 'OBSERVATION_LIMIT');
  unlinkSync(large);
  symlinkSync(remote.support.root, join(project.root, 'linked'));
  assert.equal(request().status, 0);
  const member = 'app/package.json';
  const proposalFile = join(remote.support.root, 'scope.json');
  for (const [path, code] of [['linked/README.md', 'OBSERVATION_UNSAFE'], ['obstacle/README.md', 'OBSERVATION_UNSAFE'], ['alias/README.md', 'CASE_CONFLICT'], ['unicode/Caf\u00e9.md', 'CASE_CONFLICT']]) {
    writeFileSync(proposalFile, JSON.stringify({ format: 'repo-standards/scope/v2', declarations: [{ id: 'project-docs', coverage: 'Review the named file.', candidates: [{ path, decision: 'include', reason: 'Candidate.', evidence: [member] }], unresolved: [] }] }));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, code, result.stdout);
  }
  unlinkSync(join(project.root, 'linked'));
  execFileSync('mkfifo', [join(project.root, 'special')]);
  assert.equal((JSON.parse(request().stdout) as ErrorReport).errors[0]!.code, 'OBSERVATION_UNSAFE');
  unlinkSync(join(project.root, 'special'));
  const inside = join(project.root, 'scope.json');
  writeFileSync(inside, '{}');
  assert.equal((JSON.parse(cli.run([...inspectionArgs, '--scope', inside], project.root, remote.env).stdout) as ErrorReport).errors[0]!.code, 'INVALID_SCOPE');
});

test('detected changes during observation fail instead of issuing a partial discovery request', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'app/package.json': '{}' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const watched = join(project.root, 'app/package.json');
  const loader = join(remote.support.root, 'unstable.mjs');
  writeFileSync(loader, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.lstatSync;
let changed = false;
fs.lstatSync = function(path, ...args) {
  const result = original(path, ...args);
  if (String(path) === ${JSON.stringify(watched)} && !changed) {
    changed = true;
    fs.writeFileSync(path, '{"changed":true}');
  }
  return result;
};
syncBuiltinESMExports();
`);
  const result = cli.run(inspectionArgs, project.root, { ...remote.env, NODE_OPTIONS: `${remote.env.NODE_OPTIONS} --import=${pathToFileURL(loader).href}` });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, 'OBSERVATION_UNSTABLE');
});

test('ignore input paths preserve significant whitespace and an empty override disables the default input', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'app/package.json': '{}' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const ignore = join(remote.support.root, 'global ignore ');
  writeFileSync(ignore, '# original\n');
  git(project.root, 'config', 'core.excludesFile', ignore);
  const request = (env = remote.env) => {
    const result = cli.run(inspectionArgs, project.root, env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return (JSON.parse(result.stdout) as Inspection).discovery!.identity;
  };
  const first = request();
  writeFileSync(ignore, '# changed without changing classification\n');
  assert.notEqual(request(), first);
  git(project.root, 'config', 'core.excludesFile', '');
  const configRoot = join(remote.support.root, 'config');
  mkdirSync(join(configRoot, 'git'), { recursive: true });
  const defaultIgnore = join(configRoot, 'git/ignore');
  writeFileSync(defaultIgnore, '# unused input\n');
  const env = { ...remote.env, XDG_CONFIG_HOME: configRoot };
  const disabled = request(env);
  writeFileSync(defaultIgnore, '# still not consulted\n');
  assert.equal(request(env), disabled);
});

test('excluded candidates require safe concrete syntax while allowing explanations for reserved and exact paths', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'README.md': 'Organizational repository' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const evidence = 'README.md';
  const proposalFile = join(remote.support.root, 'scope.json');
  for (const path of ['../outside', '/tmp/file', 'docs/*.md', 'docs/../file', 'docs\\file', '.', '.git', 'AGENTS.md']) {
    const safe = ['.git', 'AGENTS.md'].includes(path);
    writeFileSync(proposalFile, JSON.stringify({ format: 'repo-standards/scope/v2', declarations: [{
      id: 'project-docs', coverage: 'No maintained projects.', candidates: [{ path, decision: 'exclude', reason: 'Outside contextual ownership.', evidence: [evidence] }], unresolved: [],
    }] }));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, safe ? 0 : 1, result.stdout + result.stderr);
    if (!safe) assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, 'UNSAFE_PATH');
  }
});

test('ignore inputs bind their content by role, not their location, and reports name no checkout path', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'app/package.json': '{}' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const original = join(remote.support.root, 'original-ignore');
  writeFileSync(original, '*.log\n');
  git(project.root, 'config', 'core.excludesFile', original);
  const request = () => {
    const result = cli.run(inspectionArgs, project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return (JSON.parse(result.stdout) as Inspection);
  };
  const first = request();
  assert.deepEqual(first.discovery!.observation.ignores.global, { type: 'file', sha256: sha256('*.log\n'), executable: false });
  for (const location of [project.root, original]) assert.ok(!JSON.stringify(first).includes(location), `the report names ${location}`);
  const moved = join(remote.support.root, 'elsewhere/ignore');
  mkdirSync(join(remote.support.root, 'elsewhere'));
  writeFileSync(moved, '*.log\n');
  git(project.root, 'config', 'core.excludesFile', moved);
  const relocated = request();
  assert.equal(relocated.discovery!.identity, first.discovery!.identity);
  assert.equal(relocated.identity, first.identity);
  writeFileSync(moved, '*.log\n*.tmp\n');
  const changed = request();
  assert.notEqual(changed.discovery!.identity, first.discovery!.identity);
  assert.notEqual(changed.identity, first.identity);
  // An ignored symbolic .gitignore is bound by the hash of its target, never
  // the machine-local target itself.
  writeFileSync(join(project.root, '.git/info/exclude'), 'app/.gitignore\n');
  symlinkSync(moved, join(project.root, 'app/.gitignore'));
  const linked = request();
  assert.deepEqual(linked.discovery!.observation.ignores['app/.gitignore'], { type: 'symlink', sha256: sha256(moved) });
  assert.ok(!JSON.stringify(linked).includes(moved), 'the report must not name the link target');
  unlinkSync(join(project.root, 'app/.gitignore'));
  symlinkSync(original, join(project.root, 'app/.gitignore'));
  const retargeted = request();
  assert.notEqual(retargeted.discovery!.identity, linked.discovery!.identity, 'retargeting the link changes the request');
  assert.notEqual(retargeted.identity, linked.identity, 'retargeting the link changes the inspection');
});
