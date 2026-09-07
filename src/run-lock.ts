import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProductError } from './errors.js';
import { processIdentity } from './process-identity.js';
export { processIdentity } from './process-identity.js';

function alive(name: string) {
  const [pid, identity] = name.split('-');
  return /^\d+$/.test(pid!) && processIdentity(Number(pid)) === identity;
}

export function executing(lock: string) {
  const directory = `${lock}.workers`;
  try { return readdirSync(directory).some(alive); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

// Each contender registers before checking peers. Two simultaneous contenders
// may both decline, but cannot both enter. Unique registrations avoid deleting
// a new owner's lock while reclaiming an old process's stale registration.
export function acquireWorker(lock: string) {
  const directory = `${lock}.workers`;
  const identity = processIdentity(process.pid);
  if (!identity) throw new ProductError('PROCESS_STATE', 'Cannot identify this execution process.');
  const name = `${process.pid}-${identity}-${randomUUID()}`;
  const path = join(directory, name);
  for (;;) {
    mkdirSync(directory, { recursive: true });
    try { writeFileSync(path, '', { flag: 'wx' }); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const release = () => {
    rmSync(path, { force: true });
    try { rmdirSync(directory); } catch (error) {
      if (!['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes((error as NodeJS.ErrnoException).code!)) throw error;
    }
  };
  try {
    for (const peer of readdirSync(directory)) {
      if (peer === name) continue;
      if (alive(peer)) throw new ProductError('ACTIVE_RUN', 'An adoption command is still executing. Wait for it to finish before resuming or abandoning.');
      rmSync(join(directory, peer), { force: true });
    }
    // Older CLI versions used an ownerless worker file. Do not guess whether
    // their process has stopped.
    if (existsSync(`${lock}.worker`)) throw new ProductError('ACTIVE_RUN', 'An older CLI worker lock exists. Verify that its process stopped and preserve its report before removing that legacy worker lock.');
    return release;
  } catch (error) { release(); throw error; }
}

export function processGroupAlive(group: number, identity?: string) {
  if (identity !== undefined) {
    const leader = processIdentity(group);
    if (leader !== null && leader !== identity) return false;
  }
  // A group can outlive its leader. Keep protecting its surviving descendants
  // when no live leader remains; a different live leader proves numeric reuse.
  const result = spawnSync('ps', ['-axo', 'pgid=,stat='], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } });
  if (result.error || result.status !== 0) throw new ProductError('PROCESS_STATE', 'Cannot establish whether an author process is still running.');
  return result.stdout.split('\n').some(line => {
    const [id, state] = line.trim().split(/\s+/);
    return Number(id) === group && state && !state.startsWith('Z');
  });
}
