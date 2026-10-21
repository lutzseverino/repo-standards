import { hash } from "./acquisition.js";
import { json } from "./adoption-files.js";
import type { Assessment, Judgment, ScopeReview } from "./assessment.js";
import { formats } from "./formats.js";
import type { Declaration, SourceDeclaration } from "./model.js";
import type { HashInventory } from "./observation.js";
import type { RecordedAdoption } from "./recorded-state.js";
import { declinedOverwrite, type DeferredFix } from "./remote-setup.js";
import { concreteScope, parseScope, type Scope } from "./scope.js";
import { declarationTargets, type Targets } from "./targets.js";
import {
  inventoryFiles,
  retainedFiles,
  scriptMaterial,
  type FileHashes,
} from "./update-comparison.js";
import { absent, permits, type WorkObservation } from "./work-observation.js";

// A reused answer is an answer the last complete adoption recorded that an
// update gives again without asking, because what it was about is provably
// unchanged: a scope answer, a remote setup deferral, or an assessment. This
// module classifies each recorded answer against the fresh inspection, and,
// for an assessment, against the project after the run's fixes. An answer
// that is not provably unchanged comes back as a proposal, prefilled with the
// recorded answer, for the updating agent to validate. A confirmation and a
// fix's overwrite answer are never recorded here, so never reused.

export type ScopeEntry = ReturnType<typeof parseScope>["declarations"][number];
type Entry = Omit<ScopeEntry, "id">;
export type RecordedJudgment = Omit<Judgment, "id">;

// What made each kind of answer eligible.
export interface ScopeReuse {
  // The SHA-256 of the discovery guidance and of the rules, or null without
  // rules, both identical to the ones the last complete adoption recorded.
  discovery: string;
  rules: string | null;
  // What the fresh draft matched: the draft the recorded entry was decided
  // from, or, in scope evidence an earlier CLI wrote without it, the recorded
  // entry itself; none when the declaration has no discovery script.
  draft: "decided-from" | "recorded-entry" | "none";
  // The recorded entry's candidate and evidence paths, which all exist.
  paths: string[];
}
export interface RemoteSetupReuse {
  // Each remote setup the last complete adoption deferred whose probe, with
  // an unchanged definition, still reports it not ready, with the fresh
  // reason. The definition is the SHA-256 of the probe's script, arguments,
  // resources and prerequisite.
  deferrals: (DeferredFix & { probe: string })[];
}
export interface AssessmentReuse {
  // What the recorded assessment judged against, unchanged: the rules, or the
  // adoption guidance of a declaration without rules, by SHA-256.
  judgedAgainst: { kind: "rules" | "guidance"; sha256: string | null };
  // The identity of the scoped files after this run's fixes, equal to the
  // recorded one: the declaration's own, or the whole project's in state an
  // earlier CLI wrote, which records only that.
  scope: { basis: "declaration" | "project"; snapshot: string };
}

export type ReusedAnswer =
  | { id: string; kind: "scope"; evidence: ScopeReuse }
  | { id: "remote-setup"; kind: "remote-setup"; evidence: RemoteSetupReuse }
  | { id: string; kind: "assessment"; evidence: AssessmentReuse };

// An answer that is eligible, or the recorded answer proposed with what
// changed.
export type Classified<Answer, Evidence> =
  { answer: Answer; reused: Evidence } | { answer: Answer; changed: string[] };

const sha256 = (files: FileHashes) => files[""]?.sha256 ?? null;
const same = (a: unknown, b: unknown) => json(a) === json(b);

// A scope entry as a proposal reads it, so entries are compared regardless of
// how either side was written.
function normalized(entry: unknown) {
  try {
    const [parsed] = parseScope(
      JSON.stringify({
        format: formats.scope,
        declarations: [{ ...(entry as object), id: "entry" }],
      }),
    ).declarations;
    const { id: _id, ...rest } = parsed!;
    return json(rest);
  } catch {
    return undefined;
  }
}

// Whether two scope entries are the same as a proposal reads them.
export function sameEntry(a: unknown, b: unknown) {
  const left = normalized(a);
  return left !== undefined && left === normalized(b);
}

// The paths a scope entry names: each candidate and its evidence.
function namedPaths(entry: Entry) {
  return [
    ...new Set(
      entry.candidates.flatMap((candidate) => [
        candidate.path,
        ...candidate.evidence,
      ]),
    ),
  ].sort();
}

// The fresh side of one discovery declaration: its discovery guidance and
// rules as the inspection reads them, and its discovery script's draft.
export interface FreshDiscovery {
  discovery: { sha256: string; executable: boolean };
  rules: FileHashes;
  draft: Entry | undefined;
  // Whether its scope may be no scope.
  optional: boolean;
}

