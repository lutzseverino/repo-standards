import type { SourceDeclaration, SourceValidation } from './json-reports.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { cpSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { installCli, sourceFixture } from './installed-cli.ts';

const cli = installCli();
after(() => cli.close());

const header = `format: repo-standards/v2
name: test-standards
description: Test standards
requires:
  repo-standards: ">=1.0.0"
`;

test('validation never runs scripts, version probes or shell-shaped arguments, and leaves a dirty source unchanged', (t) => {
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
      kind: repository
      discovery: discovery.md
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
    'discovery.md': 'Find maintained projects without running this file.',
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
  const report = (JSON.parse(result.stdout) as SourceValidation);
  assert.deepEqual(report.profiles.excluded!.declarations, []);
  assert.equal(execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: source.root, encoding: 'utf8' }), before);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source.root, encoding: 'utf8' }), head);
  assert.equal(readFileSync(join(source.root, 'guidance.md'), 'utf8'), 'Uncommitted contextual guidance.');
});

for (const example of [
  { label: 'packaged Atlas example', source: 'examples/atlas', profile: 'maintained', declaration: 'project-documentation',
    discovery: 'guidance/project-discovery.md', fix: 'normalize-markdown-ending', check: 'verify-markdown-ending',
    exactDeclaration: 'documentation-catalog', exactTarget: 'docs/catalog.json' },
  { label: 'independent Wayfinder acceptance source', source: 'acceptance/sources/wayfinder', profile: 'service', declaration: 'service-readiness',
    discovery: 'guidance/service-discovery.md', fix: 'initialize-operating-status', check: 'verify-service-evidence',
    exactDeclaration: 'editor-settings', exactTarget: '.editorconfig' },
] as const) test(`the ${example.label} validates through the same source contract`, (t) => {
  const source = sourceFixture('');
  cpSync(example.source, source.root, { recursive: true });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as SourceValidation);
  assert.deepEqual(report.scope!.discoveryRequired, { [example.profile]: [example.declaration] });
  const declarations = report.profiles[example.profile]!.declarations;
  assert.equal((declarations.find((entry: { id: string }) => entry.id === example.exactDeclaration)! as Extract<SourceDeclaration, { kind: 'file' }>).target, example.exactTarget);
  const contextual = declarations.find((entry: { id: string }) => entry.id === example.declaration);
  assert.equal((contextual! as Extract<SourceDeclaration, { kind: 'repository'; discovery: string }>).discovery, example.discovery);
  assert.deepEqual(contextual!.fixes.map((entry: { id: string }) => entry.id), [example.fix]);
  assert.deepEqual(contextual!.checks.map((entry: { id: string }) => entry.id), [example.check]);
});

for (const [label, yaml, code] of [
  // The one source format is named; a retired or unknown one is not interpreted.
  ['the retired repo-standards/v1 format', header.replace('repo-standards/v2', 'repo-standards/v1'), 'INVALID_FORMAT'],
  ['unsupported format', header.replace('repo-standards/v2', 'repo-standards/v3'), 'INVALID_FORMAT'],
  ['invalid CLI range', header.replace('>=1.0.0', 'yesterday'), 'INVALID_VERSION'],
  ['incompatible CLI', header.replace('>=1.0.0', '>=99.0.0'), 'INCOMPATIBLE_CLI'],
  ['missing metadata', header.replace('description: Test standards\n', ''), 'REQUIRED_FIELD'],
  ['non-string metadata', header.replace('name: test-standards', 'name: 123'), 'INVALID_TYPE'],
] as const) {
  test(`authors receive structured errors for ${label}`, (t) => {
    const source = sourceFixture(yaml + 'defaults:\n  declarations:\n    readme:\n      kind: file\n      target: README.md\n      exact: readme.md\nprofiles:\n  personal:\n    description: Personal\n    declarations: {}\n',
      { 'readme.md': 'Readme' });
    t.after(() => source.close());
    const result = cli.run(['source', 'validate', '--json'], source.root);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout) as SourceValidation;
    assert.ok(report.errors.some((error: { code: string }) => error.code === code));
    if (code === 'INVALID_FORMAT') {
      assert.deepEqual(report.errors.map(error => [error.code, error.path]), [['INVALID_FORMAT', '/format']]);
      assert.ok(report.errors[0]!.message.includes('repo-standards/v2'), report.errors[0]!.message);
    }
    assert.deepEqual(report.profiles, {});
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
    assert.ok((JSON.parse(result.stdout) as SourceValidation).errors.some((error: { code: string }) => error.code === code), result.stdout);
  });
}

