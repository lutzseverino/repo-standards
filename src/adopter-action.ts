import { compare, gt, lt } from "semver";
import { parse } from "yaml";
import {
  github,
  githubSource,
  isStableVersion,
  publishedReleases,
} from "./acquisition.js";
import { ProductError } from "./errors.js";
import { record } from "./records.js";

// The adopter action: what adopters must do about an update, as one line.
// Two parts make it. The CLI derives one from an inspection: the update class,
// the contextual work the run asks for and any remote setup still pending. A
// source author may write another in `standards.yaml` for an action outside
// adoption, which the CLI cannot check. Both are plain text on one line.

// One line of plain text: nonempty, with no control or line-separator
// character.
export function validAdopterAction(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/[\p{Cc}\u2028\u2029]/u.test(value)
  );
}

export interface Reason {
  code: string;
  message: string;
}

// A release's author-written line: none when the release sets no
// `adopter-action`, or the reason its `standards.yaml` could not be read.
export interface ReleaseAction {
  version: string;
  action: string | null;
  reason?: Reason;
}

// The author-written line of a `standards.yaml` document, read leniently: any
// other field is the release's own concern. A document that is not YAML, or
// whose line is invalid, reports a reason instead.
export function authoredAction(text: string, version: string): ReleaseAction {
  let document: unknown;
  try {
    document = parse(text);
  } catch {
    return {
      version,
      action: null,
      reason: {
        code: "INVALID_STANDARDS",
        message: `The standards.yaml of ${version} is not valid YAML.`,
      },
    };
  }
  const value = record(document)["adopter-action"];
  if (value === undefined) return { version, action: null };
  return validAdopterAction(value)
    ? { version, action: value }
    : {
        version,
        action: null,
        reason: {
          code: "INVALID_STANDARDS",
          message: `The adopter-action of ${version} is not one nonempty line of plain text.`,
        },
      };
}

// A release's author-written line, read from its `standards.yaml` at its tag
// through the GitHub request helper. A file that cannot be read reports its
// reason for that release alone.
export async function releaseAction(
  repository: string,
  version: string,
  timeoutMs: number,
): Promise<ReleaseAction> {
  try {
    const document = record(
      await github(
        `/repos/${repository}/contents/standards.yaml?ref=${encodeURIComponent(version)}`,
        {
          timeoutMs,
          connectionMessage:
            "Cannot reach public GitHub. Check the connection and retry later.",
          httpMessage: (status) =>
            `Public GitHub returned HTTP ${status} for the standards.yaml of ${version}.`,
          invalidJsonMessage: `Public GitHub did not return the standards.yaml of ${version}.`,
        },
      ),
    );
    if (document.type !== "file" || typeof document.content !== "string")
      throw new ProductError(
        "SOURCE_UNAVAILABLE",
        `Public GitHub did not return the standards.yaml of ${version}.`,
      );
    return authoredAction(
      Buffer.from(document.content, "base64").toString("utf8"),
      version,
    );
  } catch (error) {
    return {
      version,
      action: null,
      reason:
        error instanceof ProductError
          ? { code: error.code, message: error.message }
          : { code: "LOOKUP_FAILED", message: (error as Error).message },
    };
  }
}

// What the derived line is made from.
export interface DerivedFacts {
  // The update class; none for an initial adoption.
  update?: "exact" | "contextual";
  // The declarations whose contextual work the run asks for.
  assessed: string[];
  // Remote setup that is not ready, or that a run deferred.
  pending: {
    declaration: string;
    id: string;
    state: "not-ready" | "deferred";
  }[];
}

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function pendingList(facts: DerivedFacts, state: "not-ready" | "deferred") {
  return facts.pending
    .filter((entry) => entry.state === state)
    .map((entry) => `${entry.declaration}/${entry.id}`)
    .sort(byCode);
}

