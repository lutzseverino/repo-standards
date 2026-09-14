import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve('acceptance/sources/wayfinder/operations/service-evidence.mjs');

test('Wayfinder service evidence handles repository-root and nested targets', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'wayfinder-operation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'services/relay'), { recursive: true });
  const paths = ['operations.md', 'operating-status.json', 'services/relay/operations.md', 'services/relay/operating-status.json'];

  function run(phase: 'fixes' | 'checks') {
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      input: JSON.stringify({ operation: { phase }, allowedTargets: { paths, directories: [] } }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout);
  }

  const fixed = run('fixes');
  assert.equal(fixed.status, 'changed');
  for (const path of ['operating-status.json', 'services/relay/operating-status.json']) {
    assert.equal(JSON.parse(readFileSync(join(root, path), 'utf8')).startup, 'unverified');
  }

  const runbook = '# Operations\n\n## Startup\nCommand.\n\n## Health\nProbe.\n\n## Recovery\nRestart.\n\n## Known limitations\nLocal only.\n';
  writeFileSync(join(root, 'operations.md'), runbook);
  writeFileSync(join(root, 'services/relay/operations.md'), runbook);
  assert.equal(run('checks').status, 'passed');
  assert.equal(run('fixes').status, 'unchanged');
});
