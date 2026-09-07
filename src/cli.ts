#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { validateSource } from './resolver.js';
import { inspect } from './inspection.js';
import { ProductError } from './errors.js';
import { inspectRetained, start, status } from './adoption.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  console.log(version);
} else if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
  console.log('Usage: repo-standards source validate [directory] [--json]\n       repo-standards inspect [--source <GitHub URL> --standards-version <tag> --profile <name>] [--project <directory>] [--json]\n       repo-standards start --source <GitHub URL> --standards-version <tag> --profile <name> --confirm <inspection identity> [--project <directory>] [--json]\n       repo-standards status [--project <directory>] [--json]\n\nInspection without source flags uses the current retained selection. Start supports initial adoption with trusted fixes and checks; contextual assessment requires a later slice.');
} else if (args[0] === 'inspect' || args[0] === 'start' || args[0] === 'status') {
  try {
    const flags = new Map<string, string>();
    for (let index = 1; index < args.length; index++) {
      const key = args[index]!;
      if (key === '--json' && !flags.has(key)) { flags.set(key, 'true'); continue; }
      if (!['--project', ...(args[0] === 'status' ? [] : ['--source', '--standards-version', '--profile']), ...(args[0] === 'start' ? ['--confirm'] : [])].includes(key) || flags.has(key) || !args[index + 1] || args[index + 1]!.startsWith('--')) throw new ProductError('USAGE', `Unknown, duplicate, or incomplete option: ${key}. Use --help.`);
      flags.set(key, args[++index]!);
    }
    const retained = args[0] === 'inspect' && !['--source', '--standards-version', '--profile'].some(key => flags.has(key));
    if (args[0] !== 'status' && !retained) for (const key of ['--source', '--standards-version', '--profile']) if (!flags.has(key)) throw new ProductError('USAGE', `Missing ${key}. Use --help.`);
    if (args[0] === 'start' && !flags.has('--confirm')) throw new ProductError('CONFIRMATION_REQUIRED', 'Inspect the selection, review its changes, and pass its identity with --confirm <identity> after explicit maintainer confirmation.');
    const options = { source: flags.get('--source')!, standardsVersion: flags.get('--standards-version')!, profile: flags.get('--profile')!, project: flags.get('--project') ?? '.' };
    const report = args[0] === 'status' ? status(options.project) : args[0] === 'start' ? await start(options, version, flags.get('--confirm')!) : retained ? await inspectRetained(options.project, version) : await inspect(options, version);
    console.log(JSON.stringify(report, null, 2));
    if ('outcome' in report && report.outcome === 'incomplete') process.exitCode = 1;
  } catch (error) {
    const diagnostic = error instanceof ProductError ? { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } : { code: 'INSPECTION_FAILED', message: (error as Error).message };
    if (args.includes('--json')) console.log(JSON.stringify({ valid: false, errors: [diagnostic] }, null, 2));
    else console.error(`[${diagnostic.code}] ${diagnostic.message}`);
    process.exitCode = diagnostic.code === 'USAGE' ? 2 : 1;
  }
} else if (args[0] === 'source' && args[1] === 'validate' && args.slice(2).filter(arg => arg !== '--json').length <= 1 && !args.slice(2).some(arg => arg.startsWith('-') && arg !== '--json')) {
  const directory = args.slice(2).find(arg => arg !== '--json') ?? '.';
  const report = validateSource(directory, version);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else if (report.valid) console.log(`Valid standards source; profiles: ${Object.keys(report.profiles).join(', ')}.`);
  else for (const error of report.errors) console.error(`${error.file}:${error.line}:${error.column} [${error.code}] ${error.message} (${error.path || '/'})`);
  process.exitCode = report.valid ? 0 : 1;
} else {
  console.error('Usage: repo-standards source validate [directory] [--json]');
  process.exitCode = 2;
}