// The line the CLI derives. The same facts give the same bytes.
export function derivedAction(facts: DerivedFacts) {
  const head =
    facts.update === undefined
      ? "Initial adoption"
      : facts.update === "exact"
        ? "Exact update"
        : "Contextual update";
  const assessed = [...new Set(facts.assessed)].sort(byCode);
  const sentences: string[] = [];
  if (assessed.length)
    sentences.push(
      `${head}: the run asks for contextual work on ${assessed.join(", ")}, which needs review before it is committed.`,
    );
  else if (!facts.pending.length)
    sentences.push(
      `${head}: ${
        facts.update === "exact"
          ? "nothing"
          : "the run asks for no contextual work, so nothing"
      } is needed beyond reviewing and committing the ${facts.update === undefined ? "adoption" : "update"}.`,
    );
  else sentences.push(`${head}: the run asks for no contextual work.`);
  const notReady = pendingList(facts, "not-ready");
  if (notReady.length)
    sentences.push(
      `Remote setup is not ready for ${notReady.join(", ")}: resolve it, or defer it and run adopt again once it is ready.`,
    );
  const deferred = pendingList(facts, "deferred");
  if (deferred.length)
    sentences.push(
      `Remote setup was deferred for ${deferred.join(", ")}: resolve it and run adopt again to apply it.`,
    );
  return sentences.join(" ");
}

// What an adoption record and its status report say about the impact of the
// adopted update and the steps to take.
export interface Impact {
  derived: string;
  // The adopted release and each release since the previous selection, oldest
  // first.
  releases: ReleaseAction[];
  // Why the releases between could not be listed, when they could not.
  skipped?: Reason;
  steps: string[];
}

export function adoptionImpact(
  facts: DerivedFacts,
  releases: ReleaseAction[],
  skipped?: Reason,
): Impact {
  const steps: string[] = [];
  if (skipped)
    steps.push(
      `Check the releases since the previous selection for author-written adopter actions: they could not be listed (${skipped.code}).`,
    );
  for (const release of releases) {
    if (release.action !== null)
      steps.push(`Release ${release.version}: ${release.action}`);
    else if (release.reason)
      steps.push(
        `Check release ${release.version} for an author-written adopter action: its standards.yaml could not be read (${release.reason.code}).`,
      );
  }
  const assessed = [...new Set(facts.assessed)].sort(byCode);
  if (assessed.length)
    steps.push(`Review the contextual work on ${assessed.join(", ")}.`);
  const pending = facts.pending
    .map((entry) => `${entry.declaration}/${entry.id}`)
    .sort(byCode);
  if (pending.length)
    steps.push(
      `Resolve the remote setup for ${pending.join(", ")}, then run adopt again to apply it.`,
    );
  steps.push(
    steps.length
      ? `Review and commit the ${facts.update === undefined ? "adoption" : "update"}.`
      : `Committing the ${facts.update === undefined ? "adoption" : "update"} is the only step.`,
  );
  return {
    derived: derivedAction(facts),
    releases,
    ...(skipped ? { skipped } : {}),
    steps,
  };
}

// The facts an inspection gives. A run asks for contextual work on each
// declaration whose retained inputs differ in an update, and on every
// declaration of an initial adoption; it cannot know yet which recorded
// assessments it will reuse.
export function inspectedFacts(report: {
  updateClass?: "exact" | "contextual";
  contextualChanges?: { id: string }[];
  guidance: { id: string }[];
  remoteSetup: { declaration: string; id: string; status: string }[];
}): DerivedFacts {
  const guided = new Set(report.guidance.map(({ id }) => id));
  const changed = new Set((report.contextualChanges ?? []).map(({ id }) => id));
  return {
    ...(report.updateClass ? { update: report.updateClass } : {}),
    assessed: report.guidance
      .map(({ id }) => id)
      .filter((id) => report.updateClass === undefined || changed.has(id))
      .filter((id) => guided.has(id)),
    pending: report.remoteSetup.flatMap((entry) =>
      entry.status === "not-ready"
        ? [
            {
              declaration: entry.declaration,
              id: entry.id,
              state: "not-ready" as const,
            },
          ]
        : [],
    ),
  };
}

