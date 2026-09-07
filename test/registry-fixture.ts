import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceFixture } from './installed-cli.ts';

// A real npm registry boundary: npm resolves an exact package, installs its
// dependencies, and writes a portable lock using an HTTP tarball and integrity.
export async function registryFixture(cliRoot: string, versions = ['1.0.0']) {
  const support = sourceFixture('');
  const installedPackage = join(cliRoot, 'node_modules/@lutzseverino/repo-standards');
  const baseManifest = JSON.parse(readFileSync(join(installedPackage, 'package.json'), 'utf8'));
  const packages: Record<string, { manifest: unknown; tarball: string; integrity: string }> = {};
  for (const version of versions) {
    let tarball = join(cliRoot, `lutzseverino-repo-standards-${version}.tgz`);
    let manifest = { ...baseManifest, version };
    if (version !== baseManifest.version) {
      const directory = join(support.root, `package-${version}`);
      cpSync(installedPackage, directory, { recursive: true });
      writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
      writeFileSync(join(directory, 'skills/adopt-standards/SKILL.md'), `${readFileSync(join(directory, 'skills/adopt-standards/SKILL.md'), 'utf8')}\nFixture CLI ${version}.\n`);
      execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', support.root], { cwd: directory, stdio: 'pipe' });
      tarball = join(support.root, `lutzseverino-repo-standards-${version}.tgz`);
    }
    packages[version] = { manifest, tarball, integrity: `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}` };
  }
  const script = join(support.root, 'registry.mjs');
  writeFileSync(script, `import { createServer } from 'node:http';
import { get } from 'node:https';
import { readFileSync } from 'node:fs';
const packages = ${JSON.stringify(packages)};
const server = createServer((req, res) => {
  const packageVersion = /^\\/package-(.+)\\.tgz$/.exec(req.url)?.[1];
  if (packageVersion && packages[packageVersion]) { res.end(readFileSync(packages[packageVersion].tarball)); return; }
  if (decodeURIComponent(req.url).startsWith('/@lutzseverino/repo-standards')) {
    const versions = Object.fromEntries(Object.entries(packages).map(([number, value]) => [number, {...value.manifest, dist: {tarball: 'http://127.0.0.1:' + server.address().port + '/package-' + number + '.tgz', integrity: value.integrity}}]));
    res.setHeader('content-type', 'application/json');
    const latest = Object.keys(versions).at(-1);
    res.end(JSON.stringify({name: '@lutzseverino/repo-standards', 'dist-tags': {latest}, versions}));
  } else {
    get('https://registry.npmjs.org' + req.url, {headers: {accept: req.headers.accept ?? 'application/json'}}, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    }).on('error', () => { res.writeHead(502); res.end(); });
  }
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
`);
  const server = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise<string>((resolve, reject) => {
    server.stdout.once('data', data => resolve(String(data).trim()));
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`Registry exited: ${code}`)));
  });
  return { env: { npm_config_registry: `http://127.0.0.1:${port}` }, close() { server.kill(); support.close(); } };
}
