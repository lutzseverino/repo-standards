import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { satisfies, validRange } from 'semver';
import { Fields, readYaml } from './yaml.js';
import type { Diagnostic, Value } from './yaml.js';
import { Declarations } from './declarations.js';
import type { ResolvedProfile } from './model.js';
import { Paths } from './paths.js';

export function validateSource(directory: string, cliVersion: string, sourcePaths?: ReadonlySet<string>) {
  const errors: Diagnostic[] = [];
  const file = resolve(directory, 'standards.yaml');
  let text: string;
  try {
    if (sourcePaths && !sourcePaths.has('standards.yaml')) throw new Error('Missing exact Git path');
    if (lstatSync(resolve(directory)).isSymbolicLink() || lstatSync(file).isSymbolicLink()) {
      return { valid: false, errors: [{ code: 'SOURCE_SYMLINK', message: 'The source root and standards.yaml cannot be symbolic links.', file, line: 1, column: 1, path: '' }], profiles: {} };
    }
    if (!lstatSync(file).isFile()) throw new Error('Not a regular file');
    text = readFileSync(file, 'utf8');
  }
  catch {
    return { valid: false, errors: [{ code: 'SOURCE_READ', message: 'Cannot read standards.yaml.', file, line: 1, column: 1, path: '' }], profiles: {} };
  }
  const { roots, error } = readYaml(text, file, errors);
  const fields = new Fields(error);
  const paths = new Paths(resolve(directory), fields, sourcePaths);
  let result: ReturnType<typeof resolveDocument> | undefined;
  for (const root of roots) result = resolveDocument(root, fields, paths, cliVersion);
  return { valid: errors.length === 0, errors, ...(errors.length ? {} : { source: result?.source }), profiles: errors.length ? {} : result?.profiles ?? {} };
}

function resolveDocument(root: Value, fields: Fields, paths: Paths, cliVersion: string) {
  const error = fields.error;
  fields.map(root, ['format', 'name', 'description', 'requires', 'defaults', 'profiles']);
  const format = fields.get(root, 'format');
  if (fields.string(format) !== 'repo-standards/v1') error('INVALID_FORMAT', 'Expected repo-standards/v1.', format);
  const name = fields.string(fields.get(root, 'name'));
  const description = fields.string(fields.get(root, 'description'));
  const requires = fields.get(root, 'requires');
  fields.map(requires, ['repo-standards']);
  const rangeValue = fields.get(requires, 'repo-standards');
  const range = fields.string(rangeValue);
  if (range && !validRange(range)) error('INVALID_VERSION', 'Expected a CLI SemVer range.', rangeValue);
  else if (range && !satisfies(cliVersion, range)) error('INCOMPATIBLE_CLI', `CLI ${cliVersion} does not satisfy ${range}.`, rangeValue);
  const defaults = fields.get(root, 'defaults');
  fields.map(defaults, ['declarations']);
  const declarations = new Declarations(fields, paths);
  const inherited = declarations.read(fields.get(defaults, 'declarations'));
  const profilesValue = fields.get(root, 'profiles');
  const profiles: Record<string, ResolvedProfile> = Object.create(null);
  const entries = fields.map(profilesValue);
  if (entries.size === 0) error('EMPTY_PROFILES', 'At least one named profile is required.', profilesValue);
  for (const [id, profile] of entries) {
    fields.string({ ...profile, data: id });
    fields.map(profile, ['description', 'declarations']);
    const profileDescription = fields.string(fields.get(profile, 'description'));
    const replacements = declarations.read(fields.get(profile, 'declarations'), inherited);
    const resolved = new Map([...inherited, ...replacements]);
    profiles[id] = { description: profileDescription ?? '', declarations: [...resolved.entries()]
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .flatMap(([, declaration]) => declaration === null ? [] : [declaration]) };
    paths.conflicts([...resolved.values()].flatMap(declaration => declaration === null ? [] : declarations.locations.get(declaration) ?? []), id);
  }
  return { source: { format: 'repo-standards/v1', name, description, requires: { 'repo-standards': range } }, profiles };
}
