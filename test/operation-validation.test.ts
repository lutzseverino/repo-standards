import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stringify } from 'yaml';
import { installCli, sourceFixture } from './installed-cli.ts';

const cli = installCli();
after(() => cli.close());

function operationSource(executables: string[], arguments_: string[] = []) {
  return sourceFixture(stringify({
    format: 'repo-standards/v1', name: 'operations', description: 'Operation validation',
    requires: { 'repo-standards': '>=1.0.0 <2.0.0' },
    defaults: { declarations: { readme: {
      kind: 'file', target: 'README.md', guidance: 'guidance.md',
      checks: executables.map((executable, index) => ({
        id: `check-${index}`,
        run: { executable, script: 'check.js', resources: [], arguments: arguments_ },
        prerequisite: { 'version-arguments': ['--version'], version: '>=1.0.0' },
        'timeout-seconds': 5,
      })),
    } } },
    profiles: { personal: { description: 'Personal', declarations: {} } },
  }), { 'guidance.md': 'Improve the README.', 'check.js': 'Author code must not be executed.' });
}

test('executable syntax accepts command names and paths without resolving or rewriting them', (t) => {
  const names = ['python3', 'node-24', 'clang++', 'my_tool.v2', '.wrapper',
    '/usr/bin/python3', './probe', '../tools/probe', 'tools/../probe', './-wrapper', 'tool-that-is-not-installed'];
  const source = operationSource(names);
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const checks = JSON.parse(result.stdout).profiles.personal.declarations[0].checks;
  assert.deepEqual(checks.map((check: { run: { executable: string } }) => check.run.executable), names);
});

test('executable syntax rejects shell expressions, controls and malformed executable paths consistently', (t) => {
  const names = ['python*', 'node?', 'node[12]', 'node{1,2}', 'node;echo', 'node|cat', 'node&',
    'node>out', 'node<in', '$(node)', '`node`', '$NODE', '~/node', '(node)', '!node', '#node',
    '"node"', "'node'", 'node\\24', 'node --eval', 'node\t', 'node\n', 'node\u007f', 'node\u0080', 'node\u009f',
    'nöde', 'node@24', '-node', '/', '.', '..', 'bin/', 'bin/.', 'bin/..', 'bin//node', '//usr/bin/node'];
  const source = operationSource(names);
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.profiles, {});
  for (let index = 0; index < names.length; index++) {
    assert.ok(report.errors.some((error: { code: string; path: string }) =>
      error.code === 'INVALID_EXECUTABLE' && error.path === `/defaults/declarations/readme/checks/${index}/run/executable`),
    `Missing INVALID_EXECUTABLE for ${JSON.stringify(names[index])}`);
  }
});

test('executable character restrictions do not apply to literal arguments', (t) => {
  const arguments_ = ['python*', 'node?', 'file[12]', '{one,two}', '$(touch SENTINEL)', 'two words', '', 'café', 'a\nline'];
  const source = operationSource(['node'], arguments_);
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).profiles.personal.declarations[0].checks[0].run.arguments, arguments_);
});
