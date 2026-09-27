import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { packPackage } from '../scripts/pack-package.ts';
import { installCli } from './installed-cli.ts';

test('release artifacts install without build tools and expose the matching CLI, bootstrap, skill and author documentation', t => {
  const root = mkdtempSync(join(tmpdir(), 'repo-standards-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'release');
  execFileSync(process.execPath, ['scripts/pack-release.ts', output], { stdio: 'pipe' });
  const bundle = JSON.parse(readFileSync(join(output, 'release.json'), 'utf8'));
  const repeatedOutput = join(root, 'repeated-release');
  execFileSync(process.execPath, ['scripts/pack-release.ts', repeatedOutput], { stdio: 'pipe' });
  assert.deepEqual(readFileSync(join(repeatedOutput, bundle.tarball)), readFileSync(join(output, bundle.tarball)), 'Repeated packaging of the same build must produce identical bytes');
  for (const artifact of bundle.artifacts) {
    assert.equal(createHash('sha256').update(readFileSync(join(output, artifact.file))).digest('hex'), artifact.sha256);
  }
  const installation = join(root, 'installation');
  execFileSync('npm', ['install', '--prefix', installation, '--ignore-scripts', '--no-audit', '--no-fund', join(output, bundle.tarball)], { cwd: root, stdio: 'pipe' });
  const cli = join(installation, 'node_modules/.bin/repo-standards');
  assert.equal(execFileSync(cli, ['--version'], { encoding: 'utf8' }).trim(), bundle.version);
  assert.match(execFileSync(join(output, 'repo-standards-bootstrap'), ['--help'], { encoding: 'utf8' }), /Usage: repo-standards-bootstrap/);
  const installed = join(installation, 'node_modules/@lutzseverino/repo-standards');
  assert.deepEqual(readFileSync(join(installed, 'skills/adopt-standards/SKILL.md')), readFileSync(resolve('skills/adopt-standards/SKILL.md')));
  for (const resource of ['SKILL.md', 'references/cli.md', 'references/profiles.md', 'references/operations.md', 'references/revision.md']) {
    assert.deepEqual(readFileSync(join(installed, 'skills/author-standards', resource)),
      readFileSync(resolve('skills/author-standards', resource)));
  }
  const standaloneSkill = join(root, 'standalone-author-standards');
  cpSync(join(installed, 'skills/author-standards'), standaloneSkill, { recursive: true });
  const acquisition = readFileSync(join(standaloneSkill, 'references/cli.md'), 'utf8');
  const documentedVersions = [...acquisition.matchAll(/@lutzseverino\/repo-standards@(\d+\.\d+\.\d+)/g)];
  assert.ok(documentedVersions.length > 0, 'The standalone skill must document exact CLI acquisition');
  for (const match of documentedVersions) assert.equal(match[1], bundle.version, 'Authoring must acquire the released CLI and its matching contracts');
  // The package carries only product material: no development records, ADRs,
  // agent process guidance, documentation index, or contribution rules.
  const packaged = execFileSync('tar', ['-tzf', join(output, bundle.tarball)], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map(entry => entry.replace(/^package\//, ''));
  const entries = (prefix: string) => [...new Set(packaged.filter(entry => entry.startsWith(prefix))
    .map(entry => entry.slice(prefix.length).split('/')[0]!))].sort();
  assert.deepEqual(entries(''), ['LICENSE', 'README.md', 'bootstrap', 'dist', 'docs', 'examples', 'package.json', 'skills']);
  const compatibilityDocuments = ['adoption', 'assessment-protocol', 'author-format', 'authoring', 'discovery', 'inspection', 'installation', 'script-protocol'];
  assert.deepEqual(entries('docs/'), [...compatibilityDocuments.map(doc => `${doc}.md`), 'usage'].sort());
  assert.deepEqual(entries('docs/usage/'), readdirSync(resolve('docs/usage')).sort());
  for (const doc of compatibilityDocuments) {
    const canonical = readFileSync(join(installed, `docs/usage/${doc}.md`), 'utf8');
    const compatible = readFileSync(join(installed, `docs/${doc}.md`), 'utf8');
    assert.ok(canonical.length > 0);
    assert.deepEqual([...compatible.matchAll(/^#{1,6} .+$/gm)].map(match => match[0]),
      [...canonical.matchAll(/^#{1,6} .+$/gm)].map(match => match[0]), 'Legacy paths preserve document sections and anchors');
  }
  // Every packaged document must resolve its own local links inside the package.
  for (const documentPath of packaged.filter(entry => entry.endsWith('.md'))) {
    const content = readFileSync(join(installed, documentPath), 'utf8');
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1]!.split('#')[0]!.split('?')[0]!;
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const linked = resolve(installed, dirname(documentPath), target);
      assert.ok(!relative(installed, linked).startsWith('..') && existsSync(linked), `${documentPath} links to missing ${target}`);
    }
  }
  for (const author of ['alice', 'mira']) {
    const result = spawnSync(cli, ['source', 'validate', join(installed, 'examples', author), '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).valid, true);
  }
});

test('the packed README reaches repository documents outside the package through absolute repository URLs', t => {
  const links = (markdown: string) => [...markdown.matchAll(/\]\(([^\s)]+)\)/g)].map(match => match[1]!);
  const local = (target: string) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target);
  const source = links(readFileSync(resolve('README.md'), 'utf8'));
  // The source README links repository documents relatively, and each resolves
  // inside the repository.
  for (const target of source) {
    assert.doesNotMatch(target, /^https:\/\/github\.com\/lutzseverino\/repo-standards\/(?:blob|tree)\//,
      'The source README links repository documents relatively');
    if (!local(target)) continue;
    const linked = resolve(target.split('#')[0]!);
    assert.ok(!relative(resolve('.'), linked).startsWith('..') && existsSync(linked), `README.md links to missing ${target}`);
  }
  const root = mkdtempSync(join(tmpdir(), 'repo-standards-readme-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packed = packPackage(root);
  const tarball = join(root, packed.filename);
  const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map(entry => entry.replace(/^package\//, ''));
  const readme = execFileSync('tar', ['-xzOf', tarball, 'package/README.md'], { encoding: 'utf8' });
  const packedLinks = links(readme);
  assert.equal(packedLinks.length, source.length, 'Packing keeps every README link');
  let rewritten = 0;
  let kept = 0;
  source.forEach((target, index) => {
    const [path, fragment] = target.split(/(?=#)/);
    const inPackage = entries.some(entry => entry === path || entry.startsWith(`${path}/`));
    if (!local(target) || inPackage) {
      assert.equal(packedLinks[index], target, `The packed README keeps ${target}`);
      if (local(target)) kept += 1;
      return;
    }
    // GitHub addresses directories as trees and files as blobs.
    const kind = statSync(resolve(path!)).isDirectory() ? 'tree' : 'blob';
    assert.equal(packedLinks[index], `https://github.com/lutzseverino/repo-standards/${kind}/main/${path}${fragment ?? ''}`,
      `The packed README links ${target} outside the package by absolute repository URL`);
    rewritten += 1;
  });
  assert.ok(rewritten > 0 && kept > 0, 'The README exercises both packaged and repository-only links');
});

test('an independently installed later CLI package reports its exact release version', t => {
  const current = installCli();
  t.after(() => current.close());
  const candidate = join(current.root, 'candidate');
  cpSync(join(current.root, 'node_modules/@lutzseverino/repo-standards'), candidate, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8'));
  writeFileSync(join(candidate, 'package.json'), JSON.stringify({ ...manifest, version: '1.99.42' }));
  const previous = process.cwd();
  process.chdir(candidate);
  try {
    const installed = installCli();
    t.after(() => installed.close());
    assert.equal(installed.run(['--version'], candidate).stdout.trim(), '1.99.42');
  } finally { process.chdir(previous); }
});
