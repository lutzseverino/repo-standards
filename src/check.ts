import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { hash } from './acquisition.js';
import { file, json, lockPath, projectRoot, safeDirectory, write } from './adoption-files.js';
import { ProductError } from './errors.js';
import { execute, operations, preflight } from './execution.js';
import { formats } from './formats.js';
import { hiddenIndexPaths, observeProductState } from './inspection.js';
import { git, hashInventory, requireSupportedGit, type HashInventory } from './observation.js';
import { activeRunExemption, readRecordedAdoption, rejectUnsupportedRecords, requireRecordedCli, type RecordedSelection } from './recorded-state.js';
import { record } from './records.js';
import { acquireWorker } from './run-lock.js';
import { concreteScope, type Scope } from './scope.js';
import { changedBoundaries, observedChanges, observeWork } from './work-observation.js';

// Runs the retained checks of the last complete adoption against the current
// working tree, on demand and outside any run. The adoption already disclosed
// and confirmed these checks, so nothing is confirmed again. Every check runs
// whatever earlier checks returned. Checks must leave project content
// unchanged; this command cannot prevent a write. Around each prerequisite
// probe and check it makes the observation a run's check interval makes, of
// the project, product state, HEAD and the index, and fails, naming the probe
// or check and the changed paths, when that observation changed or can no
// longer be made. It writes only its logs, under the ignored local directory,
// and records nothing.

const logs = '.repo-standards/local/checks';

export interface CheckResult {
  declaration: string; id: string;
  status: 'passed' | 'failed' | 'blocked' | 'error';
  message: string;
  // The execution error code, when the check did not return a valid result.
  error: string | null;
  stdout: string; stderr: string;
}
export interface CheckReport {
  format: typeof formats.check;
  outcome: 'passed' | 'failed';
  selection: RecordedSelection;
  checks: CheckResult[];
}

// The staged entries and hidden paths of the index, as a run verifies them.
function indexState(root: string) {
  const index = git(root, ['ls-files', '--stage', '-z']);
  if (index.status !== 0) throw new ProductError('PROJECT_READ', 'Cannot read the Git index.', { path: '@git/index' });
  return hash(index.stdout + json(hiddenIndexPaths(root)));
}

// What a check must leave unchanged. A failure fails the first observation
// with its own diagnostic; the caller treats a later failure as a change.
function observeUnchanged(root: string, scope: Scope) {
  // The index first, so an unreadable index is named as such.
  const index = indexState(root);
  const head = git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  return { work: observeWork(root, scope), product: hashInventory(observeProductState(root)), head: head.status === 0 ? head.stdout.trim() : null, index };
}
type Unchanged = ReturnType<typeof observeUnchanged>;

// The paths a failed observation names, if any: its own, or its blockers'.
function failedPaths(error: ProductError) {
  const details = error.details;
  const entries = Array.isArray(details) ? details : details && typeof details === 'object' ? [details] : [];
  return [...new Set(entries.map(record).flatMap(({ path }) => typeof path === 'string' ? [path] : []))].sort();
}

function treeChanges(path: string, before: HashInventory, after: HashInventory): string[] {
  if (before.type === 'directory' && after.type === 'directory') {
    return [...new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])].sort()
      .flatMap(name => treeChanges(`${path}/${name}`, before.entries[name] ?? { type: 'missing' }, after.entries[name] ?? { type: 'missing' }));
  }
  return json(before) === json(after) ? [] : [path];
}

function changes(before: Unchanged, after: Unchanged) {
  return [...new Set([...observedChanges(before.work, after.work), ...changedBoundaries(before.work, after.work),
    ...treeChanges('.repo-standards', before.product, after.product),
    ...(before.head === after.head ? [] : ['@git/HEAD']), ...(before.index === after.index ? [] : ['@git/index'])])].sort();
}

