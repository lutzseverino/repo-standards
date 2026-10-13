import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { hash } from "./acquisition.js";
import { file, lockPath, projectRoot } from "./adoption-files.js";
import type { Files } from "./adoption-files.js";
import { ProductError } from "./errors.js";
import { formats } from "./formats.js";
import type { Declaration } from "./model.js";
import type { Observation } from "./observation.js";
import {
  activeRunExemption,
  readRecordedAdoption,
  rejectUnsupportedRecords,
  requireRecordedCli,
  type RecordedSelection,
} from "./recorded-state.js";
import { acquireWorker } from "./run-lock.js";
import { declarationTargets, type Targets } from "./targets.js";

// Installed rules: each active declaration's rules, installed as product-owned
// exact content at rules/<declaration ID>.md under the product state, with a
// generated index of what each covers. A declaration covers the paths and
// directory trees it targets, its confirmed scope when discovered. One that
// covers none, such as a discovered declaration with empty scope, is
// repository-wide: its rules cover every path. Lookup reads only the recorded
// adoption, which verifies every installed file against the lock.

export const rulesDirectory = ".repo-standards/rules";
const index = `${rulesDirectory}/README.md`;

function rulesPath(id: string) {
  return `${rulesDirectory}/${id}.md`;
}

type WithRules = Declaration & { rules: string };

function withRules(declarations: readonly Declaration[]): WithRules[] {
  return declarations.filter(
    (declaration): declaration is WithRules =>
      "rules" in declaration && declaration.rules !== undefined,
  );
}

// The installed rules of each declaration that has rules, by ID: what a
// failed check and contextual work cite.
export function installedRules(declarations: readonly Declaration[]) {
  return new Map(withRules(declarations).map(({ id }) => [id, rulesPath(id)]));
}

function repositoryWide({ paths, directories }: Targets) {
  return !paths.length && !directories.length;
}

// Inline code that holds any text, fenced by more backticks than it contains.
function code(text: string) {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  const padding = /^`|`$/.test(text) ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}

function indexText(selection: RecordedSelection, declarations: WithRules[]) {
  const { repository, version } = selection.standards;
  const entries = declarations.map((declaration) => {
    const targets = declarationTargets(declaration);
    const entry = `- [${code(declaration.id)}](${declaration.id}.md) covers`;
    if (repositoryWide(targets)) return `${entry} the whole repository.\n`;
    return `${entry}:\n${[
      ...targets.paths.map((path) => `  - ${code(path)}\n`),
      ...targets.directories.map(
        (directory) =>
          `  - ${code(`${directory}/`)} and everything beneath it\n`,
      ),
    ].join("")}`;
  });
  return `# Installed rules

These rules come from ${repository} ${version}, profile ${selection.profile}.
Repository Standards installs and verifies them; adopt again to change them.
Run \`repo-standards rules <path>\` to print the rules that cover a path.

${entries.join("")}`;
}

// The rules files and index an installation writes, from the run's retained
// source inputs, or none when no declaration has rules.
export function plannedRules(
  selection: RecordedSelection,
  declarations: readonly Declaration[],
  inputs: Readonly<Record<string, Observation>>,
): Files {
  const files: Files = {};
  const selected = withRules(declarations);
  for (const declaration of selected) {
    const source = inputs[declaration.rules];
    if (source?.type !== "file")
      throw new ProductError(
        "SOURCE_READ",
        `The rules of ${declaration.id} are not a retained file: ${declaration.rules}.`,
      );
    files[rulesPath(declaration.id)] = { ...source, executable: false };
  }
  if (selected.length) files[index] = file(indexText(selection, selected));
  return files;
}

export interface RulesReport {
  format: typeof formats.rules;
  path: string;
  rules: {
    declaration: string;
    coverage: "path" | "directory" | "repository";
    path: string;
    content: string;
  }[];
}

// How a declaration covers a project path, if it does.
function coverage(targets: Targets, path: string) {
  if (repositoryWide(targets)) return "repository" as const;
  if (targets.paths.includes(path)) return "path" as const;
  if (
    targets.directories.some(
      (directory) => path === directory || path.startsWith(`${directory}/`),
    )
  )
    return "directory" as const;
  return undefined;
}

// A path named from the current directory, as a project-relative path. It
// need not exist yet.
function projectPath(root: string, path: string) {
  const absolute = resolve(realpathSync(process.cwd()), path);
  const local = relative(root, absolute).split(sep).join("/");
  if (local === ".." || local.startsWith("../") || isAbsolute(local))
    throw new ProductError(
      "USAGE",
      `${path} is not inside the project at ${root}. Name a path inside the project.`,
    );
  return local;
}

export function rules(
  project: string,
  cliVersion: string,
  path: string,
): RulesReport {
  const root = projectRoot(project);
  const lock = lockPath(root);
  requireRecordedCli(root, lock, cliVersion);
  rejectUnsupportedRecords(root, lock, activeRunExemption(lock));
  const local = projectPath(root, path);
  // As for check, the worker lock keeps a run from starting mid-read.
  const release = acquireWorker(lock);
  try {
    if (existsSync(lock))
      throw new ProductError(
        "ACTIVE_RUN",
        "An adoption run is active or incomplete. Rules are looked up in a complete adoption; read status, and complete or abandon the run.",
      );
    const recorded = readRecordedAdoption(root);
    if (!recorded)
      throw new ProductError(
        "NO_SELECTION",
        "No complete adoption is recorded, so no rules are installed.",
      );
    return lookup(root, local, recorded.resolved.declarations, recorded.files);
  } finally {
    release();
  }
}

function lookup(
  root: string,
  local: string,
  declarations: readonly Declaration[],
  files: Readonly<Record<string, { sha256: string }>>,
): RulesReport {
  return {
    format: formats.rules,
    path: local,
    rules: withRules(declarations).flatMap((declaration) => {
      const covered = coverage(declarationTargets(declaration), local);
      const installed = rulesPath(declaration.id);
      if (!covered || !files[installed]) return [];
      // The bytes printed are the ones the lock records, read once.
      const bytes = readFileSync(join(root, installed));
      if (hash(bytes) !== files[installed].sha256)
        throw new ProductError(
          "STATE_INTEGRITY",
          `Retained product material changed: ${installed}. Restore it from the adopting project's committed baseline.`,
        );
      return [
        {
          declaration: declaration.id,
          coverage: covered,
          path: installed,
          content: bytes.toString("utf8"),
        },
      ];
    }),
  };
}

// The rules covering a path as text: each declaration's heading, then its
// rules as installed.
export function rulesSummary(report: RulesReport) {
  if (!report.rules.length) return `No installed rules cover ${report.path}.\n`;
  return `Rules covering ${report.path}:\n${report.rules
    .map(
      (entry) =>
        `\n## ${entry.declaration} (${entry.path}), ${entry.coverage === "repository" ? "the whole repository" : `covering ${report.path}`}\n\n${entry.content}${entry.content.endsWith("\n") ? "" : "\n"}`,
    )
    .join("")}`;
}
