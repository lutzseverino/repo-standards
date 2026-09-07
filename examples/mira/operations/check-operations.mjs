import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const targets = ['docs/operations.md', 'docs/operating-status.json'];
if (input.format !== 'repo-standards/operation/v1' || targets.some(path => !input.allowedTargets.paths.includes(path))) {
  throw new Error('Expected operation input allowing the runbook and operating status.');
}
const sections = JSON.parse(readFileSync(new URL('./required-sections.json', import.meta.url), 'utf8'));
const paths = targets.map(path => join(input.projectRoot, path));
const text = existsSync(paths[0]) ? readFileSync(paths[0], 'utf8') : '';
const headings = new Set([...text.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map(match => match[1]));
const missing = sections.filter(section => !headings.has(section));
let unverified = false;
try { unverified = JSON.parse(readFileSync(paths[1], 'utf8')).status === 'unverified'; } catch { /* Report malformed or missing status as a failed check. */ }
console.log(JSON.stringify({ format: 'repo-standards/result/v1', status: !missing.length && unverified ? 'passed' : 'failed',
  message: missing.length ? `Missing runbook sections: ${missing.join(', ')}` : unverified
    ? 'Runbook sections are present; deployment remains unverified.' : 'Operating status must remain unverified.' }));
