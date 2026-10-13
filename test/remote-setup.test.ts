import type {
  ErrorReport,
  OperationEvidence,
  Run,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { TestContext } from "node:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { directoryFixture, installCli, snapshot } from "./installed-cli.ts";
import {
  commit,
  inspectionArgs,
  manifest,
  operation,
  startArgs,
  versionArgs,
  type OperationOptions,
} from "./remote-fixture.ts";
import { adoptionFixture } from "./adoption-fixture.ts";

const cli = installCli();
after(() => cli.close());

// The probe is ready once its marker exists outside the project, and records
// the input and directory it ran with. The fix records each application
// outside the project, as a change to a hosting platform would be.
const probe = `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const [ready, log] = process.argv.slice(2);
appendFileSync(log, JSON.stringify({ input: JSON.parse(readFileSync(0, 'utf8')), cwd: process.cwd() }) + '\\n');
console.log(JSON.stringify(existsSync(ready)
  ? { format: 'repo-standards/result/v2', status: 'ready', message: 'Signed in.' }
  : { format: 'repo-standards/result/v2', status: 'not-ready', message: 'Sign in to the hosting platform.' }));
`;
const fix = `import { appendFileSync } from 'node:fs';
appendFileSync(process.argv[2], 'applied\\n');
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: 'changed', message: 'Labels created.' }));
`;
const files = {
  "content.md": "Expected",
  "remote/probe.mjs": probe,
  "remote/fix.mjs": fix,
};
const exact = { kind: "file", target: "AGENTS.md", exact: "content.md" };
const reason = "Sign in to the hosting platform.";
const retained = ["inspect", "--json"];
const defer = (args: string[]) => [...args, "--defer-remote-setup"];

async function fixture(
  t: TestContext,
  options: { fix?: OperationOptions; probe?: OperationOptions } = {},
) {
  const external = directoryFixture("repo-standards-remote-");
  t.after(() => external.close());
  const marker = join(external.root, "ready");
  const applied = join(external.root, "applied.log");
  const probes = join(external.root, "probes.log");
  const f = await adoptionFixture(
    t,
    cli,
    manifest({
      instructions: {
        ...exact,
        fixes: [
          {
            ...operation("labels", {
              script: "remote/fix.mjs",
              arguments: [applied],
              ...options.fix,
            }),
            "remote-setup": {
              probe: (({ id: _id, ...declared }) => declared)(
                operation("probe", {
                  script: "remote/probe.mjs",
                  arguments: [marker, probes],
                  ...options.probe,
                }),
              ),
            },
          },
        ],
      },
    }),
    { files, project: { "README.md": "Project" } },
  );
  return {
    ...f,
    ready: () => writeFileSync(marker, ""),
    applications: () =>
      existsSync(applied)
        ? readFileSync(applied, "utf8").split("\n").filter(Boolean).length
        : 0,
    probes: () =>
      existsSync(probes)
        ? readFileSync(probes, "utf8")
            .split("\n")
            .filter(Boolean)
            .map(
              (line) =>
                JSON.parse(line) as {
                  input: { operation: unknown; overwriteAllowed: boolean };
                  cwd: string;
                },
            )
        : [],
    status: () => f.json<Status>(["status", "--json"]).report,
    summary: () => f.run(["status", "--summary"]).stdout,
  };
}

const notReady = {
  declaration: "instructions",
  id: "labels",
  status: "not-ready",
  reason,
};
const deferred = { declaration: "instructions", id: "labels", reason };

test("a remote setup that is not ready stops start before any write unless it is deferred", async (t) => {
  const f = await fixture(t);
  const before = snapshot(f.root);
  const inspection = f.inspect();
  assert.deepEqual(inspection.remoteSetup, [notReady]);
  assert.deepEqual(snapshot(f.root), before, "the probe left the project");
  const probed = f.probes();
  assert.equal(probed.length, 1);
  assert.deepEqual(probed[0]!.input.operation, {
    declaration: "instructions",
    phase: "probes",
    id: "labels",
  });
  assert.equal(probed[0]!.input.overwriteAllowed, false);
  assert.equal(probed[0]!.cwd, f.root);
  assert.match(
    f.run([...inspectionArgs.slice(0, -1), "--summary"]).stdout,
    /## Remote setup\n\n\| Declaration \| Fix \| Readiness \| Reason \|\n\| --- \| --- \| --- \| --- \|\n\| `instructions` \| `labels` \| not ready \| Sign in to the hosting platform\. \|/,
  );

  const { result, report } = f.json<ErrorReport>(
    startArgs(inspection.identity),
  );
  assert.equal(result.status, 1, result.stdout);
  assert.equal(report.errors[0]!.code, "REMOTE_SETUP_NOT_READY");
  assert.match(report.errors[0]!.message, /instructions\/labels/);
  assert.match(report.errors[0]!.message, new RegExp(reason));
  assert.match(report.errors[0]!.message, /--defer-remote-setup/);
  assert.deepEqual(snapshot(f.root), before);
  assert.equal(f.status().active, null);
  assert.equal(f.applications(), 0);

  const started = f.json<Run>(defer(startArgs(inspection.identity)));
  assert.equal(started.result.status, 0, started.result.stdout);
  assert.equal(started.report.outcome, "complete");
  assert.deepEqual(started.report.deferred, [deferred]);
  assert.deepEqual(
    started.report.operations.map(({ operation }) => operation.id),
    [],
  );
  assert.equal(f.applications(), 0);
  assert.equal(readFileSync(join(f.root, "AGENTS.md"), "utf8"), "Expected");
  assert.deepEqual(f.status().deferred, [deferred]);
  assert.match(
    f.summary(),
    /\| fixes \| `instructions` \| `labels` \| deferred \| Sign in to the hosting platform\. \|/,
  );
});

test("every later run probes deferred remote setup, keeps it deferred while not ready, and applies it once ready", async (t) => {
  const f = await fixture(t);
  const first = f.inspect();
  assert.equal(
    f.json<Run>(defer(startArgs(first.identity))).report.outcome,
    "complete",
  );
  commit(f.root);

  // Still not ready: the later run stops again unless deferral is chosen again.
  const again = f.inspect(retained);
  assert.deepEqual(again.remoteSetup, [notReady]);
  const before = snapshot(f.root);
  const stopped = f.json<ErrorReport>(startArgs(again.identity, retained));
  assert.equal(stopped.result.status, 1);
  assert.equal(stopped.report.errors[0]!.code, "REMOTE_SETUP_NOT_READY");
  assert.deepEqual(snapshot(f.root), before);
  const kept = f.json<Run>(defer(startArgs(again.identity, retained)));
  assert.equal(kept.report.outcome, "complete", kept.result.stdout);
  assert.deepEqual(f.status().deferred, [deferred]);
  assert.equal(f.applications(), 0);
  commit(f.root);

  // Ready: the later run applies the fix as any other and clears the deferral.
  f.ready();
  const ready = f.inspect(retained);
  assert.deepEqual(ready.remoteSetup, [
    { declaration: "instructions", id: "labels", status: "ready" },
  ]);
  const applied = f.json<Run>(startArgs(ready.identity, retained));
  assert.equal(applied.report.outcome, "complete", applied.result.stdout);
  assert.deepEqual(applied.report.deferred, []);
  assert.equal(f.applications(), 1);
  const status = f.status();
  assert.deepEqual(status.deferred, []);
  assert.deepEqual(
    (status.operations as OperationEvidence[]).map(({ operation, result }) => [
      operation.id,
      result?.status,
    ]),
    [["labels", "changed"]],
  );
  assert.doesNotMatch(f.summary(), /deferred/);
});

test("a ready remote setup runs as any fix does, and deferral changes nothing", async (t) => {
  const f = await fixture(t);
  f.ready();
  const inspection = f.inspect();
  assert.deepEqual(inspection.remoteSetup, [
    { declaration: "instructions", id: "labels", status: "ready" },
  ]);
  const { result, report } = f.json<Run>(defer(startArgs(inspection.identity)));
  assert.equal(result.status, 0, result.stdout);
  assert.equal(report.outcome, "complete");
  assert.deepEqual(report.deferred, []);
  assert.deepEqual(
    report.operations.map(({ operation, result }) => [
      operation.phase,
      operation.id,
      result?.status,
    ]),
    [["fixes", "labels", "changed"]],
  );
  assert.equal(f.applications(), 1);
  assert.deepEqual(f.status().deferred, []);
});

test("a probe that cannot run is not ready, and a deferred fix's own prerequisite is not probed", async (t) => {
  const f = await fixture(t, {
    fix: { executable: "repo-standards-no-such-executable" },
    probe: { executable: "repo-standards-no-such-executable" },
  });
  const inspection = f.inspect();
  assert.equal(inspection.remoteSetup.length, 1);
  const [entry] = inspection.remoteSetup;
  assert.ok(entry?.status === "not-ready", JSON.stringify(entry));
  assert.match(
    entry.reason,
    /^EXECUTABLE_MISSING: repo-standards-no-such-executable/,
  );
  assert.deepEqual(f.probes(), []);
  const { result, report } = f.json<Run>(defer(startArgs(inspection.identity)));
  assert.equal(result.status, 0, result.stdout);
  assert.equal(report.outcome, "complete");
  assert.deepEqual(report.prerequisites, []);
  assert.equal(report.deferred.length, 1);
});

test("a probe that changes the project fails inspection and its change is preserved", async (t) => {
  const f = await fixture(t);
  f.remote.addVersion("v1.0.1", sourceManifest(f), {
    "remote/probe.mjs": `import { writeFileSync } from 'node:fs';
writeFileSync('PROBED.md', 'Probed');
console.log(JSON.stringify({ format: 'repo-standards/result/v2', status: 'ready', message: 'Ready.' }));
`,
  });
  const { result, report } = f.json<ErrorReport>(versionArgs("v1.0.1"));
  assert.equal(result.status, 1, result.stdout);
  assert.equal(report.errors[0]!.code, "PROBE_MUTATION");
  assert.match(report.errors[0]!.message, /instructions\/labels/);
  assert.match(report.errors[0]!.message, /PROBED\.md/);
  assert.equal(readFileSync(join(f.root, "PROBED.md"), "utf8"), "Probed");
});

function sourceManifest(f: Awaited<ReturnType<typeof fixture>>) {
  return readFileSync(join(f.remote.source.root, "standards.yaml"), "utf8");
}

test("with start blockers no probe runs, and every remote setup, even an undiscovered declaration's, is not checked", async (t) => {
  const external = directoryFixture("repo-standards-remote-");
  t.after(() => external.close());
  const probes = join(external.root, "probes.log");
  const f = await adoptionFixture(
    t,
    cli,
    manifest({
      docs: {
        kind: "repository",
        guidance: "content.md",
        discovery: "content.md",
        fixes: [
          {
            ...operation("labels", { script: "remote/fix.mjs" }),
            "remote-setup": {
              probe: (({ id: _id, ...declared }) => declared)(
                operation("probe", {
                  script: "remote/probe.mjs",
                  arguments: [join(external.root, "ready"), probes],
                }),
              ),
            },
          },
        ],
      },
    }),
    { files, project: { "README.md": "Project" } },
  );
  const inspection = f.inspect();
  assert.ok(
    inspection.start.blockers.some(({ code }) => code === "DISCOVERY_REQUIRED"),
  );
  assert.deepEqual(inspection.remoteSetup, [
    { declaration: "docs", id: "labels", status: "not-checked" },
  ]);
  assert.equal(existsSync(probes), false);
});
