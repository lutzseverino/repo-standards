import { execute, probePrerequisite } from "./execution.js";
import { ProductError } from "./errors.js";
import type { Declaration, Operation, Script } from "./model.js";
import { readOnlyGuard } from "./read-only.js";
import { concreteScope } from "./scope.js";

// Remote setup is a fix that changes the hosting platform's settings. Its
// readiness probe runs read-only during inspection, before anything is
// written, and a run defers a remote setup that is not ready only when the
// adopter chooses to. The product names no platform: the probe decides.

export type RemoteSetup = { declaration: string; id: string } & (
  | { status: "ready" }
  | { status: "not-ready"; reason: string }
  // Inspection probes only a selection it found no blockers in.
  | { status: "not-checked" }
);

// A remote setup a run defers: recorded as deferred, never as a fix result.
export interface DeferredRemoteSetup {
  declaration: string;
  id: string;
  reason: string;
}

export function remoteSetupFixes(
  declarations: { id: string; fixes: Operation[] }[],
) {
  return declarations.flatMap((declaration) =>
    declaration.fixes.flatMap((fix) =>
      fix["remote-setup"]
        ? [
            {
              declaration: declaration.id,
              fix,
              probe: fix["remote-setup"].probe,
            },
          ]
        : [],
    ),
  );
}

export function deferredRemoteSetup(
  remoteSetup: RemoteSetup[],
): DeferredRemoteSetup[] {
  return remoteSetup.flatMap((entry) =>
    entry.status === "not-ready"
      ? [{ declaration: entry.declaration, id: entry.id, reason: entry.reason }]
      : [],
  );
}

// The declarations whose fixes a run executes: every fix but the deferred.
export function withoutDeferred<T extends { declarations: Declaration[] }>(
  resolved: T,
  deferred: { declaration: string; id: string }[],
): T {
  const skipped = (declaration: string, fix: Operation) =>
    deferred.some(
      (entry) => entry.declaration === declaration && entry.id === fix.id,
    );
  return {
    ...resolved,
    declarations: resolved.declarations.map((declaration) => ({
      ...declaration,
      fixes: declaration.fixes.filter((fix) => !skipped(declaration.id, fix)),
    })),
  };
}

function prerequisiteReason(
  probe: Script,
  code: string,
  version: string | null,
) {
  const { executable } = probe.run;
  const command = [executable, ...probe.prerequisite["version-arguments"]];
  switch (code) {
    case "EXECUTABLE_MISSING":
      return `${executable} is not installed or not on PATH.`;
    case "VERSION_UNREADABLE":
      return `${JSON.stringify(command)} reported no readable version.`;
    case "VERSION_INCOMPATIBLE":
      return `${executable} ${version} does not satisfy ${probe.prerequisite.version}.`;
    default:
      return `${JSON.stringify(command)} did not exit successfully.`;
  }
}

// Runs every remote setup probe of the resolved declarations, each after its
// own prerequisite, from the project root with the probe's script read from
// the given source. A probe that cannot run, or reports anything but ready,
// is not ready with its reason. A probe that changes the project, or leaves
// processes running, fails the inspection.
export async function probeRemoteSetup(
  root: string,
  sourceRoot: string,
  selection: { standards: unknown; profile: string },
  resolved: { declarations: Declaration[] },
): Promise<RemoteSetup[]> {
  const fixes = remoteSetupFixes(resolved.declarations);
  if (!fixes.length) return [];
  const requireUnchanged = readOnlyGuard(
    root,
    concreteScope(resolved),
    "PROBE_MUTATION",
    "Remote setup probes must leave project content unchanged",
  );
  let group: number | undefined;
  const onSpawn = (spawned: number) => {
    group = spawned;
  };
  const requireStopped = (actor: string, error: string | null) => {
    if (error === "AUTHOR_PROCESS_ACTIVE" || error === "PROCESS_STATE")
      throw new ProductError(
        error,
        `${actor} left author process group ${group} with live processes, or its state cannot be read. Stop them before inspecting again.`,
      );
  };
  const results: RemoteSetup[] = [];
  for (const { declaration, fix, probe } of fixes) {
    const actor = `The readiness probe of ${declaration}/${fix.id}`;
    const entry = { declaration, id: fix.id };
    const prerequisite = await probePrerequisite(root, probe, onSpawn);
    requireStopped(actor, prerequisite.process.error);
    requireUnchanged(actor);
    if (prerequisite.code) {
      results.push({
        ...entry,
        status: "not-ready",
        reason: `${prerequisite.code}: ${prerequisiteReason(probe, prerequisite.code, prerequisite.version)}`,
      });
      continue;
    }
    const evidence = await execute(
      root,
      { declaration, phase: "probes", operation: { ...probe, id: fix.id } },
      selection,
      resolved,
      onSpawn,
      { sourceRoot },
    );
    requireStopped(actor, evidence.process.error);
    requireUnchanged(actor);
    results.push(
      evidence.result?.status === "ready"
        ? { ...entry, status: "ready" }
        : {
            ...entry,
            status: "not-ready",
            reason:
              evidence.result?.message ??
              `${evidence.error}: the probe did not return a successful process and protocol result.`,
          },
    );
  }
  return results;
}
