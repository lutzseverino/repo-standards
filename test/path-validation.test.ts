import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chmodSync, mkdirSync, renameSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { installCli, sourceFixture } from './installed-cli.ts';

const cli = installCli();
after(() => cli.close());
const header = `format: repo-standards/v1
name: paths
description: Path validation
requires: {repo-standards: ">=1.0.0 <2.0.0"}
`;
const profile = 'profiles:\n  personal:\n    description: Personal\n    declarations: {}\n';

for (const name of ['adopt-standards', 'author-standards']) {
  test(`authors cannot supply the product-owned ${name} skill`, (t) => {
    const source = sourceFixture(header + `defaults:
  declarations:
    competing:
      kind: skill
      name: ${name}
      source: skill
` + profile, { 'skill/SKILL.md': '# Competing skill' });
    t.after(() => source.close());
    const result = cli.run(['source', 'validate', '--json'], source.root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.profiles, {});
    const diagnostic = report.errors.find((error: { code: string }) => error.code === 'RESERVED_NAME');
    assert.deepEqual(diagnostic, {
      code: 'RESERVED_NAME', message: `${name} is a product-owned system skill.`,
      file: join(source.root, 'standards.yaml'), line: 9, column: 13,
      path: '/defaults/declarations/competing/name',
    });
  });
}

test('unreadable selected files are reported for every reference kind', (t) => {
  if (process.getuid?.() === 0) {
    t.skip('Root can read files without read permission; this fixture needs an unprivileged user.');
    return;
  }
  const files = ['exact.md', 'guidance.md', 'repository.md', 'script.js', 'resource.txt', 'resources/nested.txt', 'skill/SKILL.md', 'skill/data.txt'];
  const source = sourceFixture(header + `defaults:
  declarations:
    exact:
      kind: file
      target: EXACT.md
      exact: exact.md
      checks:
        - id: check
          run:
            executable: node
            script: script.js
            resources: [resource.txt, resources]
            arguments: []
          prerequisite:
            version-arguments: ["--version"]
            version: ">=24.0.0"
          timeout-seconds: 5
    contextual:
      kind: file
      target: README.md
      guidance: guidance.md
    repository:
      kind: repository
      guidance: repository.md
      targets:
        paths: []
        directories: [src]
    skill:
      kind: skill
      name: review
      source: skill
` + profile, Object.fromEntries(files.map(path => [path, 'selected content'])));
  t.after(() => {
    for (const path of files) chmodSync(join(source.root, path), 0o600);
    source.close();
  });
  for (const path of files) chmodSync(join(source.root, path), 0);
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.profiles, {});
  for (const path of files) {
    assert.ok(report.errors.some((error: { code: string; message: string }) =>
      error.code === 'SOURCE_READ' && error.message === `Cannot read source reference: ${path}.`), `Missing unreadable ${path}: ${result.stdout}`);
  }
});

test('all file and repository guidance forms reject system-skill targets and overlapping paths', async t => {
  for (const name of ['adopt-standards', 'author-standards']) {
    for (const target of [
      `.agents/skills/${name}`, '.agents', '.agents/skills',
      `.agents/skills/${name}/SKILL.md`,
      `.AGENTS/SKILLS/${name.toUpperCase()}/SKILL.md`,
      `.agents/ſkills/${name}/cafe\u0301.md`,
    ]) {
      for (const form of ['exact', 'contextual', 'paths', 'directories']) {
        await t.test(`${form}: ${target}`, st => {
          const file = form === 'exact' || form === 'contextual';
          const declaration = file
            ? `      kind: file\n      target: ${JSON.stringify(target)}\n      ${form === 'exact' ? 'exact' : 'guidance'}: content.md\n`
            : `      kind: repository\n      guidance: content.md\n      targets:\n        paths: ${form === 'paths' ? `[${JSON.stringify(target)}]` : '[]'}\n        directories: ${form === 'directories' ? `[${JSON.stringify(target)}]` : '[]'}\n`;
          const source = sourceFixture(header + 'defaults:\n  declarations:\n    competing:\n' + declaration + profile,
            { 'content.md': 'Standards material' });
          st.after(() => source.close());
          const result = cli.run(['source', 'validate', '--json'], source.root);
          assert.equal(result.status, 1, result.stdout + result.stderr);
          const report = JSON.parse(result.stdout);
          assert.deepEqual(report.profiles, {});
          assert.deepEqual(report.errors, [{
            code: 'RESERVED_TARGET',
            message: 'Target overlaps product-owned state, a system skill, or Git metadata.',
            file: join(source.root, 'standards.yaml'),
            line: file ? 9 : form === 'paths' ? 11 : 12,
            column: file ? 15 : form === 'paths' ? 17 : 23,
            path: `/defaults/declarations/competing/${file ? 'target' : `targets/${form}/0`}`,
          }]);
        });
      }
    }
  }
});

for (const codePoint of ['0001', '007f', '0080', '0085', '009f']) {
  test(`source and target paths reject escaped control U+${codePoint}`, (t) => {
    const source = sourceFixture(header + `defaults:
  declarations:
    file:
      kind: file
      target: "file\\u${codePoint}.md"
      exact: "source\\u${codePoint}.md"
` + profile);
    t.after(() => source.close());
    const result = cli.run(['source', 'validate', '--json'], source.root);
    assert.equal(result.status, 1, result.stdout);
    const errors = JSON.parse(result.stdout).errors;
    for (const field of ['target', 'exact']) assert.ok(errors.some((error: { code: string; path: string }) =>
      error.code === 'UNSAFE_PATH' && error.path === `/defaults/declarations/file/${field}`), result.stdout);
  });
}

