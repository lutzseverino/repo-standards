import type { ErrorReport, FileObservation, FileState, Inspection, Run, Status } from './json-reports.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installCli, sha256 } from './installed-cli.ts';
import { assertCompactRunRecord, assertCompactWorkEvidence, committedState, localRunReport } from './committed-evidence.ts';
import { commit, git, manifest, operation, startArgs, versionArgs } from './remote-fixture.ts';
import { filesystemFault } from './adoption-faults.ts';
import { adoptionFixture } from './adoption-fixture.ts';

const cli = installCli();
after(() => cli.close());
async function fixture(t: TestContext, script: string, declarations: Record<string, unknown> = {
  readme: { kind: 'file', target: 'README.md', guidance: 'guide.md', fixes: [operation('prepare')], checks: [operation('verify')] },
  other: { kind: 'file', target: 'OTHER.md', guidance: 'guide.md' },
}, files = {}) {
  const f = await adoptionFixture(t, cli, manifest(declarations), {
    files: { 'guide.md': 'Explain this project.', 'exact.md': 'Expected instructions', 'skill/SKILL.md': '# Review', 'run.mjs': script },
    project: { 'README.md': 'Original', 'OTHER.md': 'Other', ...files } });
  const { project, remote, env } = f;
  const run = <T = Run>(args: string[]) => f.json<T>(args);
  const start = startArgs(f.inspect().identity);
  return { project, remote, env, run, startArgs: start, head: git(project.root, 'rev-parse', 'HEAD'), start: () => run<Run>(start),
    assess(request: { declarations: { id: string }[] }, status = 'satisfied') {
      const path = join(remote.support.root, 'assessment.json');
      writeFileSync(path, JSON.stringify({ format: 'repo-standards/assessment/v3',
        declarations: request.declarations.map(({ id }) => ({ id, status, explanation: 'Guidance applied.', evidence: ['Reviewed project content.'] })) }));
      return run<Run>(['resume', '--assessment', path, '--json']);
    },
  };
}
const prelude = `import { readFileSync, writeFileSync, chmodSync, rmSync, mkdirSync, existsSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));`;
const result = `console.log(JSON.stringify({format:'repo-standards/result/v1',status:input.operation.phase==='fixes'?'changed':'passed',message:'Done'}));`;

test('fixes enforce their owning declaration rather than the union of authorized paths', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('OTHER.md', 'Wrong declaration');
${result}`);
  const started = f.start();
  assert.equal(started.result.status, 1);
  assert.match(started.report.reason, /OPERATION_SCOPE.*readme\/prepare.*OTHER.md/);
  assert.equal(started.report.operations[0]!.result!.status, 'changed');
  assert.equal(readFileSync(join(f.project.root, 'OTHER.md'), 'utf8'), 'Wrong declaration');
  const abandoned = f.run<Run>(['abandon', '--json']).report;
  assert.equal(abandoned.abandoned, true);
  assert.equal(readFileSync(join(f.project.root, 'OTHER.md'), 'utf8'), 'Wrong declaration');
  assert.equal(f.run<Status>(['status', '--json']).report.lastComplete, null);
});

test('named targets stay observable when fixes make them ignored', async t => {
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
  const refreshed = f.run<Run>(['resume', '--json']).report;
  assert.notEqual(refreshed.workRequest!.snapshot, started.workRequest!.snapshot);
  const complete = f.assess(refreshed.workRequest!);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.deepEqual(complete.report.assessments[0]!.declarations[0]!.changedPaths, ['new.md']);
});

test('retry preserves same-file agent work across fix replay and attributes it to its declaration', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', 'Prepared');
${result}`);
  const started = f.start().report;
  assert.equal(started.phase, 'contextual');
  writeFileSync(join(f.project.root, 'README.md'), 'Agent documentation');
  const oldRequest = f.run<Run>(['resume', '--json']).report.workRequest;
  const retried = f.run<Run>(['resume', '--retry', '--json']).report;
  assert.equal(retried.phase, 'contextual');
  assert.equal(readFileSync(join(f.project.root, 'README.md'), 'utf8'), 'Prepared');
  assert.notEqual(retried.workRequest!.snapshot, oldRequest!.snapshot);
  const complete = f.assess(retried.workRequest!);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  // The agent change replaced by the replayed fix is still attributed to its declaration.
  assert.deepEqual(complete.report.assessments[0]!.declarations.map((entry: { changedPaths: string[] }) => entry.changedPaths), [[], ['README.md']]);
  const status = f.run<Status>(['status', '--json']).report;
  const intervals = status.observations as { phase: string; changes: Record<string, unknown>; scope: unknown }[];
  assert.deepEqual(intervals.filter(interval => Object.hasOwn(interval.changes, 'README.md')).map(interval => interval.phase), ['fixes', 'agent', 'fixes']);
  // An operation's interval is scoped to its declaration, and an agent
  // interval to every contextual declaration.
  const readme = { readme: { paths: ['README.md'], directories: [] } };
  for (const interval of intervals) assert.deepEqual(interval.scope, interval.phase === 'agent' ? { other: { paths: ['OTHER.md'], directories: [] }, ...readme } : readme, interval.phase);
  assert.equal(status.checks!.length, 1);
  assert.equal(git(f.project.root, 'rev-parse', 'HEAD'), f.head);
  assert.notEqual(git(f.project.root, 'status', '--porcelain'), '');
});

