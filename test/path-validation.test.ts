import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdirSync, renameSync, symlinkSync } from 'node:fs';
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
