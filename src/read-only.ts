import { hash } from "./acquisition.js";
import { json } from "./adoption-files.js";
import { ProductError } from "./errors.js";
import {
  git,
  hashInventory,
  hiddenIndexPaths,
  observeProductState,
  type HashInventory,
} from "./observation.js";
import { record } from "./records.js";
import type { Scope } from "./scope.js";
import {
  changedBoundaries,
  observedChanges,
  observeWork,
} from "./work-observation.js";

// A script that must leave the project unchanged, such as a check or a
// readiness probe, runs between two observations of the project, product
// state, HEAD and the index, the observation a run's check interval makes. A
// script can still write; this only finds what it changed.

// The staged entries and hidden paths of the index, as a run verifies them.
function indexState(root: string) {
  const index = git(root, ["ls-files", "--stage", "-z"]);
  if (index.status !== 0)
    throw new ProductError("PROJECT_READ", "Cannot read the Git index.", {
      path: "@git/index",
    });
  return hash(index.stdout + json(hiddenIndexPaths(root)));
}

// What a check or probe must leave unchanged. A failure fails the first observation
// with its own diagnostic; the caller treats a later failure as a change.
function observeUnchanged(root: string, scope: Scope) {
  // The index first, so an unreadable index is named as such.
  const index = indexState(root);
  const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  return {
    work: observeWork(root, scope),
    product: hashInventory(observeProductState(root)),
    head: head.status === 0 ? head.stdout.trim() : null,
    index,
  };
}
type Unchanged = ReturnType<typeof observeUnchanged>;

// The paths a failed observation names, if any: its own, or its blockers'.
function failedPaths(error: ProductError) {
  const details = error.details;
  const entries = Array.isArray(details)
    ? details
    : details && typeof details === "object"
      ? [details]
      : [];
  return [
    ...new Set(
      entries
        .map(record)
        .flatMap(({ path }) => (typeof path === "string" ? [path] : [])),
    ),
  ].sort();
}

function treeChanges(
  path: string,
  before: HashInventory,
  after: HashInventory,
): string[] {
  if (before.type === "directory" && after.type === "directory") {
    return [
      ...new Set([
        ...Object.keys(before.entries),
        ...Object.keys(after.entries),
      ]),
    ]
      .sort()
      .flatMap((name) =>
        treeChanges(
          `${path}/${name}`,
          before.entries[name] ?? { type: "missing" },
          after.entries[name] ?? { type: "missing" },
        ),
      );
  }
  return json(before) === json(after) ? [] : [path];
}

function changes(before: Unchanged, after: Unchanged) {
  return [
    ...new Set([
      ...observedChanges(before.work, after.work),
      ...changedBoundaries(before.work, after.work),
      ...treeChanges(".repo-standards", before.product, after.product),
      ...(before.head === after.head ? [] : ["@git/HEAD"]),
      ...(before.index === after.index ? [] : ["@git/index"]),
    ]),
  ].sort();
}

// Observes the project now and returns the comparison to run after each
// script: it fails with the code, naming the script and the changed paths,
// when the observation changed or can no longer be made.
export function readOnlyGuard(
  root: string,
  scope: Scope,
  code: string,
  rule: string,
) {
  const before = observeUnchanged(root, scope);
  return (actor: string) => {
    let after: Unchanged;
    // The first observation succeeded, so a later one that cannot be made
    // or finds the project unsafe is a change the script made.
    try {
      after = observeUnchanged(root, scope);
    } catch (error) {
      // Any failure, a product diagnostic or a system error such as EACCES,
      // keeps its code when it has one.
      const product = error instanceof ProductError ? error : undefined;
      const cause =
        product?.code ??
        (typeof (error as NodeJS.ErrnoException | null)?.code === "string"
          ? (error as NodeJS.ErrnoException).code!
          : null);
      const message = error instanceof Error ? error.message : String(error);
      const paths = product ? failedPaths(product) : [];
      throw new ProductError(
        code,
        `${actor} left the project unsafe or unreadable${paths.length ? `: ${paths.join(", ")}` : ""}. ${cause ? `${cause}: ` : ""}${message} ${rule}; the changes are preserved for review.`,
        {
          paths,
          cause: {
            code: cause,
            message,
            ...(product?.details === undefined
              ? {}
              : { details: product.details }),
          },
        },
      );
    }
    const changed = changes(before, after);
    if (changed.length)
      throw new ProductError(
        code,
        `${actor} changed the project: ${changed.join(", ")}. ${rule}; the changes are preserved for review.`,
        { paths: changed },
      );
  };
}