// The source declaration's rules path, if it has rules.
function rulesOf(declarations: readonly unknown[] | undefined, id: string) {
  const declaration = (declarations as { id: string; rules?: unknown }[])?.find(
    (entry) => entry.id === id,
  );
  return typeof declaration?.rules === "string" ? declaration.rules : undefined;
}

// Classifies the scope answer the last complete adoption recorded for a
// discovery declaration. It is reused when the discovery guidance and rules
// are hash-identical to the recorded ones, the fresh draft matches the
// recorded scope evidence, and every path the entry names still exists.
export function classifyScope(
  root: string,
  recorded: RecordedAdoption | undefined,
  id: string,
  fresh: FreshDiscovery,
): Classified<Entry, ScopeReuse> | undefined {
  const discovery = recorded?.scopeEvidence?.discovery;
  const proposal = discovery?.proposal as
    { declarations?: ScopeEntry[] } | undefined;
  const found = proposal?.declarations?.find((entry) => entry.id === id);
  if (!found) return undefined;
  const { id: _id, ...answer } = found;
  const changed: string[] = [];
  const guidance = (
    discovery!.declarations as {
      id: string;
      sha256: string;
      executable: boolean;
    }[]
  ).find((entry) => entry.id === id);
  if (
    guidance?.sha256 !== fresh.discovery.sha256 ||
    guidance.executable !== fresh.discovery.executable
  )
    changed.push("Its discovery guidance changed.");
  const rulesPath = rulesOf(
    recorded!.scopeEvidence!.sourceResolved?.declarations,
    id,
  );
  const rules = rulesPath ? retainedFiles(recorded!, rulesPath) : {};
  if (!same(rules, fresh.rules)) changed.push("Its rules changed.");
  // Scope evidence an earlier CLI wrote keeps no drafts: a fresh draft then
  // matches only the recorded entry itself.
  const drafts = discovery!.drafts as ScopeEntry[] | undefined;
  const decidedFrom = drafts?.find((entry) => entry.id === id);
  let draft: ScopeReuse["draft"] = "none";
  if (drafts && (decidedFrom === undefined) !== (fresh.draft === undefined))
    changed.push(
      fresh.draft
        ? "Its discovery script now drafts an entry."
        : "Its discovery script no longer drafts an entry.",
    );
  else if (fresh.draft) {
    draft = drafts ? "decided-from" : "recorded-entry";
    if (!sameEntry(fresh.draft, drafts ? decidedFrom : answer))
      changed.push(
        drafts
          ? "Its discovery script's draft changed since the recorded entry was decided from it."
          : "Its discovery script's draft differs from the recorded entry.",
      );
  }
  if (answer.noScope && !fresh.optional)
    changed.push("It is no longer optional, so it cannot keep no scope.");
  const paths = namedPaths(answer);
  const missing = paths.filter((path) => absent(root, path));
  if (missing.length)
    changed.push(`Recorded paths no longer exist: ${missing.join(", ")}.`);
  return changed.length
    ? { answer, changed }
    : {
        answer,
        reused: {
          discovery: fresh.discovery.sha256,
          rules: sha256(fresh.rules),
          draft,
          paths,
        },
      };
}

// Whether every path a recorded entry names exists, so that inspection can
// read the entry as part of a proposal.
export function entryPathsExist(root: string, entry: Entry) {
  return namedPaths(entry).every((path) => !absent(root, path));
}

// The fresh side of the remote setup question: the inspection's resolved
// declarations and the hashes of its inputs.
interface FreshSelection {
  resolved: { declarations: Declaration[] };
  inputs: Record<string, HashInventory>;
}

// The readiness probe of a remote setup fix, as resolved declarations declare
// it.
function probeOf(declarations: Declaration[], fix: DeferredFix) {
  return declarations
    .find((declaration) => declaration.id === fix.declaration)
    ?.fixes.find((operation) => operation.id === fix.id)?.["remote-setup"]
    ?.probe;
}

