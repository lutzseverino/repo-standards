import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chmodSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installCli, snapshot, sourceFixture } from './installed-cli.ts';
import { commit, git, inspectionArgs, remoteFixture } from './remote-fixture.ts';

const cli = installCli();
after(() => cli.close());
const source = `format: repo-standards/v2
name: scoped-standards
description: Discover maintained projects
requires: {repo-standards: ">=1.0.0 <2.0.0"}
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

test('discovery inspection requests eligible evidence without changing the project or executing author code', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'apps/widget/package.json': '{"name":"widget"}', '.gitignore': 'private/\n', 'private/token': 'private' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const before = snapshot(project.root);
  const result = cli.run(inspectionArgs, project.root, remote.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.format, 'repo-standards/inspection/v2');
  assert.equal(report.start.eligible, false);
  assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'DISCOVERY_REQUIRED'));
  assert.match(report.discovery.identity, /^sha256:[a-f0-9]{64}$/);
  assert.equal(report.discovery.declarations[0].content, material['discovery.md']);
  assert.ok(report.discovery.evidence.some((e: { kind: string; path: string }) => e.kind === 'file' && e.path === 'apps/widget/package.json'));
  assert.ok(!JSON.stringify(report.discovery).includes('private/token'));
  assert.deepEqual(snapshot(project.root), before);
});

test('two unfamiliar layouts produce complete normalized scope reports including missing project READMEs', (t) => {
  const remote = remoteFixture(source, material);
  t.after(() => remote.close());
  for (const base of ['apps/widget', 'components/odd/nested']) {
    const project = sourceFixture('', { [`${base}/package.json`]: '{"name":"widget"}', 'fixtures/fake/package.json': '{}', 'generated/project/README.md': 'Generated' });
    t.after(() => project.close());
    commit(project.root);
    const request = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
    const evidence = request.discovery.evidence;
    const member = evidence.find((e: { path: string }) => e.path === `${base}/package.json`);
    const excluded = evidence.find((e: { path: string }) => e.path === 'fixtures/fake/package.json');
    const proposal = { format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: [{
      id: 'project-docs', paths: [`${base}/README.md`], coverage: 'The maintained widget is the only project; fixtures and generated output are not maintained projects.', evidence: [member, excluded],
      candidates: [
        { path: `${base}/README.md`, decision: 'include', reason: 'Manifest establishes maintained project membership.', evidence: [member, { kind: 'absence', path: `${base}/README.md` }] },
        { path: 'fixtures/fake', decision: 'exclude', reason: 'Test fixture, not a maintained project.', evidence: [excluded] },
      ], unresolved: [],
    }] };
    const proposalFile = join(remote.support.root, 'scope.json');
    const inspect = () => {
      writeFileSync(proposalFile, JSON.stringify(proposal));
      const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return JSON.parse(result.stdout);
    };
    const before = snapshot(project.root);
    const report = inspect();
    assert.deepEqual(report.resolved.declarations.find((d: { id: string }) => d.id === 'project-docs').targets, { paths: [`${base}/README.md`], directories: [] });
    assert.equal(report.sourceResolved.declarations.find((d: { id: string }) => d.id === 'project-docs').discovery, 'discovery.md');
    assert.match(report.manifest, /discovery: discovery.md/);
    assert.equal(report.guidance.find((d: { id: string }) => d.id === 'project-docs').content, material['guidance.md']);
    assert.equal(report.exact[0].files[0].after.content, material['exact.md']);
    assert.ok(report.start.blockers.some((b: { code: string }) => b.code === 'DISCOVERY_ADOPTION_UNAVAILABLE'));
    proposal.declarations[0]!.evidence.reverse();
    proposal.declarations[0]!.candidates.reverse();
    assert.equal(inspect().identity, report.identity);
    proposal.declarations[0]!.coverage += ' Reviewed by the adopter.';
    assert.notEqual(inspect().identity, report.identity);
    assert.deepEqual(snapshot(project.root), before);
  }
});

test('empty and unresolved scope retain declarations and operations while blocking adoption', (t) => {
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
  const request = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  assert.equal(request.operations[0].id, 'verify');
  const proposal = { format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: [{ id: 'project-docs', paths: [], coverage: 'No maintained projects exist here.', evidence: [request.discovery.evidence.find((e: { path: string }) => e.path === 'README.md')], candidates: [], unresolved: [] as string[] }] };
  const proposalFile = join(remote.support.root, 'scope.json');
  const inspect = () => {
    writeFileSync(proposalFile, JSON.stringify(proposal));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout);
  };
  const empty = inspect();
  assert.deepEqual(empty.resolved.declarations.find((d: { id: string }) => d.id === 'project-docs').targets, { paths: [], directories: [] });
  assert.equal(empty.operations[0].id, 'verify');
  assert.equal(empty.guidance.find((g: { id: string }) => g.id === 'project-docs').content, material['guidance.md']);
  proposal.declarations[0]!.unresolved.push('Is the archived component still maintained?');
  const unresolved = inspect();
  assert.equal(unresolved.start.eligible, false);
  assert.ok(unresolved.start.blockers.some((b: { code: string }) => b.code === 'UNRESOLVED_SCOPE'));
  assert.notEqual(unresolved.identity, empty.identity);
  const started = cli.run([...inspectionArgs.map(arg => arg === 'inspect' ? 'start' : arg), '--confirm', empty.identity], project.root, remote.env);
  assert.equal(started.status, 1);
  assert.ok(!JSON.stringify(snapshot(project.root)).includes('.repo-standards'));
});

test('scope rejects malformed proposals, invalid evidence, and unsafe or overlapping ownership', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'app/package.json': '{}', 'other.txt': 'other', '.gitignore': 'ignored.txt\n', 'ignored.txt': 'private' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const request = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  const member = request.discovery.evidence.find((e: { path: string }) => e.path === 'app/package.json');
  const original = { format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: [{ id: 'project-docs', paths: ['app/README.md'], coverage: 'One maintained app.', evidence: [member], candidates: [{ path: 'app/README.md', decision: 'include', reason: 'App manifest.', evidence: [member, { kind: 'absence', path: 'app/README.md' }] }], unresolved: [] }] };
  const proposalFile = join(remote.support.root, 'scope.json');
  function rejected(proposal: unknown, code: string) {
    writeFileSync(proposalFile, JSON.stringify(proposal));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).errors[0].code, code, result.stdout);
  }
  for (const mutate of [
    (p: typeof original) => { p.format = 'repo-standards/scope/v99'; },
    (p: typeof original) => { p.declarations = []; },
    (p: typeof original) => { p.declarations.push(p.declarations[0]!); },
    (p: typeof original) => { p.declarations[0]!.id = 'instructions'; },
    (p: typeof original) => { p.declarations[0]!.coverage = ''; },
    (p: typeof original) => { p.declarations[0]!.paths.push('app/README.md'); },
    (p: typeof original) => { p.declarations[0]!.evidence.push(member); },
    (p: typeof original) => { p.declarations[0]!.evidence = []; },
    (p: typeof original) => { p.declarations[0]!.evidence = [{ ...member, identity: 'invented' }]; },
    (p: typeof original) => { p.declarations[0]!.evidence = [{ ...member, path: 'ignored.txt' }]; },
    (p: typeof original) => { p.declarations[0]!.candidates[0]!.evidence = [{ kind: 'absence', path: 'app/README.md' }]; },
    (p: typeof original) => { p.declarations[0]!.candidates[0]!.evidence = [member]; },
    (p: typeof original) => { p.declarations[0]!.candidates = []; },
    (p: typeof original) => { p.declarations[0]!.candidates[0]!.decision = 'exclude'; },
    (p: typeof original) => { p.declarations[0]!.evidence = [{ kind: 'absence', path: 'other.txt' }]; },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    rejected(changed, 'INVALID_SCOPE');
  }
  rejected({ ...original, extra: true }, 'INVALID_SCOPE');
  for (const [path, code] of [ ['.', 'UNSAFE_PATH'], ['../escape', 'UNSAFE_PATH'], ['docs/*.md', 'UNSAFE_PATH'], ['app', 'UNSAFE_TARGET'], ['AGENTS.md', 'TARGET_OVERLAP'], ['.git/config', 'RESERVED_TARGET'], ['.repo-standards/state.json', 'RESERVED_TARGET'], ['.agents/skills/author-standards/SKILL.md', 'RESERVED_TARGET'] ]) {
    const changed = structuredClone(original);
    changed.declarations[0]!.paths = [path!];
    changed.declarations[0]!.candidates[0]!.path = path!;
    rejected(changed, code!);
  }
  const duplicateKeys = JSON.stringify(original).replace('"coverage":', '"coverage":"Duplicate","coverage":');
  writeFileSync(proposalFile, duplicateKeys);
  assert.equal(JSON.parse(cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env).stdout).errors[0].code, 'INVALID_SCOPE');
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
    return JSON.parse(result.stdout);
  };
  const first = request();
  assert.equal(request().identity, first.identity);
  writeFileSync(join(project.root, 'ignored.txt'), 'Ignored unrelated sibling changes are outside the promise.');
  assert.equal(request().identity, first.identity);
  const proposalFile = join(remote.support.root, 'scope.json');
  writeFileSync(proposalFile, JSON.stringify({ format: 'repo-standards/scope/v1', request: first.discovery.identity, declarations: [{ id: 'project-docs', paths: [], coverage: 'No maintained projects.', candidates: [], evidence: [first.discovery.evidence[0]], unresolved: [] }] }));
  writeFileSync(join(project.root, 'app/package.json'), '{"name":"changed"}');
  const second = request();
  assert.notEqual(second.discovery.identity, first.discovery.identity);
  const stale = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
  assert.equal(JSON.parse(stale.stdout).errors[0].code, 'STALE_SCOPE');
  writeFileSync(join(project.root, '.git/info/exclude'), '# no classification change\n');
  const third = request();
  assert.notEqual(third.discovery.identity, second.discovery.identity);
  const ignore = join(remote.support.root, 'global-ignore');
  git(project.root, 'config', 'core.excludesFile', ignore);
  const missingIgnore = request();
  writeFileSync(ignore, '');
  const emptyIgnore = request();
  assert.notEqual(emptyIgnore.discovery.identity, missingIgnore.discovery.identity);
  writeFileSync(ignore, '# a changed consulted input\n');
  const changedIgnore = request();
  assert.notEqual(changedIgnore.discovery.identity, emptyIgnore.discovery.identity);
  git(project.root, 'config', 'credential.test-secret', 'MUST-NOT-BE-RETAINED');
  assert.equal(request().identity, changedIgnore.identity);
  assert.ok(!JSON.stringify(request()).includes('MUST-NOT-BE-RETAINED'));
  git(project.root, 'config', 'core.ignorecase', 'true');
  assert.notEqual(request().discovery.identity, changedIgnore.discovery.identity);
  const other = JSON.parse(cli.run(inspectionArgs.map(arg => arg === 'work' ? 'other' : arg), project.root, remote.env).stdout);
  assert.notEqual(other.discovery.identity, request().discovery.identity);
});

test('discovery fails closed on unreadable evidence, unsafe named ancestors, aliases, and observation limits', (t) => {
  const remote = remoteFixture(source, material);
  const project = sourceFixture('', { 'app/package.json': '{}', 'alias/Readme.md': 'Existing', 'unicode/Cafe\u0301.md': 'Existing', 'obstacle': 'A file' });
  t.after(() => { remote.close(); project.close(); });
  commit(project.root);
  const request = () => cli.run(inspectionArgs, project.root, remote.env);
  const memberFile = join(project.root, 'app/package.json');
  chmodSync(memberFile, 0);
  assert.equal(JSON.parse(request().stdout).errors[0].code, 'OBSERVATION_READ');
  chmodSync(memberFile, 0o644);
  const large = join(project.root, 'large.bin');
  writeFileSync(large, Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.equal(JSON.parse(request().stdout).errors[0].code, 'OBSERVATION_LIMIT');
  unlinkSync(large);
  symlinkSync(remote.support.root, join(project.root, 'linked'));
  const first = JSON.parse(request().stdout);
  const member = first.discovery.evidence.find((e: { path: string }) => e.path === 'app/package.json');
  const proposalFile = join(remote.support.root, 'scope.json');
  for (const [path, code] of [['linked/README.md', 'OBSERVATION_UNSAFE'], ['obstacle/README.md', 'OBSERVATION_UNSAFE'], ['alias/README.md', 'CASE_CONFLICT'], ['unicode/Caf\u00e9.md', 'CASE_CONFLICT']]) {
    writeFileSync(proposalFile, JSON.stringify({ format: 'repo-standards/scope/v1', request: first.discovery.identity, declarations: [{ id: 'project-docs', paths: [path], coverage: 'Review the named file.', evidence: [member], candidates: [{ path, decision: 'include', reason: 'Candidate.', evidence: [member] }], unresolved: [] }] }));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).errors[0].code, code, result.stdout);
  }
  unlinkSync(join(project.root, 'linked'));
  execFileSync('mkfifo', [join(project.root, 'special')]);
  assert.equal(JSON.parse(request().stdout).errors[0].code, 'OBSERVATION_UNSAFE');
  unlinkSync(join(project.root, 'special'));
  const inside = join(project.root, 'scope.json');
  writeFileSync(inside, '{}');
  assert.equal(JSON.parse(cli.run([...inspectionArgs, '--scope', inside], project.root, remote.env).stdout).errors[0].code, 'INVALID_SCOPE');
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
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'OBSERVATION_UNSTABLE');
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
    return JSON.parse(result.stdout).discovery.identity;
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
  const request = JSON.parse(cli.run(inspectionArgs, project.root, remote.env).stdout);
  const evidence = request.discovery.evidence.find((e: { path: string }) => e.path === 'README.md');
  const proposalFile = join(remote.support.root, 'scope.json');
  for (const path of ['../outside', '/tmp/file', 'docs/*.md', 'docs/../file', 'docs\\file', '.', '.git', 'AGENTS.md']) {
    const safe = ['.git', 'AGENTS.md'].includes(path);
    writeFileSync(proposalFile, JSON.stringify({ format: 'repo-standards/scope/v1', request: request.discovery.identity, declarations: [{
      id: 'project-docs', paths: [], coverage: 'No maintained projects.', evidence: [evidence], candidates: [{ path, decision: 'exclude', reason: 'Outside contextual ownership.', evidence: [evidence] }], unresolved: [],
    }] }));
    const result = cli.run([...inspectionArgs, '--scope', proposalFile], project.root, remote.env);
    assert.equal(result.status, safe ? 0 : 1, result.stdout + result.stderr);
    if (!safe) assert.equal(JSON.parse(result.stdout).errors[0].code, 'UNSAFE_PATH');
  }
});
