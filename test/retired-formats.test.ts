import type { ErrorReport, Inspection, Lock, Run, Status } from './json-reports.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stringify } from 'yaml';
import { installCli, installedTree, snapshot } from './installed-cli.ts';
import { committedScopeEvidence, committedState, rewriteCommittedState, rewriteRetainedInput } from './committed-evidence.ts';
import { commit, git, inspectionArgs, startArgs } from './remote-fixture.ts';
import { filesystemFault, kill, killAfterRename, killDuringRemoval } from './adoption-faults.ts';
import { adoptionFixture } from './adoption-fixture.ts';

const cli = installCli();
after(() => cli.close());

const source = stringify({
  format: 'repo-standards/v2', name: 'documented-projects', description: 'Documentation for maintained projects',
  requires: { 'repo-standards': '>=1' },
  defaults: { declarations: {
    docs: { kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md' },
    instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
  } },
  profiles: { work: { description: 'Work', declarations: {} } },
});

const exactSource = stringify({
  format: 'repo-standards/v2', name: 'exact-standards', description: 'Exact content and a skill',
  requires: { 'repo-standards': '>=1' },
  defaults: { declarations: {
    instructions: { kind: 'file', target: 'AGENTS.md', exact: 'agents.md' },
    review: { kind: 'skill', name: 'review', source: 'review' },
  } },
  profiles: { work: { description: 'Work', declarations: {} } },
});

// A complete, committed discovery adoption: its state, retained scope evidence
// and run records are all in the single format this CLI writes.
async function adoptedProject(t: TestContext) {
  const f = await adoptionFixture(t, cli, source, { files: {
    'guidance.md': 'Keep every maintained project README useful.',
    'discovery.md': 'Include the README of every maintained project.',
    'agents.md': 'Pinned instructions\n',
  }, project: { 'apps/docs/README.md': '# Documented project\n' } });
  const { remote, project, json: run } = f;
  const scopeFile = join(remote.support.root, 'scope.json');
  writeFileSync(scopeFile, JSON.stringify({ format: 'repo-standards/scope/v2', declarations: [{
    id: 'docs', coverage: 'The only maintained project.',
    candidates: [{ path: 'apps/docs/README.md', decision: 'include', reason: 'A maintained project README.', evidence: ['apps/docs/README.md'] }], unresolved: [] }] }));
  // Inspects with the confirmed proposal, which still fits the project.
  const inspect = (args: string[]) => f.inspect([...args, '--scope', scopeFile]);
  const started = run(startArgs(inspect(inspectionArgs).identity, [...inspectionArgs, '--scope', scopeFile])).report;
  assert.equal(started.phase, 'contextual');
  const review = { status: 'valid', explanation: 'The confirmed project still matches.', evidence: ['Reviewed the project files.'], additionalPaths: [] };
  const assessment = join(remote.support.root, 'assessment.json');
  writeFileSync(assessment, JSON.stringify({ format: 'repo-standards/assessment/v3',
    declarations: [{ id: 'docs', status: 'satisfied', explanation: 'The README already satisfies the guidance.', evidence: ['Reviewed the README.'], scopeValidity: { afterFixes: review, current: review } }] }));
  const completed = run(['resume', '--assessment', assessment, '--json']);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  commit(project.root);
  return { project, remote, env: f.env, root: project.root, run, inspect, scopeFile };
}

test('a retired state, scope evidence, or run record format is rejected with the fresh-adoption diagnostic and nothing is written', async t => {
  const f = await adoptedProject(t);
  const { root } = f;
  const state = committedState(root);
  const scope = committedScopeEvidence(root);
  assert.equal(state.format, 'repo-standards/state/v7');
  assert.equal(scope.format, 'repo-standards/scope-history/v5');
  assert.equal(f.run<Status>(['status', '--json']).report.format, 'repo-standards/status/v7');
  const retainedInspection = f.run<Inspection>(['inspect', '--json']).report;
  assert.equal(retainedInspection.format, 'repo-standards/inspection/v6');
  assert.equal(retainedInspection.historicalScope!.format, 'repo-standards/scope-history/v5');

  const runRecord = join(root, git(root, 'rev-parse', '--git-path', 'repo-standards-run.lock'));
  const committed = ['.repo-standards/state.json', '.repo-standards/lock.json', '.repo-standards/inputs/scope-history.json']
    .map(path => [path, readFileSync(join(root, path))] as const);
  const restore = () => {
    for (const [path, bytes] of committed) writeFileSync(join(root, path), bytes);
    rmSync(runRecord, { force: true });
  };
  // The oldest and the most recent retired version of each artifact.
  const retired = [
    { format: 'repo-standards/lock/v0', current: 'repo-standards/lock/v1', path: '.repo-standards/lock.json',
      plant: (format: string) => writeFileSync(join(root, '.repo-standards/lock.json'), JSON.stringify({ format })) },
    ...['v1', 'v6'].map(version => ({ format: `repo-standards/state/${version}`, current: 'repo-standards/state/v7', path: '.repo-standards/state.json',
      plant: (format: string) => rewriteCommittedState(root, { ...state, format }) })),
    ...['v1', 'v4'].map(version => ({ format: `repo-standards/scope-history/${version}`, current: 'repo-standards/scope-history/v5', path: '.repo-standards/inputs/scope-history.json',
      plant: (format: string) => rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { ...scope, format }) })),
    ...['v1', 'v5'].map(version => ({ format: `repo-standards/run/${version}`, current: 'repo-standards/run/v6', path: relative(root, runRecord),
      plant: (format: string) => writeFileSync(runRecord, JSON.stringify({ format, id: 'c0ffee00-0000-4000-8000-000000000000',
        selection: state, outcome: 'incomplete', phase: 'fixes' })) })),
  ];
  for (const { format, current, path, plant } of retired) {
    plant(format);
    const before = snapshot(root);
    for (const command of [['inspect'], ['status'], ['resume'], ['abandon']]) {
      const rejected = f.run<ErrorReport>([...command, '--json']);
      assert.equal(rejected.result.status, 1, `${format} ${command[0]}: ${rejected.result.stdout}`);
      assert.equal(rejected.report.errors.length, 1);
      const [diagnostic] = rejected.report.errors;
      assert.deepEqual(diagnostic!.details, { path, format, expected: current }, `${format} ${command[0]}`);
      if (format.startsWith('repo-standards/run/')) {
        // An active run record may hold unfinished work: the earlier CLI
        // resumes or abandons it.
        assert.equal(diagnostic!.code, 'RETIRED_RUN', `${format} ${command[0]}`);
        for (const advice of ['resume --retry', 'abandon']) assert.ok(diagnostic!.message.includes(advice), diagnostic!.message);
      } else {
        // Inspecting retained standards reads the committed records; fresh
        // adoption inspects a source instead.
        assert.equal(diagnostic!.code, 'RETIRED_FORMAT', `${format} ${command[0]}`);
        for (const advice of ['inspect', '--source', '--standards-version', '--profile']) assert.ok(diagnostic!.message.includes(advice), diagnostic!.message);
      }
      assert.deepEqual(snapshot(root), before, `${format} ${command[0]} must not write`);
    }
    restore();
  }
  assert.equal(f.run<Status>(['status', '--json']).report.format, 'repo-standards/status/v7');

  // An archived report of an abandoned run is a run record too.
  const reports = join(runRecord, '../repo-standards-reports');
  mkdirSync(reports, { recursive: true });
  const archived = join(reports, 'c0ffee00-0000-4000-8000-000000000000.json');
  writeFileSync(archived, JSON.stringify({ format: 'repo-standards/run/v1', id: 'c0ffee00-0000-4000-8000-000000000000' }));
  const before = snapshot(root);
  for (const command of [['inspect'], ['status'], ['resume'], ['abandon']]) {
    const rejected = f.run<ErrorReport>([...command, '--json']);
    assert.equal(rejected.result.status, 1, `archived ${command[0]}: ${rejected.result.stdout}`);
    assert.equal(rejected.report.errors[0]!.code, 'RETIRED_FORMAT', `archived ${command[0]}`);
    assert.deepEqual(rejected.report.errors[0]!.details, { path: relative(root, archived), format: 'repo-standards/run/v1', expected: 'repo-standards/run/v6' });
    assert.deepEqual(snapshot(root), before, `archived ${command[0]} must not write`);
  }
});

