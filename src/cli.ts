#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { validateSource } from './resolver.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  console.log(version);
} else if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
  console.log('Usage: repo-standards source validate [directory] [--json]');
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
