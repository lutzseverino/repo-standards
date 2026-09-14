import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commit, git, remoteFixture } from '../../../../test/remote-fixture.ts';
import { sourceFixture } from '../../../../test/installed-cli.ts';

const version = '1.2.1';
const packageName = '@lutzseverino/repo-standards';
const output = dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'repo-standards-published-1.2.1-'));
const cliRoot = join(work, 'cli');
let cli;
mkdirSync(cliRoot);

const source = `format: repo-standards/v2
name: growing-projects
description: Documentation for maintained projects
requires:
  repo-standards: ">=1 <2"
defaults:
  declarations:
    docs:
      kind: repository
      guidance: guidance.md
      discovery: discovery.md
    instructions:
      kind: file
      target: AGENTS.md
      exact: agents.md
profiles:
  work:
    description: Work
    declarations: {}
`;

const commandRecords = [];
function record(name, command, result) {
  const prefix = join(output, name);
  writeFileSync(`${prefix}.stdout`, result.stdout ?? '');
  writeFileSync(`${prefix}.stderr`, result.stderr ?? '');
  writeFileSync(`${prefix}.exit`, `${result.status}\n`);
  commandRecords.push({
    name,
    command: command.map(value => JSON.stringify(value)).join(' '),
    exit: result.status,
    stdout: basename(`${prefix}.stdout`),
    stderr: basename(`${prefix}.stderr`),
  });
}

function runCli(name, args, cwd, env) {
  const command = [cli, ...args];
  const result = spawnSync(cli, args, { cwd, env, encoding: 'utf8' });
  record(name, command, result);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${name} did not return JSON (exit ${result.status}): ${result.stdout}${result.stderr}`);
  }
  return { result, report };
}

function writeJson(name, value) {
  writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`);
}

function proposal(request, included, excluded = []) {
  const entries = request.discovery.evidence;
  const evidenceFor = path => {
    const entry = entries.find(candidate => candidate.kind === 'file' && candidate.path === path);
    assert.ok(entry, `missing discovery evidence for ${path}`);
    return entry;
  };
  const all = [...included, ...excluded];
  return {
    format: 'repo-standards/scope/v1',
    request: request.discovery.identity,
    declarations: [{
      id: 'docs',
      paths: included,
      coverage: 'Included current maintained projects and explained projects that no longer meet the retained criteria.',
      evidence: all.map(evidenceFor),
      candidates: [
        ...included.map(path => ({
          path,
          decision: 'include',
          reason: 'This is a maintained project README.',
          evidence: [evidenceFor(path)],
        })),
        ...excluded.map(path => ({
          path,
          decision: 'exclude',
          reason: 'This project is no longer maintained, so its content remains project-owned.',
          evidence: [evidenceFor(path)],
        })),
      ],
      unresolved: [],
    }],
  };
}

function complete(prefix, started, cwd, env) {
  const request = started.workRequest;
  const scopeValidity = {
    status: 'valid',
    explanation: 'The confirmed projects still match the discovery criteria.',
    evidence: ['Reviewed every confirmed project README.'],
    additionalPaths: [],
  };
  const assessment = {
    format: 'repo-standards/assessment/v2',
    run: request.run,
    selection: request.selection,
    snapshot: request.snapshot,
    scope: { inspection: request.scope.inspection, afterFixes: request.scope.afterFixes },
    declarations: [{
      id: 'docs',
      status: 'satisfied',
      explanation: 'The existing README content satisfies the focused fixture guidance.',
      changedPaths: [],
      evidence: ['Reviewed every confirmed README without changing project content.'],
      scopeValidity: { afterFixes: scopeValidity, current: scopeValidity },
    }],
  };
  const assessmentPath = join(work, `${prefix}-assessment.json`);
  writeJson(`${prefix}-assessment.json`, assessment);
  writeFileSync(assessmentPath, `${JSON.stringify(assessment, null, 2)}\n`);
  return runCli(`${prefix}-complete`, ['resume', '--assessment', assessmentPath, '--json'], cwd, env);
}

