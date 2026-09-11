import { validRange } from 'semver';
import type { Declaration, Operation } from './model.js';
import { Fields } from './yaml.js';
import type { Value } from './yaml.js';
import type { Paths, Target } from './paths.js';

const identity = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validExecutable(executable: string): boolean {
  if (/[^A-Za-z0-9_./+-]/u.test(executable) || executable.startsWith('-')) return false;
  const components = executable.split('/');
  const basename = components.pop();
  return Boolean(basename && basename !== '.' && basename !== '..' &&
    components.every((component, index) => component !== '' || index === 0));
}

export class Declarations {
  readonly locations = new WeakMap<Declaration, Target[]>();
  constructor(private readonly fields: Fields, private readonly paths: Paths) {}

  private id(value: Value): string | undefined {
    const name = this.fields.string(value);
    if (name && !identity.test(name)) this.fields.error('INVALID_ID', 'Expected a lower-case kebab-case identity.', value);
    return name;
  }

  private operations(value: Value | undefined, identities: Set<string>): Operation[] {
    if (!value) return [];
    const f = this.fields;
    return f.list(value).map(operation => {
      f.map(operation, ['id', 'run', 'prerequisite', 'timeout-seconds']);
      const idValue = f.get(operation, 'id');
      const id = this.id(idValue) ?? '';
      if (identities.has(id)) f.error('DUPLICATE_IDENTITY', `Duplicate operation ID: ${id}.`, idValue);
      identities.add(id);
      const run = f.get(operation, 'run');
      f.map(run, ['executable', 'script', 'resources', 'arguments']);
      const executableValue = f.get(run, 'executable');
      const executable = f.string(executableValue) ?? '';
      if (executable && !validExecutable(executable)) {
        f.error('INVALID_EXECUTABLE', 'Expected an executable name or path using ASCII letters, digits, dot, underscore, plus, hyphen, and slash.', executableValue);
      }
      const script = this.paths.reference(f.get(run, 'script'), 'file');
      const resources = f.list(f.get(run, 'resources')).map(resource => this.paths.reference(resource, 'resource'));
      const arguments_ = f.strings(f.get(run, 'arguments'));
      const prerequisite = f.get(operation, 'prerequisite');
      f.map(prerequisite, ['version-arguments', 'version']);
      const versionArguments = f.strings(f.get(prerequisite, 'version-arguments'));
      const versionValue = f.get(prerequisite, 'version');
      const version = f.string(versionValue) ?? '';
      if (version && !validRange(version)) f.error('INVALID_VERSION', 'Expected a prerequisite SemVer range.', versionValue);
      const timeout = f.get(operation, 'timeout-seconds');
      if (typeof timeout.data !== 'number' || !Number.isSafeInteger(timeout.data) || timeout.data <= 0) {
        f.error('INVALID_TIMEOUT', 'Timeout must be a positive integer number of seconds.', timeout);
      }
      return { id, run: { executable, script, resources, arguments: arguments_ },
        prerequisite: { 'version-arguments': versionArguments, version }, 'timeout-seconds': timeout.data as number };
    });
  }

  read(value: Value, defaults?: Map<string, Declaration | null>): Map<string, Declaration | null> {
    const f = this.fields;
    const declarations = new Map<string, Declaration | null>();
    for (const [id, declaration] of f.map(value)) {
      this.id({ ...declaration, data: id });
      const entries = f.map(declaration);
      if (entries.has('exclude')) {
        f.map(declaration, ['exclude']);
        if (!defaults?.has(id) || entries.get('exclude')?.data !== true) {
          f.error('INVALID_EXCLUSION', 'An exclusion must be true and remove a declaration from defaults.', declaration);
        }
        declarations.set(id, null);
        continue;
      }
      const operationIds = new Set<string>();
      const checks = this.operations(entries.get('checks'), operationIds);
      const fixes = this.operations(entries.get('fixes'), operationIds);
      const kindValue = f.get(declaration, 'kind');
      const kind = f.string(kindValue);
      const base = { id, checks, fixes };
      const targets: Target[] = [];
      const targetPath = (location: Value) => {
        const target = this.paths.target(location);
        if (target) targets.push(target);
        return target?.path ?? '';
      };
      if (kind === 'file') {
        f.map(declaration, ['kind', 'target', 'exact', 'guidance', 'checks', 'fixes']);
        const target = targetPath(f.get(declaration, 'target'));
        if (entries.has('exact') === entries.has('guidance')) {
          f.error('INVALID_DECLARATION', 'A file requires exactly one of exact or guidance.', declaration);
        }
        const exact = entries.has('exact') ? this.paths.reference(f.get(declaration, 'exact'), 'file') : undefined;
        const guidance = entries.has('guidance') ? this.paths.reference(f.get(declaration, 'guidance'), 'file') : undefined;
        declarations.set(id, { ...base, kind, target, ...(exact !== undefined ? { exact } : { guidance: guidance ?? '' }) });
      } else if (kind === 'skill') {
        f.map(declaration, ['kind', 'name', 'source', 'checks', 'fixes']);
        const nameValue = f.get(declaration, 'name');
        const name = this.id(nameValue) ?? '';
        if (['adopt-standards', 'author-standards'].includes(name.toLowerCase())) {
          f.error('RESERVED_NAME', `${name.toLowerCase()} is a product-owned system skill.`, nameValue);
        }
        targetPath({ ...nameValue, data: `.agents/skills/${name}` });
        const sourceValue = f.get(declaration, 'source');
        const source = this.paths.reference(sourceValue, 'directory');
        if (source) this.paths.reference({ ...sourceValue, data: `${source}/SKILL.md` }, 'file');
        declarations.set(id, { ...base, kind, name, source });
      } else if (kind === 'repository') {
        f.map(declaration, ['kind', 'guidance', 'targets', 'checks', 'fixes']);
        const guidance = this.paths.reference(f.get(declaration, 'guidance'), 'file');
        const targetsValue = f.get(declaration, 'targets');
        f.map(targetsValue, ['paths', 'directories']);
        const paths = f.list(f.get(targetsValue, 'paths')).map(targetPath);
        const directories = f.list(f.get(targetsValue, 'directories')).map(targetPath);
        if (!paths.length && !directories.length) f.error('EMPTY_TARGETS', 'Repository guidance requires at least one target.', targetsValue);
        declarations.set(id, { ...base, kind, guidance, targets: { paths, directories } });
      } else {
        f.map(declaration, ['kind', 'target', 'exact', 'guidance', 'name', 'source', 'targets', 'checks', 'fixes']);
        f.error('INVALID_DECLARATION', 'Expected kind file, skill, or repository.', kindValue);
      }
      const parsed = declarations.get(id);
      if (parsed) this.locations.set(parsed, targets);
    }
    return declarations;
  }
}
