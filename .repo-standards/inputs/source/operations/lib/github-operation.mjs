import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const resultFormat = 'repo-standards/result/v1';
const maximumOutput = 1024 * 1024;

function failProcess(message) {
  throw new Error(message);
}

export function readFixesRequest(operationName) {
  let request;
  try {
    request = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    failProcess(`${operationName} input must be one JSON object.`);
  }
  if (request?.format !== 'repo-standards/operation/v1') {
    failProcess(`${operationName} requires repo-standards/operation/v1 input.`);
  }
  if (request.operation?.phase !== 'fixes') {
    failProcess(`${operationName} must run as a fixes operation.`);
  }
  const { paths, directories } = request.allowedTargets ?? {};
  if (!Array.isArray(paths) || paths.length !== 0
      || !Array.isArray(directories) || directories.length !== 0) {
    failProcess(`${operationName} requires an empty project-content target scope.`);
  }
  if (typeof request.projectRoot !== 'string' || request.projectRoot.length === 0) {
    failProcess(`${operationName} input must identify the project root.`);
  }
  return request;
}

export function writeOperationResult(status, message) {
  process.stdout.write(`${JSON.stringify({ format: resultFormat, status, message })}\n`);
}

export function run(executable, args, cwd, input) {
  const outcome = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    input,
    maxBuffer: maximumOutput,
  });
  if (outcome.error) {
    return {
      ok: false,
      unavailable: outcome.error.code === 'ENOENT',
      detail: outcome.error.code ?? 'spawn error',
      stderr: '',
    };
  }
  if (outcome.status !== 0) {
    const processState = outcome.signal ? `signal ${outcome.signal}` : `exit ${outcome.status}`;
    return { ok: false, unavailable: false, detail: processState, stderr: outcome.stderr };
  }
  return { ok: true, stdout: outcome.stdout, stderr: outcome.stderr };
}

function versionFrom(output) {
  const match = output.match(/(?:^|[^0-9])v?(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/m);
  return match ? match.slice(1).map(Number) : null;
}

function atLeast(actual, minimum) {
  return actual.some((part, index) => part > minimum[index]
    && actual.slice(0, index).every((earlier, earlierIndex) => earlier === minimum[earlierIndex]))
    || actual.every((part, index) => part === minimum[index]);
}

function githubIdentity(remoteUrl) {
  let owner;
  let repository;
  const scp = remoteUrl.match(/^(?:[^@/]+@)?github\.com:([^/]+)\/(.+)$/i);
  if (scp) {
    [, owner, repository] = scp;
  } else {
    try {
      const parsed = new URL(remoteUrl);
      if (parsed.hostname.toLowerCase() !== 'github.com') return null;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length !== 2) return null;
      [owner, repository] = parts.map(part => decodeURIComponent(part));
    } catch {
      return null;
    }
  }
  repository = repository.replace(/\.git$/i, '').replace(/\/$/, '');
  if (!owner || !repository || /[\s/?#]/.test(owner) || /[\s/?#]/.test(repository)) return null;
  return `${owner}/${repository}`;
}

function inferRepository(projectRoot) {
  const remotes = run(
    'git',
    ['-C', projectRoot, 'config', '--local', '--get-regexp', '^remote\\..*\\.(url|pushurl)$'],
    projectRoot,
  );
  if (!remotes.ok) return { blocked: 'No unambiguous github.com repository was found in Git remotes.' };
  const identities = new Map();
  for (const line of remotes.stdout.split(/\r?\n/)) {
    const separator = line.search(/\s/);
    if (separator < 0) continue;
    const identity = githubIdentity(line.slice(separator).trim());
    if (identity) identities.set(identity.toLowerCase(), identity);
  }
  if (identities.size === 0) {
    return { blocked: 'No unambiguous github.com repository was found in Git remotes.' };
  }
  if (identities.size > 1) {
    return {
      blocked: `Multiple github.com repositories were found in Git remotes (${[...identities.values()].sort().join(', ')}); resolve the target before setup.`,
    };
  }
  return { identity: identities.values().next().value };
}

export function jsonFrom(outcome) {
  if (!outcome.ok) return { error: outcome.detail, outcome };
  try {
    return { value: JSON.parse(outcome.stdout) };
  } catch {
    return { error: 'invalid JSON response', outcome };
  }
}

export function githubApi(args, projectRoot, input) {
  return run(
    'gh',
    ['api', '--hostname', 'github.com', ...args],
    projectRoot,
    input === undefined ? undefined : `${JSON.stringify(input)}\n`,
  );
}

export function apiEndpoint(identity, suffix = '') {
  const [owner, repository] = identity.split('/');
  return `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}${suffix}`;
}

export function prepareGithubRepository(request, operationName) {
  const nodeVersion = versionFrom(process.versions.node);
  if (!nodeVersion || nodeVersion[0] !== 24) {
    return { blocked: `${operationName} requires Node.js 24.` };
  }

  const gitVersion = run('git', ['--version'], request.projectRoot);
  if (!gitVersion.ok) {
    return { blocked: `Git is unavailable; install Git 2.18.0 or newer before ${operationName}.` };
  }
  const parsedGitVersion = versionFrom(gitVersion.stdout);
  if (!parsedGitVersion || !atLeast(parsedGitVersion, [2, 18, 0])) {
    return { blocked: `${operationName} requires Git 2.18.0 or newer.` };
  }

  const ghVersion = run('gh', ['--version'], request.projectRoot);
  if (!ghVersion.ok) {
    return { blocked: `GitHub CLI (gh) is unavailable; install gh 2.57.0 or newer before ${operationName}.` };
  }
  const parsedGhVersion = versionFrom(ghVersion.stdout);
  if (!parsedGhVersion || !atLeast(parsedGhVersion, [2, 57, 0])) {
    return { blocked: `${operationName} requires gh 2.57.0 or newer.` };
  }

  const inferred = inferRepository(request.projectRoot);
  if (inferred.blocked) return inferred;

  const authentication = run(
    'gh',
    ['auth', 'status', '--hostname', 'github.com', '--active'],
    request.projectRoot,
  );
  if (!authentication.ok) {
    return { blocked: `${operationName} requires authenticated github.com access through gh.` };
  }

  const repositoryResponse = jsonFrom(githubApi([apiEndpoint(inferred.identity)], request.projectRoot));
  if (repositoryResponse.error) {
    return {
      blocked: `${operationName} could not verify ${inferred.identity}; repository access is incomplete (${repositoryResponse.error}).`,
    };
  }
  const repository = repositoryResponse.value;
  if (typeof repository.full_name !== 'string'
      || repository.full_name.toLowerCase() !== inferred.identity.toLowerCase()) {
    const resolved = typeof repository.full_name === 'string' ? repository.full_name : 'an unknown repository';
    return {
      blocked: `GitHub resolved ${inferred.identity} as ${resolved}; resolve the mismatched target before setup.`,
    };
  }
  return { identity: inferred.identity, repository };
}
