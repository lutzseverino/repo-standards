// Installation/setup only. A real agent must conduct the interview and create
// the source; this script supplies neither policies nor prewritten assessments.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const root = mkdtempSync(join(tmpdir(), 'repo-standards-author-'));
const isolatedHome = join(root, 'home');
const workspace = join(root, 'workspace');
const catalog = join(root, 'candidate');
for (const directory of [isolatedHome, workspace, catalog]) mkdirSync(directory);
cpSync(resolve('skills/author-standards'), join(catalog, 'author-standards'), { recursive: true });
// Isolate the installer's global destinations; never install into the user's
// actual agent directories. HOME and CODEX_HOME are child-process settings only.
const env = { ...process.env, HOME: isolatedHome, CODEX_HOME: join(isolatedHome, '.codex'),
  DISABLE_TELEMETRY: '1', NO_COLOR: '1' };
const args = ['exec', '--yes', '--registry=https://registry.npmjs.org', '--package=skills@1.5.25', '--',
  'skills', 'add', catalog, '--skill', 'author-standards', '--global', '--agent', 'codex', '--copy', '--yes'];
const output = execFileSync('npm', args, { cwd: workspace, env, encoding: 'utf8', stdio: 'pipe' });
writeFileSync(join(root, 'installation.txt'), stripVTControlCharacters(output).trimEnd() + '\n');
const skill = join(isolatedHome, '.agents/skills/author-standards');
const resources = readdirSync(skill, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => {
    const path = join(entry.parentPath, entry.name);
    return { path: path.slice(skill.length + 1),
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
  });
// The installed copy must survive removal of the installation source. No npm
// product package, product checkout, Git repository, or adopting project remains.
rmSync(catalog, { recursive: true });
const session = join(root, 'journey.json');
writeFileSync(session, JSON.stringify({
  kind: 'local author-standards candidate installation',
  root, workspace, skill, resources, installer: 'skills@1.5.25',
  command: ['npm', ...args], platform: process.platform, arch: process.arch,
  node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  installedAt: new Date().toISOString(),
}, null, 2) + '\n');
console.log(session);
