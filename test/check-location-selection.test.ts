import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adoptionFixture } from "./adoption-fixture.ts";
import { directoryFixture } from "./installed-cli.ts";
import { commit, git, startArgs } from "./remote-fixture.ts";
import { createHash } from "node:crypto";
import { rewriteRetainedInput } from "./committed-evidence.ts";
import { terminalSession } from "./terminal.ts";
import { parse, stringify } from "yaml";
import { installCli, sourceFixture } from "./installed-cli.ts";
import type {
  AdoptReport,
  CheckReport,
  ErrorReport,
  Inspection,
  Lock,
  Run,
  SourceValidation,
  Status,
} from "./json-reports.ts";

const cli = installCli();
after(() => cli.close());
const files = { "content/checks.md": "Selected checks\n" };
function standards(
  profile: Record<string, unknown> = {},
  declaration: Record<string, unknown> = {},
) {
  return stringify({
    format: "repo-standards/v2",
    name: "checks-selection",
    description: "Check locations",
    requires: { "repo-standards": ">=10.0.1" },
    defaults: {
      declarations: {
        checks: {
          kind: "file",
          target: "CHECKS.md",
          exact: "content/checks.md",
          ...declaration,
        },
      },
    },
    profiles: { work: { description: "Work", declarations: {}, ...profile } },
  });
}

test("source validation accepts check-location subsets and diagnoses invalid arrays at either author field", (t) => {
  const validate = (
    profile: Record<string, unknown>,
    declaration: Record<string, unknown>,
  ) => {
    const f = sourceFixture(standards(profile, declaration), files);
    t.after(() => f.close());
    const result = cli.run(["source", "validate", "--json"], f.root);
    return { result, report: JSON.parse(result.stdout) as SourceValidation };
  };
  for (const locations of [
    ["github"],
    ["runner"],
    ["self-reported"],
    ["github", "runner"],
    ["github", "self-reported"],
    ["runner", "self-reported"],
    ["github", "runner", "self-reported"],
  ]) {
    const valid = validate(
      { "check-locations": locations },
      { "check-locations": locations },
    );
    assert.equal(valid.result.status, 0, valid.result.stdout);
  }
  for (const value of [
    "github",
    [],
    ["github", "github"],
    ["unknown"],
    [123],
  ]) {
    for (const field of ["profile", "declaration"]) {
      const invalid = validate(
        field === "profile" ? { "check-locations": value } : {},
        field === "declaration" ? { "check-locations": value } : {},
      );
      assert.equal(invalid.result.status, 1, invalid.result.stdout);
      assert.ok(
        invalid.report.errors.some(({ path }) =>
          path.startsWith(
            field === "profile"
              ? "/profiles/work/check-locations"
              : "/defaults/declarations/checks/check-locations",
          ),
        ),
        invalid.result.stdout,
      );
    }
  }
});

const source = "https://github.com/alice/standards";
async function fixture(t: TestContext, yaml: string) {
  const f = await adoptionFixture(t, cli, yaml, { files });
  const external = directoryFixture("repo-standards-checks-");
  t.after(() => external.close());
  const args = ["--standards-version", "v1.0.0", "--profile", "work"];
  const adopt = (extra: string[] = []) =>
    f.json<AdoptReport>(["adopt", source, ...args, ...extra, "--json"]);
  const lock = () =>
    JSON.parse(
      readFileSync(join(f.root, ".repo-standards/lock.json"), "utf8"),
    ) as Lock;
  return { ...f, external, args, adopt, lock };
}

test("guided adoption asks for check location independently of platform and accepts the flag or answers value", async (t) => {
  for (const byFlag of [true, false]) {
    const f = await fixture(
      t,
      standards({ "check-locations": ["github", "self-reported"] }),
    );
    git(
      f.root,
      "remote",
      "add",
      "origin",
      "https://github.com/acme/project.git",
    );
    const asked = f.adopt();
    assert.equal(asked.report.outcome, "answers-required", asked.result.stdout);
    assert.deepEqual(asked.report.missing, ["checks"]);
    assert.equal(asked.report.selection.platform, "github");
    assert.equal(existsSync(join(f.root, ".repo-standards")), false);
    const answer = join(f.external.root, "answers.json");
    writeFileSync(
      answer,
      JSON.stringify({
        ...asked.report.answers,
        questions: asked.report.answers.questions.map((q) =>
          q.id === "checks" ? { ...q, answer: "self-reported" } : q,
        ),
      }),
    );
    const adopted = f.adopt(
      byFlag ? ["--checks", "self-reported"] : ["--answers", answer],
    );
    assert.equal(adopted.result.status, 0, adopted.result.stdout);
    assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
    assert.equal(f.lock().selection.checks, "self-reported");
    assert.match(
      readFileSync(join(f.root, ".repo-standards/selection.yaml"), "utf8"),
      /checks: self-reported/,
    );
  }
});

