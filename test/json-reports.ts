import type { HashInventory } from '../src/observation.ts';
import type { inspect } from '../src/inspection.ts';
import type { inspectRetained } from '../src/adoption.ts';
import type { status, Run } from '../src/adoption-run.ts';
import type { validateSource } from '../src/resolver.ts';
import type { searchSources } from '../src/discovery.ts';
import type { outdated } from '../src/outdated.ts';
import type { RecordedAdoption, RecordedSelection } from '../src/recorded-state.ts';
import type { Baseline } from '../src/adoption-files.ts';
import type { Declaration } from '../src/model.ts';
import type { ScopeProposal } from '../src/scope.ts';
import type { ScopeChange } from '../src/scope-evidence.ts';
import type { OperationEvidence } from '../src/execution.ts';
import type { Assessment } from '../src/assessment.ts';
import type { RecordedInterval } from '../src/work-evidence.ts';
import type { FileState } from '../src/scope-observation.ts';
import type { Targets } from '../src/targets.ts';

// Types at the JSON boundary keep tests coupled to the product reports and
// records while the installed CLI remains the runtime test seam.
export type Inspection = Awaited<ReturnType<typeof inspect>> & Partial<Awaited<ReturnType<typeof inspectRetained>>>;
export type Status = Omit<ReturnType<typeof status>, 'scopeProposal' | 'checks' | 'assessments' | 'observations' | 'active' | 'abandoned'> & Partial<Omit<State, 'format'>> & { active: Run | null; abandoned: Run[]; scopeProposal: ScopeProposal | null; scopeChanges?: ScopeChange[] };
export type SourceValidation = ReturnType<typeof validateSource>;
export type SearchReport = Awaited<ReturnType<typeof searchSources>>;
type OutdatedResult = Awaited<ReturnType<typeof outdated>>;
type PinFields<T> = { [K in T extends unknown ? keyof T : never]: T extends unknown ? K extends keyof T ? T[K] : undefined : never };
export type OutdatedReport = Omit<OutdatedResult, 'cli' | 'standards'> & { cli: PinFields<OutdatedResult['cli']>; standards: PinFields<OutdatedResult['standards']> };
export type State = Omit<RecordedAdoption['state'], 'checks' | 'assessments' | 'observations'> & { observations: RecordedInterval[]; checks: OperationEvidence[]; assessments: Assessment[] };
export type { Run } from '../src/adoption-run.ts';
export type { CheckReport } from '../src/check.ts';
export type { RetainedScopeEvidence as ScopeEvidence } from '../src/scope-evidence.ts';

// The CLI error envelope and package manifests have no exported product type.
export interface ErrorReport { valid: boolean; errors: { code: string; message: string; details?: unknown }[] }
export interface Lock { format: string; selection: RecordedSelection; inspection: string; files: Record<string, Baseline>; state: Baseline }
export interface PackageManifest { name: string; version: string; dependencies: Record<string, string>; [key: string]: unknown }
export interface OperationLog {
  input: { format: string; operation: { declaration: string; phase: string; id: string }; projectRoot: string; standards: RecordedSelection['standards']; profile: string; declarations: Declaration[]; allowedTargets: Targets };
  cwd: string; args: string[];
}

export type OperationResult = NonNullable<import('../src/execution.ts').OperationEvidence['result']>;
export type { Diagnostic } from '../src/yaml.ts';
export type { HashInventory } from '../src/observation.ts';
export type { Declaration, SourceDeclaration } from '../src/model.ts';
export type { OperationEvidence } from '../src/execution.ts';
export type { FileState } from '../src/scope-observation.ts';
export interface CheckErrorDetails { paths: string[]; cause: { code: string; message: string } }

export type { ScopeProposal } from '../src/scope.ts';

export type DirectoryInventory = Extract<HashInventory, { type: 'directory' }>;
export type FileInventory = Extract<HashInventory, { type: 'file' }>;
export type UnsafeInventory = Extract<HashInventory, { type: 'unsafe' }>;
export type FileObservation = Extract<FileState, { type: 'file' }>;
