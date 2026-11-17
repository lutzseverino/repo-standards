import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  acquireSource,
  externalPath,
  type SourceObservations,
  type StandardsIdentity,
} from "./acquisition.js";
import { ProductError } from "./errors.js";
import type { Declaration } from "./model.js";
import {
  matchesInventory,
  observe,
  type Content,
  type Observation,
} from "./observation.js";
import { installationTarget } from "./targets.js";

// The retained standards of a recorded adoption, laid out as a standards
// source in temporary storage outside the project. The retained inputs keep no
// copy of an installed exact file or skill file that nothing else retains
// (ADR 0036), so each such source path is read from its installed target once
// the whole target matches its installed baseline, and otherwise from the
// verified snapshot of the recorded source, whose bytes must match that
// baseline. Callers read the layout as any acquired source, without learning
// where each path came from.

// Retained standards used in place of an acquired source.
export type RetainedSource = Awaited<ReturnType<typeof acquireSource>> & {
  manifest: string;
};

type Baseline = Pick<Content, "sha256" | "executable">;

// What the recorded adoption verified: its retained source files, keyed
// relative to the retained source; its normalized manifest; its selection's
// standards; its resolved declarations with their installed baselines and
// skill inventories; and the installed targets as the adoption's checkout
// holds them.
export interface RecordedStandards {
  project: string;
  identity: StandardsIdentity;
  manifest: string;
  retained: ReadonlyMap<string, Content>;
  declarations: readonly Declaration[];
  baselines: Readonly<Record<string, Baseline>>;
  skills: Readonly<Record<string, string[]>>;
  target(path: string): Observation;
}

// One installed file of exact content: its source path, its project path and
// its installed baseline.
interface InstalledFile {
  source: string;
  path: string;
  baseline: Baseline;
}

// An installation target with the installed files the retained inputs lack.
interface Unretained {
  target: string;
  inventory?: string[];
  files: InstalledFile[];
  needed: InstalledFile[];
}

function invalid(): never {
  throw new ProductError(
    "STATE_INTEGRITY",
    "Recorded adoption state failed integrity validation. Restore the committed product state.",
  );
}

// The installed files of an exact file or skill declaration, from its
// installed baseline, or none for contextual guidance.
function installedFiles(
  declaration: Declaration,
  baselines: RecordedStandards["baselines"],
  skills: RecordedStandards["skills"],
) {
  const target = installationTarget(declaration);
  if (target === undefined) return undefined;
  const baseline = (path: string) => {
    const value = baselines[path];
    if (!value) invalid();
    return value;
  };
  if (declaration.kind !== "skill") {
    if (!("exact" in declaration)) return undefined;
    return {
      target,
      files: [
        { source: declaration.exact, path: target, baseline: baseline(target) },
      ],
    };
  }
  const inventory = skills[target];
  if (!inventory) invalid();
  return {
    target,
    inventory,
    files: inventory.map((name) => ({
      source: `${declaration.source}/${name}`,
      path: `${target}/${name}`,
      baseline: baseline(`${target}/${name}`),
    })),
  };
}

// The observation at a path relative to a target's observation; '' is the
// target itself.
function entryAt(value: Observation, relative: string): Observation {
  let current = value;
  for (const name of relative ? relative.split("/") : []) {
    if (current.type !== "directory" || !Object.hasOwn(current.entries, name))
      return { type: "missing" };
    current = current.entries[name]!;
  }
  return current;
}

function matches(value: Observation, baseline: Baseline) {
  return (
    value.type === "file" &&
    value.sha256 === baseline.sha256 &&
    value.executable === baseline.executable
  );
}

// Writes the layout's files, each with its mode, under a new temporary root.
function writeLayout(project: string, files: Map<string, Content>) {
  const directory = mkdtempSync(
    join(externalPath(tmpdir(), project), "repo-standards-retained-"),
  );
  const root = join(directory, "source");
  try {
    mkdirSync(root);
    for (const [path, value] of files) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(
        join(root, path),
        Buffer.from(value.content, value.encoding),
        { mode: value.executable ? 0o755 : 0o644 },
      );
    }
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    root,
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}

