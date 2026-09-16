import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, posix, sep } from 'node:path';
import { interpretMarkdown } from './lib/rendered-markdown.mjs';
import { brokenLocalLinks } from './lib/local-markdown-links.mjs';

const resultFormat = 'repo-standards/result/v1';
const rootDocumentation = 'docs';
const documentationIndex = `${rootDocumentation}/README.md`;
const developmentGuide = 'docs/development/README.md';
const documentationCategories = new Set(['usage', 'development', 'adr', 'agents']);

function failProcess(message) {
  throw new Error(message);
}

function isSafeFilePath(projectRoot, path) {
  if (typeof path !== 'string' || path.length === 0 || isAbsolute(path)
      || path === '.' || path.endsWith('/') || path.includes('\\')
      || posix.normalize(path) !== path || path.startsWith('../')) return false;
  let existingDirectory = false;
  try {
    existingDirectory = lstatSync(absolutePath(projectRoot, path)).isDirectory();
  } catch {
    // Missing intended files are valid concrete targets.
  }
  return !existingDirectory;
}

function readRequest() {
  let request;
  try {
    request = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    failProcess('Operation input must be one JSON object.');
  }
  if (request?.format !== 'repo-standards/operation/v1') {
    failProcess('Unsupported operation input format; expected repo-standards/operation/v1.');
  }
  if (request.operation?.phase !== 'checks') {
    failProcess('Documentation validation must run as a checks operation.');
  }
  if (typeof request.projectRoot !== 'string' || request.projectRoot.length === 0) {
    failProcess('Operation input must identify the project root.');
  }
  const { paths, directories } = request.allowedTargets ?? {};
  if (!Array.isArray(paths) || paths.some(path => !isSafeFilePath(request.projectRoot, path))
      || !Array.isArray(directories) || directories.length !== 0) {
    failProcess('Documentation validation requires individual repository-relative file paths and no directory targets.');
  }
  return request;
}

function absolutePath(projectRoot, path) {
  return `${projectRoot}${sep}${path.split('/').join(sep)}`;
}

function fileContent(projectRoot, path) {
  try {
    const absolute = absolutePath(projectRoot, path);
    return lstatSync(absolute).isFile() ? readFileSync(absolute, 'utf8') : null;
  } catch {
    return null;
  }
}

function directoryEntries(projectRoot, path) {
  try {
    const absolute = absolutePath(projectRoot, path);
    if (!lstatSync(absolute).isDirectory()) return null;
    return readdirSync(absolute, { withFileTypes: true });
  } catch {
    return null;
  }
}

function documentationRoots(allowedPaths) {
  const candidates = new Set([rootDocumentation]);
  for (const path of allowedPaths) {
    const segments = path.split('/');
    const fileName = segments.pop();
    if (fileName !== 'README.md' || segments.length === 0) continue;
    if (documentationCategories.has(segments.at(-1))) segments.pop();
    if (segments.length > 0) candidates.add(segments.join('/'));
  }

  const roots = new Set([rootDocumentation]);
  for (const candidate of candidates) {
    if ([...documentationCategories].some(category => (
      allowedPaths.includes(`${candidate}/${category}/README.md`)
    ))) roots.add(candidate);
  }

  const containedIndex = candidate => [...roots].some(root => (
    candidate !== root && candidate.startsWith(`${root}/`)
  ));
  return {
    roots: [...roots].sort(),
    ambiguous: [...candidates]
      .filter(candidate => !roots.has(candidate) && !containedIndex(candidate))
      .sort(),
  };
}

function documentationTree(projectRoot, root) {
  const directories = [];
  const markdownFiles = [];
  const visit = path => {
    const entries = directoryEntries(projectRoot, path);
    if (entries === null) return;
    directories.push(path);
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.toLocaleLowerCase('en-US').endsWith('.md')) markdownFiles.push(child);
    }
  };
  visit(root);
  return { directories, markdownFiles };
}