test('whole skill and resource trees reject control characters in nested source paths', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    skill:
      kind: skill
      name: review
      source: skill
      checks:
        - id: check
          run:
            executable: node
            script: script.js
            resources: [resources]
            arguments: []
          prerequisite:
            version-arguments: ["--version"]
            version: ">=24.0.0"
          timeout-seconds: 5
` + profile, { 'skill/SKILL.md': 'skill', 'skill/data\u0080.txt': 'data', 'resources/data\u009f.txt': 'data', 'script.js': 'script' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout);
  const errors = JSON.parse(result.stdout).errors;
  for (const path of ['/defaults/declarations/skill/source', '/defaults/declarations/skill/checks/0/run/resources/0']) {
    assert.ok(errors.some((error: { code: string; path: string }) => error.code === 'UNSAFE_PATH' && error.path === path), result.stdout);
  }
});

test('empty profile names are rejected', (t) => {
  const source = sourceFixture(header + 'defaults: {declarations: {}}\n' + profile.replace('personal:', '"":'));
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout);
  assert.ok(JSON.parse(result.stdout).errors.some((error: { code: string }) => error.code === 'INVALID_TYPE'));
});

for (const path of ['/absolute', 'C:/outside', '../outside', 'a/../../outside', './file', 'a//file', 'a\\file', 'src/*.ts']) {
  test(`target path ${JSON.stringify(path)} is rejected`, (t) => {
    const source = sourceFixture(header + `defaults:
  declarations:
    file:
      kind: file
      target: ${JSON.stringify(path)}
      exact: content.md
` + profile, { 'content.md': 'content' });
    t.after(() => source.close());
    const result = cli.run(['source', 'validate', '--json'], source.root);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(JSON.parse(result.stdout).errors.some((error: { code: string; path: string }) => error.code === 'UNSAFE_PATH' && error.path.endsWith('/target')));
  });
}

test('source symlinks are rejected at the document and source ancestor boundaries', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    file:
      kind: file
      target: FILE.md
      exact: linked/content.md
` + profile, { 'actual/content.md': 'content' });
  t.after(() => source.close());
  symlinkSync('actual', join(source.root, 'linked'));
  let result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some((error: { code: string }) => error.code === 'SOURCE_SYMLINK'));
  renameSync(join(source.root, 'standards.yaml'), join(source.root, 'actual.yaml'));
  symlinkSync('actual.yaml', join(source.root, 'standards.yaml'));
  result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'SOURCE_SYMLINK');
});

test('source directories must not be symlinks even with a trailing slash', (t) => {
  const source = sourceFixture(header + 'defaults: {declarations: {}}\n' + profile);
  t.after(() => source.close());
  symlinkSync('.', join(source.root, 'alias'));
  const result = cli.run(['source', 'validate', `${source.root}/alias/`, '--json'], source.root);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'SOURCE_SYMLINK');
});

test('references must have the declared filesystem type and skills require SKILL.md', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    directory-file:
      kind: file
      target: FILE.md
      exact: directory
    file-skill:
      kind: skill
      name: review
      source: content.md
    empty-skill:
      kind: skill
      name: empty
      source: directory
` + profile, { 'content.md': 'content' });
  t.after(() => source.close());
  mkdirSync(join(source.root, 'directory'));
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1);
  const errors = JSON.parse(result.stdout).errors;
  assert.ok(errors.some((error: { code: string }) => error.code === 'REFERENCE_TYPE'));
  assert.ok(errors.some((error: { code: string; message: string }) => error.code === 'MISSING_REFERENCE' && error.message.includes('directory/SKILL.md')));
});

test('whole skills collide with files and other skill declarations after case folding', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    skill:
      kind: skill
      name: review
      source: skill
    same-skill:
      kind: skill
      name: review
      source: skill
    file:
      kind: file
      target: .AGENTS/skills/REVIEW/data.txt
      exact: content.md
` + profile, { 'skill/SKILL.md': 'Skill', 'content.md': 'content' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).errors.filter((error: { code: string }) => error.code === 'TARGET_OVERLAP').length, 3);
});

test('replaced and excluded targets are absent from overlap validation', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    original:
      kind: file
      target: SAME.md
      exact: content.md
    excluded:
      kind: file
      target: SAME.md
      exact: content.md
profiles:
  personal:
    description: Personal
    declarations:
      excluded: {exclude: true}
      original:
        kind: file
        target: NEW.md
        exact: content.md
      added:
        kind: file
        target: SAME.md
        exact: content.md
`, { 'content.md': 'content' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('Unicode case-folded target collisions include capital and small sharp S', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    capital:
      kind: file
      target: ẞ.md
      exact: content.md
    small:
      kind: file
      target: ß.md
      exact: content.md
` + profile, { 'content.md': 'content' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 1, result.stdout);
  assert.ok(JSON.parse(result.stdout).errors.some((error: { code: string }) => error.code === 'TARGET_OVERLAP'));
});

test('distinct Unicode targets are not conflated by uppercasing', (t) => {
  const source = sourceFixture(header + `defaults:
  declarations:
    dotted:
      kind: file
      target: i.md
      exact: content.md
    dotless:
      kind: file
      target: ı.md
      exact: content.md
` + profile, { 'content.md': 'content' });
  t.after(() => source.close());
  const result = cli.run(['source', 'validate', '--json'], source.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