// The recorded source's snapshot, for the edited targets that need it. It
// must still resolve to the recorded commit. An acquisition failure keeps its
// outcome and names the edited targets.
async function recordedSnapshot(
  standards: RecordedStandards,
  edited: readonly Unretained[],
  observations?: SourceObservations,
) {
  const { repository, version, commit } = standards.identity;
  const need = `Edited installed ${edited.length === 1 ? "target" : "targets"} ${edited.map(({ target }) => target).join(", ")} ${edited.length === 1 ? "needs" : "need"} the recorded source ${repository} ${version}, because the retained inputs keep no copy of installed exact content.`;
  let snapshot: Awaited<ReturnType<typeof acquireSource>>;
  try {
    snapshot = await acquireSource(
      repository,
      version,
      standards.project,
      observations,
    );
  } catch (error) {
    if (!(error instanceof ProductError)) throw error;
    const Failure = error.constructor as typeof ProductError;
    throw new Failure(error.code, `${error.message} ${need}`, error.details);
  }
  if (snapshot.identity.commit !== commit) {
    snapshot.close();
    throw new ProductError(
      "MOVED_TAG",
      `The recorded ${version} tag previously resolved to ${commit}; it now resolves to ${snapshot.identity.commit}. Choose a new immutable version. ${need}`,
    );
  }
  return snapshot;
}

// The recorded standards as a standards source.
export async function retainedSource(
  standards: RecordedStandards,
  observations?: SourceObservations,
): Promise<RetainedSource> {
  const files = new Map(standards.retained);
  const unretained: Unretained[] = [];
  for (const declaration of standards.declarations) {
    const installed = installedFiles(
      declaration,
      standards.baselines,
      standards.skills,
    );
    const needed = installed?.files.filter(({ source }) => !files.has(source));
    if (installed && needed?.length) unretained.push({ ...installed, needed });
  }
  const edited: Unretained[] = [];
  for (const entry of unretained) {
    const current = standards.target(entry.target);
    const relative = (path: string) =>
      path === entry.target ? "" : path.slice(entry.target.length + 1);
    if (
      entry.files.every(({ path, baseline }) =>
        matches(entryAt(current, relative(path)), baseline),
      ) &&
      (entry.inventory === undefined ||
        matchesInventory(current, entry.inventory))
    )
      for (const { source, path } of entry.needed)
        files.set(source, entryAt(current, relative(path)) as Content);
    else edited.push(entry);
  }
  if (edited.length) {
    const snapshot = await recordedSnapshot(standards, edited, observations);
    try {
      for (const entry of edited)
        for (const { source, baseline } of entry.needed) {
          const parts = source.split("/");
          const value = parts.some((_, index) =>
            snapshot.symlinks.has(parts.slice(0, index + 1).join("/")),
          )
            ? ({ type: "symlink", target: "" } as const)
            : observe(join(snapshot.root, source));
          if (!matches(value, baseline))
            throw new ProductError(
              "STATE_INTEGRITY",
              `The recorded source ${standards.identity.repository} ${standards.identity.version} does not hold the installed baseline of ${entry.target}: ${source} differs. Restore the committed product state.`,
              { path: entry.target, source },
            );
          files.set(source, value as Content);
        }
    } finally {
      snapshot.close();
    }
  }
  const paths = new Set<string>();
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let length = 1; length <= parts.length; length++)
      paths.add(parts.slice(0, length).join("/"));
  }
  const layout = writeLayout(standards.project, files);
  return {
    root: layout.root,
    identity: standards.identity,
    paths,
    symlinks: new Set<string>(),
    manifest: standards.manifest,
    close: layout.close,
  };
}
