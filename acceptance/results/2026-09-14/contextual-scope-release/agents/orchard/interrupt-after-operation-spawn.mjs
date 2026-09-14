// Acceptance-only controller for a real process interruption. This module is
// appended to the prepared session's NODE_OPTIONS for one command. It does not
// change the installed package or standards source.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

if (process.env.REPO_STANDARDS_ACCEPTANCE_INTERRUPT === 'after-operation-spawn') {
  const originalSpawn = childProcess.spawn;
  let interrupted = false;
  childProcess.spawn = function (...args) {
    const child = Reflect.apply(originalSpawn, this, args);
    if (!interrupted) {
      interrupted = true;
      setImmediate(() => process.kill(process.pid, 'SIGKILL'));
    }
    return child;
  };
  syncBuiltinESMExports();
}