test('additions, deletions and executable changes a fix makes outside its scope are reported', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') { writeFileSync('added.txt', 'Added'); rmSync('OTHER.md'); chmodSync('tool.sh', 0o755); }
${result}`, undefined, { 'tool.sh': '#!/bin/sh\n' });
  const failed = f.start().report;
  assert.match(failed.reason, /OPERATION_SCOPE/);
  assert.deepEqual(failed.observations[0]!.violations, ['OTHER.md', 'added.txt', 'tool.sh']);
  assert.deepEqual(failed.operations[0]!.process, { exitCode: 0, signal: null, error: null, timedOut: false });
  assert.equal(failed.uncertain.length, 0);
  const retried = f.run<Run>(['resume', '--retry', '--json']).report;
  assert.match(retried.reason, /OPERATION_SCOPE/);
  assert.equal(retried.operations.length, 1);
});

test('observation preserves explicit directory scope, ignored descendants and the limit for unlisted ignored siblings', async t => {
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
  assert.deepEqual(Object.keys(started.observations[0]!.changes!), ['docs/old.md', 'docs/sub/new.md', 'docs/tool.sh']);
  writeFileSync(join(f.project.root, 'docs/sub/new.md'), 'Agent documentation');
  const request = f.run<Run>(['resume', '--json']).report.workRequest;
  const completed = f.assess(request!);
  assert.equal(completed.result.status, 0, completed.result.stdout);
  assert.deepEqual(completed.report.assessments[0]!.declarations[0]!.changedPaths, ['docs/sub/new.md']);
});

test('checks remain read-only even for ignored named targets and keep operation outcomes separate', async t => {
  const f = await fixture(t, `${prelude}
writeFileSync('new.md', input.operation.phase);
if (input.operation.phase === 'fixes') writeFileSync('.gitignore', 'new.md\\n');
${result}`, {
    docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: ['new.md', '.gitignore'], directories: [] }, fixes: [operation('prepare')], checks: [operation('verify')] },
  }, { '.gitignore': '' });
  const started = f.start().report;
  const failed = f.assess(started.workRequest!).report;
  assert.match(failed.reason, /CHECK_MUTATION.*docs\/verify.*new.md/);
  assert.equal(failed.assessments[0]!.declarations[0]!.status, 'satisfied');
  assert.equal(failed.operations[1]!.result!.status, 'passed');
  assert.deepEqual(failed.observations.at(-1)!.violations, ['new.md']);
  assert.equal(readFileSync(join(f.project.root, 'new.md'), 'utf8'), 'checks');
});

test('an exact declaration cannot redefine its installed content with its own fix', async t => {
  // One representative: verifyInstallation's branches are covered once, in adoption.test.ts.
  const f = await fixture(t, `${prelude}\nwriteFileSync('AGENTS.md', 'Corrupted');\n${result}`,
    { exact: { kind: 'file', target: 'AGENTS.md', exact: 'exact.md', fixes: [operation('prepare')] } });
  const failed = f.start().report;
  assert.match(failed.reason, /FINAL_INTEGRITY/);
  assert.equal(failed.operations[0]!.result!.status, 'changed');
  assert.deepEqual(failed.observations[0]!.violations, []);
  const retry = f.run<Run>(['resume', '--retry', '--json']).report;
  assert.match(retry.reason, /FINAL_INTEGRITY/);
  assert.equal(retry.operations.length, 1);
  assert.equal(f.run<Status>(['status', '--json']).report.lastComplete, null);
});

test('incomplete observations block author progression and preserve its definite outcome', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', Buffer.alloc(8 * 1024 * 1024 + 1));
${result}`);
  const failed = f.start().report;
  assert.match(failed.reason, /OBSERVATION_LIMIT/);
  assert.equal(failed.operations[0]!.result!.status, 'changed');
  assert.equal(failed.observations[0]!.after, undefined);
  assert.match(f.run<Run>(['resume', '--retry', '--json']).report.reason, /OBSERVATION_LIMIT/);
  writeFileSync(join(f.project.root, 'README.md'), 'Reconciled');
  const retry = f.run<Run>(['resume', '--retry', '--json']).report;
  assert.match(retry.reason, /OBSERVATION_LIMIT/);
  assert.equal(retry.observations[0]!.interrupted, undefined);
  assert.equal(retry.observations[0]!.operationIndex, 0);
  assert.equal(retry.operations[0]!.result!.status, 'changed');
  const abandoned = f.run<Run>(['abandon', '--json']).report;
  assert.equal(abandoned.abandoned, true);
  assert.ok(abandoned.uncertain.some((message: string) => message.includes('observation')));
});

