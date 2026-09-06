import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { cpSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { installCli, sourceFixture } from './installed-cli.ts';

const cli = installCli();
after(() => cli.close());

const header = `format: repo-standards/v1
name: test-standards
description: Test standards
requires:
  repo-standards: ">=1.0.0 <2.0.0"
`;

test('validation preserves literal operations, never runs scripts or version probes, and leaves a dirty source unchanged', (t) => {
  const operation = `
          - id: probe
            run:
              executable: ./probe
              script: script.js
              resources: [resources, payload.json]
              arguments: ["", "two words", "$(touch SENTINEL)", "; touch SENTINEL", "*.md"]
            prerequisite:
              version-arguments: ["--version", "$(touch SENTINEL)"]
              version: ">=24.0.0 <25.0.0"
            timeout-seconds: 5`;
  const source = sourceFixture(header + `defaults:
  declarations:
    readme:
      kind: file
      target: README.md
      guidance: guidance.md
      checks:${operation}
      fixes:${operation.replace('id: probe', 'id: fix')}
profiles:
  personal:
    description: Personal
    declarations: {}
  excluded:
    description: Excluded
    declarations:
      readme:
        exclude: true
`, {
    'guidance.md': 'Improve the README for this project.',
    'probe': '#!/bin/sh\ntouch SENTINEL\necho 24.0.0\n',
    'script.js': 'require("node:fs").writeFileSync("SENTINEL", "ran");\n',
    'resources/data.txt': 'data', 'payload.json': '{}',
  });
  t.after(() => source.close());
  execFileSync('chmod', ['+x', join(source.root, 'probe')]);
  execFileSync('git', ['add', '.'], { cwd: source.root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture'], { cwd: source.root });
  writeFileSync(join(source.root, 'guidance.md'), 'Uncommitted contextual guidance.');
  writeFileSync(join(source.root, 'UNTRACKED'), 'untracked');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source.root, encoding: 'utf8' });
  const before = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: source.root, encoding: 'utf8' });
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.profiles.excluded.declarations, []);
  assert.deepEqual(report.profiles.personal.declarations[0].checks[0].run.arguments,
    ['', 'two words', '$(touch SENTINEL)', '; touch SENTINEL', '*.md']);
  assert.equal(execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: source.root, encoding: 'utf8' }), before);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source.root, encoding: 'utf8' }), head);
  assert.equal(readFileSync(join(source.root, 'guidance.md'), 'utf8'), 'Uncommitted contextual guidance.');
});

test('the accepted Alice example validates unchanged and provides human output', (t) => {
  const source = sourceFixture(readFileSync('examples/alice/standards.yaml', 'utf8'));
  cpSync('examples/alice/defaults', join(source.root, 'defaults'), { recursive: true });
  cpSync('examples/alice/profiles', join(source.root, 'profiles'), { recursive: true });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate'], source.root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /personal, work/);
  assert.equal(result.stderr, '');
});

for (const [label, yaml, code] of [
  ['unsupported format', header.replace('repo-standards/v1', 'repo-standards/v2'), 'INVALID_FORMAT'],
  ['invalid CLI range', header.replace('>=1.0.0 <2.0.0', 'yesterday'), 'INVALID_VERSION'],
  ['incompatible CLI', header.replace('>=1.0.0 <2.0.0', '>=2.0.0'), 'INCOMPATIBLE_CLI'],
  ['missing metadata', header.replace('description: Test standards\n', ''), 'REQUIRED_FIELD'],
  ['non-string metadata', header.replace('name: test-standards', 'name: 123'), 'INVALID_TYPE'],
] as const) {
  test(`authors receive structured errors for ${label}`, (t) => {
    const source = sourceFixture(yaml + 'defaults:\n  declarations: {}\nprofiles:\n  personal:\n    description: Personal\n    declarations: {}\n');
    t.after(() => source.close());
    const result = cli.run(['source', 'validate', '--json'], source.root);
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).errors.some((error: { code: string }) => error.code === code));
    assert.deepEqual(JSON.parse(result.stdout).profiles, {});
  });
}

for (const [label, yaml, code] of [
  ['no profiles', header + 'defaults: {declarations: {}}\nprofiles: {}', 'EMPTY_PROFILES'],
  ['recursive alias', header + 'defaults: &loop\n  declarations: *loop\nprofiles: {}', 'YAML_STRUCTURE'],
  ['invalid YAML', header + 'defaults: [\nprofiles: {}', 'YAML_SYNTAX'],
  ['multiple documents', header + '---\nother: document', 'YAML_SYNTAX'],
  ['unknown YAML tag', header + 'defaults: !custom {}\nprofiles: {}', 'YAML_SYNTAX'],
] as const) {
  test(`authors receive diagnostics without crashing for ${label}`, (t) => {
    const source = sourceFixture(yaml);
    t.after(() => source.close());
    const result = cli.run(['source', 'validate', '--json'], source.root);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(JSON.parse(result.stdout).errors.some((error: { code: string }) => error.code === code), result.stdout);
  });
}

