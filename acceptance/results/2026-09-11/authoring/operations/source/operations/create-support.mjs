import fs from 'node:fs';
import path from 'node:path';

const emit = (status, message) => process.stdout.write(JSON.stringify({
  format: 'repo-standards/result/v1', status, message,
}) + '\n');
const stat = (p) => {
  try { return fs.lstatSync(p); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const owner = request.declarations?.find((d) => d.id === 'support-file');
  if (request.format !== 'repo-standards/operation/v1'
      || request.operation?.declaration !== 'support-file'
      || request.operation?.phase !== 'fixes'
      || request.operation?.id !== 'create-support-placeholder'
      || owner?.kind !== 'file' || owner.target !== 'docs/support.json'
      || !owner.fixes?.some((op) => op.id === 'create-support-placeholder')
      || !Array.isArray(request.allowedTargets?.paths)
      || request.allowedTargets.paths.length !== 1
      || request.allowedTargets.paths[0] !== 'docs/support.json'
      || !Array.isArray(request.allowedTargets?.directories)
      || request.allowedTargets.directories.length !== 0
      || typeof request.projectRoot !== 'string'
      || !path.isAbsolute(request.projectRoot)) {
    throw new Error('Request does not authorize this support-file repair.');
  }
  const root = request.projectRoot;
  if (fs.realpathSync(root) !== path.resolve(root) || !fs.lstatSync(root).isDirectory()) {
    throw new Error('Project root must be a real directory without symlink ancestors.');
  }
  const docsPath = path.join(root, 'docs');
  let docs = stat(docsPath);
  if (docs && (!docs.isDirectory() || docs.isSymbolicLink())) {
    throw new Error('docs must be a directory, not a symlink or another type.');
  }
  const target = path.join(docsPath, 'support.json');
  const file = docs ? stat(target) : null;
  if (file) {
    if (!file.isFile() || file.isSymbolicLink()) {
      throw new Error('docs/support.json must be a regular file, not a symlink.');
    }
    emit('unchanged', 'Existing support file preserved byte-for-byte; use the check for shape assessment.');
  } else {
    const placeholder = fs.readFileSync(new URL('../resources/support-placeholder.json', import.meta.url));
    if (!docs) {
      try { fs.mkdirSync(docsPath); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      docs = fs.lstatSync(docsPath);
      if (!docs.isDirectory() || docs.isSymbolicLink()) throw new Error('Unsafe docs path.');
    }
    let fd;
    try { fd = fs.openSync(target, 'wx', 0o644); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = fs.lstatSync(target);
      if (!current.isFile() || current.isSymbolicLink()) throw new Error('Unsafe support path.');
      emit('unchanged', 'A support file now exists; preserved without overwrite.');
      process.exit(0);
    }
    try { fs.writeFileSync(fd, placeholder); }
    finally { fs.closeSync(fd); }
    emit('changed', 'Created docs/support.json with unverified support and no invented destination.');
  }
} catch (error) {
  emit('blocked', error.message);
}
