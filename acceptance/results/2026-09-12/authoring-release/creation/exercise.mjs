import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const base = path.resolve('evidence');
const source = path.resolve('local-standards');
const validated = JSON.parse(fs.readFileSync(path.join(base, 'validation-draft.json')));
assert.equal(validated.valid, true);
const records = [];
const root = fs.mkdtempSync(path.join(base, 'disposable-'));
const retained = path.join(root, 'retained-source');
fs.mkdirSync(retained);
const inventory = dir => {
  const out = {};
  function walk(rel = '') {
    for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
      const target = path.join(rel, name);
      const stat = fs.lstatSync(path.join(dir, target));
      out[target] = { mode: stat.mode & 0o7777, type: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file' };
      if (stat.isSymbolicLink()) out[target].link = fs.readlinkSync(path.join(dir, target));
      else if (stat.isDirectory()) walk(target);
      else out[target].bytes = fs.readFileSync(path.join(dir, target)).toString('base64');
    }
  }
  walk(); return out;
};
const capture = run => ({exitCode: run.status, signal: run.signal, error: run.error?.code ?? null, stdout: run.stdout ?? '', stderr: run.stderr ?? ''});
for (const [profile, resolved] of Object.entries(validated.profiles)) {
  const owner = resolved.declarations.find(d => d.id === 'notes-newline');
  assert.ok(owner);
  if (profile === 'team-services') assert.ok(!resolved.declarations.some(d => d.id === 'contributing'));
  for (const phase of ['checks', 'fixes']) for (const op of owner[phase]) {
    const destination = path.join(retained, op.run.script);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(path.join(source, op.run.script), destination);
    assert.deepEqual(op.run.resources, []);
  }
  const fixture = path.join(root, profile);
  fs.mkdirSync(path.join(fixture, 'docs'), {recursive: true});
  fs.writeFileSync(path.join(fixture, 'sentinel.bin'), Buffer.from([0, 255, 10, 88]));
  fs.writeFileSync(path.join(fixture, 'CONTRIBUTING.md'), 'Employer or project instructions: preserve exactly.');
  fs.writeFileSync(path.join(fixture, 'docs/runbook.md'), 'Restart limits remain project-owned.');
  const target = path.join(fixture, 'docs/notes.md');
  const invoke = (phase, label, expected, alter = () => {}) => {
    const op = owner[phase][0];
    const probe = spawnSync(op.run.executable, op.prerequisite['version-arguments'], {
      cwd: fixture, encoding: 'utf8', timeout: op['timeout-seconds'] * 1000, maxBuffer: 1024 * 1024, shell: false
    });
    assert.equal(probe.status, 0);
    const observed = (probe.stdout + '\n' + probe.stderr).match(/v?(\d+)\.(\d+)\.(\d+)/);
    assert.equal(observed?.[1], '24');
    assert.equal(op.prerequisite.version, '>=24.0.0 <25.0.0');
    const request = {
      format: 'repo-standards/operation/v1',
      operation: {declaration: owner.id, phase, id: op.id},
      projectRoot: fixture,
      standards: {repository: 'https://github.com/synthetic-author/fixture-standards', version: 'v0.0.0-fixture', commit: '0'.repeat(40)},
      profile, declarations: resolved.declarations,
      allowedTargets: {paths: [owner.target], directories: []}
    };
    alter(request);
    const before = inventory(fixture);
    const argv = [path.join(retained, op.run.script), ...op.run.arguments];
    const proc = spawnSync(op.run.executable, argv, {cwd: fixture, input: JSON.stringify(request), encoding: 'utf8', timeout: op['timeout-seconds'] * 1000, maxBuffer: 1024 * 1024, shell: false});
    const after = inventory(fixture);
    assert.equal(proc.status, 0);
    const result = JSON.parse(proc.stdout);
    assert.deepEqual(Object.keys(result).sort(), ['format', 'message', 'status']);
    assert.equal(result.format, 'repo-standards/result/v1');
    assert.equal(typeof result.message, 'string');
    assert.equal(result.status, expected);
    if (expected !== 'changed') assert.deepEqual(after, before);
    else {
      assert.deepEqual(Object.keys(after), Object.keys(before));
      for (const name of Object.keys(before)) {
        if (name !== 'docs/notes.md') assert.deepEqual(after[name], before[name]);
        else {
          assert.equal(after[name].mode, before[name].mode);
          assert.equal(after[name].bytes, Buffer.concat([Buffer.from(before[name].bytes, 'base64'), Buffer.from([10])]).toString('base64'));
        }
      }
    }
    records.push({profile, label, prerequisite: {command: [op.run.executable, ...op.prerequisite['version-arguments']], declaredRange: op.prerequisite.version, observed: observed[0], ...capture(probe)}, command: [op.run.executable, ...argv], request, process: capture(proc), result, before, after, comparisonPassed: true});
  };
  fs.writeFileSync(target, Buffer.from('First\r\nlast\r'));
  fs.chmodSync(target, 0o640);
  invoke('checks', 'violating read-only check', 'failed');
  invoke('fixes', 'repair with original CRLF and mode preserved', 'changed');
  invoke('fixes', 'repeated repair', 'unchanged');
  invoke('checks', 'repaired read-only check', 'passed');
  fs.writeFileSync(target, '');
  invoke('checks', 'empty read-only check', 'failed');
  invoke('fixes', 'empty-file repair', 'changed');
  invoke('fixes', 'empty-file repeated repair', 'unchanged');
  invoke('checks', 'empty-file repaired check', 'passed');
  invoke('checks', 'scope mismatch check', 'blocked', req => req.allowedTargets.paths = ['other.md']);
  invoke('fixes', 'scope mismatch fix', 'blocked', req => req.allowedTargets.paths = ['other.md']);
  fs.unlinkSync(target);
  invoke('checks', 'missing-file check', 'blocked');
  invoke('fixes', 'missing-file fix never creates notes', 'blocked');
  fs.symlinkSync('../sentinel.bin', target);
  invoke('checks', 'symlink check', 'blocked');
  invoke('fixes', 'symlink fix', 'blocked');
  fs.unlinkSync(target);
  fs.mkdirSync(target);
  invoke('checks', 'nonregular check', 'blocked');
  invoke('fixes', 'nonregular fix', 'blocked');
  fs.rmdirSync(target);
  fs.renameSync(path.join(fixture, 'docs'), path.join(fixture, 'stored-docs'));
  fs.writeFileSync(path.join(fixture, 'stored-docs/notes.md'), 'Keep untouched');
  fs.symlinkSync('stored-docs', path.join(fixture, 'docs'));
  invoke('checks', 'symlinked directory check', 'blocked');
  invoke('fixes', 'symlinked directory fix', 'blocked');
  const emptyPath = path.join(root, 'empty-path-' + profile);
  fs.mkdirSync(emptyPath);
  for (const phase of ['checks', 'fixes']) {
    const op = owner[phase][0];
    const before = inventory(fixture);
    const probe = spawnSync(op.run.executable, op.prerequisite['version-arguments'], {cwd: fixture, env: {...process.env, PATH: emptyPath}, encoding: 'utf8', timeout: op['timeout-seconds'] * 1000, maxBuffer: 1024 * 1024, shell: false});
    assert.equal(probe.error?.code, 'ENOENT');
    assert.deepEqual(inventory(fixture), before);
    records.push({profile, label: 'unavailable Node prerequisite: ' + phase, command: [op.run.executable, ...op.prerequisite['version-arguments']], PATH: emptyPath, process: capture(probe), status: 'blocked', operationInvoked: false, installationAttempted: false, before, after: inventory(fixture)});
  }
}
fs.writeFileSync(path.join(base, 'operations.json'), JSON.stringify({node: process.version, validatedFrom: 'validation-draft.json', fixtureRoot: root, retainedSource: retained, syntheticProvenance: true, records}, null, 2) + '\n');
console.log(JSON.stringify({passed: true, profiles: Object.keys(validated.profiles), records: records.length, fixtureRoot: root}));