// Classifies the remote setup question against the deferrals the last
// complete adoption recorded. It is reused when every remote setup that is
// not ready was deferred, as remote setup, with an unchanged probe definition.
// Otherwise, when any of them was deferred, it is proposed as defer, naming
// each probe that changed and each remote setup never deferred before, and it
// is asked as before when none was. A fix deferred because the maintainer
// declined its overwrite is not a remote setup deferral.
export function classifyRemoteSetup(
  recorded: RecordedAdoption | undefined,
  notReady: DeferredFix[],
  fresh: FreshSelection,
): Classified<"defer", RemoteSetupReuse> | undefined {
  if (!recorded || !notReady.length) return undefined;
  const changed: string[] = [];
  const deferrals: RemoteSetupReuse["deferrals"] = [];
  let recordedDeferrals = 0;
  for (const entry of notReady) {
    const deferred = (recorded.state.deferred ?? []).some(
      (fix) =>
        fix.declaration === entry.declaration &&
        fix.id === entry.id &&
        !fix.reason.startsWith(declinedOverwrite),
    );
    const before = probeOf(recorded.resolved.declarations, entry);
    const after = probeOf(fresh.resolved.declarations, entry);
    if (!deferred || !before || !after) {
      changed.push(
        `The last complete adoption did not defer ${entry.declaration}/${entry.id} as remote setup.`,
      );
      continue;
    }
    recordedDeferrals++;
    const definition = scriptMaterial(after, (path) =>
      inventoryFiles(fresh.inputs[path]),
    );
    if (
      !same(
        scriptMaterial(before, (path) => retainedFiles(recorded, path)),
        definition,
      )
    )
      changed.push(
        `The readiness probe of ${entry.declaration}/${entry.id} changed since it was deferred.`,
      );
    deferrals.push({ ...entry, probe: `sha256:${hash(json(definition))}` });
  }
  if (!recordedDeferrals) return undefined;
  return changed.length
    ? { answer: "defer", changed }
    : { answer: "defer", reused: { deferrals } };
}

// The identity of a declaration's scoped files in a work observation: its
// targets and the state of every observed file they permit.
export function declarationSnapshot(
  observation: WorkObservation,
  targets: Targets,
) {
  const files = Object.keys(observation.files)
    .filter((path) => permits(targets, path))
    .sort()
    .map((path) => [path, observation.files[path]]);
  return `sha256:${hash(
    json({
      targets: {
        paths: [...targets.paths].sort(),
        directories: [...targets.directories].sort(),
      },
      files,
    }),
  )}`;
}

// The recorded side of one contextual declaration's assessment, kept with the
// run's installation: the recorded judgment, whether what it was judged
// against is unchanged, and what proves its scoped files unchanged.
export interface AssessmentBasis {
  id: string;
  judgment: RecordedJudgment;
  judgedAgainst: AssessmentReuse["judgedAgainst"];
  changedAgainst: boolean;
  scope:
    | { basis: "declaration"; snapshot: string }
    // State an earlier CLI wrote binds only the whole project's work
    // snapshot, over the recorded selection's concrete scope and that run's
    // retry count, so the declaration's targets must also be the recorded ones.
    | {
        basis: "project";
        snapshot: string;
        scope: Scope;
        retries: number;
        targets: Targets;
      };
}

// What a contextual declaration's assessment is made against: its rules, or
// its adoption guidance when it has none.
function judgedAgainst(declaration: Declaration | undefined) {
  if (!declaration || !("guidance" in declaration)) return undefined;
  return declaration.rules !== undefined
    ? { kind: "rules" as const, path: declaration.rules }
    : { kind: "guidance" as const, path: declaration.guidance };
}

// The recorded assessment bases of the contextual declarations an update's
// inspection names, for the declarations whose recorded judgment was accepted.
export function assessmentBases(
  recorded: RecordedAdoption | undefined,
  report: {
    resolved: { declarations: Declaration[] };
    guidance: { id: string }[];
    inputs: Record<string, HashInventory>;
  },
): AssessmentBasis[] {
  const assessment = recorded?.state.assessments.at(-1) as
    Assessment | undefined;
  if (!recorded || !assessment) return [];
  const scopes = recorded.state.assessedScopes;
  return report.guidance.flatMap(({ id }) => {
    const judged = assessment.declarations.find((entry) => entry.id === id);
    const previous = judgedAgainst(
      recorded.resolved.declarations.find((entry) => entry.id === id),
    );
    const current = judgedAgainst(
      report.resolved.declarations.find((entry) => entry.id === id),
    );
    if (judged?.status !== "satisfied" || !previous || !current) return [];
    const after = inventoryFiles(report.inputs[current.path]);
    const { changedPaths: _changed, id: _id, ...judgment } = judged;
    const scope: AssessmentBasis["scope"] | undefined = scopes
      ? scopes[id]
        ? { basis: "declaration", snapshot: scopes[id] }
        : undefined
      : {
          basis: "project",
          snapshot: assessment.snapshot,
          scope: concreteScope(recorded.resolved),
          retries: recorded.state.retryHistory.length,
          targets: declarationTargets(
            recorded.resolved.declarations.find((entry) => entry.id === id)!,
          ),
        };
    if (!scope) return [];
    return [
      {
        id,
        judgment,
        judgedAgainst: { kind: current.kind, sha256: sha256(after) },
        changedAgainst:
          previous.kind !== current.kind ||
          !same(retainedFiles(recorded, previous.path), after),
        scope,
      },
    ];
  });
}