const lookupTimeout = 10_000;

// The adopted release's author-written line, from the source the run
// retains, and, in an update from the same source, that of each stable
// release between the previous selection and it, read from GitHub. A release
// the lookup cannot read, or a release list it cannot read, reports a reason
// and never fails the run.
export async function adoptedReleases(
  selection: { standards: { repository: string; version: string } },
  previous: { standards: { repository: string; version: string } } | undefined,
  authored: string | undefined,
): Promise<{ releases: ReleaseAction[]; skipped?: Reason }> {
  const { repository, version } = selection.standards;
  const adopted: ReleaseAction = { version, action: authored ?? null };
  if (
    !previous ||
    previous.standards.repository.toLowerCase() !== repository.toLowerCase() ||
    !isStableVersion(previous.standards.version) ||
    !isStableVersion(version) ||
    !gt(version, previous.standards.version)
  )
    return { releases: [adopted] };
  const { owner, name } = githubSource(repository);
  let between: string[];
  try {
    between = (
      await publishedReleases(`${owner}/${name}`, {
        timeoutMs: lookupTimeout,
        connectionMessage:
          "Cannot reach public GitHub. Check the connection and retry later.",
        httpMessage: (status) =>
          `Public GitHub returned HTTP ${status} for the releases of ${repository}.`,
        invalidJsonMessage: `Public GitHub did not return a release list for ${repository}.`,
        invalidResponseCode: "SOURCE_UNAVAILABLE",
      })
    )
      .filter(
        (release) => release.draft === false && release.prerelease === false,
      )
      .map((release) => release.tag)
      .filter(
        (tag) =>
          isStableVersion(tag) &&
          gt(tag, previous.standards.version) &&
          lt(tag, version),
      )
      .sort(compare);
  } catch (error) {
    return {
      releases: [adopted],
      skipped:
        error instanceof ProductError
          ? { code: error.code, message: error.message }
          : { code: "LOOKUP_FAILED", message: (error as Error).message },
    };
  }
  return {
    releases: [
      ...(await Promise.all(
        [...new Set(between)].map((tag) =>
          releaseAction(`${owner}/${name}`, tag, lookupTimeout),
        ),
      )),
      adopted,
    ],
  };
}

// The facts a completed run gives: the contextual work it asked for, which
// excludes each assessment it reused, and the remote setup it deferred.
export function completedFacts(
  report: { updateClass?: "exact" | "contextual"; guidance: { id: string }[] },
  run: {
    deferred: { declaration: string; id: string }[];
    reused: { id: string; kind: string }[];
  },
): DerivedFacts {
  const reused = new Set(
    run.reused
      .filter((answer) => answer.kind === "assessment")
      .map(({ id }) => id),
  );
  return {
    ...(report.updateClass ? { update: report.updateClass } : {}),
    assessed: report.guidance
      .map(({ id }) => id)
      .filter((id) => !reused.has(`assessment:${id}`)),
    pending: run.deferred.map(({ declaration, id }) => ({
      declaration,
      id,
      state: "deferred" as const,
    })),
  };
}

function validReason(value: unknown) {
  const reason = record(value);
  return typeof reason.code === "string" && typeof reason.message === "string";
}

// Whether recorded impact has the shape a completion writes.
export function validImpact(value: unknown): value is Impact {
  const impact = record(value);
  return (
    typeof impact.derived === "string" &&
    impact.derived.length > 0 &&
    Array.isArray(impact.releases) &&
    impact.releases.every((entry) => {
      const release = record(entry);
      return (
        typeof release.version === "string" &&
        (release.action === null || validAdopterAction(release.action)) &&
        (release.reason === undefined || validReason(release.reason))
      );
    }) &&
    (impact.skipped === undefined || validReason(impact.skipped)) &&
    Array.isArray(impact.steps) &&
    impact.steps.length > 0 &&
    impact.steps.every((step) => typeof step === "string" && step.length > 0)
  );
}
