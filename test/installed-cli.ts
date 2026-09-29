import { packPackage } from '../scripts/pack-package.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function snapshot(root: string): unknown {
  return readdirSync(root).sort().map(name => {
    const path = join(root, name);
    const stat = lstatSync(path);
    return [name, stat.mode, stat.isSymbolicLink() ? readlinkSync(path) : stat.isDirectory() ? snapshot(path) : readFileSync(path).toString('base64')];
  });
}

// Reports and run records carry hashes, never file bytes: list every place a
// value still embeds content.
export function embeddedContent(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(['content', 'encoding'].includes(key) ? [`${path}.${key}`] : []),
    ...embeddedContent(child, `${path}.${key}`),
  ]);
}

export function sha256(bytes: string | Buffer) { return createHash('sha256').update(bytes).digest('hex'); }

// Every fixture directory still present when the test process exits, such as
// one whose test failed before registering its teardown, is removed then.
const fixtureRoots = new Set<string>();
process.on('exit', () => { for (const root of fixtureRoots) remove(root); });
function track(root: string) {
  fixtureRoots.add(root);
  return root;
}
function remove(root: string) {
  fixtureRoots.delete(root);
  rmSync(root, { recursive: true, force: true });
}

// Every test invokes the packed, independently installed executable, never src/.
export function installCli() {
  const root = track(mkdtempSync(join(tmpdir(), 'repo-standards-cli-')));
  try {
    const packed = packPackage(root);
    execFileSync('npm', ['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund',
      join(root, packed.filename)], { stdio: 'pipe' });
    return {
      root,
      version: packed.version as string,
      run(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
        // A report carries the observed product state, which an established
        // adopter grows well past Node's default 1 MiB capture buffer.
        return spawnSync(join(root, 'node_modules/.bin/repo-standards'), args, { cwd, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
      },
      close() { remove(root); },
    };
  } catch (error) {
    remove(root);
    throw error;
  }
}

export function sourceFixture(yaml: string, files: Record<string, string | Buffer> = {}) {
  const root = track(realpathSync(mkdtempSync(join(tmpdir(), 'repo-standards-source-'))));
  execFileSync('git', ['init', '--quiet', root]);
  // Fixture commits must finish all writes before preservation snapshots begin.
  // Recent Git versions otherwise launch detached automatic maintenance.
  execFileSync('git', ['-C', root, 'config', 'maintenance.auto', 'false']);
  for (const [path, content] of Object.entries({ ...files, 'standards.yaml': yaml })) {
    const target = resolve(root, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
  return { root, close() { remove(root); } };
}

// Read ordinary source/project fixtures without coupling tests to their layout.
export function fixtureFiles(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const path = join(entry.parentPath, entry.name);
      return [path.slice(root.length + 1), readFileSync(path, 'utf8')];
    }));
}
