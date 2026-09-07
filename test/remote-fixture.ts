import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
export function remoteFixture(yaml: string, files: Record<string, string | Buffer> = {}, executables: string[] = [], repository = 'alice/standards') {
  const source = sourceFixture(yaml, files);
  for (const path of executables) chmodSync(join(source.root, path), 0o755);
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
  const prefix = `https://api.github.com/repos/${repository}`;
  const sha = git(source.root, 'rev-parse', 'HEAD');
  const treeSha = git(source.root, 'rev-parse', 'HEAD^{tree}');
  const responses: Record<string, { body: unknown; status?: number }> = {
    [prefix]: { body: { private: false, full_name: repository, html_url: `https://github.com/${repository}` } },
  };
  function publish(tag: string) {
    const publishedSha = git(source.root, 'rev-parse', 'HEAD');
    const publishedTreeSha = git(source.root, 'rev-parse', 'HEAD^{tree}');
    const tree = git(source.root, 'ls-tree', '-r', 'HEAD').split('\n').filter(Boolean).map(line => {
      const [metadata, path] = line.split('\t');
      const [mode, type, blobSha] = metadata!.split(' ');
      return { mode, type, sha: blobSha, path: JSON.parse(path!.startsWith('"') ? path! : JSON.stringify(path)) as string };
    });
    responses[`${prefix}/git/ref/tags/${tag}`] = { body: { ref: `refs/tags/${tag}`, object: { type: 'commit', sha: publishedSha } } };
    responses[`${prefix}/git/commits/${publishedSha}`] = { body: { sha: publishedSha, tree: { sha: publishedTreeSha } } };
    responses[`${prefix}/git/trees/${publishedTreeSha}?recursive=1`] = { body: { sha: publishedTreeSha, truncated: false, tree } };
    for (const entry of tree) {
      if (entry.type === 'blob' && entry.mode !== '120000') responses[`${prefix}/git/blobs/${entry.sha}`] = {
        body: { sha: entry.sha, encoding: 'base64', content: readFileSync(join(source.root, entry.path)).toString('base64') },
      };
    }
    return { sha: publishedSha, treeSha: publishedTreeSha };
  }
  publish('v1.0.0');
  const save = () => writeFileSync(dataFile, JSON.stringify(responses));
  save();
  const cache = join(support.root, 'cache');
  mkdirSync(cache);
  return {
    source, support, prefix, sha, treeSha, responses, save,
    addVersion(tag: string, nextYaml: string, nextFiles: Record<string, string | Buffer> = {}, nextExecutables: string[] = []) {
      writeFileSync(join(source.root, 'standards.yaml'), nextYaml);
      for (const [path, content] of Object.entries(nextFiles)) {
        const target = join(source.root, path);
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, content);
      }
      for (const path of nextExecutables) chmodSync(join(source.root, path), 0o755);
      commit(source.root);
      const published = publish(tag);
      save();
      return published;
    },
    env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(loader).href}`, XDG_CACHE_HOME: cache },
    close() { source.close(); support.close(); },
  };
}

export const inspectionArgs = ['inspect', '--source', 'https://github.com/alice/standards', '--standards-version', 'v1.0.0', '--profile', 'work', '--json'];
