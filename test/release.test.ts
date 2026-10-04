import type { PackageManifest, SourceValidation } from './json-reports.ts';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { packPackage } from '../scripts/pack-package.ts';
import { installCli } from './installed-cli.ts';

test('release artifacts install without build tools and expose the matching CLI, bootstrap, skill and author documentation', t => {
  const root = mkdtempSync(join(tmpdir(), 'repo-standards-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'release');
  execFileSync(process.execPath, ['scripts/pack-release.ts', output], { stdio: 'pipe' });
  const bundle = JSON.parse(readFileSync(join(output, 'release.json'), 'utf8')) as { package: string; version: string; tarball: string; integrity: string; artifacts: { file: string; sha256: string }[] };
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
  const adoptionResources = ['SKILL.md', 'references/discovery.md', 'references/assessment.md', 'references/recovery.md', 'references/review.md'];
  for (const resource of adoptionResources) {
    assert.deepEqual(readFileSync(join(installed, 'skills/adopt-standards', resource)),
      readFileSync(resolve('skills/adopt-standards', resource)));
  }
  // The adoption skill routes only to its own references, never into a package
  // docs/ directory. It links contracts at this exact version.
  assert.doesNotMatch(readFileSync(join(installed, 'skills/adopt-standards/SKILL.md'), 'utf8')
    .replace(/\(https:\/\/github\.com\/lutzseverino\/repo-standards\/blob\/v[^)]+\)/g, ''), /\bdocs\//);
  // The skill tells the agent to keep the external CLI directory, so its
  // installation prints that directory expanded.
  assert.match(readFileSync(join(installed, 'skills/adopt-standards/SKILL.md'), 'utf8'), /^printf '[^'\n]*%s\\n' "\$cli_dir"$/m);
  const contractLinks = adoptionResources
    .flatMap(resource => [...readFileSync(join(installed, 'skills/adopt-standards', resource), 'utf8')
      .matchAll(/\]\(https:\/\/github\.com\/lutzseverino\/repo-standards\/blob\/v([^/)]+)\/([^)#]+)(?:#([^)]+))?\)/g)]
      .map(match => ({ resource, version: match[1]!, path: match[2]!, anchor: match[3] })));
  assert.ok(contractLinks.length > 0, 'The adoption references link the contracts they rely on');
  // An adopting project installs the skill alone, so its local links stay inside
  // the skill and its product repository links name this release's tag.
  for (const resource of adoptionResources) {
    const content = readFileSync(join(installed, 'skills/adopt-standards', resource), 'utf8');
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1]!;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
        if (target.startsWith('https://github.com/lutzseverino/repo-standards/')) {
          assert.match(target, new RegExp(`^https://github\\.com/lutzseverino/repo-standards/blob/v${bundle.version.replaceAll('.', '\\.')}/`),
            `${resource} links ${target} at a moving or other revision`);
        }
        continue;
      }
      const linked = resolve(installed, 'skills/adopt-standards', dirname(resource), target.split('#')[0]!);
      assert.ok(!relative(join(installed, 'skills/adopt-standards'), linked).startsWith('..'), `${resource} links ${target} outside the skill`);
    }
  }
  for (const link of contractLinks) {
    assert.equal(link.version, bundle.version, `${link.resource} links a contract at another version`);
    assert.match(link.path, /^docs\/usage\//, `${link.resource} links ${link.path}, which is not a contract`);
    assert.ok(existsSync(join(installed, link.path)), `${link.resource} links missing ${link.path}`);
    if (link.anchor) assert.ok(headingAnchors(readFileSync(join(installed, link.path), 'utf8')).has(link.anchor),
      `${link.resource} links missing ${link.path}#${link.anchor}`);
  }
  // The update notice ships whole, and every product skill leaves delivery
  // vocabulary to standards sources.
  for (const resource of ['SKILL.md', 'agents/openai.yaml']) {
    assert.deepEqual(readFileSync(join(installed, 'skills/standards-updates', resource)),
      readFileSync(resolve('skills/standards-updates', resource)));
  }
  assert.deepEqual(readdirSync(join(installed, 'skills')).sort(), ['adopt-standards', 'author-standards', 'standards-updates']);
  for (const skill of readdirSync(join(installed, 'skills'))) {
    for (const resource of readdirSync(join(installed, 'skills', skill), { recursive: true, encoding: 'utf8' }).filter(path => path.endsWith('.md'))) {
      const content = readFileSync(join(installed, 'skills', skill, resource), 'utf8').replace(/\s+/g, ' ');
      assert.doesNotMatch(content, /\b(?:tickets?|issues?|pull requests?|PRs?)\b/i, `skills/${skill}/${resource} uses workflow vocabulary`);
    }
  }
  for (const [name, disabled, implicit] of [['adopt-standards', true, false], ['standards-updates', false, true], ['author-standards', false, true]] as const) {
    const skill = readFileSync(join(installed, 'skills', name, 'SKILL.md'), 'utf8');
    assert.equal((parse(skill.match(/^---\n([\s\S]*?)\n---\n/)![1]!) as { 'disable-model-invocation': boolean })['disable-model-invocation'], disabled);
    const policy = readFileSync(join(installed, 'skills', name, 'agents/openai.yaml'), 'utf8');
    assert.equal((parse(policy) as { policy: { allow_implicit_invocation: boolean } }).policy.allow_implicit_invocation, implicit);
    assert.deepEqual(policy, readFileSync(resolve('skills', name, 'agents/openai.yaml'), 'utf8'));
  }
  const authoringResources = ['SKILL.md', 'references/cli.md', 'references/profiles.md', 'references/operations.md', 'references/revision.md'];
  for (const resource of authoringResources) {
    assert.deepEqual(readFileSync(join(installed, 'skills/author-standards', resource)),
      readFileSync(resolve('skills/author-standards', resource)));
  }
  // The authoring skill reads the matching package's usage documents by their
  // canonical paths. The skill names each document path in backticks.
  const skillDocuments = authoringResources
    .flatMap(resource => [...readFileSync(join(installed, 'skills/author-standards', resource), 'utf8').matchAll(/`(?:[^`\s]*\/@lutzseverino\/repo-standards\/)?(docs\/[^`\s]+\.md)`/g)].map(match => match[1]!));
  assert.ok(skillDocuments.length > 0);
  for (const document of skillDocuments) {
    assert.match(document, /^docs\/usage\//, `The authoring skill names ${document} outside docs/usage/`);
    assert.ok(existsSync(join(installed, document)), `The authoring skill names missing ${document}`);
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
  // Usage documents ship only at their canonical paths under docs/usage/.
  assert.deepEqual(entries('docs/'), ['usage']);
  assert.deepEqual(entries('docs/usage/'), readdirSync(resolve('docs/usage')).sort());
  // No packaged document names a usage document at a legacy docs/<name>.md path.
  const usageDocuments = new Set(readdirSync(resolve('docs/usage')).filter(name => name !== 'README.md'));
  for (const documentPath of packaged.filter(entry => entry.endsWith('.md'))) {
    const content = readFileSync(join(installed, documentPath), 'utf8');
    const legacy = [...content.matchAll(/\bdocs\/([\w-]+\.md)/g)].filter(match => usageDocuments.has(match[1]!));
    assert.deepEqual(legacy.map(match => match[0]), [], `${documentPath} names a legacy usage document path`);
  }
  // Every packaged document must resolve its own local links, and their
  // section anchors, inside the package.
  for (const documentPath of packaged.filter(entry => entry.endsWith('.md'))) {
    const content = readFileSync(join(installed, documentPath), 'utf8');
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const [path, anchor] = match[1]!.split('?')[0]!.split('#') as [string, string | undefined];
      if (/^[a-z][a-z0-9+.-]*:/i.test(path)) continue;
      const linked = path ? resolve(installed, dirname(documentPath), path) : join(installed, documentPath);
      assert.ok(!relative(installed, linked).startsWith('..') && existsSync(linked), `${documentPath} links to missing ${path}`);
      if (anchor && linked.endsWith('.md')) assert.ok(headingAnchors(readFileSync(linked, 'utf8')).has(anchor),
        `${documentPath} links to missing ${match[1]}`);
    }
  }
  // Usage documents hold contracts and human how-to. Instructions to an agent
  // live in the adoption skill's references.
  for (const documentPath of packaged.filter(entry => entry.startsWith('docs/usage/'))) {
    const content = readFileSync(join(installed, documentPath), 'utf8').replace(/\s+/g, ' ');
    for (const instruction of [/\bthe agent (?:must|should|rechecks|writes|reads)\b/i, /\b(?:have|ask) the agent\b/i,
      /\byour (?:judgment|evidence|last edit)\b/i, /\bshow the maintainer\b/i, /\bpreserve the work\b/i,
      /\bobtain (?:an )?explicit (?:retry|abandonment)\b/i]) {
      assert.ok(!instruction.test(content), `${documentPath} addresses an agent: ${content.match(instruction)?.[0]}`);
    }
  }
  for (const author of ['alice', 'mira']) {
    const result = spawnSync(cli, ['source', 'validate', join(installed, 'examples', author), '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal((JSON.parse(result.stdout) as SourceValidation).valid, true);
  }
});

// The anchors GitHub derives from a Markdown document's headings.
function headingAnchors(markdown: string) {
  return new Set([...markdown.replace(/^```[\s\S]*?^```/gm, '').matchAll(/^#{1,6}\s+(.+?)\s*$/gm)]
    .map(match => match[1]!.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')));
}

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
  assert.ok(readme.includes('](https://github.com/lutzseverino/repo-standards/blob/main/docs/development/architecture.md)'));
  assert.ok(readme.includes('](https://github.com/lutzseverino/repo-standards/blob/main/CONTRIBUTING.md)'));
  assert.ok(readme.includes('](docs/usage/installation.md)'));
});

test('packing keeps README query strings and fragments on repository URLs and rejects links that leave the repository', t => {
  const project = mkdtempSync(join(tmpdir(), 'repo-standards-readme-project-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const pack = (readme: string) => {
    writeFileSync(join(project, 'README.md'), readme);
    const output = mkdtempSync(join(project, 'output-'));
    const previous = process.cwd();
    process.chdir(project);
    try {
      const packed = packPackage(output);
      return execFileSync('tar', ['-xzOf', join(output, packed.filename), 'package/README.md'], { encoding: 'utf8' });
    } finally { process.chdir(previous); }
  };
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'readme-fixture', version: '1.0.0', files: [],
    repository: { type: 'git', url: 'git+https://github.com/example/fixture.git' } }));
  writeFileSync(join(project, 'LICENSE'), 'License\n');
  writeFileSync(join(project, 'GUIDE.md'), '# Guide\n');
  assert.equal(pack('[guide](GUIDE.md?plain=1#guide) [license](LICENSE#top)\n'),
    '[guide](https://github.com/example/fixture/blob/main/GUIDE.md?plain=1#guide) [license](LICENSE#top)\n');
  for (const target of ['..', '../x', 'docs/../../x']) {
    assert.throws(() => pack(`[outside](${target})\n`), /leaves the repository/, target);
  }
  assert.throws(() => pack('[missing](MISSING.md)\n'), /not in the repository/);
});

test('an independently installed later CLI package reports its exact release version', t => {
  const current = installCli();
  t.after(() => current.close());
  const candidate = join(current.root, 'candidate');
  cpSync(join(current.root, 'node_modules/@lutzseverino/repo-standards'), candidate, { recursive: true });
  const manifest = (JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8')) as PackageManifest);
  writeFileSync(join(candidate, 'package.json'), JSON.stringify({ ...manifest, version: '1.99.42' }));
  const previous = process.cwd();
  process.chdir(candidate);
  try {
    const installed = installCli();
    t.after(() => installed.close());
    assert.equal(installed.run(['--version'], candidate).stdout.trim(), '1.99.42');
  } finally { process.chdir(previous); }
});
