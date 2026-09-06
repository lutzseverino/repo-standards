import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sourceFixture } from './installed-cli.ts';

export function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim();
}

export function commit(root: string) {
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
}

// Replace HTTPS responses at the process boundary; the installed CLI still
// resolves tags, acquires Git objects, validates, and inspects real repositories.
export function remoteFixture(yaml: string, files: Record<string, string> = {}) {
  const source = sourceFixture(yaml, files);
  commit(source.root);
  const support = sourceFixture('');
  const dataFile = join(support.root, 'responses.json');
  const loader = join(support.root, 'https-fixture.mjs');
  writeFileSync(loader, `import { readFileSync } from 'node:fs';
globalThis.fetch = async (url) => {
  const responses = JSON.parse(readFileSync(${JSON.stringify(dataFile)}, 'utf8'));
  const entry = responses[String(url)];
  if (!entry) throw new Error('Unexpected remote request: ' + url);
  return new Response(JSON.stringify(entry.body), {status: entry.status ?? 200});
};\n`);
  const prefix = 'https://api.github.com/repos/alice/standards';
  const sha = git(source.root, 'rev-parse', 'HEAD');
  const treeSha = git(source.root, 'rev-parse', 'HEAD^{tree}');
  const tree = git(source.root, 'ls-tree', '-r', 'HEAD').split('\n').filter(Boolean).map(line => {
    const [metadata, path] = line.split('\t');
    const [mode, type, sha] = metadata!.split(' ');
    return { mode, type, sha, path: JSON.parse(path!.startsWith('"') ? path! : JSON.stringify(path)) as string };
  });
  const responses: Record<string, { body: unknown; status?: number }> = {
    [prefix]: { body: { private: false, full_name: 'alice/standards', html_url: 'https://github.com/alice/standards' } },
    [`${prefix}/git/ref/tags/v1.0.0`]: { body: { ref: 'refs/tags/v1.0.0', object: { type: 'commit', sha } } },
    [`${prefix}/git/commits/${sha}`]: { body: { sha, tree: { sha: treeSha } } },
    [`${prefix}/git/trees/${treeSha}?recursive=1`]: { body: { sha: treeSha, truncated: false, tree } },
  };
  for (const entry of tree) {
    if (entry.type === 'blob' && entry.mode !== '120000') responses[`${prefix}/git/blobs/${entry.sha}`] = {
      body: { sha: entry.sha, encoding: 'base64', content: readFileSync(join(source.root, entry.path)).toString('base64') },
    };
  }
  const save = () => writeFileSync(dataFile, JSON.stringify(responses));
  save();
  const cache = join(support.root, 'cache');
  mkdirSync(cache);
  return {
    source, support, prefix, sha, treeSha, responses, save,
    env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(loader).href}`, XDG_CACHE_HOME: cache },
    close() { source.close(); support.close(); },
  };
}

export const inspectionArgs = ['inspect', '--source', 'https://github.com/alice/standards', '--standards-version', 'v1.0.0', '--profile', 'work', '--json'];
