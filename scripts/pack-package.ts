import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';

// An inline Markdown link target, and the targets that are not package-relative:
// absolute URLs, fragments, and root paths.
const markdownLink = /\]\(([^\s)]+)\)/g;
const nonRelativeLink = /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i;

export function packPackage(output: string) {
  const project = process.cwd();
  const destination = resolve(output);
  const staging = mkdtempSync(join(tmpdir(), 'repo-standards-package-'));
  try {
    const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
    const files: string[] = manifest.files;
    for (const path of new Set(['package.json', 'README.md', 'LICENSE', ...files])) {
      cpSync(join(project, path), join(staging, path), { recursive: true });
    }
    rewriteReadmeLinks(project, staging, manifest.repository.url);
    const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json',
      '--pack-destination', destination], { cwd: staging, encoding: 'utf8' }));
    return packed as { filename: string; version: string; integrity: string };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// The source README links repository documents relatively. The package carries
// only product material, so each link that leaves it becomes an absolute URL on
// the repository's `main` branch; links inside the package stay relative.
function rewriteReadmeLinks(project: string, staging: string, repositoryUrl: string) {
  const repository = repositoryUrl.replace(/^git\+/, '').replace(/\.git$/, '');
  const readme = join(staging, 'README.md');
  const packaged = readFileSync(readme, 'utf8').replace(markdownLink, (link, target: string) => {
    if (nonRelativeLink.test(target)) return link;
    // The path precedes any query string or fragment, which the URL keeps.
    const [, path = '', suffix = ''] = /^([^?#]*)(.*)$/.exec(target)!;
    const document = posix.normalize(path);
    if (document === '..' || document.startsWith('../')) {
      throw new Error(`README.md links to ${target}, which leaves the repository`);
    }
    if (existsSync(join(staging, document))) return link;
    if (!existsSync(join(project, document))) {
      throw new Error(`README.md links to ${target}, which is not in the repository`);
    }
    const kind = statSync(join(project, document)).isDirectory() ? 'tree' : 'blob';
    return `](${repository}/${kind}/main/${document}${suffix})`;
  });
  writeFileSync(readme, packaged);
}