test('retry records agent edits after rejected evidence before replay can overwrite them', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', 'Prepared');
${result}`);
  const started = f.start().report;
  const rejected = f.assess(started.workRequest!, 'blocked').report;
  assert.match(rejected.reason, /ASSESSMENT_BLOCKED/);
  writeFileSync(join(f.project.root, 'README.md'), 'Agent change after rejection');
  const retried = f.run<Run>(['resume', '--retry', '--json']).report;
  assert.equal(retried.phase, 'contextual');
  const complete = f.assess(retried.workRequest!);
  assert.equal(complete.result.status, 0, complete.result.stdout);
  assert.deepEqual(complete.report.assessments[0]!.declarations.map((entry: { changedPaths: string[] }) => entry.changedPaths), [[], ['README.md']]);
});

test('observation refuses unsafe named ancestors and stale assessments after observation settings change', async t => {
  const f = await fixture(t, `${prelude}\n${result}`, {
    docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: ['docs/new.md'], directories: [] } },
  });
  const started = f.start().report;
  writeFileSync(join(f.project.root, 'docs'), 'Unsafe non-directory ancestor');
  assert.match(f.run<Run>(['resume', '--json']).report.reason, /OBSERVATION_UNSAFE/);
  rmSync(join(f.project.root, 'docs'));
  git(f.project.root, 'config', 'core.filemode', 'false');
  assert.match(f.assess(started.workRequest!).report.reason, /STALE_ASSESSMENT/);
  assert.equal(f.run<Status>(['status', '--json']).report.lastComplete, null);
});


test('a gap between completed fixes is observed before another operation can accept a new baseline', async t => {
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
  const started = (JSON.parse(cli.run(f.startArgs, f.project.root, env).stdout) as Run);
  assert.match(started.reason, /ASSESSMENT_SCOPE.*OTHER.md/);
  assert.equal(started.operations.length, 1);
  assert.equal(readFileSync(join(f.project.root, 'OTHER.md'), 'utf8'), 'Changed between operations');
  // The recorded gap chains to the fix before it and preserves its delta and violation.
  const recorded = f.run<Status>(['status', '--json']).report.active!.observations;
  assert.deepEqual(recorded.map((interval: { phase: string }) => interval.phase), ['fixes', 'agent']);
  const [fix, gap] = recorded;
  assert.equal(gap!.before, fix!.after);
  assert.notEqual(gap!.after, gap!.before);
  assert.deepEqual(Object.keys(gap!.changes!), ['OTHER.md']);
  assert.notEqual((gap!.changes!['OTHER.md']!.before as FileObservation).sha256, (gap!.changes!['OTHER.md']!.after as FileObservation).sha256);
  assert.deepEqual(gap!.violations, ['OTHER.md']);
  const retried = f.run<Run>(['resume', '--retry', '--json']).report;
  assert.match(retried.reason, /ASSESSMENT_SCOPE.*OTHER.md/);
  assert.deepEqual(retried.observations[1], gap);
});

test('interrupted checks close their interval by retry and keep the observed mutation', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'checks') {
  writeFileSync('OTHER.md', 'Written by a check');
  process.kill(process.ppid, 'SIGKILL'); process.exit(0);
}
${result}`);
  const started = f.start().report;
  assert.equal(started.phase, 'contextual');
  const path = join(f.remote.support.root, 'assessment.json');
  const request = started.workRequest;
  writeFileSync(path, JSON.stringify({ format: 'repo-standards/assessment/v3',
    declarations: request!.declarations.map(({ id }: { id: string }) => ({ id, status: 'satisfied', explanation: 'Guidance applied.', evidence: ['Reviewed project content.'] })) }));
  assert.equal(cli.run(['resume', '--assessment', path, '--json'], f.project.root, f.env).signal, 'SIGKILL');
  const stopped = f.run<Status>(['status', '--json']).report.active;
  assert.equal(stopped!.observations.at(-1)!.phase, 'checks');
  assert.equal(stopped!.observations.at(-1)!.after, undefined);
  const retry = f.run<Run>(['resume', '--retry', '--json']).report;
  assert.match(retry.reason, /CHECK_MUTATION.*readme\/verify.*OTHER.md/);
  const check = retry.observations.find((interval: { phase: string }) => interval.phase === 'checks');
  assert.equal(check!.interrupted, true);
  assert.equal(check!.before, stopped!.observations.at(-1)!.before);
  assert.deepEqual(Object.keys(check!.changes!), ['OTHER.md']);
  assert.deepEqual(check!.violations, ['OTHER.md']);
  assert.equal(readFileSync(join(f.project.root, 'OTHER.md'), 'utf8'), 'Written by a check');
});

