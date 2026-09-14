import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const requiredSections = JSON.parse(readFileSync(
  new URL('./required-sections.json', import.meta.url), 'utf8'));
const runbooks = input.allowedTargets.paths.filter(path => path.endsWith('/operations.md'));
const statuses = input.allowedTargets.paths.filter(path => path.endsWith('/operating-status.json'));

if (input.operation.phase === 'fixes') {
  const changed = [];
  for (const path of statuses) {
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({
      startup: 'unverified',
      health: 'unverified',
      restart: 'unverified',
      evidence: ['Generated placeholder; replace with observations during contextual work.'],
    }, null, 2) + '\n');
    changed.push(path);
  }
  console.log(JSON.stringify({
    format: 'repo-standards/result/v1',
    status: changed.length > 0 ? 'changed' : 'unchanged',
    message: changed.length > 0
      ? `Initialized service status: ${changed.join(', ')}`
      : 'Every confirmed service status already exists.',
  }));
  process.exit(0);
}

const problems = [];
for (const path of runbooks) {
  if (!existsSync(path)) {
    problems.push(`${path} is missing`);
    continue;
  }
  const content = readFileSync(path, 'utf8');
  for (const section of requiredSections) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, 'mi').test(content)) {
      problems.push(`${path} lacks ${section}`);
    }
  }
}
for (const path of statuses) {
  if (!existsSync(path)) {
    problems.push(`${path} is missing`);
    continue;
  }
  try {
    const status = JSON.parse(readFileSync(path, 'utf8'));
    for (const field of ['startup', 'health', 'restart']) {
      if (!['observed', 'unverified'].includes(status[field])) {
        problems.push(`${path} has invalid ${field} evidence`);
      }
    }
    if (!Array.isArray(status.evidence) || status.evidence.length === 0 ||
        status.evidence.some(value => typeof value !== 'string' || value.trim() === '')) {
      problems.push(`${path} needs nonempty evidence statements`);
    }
  } catch {
    problems.push(`${path} is not valid JSON`);
  }
}

console.log(JSON.stringify({
  format: 'repo-standards/result/v1',
  status: problems.length > 0 ? 'failed' : 'passed',
  message: problems.length > 0
    ? problems.join('; ')
    : runbooks.length === 0 && statuses.length === 0
      ? 'No operated services are in the confirmed scope.'
      : 'Confirmed service runbooks and status evidence are structurally complete.',
}));
