import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceFixture } from './installed-cli.ts';

// A real npm registry boundary: npm resolves an exact package, installs its
// dependencies, and writes a portable lock using an HTTP tarball and integrity.
export async function registryFixture(cliRoot: string) {
  const support = sourceFixture('');
  const tarball = join(cliRoot, 'lutzseverino-repo-standards-1.0.0.tgz');
  const manifest = JSON.parse(readFileSync(join(cliRoot, 'node_modules/@lutzseverino/repo-standards/package.json'), 'utf8'));
  const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
  const script = join(support.root, 'registry.mjs');
  writeFileSync(script, `import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const server = createServer((req, res) => {
  if (req.url === '/package.tgz') { res.end(readFileSync(${JSON.stringify(tarball)})); return; }
  if (decodeURIComponent(req.url).startsWith('/@lutzseverino/repo-standards')) {
    const version = {...${JSON.stringify(manifest)}, dist: {tarball: 'http://127.0.0.1:' + server.address().port + '/package.tgz', integrity: ${JSON.stringify(integrity)}}};
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({name: version.name, 'dist-tags': {latest: version.version}, versions: {[version.version]: version}}));
  } else { res.writeHead(302, {location: 'https://registry.npmjs.org' + req.url}); res.end(); }
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