test("location filters apply to defaults and replacements before discovery, rules or executable checks", async (t) => {
  const script = {
    run: {
      executable: "node",
      script: "check.mjs",
      resources: [],
      arguments: [],
    },
    prerequisite: { "version-arguments": ["--version"], version: ">=24" },
    "timeout-seconds": 10,
  };
  const yaml = stringify({
    format: "repo-standards/v2",
    name: "filtered",
    description: "Filtered checks",
    requires: { "repo-standards": ">=10.0.1" },
    defaults: {
      declarations: {
        shared: {
          kind: "file",
          target: "SHARED.md",
          exact: "content/checks.md",
        },
        hosted: {
          kind: "repository",
          platform: "github",
          "check-locations": ["github"],
          guidance: "guidance.md",
          discovery: "discovery.md",
          "discovery-script": {
            ...script,
            run: { ...script.run, script: "fail.mjs" },
          },
          rules: "rules.md",
          checks: [{ id: "hosted-check", ...script }],
        },
        variant: {
          kind: "file",
          target: "CHECKS.md",
          exact: "content/checks.md",
          "check-locations": ["github"],
        },
      },
    },
    profiles: {
      work: {
        description: "Work",
        "check-locations": ["github", "self-reported"],
        declarations: {
          variant: {
            kind: "file",
            platform: "github",
            target: "CHECKS.md",
            exact: "content/checks.md",
            "check-locations": ["self-reported"],
            checks: [{ id: "selected-check", ...script }],
          },
        },
      },
    },
  });
  const f = await adoptionFixture(t, cli, yaml, {
    files: {
      ...files,
      "guidance.md": "Apply guidance",
      "discovery.md": "Discover scope",
      "rules.md": "Hosted rules",
      "fail.mjs": "throw new Error('Filtered discovery must never run');\n",
      "check.mjs": `let input='';for await(const chunk of process.stdin) input+=chunk;const request=JSON.parse(input);console.log(JSON.stringify({format:'repo-standards/result/v2',status:'passed',message:request.platform+'/'+request.checks+'/'+request.declarations.map(d=>d.id).join(',')}));\n`,
    },
  });
  const args = [
    "inspect",
    "--source",
    source,
    "--standards-version",
    "v1.0.0",
    "--profile",
    "work",
    "--checks",
    "self-reported",
    "--json",
  ];
  const inspection = f.inspect(args);
  assert.equal(inspection.discovery, undefined);
  assert.deepEqual(
    inspection.resolved.declarations.map(({ id }) => id),
    ["shared", "variant"],
  );
  const started = f.json<Run>(startArgs(inspection.identity, args));
  assert.equal(started.result.status, 0, started.result.stdout);
  assert.equal(started.report.outcome, "complete");
  assert.equal(started.report.selection.checks, "self-reported");
  const checked = f.json<CheckReport>(["check", "--json"]);
  assert.equal(checked.result.status, 0, checked.result.stdout);
  assert.equal(checked.report.checks.length, 1);
  assert.equal(
    checked.report.checks[0]!.message,
    "github/self-reported/shared,variant",
  );
  assert.equal(
    existsSync(join(f.root, ".repo-standards/rules/hosted.md")),
    false,
  );
  assert.match(
    readFileSync(join(f.root, ".repo-standards/inputs/standards.yaml"), "utf8"),
    /check-locations:\n\s+- self-reported/,
  );
  commit(f.root);
  const retained = f.json<Inspection>(["inspect", "--json"]);
  assert.equal(retained.result.status, 0, retained.result.stdout);
  assert.equal(retained.report.selection.checks, "self-reported");
});