test('named ancestor deletion, root mode changes, and empty directories created by checks are observed', async t => {
  for (const [name, mutation, phase, code] of [
    ['ancestor', "rmSync('docs', {recursive:true});", 'fixes', 'OPERATION_SCOPE'],
    ['root', "chmodSync('.', 0o755);", 'fixes', 'OPERATION_SCOPE'],
    ['empty directory', "mkdirSync('unrelated');", 'checks', 'CHECK_MUTATION'],
  ]) await t.test(name, async st => {
    const f = await fixture(st, `${prelude}\nif (input.operation.phase === '${phase}') { ${mutation} }\n${result}`, {
      docs: { kind: 'repository', guidance: 'guide.md', targets: { paths: ['docs/new.md'], directories: [] },
        fixes: [operation('prepare')], checks: [operation('verify')] },
    });
    mkdirSync(join(f.project.root, 'docs'));
    const started = f.start().report;
    const failed = phase === 'checks' ? f.assess(started.workRequest!).report : started;
    assert.match(failed.reason, new RegExp(code!));
  });
});

test('verified restoration of an exact file leaves only its installation in the change set', async t => {
  const f = await fixture(t, `${prelude}
const marker = '.repo-standards/local/attempt';
if (!existsSync(marker)) { writeFileSync(marker, 'attempted'); writeFileSync('AGENTS.md', 'Corrupted'); }
${result}`, { exact: { kind: 'file', target: 'AGENTS.md', exact: 'exact.md', fixes: [operation('prepare')] } });
  const restoreAndRetry = (started: { report: { reason: string } }, installed = 'Expected instructions') => {
    assert.match(started.report.reason, /FINAL_INTEGRITY/);
    writeFileSync(join(f.project.root, 'AGENTS.md'), installed);
    const retry = f.run<Run>(['resume', '--retry', '--json']);
    assert.equal(retry.result.status, 0, retry.result.stdout);
    assert.ok(retry.report.observations.some((interval: { restoredExact?: object }) => interval.restoredExact && 'AGENTS.md' in interval.restoredExact));
    return f.run<Status>(['status', '--json']).report.changeSet;
  };
  // Initial adoption installs the file; the corrupting fix it undid is not listed.
  assert.deepEqual(restoreAndRetry(f.start()), [
    ...[...cli.systemSkillFiles, ...cli.systemSkillLinks].map(path => ({ path, phases: ['installation'] })),
    { path: 'AGENTS.md', phases: ['installation'] },
  ]);
  // An update that leaves the file as installed lists nothing for it.
  const update = (version: string) => {
    commit(f.project.root);
    rmSync(join(f.project.root, '.repo-standards/local/attempt'));
    const args = versionArgs(version);
    return f.run<Run>(startArgs(f.run<Inspection>(args).report.identity, args));
  };
  assert.deepEqual(restoreAndRetry(update('v1.0.0')), []);
  // An update that installs new content lists it as installed only.
  f.remote.addVersion('v1.1.0', readFileSync(join(f.remote.source.root, 'standards.yaml'), 'utf8'), { 'exact.md': 'Revised instructions' });
  assert.deepEqual(restoreAndRetry(update('v1.1.0'), 'Revised instructions'), [{ path: 'AGENTS.md', phases: ['installation'] }]);
});

