import { readFileSync } from 'node:fs';
import { pendingDispatches } from './dispatch.mjs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node src/cli.mjs <parcels.ndjson>');
  process.exitCode = 2;
} else {
  const parcels = readFileSync(path, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  for (const dispatch of pendingDispatches(parcels)) console.log(JSON.stringify(dispatch));
}
