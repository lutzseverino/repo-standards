// Package the already-built output; pnpm release:pack builds before invoking this.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'release');
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
if (manifest.name !== '@lutzseverino/repo-standards' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) {
  throw new Error('Release requires the agreed package name and an exact stable version.');
}
// Refuse existing output so an earlier version cannot leak into release assets.
mkdirSync(output);
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], { encoding: 'utf8' }));
copyFileSync('bootstrap/repo-standards', join(output, 'repo-standards-bootstrap'));
chmodSync(join(output, 'repo-standards-bootstrap'), 0o755);
const artifacts = [packed.filename, 'repo-standards-bootstrap'].map(file => ({
  file, sha256: createHash('sha256').update(readFileSync(join(output, file))).digest('hex'),
}));
writeFileSync(join(output, 'SHA256SUMS'), artifacts.map(({ file, sha256 }) => `${sha256}  ${file}\n`).join(''));
writeFileSync(join(output, 'release.json'), JSON.stringify({
  package: manifest.name, version: manifest.version, tarball: packed.filename,
  integrity: packed.integrity, artifacts,
}, null, 2) + '\n');
console.log(join(output, 'release.json'));