test('retry restores complete exact skill inventories and their necessary directories', async t => {
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
    const retry = f.run<Run>(['resume', '--retry', '--json']);
    assert.equal(retry.result.status, 0, retry.report.reason);
    assert.equal(readFileSync(join(f.project.root, '.agents/skills/review/SKILL.md'), 'utf8'), '# Review');
    assert.ok(Object.keys(retry.report.observations[1]!.restoredBoundaries!).includes(mode === 'removed' ? '.agents/skills/review' : '.agents/skills/review/unexpected'));
    // Restored and removed resources leave only the installed skill in the change set.
    assert.deepEqual(f.run<Status>(['status', '--json']).report.changeSet!.map((entry: { path: string; phases: string[] }) => `${entry.path} ${entry.phases.join(',')}`),
      [...cli.systemSkillFiles, ...cli.systemSkillLinks, '.agents/skills/review/SKILL.md', '.claude/skills/review'].sort().map(path => `${path} installation`));
  });
});

test('exact skill integrity includes empty directories during execution, recovery and retained inspection', async t => {
  const f = await fixture(t, `${prelude}
const marker = '.repo-standards/local/attempt';
if (!existsSync(marker)) { writeFileSync(marker, 'attempted'); mkdirSync('.agents/skills/review/empty'); }
${result}`, { review: { kind: 'skill', name: 'review', source: 'skill', fixes: [operation('prepare')] } });
  const failed = f.start().report;
  assert.match(failed.reason, /FINAL_INTEGRITY.*Skill inventory/);
  assert.equal(failed.operations[0]!.result!.status, 'changed');
  assert.deepEqual(failed.observations[0]!.violations, []);
  assert.match(f.run<Run>(['resume', '--retry', '--json']).report.reason, /FINAL_INTEGRITY/);
  rmSync(join(f.project.root, '.agents/skills/review/empty'), { recursive: true });
  const recovered = f.run<Run>(['resume', '--retry', '--json']);
  assert.equal(recovered.result.status, 0, recovered.result.stdout);
  mkdirSync(join(f.project.root, '.agents/skills/review/another-empty'));
  const retained = f.run<Inspection>(['inspect', '--json']).report;
  assert.ok(retained.start.blockers.some((blocker) => blocker.code === 'UNTRACKED_REPLACEMENT' && blocker.path === '.agents/skills/review/another-empty'));
  assert.deepEqual(retained.discardedEdits, ['.agents/skills/review']);
});

