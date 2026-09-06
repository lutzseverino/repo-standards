import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Every test invokes the packed, independently installed executable, never src/.
export function installCli() {
  const root = mkdtempSync(join(tmpdir(), 'repo-standards-cli-'));
  try {
    execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', root], { stdio: 'pipe' });
    execFileSync('npm', ['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund',
      join(root, 'lutzseverino-repo-standards-1.0.0.tgz')], { stdio: 'pipe' });
    return {
      run(args: string[], cwd: string) {
        return spawnSync(join(root, 'node_modules/.bin/repo-standards'), args, { cwd, encoding: 'utf8' });
      },
      close() { rmSync(root, { recursive: true, force: true }); },
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function sourceFixture(yaml: string, files: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-standards-source-')));
  execFileSync('git', ['init', '--quiet', root]);
  for (const [path, content] of Object.entries({ ...files, 'standards.yaml': yaml })) {
    const target = resolve(root, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
  return { root, close() { rmSync(root, { recursive: true, force: true }); } };
}
