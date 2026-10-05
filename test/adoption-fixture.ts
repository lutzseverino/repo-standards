import type { TestContext } from "node:test";
import type { Inspection, Run } from "./json-reports.ts";
import assert from "node:assert/strict";
import type { installCli } from "./installed-cli.ts";
import { sourceFixture } from "./installed-cli.ts";
import { registryFixture } from "./registry-fixture.ts";
import {
  commit,
  inspectionArgs,
  remoteFixture,
  startArgs,
} from "./remote-fixture.ts";

export type InstalledCli = ReturnType<typeof installCli>;
type Registry = Awaited<ReturnType<typeof registryFixture>>;

export interface AdoptionOptions {
  // Source files beside standards.yaml, and those to mark executable.
  files?: Record<string, string | Buffer> | undefined;
  executables?: string[] | undefined;
  repository?: string | undefined;
  recordRequests?: boolean | undefined;
  // The project before adoption, committed unless the caller prepares and
  // commits it.
  project?: Record<string, string> | undefined;
  commit?: boolean | undefined;
  // A registry the caller owns and closes, or the CLI versions a new one serves.
  registry?: Registry | undefined;
  versions?: string[] | undefined;
}

// A published standards source, a committed project and an npm registry, all
// closed with the test, and the installed CLI run against them.
export async function adoptionFixture(
  t: TestContext,
  cli: InstalledCli,
  yaml: string,
  options: AdoptionOptions = {},
) {
  const remote = remoteFixture(
    yaml,
    options.files,
    options.executables,
    options.repository,
    options.recordRequests,
  );
  const project = sourceFixture("", options.project);
  t.after(() => {
    remote.close();
    project.close();
  });
  let registry = options.registry;
  if (!registry) {
    const owned = await registryFixture(cli.root, options.versions);
    t.after(() => owned.close());
    registry = owned;
  }
  if (options.commit ?? true) commit(project.root);
  const env = { ...remote.env, ...registry.env };
  const run = (args: string[], environment: NodeJS.ProcessEnv = env) =>
    cli.run(args, project.root, environment);
  // A command's JSON report, with the result it came from. Output that is not
  // JSON fails with the command's whole output.
  const json = <T = Run>(
    args: string[],
    environment: NodeJS.ProcessEnv = env,
  ) => {
    const result = run(args, environment);
    try {
      return { result, report: JSON.parse(result.stdout) as T };
    } catch {
      assert.fail(
        `${args.join(" ")} exited ${result.status ?? result.signal} without a JSON report:\n${result.stdout}${result.stderr}`,
      );
    }
  };
  const inspect = (args = inspectionArgs) => {
    const { result, report } = json<Inspection>(args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return report;
  };
  return {
    remote,
    project,
    root: project.root,
    registry,
    env,
    run,
    json,
    inspect,
    // Inspects and starts a confirmed run, returning its report.
    start(args = inspectionArgs, environment: NodeJS.ProcessEnv = env) {
      return json<Run>(startArgs(inspect(args).identity, args), environment);
    },
    // Inspects, starts and completes a run, then commits it as the project's
    // normal workflow would.
    adopt(args = inspectionArgs) {
      const inspection = inspect(args);
      const { result, report } = json<Run>(
        startArgs(inspection.identity, args),
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(report.outcome, "complete");
      commit(project.root);
      return { inspection, run: report };
    },
  };
}

export type AdoptionFixture = Awaited<ReturnType<typeof adoptionFixture>>;
