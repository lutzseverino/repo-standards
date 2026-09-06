import { isAlias, isMap, isNode, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';

export interface Diagnostic {
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  path: string;
  profile?: string;
}

// Keep locations alongside values so every later validation uses the same YAML interpretation.
export interface Value {
  data: unknown;
  offset: number;
  path: string;
}

// Preserve duplicate entries for validation instead of discarding one of their values.
class Mapping {
  readonly entries: [string, Value][] = [];
  private readonly lookup = new Map<string, Value>();
  get size() { return this.lookup.size; }
  get(key: string) { return this.lookup.get(key); }
  has(key: string) { return this.lookup.has(key); }
  add(key: string, value: Value) { this.entries.push([key, value]); this.lookup.set(key, value); }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
}

export function readYaml(text: string, file: string, errors: Diagnostic[]) {
  const lines = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines, uniqueKeys: true });
  const reported = new Set<string>();
  function error(code: string, message: string, value: Value, profile?: string) {
    const position = lines.linePos(value.offset);
    const diagnostic = { code, message, file, line: position.line, column: position.col,
      path: value.path, ...(profile === undefined ? {} : { profile }) };
    const key = JSON.stringify(diagnostic);
    if (!reported.has(key)) { reported.add(key); errors.push(diagnostic); }
  }
  for (const problem of [...document.errors, ...document.warnings]) {
    if (problem.code === 'DUPLICATE_KEY') continue; // Report with the YAML path during conversion.
    error('YAML_SYNTAX', problem.message,
      { data: undefined, offset: problem.pos[0], path: '' });
  }
  let budget = 100_000;
  let duplicates = false;
  const active = new Set<unknown>();
  function convert(node: unknown, path: string, parentOffset = 0): Value {
    const value: Value = { data: undefined, path, offset: isNode(node) ? node.range?.[0] ?? parentOffset : parentOffset };
    if (--budget < 0 || active.size > 100 || active.has(node)) {
      error('YAML_STRUCTURE', 'Recursive or excessively expanded YAML is unsupported.', value);
      return value;
    }
    active.add(node);
    if (isAlias(node)) {
      const resolved = node.resolve(document);
      if (resolved) value.data = convert(resolved, path, value.offset).data;
      else error('YAML_STRUCTURE', 'Unresolved YAML alias.', value);
    } else if (isMap(node)) {
      const entries = new Mapping();
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
          error('INVALID_TYPE', 'Mapping keys must be strings.', { ...value, offset: isNode(pair.key) ? pair.key.range?.[0] ?? value.offset : value.offset });
          continue;
        }
        const key = pair.key.value;
        const child = convert(pair.value, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`, pair.key.range?.[0] ?? value.offset);
        if (entries.has(key)) {
          duplicates = true;
          error('DUPLICATE_IDENTITY', `Duplicate mapping key: ${key}.`, { ...child, offset: pair.key.range?.[0] ?? child.offset });
        }
        entries.add(key, child);
      }
      value.data = entries;
    } else if (isSeq(node)) {
      value.data = node.items.map((item, index) => convert(item, `${path}/${index}`, value.offset));
    } else if (isScalar(node)) value.data = node.value;
    else value.data = null;
    active.delete(node);
    return value;
  }
  const root = convert(document.contents, '');
  // Invalid duplicate fields still have independently checkable values. Validate
  // each interpretation with the same schema, keeping its original locations.
  // Bound ambiguous expansion just as alias expansion is bounded above.
  const limit = 256;
  function combinations<T>(groups: T[][]): T[][] {
    let rows: T[][] = [[]];
    for (const group of groups) {
      if (rows.length * group.length > limit) error('YAML_STRUCTURE', 'Too many duplicate-field interpretations.', root);
      const next: T[][] = [];
      outer: for (const row of rows) for (const item of group) {
        next.push([...row, item]);
        if (next.length === limit) break outer;
      }
      rows = next;
    }
    return rows;
  }
  function interpretations(value: Value): Value[] {
    if (value.data instanceof Mapping) {
      const groups = new Map<string, [string, Value][]>();
      for (const [key, child] of value.data) {
        const options = groups.get(key) ?? [];
        options.push(...interpretations(child).map(alternative => [key, alternative] as [string, Value]));
        groups.set(key, options);
      }
      return combinations([...groups.values()]).map(entries => {
        const data = new Mapping();
        for (const [key, child] of entries) data.add(key, child);
        return { ...value, data };
      });
    }
    if (Array.isArray(value.data)) return combinations((value.data as Value[]).map(interpretations)).map(data => ({ ...value, data }));
    return [value];
  }
  return { roots: duplicates ? interpretations(root) : [root], error };
}

export type ReportError = ReturnType<typeof readYaml>['error'];

export class Fields {
  constructor(readonly error: ReportError) {}

  map(value: Value, allowed?: readonly string[]): Mapping {
    if (!(value.data instanceof Mapping)) {
      this.error('INVALID_TYPE', 'Expected a mapping.', value);
      return new Mapping();
    }
    const entries = value.data;
    if (allowed) for (const [key, child] of entries) {
      if (!allowed.includes(key)) this.error('UNKNOWN_FIELD', `Unknown field: ${key}.`, child);
    }
    return entries;
  }

  get(parent: Value, key: string): Value {
    const child = parent.data instanceof Mapping ? parent.data.get(key) : undefined;
    if (child) return child;
    const missing = { ...parent, data: undefined, path: `${parent.path}/${key}` };
    this.error('REQUIRED_FIELD', `Missing required field: ${key}.`, missing);
    return missing;
  }

  string(value: Value): string | undefined {
    if (typeof value.data === 'string' && value.data.trim().length > 0 && !value.data.includes('\0')) return value.data;
    if (value.data !== undefined) this.error('INVALID_TYPE', 'Expected a nonempty string without NUL bytes.', value);
    return undefined;
  }

  list(value: Value): Value[] {
    if (Array.isArray(value.data)) return value.data as Value[];
    if (value.data !== undefined) this.error('INVALID_TYPE', 'Expected a list.', value);
    return [];
  }

  strings(value: Value): string[] {
    return this.list(value).flatMap(child => {
      // Empty literal arguments are meaningful; NUL cannot be passed to a process.
      if (typeof child.data === 'string' && !child.data.includes('\0')) return [child.data];
      this.error('INVALID_TYPE', 'Expected a string without NUL bytes.', child);
      return [];
    });
  }
}
