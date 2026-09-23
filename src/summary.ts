import type { Blocker, HashInventory } from './inspection.js';
import type { ScopeChange } from './scope-evidence.js';

// One renderer turns an inspection report or a status record into a Markdown
// summary. It is a pure function of that input, so the same input renders the
// same bytes. It describes what the input records and nothing else: it names
// no workflow and does not say what to do with an update.

interface Selection { cli: { version: string }; standards: { repository: string; version: string; commit: string }; profile: string }
interface OperationDefinition {
  declaration: string; phase: string; id: string; 'timeout-seconds': number;
  run: { executable: string; script: string; arguments: string[] };
  prerequisite: { 'version-arguments': string[]; version: string };
}
interface ChangedFile { path: string; before: HashInventory; after: HashInventory }
type TargetedDeclaration = { id: string; kind: string; target?: string; name?: string; targets?: { paths?: string[]; directories?: string[] } };

export interface InspectionReport {
  selection: Selection; previousSelection?: Selection; update?: string[];
  updateClass?: 'exact' | 'contextual'; contextualChanges?: { id: string; changes: string[] }[];
  resolved: { declarations: TargetedDeclaration[] };
  exact: { id: string; target: string; action: string; files: ChangedFile[] }[];
  guidance: { id: string; targets: string[]; discoveryRequired?: boolean }[];
  operations: OperationDefinition[];
  systemSkill: { target: string; action: string };
  discovery?: { declarations: { id: string }[]; proposal?: unknown };
  scopeChanges?: ScopeChange[]; retired?: TargetedDeclaration[];
  start: { eligible: boolean | null; blockers: Blocker[] };
  identity: string;
}

interface OperationEvidence {
  operation: { declaration: string; phase: string; id: string };
  result: { status: string; message: string } | null; error: string | null;
}
interface Interval { phase: string; operation?: { declaration: string; id: string }; changes?: Record<string, unknown> }
interface RunRecord {
  id: string; inspection: string; selection: Selection; head: string | null;
  outcome: string; phase: string; reason: string; operations: OperationEvidence[];
  changes: string[]; completed: string[]; uncertain: string[]; nextAction: string;
  previousComplete?: { lastComplete: { run: string } };
}
export interface StatusRecord {
  selection: Selection | null;
  lastComplete: { run: string; inspection: string; completedAt: string; head: string } | null;
  operations?: OperationEvidence[]; observations?: Interval[]; scopeChanges?: ScopeChange[];
  active: RunRecord | null; execution?: string; abandoned: RunRecord[];
  stateError?: { code: string; message: string };
}

// Inline code that holds any text, including backticks.
function code(value: string) {
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map(match => match[0].length));
  const fence = '`'.repeat(longest + 1);
  const padded = value.startsWith('`') || value.endsWith('`') ? ` ${value} ` : value;
  return fence + padded + fence;
}

