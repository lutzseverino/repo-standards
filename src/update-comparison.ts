import { ProductError } from "./errors.js";
import type {
  Declaration,
  Operation,
  Script,
  SourceDeclaration,
} from "./model.js";
import {
  matchesInventory,
  type Blocker,
  type HashInventory,
  type Observation,
} from "./observation.js";
import type { RecordedAdoption, RecordedSelection } from "./recorded-state.js";
import { declarationTargets, type Targets } from "./targets.js";

// The update comparison: what inspecting a candidate against an established
// adoption changes. It takes the verified recorded adoption, the candidate
// selection and materials, and the project's observed product state, and
// returns the whole update part of an inspection report together with the
// product-state-integrity blocker. It rejects a moved tag. What happens to
// installed content is for target ownership to judge.
//
// An update's class says whether anything an adopter reviews in context
// changes. It is exact only when every declaration's guidance, discovery
// guidance and script, operations (definition, script, arguments, resources
// and any remote setup probe), and confirmed scope, and every contextual
// declaration's rules, are hash-identical to the retained inputs and no
// declaration retires; any difference makes it contextual. Exact content, an
// exact declaration's rules, skills and the selection itself never affect the
// class. A declaration with no scope has no rules or operations to compare,
// and its no scope differs from an empty scope.
type UpdateClass = "exact" | "contextual";
type ContextualChange =
  "guidance" | "rules" | "discovery" | "operations" | "scope" | "retired";
interface DeclarationChanges {
  id: string;
  changes: ContextualChange[];
}

export type FileHashes = Record<
  string,
  { sha256: string; executable: boolean }
>;

// What the candidate would adopt: its selection, its source-resolved
// declarations, the declarations whose scope is confirmed, and each referenced
// source path's observation.
interface UpdateCandidate {
  selection: RecordedSelection;
  declarations: readonly SourceDeclaration[];
  resolved: readonly Declaration[];
  inputs: Readonly<Record<string, Observation>>;
}

// The selection components an update can change, in reporting order.
const selectionComponents = [
  "cli",
  "standards",
  "source",
  "profile",
  "platform",
] as const;
type SelectionComponent = (typeof selectionComponents)[number];

const retainedSource = ".repo-standards/inputs/source/";

// Strings in code-unit order, as a default sort orders them.
function codeUnitOrder(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sorted(files: FileHashes): FileHashes {
  return Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => codeUnitOrder(a, b)),
  );
}

// A referenced path's files, keyed relative to it: '' for a file, '/name' for
// the files of a directory tree.
export function retainedFiles(
  recorded: Pick<RecordedAdoption, "files">,
  path: string,
): FileHashes {
  const base = retainedSource + path;
  return sorted(
    Object.fromEntries(
      Object.entries(recorded.files)
        .filter(([name]) => name === base || name.startsWith(base + "/"))
        .map(([name, { sha256, executable }]) => [
          name.slice(base.length),
          { sha256, executable },
        ]),
    ),
  );
}

// An observed or inventoried path's files, keyed as retainedFiles keys them.
export function inventoryFiles(
  value: Observation | HashInventory | undefined,
): FileHashes {
  const files: FileHashes = {};
  function visit(prefix: string, value: Observation | HashInventory) {
    if (value.type === "file")
      files[prefix] = { sha256: value.sha256, executable: value.executable };
    else if (value.type === "directory")
      for (const [name, child] of Object.entries(value.entries))
        visit(`${prefix}/${name}`, child);
  }
  if (value) visit("", value);
  return sorted(files);
}

function candidateFiles(candidate: UpdateCandidate, path: string): FileHashes {
  return inventoryFiles(candidate.inputs[path]);
}

// A script's complete definition with the files of its script and resources,
// as an operation, readiness probe or discovery script declares it.
export function scriptMaterial(
  declared: Script,
  files: (path: string) => FileHashes,
) {
  return {
    executable: declared.run.executable,
    script: declared.run.script,
    scriptFiles: files(declared.run.script),
    arguments: declared.run.arguments,
    resources: declared.run.resources.map((path) => ({
      path,
      files: files(path),
    })),
    versionArguments: declared.prerequisite["version-arguments"],
    version: declared.prerequisite.version,
    timeout: declared["timeout-seconds"],
  };
}

// A discovery declaration's discovery guidance and optional script.
interface Discovery {
  discovery: string;
  "discovery-script"?: Script | undefined;
}

// The reviewable material of one declaration, built field by field so that
// the comparison does not depend on how either side was serialized.
function material(
  declaration: {
    guidance?: string;
    rules?: string;
    fixes?: Operation[];
    checks?: Operation[];
  },
  discovery: Discovery | undefined,
  scope: (Targets & { none?: boolean }) | undefined,
  files: (path: string) => FileHashes,
) {
  const script = (declared: Script) => scriptMaterial(declared, files);
  const operations = (list: Operation[] = []) =>
    list.map((operation) => ({
      id: operation.id,
      ...script(operation),
      remoteSetup: operation["remote-setup"]
        ? { probe: script(operation["remote-setup"].probe) }
        : null,
    }));
  const discoveryScript = discovery?.["discovery-script"];
  const guided = declaration.guidance !== undefined;
  return {
    guidance: guided ? JSON.stringify(files(declaration.guidance!)) : null,
    // The rules a contextual declaration's assessment is made against.
    rules:
      guided && declaration.rules !== undefined
        ? JSON.stringify(files(declaration.rules))
        : null,
    discovery:
      discovery === undefined
        ? null
        : JSON.stringify({
            guidance: files(discovery.discovery),
            script: discoveryScript ? script(discoveryScript) : null,
          }),
    operations: JSON.stringify({
      fixes: operations(declaration.fixes),
      checks: operations(declaration.checks),
    }),
    scope:
      guided && scope
        ? JSON.stringify({
            paths: [...scope.paths].sort(),
            directories: [...scope.directories].sort(),
            ...(scope.none ? { none: true } : {}),
          })
        : null,
  };
}

