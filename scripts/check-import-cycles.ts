// Fails when source modules import each other in a runtime cycle of static
// imports and re-exports. Each module is compiled the way the build treats it
// under verbatimModuleSyntax: `import type` and `export type ... from` are
// erased, while an import whose every specifier is an inline type still loads
// its module. The compiled module is then parsed, so only real module
// requests count. Dynamic import() loads lazily and is not followed.
// Run with: node --experimental-vm-modules scripts/check-import-cycles.ts [source-directory]
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import vm from 'node:vm';

const [directory = 'src', ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('Usage: node --experimental-vm-modules scripts/check-import-cycles.ts [source-directory]');
if (!vm.SourceTextModule) throw new Error('Module parsing needs node --experimental-vm-modules.');
const root = resolve(directory);

const modules = readdirSync(root, { recursive: true, encoding: 'utf8' })
  .filter(path => path.endsWith('.ts') && !path.endsWith('.d.ts')).map(path => join(root, path)).sort();
const imports = new Map(modules.map(path => {
  const compiled = stripTypeScriptTypes(readFileSync(path, 'utf8'), { mode: 'transform' });
  const requests = new vm.SourceTextModule(compiled, { identifier: path }).moduleRequests;
  return [path, requests.map(request => request.specifier).filter(specifier => specifier.startsWith('.'))
    .map(specifier => resolve(dirname(path), specifier.replace(/\.js$/, '.ts')))
    .filter(target => modules.includes(target))];
}));

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
