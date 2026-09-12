import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
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
  for (const doc of ['installation', 'release', 'inspection', 'adoption', 'assessment-protocol', 'authoring', 'author-format', 'discovery', 'script-protocol']) {
    assert.ok(readFileSync(join(installed, `docs/${doc}.md`)).length > 0);
  }
  for (const author of ['alice', 'mira']) {
    const result = spawnSync(cli, ['source', 'validate', join(installed, 'examples', author), '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).valid, true);
  }
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
