#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { validateSource } from './resolver.js';
import { inspect } from './inspection.js';
import { ProductError } from './errors.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  console.log(version);
} else if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
  console.log('Usage: repo-standards source validate [directory] [--json]\n       repo-standards inspect --source <GitHub URL> --standards-version <tag> --profile <name> [--project <directory>] [--json]');
} else if (args[0] === 'inspect') {
  try {
    const flags = new Map<string, string>();
    for (let index = 1; index < args.length; index++) {
      const key = args[index]!;
      if (key === '--json' && !flags.has(key)) { flags.set(key, 'true'); continue; }
      if (!['--source', '--standards-version', '--profile', '--project'].includes(key) || flags.has(key) || !args[index + 1] || args[index + 1]!.startsWith('--')) throw new ProductError('USAGE', `Unknown, duplicate, or incomplete option: ${key}. Use --help.`);
      flags.set(key, args[++index]!);
    }
    for (const key of ['--source', '--standards-version', '--profile']) if (!flags.has(key)) throw new ProductError('USAGE', `Missing ${key}. Use --help.`);
    const report = await inspect({ source: flags.get('--source')!, standardsVersion: flags.get('--standards-version')!, profile: flags.get('--profile')!, project: flags.get('--project') ?? '.' }, version);
    console.log(JSON.stringify(report, null, 2));
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
