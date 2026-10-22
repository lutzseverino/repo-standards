import { isAbsolute, relative } from "node:path";
import { ProductError } from "./errors.js";

// Each artifact has exactly one format, and it is the one this CLI writes and
// reads, apart from the previous formats below. Retired formats are neither
// converted nor read: committed product state carrying one is replaced by a
// fresh adoption.
export const formats = {
  state: "repo-standards/state/v8",
  lock: "repo-standards/lock/v1",
  scopeHistory: "repo-standards/scope-history/v6",
  run: "repo-standards/run/v7",
  status: "repo-standards/status/v9",
  inspection: "repo-standards/inspection/v9",
  scope: "repo-standards/scope/v2",
  discovery: "repo-standards/discovery/v1",
  workRequest: "repo-standards/work-request/v5",
  assessment: "repo-standards/assessment/v3",
  operation: "repo-standards/operation/v2",
  result: "repo-standards/result/v2",
  outdated: "repo-standards/outdated/v2",
  outdatedCache: "repo-standards/outdated-cache/v2",
  check: "repo-standards/check/v2",
  rules: "repo-standards/rules/v1",
  answers: "repo-standards/answers/v1",
  adopt: "repo-standards/adopt/v2",
} as const;

type RecordFormat =
  | typeof formats.state
  | typeof formats.lock
  | typeof formats.scopeHistory
  | typeof formats.run;

// The committed formats the previous release wrote, which this CLI also reads
// as the established adoption an update replaces, so that the update carries
// its recorded answers forward. A reader treats the keys they lack as absent;
// nothing writes them.
export const previousFormats: Partial<Record<RecordFormat, string>> = {
  [formats.state]: "repo-standards/state/v7",
  [formats.scopeHistory]: "repo-standards/scope-history/v5",
};

// Public CLI 9's archived run reports stay as opaque local history. This is
// not a readable run format and never applies to an active journal.
export function excludedArchivedRun(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { format?: unknown }).format === "repo-standards/run/v6"
  );
}

// Whether a record carries its artifact's current format or the previous one
// this CLI still reads.
export function readableFormat(value: unknown, expected: RecordFormat) {
  const found =
    value && typeof value === "object"
      ? (value as { format?: unknown }).format
      : undefined;
  return found === expected || found === previousFormats[expected];
}

// The path a diagnostic names: project-relative when the record is inside the
// project, such as committed state, and absolute otherwise, such as a run record
// in a linked worktree's Git directory.
export function recordPath(root: string, path: string) {
  const local = relative(root, path);
  return local && !local.startsWith("..") && !isAbsolute(local) ? local : path;
}

// Only an older version of the same artifact is retired. Newer versions need
// the pinned CLI; malformed or unrelated formats fail the record's integrity
// validation, reported by the record's owner, and so do missing records.
export function formatAge(
  value: unknown,
  expected: RecordFormat,
): "retired" | "newer" | undefined {
  const found =
    value && typeof value === "object"
      ? (value as { format?: unknown }).format
      : undefined;
  const prefix = expected.slice(0, expected.lastIndexOf("/") + 1);
  if (
    found === expected ||
    found === previousFormats[expected] ||
    typeof found !== "string" ||
    !found.startsWith(prefix)
  )
    return undefined;
  const version = found.slice(prefix.length);
  if (!/^v(?:0|[1-9]\d*)$/.test(version)) return undefined;
  return Number(version.slice(1)) > Number(expected.slice(prefix.length + 1))
    ? "newer"
    : "retired";
}

function found(value: unknown) {
  return (value as { format: string }).format;
}

export function newerFormat(
  where: string,
  value: unknown,
  expected: RecordFormat,
) {
  return new ProductError(
    "NEWER_FORMAT",
    `${where} carries the newer format ${found(value)}; this CLI reads only ${expected}. Use the pinned CLI to read this record.`,
    { path: where, format: found(value), expected },
  );
}

// Committed product state in a retired format is replaced by a fresh adoption,
// whose start removes it. An archived run report is evidence that
// only the CLI that wrote it reads.
export function retiredFormat(
  where: string,
  value: unknown,
  expected: RecordFormat,
) {
  const path =
    expected === formats.run
      ? "Move this archived run report out of Git's directory, keeping it if its evidence matters, and run the command again."
      : "Adopt fresh: inspect with --source, --standards-version and --profile, and start that inspection, which removes the retired .repo-standards directory.";
  return new ProductError(
    "RETIRED_FORMAT",
    `${where} carries the retired format ${found(value)}; this CLI reads only ${expected}. ${path}`,
    { path: where, format: found(value), expected },
  );
}

// An active run in a retired format may hold unfinished work that only the
// CLI that started it can resume or abandon.
export function retiredRun(
  where: string,
  value: unknown,
  expected: RecordFormat,
) {
  const pinned = (value as { selection?: { cli?: { version?: unknown } } })
    .selection?.cli?.version;
  const cli =
    typeof pinned === "string"
      ? `the earlier pinned CLI ${pinned}`
      : "the earlier CLI that started it";
  return new ProductError(
    "RETIRED_RUN",
    `The active adoption run record ${where} carries the retired format ${found(value)}; this CLI reads only ${expected}. It may hold unfinished work: with ${cli}, resume it with resume --retry or end it with abandon, then inspect again.`,
    {
      path: where,
      format: found(value),
      expected,
      ...(typeof pinned === "string" ? { cli: pinned } : {}),
    },
  );
}

// Reads a record in its single format, after the format gate has run. The
// active run record is the one whose retired format may hold unfinished work.
export function requireFormat(
  where: string,
  value: unknown,
  expected: RecordFormat,
  active = false,
) {
  const age = formatAge(value, expected);
  if (age === "newer") throw newerFormat(where, value, expected);
  if (age === "retired")
    throw (active ? retiredRun : retiredFormat)(where, value, expected);
}
