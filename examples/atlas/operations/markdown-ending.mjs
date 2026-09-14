import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const changed = [];
const invalid = [];

for (const target of input.allowedTargets.paths) {
  if (!target.endsWith('.md') || !existsSync(target) || !lstatSync(target).isFile()) continue;
  const path = resolve(target);
  const content = readFileSync(path);
  if (content.length > 0 && content.at(-1) === 0x0a) continue;
  if (input.operation.phase === 'fixes') {
    writeFileSync(path, Buffer.concat([content, Buffer.from('\n')]));
    changed.push(target);
  } else invalid.push(target);
}

const failed = input.operation.phase === 'checks' && invalid.length > 0;
console.log(JSON.stringify({
  format: 'repo-standards/result/v1',
  status: failed ? 'failed' : changed.length > 0 ? 'changed' : input.operation.phase === 'checks' ? 'passed' : 'unchanged',
  message: failed
    ? `Markdown files without a final newline: ${invalid.join(', ')}`
    : changed.length > 0 ? `Added final newlines: ${changed.join(', ')}` : 'Markdown endings already satisfy the source.',
}));
