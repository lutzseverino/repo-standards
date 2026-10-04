import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Faults at the filesystem boundary, keyed to the public persisted run phase.
// The installed CLI still performs all installation and integrity verification.
// The mutation runs once, inside the write that persisted the phase, with
// `fs`, the original `write`, `spawnSync` and `syncBuiltinESMExports` in scope.
export function filesystemFault(directory: string, env: NodeJS.ProcessEnv, phase: string, mutation: string) {
  const loader = join(directory, 'filesystem-fault.mjs');
  writeFileSync(loader, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
const write = fs.writeFileSync;
let fired = false;
fs.writeFileSync = function(path, data, ...args) {
  const result = write.call(this, path, data, ...args);
  let report;
  try { report = JSON.parse(String(data)); } catch {}
  if (!fired && report?.format === 'repo-standards/run/v6' && report.phase === ${JSON.stringify(phase)}) {
    fired = true;
    ${mutation}
  }
  return result;
};
syncBuiltinESMExports();
`);
  return { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(loader).href}` };
}

// Mutations for filesystemFault. Each wraps one filesystem call from the phase
// on and stops the process at the first call on a path ending in `suffix`.
export const kill = `process.kill(process.pid, 'SIGKILL');`;

// Stops right after a staged file is renamed into place.
export function killAfterRename(suffix: string) {
  return `
const rename = fs.renameSync;
fs.renameSync = function(from, to, ...args) {
  const result = rename.call(this, from, to, ...args);
  if (String(to).endsWith(${JSON.stringify(suffix)})) ${kill}
  return result;
};
syncBuiltinESMExports();`;
}

// Stops with a staged file left before its rename.
export function killBeforeRename(suffix: string) {
  return `
const rename = fs.renameSync;
fs.renameSync = function(from, to, ...args) {
  if (String(to).endsWith(${JSON.stringify(suffix)})) ${kill}
  return rename.call(this, from, to, ...args);
};
syncBuiltinESMExports();`;
}

// Stops as a tree or link is removed, after first removing `first` inside it,
// so the removal is partial.
export function killDuringRemoval(suffix: string, first?: string) {
  return `
const remove = fs.rmSync;
const unlink = fs.unlinkSync;
const fault = path => {
  if (String(path).endsWith(${JSON.stringify(suffix)})) {
    ${first ? `remove.call(fs, String(path) + ${JSON.stringify(first)});` : ''}
    ${kill}
  }
};
fs.rmSync = function(path, ...args) { fault(path); return remove.call(this, path, ...args); };
fs.unlinkSync = function(path, ...args) { fault(path); return unlink.call(this, path, ...args); };
syncBuiltinESMExports();`;
}

// Stops right after a write that satisfies `condition`, an expression over
// `path`, `data` and `record`, the data parsed as JSON when it is.
export function killAfterWrite(condition: string) {
  return `
const persist = fs.writeFileSync;
fs.writeFileSync = function(path, data, ...args) {
  const result = persist.call(this, path, data, ...args);
  let record;
  try { record = JSON.parse(String(data)); } catch {}
  if (${condition}) ${kill}
  return result;
};
syncBuiltinESMExports();`;
}

// Fails the first write that satisfies `condition`, as killAfterWrite reads
// it, with ENOSPC.
export function failWrite(condition: string) {
  return `
const persist = fs.writeFileSync;
let failed = false;
fs.writeFileSync = function(path, data, ...args) {
  let record;
  try { record = JSON.parse(String(data)); } catch {}
  if (!failed && (${condition})) {
    failed = true;
    throw Object.assign(new Error('No space left on device'), { code: 'ENOSPC' });
  }
  return persist.call(this, path, data, ...args);
};
syncBuiltinESMExports();`;
}
