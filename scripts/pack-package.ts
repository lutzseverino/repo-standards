import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';

// The manifest lists the legacy `docs/<name>.md` paths that independently
// installed skills still use. They are not source files: staging generates each
// one from the usage document of the same name.
const compatibilityPath = /^docs\/[^/]+\.md$/;

export function packPackage(output: string) {
  const project = process.cwd();
  const destination = resolve(output);
  const staging = mkdtempSync(join(tmpdir(), 'repo-standards-package-'));
  try {
    const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
    const files: string[] = manifest.files;
    for (const path of new Set(['package.json', 'README.md', 'LICENSE', ...files.filter(path => !compatibilityPath.test(path))])) {
      cpSync(join(project, path), join(staging, path), { recursive: true });
    }
    for (const legacy of files.filter(path => compatibilityPath.test(path))) {
      const canonical = `docs/usage/${posix.basename(legacy)}`;
      const content = readFileSync(join(staging, canonical), 'utf8');
      // Preserve the full document and headings; relative links must resolve
      // from the legacy location as well as from the categorized source.
      const compatible = content.replace(/\]\(([^\s)]+)\)/g, (link, target: string) => {
        if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return link;
        const resolved = posix.normalize(posix.join(posix.dirname(canonical), target));
        return `](${posix.relative(posix.dirname(legacy), resolved)})`;
      });
      writeFileSync(join(staging, legacy), compatible);
    }
    const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json',
      '--pack-destination', destination], { cwd: staging, encoding: 'utf8' }));
    return packed as { filename: string; version: string; integrity: string };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