test('the installed CLI exposes version and help and rejects unsupported commands', (t) => {
  const source = sourceFixture('');
  t.after(() => source.close());
  assert.equal(cli.run(['--version'], source.root).stdout.trim(), cli.version);
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
  const errors = (JSON.parse(result.stdout) as SourceValidation).errors;
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
  const errors = (JSON.parse(result.stdout) as SourceValidation).errors;
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
  assert.ok((JSON.parse(result.stdout) as SourceValidation).errors.some((error: { code: string }) => error.code === 'UNKNOWN_FIELD'));
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
  const { errors } = (JSON.parse(result.stdout) as SourceValidation);
  for (const code of ['MISSING_REFERENCE', 'UNSAFE_PATH', 'RESERVED_TARGET', 'SOURCE_SYMLINK', 'TARGET_OVERLAP']) {
    assert.ok(errors.some((error: { code: string }) => error.code === code), `Missing ${code}: ${result.stdout}`);
  }
  assert.equal(errors.filter((error: { code: string }) => error.code === 'SOURCE_SYMLINK').length, 3);
  assert.ok(errors.some((error) =>
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
  const { errors, valid } = (JSON.parse(result.stdout) as SourceValidation);
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
  const report = (JSON.parse(result.stdout) as SourceValidation);
  assert.deepEqual(report.profiles.work!.declarations, [
    { id: 'agent-guidance', kind: 'file', target: 'AGENTS.md', exact: 'profiles/work/files/AGENTS.md', checks: [], fixes: [] },
    { id: 'readme', kind: 'file', target: 'README.md', exact: 'defaults/files/AGENTS.md', checks: [], fixes: [] },
    { id: 'review-skill', kind: 'skill', name: 'review', source: 'defaults/skills/review', checks: [], fixes: [] },
    { id: 'source-layout', kind: 'repository', guidance: 'defaults/guidance/source-layout.md', targets: { paths: [], directories: ['src'] }, checks: [], fixes: [] },
  ]);
  const personal = report.profiles.personal!.declarations;
  assert.deepEqual(personal.map((declaration: { id: string }) => declaration.id),
    ['agent-guidance', 'contribution-guidance', 'extra-file', 'readme', 'review-skill', 'source-layout']);
  assert.deepEqual(personal[3], { id: 'readme', kind: 'file', target: 'README.md', guidance: 'defaults/guidance/readme.md', fixes: [], checks: [{
    id: 'headings', run: { executable: 'python3', script: 'defaults/checks/readme.py', resources: [], arguments: [] },
    prerequisite: { 'version-arguments': ['--version'], version: '>=3.12.0 <4.0.0' }, 'timeout-seconds': 60,
  }] });
});

test('discovery resolves separately from explicit targets across complete profiles', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    documentation:
      kind: repository
      guidance: guidance.md
      discovery: discovery.md
profiles:
  inherited:
    description: Inherited discovery
    declarations: {}
  explicit:
    description: Complete explicit replacement
    declarations:
      documentation:
        kind: repository
        guidance: guidance.md
        targets: {paths: [README.md], directories: [docs]}
  excluded:
    description: No documentation governance
    declarations:
      documentation: {exclude: true}
`, { 'guidance.md': 'Preserve useful project facts.', 'discovery.md': 'Identify maintained projects, including those without READMEs.' });
  t.after(() => source.close());
  // The source is named explicitly, as an author validating it from elsewhere would.
  const result = cli.run(['source', 'validate', source.root, '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as SourceValidation);
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.equal(report.source!.format, 'repo-standards/v2');
  // Each profile reports its description and complete resolved declarations.
  assert.deepEqual(report.profiles, {
    inherited: { description: 'Inherited discovery', declarations: [{
      id: 'documentation', kind: 'repository', guidance: 'guidance.md', discovery: 'discovery.md', checks: [], fixes: [] }] },
    explicit: { description: 'Complete explicit replacement', declarations: [{
      id: 'documentation', kind: 'repository', guidance: 'guidance.md', targets: { paths: ['README.md'], directories: ['docs'] }, checks: [], fixes: [] }] },
    excluded: { description: 'No documentation governance', declarations: [] },
  });
  assert.deepEqual(report.scope!.discoveryRequired, { inherited: ['documentation'], explicit: [], excluded: [] });
  assert.match(report.scope!.verified, /all profiles.*references.*operations.*explicit.target conflicts/i);
  assert.match(report.scope!.limitations, /concrete scope safety.*semantic completeness/i);
  const human = cli.run(['source', 'validate'], source.root);
  assert.equal(human.status, 0, human.stderr);
  assert.equal(human.stderr, '');
  // The readable report lists every profile.
  assert.match(human.stdout, /profiles: inherited, explicit, excluded\./);
  assert.match(human.stdout, /discovery.*inherited.*documentation/i);
  assert.match(human.stdout, /concrete scope safety.*semantic completeness/i);
});

for (const [label, declaration, code, path] of [
  ['both scope modes', 'discovery: discovery.md\n      targets: {paths: [README.md], directories: []}', 'INVALID_DECLARATION', ''],
  ['neither scope mode', '', 'INVALID_DECLARATION', ''],
  ['empty explicit scope', 'targets: {paths: [], directories: []}', 'EMPTY_TARGETS', '/targets'],
  ['missing discovery', 'discovery: missing.md', 'MISSING_REFERENCE', '/discovery'],
  ['unsafe discovery', 'discovery: ../outside.md', 'UNSAFE_PATH', '/discovery'],
  ['absolute discovery', 'discovery: /outside.md', 'UNSAFE_PATH', '/discovery'],
  ['directory discovery', 'discovery: resources', 'REFERENCE_TYPE', '/discovery'],
  ['non-string discovery', 'discovery: [discovery.md]', 'INVALID_TYPE', '/discovery'],
  ['script-shaped discovery', 'discovery: {run: discovery.md}', 'INVALID_TYPE', '/discovery'],
  ['missing contextual guidance', 'discovery: discovery.md', 'MISSING_REFERENCE', '/guidance'],
  ['unsafe contextual guidance', 'discovery: discovery.md', 'UNSAFE_PATH', '/guidance'],
  ['unknown protection field', 'discovery: discovery.md\n      protect: [config.json]', 'UNKNOWN_FIELD', '/protect'],
  ['unknown target field', 'targets: {paths: [README.md], directories: [], exclude: [config.json]}', 'UNKNOWN_FIELD', '/targets/exclude'],
  ['duplicate discovery field', 'discovery: discovery.md\n      discovery: missing.md', 'DUPLICATE_IDENTITY', '/discovery'],
] as const) test(`validation rejects ${label} even when every profile excludes the default`, t => {
  const guidance = label === 'missing contextual guidance' ? 'missing.md' : label === 'unsafe contextual guidance' ? '../outside.md' : 'guidance.md';
  const source = sourceFixture(header + `defaults:
  declarations:
    documentation:
      kind: repository
      guidance: ${guidance}
      ${declaration}
profiles:
  work:
    description: Excludes invalid default
    declarations:
      documentation: {exclude: true}
`, { 'guidance.md': 'Improve documentation.', 'discovery.md': 'Find maintained projects.', 'resources/file.md': 'A directory is not a guidance file.' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as SourceValidation);
  assert.deepEqual(report.profiles, {});
  assert.ok(report.errors.some((error: { code: string; path: string; line: number; column: number }) =>
    error.code === code && error.path === `/defaults/declarations/documentation${path}` && error.line > 0 && error.column > 0), result.stdout);
});

for (const reference of ['guidance', 'discovery']) test(`validation rejects symlinked ${reference} and its ancestors`, t => {
  for (const path of ['linked.md', 'linked/file.md']) {
    const source = sourceFixture(header + `defaults:
  declarations: {}
profiles:
  work:
    description: Work
    declarations:
      documentation:
        kind: repository
        guidance: ${reference === 'guidance' ? path : 'guidance.md'}
        discovery: ${reference === 'discovery' ? path : 'discovery.md'}
`, { 'guidance.md': 'Improve documentation.', 'discovery.md': 'Find projects.', 'resources/file.md': 'Guidance' });
    t.after(() => source.close());
    symlinkSync('guidance.md', join(source.root, 'linked.md'));
    symlinkSync('resources', join(source.root, 'linked'));
    const result = cli.run(['source', 'validate', '--json'], source.root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok((JSON.parse(result.stdout) as SourceValidation).errors.some((error: { code: string; path: string }) =>
      error.code === 'SOURCE_SYMLINK' && error.path === `/profiles/work/declarations/documentation/${reference}`), result.stdout);
  }
});

test('validation collects both references and explicit conflicts in ambiguous discovery declarations', t => {
  const source = sourceFixture(header + `defaults:
  declarations:
    configuration:
      kind: file
      target: docs/config.json
      exact: config.json
profiles:
  work:
    description: Work
    declarations: {}
  other:
    description: Invalid unselected profile
    declarations:
      documentation:
        kind: repository
        guidance: missing-guidance.md
        discovery: missing-discovery.md
        targets: {paths: [], directories: [docs]}
`, { 'config.json': '{}' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as SourceValidation);
  assert.deepEqual(report.profiles, {});
  for (const field of ['guidance', 'discovery']) assert.ok(report.errors.some((error: { code: string; path: string }) =>
    error.code === 'MISSING_REFERENCE' && error.path === `/profiles/other/declarations/documentation/${field}`), result.stdout);
  for (const code of ['INVALID_DECLARATION', 'TARGET_OVERLAP']) assert.ok(report.errors.some((error: { code: string }) => error.code === code), result.stdout);
});

for (const kind of ['file', 'skill']) {
  test(`${kind} declarations reject discovery outside the repository form`, t => {
    const fields = kind === 'file' ? 'target: README.md\n      guidance: guidance.md' : 'name: review\n      source: skill';
    const source = sourceFixture(header + `defaults:
  declarations:
    documentation:
      kind: ${kind}
      ${fields}
      discovery: discovery.md
profiles:
  work:
    description: Work
    declarations: {}
`, { 'guidance.md': 'Improve documentation.', 'discovery.md': 'Find projects.', 'skill/SKILL.md': '# Review' });
    t.after(() => source.close());
    const result = cli.run(['source', 'validate', '--json'], source.root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok((JSON.parse(result.stdout) as SourceValidation).errors.some((error: { code: string; path: string }) =>
      error.code === 'UNKNOWN_FIELD' && error.path === '/defaults/declarations/documentation/discovery'), result.stdout);
  });
}

for (const [label, frontmatter, policy, disabled, implicit] of [
  ['manual only in Claude Code', 'disable-model-invocation: true', undefined, true, true],
  ['manual only in Codex', '', 'policy:\n  allow_implicit_invocation: false\n', false, false],
  ['explicitly invocable only in Codex', 'disable-model-invocation: true', 'policy: {allow_implicit_invocation: true}\n', true, true],
  ['explicitly invocable only in Claude Code', 'disable-model-invocation: false', 'policy: {allow_implicit_invocation: false}\n', false, false],
] as const) test(`author skill invocation rejects ${label}`, (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    review:
      kind: skill
      name: review
      source: skills/review
profiles:
  personal:
    description: Personal
    declarations: {}
`, { 'skills/review/SKILL.md': `---\nname: review\n${frontmatter}\n---\nReview code.\n`,
    ...(policy === undefined ? {} : { 'skills/review/agents/openai.yaml': policy }) });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = (JSON.parse(result.stdout) as SourceValidation);
  assert.deepEqual(report.profiles, {});
  const diagnostic = report.errors.find((error: { code: string }) => error.code === 'SKILL_INVOCATION_MISMATCH');
  assert.ok(diagnostic, result.stdout);
  assert.match(diagnostic.message, /review/);
  assert.ok(diagnostic.message.includes(`disable-model-invocation: ${disabled}`));
  assert.ok(diagnostic.message.includes(`policy.allow_implicit_invocation: ${implicit}`));
  assert.equal(diagnostic.path, '/defaults/declarations/review/source');
  assert.equal(result.stderr, '');
  const human = cli.run(['source', 'validate'], source.root);
  assert.equal(human.status, 1);
  assert.match(human.stderr, /SKILL_INVOCATION_MISMATCH.*review/);
});