let remote;
let project;
try {
  const install = spawnSync('npm', [
    'install', '--prefix', cliRoot, '--ignore-scripts', '--no-audit', '--no-fund',
    `${packageName}@${version}`,
  ], { encoding: 'utf8' });
  record('00-public-install', ['npm', 'install', '--prefix', '<temporary-cli-root>', '--ignore-scripts', '--no-audit', '--no-fund', `${packageName}@${version}`], install);
  assert.equal(install.status, 0, install.stdout + install.stderr);

  cli = join(cliRoot, 'node_modules/.bin/repo-standards');
  const installedVersion = spawnSync(cli, ['--version'], { encoding: 'utf8' });
  record('01-cli-version', [cli, '--version'], installedVersion);
  assert.equal(installedVersion.status, 0);
  assert.match(installedVersion.stdout, /1\.2\.1/);

  const npmMetadata = JSON.parse(execFileSync('npm', [
    'view', `${packageName}@${version}`, 'name', 'version', 'dist.integrity', 'dist.tarball', '--json',
  ], { encoding: 'utf8' }));
  writeJson('npm.json', npmMetadata);
  const lock = JSON.parse(readFileSync(join(cliRoot, 'package-lock.json'), 'utf8'));
  const installed = lock.packages[`node_modules/${packageName}`];
  assert.equal(installed.version, version);
  assert.equal(installed.integrity, npmMetadata['dist.integrity']);

  remote = remoteFixture(source, {
    'guidance.md': 'Keep every maintained project README useful.',
    'discovery.md': 'Use project ownership and manifests; explain excluded former projects.',
    'agents.md': 'Pinned instructions\n',
  });
  project = sourceFixture('', {
    'apps/old/README.md': '# Old project\n',
    'apps/amended/README.md': '# Amended project\n',
  });
  commit(project.root);
  const env = { ...remote.env };
  const selection = ['--source', 'https://github.com/alice/standards', '--standards-version', 'v1.0.0', '--profile', 'work'];

  const firstRequest = runCli('02-run1-request', ['inspect', ...selection, '--json'], project.root, env).report;
  const firstProposal = proposal(firstRequest, ['apps/old/README.md']);
  const firstScope = join(work, 'run1-scope.json');
  writeFileSync(firstScope, `${JSON.stringify(firstProposal, null, 2)}\n`);
  writeJson('03-run1-scope.json', firstProposal);
  const firstInspection = runCli('04-run1-inspection', ['inspect', ...selection, '--scope', firstScope, '--json'], project.root, env).report;
  const firstStart = runCli('05-run1-start', ['start', ...selection, '--scope', firstScope, '--confirm', firstInspection.identity, '--json'], project.root, env);
  assert.equal(firstStart.result.status, 1);
  assert.equal(firstStart.report.phase, 'contextual');

  const amendmentRequest = runCli('06-run1-amendment-request', ['inspect', '--amend-scope', '--json'], project.root, env).report;
  const amendmentProposal = proposal(amendmentRequest, ['apps/old/README.md', 'apps/amended/README.md']);
  const amendmentScope = join(work, 'run1-amendment-scope.json');
  writeFileSync(amendmentScope, `${JSON.stringify(amendmentProposal, null, 2)}\n`);
  writeJson('07-run1-amendment-scope.json', amendmentProposal);
  const amendmentInspection = runCli('08-run1-amendment-inspection', ['inspect', '--amend-scope', '--scope', amendmentScope, '--json'], project.root, env).report;
  const amended = runCli('09-run1-amendment-accept', ['resume', '--amend-scope', '--scope', amendmentScope, '--confirm', amendmentInspection.identity, '--json'], project.root, env);
  assert.equal(amended.result.status, 1);
  assert.equal(amended.report.phase, 'contextual');
  const firstComplete = complete('10-run1', amended.report, project.root, env);
  assert.equal(firstComplete.result.status, 0, firstComplete.result.stdout + firstComplete.result.stderr);
  const firstState = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  writeJson('11-run1-state.json', firstState);
  assert.equal(firstState.scopeRevision, 1);
  assert.equal(firstState.amendments.length, 1);
  assert.equal(firstState.amendments[0].confirmation, amendmentInspection.identity);
  commit(project.root);

  mkdirSync(join(project.root, 'apps/new'), { recursive: true });
  writeFileSync(join(project.root, 'apps/new/README.md'), '# New project\n');
  commit(project.root);
  for (const key of Object.keys(remote.responses)) delete remote.responses[key];
  remote.save();

  const readoptRequest = runCli('12-run2-readopt-request', ['inspect', '--readopt', '--json'], project.root, env).report;
  const readoptProposal = proposal(readoptRequest, ['apps/new/README.md'], ['apps/old/README.md', 'apps/amended/README.md']);
  const readoptScope = join(work, 'run2-scope.json');
  writeFileSync(readoptScope, `${JSON.stringify(readoptProposal, null, 2)}\n`);
  writeJson('13-run2-scope.json', readoptProposal);
  const readoptInspection = runCli('14-run2-inspection', ['inspect', '--readopt', '--scope', readoptScope, '--json'], project.root, env).report;
  assert.deepEqual(readoptInspection.scopeChanges, [{
    id: 'docs',
    additions: ['apps/new/README.md'],
    removals: ['apps/amended/README.md', 'apps/old/README.md'],
  }]);
  const readoptStart = runCli('15-run2-start', ['start', '--readopt', '--scope', readoptScope, '--confirm', readoptInspection.identity, '--json'], project.root, env);
  assert.equal(readoptStart.result.status, 1);
  assert.equal(readoptStart.report.phase, 'contextual');
  const secondComplete = complete('16-run2', readoptStart.report, project.root, env);
  assert.equal(secondComplete.result.status, 0, secondComplete.result.stdout + secondComplete.result.stderr);
  const secondState = JSON.parse(readFileSync(join(project.root, '.repo-standards/state.json'), 'utf8'));
  writeJson('17-run2-state.json', secondState);
  assert.equal(secondState.history.length, 1);
  assert.equal(secondState.history[0].scopeRevision, firstState.scopeRevision);
  assert.deepEqual(secondState.history[0].amendments, firstState.amendments);
  assert.equal(readFileSync(join(project.root, 'apps/old/README.md'), 'utf8'), '# Old project\n');
  assert.equal(readFileSync(join(project.root, 'apps/amended/README.md'), 'utf8'), '# Amended project\n');
  commit(project.root);

  const retained = runCli('18-retained-inspection', ['inspect', '--json'], project.root, env).report;
  const status = runCli('19-status', ['status', '--json'], project.root, env).report;
  assert.equal(retained.historicalScope.format, 'repo-standards/scope-history/v2');
  assert.equal(retained.historicalScope.runs[0].scopeRevision, firstState.scopeRevision);
  assert.deepEqual(retained.historicalScope.runs[0].amendments, firstState.amendments);
  assert.equal(status.history[0].scopeRevision, firstState.scopeRevision);
  assert.deepEqual(status.history[0].amendments, firstState.amendments);

  const checkout = join(work, 'fresh-checkout');
  git(project.root, 'clone', '--quiet', project.root, checkout);
  const checkoutRetained = runCli('20-fresh-clone-inspection', ['inspect', '--json'], checkout, env).report;
  const checkoutStatus = runCli('21-fresh-clone-status', ['status', '--json'], checkout, env).report;
  assert.deepEqual(checkoutRetained.historicalScope.runs[0].amendments, firstState.amendments);
  assert.equal(checkoutRetained.historicalScope.runs[0].scopeRevision, firstState.scopeRevision);
  assert.deepEqual(checkoutStatus.history[0].amendments, firstState.amendments);
  assert.equal(checkoutStatus.history[0].scopeRevision, firstState.scopeRevision);

  const summary = {
    format: 'repo-standards/published-regression/v1',
    evidence: 'scripted public-package/fixture-source regression',
    package: {
      name: packageName,
      version,
      integrity: npmMetadata['dist.integrity'],
      tarball: npmMetadata['dist.tarball'],
    },
    source: {
      acquisition: 'deterministic GitHub HTTPS fixture',
      repository: 'https://github.com/alice/standards',
      version: 'v1.0.0',
    },
    runs: {
      first: {
        inspection: firstInspection.identity,
        amendment: amendmentInspection.identity,
        complete: firstComplete.report.id,
        scopeRevision: firstState.scopeRevision,
        amendmentCount: firstState.amendments.length,
      },
      second: {
        inspection: readoptInspection.identity,
        complete: secondComplete.report.id,
        historyCount: secondState.history.length,
      },
    },
    assertions: {
      publicPackageIntegrityMatchedInstallLock: true,
      run1WasAmended: true,
      run2WasSamePinReadoption: true,
      run1ScopeRevisionRetainedAfterRun2: true,
      run1AmendmentsRetainedAfterRun2: true,
      retainedInspectionExposedAmendmentHistory: true,
      statusExposedExecutionHistory: true,
      removedScopeContentWasPreserved: true,
      freshCloneRetainedRun1AmendmentHistory: true,
      sourceWasUnavailableForRun2AndFreshClone: true,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      git: execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(),
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    },
    commands: commandRecords,
  };
  writeJson('summary.json', summary);
  writeFileSync(join(output, 'SHA256SUMS'), Object.entries({
    'summary.json': readFileSync(join(output, 'summary.json')),
    '11-run1-state.json': readFileSync(join(output, '11-run1-state.json')),
    '17-run2-state.json': readFileSync(join(output, '17-run2-state.json')),
    '18-retained-inspection.stdout': readFileSync(join(output, '18-retained-inspection.stdout')),
    '19-status.stdout': readFileSync(join(output, '19-status.stdout')),
    '20-fresh-clone-inspection.stdout': readFileSync(join(output, '20-fresh-clone-inspection.stdout')),
    '21-fresh-clone-status.stdout': readFileSync(join(output, '21-fresh-clone-status.stdout')),
  }).map(([name, bytes]) => `${createHash('sha256').update(bytes).digest('hex')}  ${name}`).join('\n') + '\n');
} finally {
  remote?.close();
  project?.close();
  rmSync(work, { recursive: true, force: true });
}
