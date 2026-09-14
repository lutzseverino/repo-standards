import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve('contextual-public-updates');
const project = '/tmp/repo-standards-source-xL9AFg';
const external = '/tmp/repo-standards-public-agent-F559Ph';
mkdirSync(output, { recursive: true });
mkdirSync(external, { recursive: true });
for (const name of ['empty.npmrc', 'global.npmrc']) writeFileSync(`${external}/${name}`, '');
const env = {
  ...process.env,
  npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_userconfig: `${external}/empty.npmrc`,
  npm_config_globalconfig: `${external}/global.npmrc`,
  npm_config_cache: `${external}/npm-cache`,
  XDG_CACHE_HOME: `${external}/cache`,
};
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (options.record) {
    writeFileSync(`${output}/${options.record}.stdout`, result.stdout ?? '');
    writeFileSync(`${output}/${options.record}.stderr`, result.stderr ?? '');
    writeFileSync(`${output}/${options.record}.exit`, `${result.status ?? 1}\n`);
  }
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}
function cli(record, args, local = false) {
  const bridgeArgs = ['acceptance/cli.ts', resolve('acceptance/results/2026-09-14/contextual-scope-release/agents/public-updates/session.json')];
  if (local) bridgeArgs.push('--local');
  bridgeArgs.push(...args, '--json');
  return JSON.parse(run('node', bridgeArgs, { record }));
}
function assertInspection(report, update, cliVersion, standardsVersion, standardsCommit) {
  assert.equal(report.update, update);
  assert.equal(report.selection.cli.version, cliVersion);
  assert.equal(report.selection.standards.repository, 'https://github.com/lutzseverino/repo-standards-example');
  assert.equal(report.selection.standards.version, standardsVersion);
  assert.equal(report.selection.standards.commit, standardsCommit);
  assert.equal(report.selection.profile, 'service');
  assert.deepEqual(report.resolved.declarations.find(({ id }) => id === 'operations-guide').targets.paths,
    ['docs/operations.md', 'docs/operating-status.json']);
  assert.equal(report.exact[0].target, '.editorconfig');
  assert.equal(report.exact[0].action, 'match');
  assert.deepEqual(report.start.blockers, []);
}
function assessment(refresh, phase) {
  const request = refresh.workRequest;
  assert.equal(request.declarations.length, 1);
  return {
    format: 'repo-standards/assessment/v1',
    run: request.run,
    selection: request.selection,
    snapshot: request.snapshot,
    declarations: [{
      id: 'operations-guide',
      status: 'satisfied',
      explanation: `The ${phase} preserved the source-grounded Harbor runbook and unverified deployment status; current source, health-probe, recovery, ownership, and restart-loss evidence remain complete and no contextual file required an edit.`,
      changedPaths: [],
      evidence: [
        'docs/operations.md records the exact Python startup command, loopback address, GET /health response, failure signals, restart data loss, unsupported recovery boundary, warning, and platform on-call owner.',
        'docs/operating-status.json remains {"status":"unverified"}; neither update claims deployment verification.',
        'The previous completed public v1 adoption recorded local startup, health, accept-counter, 404, and restart observations; these updates change retained standards or CLI identity, not that project behavior.',
      ],
    }],
  };
}

run('git', ['clone', resolve('acceptance/tmp-contextual-update/harbor.bundle'), project], { record: '00-clone' });
writeFileSync(`${external}/package.json`, JSON.stringify({ private: true, dependencies: { '@lutzseverino/repo-standards': '1.1.0' } }, null, 2) + '\n');
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: external, record: '01-install-cli-1.1.0' });
run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: `${project}/.repo-standards/runtime`, record: '02-restore-runtime' });