function targets(
  declaration: Declaration | undefined,
): (Targets & { none?: boolean }) | undefined {
  return declaration && "guidance" in declaration
    ? {
        ...declarationTargets(declaration),
        ...(declaration.kind === "repository" && declaration["no-scope"]
          ? { none: true }
          : {}),
      }
    : undefined;
}

// The contextual changes of one declaration the candidate declares, against
// the discovery guidance each retained declaration's confirmed scope was
// discovered with.
function declarationChanges(
  recorded: RecordedAdoption,
  discovery: ReadonlyMap<string, Discovery>,
  candidate: UpdateCandidate,
  next: SourceDeclaration,
): ContextualChange[] {
  const previous = recorded.resolved.declarations.find(
    (declaration) => declaration.id === next.id,
  );
  const before = previous
    ? material(previous, discovery.get(next.id), targets(previous), (path) =>
        retainedFiles(recorded, path),
      )
    : material({}, undefined, undefined, () => ({}));
  const resolved = candidate.resolved.find(
    (declaration) => declaration.id === next.id,
  );
  // A declaration with no scope keeps none of its source's rules and
  // operations.
  const after = material(
    resolved?.kind === "repository" && resolved["no-scope"] ? resolved : next,
    "discovery" in next ? next : undefined,
    targets(resolved),
    (path) => candidateFiles(candidate, path),
  );
  // A guided declaration whose scope is not confirmed yet cannot match.
  if ("guidance" in next && after.scope === null) after.scope = "unconfirmed";
  return (
    ["guidance", "rules", "discovery", "operations", "scope"] as const
  ).filter((field) => before[field] !== after[field]);
}

// Any change to the durable product-state inventory blocks the entire update
// before mutation.
function stateIntegrityBlockers(
  recorded: RecordedAdoption,
  productState: Observation,
) {
  const blockers: Blocker[] = [];
  const expectedProductFiles = [
    ...Object.keys(recorded.files).filter((path) =>
      path.startsWith(".repo-standards/"),
    ),
    ".repo-standards/lock.json",
    ".repo-standards/state.json",
  ].sort();
  if (
    !matchesInventory(
      productState,
      expectedProductFiles.map((path) => path.slice(".repo-standards/".length)),
    )
  ) {
    blockers.push({
      code: "STATE_INTEGRITY",
      path: ".repo-standards",
      message:
        "The durable product-state inventory changed. Reconcile added or removed material before updating.",
    });
  }
  return blockers;
}

// The product-state inventory is checked when it is the recorded adoption's,
// and not when an incomplete run's verified installation holds it.
export function compareUpdate(
  recorded: RecordedAdoption,
  candidate: UpdateCandidate,
  productState: Observation | undefined,
) {
  const [recordedStandards, candidateStandards] = [
    recorded.selection.standards,
    candidate.selection.standards,
  ];
  const sameSource =
    candidateStandards.repository.toLowerCase() ===
    recordedStandards.repository.toLowerCase();
  if (
    sameSource &&
    candidateStandards.version === recordedStandards.version &&
    candidateStandards.commit !== recordedStandards.commit
  ) {
    throw new ProductError(
      "MOVED_TAG",
      `The recorded ${candidateStandards.version} tag previously resolved to ${recordedStandards.commit}; it now resolves to ${candidateStandards.commit}. Choose a new immutable version.`,
    );
  }
  // Every changed selection component is named together; an unchanged
  // selection is re-applied.
  const changed: Record<SelectionComponent, boolean> = {
    cli: candidate.selection.cli.version !== recorded.selection.cli.version,
    standards:
      candidateStandards.version !== recordedStandards.version ||
      candidateStandards.commit !== recordedStandards.commit,
    source: !sameSource,
    profile: candidate.selection.profile !== recorded.selection.profile,
    platform: candidate.selection.platform !== recorded.selection.platform,
  };
  const blockers = productState
    ? stateIntegrityBlockers(recorded, productState)
    : [];
  // Retirement compares source declarations: an active discovery declaration
  // awaiting its scope proposal is still declared.
  const retired = recorded.resolved.declarations.filter(
    (old) =>
      !candidate.declarations.some((declaration) => declaration.id === old.id),
  );
  const discovery = new Map<string, Discovery>(
    (recorded.scopeEvidence?.sourceResolved?.declarations ?? []).flatMap(
      ({ id, discovery, "discovery-script": script }) =>
        discovery
          ? [[id, { discovery, "discovery-script": script }] as const]
          : [],
    ),
  );
  const contextualChanges: DeclarationChanges[] = [
    ...[...new Set(retired.map(({ id }) => id))].map(
      (id): DeclarationChanges => ({ id, changes: ["retired"] }),
    ),
    ...candidate.declarations.flatMap((declaration) => {
      const changes = declarationChanges(
        recorded,
        discovery,
        candidate,
        declaration,
      );
      return changes.length ? [{ id: declaration.id, changes }] : [];
    }),
  ].sort((a, b) => codeUnitOrder(a.id, b.id));
  const updateClass: UpdateClass = contextualChanges.length
    ? "contextual"
    : "exact";
  return {
    report: {
      update: selectionComponents.filter((component) => changed[component]),
      previousSelection: recorded.selection,
      retired,
      updateClass,
      contextualChanges,
    },
    blockers,
  };
}
