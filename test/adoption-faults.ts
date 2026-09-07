import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Faults at the filesystem boundary, keyed to the public persisted run phase.
// The installed CLI still performs all installation and integrity verification.
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
  if (!fired && report?.format === 'repo-standards/run/v1' && report.phase === ${JSON.stringify(phase)}) {
    fired = true;
    ${mutation}
  }
  return result;
};
syncBuiltinESMExports();
`);
  return { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(loader).href}` };
}