// Settings that agree, are absent, or sit among unrelated metadata. One source
// declares a skill per case, so a single validation accepts them all.
test('author skill invocation accepts agreeing, absent and unrelated settings', (t) => {
  const cases: [string, string, string | undefined][] = [
    ['manual only in both tools', '---\nname: review\ndisable-model-invocation: true\n---\nReview.', 'policy: {allow_implicit_invocation: false}\n'],
    ['invocable in both tools', '---\nname: review\ndisable-model-invocation: false\n---\nReview.', 'policy: {allow_implicit_invocation: true}\n'],
    ['neither setting with frontmatter', '---\nname: review\ndescription: Review code.\n---\nReview.', 'interface: {display_name: Review}\n'],
    ['neither setting with a loosely written description', '---\ndescription: Use when: the user asks\n---\nReview.', 'interface:\n  description: Use when: the user asks\n'],
    ['neither setting with duplicate unrelated keys', '---\ndescription: First\ndescription: Second\n---\nReview.', 'policy: {other: true}\npolicy: {other: false}\n'],
    ['neither setting with non-mapping metadata', '---\n- review\n- code\n---\nReview.', '[review, code]\n'],
    ['neither setting with non-string keys', '---\n1: review\n---\nReview.', '? [review, code]\n: description\n'],
    ['neither setting with invalid Codex YAML', '# Review', 'policy: [\n'],
    ['neither setting with an unrelated nested invocation key in invalid YAML', '# Review', 'interface:\n  allow_implicit_invocation: true\nother: [\n'],
    ['neither setting with an invocation key in description prose and invalid YAML', '---\ndescription: |\n  disable-model-invocation: true\nother: [\n---\nReview.', undefined],
    ['neither setting with a Codex invocation key in description prose and invalid YAML', '# Review', 'interface:\n  description: >-\n    allow_implicit_invocation: false\nother: [\n'],
    ['neither setting with scalar frontmatter prose and invalid YAML', '---\n|\n  disable-model-invocation: true\nother: [\n---\nReview.', undefined],
    ['agreeing settings with duplicate unrelated keys', '---\ndescription: First\ndescription: Second\ndisable-model-invocation: true\n---\nReview.', 'policy: {other: true, other: false, allow_implicit_invocation: false}\n'],
    ['agreeing settings through aliases', '---\nmanual: &manual true\ndisable-model-invocation: *manual\n---\nReview.', 'manual: &manual {allow_implicit_invocation: false}\npolicy: *manual\n'],
    ['manual settings with spaces after delimiters', '---  \ndisable-model-invocation: true\n---  \nReview.', 'policy: {allow_implicit_invocation: false}\n'],
    ['manual settings with tabs and CRLF after delimiters', '---\t\r\ndisable-model-invocation: true\r\n---\t\r\nReview.', 'policy: {allow_implicit_invocation: false}\n'],
    ['manual settings with a leading BOM', '\uFEFF---\ndisable-model-invocation: true\n---\nReview.', 'policy: {allow_implicit_invocation: false}\n'],
    ['neither metadata file', '# Review\nReview code.', undefined],
    ['absent Claude Code setting with explicit Codex default', '---\nname: review\n---\nReview.', 'policy: {allow_implicit_invocation: true}\n'],
    ['explicit Claude Code default with absent Codex setting', '---\nname: review\ndisable-model-invocation: false\n---\nReview.', undefined],
  ];
  const declarations = cases.map((_, index) => `    review-${index}:\n      kind: skill\n      name: review-${index}\n      source: skills/review-${index}\n`).join('');
  const files: Record<string, string> = {};
  cases.forEach(([, skill, policy], index) => {
    files[`skills/review-${index}/SKILL.md`] = skill;
    if (policy !== undefined) files[`skills/review-${index}/agents/openai.yaml`] = policy;
  });
  const source = sourceFixture(header + `defaults:\n  declarations:\n${declarations}profiles:\n  personal:\n    description: Personal\n    declarations: {}\n`, files);
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((JSON.parse(result.stdout) as SourceValidation).valid, true);
});

