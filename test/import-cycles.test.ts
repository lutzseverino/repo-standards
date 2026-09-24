import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Repository validation runs this check over src/; a fixture directory stands in
// for src/ to show what it rejects.
function check(modules: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'repo-standards-cycles-'));
  try {
    for (const [name, content] of Object.entries(modules)) writeFileSync(join(root, name), content);
    return spawnSync(process.execPath, ['scripts/check-import-cycles.ts', root], { encoding: 'utf8' });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('validation rejects a runtime import cycle among source modules and names it', () => {
  const result = check({
    'a.ts': "import { b } from './b.js';\nexport const a = () => b;\n",
    'b.ts': "import { c } from './c.js';\nexport const b = 1;\nexport { c };\n",
    'c.ts': "export { a as c } from './a.js';\n",
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /a\.ts -> b\.ts -> c\.ts -> a\.ts/);
});

test('validation rejects an import whose every specifier is an inline type, because the module still loads', () => {
  const result = check({
    'a.ts': "import { type B } from './b.js';\nexport type A = B;\nexport const a = 1;\n",
    'b.ts': "import { a } from './a.js';\nexport type B = typeof a;\n",
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /a\.ts -> b\.ts -> a\.ts|b\.ts -> a\.ts -> b\.ts/);
});

test('validation ignores type-only imports and exports in a cycle', () => {
  const result = check({
    'a.ts': "import type { B } from './b.js';\nexport type { B };\nexport const a = 1;\n",
    'b.ts': "import { a } from './a.js';\nexport type B = typeof a;\n",
    'c.ts': "export type { B } from './b.js';\nimport './a.js';\n",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
