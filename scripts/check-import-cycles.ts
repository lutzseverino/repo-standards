// Fails when source modules import each other in a runtime cycle. Only
// `import type` and `export type ... from` are erased from the build: under
// verbatimModuleSyntax an import whose every specifier is an inline type still
// loads its module, so it counts as a runtime import.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const [directory = 'src', ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('Usage: node scripts/check-import-cycles.ts [source-directory]');
const root = resolve(directory);

const declaration = /^\s*(import|export)\s+(type\s+)?(?:[\w$\s{},*]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;
const modules = readdirSync(root, { recursive: true, encoding: 'utf8' })
  .filter(path => path.endsWith('.ts') && !path.endsWith('.d.ts')).map(path => join(root, path)).sort();
const imports = new Map(modules.map(path => [path, [...readFileSync(path, 'utf8').matchAll(declaration)]
  .filter(match => !match[2])
  .map(match => resolve(dirname(path), match[3]!.replace(/\.js$/, '.ts')))
  .filter(target => modules.includes(target))]));

// Depth-first search; a module reached again while still on the path closes a cycle.
const finished = new Set<string>();
function cycleFrom(path: string, trail: string[]): string[] | undefined {
  if (trail.includes(path)) return [...trail.slice(trail.indexOf(path)), path];
  if (finished.has(path)) return undefined;
  for (const target of imports.get(path)!) {
    const cycle = cycleFrom(target, [...trail, path]);
    if (cycle) return cycle;
  }
  finished.add(path);
  return undefined;
}

for (const path of modules) {
  const cycle = cycleFrom(path, []);
  if (cycle) {
    console.error(`Runtime import cycle among source modules: ${cycle.map(module => relative(root, module)).join(' -> ')}. Break it so that no module loads one that loads it back; type-only imports are exempt.`);
    process.exit(1);
  }
}