export async function check(project: string, cliVersion: string): Promise<CheckReport> {
  const root = projectRoot(project);
  const lock = lockPath(root);
  requireRecordedCli(root, lock, cliVersion);
  // The pin takes priority, as for status; the Git gate still precedes reading
  // records or observing the project.
  requireSupportedGit();
  // An active fresh adoption may not have removed retired state yet; the run
  // is what blocks a check.
  rejectUnsupportedRecords(root, lock, activeRunExemption(lock));
  const release = acquireWorker(lock);
  try {
    if (existsSync(lock)) throw new ProductError('ACTIVE_RUN', 'An adoption run is active or incomplete. Read status, and complete or abandon the run before checking.');
    const recorded = readRecordedAdoption(root);
    if (!recorded) throw new ProductError('NO_SELECTION', 'No complete adoption is recorded. Inspect a public source with --source, --standards-version and --profile.');
    const { selection, resolved } = recorded;
    recorded.source();
    const scope = concreteScope(resolved);
    const before = observeUnchanged(root, scope);
    const requireUnchanged = (actor: string) => {
      let after: Unchanged;
      // The first observation succeeded, so a later one that cannot be made
      // or finds the project unsafe is a change the probe or check made.
      try { after = observeUnchanged(root, scope); }
      catch (error) {
        // Any failure, a product diagnostic or a system error such as EACCES,
        // keeps its code when it has one.
        const product = error instanceof ProductError ? error : undefined;
        const code = product?.code ?? (typeof (error as NodeJS.ErrnoException | null)?.code === 'string' ? (error as NodeJS.ErrnoException).code! : null);
        const message = error instanceof Error ? error.message : String(error);
        const paths = product ? failedPaths(product) : [];
        throw new ProductError('CHECK_MUTATION', `${actor} left the project unsafe or unreadable${paths.length ? `: ${paths.join(', ')}` : ''}. ${code ? `${code}: ` : ''}${message} Checks must leave project content unchanged; the changes are preserved for review.`,
          { paths, cause: { code, message, ...(product?.details === undefined ? {} : { details: product.details }) } });
      }
      const changed = changes(before, after);
      if (changed.length) throw new ProductError('CHECK_MUTATION', `${actor} changed the project: ${changed.join(', ')}. Checks must leave project content unchanged; the changes are preserved for review.`, { paths: changed });
    };
    let group: number | undefined;
    const requireStopped = (actor: string, error: string | null) => {
      if (error === 'AUTHOR_PROCESS_ACTIVE' || error === 'PROCESS_STATE') throw new ProductError(error, `${actor} left author process group ${group} with live processes, or its state cannot be read. Stop them before checking again.`);
    };
    const prerequisites = await preflight(root, resolved, spawned => { group = spawned; }, ['checks']);
    requireStopped('A prerequisite probe', prerequisites.at(-1)?.process.error ?? null);
    requireUnchanged('A prerequisite probe');
    if (prerequisites.some(probe => probe.code)) throw new ProductError('PREREQUISITES_BLOCKED', 'Resolve the reported executable and version problems; prerequisites are never installed automatically.', prerequisites);
    safeDirectory(root, logs);
    rmSync(join(root, logs), { recursive: true, force: true });
    const checks: CheckResult[] = [];
    for (const selected of operations(resolved, 'checks')) {
      const actor = `Check ${selected.declaration}/${selected.operation.id}`;
      const evidence = await execute(root, selected, selection, resolved, spawned => { group = spawned; });
      const log = `${logs}/${checks.length}`;
      const keepLogs = () => {
        write(root, `${log}.stdout`, file(evidence.stdout));
        write(root, `${log}.stderr`, file(evidence.stderr));
      };
      // Observe before keeping the logs, so a change the check made is
      // reported as its change; its logs are then kept where possible.
      try {
        requireStopped(actor, evidence.process.error);
        requireUnchanged(actor);
      } catch (error) {
        try { keepLogs(); } catch { /* Report the check's change, not the logs. */ }
        throw error;
      }
      keepLogs();
      checks.push({ declaration: selected.declaration, id: selected.operation.id,
        status: evidence.result ? evidence.result.status as CheckResult['status'] : 'error',
        message: evidence.result?.message ?? `The check did not return a successful process and protocol result (${[evidence.error, evidence.process.error].filter(Boolean).join(': ')}). Read its logs.`,
        error: evidence.error, stdout: `${log}.stdout`, stderr: `${log}.stderr` });
    }
    return { format: formats.check, outcome: checks.every(result => result.status === 'passed') ? 'passed' : 'failed', selection, checks };
  } finally { release(); }
}

// A message or profile on one line, so it cannot pass for another line.
function oneLine(text: string) {
  return text.replace(/\s*(?:\r\n|[\n\v\f\r\x85\u2028\u2029])\s*/g, ' ').trim();
}

// The readable form of a check report: one line per check after a count. The
// JSON report keeps the profile and each message as they are.
export function checkSummary(report: CheckReport) {
  const { standards, profile } = report.selection;
  const counts = (['passed', 'failed', 'blocked', 'error'] as const).map(status => [status, report.checks.filter(result => result.status === status).length] as const)
    .filter(([, count]) => count).map(([status, count]) => `${count} ${status === 'error' ? (count === 1 ? 'error' : 'errors') : status}`);
  const lines = [`Checks of ${standards.repository} ${standards.version}, profile ${oneLine(profile)}: ${counts.length ? counts.join(', ') : 'none declared'}.`,
    ...report.checks.map(result => `${result.status.padEnd(7)} ${result.declaration}/${result.id}: ${oneLine(result.message)}${result.status === 'passed' ? '' : ` Output: ${result.stdout}, ${result.stderr}`}`)];
  return lines.join('\n') + '\n';
}