test("target conflicts consider offered check locations together with platform filters", (t) => {
  for (const [offered, first, second, status] of [
    [["github", "runner"], ["github"], ["runner"], 0],
    [["github", "runner"], ["github", "runner"], ["runner"], 1],
    [["github"], ["github", "runner"], ["runner"], 0],
    [["github", "runner"], undefined, ["runner"], 1],
  ] as const) {
    const yaml = stringify({
      format: "repo-standards/v2",
      name: "variants",
      description: "Variants",
      requires: { "repo-standards": ">=10.0.1" },
      defaults: {
        declarations: {
          first: {
            kind: "file",
            platform: "github",
            target: "CHECKS.md",
            exact: "content/checks.md",
            ...(first ? { "check-locations": first } : {}),
          },
          second: {
            kind: "file",
            platform: "github",
            target: "CHECKS.md",
            exact: "content/checks.md",
            "check-locations": second,
          },
        },
      },
      profiles: {
        work: {
          description: "Work",
          "check-locations": offered,
          declarations: {},
        },
      },
    });
    const f = sourceFixture(yaml, files);
    t.after(() => f.close());
    const result = cli.run(["source", "validate", "--json"], f.root);
    assert.equal(result.status, status, result.stdout);
    if (status === 1) assert.match(result.stdout, /TARGET_OVERLAP/);
  }
});

test("inspection identities bind check location even with identical declarations, and invalid choices write nothing", async (t) => {
  const f = await fixture(
    t,
    standards({ "check-locations": ["github", "runner"] }),
  );
  const args = ["inspect", "--source", source, ...f.args, "--json"];
  const missing = f.json<ErrorReport>(args);
  assert.equal(missing.report.errors[0]!.code, "CHECK_LOCATION_REQUIRED");
  for (const invalid of ["self-reported", "unknown"]) {
    const result = f.json<ErrorReport>([...args, "--checks", invalid]);
    assert.equal(result.report.errors[0]!.code, "UNKNOWN_CHECK_LOCATION");
    const guided = f.json<ErrorReport>([
      "adopt",
      source,
      ...f.args,
      "--checks",
      invalid,
      "--json",
    ]);
    assert.equal(guided.report.errors[0]!.code, "UNKNOWN_CHECK_LOCATION");
    assert.equal(existsSync(join(f.root, ".repo-standards")), false);
  }
  const github = f.inspect([...args, "--checks", "github"]);
  const runner = f.inspect([...args, "--checks", "runner"]);
  assert.notEqual(github.identity, runner.identity);
  const stale = f.json<ErrorReport>(
    startArgs(github.identity, [...args, "--checks", "runner"], true),
  );
  assert.equal(stale.report.errors[0]!.code, "STALE_INSPECTION");
  assert.equal(existsSync(join(f.root, ".repo-standards")), false);
  const asked = f.adopt();
  const answer = join(f.external.root, "answers.json");
  writeFileSync(
    answer,
    JSON.stringify({
      ...asked.report.answers,
      questions: asked.report.answers.questions.map((q) =>
        q.id === "checks" ? { ...q, answer: "runner" } : q,
      ),
    }),
  );
  const conflict = f.json<ErrorReport>([
    "adopt",
    source,
    ...f.args,
    "--checks",
    "github",
    "--answers",
    answer,
    "--json",
  ]);
  assert.equal(conflict.report.errors[0]!.code, "USAGE");
});