test('the installed CLI exposes version and help and rejects unsupported commands', (t) => {
  const source = sourceFixture('');
  t.after(() => source.close());
  assert.equal(cli.run(['--version'], source.root).stdout.trim(), '1.0.0');
  assert.match(cli.run(['--help'], source.root).stdout, /source validate/);
  assert.equal(cli.run(['adopt', source.root], source.root).status, 2);
  assert.equal(cli.run(['source', 'validate', '--profile', 'personal'], source.root).status, 2);
  assert.equal(cli.run(['source', 'validate', '/a/missing/source', '--json'], source.root).status, 1);
});

test('duplicate YAML identities do not hide independent errors in either declaration', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    repeated:
      kind: file
      target: FIRST.md
      exact: first-missing.md
    repeated:
      kind: file
      target: SECOND.md
      exact: second-missing.md
profiles:
  personal:
    description: Personal
    declarations: {}
`);
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1);
  const errors = JSON.parse(result.stdout).errors;
  assert.equal(errors.filter((error: { code: string }) => error.code === 'DUPLICATE_IDENTITY').length, 1);
  assert.equal(errors.filter((error: { code: string }) => error.code === 'MISSING_REFERENCE').length, 2);
});

test('duplicate singleton fields still validate every determinable value', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    first:
      kind: file
      target: FIRST.md
      exact: first-missing.md
      exact: content.md
defaults:
  declarations: {}
profiles:
  personal:
    description: Personal
    declarations:
      second:
        kind: file
        target: SECOND.md
        exact: second-missing.md
profiles:
  other:
    description: Other
    declarations: {}
`, { 'content.md': 'content' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1);
  const errors = JSON.parse(result.stdout).errors;
  assert.equal(errors.filter((error: { code: string }) => error.code === 'DUPLICATE_IDENTITY').length, 3);
  assert.equal(errors.filter((error: { code: string }) => error.code === 'MISSING_REFERENCE').length, 2);
});

test('an unknown declaration kind does not hide unrelated unknown fields', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    typo:
      kind: typo
      unexpected: true
profiles:
  personal:
    description: Personal
    declarations: {}
`);
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some((error: { code: string }) => error.code === 'UNKNOWN_FIELD'));
});

test('unsafe references and conflicting targets are rejected even in an unselected profile', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    original:
      kind: file
      target: README.md
      exact: content.md
profiles:
  good:
    description: Good
    declarations: {}
  bad:
    description: Bad
    declarations:
      collision:
        kind: file
        target: readme.MD
        guidance: missing.md
      tree:
        kind: repository
        guidance: content.md
        targets:
          paths: [src/child.ts]
          directories: [src]
      escape:
        kind: file
        target: ../outside.md
        exact: ../outside.md
      reserved:
        kind: repository
        guidance: content.md
        targets:
          paths: [.repo-standards/state.json]
          directories: [.agents]
      linked:
        kind: file
        target: LINK.md
        exact: linked.md
      linked-skill:
        kind: skill
        name: review
        source: skill
      script:
        kind: file
        target: SCRIPT.md
        exact: content.md
        checks:
          - id: check
            run:
              executable: node
              script: missing.js
              arguments: []
              resources: [resources]
            prerequisite:
              version-arguments: ["--version"]
              version: ">=24.0.0"
            timeout-seconds: 10
`, { 'content.md': 'content', 'skill/SKILL.md': 'skill', 'resources/data': 'data' });
  t.after(() => source.close());
  symlinkSync('content.md', join(source.root, 'linked.md'));
  symlinkSync('../content.md', join(source.root, 'skill/linked'));
  symlinkSync('../content.md', join(source.root, 'resources/linked'));
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout);
  const { errors } = JSON.parse(result.stdout);
  for (const code of ['MISSING_REFERENCE', 'UNSAFE_PATH', 'RESERVED_TARGET', 'SOURCE_SYMLINK', 'TARGET_OVERLAP']) {
    assert.ok(errors.some((error: { code: string }) => error.code === code), `Missing ${code}: ${result.stdout}`);
  }
  assert.equal(errors.filter((error: { code: string }) => error.code === 'SOURCE_SYMLINK').length, 3);
  assert.ok(errors.some((error: { code: string; profile: string; path: string }) =>
    error.code === 'TARGET_OVERLAP' && error.profile === 'bad' && error.path === '/profiles/bad/declarations/collision/target'));
  assert.ok(errors.some((error: { code: string; path: string }) =>
    error.code === 'MISSING_REFERENCE' && error.path.endsWith('/run/script')));
});

