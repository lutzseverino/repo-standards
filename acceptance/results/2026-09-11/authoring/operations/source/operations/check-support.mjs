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
      || request.operation?.phase !== 'checks'
      || request.operation?.id !== 'support-shape'
      || owner?.kind !== 'file' || owner.target !== 'docs/support.json'
      || !owner.checks?.some((op) => op.id === 'support-shape')
      || !Array.isArray(request.allowedTargets?.paths)
      || request.allowedTargets.paths.length !== 1
      || request.allowedTargets.paths[0] !== 'docs/support.json'
      || !Array.isArray(request.allowedTargets?.directories)
      || request.allowedTargets.directories.length !== 0
      || typeof request.projectRoot !== 'string'
      || !path.isAbsolute(request.projectRoot)) {
    throw new Error('Request does not authorize this support-file check.');
  }
  const root = request.projectRoot;
  if (fs.realpathSync(root) !== path.resolve(root) || !fs.lstatSync(root).isDirectory()) {
    throw new Error('Project root must be a real directory without symlink ancestors.');
  }
  const docs = stat(path.join(root, 'docs'));
  if (docs && (!docs.isDirectory() || docs.isSymbolicLink())) {
    throw new Error('docs must be a directory, not a symlink or another type.');
  }
  const target = path.join(root, 'docs/support.json');
  const file = docs ? stat(target) : null;
  if (!file) {
    emit('failed', 'docs/support.json is missing.');
  } else if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error('docs/support.json must be a regular file, not a symlink.');
  } else {
    const content = fs.readFileSync(target, 'utf8');
    let value;
    try { value = JSON.parse(content); }
    catch { emit('failed', 'docs/support.json is not valid JSON; preserve it for manual correction.'); process.exit(0); }
    const object = value !== null && typeof value === 'object' && !Array.isArray(value);
    const unverified = object && value.status === 'unverified' && value.reportProblems === null;
    const configured = object && value.status === 'configured'
      && typeof value.reportProblems === 'string' && value.reportProblems.trim().length > 0;
    emit(unverified || configured ? 'passed' : 'failed', unverified || configured
      ? 'Support shape is valid; destination verification was not performed.'
      : 'Use unverified with null reportProblems, or configured with nonempty reporting instructions.');
  }
} catch (error) {
  emit('blocked', error.message);
}