test("updates retain check location, report a deliberate change, and headless updates stop when it is unsupported", async (t) => {
  const f = await fixture(
    t,
    standards(
      {
        "check-locations": ["github", "self-reported"],
        declarations: {
          reported: {
            kind: "file",
            target: "REPORTED.md",
            exact: "content/checks.md",
            "check-locations": ["self-reported"],
          },
        },
      },
      { "check-locations": ["github"] },
    ),
  );
  const adopted = f.adopt(["--checks", "self-reported"]);
  assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
  commit(f.root);
  const headless = () =>
    f.json<AdoptReport>([
      "adopt",
      "--headless",
      "--standards-version",
      "v1.0.0",
      "--json",
    ]);
  const kept = headless();
  assert.equal(kept.report.outcome, "complete", kept.result.stdout);
  assert.equal(kept.report.selection.checks, "self-reported");
  const status = f.json<Status>(["status", "--json"]);
  assert.equal(status.report.selection!.checks, "self-reported");
  // An unchanged completed adoption need not make a commit.
  if (git(f.root, "status", "--porcelain")) commit(f.root);
  const changed = f.json<AdoptReport>([
    "adopt",
    "--standards-version",
    "v1.0.0",
    "--checks",
    "github",
    "--json",
  ]);
  assert.equal(changed.report.outcome, "complete", changed.result.stdout);
  assert.equal(existsSync(join(f.root, "REPORTED.md")), false);
  assert.equal(existsSync(join(f.root, "CHECKS.md")), true);
  assert.match(
    changed.report.inspection!.summary,
    /`reported` \| `REPORTED.md` \| deleted/,
  );
  assert.match(
    changed.report.inspection!.summary,
    /Changed components: checks\./,
  );
  assert.match(
    changed.report.inspection!.summary,
    /\| Check location \| `self-reported` \| `github` \|/,
  );
  commit(f.root);
  f.remote.addVersion(
    "v1.1.0",
    standards({ "check-locations": ["runner"] }),
    files,
  );
  const stopped = f.json<AdoptReport>([
    "adopt",
    "--headless",
    "--standards-version",
    "v1.1.0",
    "--json",
  ]);
  assert.equal(stopped.result.status, 1, stopped.result.stdout);
  assert.equal(stopped.report.outcome, "answers-required");
  assert.deepEqual(stopped.report.missing, ["checks"]);
  assert.equal(stopped.report.selection.checks, null);
  assert.equal(git(f.root, "status", "--porcelain"), "");
  const forbidden = f.run([
    "adopt",
    "--headless",
    "--checks",
    "runner",
    "--json",
  ]);
  assert.equal(forbidden.status, 2, forbidden.stdout);
});

test("an active or abandoned run preserves its check location", async (t) => {
  const f = await fixture(
    t,
    standards({
      "check-locations": ["github", "self-reported"],
      declarations: {
        checks: {
          kind: "file",
          target: "CHECKS.md",
          guidance: "content/checks.md",
        },
      },
    }),
  );
  const started = f.adopt(["--checks", "self-reported"]);
  assert.equal(started.report.outcome, "contextual", started.result.stdout);
  const status = f.json<Status>(["status", "--json"]);
  assert.equal(status.report.active!.selection.checks, "self-reported");
  const refused = f.json<ErrorReport>([
    "adopt",
    "--checks",
    "github",
    "--json",
  ]);
  assert.equal(refused.report.errors[0]!.code, "ACTIVE_RUN");
  const continued = f.json<AdoptReport>(["adopt", "--json"]);
  assert.equal(continued.report.selection.checks, "self-reported");
  const abandoned = f.json<Run>(["abandon", "--json"]);
  assert.equal(abandoned.result.status, 0, abandoned.result.stdout);
  const again = f.json<AdoptReport>(["adopt", "--json"]);
  assert.equal(
    again.report.selection.checks,
    "self-reported",
    again.result.stdout,
  );
  assert.equal(again.report.outcome, "contextual", again.result.stdout);
});

test("legacy selections read as github through retained inspection and offline reapplication", async (t) => {
  const f = await fixture(t, standards());
  const adopted = f.adopt();
  assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
  assert.equal(adopted.report.selection.checks, "github");
  assert.equal(
    adopted.report.answers.questions.some(({ id }) => id === "checks"),
    false,
  );
  const manifestPath = ".repo-standards/inputs/standards.yaml";
  const manifest = parse(readFileSync(join(f.root, manifestPath), "utf8")) as {
    profiles: { work: { "check-locations"?: string[] } };
  };
  delete manifest.profiles.work["check-locations"];
  rewriteRetainedInput(f.root, manifestPath, manifest);
  const lock = f.lock();
  const { checks: _checks, ...selection } = lock.selection;
  const yaml = stringify(selection);
  writeFileSync(join(f.root, ".repo-standards/selection.yaml"), yaml);
  lock.selection = selection as Lock["selection"];
  lock.format = "repo-standards/lock/v1";
  lock.files[".repo-standards/selection.yaml"]!.sha256 = createHash("sha256")
    .update(yaml)
    .digest("hex");
  writeFileSync(
    join(f.root, ".repo-standards/lock.json"),
    JSON.stringify(lock, null, 2) + "\n",
  );
  commit(f.root);
  const status = f.json<Status>(["status", "--json"]);
  assert.equal(status.result.status, 0, status.result.stdout);
  assert.equal(status.report.selection!.checks, "github");
  const retained = f.json<Inspection>(["inspect", "--json"]);
  assert.equal(retained.result.status, 0, retained.result.stdout);
  assert.equal(retained.report.selection.checks, "github");
  assert.equal(retained.report.previousSelection!.checks, "github");
  assert.deepEqual(retained.report.update, []);
  for (const url of Object.keys(f.remote.responses))
    delete f.remote.responses[url];
  f.remote.save();
  const again = f.json<AdoptReport>([
    "adopt",
    "--standards-version",
    "v1.0.0",
    "--json",
  ]);
  assert.equal(again.result.status, 0, again.result.stdout);
  assert.equal(again.report.outcome, "complete", again.result.stdout);
  assert.equal(f.lock().selection.checks, "github");
  assert.equal(f.lock().format, "repo-standards/lock/v2");
});

