import { spawn } from 'node:child_process';
import { join } from 'node:path';
import semver from 'semver';
import type { Declaration, ResolvedProfile } from './model.js';

export function operations(resolved: ResolvedProfile, phase: 'fixes' | 'checks') {
  return resolved.declarations.flatMap(declaration => declaration[phase].map(operation => ({ declaration: declaration.id, phase, operation })));
}
type SelectedOperation = ReturnType<typeof operations>[number];
export interface PrerequisiteEvidence {
  declaration: string; phase: 'fixes' | 'checks'; operation: string; executable: string;
  version: string | null; code: string | null; process: OperationEvidence['process'];
}
export async function preflight(root: string, resolved: ResolvedProfile): Promise<PrerequisiteEvidence[]> {
  const evidence: PrerequisiteEvidence[] = [];
  for (const { declaration, phase, operation } of [...operations(resolved, 'fixes'), ...operations(resolved, 'checks')]) {
    const result = await invoke(operation.run.executable, operation.prerequisite['version-arguments'], root, operation['timeout-seconds'], '');
    const token = result.output.match(/(?<![\w.])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?![\w.])/);
    const version = token ? semver.valid(token[1]) : null;
    const code = result.outcome.error === 'ENOENT' ? 'EXECUTABLE_MISSING'
      : result.outcome.error || result.outcome.timedOut || result.outcome.signal || result.outcome.exitCode !== 0 ? 'PROBE_FAILED'
      : !version ? 'VERSION_UNREADABLE'
      : !semver.satisfies(version, operation.prerequisite.version) ? 'VERSION_INCOMPATIBLE' : null;
    evidence.push({ declaration, phase, operation: operation.id, executable: operation.run.executable, version, code, process: result.outcome });
  }
  return evidence;
}

export function allowedTargets(declaration: Declaration) {
  return declaration.kind === 'repository' ? declaration.targets
    : declaration.kind === 'skill' ? { paths: [], directories: [`.agents/skills/${declaration.name}`] }
    : { paths: [declaration.target], directories: [] };
}
export interface OperationEvidence {
  operation: { declaration: string; phase: 'fixes' | 'checks'; id: string };
  process: { exitCode: number | null; signal: string | null; error: string | null; timedOut: boolean };
  result: { format: 'repo-standards/result/v1'; status: string; message: string } | null;
  error: string | null; stdout: string; stderr: string;
}
export async function execute(root: string, selected: SelectedOperation, selection: { standards: unknown; profile: string }, resolved: ResolvedProfile) {
  const { declaration, phase, operation } = selected;
  const identity = { declaration, phase, id: operation.id };
  const input = { format: 'repo-standards/operation/v1', operation: identity, projectRoot: root,
    standards: selection.standards, profile: selection.profile, declarations: resolved.declarations,
    allowedTargets: allowedTargets(resolved.declarations.find(item => item.id === declaration)!) };
  const process = await invoke(operation.run.executable, [join(root, '.repo-standards/inputs/source', operation.run.script), ...operation.run.arguments], root, operation['timeout-seconds'], JSON.stringify(input) + '\n');
  const evidence: OperationEvidence = { operation: identity, process: process.outcome, result: null,
    error: process.outcome.timedOut ? 'TIMEOUT' : process.outcome.error ? 'PROCESS_ERROR' : process.outcome.signal ? 'SIGNAL' : process.outcome.exitCode !== 0 ? 'NONZERO_EXIT' : null,
    stdout: process.stdout, stderr: process.stderr };
  if (!evidence.error) {
    try {
      const result = JSON.parse(process.stdout);
      const statuses = phase === 'fixes' ? ['unchanged', 'changed', 'blocked'] : ['passed', 'failed', 'blocked'];
      if (!result || typeof result !== 'object' || Array.isArray(result) || result.format !== 'repo-standards/result/v1'
        || !statuses.includes(result.status) || typeof result.message !== 'string'
        || Object.keys(result).some(key => !['format', 'status', 'message'].includes(key))) throw new Error('Invalid result');
      evidence.result = result;
    } catch { evidence.error = 'PROTOCOL_ERROR'; }
  }
  return evidence;
}

// Use a process group so a timed-out interpreter and its children cannot keep
// adoption waiting on inherited pipes. Author processes still have host access.
function invoke(executable: string, args: string[], cwd: string, seconds: number, input: string) {
  return new Promise<{ outcome: OperationEvidence['process']; stdout: string; stderr: string; output: string }>(resolve => {
    const child = spawn(executable, args, { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const outcome: OperationEvidence['process'] = { exitCode: null, signal: null, error: null, timedOut: false };
    const chunks: { stdout: Buffer[]; stderr: Buffer[] } = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    const output: Buffer[] = [];
    function kill() {
      if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
    const deadline = Date.now() + seconds * 1000;
    let timer: NodeJS.Timeout;
    function armTimeout() {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { outcome.timedOut = true; kill(); }
      else timer = setTimeout(armTimeout, Math.min(remaining, 2_147_483_647));
    }
    armTimeout();
    for (const stream of ['stdout', 'stderr'] as const) child[stream].on('data', (data: Buffer) => {
      const remaining = 1024 * 1024 - sizes[stream];
      const captured = data.subarray(0, Math.max(0, remaining));
      if (captured.length) { chunks[stream].push(captured); output.push(captured); }
      sizes[stream] += data.length;
      if (sizes[stream] > 1024 * 1024) { outcome.error = 'OUTPUT_LIMIT'; kill(); }
    });
    child.on('error', error => { outcome.error = (error as NodeJS.ErrnoException).code ?? error.message; });
    child.stdin.on('error', error => { if ((error as NodeJS.ErrnoException).code !== 'EPIPE') { outcome.error = error.message; kill(); } });
    child.on('close', (code, signal) => {
      clearTimeout(timer); outcome.exitCode = code; outcome.signal = signal;
      resolve({ outcome, stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8'), output: Buffer.concat(output).toString('utf8') });
    });
    child.stdin.end(input);
  });
}
