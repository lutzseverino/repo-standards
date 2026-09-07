// Execute the installed public CLI with test-only acquisition boundaries.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [sessionPath, ...args] = process.argv.slice(2);
const session = JSON.parse(readFileSync(sessionPath!, 'utf8'));
const executable = args[0] === '--local'
  ? (args.shift(), join(session.project, '.repo-standards/runtime/node_modules/.bin/repo-standards'))
  : session.cli;
const result = spawnSync(executable, args, { cwd: session.project, env: { ...process.env, ...session.env }, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