test('newer record formats require the pinned CLI without fresh-adoption advice or writes', async t => {
  const { project, run } = await adoptedProject(t);
  const root = project.root;
  const runRecord = join(root, git(root, 'rev-parse', '--git-path', 'repo-standards-run.lock'));
  const reports = join(runRecord, '../repo-standards-reports');
  mkdirSync(reports, { recursive: true });
  const archived = join(reports, 'c0ffee00-0000-4000-8000-000000000000.json');
  const records = [
    { path: join(root, '.repo-standards/state.json'), format: 'repo-standards/state/v8', expected: 'repo-standards/state/v7' },
    { path: join(root, '.repo-standards/state.json'), format: 'repo-standards/state/v10', expected: 'repo-standards/state/v7' },
    { path: join(root, '.repo-standards/inputs/scope-history.json'), format: 'repo-standards/scope-history/v6', expected: 'repo-standards/scope-history/v5' },
    { path: runRecord, format: 'repo-standards/run/v7', expected: 'repo-standards/run/v6' },
    { path: archived, format: 'repo-standards/run/v7', expected: 'repo-standards/run/v6' },
    { path: join(root, '.repo-standards/lock.json'), format: 'repo-standards/lock/v2', expected: 'repo-standards/lock/v1' },
  ];
  for (const { path, format, expected } of records) {
    const original = [runRecord, archived].includes(path) ? undefined : readFileSync(path);
    // A future schema need not carry the pin at any location this CLI knows.
    // Only the format can be interpreted, even for the pin-bearing records.
    writeFileSync(path, JSON.stringify({ format, futureSelection: {} }));
    const before = snapshot(root);
    // A newer format never takes the fresh-adoption path, with or without source flags.
    for (const command of [['inspect'], ['start', '--confirm', 'sha256:unreadable'], inspectionArgs.slice(0, -1), ['start', ...inspectionArgs.slice(1, -1), '--confirm', 'sha256:unreadable'], ['status'], ['resume'], ['abandon']]) {
      const rejected = run<ErrorReport>([...command, '--json']);
      assert.equal(rejected.result.status, 1, rejected.result.stdout + rejected.result.stderr);
      assert.equal(rejected.report.errors.length, 1);
      const [diagnostic] = rejected.report.errors;
      assert.equal(diagnostic!.code, 'NEWER_FORMAT', `${format} ${command[0]}`);
      assert.ok(diagnostic!.message.includes(format), diagnostic!.message);
      assert.ok(diagnostic!.message.includes(expected), diagnostic!.message);
      assert.match(diagnostic!.message, /Use the (?:project-)?pinned CLI/);
      assert.doesNotMatch(diagnostic!.message, /remove|removal|fresh|adopt again/i);
      assert.deepEqual(diagnostic!.details, { path: path.startsWith(root + '/') ? path.slice(root.length + 1) : path, format, expected });
      assert.deepEqual(snapshot(root), before, `${format} ${command[0]} must not write`);
    }
    if (original) writeFileSync(path, original);
    else rmSync(path);
  }
  assert.equal(run<Status>(['status', '--json']).result.status, 0);
});

