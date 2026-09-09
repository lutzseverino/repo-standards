import { execFileSync, spawnSync } from 'node:child_process';
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

// Every test invokes the packed, independently installed executable, never src/.
export function installCli() {
  const root = mkdtempSync(join(tmpdir(), 'repo-standards-cli-'));
  try {
    const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root], { encoding: 'utf8' }));
    execFileSync('npm', ['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund',
      join(root, packed.filename)], { stdio: 'pipe' });
    return {
      root,
      version: packed.version as string,
      run(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
        return spawnSync(join(root, 'node_modules/.bin/repo-standards'), args, { cwd, env, encoding: 'utf8' });
      },
      close() { rmSync(root, { recursive: true, force: true }); },
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function sourceFixture(yaml: string, files: Record<string, string | Buffer> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-standards-source-')));
  execFileSync('git', ['init', '--quiet', root]);
  // Fixture commits must finish all writes before preservation snapshots begin.
  // Recent Git versions otherwise launch detached automatic maintenance.
  execFileSync('git', ['-C', root, 'config', 'maintenance.auto', 'false']);
  for (const [path, content] of Object.entries({ ...files, 'standards.yaml': yaml })) {
    const target = resolve(root, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
  return { root, close() { rmSync(root, { recursive: true, force: true }); } };
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
