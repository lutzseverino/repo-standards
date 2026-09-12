const fs = require('node:fs');
const path = require('node:path');

function result(status, message) {
  process.stdout.write(JSON.stringify({
    format: 'repo-standards/result/v1', status, message,
  }) + '\n');
}

let fd;
try {
  const mode = process.argv[2];
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const phase = mode === 'check' ? 'checks' : mode === 'fix' ? 'fixes' : null;
  const id = mode === 'check' ? 'final-newline' : 'append-final-newline';
  const owner = Array.isArray(request.declarations)
    ? request.declarations.find(item => item.id === 'notes-final-newline') : null;
  if (!phase || process.argv.length !== 3 ||
      request.format !== 'repo-standards/operation/v1' ||
      !['personal-tools', 'team-services'].includes(request.profile) ||
      request.operation?.declaration !== 'notes-final-newline' ||
      request.operation?.phase !== phase || request.operation?.id !== id ||
      owner?.kind !== 'file' || owner?.target !== 'NOTES.md' ||
      !Array.isArray(owner[phase]) || !owner[phase].some(op => op.id === id) ||
      !Array.isArray(request.allowedTargets?.paths) ||
      request.allowedTargets.paths.length !== 1 ||
      request.allowedTargets.paths[0] !== 'NOTES.md' ||
      !Array.isArray(request.allowedTargets?.directories) ||
      request.allowedTargets.directories.length !== 0 ||
      typeof request.projectRoot !== 'string' || !path.isAbsolute(request.projectRoot) ||
      fs.realpathSync(request.projectRoot) !== fs.realpathSync(process.cwd())) {
    throw new Error('Operation request is outside the active NOTES.md scope.');
  }
  const target = path.join(request.projectRoot, 'NOTES.md');
  const before = fs.lstatSync(target);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error('NOTES.md must be a regular file, not a symbolic link.');
  }
  fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const opened = fs.fstatSync(fd);
  if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
    throw new Error('NOTES.md changed while opening it; retry after it is stable.');
  }
  const bytes = fs.readFileSync(fd);
  fs.closeSync(fd);
  fd = undefined;
  const compliant = bytes.length === 0 || bytes[bytes.length - 1] === 10;
  if (compliant) {
    result(mode === 'check' ? 'passed' : 'unchanged', 'NOTES.md is empty or ends in LF.');
  } else if (mode === 'check') {
    result('failed', 'Nonempty NOTES.md is missing its final LF byte.');
  } else {
    fd = fs.openSync(target, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
    const current = fs.fstatSync(fd);
    if (!current.isFile() || current.dev !== opened.dev || current.ino !== opened.ino ||
        !fs.readFileSync(fd).equals(bytes)) {
      throw new Error('NOTES.md changed before repair; retry after it is stable.');
    }
    const written = fs.writeSync(fd, Buffer.from([10]), 0, 1, bytes.length);
    if (written !== 1) throw new Error('Unable to append the final LF byte.');
    fs.fchmodSync(fd, current.mode & 0o7777);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    result('changed', 'Appended one LF byte to NOTES.md; existing bytes and permission bits preserved.');
  }
} catch (error) {
  if (fd !== undefined) {
    try { fs.closeSync(fd); } catch {}
  }
  result('blocked', String(error.message));
}