// Recorded prose, such as messages and next actions, as literal Markdown text
// on one line: inline markup is escaped, and so is a leading marker that would
// start a heading, list, or quote.
function text(value: string) {
  return value.replace(/\r?\n/g, ' ').replace(/[\\`*_<>\[\]~&]/g, character => `\\${character}`)
    .replace(/^([#+=-])/, '\\$1').replace(/^(\d+)([.)])/, '$1\\$2');
}

function cell(value: string) {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function table(headings: string[], rows: string[][]) {
  return [`| ${headings.join(' | ')} |`, `| ${headings.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n');
}

function section(heading: string, body: string) {
  return `## ${heading}\n\n${body}`;
}

function list(values: string[], empty: string) {
  return values.length ? values.join(', ') : empty;
}

function selectionRows(selection: Selection) {
  return [
    ['CLI', code(selection.cli.version)],
    ['Standards source', code(selection.standards.repository)],
    ['Standards version', code(selection.standards.version)],
    ['Standards commit', code(selection.standards.commit)],
    ['Profile', code(selection.profile)],
  ];
}

function declarationTarget(declaration: TargetedDeclaration) {
  if (declaration.kind === 'skill') return code(`.agents/skills/${declaration.name}`);
  if (declaration.target !== undefined) return code(declaration.target);
  return list([...declaration.targets?.paths ?? [], ...(declaration.targets?.directories ?? []).map(path => `${path}/`)].map(code), 'none');
}

// A changed file's before and after hash inventories name its change.
function fileChange({ before, after }: ChangedFile) {
  if (before.type === 'missing') return after.type === 'missing' ? undefined : 'created';
  if (after.type === 'missing') return 'deleted';
  if (before.type === 'file' && after.type === 'file') {
    if (before.sha256 === after.sha256) return before.executable === after.executable ? undefined : 'mode changed';
    return before.executable === after.executable ? 'modified' : 'modified, mode changed';
  }
  return JSON.stringify(before) === JSON.stringify(after) ? undefined : 'replaced';
}

function scopeTable(changes: ScopeChange[]) {
  return table(['Declaration', 'Added', 'Removed'], changes.map(change => [code(change.id), list(change.additions.map(code), 'none'), list(change.removals.map(code), 'none')]));
}

function evidenceTable(operations: OperationEvidence[]) {
  if (!operations.length) return 'No operations ran.';
  return table(['Phase', 'Declaration', 'Operation', 'Result', 'Message'], operations.map(evidence => [
    evidence.operation.phase, code(evidence.operation.declaration), code(evidence.operation.id),
    evidence.result?.status ?? evidence.error ?? 'unrecorded', text(evidence.result?.message ?? ''),
  ]));
}

export function inspectionSummary(report: InspectionReport) {
  const update = report.update !== undefined;
  const parts = [`# Repository Standards ${update ? 'update' : 'adoption'} proposal`];
  const previous = report.previousSelection;
  const before = previous ? selectionRows(previous) : undefined;
  parts.push(section('Selection', [
    table(['Component', 'Before', 'After'], selectionRows(report.selection).map(([name, value], index) => [name!, before ? before[index]![1]! : 'none', value!])),
    update ? `Changed components: ${list(report.update!, 'none')}.` : 'Initial adoption.',
  ].join('\n\n')));

  if (update) {
    const changes = report.contextualChanges ?? [];
    parts.push(section('Update class', report.updateClass === 'exact'
      ? 'Exact update: guidance, discovery guidance, operations, retired declarations, and confirmed scope match the retained inputs.'
      : [`Contextual update: ${changes.length === 1 ? '1 declaration differs' : `${changes.length} declarations differ`} from the retained inputs.`,
        table(['Declaration', 'Changes'], changes.map(change => [code(change.id), change.changes.join(', ')]))].join('\n\n')));
  }

  const exactRows = report.exact.flatMap(entry => entry.files.flatMap(file => {
    const change = fileChange(file);
    return change ? [[code(entry.id), code(file.path), change]] : [];
  }));
  if (report.systemSkill.action !== 'match') exactRows.push([code('adopt-standards'), code(report.systemSkill.target), report.systemSkill.action === 'create' ? 'created' : 'replaced']);
  const changedGuidance = new Map((report.contextualChanges ?? []).map(change => [change.id, change.changes]));
  const guidanceRows = report.guidance
    .filter(entry => !update || changedGuidance.has(entry.id))
    .map(entry => [code(entry.id), entry.discoveryRequired ? 'discovery not confirmed' : list(entry.targets.map(code), 'none'), update ? changedGuidance.get(entry.id)!.join(', ') : 'added']);
  parts.push(section('Changed declarations', [
    exactRows.length ? `Exact content:\n\n${table(['Declaration', 'Path', 'Change'], exactRows)}` : 'No exact content changes.',
    guidanceRows.length ? `Contextual declarations:\n\n${table(['Declaration', 'Targets', 'Changes'], guidanceRows)}` : 'No contextual declaration changes.',
  ].join('\n\n')));

  parts.push(section('Operations', report.operations.length ? table(['Phase', 'Declaration', 'Operation', 'Command', 'Prerequisite', 'Timeout'], report.operations.map(operation => [
    operation.phase, code(operation.declaration), code(operation.id),
    code(JSON.stringify([operation.run.executable, operation.run.script, ...operation.run.arguments])),
    `${code(JSON.stringify([operation.run.executable, ...operation.prerequisite['version-arguments']]))} ${code(operation.prerequisite.version)}`,
    `${operation['timeout-seconds']} s`,
  ])) : 'No operations.'));

  const discovered = report.discovery?.declarations.map(declaration => declaration.id) ?? [];
  let scope: string;
  if (discovered.length && !report.discovery!.proposal) scope = 'Discovery scope is not confirmed.';
  else if (!update) {
    const confirmed = report.resolved.declarations.filter(declaration => discovered.includes(declaration.id))
      .map(declaration => ({ id: declaration.id, additions: [...declaration.targets?.paths ?? []].sort(), removals: [] }));
    scope = confirmed.length ? scopeTable(confirmed) : 'No discovered scope.';
  } else scope = report.scopeChanges?.length ? scopeTable(report.scopeChanges) : 'No scope changes.';
  parts.push(section('Scope changes', scope));

  if (update) parts.push(section('Retired declarations', report.retired?.length
    ? table(['Declaration', 'Kind', 'Target'], report.retired.map(declaration => [code(declaration.id), declaration.kind, declarationTarget(declaration)]))
    : 'No retired declarations.'));

  if (report.start.blockers.length) parts.push(section('Blockers', table(['Code', 'Path', 'Message'],
    report.start.blockers.map(blocker => [code(blocker.code), blocker.path === undefined ? '' : code(blocker.path), text(blocker.message)]))));

  const eligibility = report.start.eligible === true ? 'eligible' : report.start.eligible === false ? 'blocked' : 'eligible once prerequisites are verified';
  parts.push(section('Identity', table(['Record', 'Value'], [['Inspection', code(report.identity)], ['Start', eligibility]])));
  return parts.join('\n\n') + '\n';
}

function changedPathRows(observations: Interval[]) {
  return observations.flatMap(interval => Object.keys(interval.changes ?? {}).sort().map(path => [
    code(path), interval.phase, interval.operation ? code(`${interval.operation.declaration}/${interval.operation.id}`) : 'none',
  ]));
}

function activeSummary(run: RunRecord, execution: string | undefined) {
  return [
    '# Repository Standards adoption run',
    section('Selection', table(['Component', 'Value'], selectionRows(run.selection))),
    section('Progress', [
      table(['Field', 'Value'], [['Outcome', run.outcome], ['Phase', run.phase], ...(execution ? [['Execution', execution]] : []), ['Reason', text(run.reason)]]),
      run.completed.length ? `Completed:\n\n${run.completed.map(entry => `- ${text(entry)}`).join('\n')}` : 'Completed: none.',
      run.uncertain.length ? `Uncertain:\n\n${run.uncertain.map(entry => `- ${text(entry)}`).join('\n')}` : 'Uncertain: none.',
    ].join('\n\n')),
    section('Operations', evidenceTable(run.operations)),
    section('Changed paths', run.changes.length ? run.changes.map(path => `- ${code(path)}`).join('\n') : 'No changed paths.'),
    section('Next action', text(run.nextAction)),
    section('Identities', table(['Record', 'Value'], [
      ['Run', code(run.id)], ['Inspection', code(run.inspection)], ['HEAD at start', run.head ? code(run.head) : 'none'],
      ['Previous complete run', run.previousComplete ? code(run.previousComplete.lastComplete.run) : 'none'],
    ])),
  ];
}

export function statusSummary(record: StatusRecord) {
  let parts: string[];
  if (record.active) parts = activeSummary(record.active, record.execution);
  else if (record.lastComplete && record.selection && !record.stateError) {
    const complete = record.lastComplete;
    const changed = changedPathRows(record.observations ?? []);
    parts = [
      '# Repository Standards adoption record',
      section('Selection', table(['Component', 'Value'], selectionRows(record.selection))),
      section('Operations', evidenceTable(record.operations ?? [])),
      section('Changed paths', changed.length ? table(['Path', 'Phase', 'Operation'], changed) : 'No observed changes.'),
      section('Scope changes', record.scopeChanges?.length ? scopeTable(record.scopeChanges) : 'No scope changes.'),
      section('Identities', table(['Record', 'Value'], [
        ['Run', code(complete.run)], ['Inspection', code(complete.inspection)], ['HEAD at start', code(complete.head)], ['Completed at', complete.completedAt],
      ])),
    ];
  } else {
    parts = ['# Repository Standards adoption record', 'No complete adoption is recorded.'];
    if (record.stateError) parts.push(section('State error', `${code(record.stateError.code)} ${text(record.stateError.message)}`));
  }
  if (record.abandoned.length) parts.push(section('Abandoned runs', table(['Run', 'Inspection', 'Phase', 'Reason'],
    record.abandoned.map(run => [code(run.id), code(run.inspection), run.phase, text(run.reason)]))));
  return parts.join('\n\n') + '\n';
}
