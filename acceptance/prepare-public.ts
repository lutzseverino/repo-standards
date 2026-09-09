// Prepare a disposable real-agent journey with public npm/GitHub acquisition.
// This performs no adoption, contextual edits or assessment.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureFiles, sourceFixture } from '../test/installed-cli.ts';
import { commit, git } from '../test/remote-fixture.ts';

const [version, source, standardsVersion, profile, projectName] = process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+$/.test(version) || !source?.startsWith('https://github.com/') || !standardsVersion || !profile || !['bob', 'harbor'].includes(projectName!)) {
  throw new Error('Usage: node acceptance/prepare-public.ts <CLI-version> <public-source-URL> <standards-tag> <profile> <bob|harbor>');
}
if (process.env.NODE_OPTIONS) throw new Error('Run public acceptance without NODE_OPTIONS or acquisition fixtures.');
const root = mkdtempSync(join(tmpdir(), 'repo-standards-public-agent-'));
const env = { ...process.env, npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_cache: join(root, 'npm-cache'), XDG_CACHE_HOME: join(root, 'cache') };
execFileSync('npm', ['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `@lutzseverino/repo-standards@${version}`], { cwd: root, env, stdio: 'pipe' });
const project = sourceFixture('', fixtureFiles(`acceptance/projects/${projectName}`));
rmSync(join(project.root, 'standards.yaml'));
commit(project.root);
const session = join(root, 'journey.json');
writeFileSync(session, JSON.stringify({
  project: project.root, cli: join(root, 'node_modules/.bin/repo-standards'),
  package: join(root, 'node_modules/@lutzseverino/repo-standards'),
  source, standardsVersion, profile, head: git(project.root, 'rev-parse', 'HEAD'),
  acquisition: 'Public npm and GitHub; no remote fixtures',
  runtimeLock: JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')),
  env: { npm_config_registry: env.npm_config_registry, npm_config_cache: env.npm_config_cache, XDG_CACHE_HOME: env.XDG_CACHE_HOME },
}, null, 2) + '\n');
console.log(session);