test('the single committed formats are validated on read', async t => {
  const f = await adoptedProject(t);
  const root = f.project.root;
  const state = committedState(root);
  const scope = committedScopeEvidence(root);
  for (const format of ['repo-standards/state/vnext', 'repo-standards/state/v8-extra', 'repo-standards/state/v-1', 'repo-standards/unrelated/v1']) {
    rewriteCommittedState(root, { ...state, format });
    for (const command of ['inspect', 'status']) {
      const before = snapshot(root);
      assert.equal(f.run<ErrorReport>([command, '--json']).report.errors[0]!.code, 'STATE_INTEGRITY', format);
      assert.deepEqual(snapshot(root), before);
    }
  }
  // Work evidence carries observation identities, never observation maps.
  rewriteCommittedState(root, { ...state, observations: state.observations!.map(interval => ({ ...interval, before: { files: {} } })) });
  assert.equal(f.run<ErrorReport>(['inspect', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  assert.equal(f.run<ErrorReport>(['status', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  // Committed evidence holds the current run only; a carried earlier run is
  // never read.
  rewriteCommittedState(root, { ...state, history: [] });
  assert.equal(f.run<ErrorReport>(['inspect', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  assert.equal(f.run<ErrorReport>(['status', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  // The net change set holds one entry per path, in path order, each with its
  // known phases in phase order.
  const { changeSet, ...withoutChangeSet } = state;
  for (const invalid of [withoutChangeSet, { ...state, changeSet: [{ path: 'AGENTS.md', phases: [] }] },
    { ...state, changeSet: [{ path: 'AGENTS.md', phases: ['checks'] }] }, { ...state, changeSet: [{ path: 'AGENTS.md', phases: ['agent', 'fixes'] }] },
    { ...state, changeSet: [{ path: 'b.md', phases: ['fixes'] }, { path: 'a.md', phases: ['fixes'] }] },
    { ...state, changeSet: [{ path: 'a.md', phases: ['fixes'] }, { path: 'a.md', phases: ['agent'] }] }]) {
    rewriteCommittedState(root, invalid);
    const label = JSON.stringify((invalid as { changeSet?: unknown }).changeSet ?? 'missing');
    assert.equal(f.run<ErrorReport>(['inspect', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY', label);
    assert.equal(f.run<ErrorReport>(['status', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY', label);
  }
  assert.ok(changeSet?.length, 'the adopted project records its changed paths');
  rewriteCommittedState(root, state);
  const { format, evidence, scopeChanges, ...run } = scope;
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { ...scope, runs: [run] });
  assert.equal(f.run<ErrorReport>(['inspect', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  assert.equal(f.run<ErrorReport>(['status', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  // Retained scope evidence records its scope change against the previous run.
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { format, evidence, ...run });
  assert.equal(f.run<ErrorReport>(['inspect', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  // A discovery run keeps its discovery and source-resolved declarations together.
  const { discovery, sourceResolved, ...withoutDiscovery } = run;
  for (const unpaired of [{ ...withoutDiscovery, discovery }, { ...withoutDiscovery, sourceResolved }]) {
    rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { format, evidence, ...unpaired, scopeChanges });
    assert.equal(f.run<ErrorReport>(['inspect', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  }
  // It is historical evidence, marked as such.
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', { format, ...run, scopeChanges });
  assert.equal(f.run<ErrorReport>(['inspect', '--json']).report.errors[0]!.code, 'STATE_INTEGRITY');
  rewriteRetainedInput(root, '.repo-standards/inputs/scope-history.json', scope);
  assert.equal(f.run<Status>(['status', '--json']).result.status, 0);
});

test('durable state records only the skill link of a recorded skill', async t => {
  const f = await adoptionFixture(t, cli, exactSource, { files: { 'agents.md': 'Pinned instructions\n', 'review/SKILL.md': '# Review\n' } });
  f.adopt();
  const state = committedState(f.root) as unknown as { links: Record<string, string> };
  for (const links of [{ '.claude/skills/..': '../../.agents/skills/..' }, { '.claude/skills/ghost': '../../.agents/skills/ghost' },
    { '.claude/skills/review': '../../.agents/skills/other' }, { '.claude/review': '../.agents/skills/review' }]) {
    rewriteCommittedState(f.root, { ...state, links: { ...state.links, ...links } });
    const before = snapshot(f.root);
    for (const command of ['inspect', 'status']) {
      const result = f.run([command, '--json']);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal((JSON.parse(result.stdout) as ErrorReport).errors[0]!.code, 'STATE_INTEGRITY', JSON.stringify(links));
    }
    assert.deepEqual(snapshot(f.root), before);
  }
});

// Rewrite a retained file without rebinding the lock, restoring it after the
// test or when the returned function is called.
function tamper(t: TestContext, root: string, path: string) {
  const file = join(root, path);
  const original = readFileSync(file);
  const restore = () => writeFileSync(file, original);
  t.after(restore);
  writeFileSync(file, path.endsWith('.json') ? JSON.stringify({ ...(JSON.parse(original.toString('utf8')) as Record<string, unknown>), tampered: true }) : 'Tampered guidance\n');
  return restore;
}

const integrityError = (path: string) => ({ code: 'STATE_INTEGRITY', message: `Retained product material changed: ${path}. Restore it from the adopting project's committed baseline.` });

test('tampered retained declarations, inputs and scope history fail every reader of the recorded adoption alike', async t => {
  const f = await adoptedProject(t);
  const versionArgs = [...inspectionArgs, '--scope', f.scopeFile];
  for (const path of ['.repo-standards/inputs/resolved.json', '.repo-standards/inputs/scope-history.json', '.repo-standards/inputs/source/guidance.md']) await t.test(path, st => {
    tamper(st, f.root, path);
    for (const args of [['inspect', '--json'], versionArgs, ['start', '--confirm', 'sha256:unconfirmed', '--json'],
      startArgs('sha256:unconfirmed', versionArgs), ['status', '--json']]) {
      const { result, report } = f.run<ErrorReport>(args);
      assert.equal(result.status, 1, `${args.join(' ')}: ${result.stdout}`);
      assert.deepEqual(report.errors, [integrityError(path)], args.join(' '));
    }
  });

  // A start interrupted before installation is restarted by resume, which reads
  // the recorded adoption again and fails on the same diagnostic. An archived
  // abandoned run explains an inconsistent state only when the lock is the one
  // it left; it never hides tampering with the last complete adoption.
  await t.test('resume of an interrupted start, and status beside its abandoned run', st => {
    const path = '.repo-standards/inputs/resolved.json';
    const confirmed = f.inspect(['inspect', '--json']);
    const interrupted = filesystemFault(f.remote.support.root, f.env, 'prerequisites', kill);
    assert.equal(cli.run(['start', '--scope', f.scopeFile, '--confirm', confirmed.identity, '--json'], f.root, interrupted).signal, 'SIGKILL');
    const restore = tamper(st, f.root, path);
    const resumed = f.run<ErrorReport>(['resume', '--retry', '--json']);
    assert.equal(resumed.result.status, 1, resumed.result.stdout);
    assert.deepEqual(resumed.report.errors, [integrityError(path)]);
    assert.equal(f.run<Run>(['abandon', '--json']).report.abandoned, true);
    restore();
    assert.equal(f.run<Status>(['status', '--json']).report.abandoned.length, 1);
    tamper(st, f.root, path);
    const status = f.run<ErrorReport>(['status', '--json']);
    assert.equal(status.result.status, 1, status.result.stdout);
    assert.deepEqual(status.report.errors, [integrityError(path)]);
  });

  // An update abandoned after replacing retained inputs but before writing its
  // lock leaves the previous lock; status explains that state from the run.
  await t.test('status after an update abandoned mid-installation', st => {
    st.after(() => { git(f.root, 'checkout', '--quiet', '--', '.'); git(f.root, 'clean', '--quiet', '-fd'); });
    const previous = f.run<Status>(['status', '--json']).report.lastComplete;
    const confirmed = f.inspect(['inspect', '--json']);
    const interrupted = filesystemFault(f.remote.support.root, f.env, 'installation', killAfterRename('/.repo-standards/inputs/resolved.json'));
    assert.equal(cli.run(['start', '--scope', f.scopeFile, '--confirm', confirmed.identity, '--json'], f.root, interrupted).signal, 'SIGKILL');
    assert.equal(f.run<Run>(['abandon', '--json']).report.abandoned, true);
    const { result, report } = f.run<Status>(['status', '--json']);
    assert.equal(result.status, 0, result.stdout);
    assert.equal(report.stateError!.code, 'STATE_INTEGRITY');
    assert.deepEqual(report.lastComplete, previous);
  });
});

// A committed adoption shaped as CLI 4.0.0 left it: durable state in the
// retired state/v6 format, which records no skill links, an earlier CLI pin,
// that CLI's own adopt-standards skill, no standards-updates skill, and no
// skill links. Its ignored runtime, local and cache content stays in place.
// The pin differs from the CLI under test, whose package version is raised only
// at release.
const earlierCli = '3.9.0';
async function retiredProject(t: TestContext) {
  const f = await adoptionFixture(t, cli, exactSource, { files: { 'agents.md': 'Pinned instructions\n', 'review/SKILL.md': '# Review\n' }, project: { 'README.md': '# Project\n' } });
  const { remote, env, root, run: raw, json: run } = f;
  assert.equal(f.start().result.status, 0);
  const state: Record<string, unknown> = { ...committedState(root), format: 'repo-standards/state/v6' };
  delete state.links;
  rewriteCommittedState(root, state);
  const lockFile = join(root, '.repo-standards/lock.json');
  const lock = JSON.parse(readFileSync(lockFile, 'utf8')) as Lock;
  lock.selection.cli.version = earlierCli;
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  writeFileSync(join(root, '.repo-standards/selection.yaml'), stringify(lock.selection));
  rmSync(join(root, '.claude'), { recursive: true });
  rmSync(join(root, '.agents/skills/standards-updates'), { recursive: true });
  writeFileSync(join(root, '.agents/skills/adopt-standards/SKILL.md'), '# The system skill of CLI 4.0.0\n');
  writeFileSync(join(root, '.repo-standards/inputs/source/retired.md'), 'An input only the earlier adoption retained\n');
  commit(root);
  return { root, remote, env, raw, run };
}

const installedSkills = ['adopt-standards', 'review', 'standards-updates'];

test('a project on a retired format inspects a fresh adoption that removes its product state, and its start links every installed skill', async t => {
  const f = await retiredProject(t);
  const { root } = f;
  const before = snapshot(root);
  const inspected = f.run<Inspection>(inspectionArgs);
  assert.equal(inspected.result.status, 0, inspected.result.stdout + inspected.result.stderr);
  const inspection = inspected.report;
  assert.deepEqual(snapshot(root), before, 'inspection must not write');
  assert.deepEqual(inspection.start.blockers, []);
  assert.equal(inspection.start.eligible, true);
  assert.equal(inspection.update, undefined);
  assert.equal(inspection.removed, undefined);
  assert.deepEqual(inspection.retiredState!.records, [{ path: '.repo-standards/state.json', format: 'repo-standards/state/v6', expected: 'repo-standards/state/v7' }]);
  assert.equal(inspection.retiredState!.target, '.repo-standards');
  // Every committed product file is listed; ignored runtime, local and cache
  // content goes with the directory without being bound.
  assert.deepEqual(inspection.retiredState!.files, git(root, 'ls-files', '.repo-standards').split('\n'));
  assert.ok(existsSync(join(root, '.repo-standards/runtime/node_modules')));
  assert.ok(existsSync(join(root, '.repo-standards/local')));
  // A fresh adoption has no baseline: the earlier system skill is replaced and
  // listed, and the matching author content is kept as is.
  assert.deepEqual(inspection.discardedEdits, ['.agents/skills/adopt-standards']);
  assert.deepEqual(inspection.exact.map(({ id, action, link }) => [id, action, link?.action]),
    [['instructions', 'match', undefined], ['review', 'match', 'create']]);
  assert.deepEqual(inspection.systemSkills.map(({ name, action, link }) => [name, action, link.action]),
    [['adopt-standards', 'replace', 'create'], ['standards-updates', 'create', 'create']]);
  const summary = f.raw([...inspectionArgs.slice(0, -1), '--summary']).stdout;
  assert.ok(summary.includes('Initial adoption over retired product state.'), summary);
  assert.ok(summary.includes('## Retired product state\n\nThe run removes the `.repo-standards` directory whole, including its ignored generated content.'), summary);
  assert.ok(summary.includes('| `.repo-standards/state.json` | `repo-standards/state/v6` | `repo-standards/state/v7` |'), summary);
  assert.ok(summary.includes('- `.repo-standards/inputs/source/retired.md`\n'), summary);

  const head = git(root, 'rev-parse', 'HEAD');
  const index = git(root, 'ls-files', '--stage');
  const started = f.run<Run>(startArgs(inspection.identity));
  assert.equal(started.result.status, 0, started.result.stdout + started.result.stderr);
  assert.equal(started.report.outcome, 'complete');
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.equal(git(root, 'ls-files', '--stage'), index);
  // The removal is left uncommitted with the run's other changes.
  assert.equal(existsSync(join(root, '.repo-standards/inputs/source/retired.md')), false);
  const changed = git(root, 'status', '--porcelain=v1', '--untracked-files=all').split('\n');
  assert.ok(changed.includes(' D .repo-standards/inputs/source/retired.md'), changed.join('\n'));
  assert.ok(changed.includes(' M .repo-standards/state.json'), changed.join('\n'));
  // Every installed skill, system or author, is linked.
  const state = committedState(root) as ReturnType<typeof committedState> & { links: Record<string, string> };
  assert.equal(state.format, 'repo-standards/state/v7');
  assert.deepEqual(state.links, Object.fromEntries(installedSkills.map(name => [`.claude/skills/${name}`, `../../.agents/skills/${name}`])));
  for (const name of installedSkills) {
    assert.equal(readlinkSync(join(root, '.claude/skills', name)), `../../.agents/skills/${name}`);
    assert.ok(changed.includes(`?? .claude/skills/${name}`), changed.join('\n'));
  }
  for (const name of ['adopt-standards', 'standards-updates']) {
    assert.deepEqual(installedTree(join(root, '.agents/skills', name)), installedTree(join(cli.root, 'node_modules/@lutzseverino/repo-standards/skills', name)));
  }
  assert.equal((JSON.parse(readFileSync(join(root, '.repo-standards/lock.json'), 'utf8')) as Lock).selection.cli.version, cli.version);
  commit(root);
  assert.equal(f.run<Status>(['status', '--json']).report.lastComplete.inspection, inspection.identity);
  assert.deepEqual(f.run<Inspection>(['inspect', '--json']).report.update, []);
});

test('a change to the retired product state after inspection makes start stale and removes nothing', async t => {
  const f = await retiredProject(t);
  const { root } = f;
  const inspection = f.run<Inspection>(inspectionArgs).report;
  // Ignored generated content is not bound.
  writeFileSync(join(root, '.repo-standards/local/unbound.txt'), 'Generated\n');
  assert.equal(f.run<Inspection>(inspectionArgs).report.identity, inspection.identity);
  writeFileSync(join(root, '.repo-standards/inputs/source/retired.md'), 'Changed after inspection\n');
  commit(root);
  const before = snapshot(root);
  const stale = f.run<ErrorReport>(startArgs(inspection.identity));
  assert.equal(stale.result.status, 1, stale.result.stdout);
  assert.equal(stale.report.errors[0]!.code, 'STALE_INSPECTION');
  assert.deepEqual(snapshot(root), before, 'a stale start must not write');
  git(root, 'reset', '--quiet', '--hard', 'HEAD~1');
  assert.equal(f.run<Inspection>(inspectionArgs).report.identity, inspection.identity);
});

test('a retired active run record blocks the fresh-adoption preview and its start, naming the earlier pinned CLI', async t => {
  const f = await retiredProject(t);
  const { root } = f;
  const inspection = f.run<Inspection>(inspectionArgs).report;
  const runRecord = join(root, git(root, 'rev-parse', '--git-path', 'repo-standards-run.lock'));
  writeFileSync(runRecord, JSON.stringify({ format: 'repo-standards/run/v5', id: 'c0ffee00-0000-4000-8000-000000000000',
    selection: { cli: { package: '@lutzseverino/repo-standards', version: '3.2.0' } }, outcome: 'incomplete', phase: 'fixes' }));
  const before = snapshot(root);
  for (const args of [inspectionArgs, startArgs(inspection.identity)]) {
    const blocked = f.run<ErrorReport>(args);
    assert.equal(blocked.result.status, 1, blocked.result.stdout);
    assert.equal(blocked.report.errors.length, 1);
    const [diagnostic] = blocked.report.errors;
    assert.equal(diagnostic!.code, 'RETIRED_RUN', args[0]);
    for (const advice of ['3.2.0', 'resume --retry', 'abandon']) assert.ok(diagnostic!.message.includes(advice), diagnostic!.message);
    assert.deepEqual(diagnostic!.details, { path: relative(root, runRecord), format: 'repo-standards/run/v5', expected: 'repo-standards/run/v6', cli: '3.2.0' });
    assert.deepEqual(snapshot(root), before, `${args[0]} must not write or remove anything`);
  }
});

test('a fresh adoption interrupted while removing retired product state reports its run and completes on retry', async t => {
  const f = await retiredProject(t);
  const { root } = f;
  const inspection = f.run<Inspection>(inspectionArgs).report;
  // Remove part of the retired directory, then stop.
  const env = filesystemFault(f.remote.support.root, f.env, 'installation', killDuringRemoval('/.repo-standards', '/selection.yaml'));
  assert.equal(f.raw(startArgs(inspection.identity), env).signal, 'SIGKILL');
  const runRecord = JSON.parse(readFileSync(join(root, git(root, 'rev-parse', '--git-path', 'repo-standards-run.lock')), 'utf8')) as Run;
  assert.equal(runRecord.phase, 'installation');
  assert.deepEqual(runRecord.installation!.trees, { '.repo-standards': 'removing' });
  assert.equal(existsSync(join(root, '.repo-standards/selection.yaml')), false);
  // The retired durable state is still there; this CLI's run is read instead.
  assert.equal(committedState(root).format, 'repo-standards/state/v6');
  const status = f.run<Status>(['status', '--json']);
  assert.equal(status.result.status, 0, status.result.stdout);
  assert.equal(status.report.active!.phase, 'installation');
  assert.equal(status.report.execution, 'interrupted');

  const retried = f.run<Run>(['resume', '--retry', '--json']);
  assert.equal(retried.result.status, 0, retried.result.stdout + retried.result.stderr);
  assert.equal(retried.report.outcome, 'complete');
  const state = committedState(root);
  assert.equal(state.format, 'repo-standards/state/v7');
  // The earlier CLI's local reports were not archived as this run's.
  const retries = state.retryHistory as { archivedFiles: Record<string, string>; report?: string }[];
  assert.deepEqual(retries.map(({ archivedFiles, report }) => [archivedFiles, report]), [[{}, undefined]]);
  assert.equal(existsSync(join(root, '.repo-standards/inputs/source/retired.md')), false);
  for (const name of installedSkills) assert.equal(readlinkSync(join(root, '.claude/skills', name)), `../../.agents/skills/${name}`);
});

test('a fresh adoption stopped before removing retired product state blocks check, and its abandonment archives none of the earlier reports', async t => {
  const f = await retiredProject(t);
  const { root } = f;
  const inspection = f.run<Inspection>(inspectionArgs).report;
  const earlierReport = readFileSync(join(root, '.repo-standards/local/run.json'));
  const env = filesystemFault(f.remote.support.root, f.env, 'installation', killDuringRemoval('/.repo-standards'));
  assert.equal(f.raw(startArgs(inspection.identity), env).signal, 'SIGKILL');
  assert.equal(committedState(root).format, 'repo-standards/state/v6');
  const checked = f.run<ErrorReport>(['check', '--json']);
  assert.equal(checked.result.status, 1, checked.result.stdout);
  assert.equal(checked.report.errors[0]!.code, 'ACTIVE_RUN');

  const abandoned = f.run<Run>(['abandon', '--json']);
  assert.equal(abandoned.result.status, 1, abandoned.result.stdout + abandoned.result.stderr);
  assert.equal(abandoned.report.abandoned, true);
  assert.deepEqual(abandoned.report.archivedFiles, {});
  // The retired state, its local report included, is as it was.
  assert.deepEqual(readFileSync(join(root, '.repo-standards/local/run.json')), earlierReport);
  assert.equal(committedState(root).format, 'repo-standards/state/v6');
  assert.equal(f.run<Inspection>(inspectionArgs).report.identity, inspection.identity);
});

test('a committed record that is neither current nor retired beside retired state fails integrity, and nothing is removed', async t => {
  const f = await retiredProject(t);
  const { root } = f;
  // A real 4.0.0 tree keeps the current lock/v1 beside its retired state.
  assert.equal((JSON.parse(readFileSync(join(root, '.repo-standards/lock.json'), 'utf8')) as Lock).format, 'repo-standards/lock/v1');
  const inspection = f.run<Inspection>(inspectionArgs).report;
  assert.equal(inspection.start.eligible, true);
  // Every malformed record fails the same check: one present beside retired
  // state that does not carry its own artifact's format.
  const lockFile = join(root, '.repo-standards/lock.json');
  writeFileSync(lockFile, JSON.stringify({ format: 'repo-standards/lock/vnext' }));
  commit(root);
  const before = snapshot(root);
  for (const args of [inspectionArgs, startArgs(inspection.identity)]) {
    const rejected = f.run<ErrorReport>(args);
    assert.equal(rejected.result.status, 1, rejected.result.stdout);
    assert.equal(rejected.report.errors.length, 1);
    assert.equal(rejected.report.errors[0]!.code, 'STATE_INTEGRITY', args[0]);
    assert.deepEqual(rejected.report.errors[0]!.details, { path: relative(root, lockFile) });
    assert.deepEqual(snapshot(root), before, `${args[0]} must not remove anything`);
  }
});

test('retired product state changed while its removal is recorded fails the start and is not removed', async t => {
  const f = await retiredProject(t);
  const { root } = f;
  const inspection = f.run<Inspection>(inspectionArgs).report;
  // Edit a bound file as the run persists that it is removing the tree.
  const env = filesystemFault(f.remote.support.root, f.env, 'installation', `
  const persist = fs.writeFileSync;
  let changed = false;
  fs.writeFileSync = function(path, data, ...args) {
    const result = persist.call(this, path, data, ...args);
    let record;
    try { record = JSON.parse(String(data)); } catch {}
    if (!changed && record?.installation?.trees?.['.repo-standards'] === 'removing') {
      changed = true;
      write.call(fs, ${JSON.stringify(join(root, '.repo-standards/selection.yaml'))}, 'Edited after verification\\n');
    }
    return result;
  };
  syncBuiltinESMExports();`);
  const started = f.run<Run>(startArgs(inspection.identity), env);
  assert.equal(started.result.status, 1, started.result.stdout + started.result.stderr);
  assert.equal(started.report.outcome, 'incomplete');
  assert.ok(started.report.reason.startsWith('INSTALLATION_CHANGED:'), started.report.reason);
  assert.ok(started.report.reason.includes('.repo-standards'), started.report.reason);
  // Nothing in the tree was removed, the change included.
  assert.equal(committedState(root).format, 'repo-standards/state/v6');
  assert.ok(existsSync(join(root, '.repo-standards/inputs/source/retired.md')));
  assert.ok(existsSync(join(root, '.repo-standards/runtime/node_modules')));
  assert.equal(readFileSync(join(root, '.repo-standards/selection.yaml'), 'utf8'), 'Edited after verification\n');
  assert.equal(existsSync(join(root, '.claude')), false);
});