test('validation collects schema and operation errors across every profile with precise locations', (t) => {
  const yaml = header + `extra: rejected
defaults:
  declarations:
    old:
      kind: file
      target: OLD.md
      exact: content.md
profiles:
  first:
    description: First
    declarations:
      Bad_ID:
        kind: file
        target: ONE.md
        exact: content.md
        guidance: content.md
        checks:
          - id: same
            run:
              executable: "node --eval"
              script: content.md
              resources: []
              arguments: [42]
              shell: true
            prerequisite:
              version-arguments: ["--version"]
              version: yesterday
            timeout-seconds: 0
        fixes:
          - id: same
            run: {}
            prerequisite: {}
            timeout-seconds: 1.5
  second:
    description: Second
    declarations:
      old:
        exclude: false
        target: unexpected.md
      absent:
        exclude: true
      empty:
        kind: repository
        guidance: content.md
        targets:
          paths: []
          directories: []
      reserved:
        kind: skill
        name: adopt-standards
        source: skill
`;
  const source = sourceFixture(yaml, { 'content.md': 'Content', 'skill/SKILL.md': 'Skill' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1);
  const { errors, valid } = JSON.parse(result.stdout);
  assert.equal(valid, false);
  const codes = new Set(errors.map((error: { code: string }) => error.code));
  for (const code of ['UNKNOWN_FIELD', 'INVALID_ID', 'INVALID_DECLARATION', 'INVALID_EXECUTABLE', 'INVALID_TYPE', 'INVALID_VERSION', 'INVALID_TIMEOUT', 'DUPLICATE_IDENTITY', 'REQUIRED_FIELD', 'INVALID_EXCLUSION', 'EMPTY_TARGETS', 'RESERVED_NAME']) {
    assert.ok(codes.has(code), `Missing ${code}: ${result.stdout}`);
  }
  const versionError = errors.find((error: { code: string }) => error.code === 'INVALID_VERSION');
  assert.deepEqual(versionError, {
    code: 'INVALID_VERSION', message: 'Expected a prerequisite SemVer range.', file: join(source.root, 'standards.yaml'),
    line: 32, column: 24, path: '/profiles/first/declarations/Bad_ID/checks/0/prerequisite/version',
  });
  assert.ok(errors.some((error: { path: string }) => error.path.startsWith('/profiles/second/')));
});

test('all four forms resolve through inheritance, replacement, addition and exclusion as complete declarations', (t) => {
  let yaml = readFileSync('examples/alice/standards.yaml', 'utf8');
  yaml = yaml.replace('    declarations: {}', `    declarations:
      extra-file:
        kind: file
        target: EXTRA.md
        exact: defaults/files/AGENTS.md`);
  // Replacing README with exact content must remove inherited guidance and checks.
  yaml += `      readme:
        kind: file
        target: README.md
        exact: defaults/files/AGENTS.md
`;
  const source = sourceFixture(yaml);
  cpSync('examples/alice/defaults', join(source.root, 'defaults'), { recursive: true });
  cpSync('examples/alice/profiles', join(source.root, 'profiles'), { recursive: true });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.profiles.work.declarations, [
    { id: 'agent-guidance', kind: 'file', target: 'AGENTS.md', exact: 'profiles/work/files/AGENTS.md', checks: [], fixes: [] },
    { id: 'readme', kind: 'file', target: 'README.md', exact: 'defaults/files/AGENTS.md', checks: [], fixes: [] },
    { id: 'review-skill', kind: 'skill', name: 'review', source: 'defaults/skills/review', checks: [], fixes: [] },
    { id: 'source-layout', kind: 'repository', guidance: 'defaults/guidance/source-layout.md', targets: { paths: [], directories: ['src'] }, checks: [], fixes: [] },
  ]);
  const personal = report.profiles.personal.declarations;
  assert.deepEqual(personal.map((declaration: { id: string }) => declaration.id),
    ['agent-guidance', 'contribution-guidance', 'extra-file', 'readme', 'review-skill', 'source-layout']);
  assert.deepEqual(personal[3], { id: 'readme', kind: 'file', target: 'README.md', guidance: 'defaults/guidance/readme.md', fixes: [], checks: [{
    id: 'headings', run: { executable: 'python3', script: 'defaults/checks/readme.py', resources: [], arguments: [] },
    prerequisite: { 'version-arguments': ['--version'], version: '>=3.12.0 <4.0.0' }, 'timeout-seconds': 60,
  }] });
});

test('an author validates a local standards source through the installed CLI', (t) => {
  const source = sourceFixture(`format: repo-standards/v1
name: alice-standards
description: Alice's repository standards
requires:
  repo-standards: ">=1.0.0 <2.0.0"
defaults:
  declarations: {}
profiles:
  personal:
    description: Standards for personal projects
    declarations: {}
`);
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', source.root, '--json'], source.root);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.profiles, { personal: { description: 'Standards for personal projects', declarations: [] } });
});
