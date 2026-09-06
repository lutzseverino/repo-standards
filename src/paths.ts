import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { caseFold } from 'unicode-case-folding';
import type { Fields, Value } from './yaml.js';

export interface Target { path: string; location: Value }

function folded(path: string) { return caseFold(path.normalize('NFC')).normalize('NFC'); }
function overlaps(left: string, right: string) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export class Paths {
  constructor(private readonly root: string, private readonly fields: Fields) {}

  private relative(value: Value): string | undefined {
    const path = this.fields.string(value);
    if (path === undefined) return undefined;
    if (/^[A-Za-z]:/.test(path) || /[\\\u0000-\u001f\u007f]/u.test(path) ||
        path.split('/').some(part => part === '' || part === '.' || part === '..')) {
      this.fields.error('UNSAFE_PATH', 'Expected a repository-relative path without empty, dot, parent, or backslash components.', value);
      return undefined;
    }
    return path;
  }

  target(value: Value): Target | undefined {
    const path = this.relative(value);
    if (path === undefined) return undefined;
    if (/[*?\[\]{}]/u.test(path)) {
      this.fields.error('UNSAFE_PATH', 'Targets must be explicit paths, without glob patterns.', value);
      return undefined;
    }
    if (['.repo-standards', '.agents/skills/adopt-standards', '.git'].some(reserved => overlaps(folded(path), reserved))) {
      this.fields.error('RESERVED_TARGET', 'Target overlaps product-owned state, the system skill, or Git metadata.', value);
    }
    return { path, location: value };
  }

  reference(value: Value, kind: 'file' | 'directory' | 'resource'): string {
    const path = this.relative(value);
    if (path === undefined) return '';
    // Inspect every ancestor without following links, then the entire retained tree.
    const parts = path.split('/');
    for (let length = 1; length < parts.length; length++) {
      if (!this.inspect(parts.slice(0, length).join('/'), 'directory', value, false)) return path;
    }
    this.inspect(path, kind, value, true);
    return path;
  }

  private inspect(path: string, kind: 'file' | 'directory' | 'resource', value: Value, recurse: boolean): boolean {
    try {
      const stat = lstatSync(join(this.root, path));
      if (stat.isSymbolicLink()) {
        this.fields.error('SOURCE_SYMLINK', `Source reference contains a symbolic link: ${path}.`, value);
        return false;
      }
      if (!(stat.isFile() || stat.isDirectory()) || (kind === 'file' && !stat.isFile()) || (kind === 'directory' && !stat.isDirectory())) {
        this.fields.error('REFERENCE_TYPE', `Expected ${kind} at ${path}.`, value);
        return false;
      }
      if (recurse && stat.isDirectory()) {
        for (const entry of readdirSync(join(this.root, path)).sort()) this.inspect(`${path}/${entry}`, 'resource', value, true);
      }
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      this.fields.error(code === 'ENOENT' || code === 'ENOTDIR' ? 'MISSING_REFERENCE' : 'SOURCE_READ', `Cannot read source reference: ${path}.`, value);
      return false;
    }
  }

  conflicts(targets: Target[], profile: string) {
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]!;
      for (const previous of targets.slice(0, index)) {
        if (overlaps(folded(target.path), folded(previous.path))) {
          this.fields.error('TARGET_OVERLAP', `Profile ${profile}: target ${target.path} overlaps ${previous.path} (${previous.location.path}).`, target.location, profile);
        }
      }
    }
  }
}
