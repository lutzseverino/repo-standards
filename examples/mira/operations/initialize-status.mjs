import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const target = 'docs/operating-status.json';
if (input.format !== 'repo-standards/operation/v1' || !input.allowedTargets.paths.includes(target)) {
  throw new Error('Expected operation input allowing the operating status file.');
}
const path = join(input.projectRoot, target);
const exists = existsSync(path);
if (!exists) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ status: 'unverified' }, null, 2) + '\n');
}
console.log(JSON.stringify({ format: 'repo-standards/result/v1', status: exists ? 'unchanged' : 'changed',
  message: exists ? 'Preserved existing operating status.' : 'Initialized operating status without claiming deployment verification.' }));
