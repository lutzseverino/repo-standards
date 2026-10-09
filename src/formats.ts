import { isAbsolute, relative } from "node:path";
import { ProductError } from "./errors.js";

// Each artifact has exactly one format, and it is the one this CLI both writes
// and reads. Retired formats are neither converted nor read: committed product
// state carrying one is replaced by a fresh adoption.
export const formats = {
  state: "repo-standards/state/v7",
  lock: "repo-standards/lock/v1",
  scopeHistory: "repo-standards/scope-history/v5",
  run: "repo-standards/run/v6",
  status: "repo-standards/status/v7",
  inspection: "repo-standards/inspection/v7",
  scope: "repo-standards/scope/v2",
  workRequest: "repo-standards/work-request/v3",
  assessment: "repo-standards/assessment/v3",
  operation: "repo-standards/operation/v2",
  result: "repo-standards/result/v2",
  outdated: "repo-standards/outdated/v1",
  outdatedCache: "repo-standards/outdated-cache/v1",
  check: "repo-standards/check/v1",
} as const;

type RecordFormat =
  | typeof formats.state
  | typeof formats.lock
  | typeof formats.scopeHistory
  | typeof formats.run;

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
// whose confirmed start removes it. An archived run report is evidence that
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