// Each basis classified against the project now, after the run's fixes: its
// scoped files are unchanged when their identity equals the recorded one. The
// whole-project identity is observed at most once, and only when a basis
// needs it.
export function classifyAssessments(
  bases: AssessmentBasis[],
  observation: WorkObservation,
  resolved: { declarations: Declaration[] },
  projectSnapshot: (scope: Scope, retries: number) => string | undefined,
) {
  let project: { snapshot: string | undefined } | undefined;
  return new Map(
    bases.map(
      (basis): [string, Classified<RecordedJudgment, AssessmentReuse>] => {
        const declaration = resolved.declarations.find(
          (entry) => entry.id === basis.id,
        )!;
        const targets = declarationTargets(declaration);
        const sorted = ({ paths, directories }: Targets) => ({
          paths: [...paths].sort(),
          directories: [...directories].sort(),
        });
        const snapshot =
          basis.scope.basis === "declaration"
            ? declarationSnapshot(observation, targets)
            : !same(sorted(targets), sorted(basis.scope.targets))
              ? undefined
              : (project ??= {
                  snapshot: projectSnapshot(
                    basis.scope.scope,
                    basis.scope.retries,
                  ),
                }).snapshot;
        const changed = [
          ...(basis.changedAgainst
            ? [
                basis.judgedAgainst.kind === "rules"
                  ? "Its rules changed since the recorded assessment."
                  : "Its adoption guidance, which it has in place of rules, changed since the recorded assessment.",
              ]
            : []),
          ...(snapshot !== basis.scope.snapshot
            ? [
                basis.scope.basis === "declaration"
                  ? "Files in its scope changed since the last complete adoption."
                  : "Project files changed since the last complete adoption, whose state records only the whole project's snapshot.",
              ]
            : []),
        ];
        return [
          basis.id,
          changed.length
            ? { answer: basis.judgment, changed }
            : {
                answer: basis.judgment,
                reused: {
                  judgedAgainst: basis.judgedAgainst,
                  scope: { basis: basis.scope.basis, snapshot: snapshot! },
                },
              },
        ];
      },
    ),
  );
}

// A judgment compared as the run accepts it.
function judgmentKey(judgment: Partial<RecordedJudgment>) {
  const review = (value: ScopeReview | undefined) =>
    value && [
      value.status,
      value.explanation,
      value.evidence,
      value.additionalPaths,
    ];
  return json([
    judgment.status,
    judgment.explanation,
    judgment.evidence,
    judgment.scopeValidity
      ? [
          review(judgment.scopeValidity.afterFixes),
          review(judgment.scopeValidity.current),
        ]
      : null,
  ]);
}

// Whether an answer is the given recorded judgment, as the run accepts it.
export function sameJudgment(a: unknown, b: RecordedJudgment) {
  return !!a && typeof a === "object" && judgmentKey(a) === judgmentKey(b);
}

// The assessments a work request's declarations reuse: each one whose answer
// is the recorded judgment it carries to reuse.
export function reusedAssessments(
  declarations: {
    id: string;
    reused?: { judgment: RecordedJudgment; evidence: AssessmentReuse };
  }[],
  answer: (id: string) => unknown,
): ReusedAnswer[] {
  return declarations.flatMap(({ id, reused }) =>
    reused && sameJudgment(answer(id), reused.judgment)
      ? [
          {
            id: `assessment:${id}`,
            kind: "assessment" as const,
            evidence: reused.evidence,
          },
        ]
      : [],
  );
}

// The fresh discovery of a source declaration, from the inspection report and
// the drafts its discovery scripts wrote.
export function freshDiscovery(
  report: {
    discovery?: {
      declarations: { id: string; sha256: string; executable: boolean }[];
    };
    sourceResolved?: { declarations: SourceDeclaration[] };
    inputs: Record<string, HashInventory>;
  },
  drafts: ScopeEntry[],
  id: string,
): FreshDiscovery | undefined {
  const discovery = report.discovery?.declarations.find(
    (entry) => entry.id === id,
  );
  if (!discovery) return undefined;
  const rules = rulesOf(report.sourceResolved?.declarations, id);
  const draft = drafts.find((entry) => entry.id === id);
  const declaration = report.sourceResolved?.declarations.find(
    (entry) => entry.id === id,
  );
  return {
    optional:
      !!declaration && "discovery" in declaration && !!declaration.optional,
    discovery: { sha256: discovery.sha256, executable: discovery.executable },
    rules: rules ? inventoryFiles(report.inputs[rules]) : {},
    draft: draft ? (({ id: _id, ...entry }) => entry)(draft) : undefined,
  };
}