test("a terminal asks for several check locations and selects a sole location without asking", async (t) => {
  for (const several of [true, false]) {
    const f = await fixture(
      t,
      standards({
        "check-locations": several ? ["github", "self-reported"] : ["runner"],
      }),
    );
    const session = terminalSession(
      join(cli.root, "node_modules/.bin/repo-standards"),
      ["adopt", source, ...f.args],
      { cwd: f.root, env: f.env },
    );
    t.after(() => session.close());
    if (several) {
      assert.match(
        await session.expect("Check location: "),
        /Where does the project run its checks/,
      );
      session.type("2");
    }
    const shown = await session.expect("Start the run? [Y/n]: ");
    assert.match(
      shown,
      new RegExp(
        "\\| Check location \\| none \\| `" +
          (several ? "self-reported" : "runner") +
          "` \\|",
      ),
    );
    session.type("");
    await session.expect("The adoption is complete.");
    assert.equal(await session.exit(), 0, session.rest());
    assert.equal(
      f.lock().selection.checks,
      several ? "self-reported" : "runner",
    );
  }
});

test("discovery requests expose the selected check location and bind it in their identity", async (t) => {
  const yaml = standards({
    "check-locations": ["github", "self-reported"],
    declarations: {
      checks: {
        kind: "repository",
        guidance: "content/checks.md",
        discovery: "content/checks.md",
        "discovery-script": {
          run: {
            executable: "node",
            script: "draft.mjs",
            resources: [],
            arguments: [],
          },
          prerequisite: { "version-arguments": ["--version"], version: ">=24" },
          "timeout-seconds": 10,
        },
      },
    },
  });
  const f = await adoptionFixture(t, cli, yaml, {
    files: {
      ...files,
      "draft.mjs": `import {readFileSync} from 'node:fs';const input=JSON.parse(readFileSync(0,'utf8'));if(input.platform!=='github'||!['github','self-reported'].includes(input.checks))process.exit(3);console.log(JSON.stringify({format:'repo-standards/scope/v2',declarations:[{id:input.declaration,coverage:input.checks,candidates:[],unresolved:[]}]}));`,
    },
  });
  const args = [
    "inspect",
    "--source",
    source,
    "--standards-version",
    "v1.0.0",
    "--profile",
    "work",
    "--json",
  ];
  const github = f.inspect([...args, "--checks", "github"]);
  const reported = f.inspect([...args, "--checks", "self-reported"]);
  assert.equal(
    reported.discovery!.draft!.declarations[0]!.coverage,
    "self-reported",
  );
  assert.notEqual(github.discovery!.identity, reported.discovery!.identity);
  assert.equal(existsSync(join(f.root, ".repo-standards")), false);
});

test("terminal updates carry a supported recorded check location without asking again", async (t) => {
  const f = await fixture(
    t,
    standards({ "check-locations": ["github", "runner"] }),
  );
  const adopted = f.adopt(["--checks", "runner"]);
  assert.equal(adopted.report.outcome, "complete", adopted.result.stdout);
  commit(f.root);
  const session = terminalSession(
    join(cli.root, "node_modules/.bin/repo-standards"),
    ["adopt", ...f.args],
    { cwd: f.root, env: f.env },
  );
  t.after(() => session.close());
  const shown = await session.expect("Start the run? [Y/n]: ");
  assert.doesNotMatch(
    shown,
    /Where does the project run its checks|Check location \[runner\]:/,
  );
  session.type("");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  assert.equal(f.lock().selection.checks, "runner");
});