const standardsInspection = cli('03-standards-inspection', ['inspect', '--source', 'https://github.com/lutzseverino/repo-standards-example', '--standards-version', 'v1.1.0', '--profile', 'service']);
assertInspection(standardsInspection, 'standards', '1.1.0', 'v1.1.0', 'fa6e4bc16640e320e6d06496a910cdccb23d9223');
writeFileSync(`${output}/04-standards-confirmation.txt`, `The evaluator pre-authorized this isolated runner to confirm only after the script asserted the complete selection, profile, exact target, contextual targets, and zero blockers. I explicitly confirm inspection ${standardsInspection.identity}: CLI 1.1.0 held fixed and public standards updated to v1.1.0 at fa6e4bc16640e320e6d06496a910cdccb23d9223, with the disclosed exact content and trusted operations.\n`);
cli('05-standards-start', ['start', '--source', 'https://github.com/lutzseverino/repo-standards-example', '--standards-version', 'v1.1.0', '--profile', 'service', '--confirm', standardsInspection.identity]);
const standardsRefresh = cli('06-standards-refresh', ['resume'], true);
writeFileSync(`${output}/07-standards-assessment.json`, JSON.stringify(assessment(standardsRefresh, 'standards update'), null, 2) + '\n');
cli('08-standards-completion', ['resume', '--assessment', `${output}/07-standards-assessment.json`], true);
cli('09-standards-status', ['status'], true);
run('git', ['add', '-A'], { cwd: project });
run('git', ['-c', 'user.name=Contextual Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '-m', 'Update standards to v1.1.0'], { cwd: project, record: '10-standards-commit' });

writeFileSync(`${external}/package.json`, JSON.stringify({ private: true, dependencies: { '@lutzseverino/repo-standards': '1.2.0' } }, null, 2) + '\n');
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: external, record: '11-install-cli-1.2.0' });
const cliInspection = cli('12-cli-inspection', ['inspect']);
assertInspection(cliInspection, 'cli', '1.2.0', 'v1.1.0', 'fa6e4bc16640e320e6d06496a910cdccb23d9223');
writeFileSync(`${output}/13-cli-confirmation.txt`, `The evaluator pre-authorized this isolated runner to confirm only after the script asserted the complete retained selection, profile, exact target, contextual targets, and zero blockers. I explicitly confirm inspection ${cliInspection.identity}: public CLI updated independently to 1.2.0 while standards v1.1.0 remained fixed, with the disclosed exact content and trusted operations.\n`);
cli('14-cli-start', ['start', '--confirm', cliInspection.identity]);
const cliRefresh = cli('15-cli-refresh', ['resume'], true);
writeFileSync(`${output}/16-cli-assessment.json`, JSON.stringify(assessment(cliRefresh, 'CLI update'), null, 2) + '\n');
cli('17-cli-completion', ['resume', '--assessment', `${output}/16-cli-assessment.json`], true);
cli('18-cli-status', ['status'], true);
run('git', ['add', '-A'], { cwd: project });
run('git', ['-c', 'user.name=Contextual Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '-m', 'Update Repo Standards CLI to 1.2.0'], { cwd: project, record: '19-cli-commit' });
run('git', ['status', '--porcelain=v2'], { cwd: project, record: '20-final-status' });
run('git', ['log', '--oneline', '-3'], { cwd: project, record: '21-final-log' });
run('git', ['show', '--stat', '--oneline', 'HEAD~2..HEAD'], { cwd: project, record: '22-update-stat' });
writeFileSync(`${output}/summary.json`, JSON.stringify({
  format: 'repo-standards/contextual-public-updates/v1',
  runner: process.env.RUNNER_OS,
  packageRegistry: 'https://registry.npmjs.org/',
  source: 'https://github.com/lutzseverino/repo-standards-example',
  initialCommit: 'c972ed96306853d20b23537b8b97d5cc5267ec8e',
  standards: { from: 'v1.0.0', to: 'v1.1.0', inspection: standardsInspection.identity },
  cli: { from: '1.1.0', to: '1.2.0', inspection: cliInspection.identity },
  finalHead: run('git', ['rev-parse', 'HEAD'], { cwd: project }).trim(),
  clean: run('git', ['status', '--porcelain'], { cwd: project }).trim() === '',
}, null, 2) + '\n');
