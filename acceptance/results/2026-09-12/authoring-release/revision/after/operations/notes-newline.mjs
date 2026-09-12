import fs from 'node:fs';
import path from 'node:path';

const result = (status, message) => {
  process.stdout.write(JSON.stringify({ format: 'repo-standards/result/v1', status, message }) + '\n');
};
let fd;
try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const mode = process.argv[2];
  const phase = mode === 'check' ? 'checks' : mode === 'fix' ? 'fixes' : null;
  const id = mode === 'check' ? 'final-newline' : 'append-newline';
  const owner = request.declarations?.find(d => d.id === 'notes-newline');
  if (process.argv.length !== 3 || !phase ||
      request.format !== 'repo-standards/operation/v1' ||
      typeof request.profile !== 'string' || !request.profile ||
      request.operation?.declaration !== 'notes-newline' ||
      request.operation?.phase !== phase || request.operation?.id !== id ||
      owner?.kind !== 'file' || owner.target !== 'docs/notes.md' ||
      !owner[phase]?.some(op => op.id === id) ||
      JSON.stringify(request.allowedTargets?.paths) !== '["docs/notes.md"]' ||
      JSON.stringify(request.allowedTargets?.directories) !== '[]' ||
      typeof request.projectRoot !== 'string' || !path.isAbsolute(request.projectRoot) ||
      path.resolve(request.projectRoot) !== process.cwd()) {
    throw new Error('Request or active declaration scope is inconsistent.');
  }
  const root = request.projectRoot;
  let ancestor = path.parse(root).root;
  for (const component of path.relative(ancestor, root).split(path.sep).filter(Boolean)) {
    ancestor = path.join(ancestor, component);
    if (!fs.lstatSync(ancestor).isDirectory()) throw new Error('Project ancestry must use real directories.');
  }
  const docs = path.join(root, 'docs');
  if (!fs.lstatSync(docs).isDirectory()) throw new Error('docs must be a real directory.');
  const target = path.join(docs, 'notes.md');
  const before = fs.lstatSync(target);
  if (!before.isFile()) throw new Error('Notes must be a regular file, not a symlink.');
  fs.accessSync(target, fs.constants.R_OK | (mode === 'fix' ? fs.constants.W_OK : 0));
  const flags = (mode === 'fix' ? fs.constants.O_RDWR | fs.constants.O_APPEND : fs.constants.O_RDONLY)
    | fs.constants.O_NOFOLLOW;
  fd = fs.openSync(target, flags);
  const opened = fs.fstatSync(fd);
  if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
    throw new Error('Notes changed during opening; retry after concurrent work stops.');
  }
  const bytes = fs.readFileSync(fd);
  const terminated = bytes.length > 0 && bytes.at(-1) === 10;
  if (mode === 'check') {
    result(terminated ? 'passed' : 'failed', terminated
      ? 'docs/notes.md ends in LF.' : 'docs/notes.md needs a final LF byte.');
  } else if (terminated) {
    result('unchanged', 'docs/notes.md already ends in LF.');
  } else {
    const current = fs.fstatSync(fd);
    if (current.size !== opened.size || current.mtimeMs !== opened.mtimeMs) {
      throw new Error('Notes changed during reading; retry after concurrent work stops.');
    }
    fs.writeSync(fd, Buffer.from([10]));
    fs.fsyncSync(fd);
    result('changed', 'Appended one LF byte to docs/notes.md.');
  }
} catch (error) {
  result('blocked', `Notes newline operation blocked: ${error.message}`);
} finally {
  if (fd !== undefined) fs.closeSync(fd);
}