function validate(projectRoot, allowedPaths) {
  const corrections = [];
  const rootResolution = documentationRoots(allowedPaths);
  const guide = fileContent(projectRoot, developmentGuide);
  if (guide === null) {
    corrections.push(`Create ${developmentGuide} with the project's prerequisites, setup, development commands, and required validation.`);
  } else if (!interpretMarkdown(guide).content.hasContent) {
    corrections.push(`Populate ${developmentGuide} with the project's prerequisites, setup, development commands, and required validation.`);
  }
  if (!allowedPaths.includes(developmentGuide)) {
    corrections.push(`Include ${developmentGuide} in the confirmed documentation scope.`);
  }

  const markdownFiles = new Set();
  for (const root of rootResolution.roots) {
    const indexPath = `${root}/README.md`;
    const index = fileContent(projectRoot, indexPath);
    if (index === null) {
      corrections.push(`Create ${indexPath} to map the documentation categories and their placement rules.`);
    } else if (!interpretMarkdown(index).content.hasContent) {
      corrections.push(`Populate ${indexPath} with the documentation map and placement rules.`);
    }
    if (!allowedPaths.includes(indexPath)) {
      corrections.push(`Include ${indexPath} in the confirmed documentation scope.`);
    }

    const tree = documentationTree(projectRoot, root);
    for (const entry of directoryEntries(projectRoot, root) ?? []) {
      if (entry.name === 'README.md'
          || (entry.isDirectory() && documentationCategories.has(entry.name))) continue;
      corrections.push(`Move ${root}/${entry.name} into usage, development, adr, or agents, preserving useful content and affected links.`);
    }
    for (const directory of tree.directories) {
      if (directory === root) continue;
      const directoryIndex = `${directory}/README.md`;
      const content = fileContent(projectRoot, directoryIndex);
      if (content === null) corrections.push(`Create ${directoryIndex} to explain this documentation directory and link its useful contents.`);
      else if (!interpretMarkdown(content).content.hasContent) corrections.push(`Populate ${directoryIndex} with the directory purpose and links to useful contents.`);
    }
    for (const path of allowedPaths) {
      if (!path.startsWith(`${root}/`) || posix.basename(path) !== 'README.md') continue;
      const relative = path.slice(root.length + 1);
      if (!documentationCategories.has(relative.split('/')[0])) continue;
      if (fileContent(projectRoot, path) === null) {
        corrections.push(`Create ${path} to explain this documentation directory and link its useful contents.`);
      }
    }
    for (const path of tree.markdownFiles) markdownFiles.add(path);
  }
  for (const path of allowedPaths) {
    if (path.toLocaleLowerCase('en-US').endsWith('.md') && fileContent(projectRoot, path) !== null) {
      markdownFiles.add(path);
    }
  }
  for (const path of [...markdownFiles].sort()) {
    const document = interpretMarkdown(fileContent(projectRoot, path));
    for (const link of brokenLocalLinks(projectRoot, path, document.content.elements)) {
      corrections.push(`${path} links to missing ${link.target}.`);
    }
  }
  return {
    corrections: [...new Set(corrections)],
    ambiguous: rootResolution.ambiguous,
  };
}

function result(status, message) {
  process.stdout.write(`${JSON.stringify({ format: resultFormat, status, message })}\n`);
}

try {
  const request = readRequest();
  const validation = validate(request.projectRoot, request.allowedTargets.paths);
  if (validation.ambiguous.length > 0) {
    const ambiguity = validation.ambiguous.map(root => (
      `Cannot determine whether ${root} is a documentation root from the confirmed paths; include its root README and at least one confirmed category README under usage, development, adr, or agents, or remove the unrelated index from this declaration.`
    )).join(' ');
    const corrections = validation.corrections.length > 0
      ? ` Other documentation corrections: ${validation.corrections.join(' ')}`
      : '';
    result('blocked', `Documentation root selection is ambiguous: ${ambiguity}${corrections}`);
  } else {
    result(
      validation.corrections.length === 0 ? 'passed' : 'failed',
      validation.corrections.length === 0
        ? 'Documentation navigation is valid; content placement and usefulness still require maintainer or agent review.'
        : `Documentation navigation needs correction: ${validation.corrections.join(' ')}`,
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