for (const [label, metadata, files, code, file, line, path] of [
  ['non-boolean frontmatter', 'disable-model-invocation: "false"', {}, 'INVALID_TYPE', 'skills/review/SKILL.md', 3, '/disable-model-invocation'],
  ['non-boolean Codex setting', '', { 'skills/review/agents/openai.yaml': 'policy:\n  allow_implicit_invocation: "true"\n' }, 'INVALID_TYPE', 'skills/review/agents/openai.yaml', 2, '/policy/allow_implicit_invocation'],
  ['duplicated frontmatter setting', 'disable-model-invocation: false\ndisable-model-invocation: false', {}, 'DUPLICATE_IDENTITY', 'skills/review/SKILL.md', 4, '/disable-model-invocation'],
  ['duplicated Codex setting', '', { 'skills/review/agents/openai.yaml': 'policy:\n  allow_implicit_invocation: true\n  allow_implicit_invocation: true\n' }, 'DUPLICATE_IDENTITY', 'skills/review/agents/openai.yaml', 3, '/policy/allow_implicit_invocation'],
  ['duplicated invocation policy', '', { 'skills/review/agents/openai.yaml': 'policy: {allow_implicit_invocation: true}\npolicy: {allow_implicit_invocation: false}\n' }, 'DUPLICATE_IDENTITY', 'skills/review/agents/openai.yaml', 2, '/policy'],
  ['unparseable frontmatter containing a setting', 'disable-model-invocation: false\ndescription: Use when: the user asks', {}, 'YAML_SYNTAX', 'skills/review/SKILL.md', 4, ''],
  ['unparseable Codex YAML containing a setting', '', { 'skills/review/agents/openai.yaml': 'policy:\n  allow_implicit_invocation: true\ninterface: [\n' }, 'YAML_SYNTAX', 'skills/review/agents/openai.yaml', 4, ''],
  ['unresolved setting alias', 'disable-model-invocation: *missing', {}, 'YAML_STRUCTURE', 'skills/review/SKILL.md', 3, '/disable-model-invocation'],
  ['non-boolean setting alias', 'other: &other "false"\ndisable-model-invocation: *other', {}, 'INVALID_TYPE', 'skills/review/SKILL.md', 4, '/disable-model-invocation'],
  ['a setting hidden by an unterminated scalar', 'description: "unterminated\ndisable-model-invocation: false', {}, 'YAML_SYNTAX', 'skills/review/SKILL.md', 4, ''],
] as const) test(`author skill invocation reports ${label} at its metadata location`, (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    review:
      kind: skill
      name: review
      source: skills/review
profiles:
  personal:
    description: Personal
    declarations: {}
`, { 'skills/review/SKILL.md': `---\nname: review\n${metadata}\n---\nReview code.\n`, ...files });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok((JSON.parse(result.stdout) as SourceValidation).errors.some((error: { code: string; file: string; line: number; path: string }) =>
    error.code === code && error.file === join(source.root, file) && error.line === line && error.path === path), result.stdout);
});

test('author skill invocation validates excluded defaults and unselected profiles', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    review:
      kind: skill
      name: review
      source: skills/review
profiles:
  personal:
    description: Personal
    declarations:
      review: {exclude: true}
  work:
    description: Work
    declarations:
      review:
        kind: skill
        name: work-review
        source: skills/work-review
`, {
    'skills/review/SKILL.md': '---\ndisable-model-invocation: true\n---\nReview.',
    'skills/work-review/SKILL.md': '# Review',
    'skills/work-review/agents/openai.yaml': 'policy: {allow_implicit_invocation: false}\n',
  });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual((JSON.parse(result.stdout) as SourceValidation).errors.filter((error: { code: string }) => error.code === 'SKILL_INVOCATION_MISMATCH')
    .map((error: { path: string }) => error.path), ['/defaults/declarations/review/source', '/profiles/work/declarations/review/source']);
});