test('durable product directories are protected while generated local and cache directories are permitted', async t => {
  // One representative per phase that author code runs in.
  for (const target of ['inputs/unexpected', 'runtime/unexpected']) await t.test(target, async st => {
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
    const failed = phase === 'checks' ? f.assess(started.workRequest!).report : started;
    assert.match(failed.reason, /FINAL_INTEGRITY.*product state inventory/);
    assert.equal(failed.operations.at(-1)!.result!.status, phase === 'checks' ? 'passed' : 'changed');
    assert.match(f.run<Run>(['resume', '--retry', '--json']).report.reason, /FINAL_INTEGRITY/);
    rmSync(join(f.project.root, '.repo-standards', target), { recursive: true });
    const retry = f.run<Run>(['resume', '--retry', '--json']).report;
    assert.equal(retry.phase, 'contextual', retry.reason);
    assert.equal(f.assess(retry.workRequest!).result.status, 0);
    mkdirSync(join(f.project.root, '.repo-standards', target));
    const retained = f.run<Inspection>(['inspect', '--json']).report;
    assert.ok(retained.start.blockers.some((blocker) => blocker.code === 'STATE_INTEGRITY' && blocker.path === '.repo-standards'));
  });
});

test('run records and completion keep work evidence as identities and deltas', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('README.md', 'Prepared');
${result}`);
  const started = f.start().report;
  assert.equal(started.phase, 'contextual');
  assertCompactRunRecord(started, 'start report');
  // A run record that carries an observation map fails integrity validation.
  const journal = join(f.project.root, '.git/repo-standards-run.lock');
  const recorded = readFileSync(journal, 'utf8');
  const record = (JSON.parse(recorded) as Run);
  assertCompactRunRecord(record, 'journal');
  // Beside the journal, the run keeps only the one observation its last interval ends at.
  const observations = () => readdirSync(join(f.project.root, '.git')).filter(name => name.startsWith('repo-standards-run.lock.observation.'));
  assert.deepEqual(observations(), [`repo-standards-run.lock.observation.${record.observations.at(-1)!.before.slice('sha256:'.length)}`]);
  // Losing that observation is reported by status and blocks recovery until it is restored.
  const kept = join(f.project.root, '.git', observations()[0]!);
  const keptBytes = readFileSync(kept);
  const mirror = join(f.project.root, '.repo-standards/local/run.json');
  const mirrored = readFileSync(mirror);
  writeFileSync(kept, '{}');
  assert.ok(f.run<Status>(['status', '--json']).report.active!.uncertain.some((message: string) => message.includes('observation the run last recorded changed')));
  rmSync(kept);
  assert.ok(f.run<Status>(['status', '--json']).report.active!.uncertain.some((message: string) => message.includes('observation the run last recorded cannot be read')));
  assert.match(f.run<Run>(['resume', '--json']).report.reason, /STATE_INTEGRITY.*observation the run last recorded cannot be read/);
  writeFileSync(kept, keptBytes);
  writeFileSync(journal, recorded);
  writeFileSync(mirror, mirrored);
  writeFileSync(journal, JSON.stringify({ ...record, observations: record.observations.map((interval: object) => ({ ...interval, before: { files: {} } })) }));
  for (const command of [['status'], ['resume']]) assert.equal(f.run<ErrorReport>([...command, '--json']).report.errors[0]!.code, 'STATE_INTEGRITY', command[0]);
  writeFileSync(journal, recorded);
  writeFileSync(join(f.project.root, 'OTHER.md'), 'Agent documentation');
  const refreshed = f.run<Run>(['resume', '--json']).report;
  const completed = f.assess(refreshed.workRequest!);
  assert.equal(completed.result.status, 0, completed.result.stdout);

  const state = committedState(f.project.root);
  assertCompactWorkEvidence(state);
  const intervals = state.observations!;
  assert.deepEqual(intervals.filter(interval => interval.operation)
    .map(interval => `${interval.phase}:${interval.operation!.declaration}/${interval.operation!.id}:${interval.operationIndex}`),
  ['fixes:readme/prepare:0', 'checks:readme/verify:1']);
  assert.ok(intervals.some(interval => interval.phase === 'agent'));
  const fix = intervals.find(interval => interval.operation?.id === 'prepare')!;
  assert.deepEqual(Object.keys(fix.changes!), ['README.md']);
  assert.equal((fix.changes!['README.md']!.before as FileState).type, 'file');
  assert.equal((fix.changes!['README.md']!.after as FileState).type, 'file');
  assert.notEqual((fix.changes!['README.md']!.before as FileObservation).sha256, (fix.changes!['README.md']!.after as FileObservation).sha256);
  assert.deepEqual(fix.boundaryChanges, {});
  assert.deepEqual(fix.violations, []);
  assert.deepEqual(fix.scope, { readme: { paths: ['README.md'], directories: [] } });
  const agent = intervals.find(interval => interval.phase === 'agent' && Object.hasOwn(interval.changes ?? {}, 'OTHER.md'))!;
  assert.equal((agent.changes!['OTHER.md']!.after as FileState).type, 'file');
  // Adjacent intervals chain, so the committed identities remain tamper-evident.
  for (const [index, interval] of intervals.entries()) if (index) assert.equal(interval.before, intervals[index - 1]!.after);

  // The local run report records the same intervals committed state carries.
  const report = localRunReport(f.project.root);
  assertCompactRunRecord(report, 'local run report');
  assert.deepEqual(report.observations, intervals);
  assert.equal(existsSync(journal), false);
  assert.deepEqual(observations(), []);

  const status = f.run<Status>(['status', '--json']).report;
  assert.deepEqual(status.observations, intervals);
  // A project that never discovered scope retains no scope evidence to report.
  assert.equal(Object.hasOwn(status, 'scopeChanges'), false);
});

test('work evidence records an ignore input change by its role and content state, never its location', async t => {
  const f = await fixture(t, `${prelude}
if (input.operation.phase === 'fixes') writeFileSync('.git/info/exclude', '# changed by a fix\\n');
${result}`);
  const exclude = join(f.project.root, '.git/info/exclude');
  const original = readFileSync(exclude);
  // Git's template decides the input's mode; the fix rewrites only its bytes.
  const executable = (statSync(exclude).mode & 0o111) !== 0;
  const started = f.start();
  assert.equal(started.result.status, 1, started.result.stdout);
  assert.match(started.report.reason, /@ignore\/info/);
  const interval = localRunReport(f.project.root).observations.find(entry => entry.changes && Object.hasOwn(entry.changes, '@ignore/info'));
  assert.ok(interval, 'the run records the ignore input change');
  assert.deepEqual(interval.changes!['@ignore/info'], {
    before: { type: 'file', sha256: sha256(original), executable },
    after: { type: 'file', sha256: sha256('# changed by a fix\n'), executable },
  });
  assert.ok(!JSON.stringify(interval).includes(f.project.root), 'the delta must not name a checkout location');
});
