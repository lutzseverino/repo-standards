import type {
  AdoptReport,
  ErrorReport,
  Inspection,
  Lock,
  Run,
  SourceValidation,
  Status,
} from "./json-reports.ts";
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse, stringify } from "yaml";
import {
  directoryFixture,
  installCli,
  sourceFixture,
} from "./installed-cli.ts";
import { adoptionFixture } from "./adoption-fixture.ts";
import { commit, git, startArgs } from "./remote-fixture.ts";
import { terminalSession } from "./terminal.ts";

const cli = installCli();
after(() => cli.close());

const source = "https://github.com/alice/standards";
const files = {
  "content/AGENTS.md": "Standard agent guidance\n",
  "content/github.md": "Hosted on GitHub\n",
  "content/forgejo.md": "Hosted on Forgejo\n",
  "guidance/readme.md": "Describe the project in README.md.\n",
};

// A standards source whose one profile adopts shared agent guidance, and
// HOSTING.md from the declaration for the selected platform. Both platform
// declarations target the same path, which they never install together.
function standards(
  profile: Record<string, unknown> = {},
  declarations: Record<string, unknown> = {},
) {
  return stringify({
    format: "repo-standards/v2",
    name: "test-standards",
    description: "Test standards",
    requires: { "repo-standards": ">=1.0.0" },
    defaults: {
      declarations: {
        agents: {
          kind: "file",
          target: "AGENTS.md",
          exact: "content/AGENTS.md",
        },
        "github-hosting": {
          kind: "file",
          platform: "github",
          target: "HOSTING.md",
          exact: "content/github.md",
        },
        ...declarations,
      },
    },
    profiles: { work: { description: "work", declarations: {}, ...profile } },
  });
}

const forgejoHosting = {
  "forgejo-hosting": {
    kind: "file",
    platform: "forgejo",
    target: "HOSTING.md",
    exact: "content/forgejo.md",
  },
};

// The CLI with a second supported platform, forgejo, which no Postern adapter
// serves: a preload adds it to the supported list, the one seam for it, in
// the process of any installed CLI, this test's or a project's pinned runtime.
function secondPlatform(directory: string, env: NodeJS.ProcessEnv) {
  const loader = join(directory, "second-platform.mjs");
  writeFileSync(
    loader,
    `import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const main = process.argv[1] && realpathSync(process.argv[1]);
if (main?.endsWith('/@lutzseverino/repo-standards/dist/cli.js')) {
  const { supportedPlatforms } = await import(new URL('platforms.js', pathToFileURL(main)).href);
  supportedPlatforms.push('forgejo');
}
`,
  );
  return {
    ...env,
    NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(loader).href}`,
  };
}

// A published source and a committed project, adopted through the installed
// CLI with the given environment.
async function fixture(
  t: TestContext,
  yaml: string,
  { second = false }: { second?: boolean } = {},
) {
  const external = directoryFixture("repo-standards-platform-");
  t.after(() => external.close());
  const f = await adoptionFixture(t, cli, yaml, {
    files,
    project: { "README.md": "Project notes\n" },
  });
  f.remote.responses[`${f.remote.prefix}/releases?per_page=100`] = {
    headers: {},
    body: [
      {
        id: 1,
        name: null,
        published_at: "2026-10-01T00:00:00Z",
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
      },
    ],
  };
  f.remote.save();
  const env = second ? secondPlatform(external.root, f.env) : f.env;
  const answersPath = join(external.root, "answers.json");
  const pinned = join(
    f.root,
    ".repo-standards/runtime/node_modules/.bin/repo-standards",
  );
  // An adopt report, from this test's CLI or the project's pinned runtime.
  const adopt = (args: string[], runtime = false) => {
    const result = runtime
      ? spawnSync(pinned, ["adopt", ...args, "--json"], {
          cwd: f.root,
          env,
          encoding: "utf8",
        })
      : cli.run(["adopt", ...args, "--json"], f.root, env);
    try {
      return { result, report: JSON.parse(result.stdout) as AdoptReport };
    } catch {
      assert.fail(
        `adopt exited ${result.status}:\n${result.stdout}${result.stderr}`,
      );
    }
  };
  const answer = (report: AdoptReport, answers: Record<string, unknown>) => {
    writeFileSync(
      answersPath,
      JSON.stringify({
        ...report.answers,
        questions: report.answers.questions.map((question) =>
          Object.hasOwn(answers, question.id)
            ? { ...question, answer: answers[question.id] }
            : question,
        ),
      }),
    );
    return ["--answers", answersPath];
  };
  const json = <T>(args: string[]) => f.json<T>(args, env);
  const lock = () =>
    JSON.parse(
      readFileSync(join(f.root, ".repo-standards/lock.json"), "utf8"),
    ) as Lock;
  const hosting = () => readFileSync(join(f.root, "HOSTING.md"), "utf8");
  return { ...f, env, external, adopt, answer, json, lock, hosting };
}

const question = (report: AdoptReport, id: string) =>
  report.answers.questions.find((entry) => entry.id === id);

const origin = (root: string, url?: string) => {
  git(root, "remote", "remove", "origin");
  if (url) git(root, "remote", "add", "origin", url);
};

test("a profile declares its platforms and platform-specific declarations, and validation rejects platforms this CLI does not support", (t) => {
  const validate = (yaml: string, env = process.env) => {
    const fixture = sourceFixture(yaml, files);
    t.after(() => fixture.close());
    const result = cli.run(["source", "validate", "--json"], fixture.root, env);
    return { result, report: JSON.parse(result.stdout) as SourceValidation };
  };

  // One profile supports github, with one declaration specific to it.
  const valid = validate(standards({ platforms: ["github"] }));
  assert.equal(valid.result.status, 0, valid.result.stdout);
  assert.deepEqual(valid.report.profiles.work!.platforms, ["github"]);
  assert.deepEqual(
    valid.report.profiles.work!.declarations.map(({ id, platform }) => [
      id,
      platform,
    ]),
    [
      ["agents", undefined],
      ["github-hosting", "github"],
    ],
  );
  // A profile that declares no platforms supports github alone.
  const implied = validate(standards());
  assert.equal(implied.result.status, 0, implied.result.stdout);
  assert.deepEqual(implied.report.profiles.work!.platforms, ["github"]);

  // A platform this CLI does not support is rejected wherever it is named,
  // and so are empty and repeated platform lists.
  const invalid = (yaml: string) => {
    const { result, report } = validate(yaml);
    assert.equal(result.status, 1, result.stdout);
    return report.errors.map(({ code, path }) => [code, path]);
  };
  assert.deepEqual(invalid(standards({ platforms: ["gitlab"] })), [
    ["UNSUPPORTED_PLATFORM", "/profiles/work/platforms/0"],
  ]);
  assert.deepEqual(invalid(standards({}, forgejoHosting)), [
    ["UNSUPPORTED_PLATFORM", "/defaults/declarations/forgejo-hosting/platform"],
  ]);
  assert.deepEqual(invalid(standards({ platforms: [] })), [
    ["EMPTY_PLATFORMS", "/profiles/work/platforms"],
  ]);
  assert.deepEqual(invalid(standards({ platforms: ["github", "github"] })), [
    ["DUPLICATE_IDENTITY", "/profiles/work/platforms/1"],
  ]);
  assert.deepEqual(
    invalid(
      standards({
        declarations: {
          "github-hosting": { exclude: true, platform: "github" },
        },
      }),
    ),
    [["UNKNOWN_FIELD", "/profiles/work/declarations/github-hosting/platform"]],
  );
  const { report } = validate(standards({ platforms: ["gitlab"] }));
  assert.match(
    report.errors[0]!.message,
    /^Unsupported platform gitlab\. Supported platforms: github\.$/,
  );

  // With a second supported platform, the declarations of different
  // platforms may share a target, and those of one platform may not.
  const external = directoryFixture("repo-standards-platform-validate-");
  t.after(() => external.close());
  const env = secondPlatform(external.root, process.env);
  const both = validate(
    standards({ platforms: ["github", "forgejo"] }, forgejoHosting),
    env,
  );
  assert.equal(both.result.status, 0, both.result.stdout);
  assert.deepEqual(both.report.profiles.work!.platforms, ["github", "forgejo"]);
  const overlapping = validate(
    standards(
      { platforms: ["github", "forgejo"] },
      {
        "forgejo-hosting": {
          ...forgejoHosting["forgejo-hosting"],
          platform: "github",
        },
      },
    ),
    env,
  );
  assert.equal(overlapping.result.status, 1, overlapping.result.stdout);
  assert.deepEqual(
    overlapping.report.errors.map(({ code }) => code),
    ["TARGET_OVERLAP"],
  );
});

test("a profile that supports one platform adopts github without asking or detecting, in a project without a remote", async (t) => {
  const f = await fixture(t, standards({ platforms: ["github"] }));
  // Its one profile and platform are selected without asking, so nothing is
  // open, and the run starts and completes.
  const { result, report } = f.adopt([source]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.outcome, "complete");
  assert.equal(question(report, "platform"), undefined);
  assert.equal(report.selection.platform, "github");
  assert.match(
    report.inspection!.summary,
    /\| Profile \| none \| `work` \|\n\| Platform \| none \| `github` \|/,
  );
  assert.equal(f.hosting(), "Hosted on GitHub\n");
  assert.equal(f.lock().selection.platform, "github");
  assert.equal(
    (
      parse(
        readFileSync(join(f.root, ".repo-standards/selection.yaml"), "utf8"),
      ) as { platform: string }
    ).platform,
    "github",
  );
});

test("adopt in a terminal selects a profile's only platform without asking, whatever the remote", async (t) => {
  const f = await fixture(t, standards());
  git(f.root, "remote", "add", "origin", "https://gitlab.com/acme/project.git");
  const session = terminalSession(
    join(cli.root, "node_modules/.bin/repo-standards"),
    ["adopt", source],
    { cwd: f.root, env: f.env },
  );
  t.after(() => session.close());
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  await session.expect("Profile [work]: ");
  session.type("");
  const shown = await session.expect("Start the run? [Y/n]: ");
  assert.doesNotMatch(shown, /hosting platform/);
  assert.match(shown, /\| Platform \| none \| `github` \|/);
  session.type("");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  assert.equal(f.lock().selection.platform, "github");
  assert.equal(f.hosting(), "Hosted on GitHub\n");
});

test("with several platforms, detection proposes one, an override is honored, and an undetectable remote requires an explicit choice", async (t) => {
  const f = await fixture(
    t,
    standards({ platforms: ["github", "forgejo"] }, forgejoHosting),
    { second: true },
  );

  // Without an origin remote, the platform needs an explicit answer.
  const unanswered = f.adopt([source, "--profile", "work"]);
  assert.equal(unanswered.result.status, 0, unanswered.result.stderr);
  assert.equal(unanswered.report.outcome, "answers-required");
  assert.deepEqual(unanswered.report.missing, ["platform"]);
  const platform = question(unanswered.report, "platform")!;
  assert.equal(platform.answer, null);
  assert.deepEqual(platform.choices, ["github", "forgejo"]);
  assert.deepEqual(platform.details, { detected: null, reason: "no-remote" });
  assert.match(
    platform.context,
    /no origin remote\. Choose the platform explicitly\./,
  );
  assert.match(
    unanswered.report.nextSteps.join("\n"),
    /Answer `platform` with the hosting platform the project lives on/,
  );

  // A remote no supported platform serves is not detected either.
  git(f.root, "remote", "add", "origin", "https://gitlab.com/acme/project.git");
  const unsupported = f.adopt([source, "--profile", "work"]);
  assert.deepEqual(unsupported.report.missing, ["platform"]);
  assert.deepEqual(question(unsupported.report, "platform")!.details, {
    detected: null,
    reason: "unsupported",
  });

  // A choice outside the profile's platforms is rejected.
  const rejected = f.adopt(
    f.answer(unsupported.report, { platform: "gitlab" }),
  );
  assert.equal(rejected.result.status, 1, rejected.result.stdout);
  assert.equal(
    (JSON.parse(rejected.result.stdout) as ErrorReport).errors[0]!.code,
    "UNKNOWN_PLATFORM",
  );
  assert.equal(existsSync(join(f.root, ".repo-standards")), false);

  // On a GitHub remote, detection proposes github, which answers the
  // question: only the uncommitted note keeps the run from starting.
  origin(f.root, "https://github.com/acme/project.git");
  writeFileSync(join(f.root, "notes.txt"), "Pending\n");
  const proposed = f.adopt([source, "--profile", "work"]);
  assert.equal(proposed.report.outcome, "blocked", proposed.result.stderr);
  assert.deepEqual(
    proposed.report.blockers.map(({ code }) => code),
    ["DIRTY_PROJECT"],
  );
  assert.deepEqual(proposed.report.missing, []);
  assert.equal(question(proposed.report, "platform")!.answer, "github");
  assert.deepEqual(question(proposed.report, "platform")!.details, {
    detected: "github",
  });
  rmSync(join(f.root, "notes.txt"));
  const detected = f.adopt([source, "--profile", "work"]);
  assert.equal(detected.result.status, 0, detected.result.stderr);
  assert.equal(detected.report.outcome, "complete");
  assert.equal(detected.report.selection.platform, "github");
  assert.equal(f.hosting(), "Hosted on GitHub\n");
  assert.equal(f.lock().selection.platform, "github");
  commit(f.root);

  // An update overrides the detected platform: it replaces the github
  // declaration with the forgejo one and names the changed component.
  const override = f.adopt(["--platform", "forgejo"]);
  assert.equal(override.result.status, 0, override.result.stderr);
  assert.equal(override.report.outcome, "complete");
  assert.equal(override.report.selection.platform, "forgejo");
  assert.match(
    override.report.inspection!.summary,
    /\| Platform \| `github` \| `forgejo` \|\n[\s\S]*Changed components: platform\./,
  );
  assert.equal(f.hosting(), "Hosted on Forgejo\n");
  assert.equal(f.lock().selection.platform, "forgejo");
  commit(f.root);

  // The next update carries the recorded platform forward over detection.
  writeFileSync(join(f.root, "notes.txt"), "Pending\n");
  const recorded = f.adopt([]);
  assert.equal(recorded.report.outcome, "blocked", recorded.result.stderr);
  assert.equal(question(recorded.report, "platform")!.answer, "forgejo");
  assert.match(
    question(recorded.report, "platform")!.context,
    /recorded platform, forgejo, which the profile still supports, is carried forward/,
  );
  rmSync(join(f.root, "notes.txt"));
  const carried = f.adopt([]);
  assert.equal(carried.result.status, 0, carried.result.stderr);
  assert.equal(carried.report.selection.platform, "forgejo");
  assert.match(
    carried.report.inspection!.summary,
    /Changed components: none\./,
  );
  const status = f.json<Status>(["status", "--json"]).report;
  assert.equal(status.selection!.platform, "forgejo");
  const check = cli.run(["check"], f.root, f.env);
  assert.match(
    check.stdout,
    /^Checks of \S+ v1\.0\.0, profile work, platform forgejo: none declared\./,
  );
});

test("adopt in a terminal proposes the detected platform and honors an override", async (t) => {
  const f = await fixture(
    t,
    standards({ platforms: ["github", "forgejo"] }, forgejoHosting),
    { second: true },
  );
  git(f.root, "remote", "add", "origin", "git@github.com:acme/project.git");
  const session = terminalSession(
    join(cli.root, "node_modules/.bin/repo-standards"),
    ["adopt", source, "--profile", "work"],
    { cwd: f.root, env: f.env },
  );
  t.after(() => session.close());
  await session.expect("Version [v1.0.0]: ");
  session.type("");
  assert.match(
    await session.expect("Platform [github]: "),
    /Which hosting platform does the project use\?[\s\S]*The origin remote is hosted on github, which is proposed\.[\s\S]*1\. github\n\s*2\. forgejo\n/,
  );
  session.type("2");
  assert.match(
    await session.expect("Start the run? [Y/n]: "),
    /\| Platform \| none \| `forgejo` \|/,
  );
  session.type("");
  await session.expect("The adoption is complete.");
  assert.equal(await session.exit(), 0, session.rest());
  assert.equal(f.lock().selection.platform, "forgejo");
  assert.equal(f.hosting(), "Hosted on Forgejo\n");
});

test("the platform is part of the inspection identity, so another platform's inspection does not start a run", async (t) => {
  const f = await fixture(
    t,
    standards({ platforms: ["github", "forgejo"] }, forgejoHosting),
    { second: true },
  );
  const args = (platform?: string) => [
    "inspect",
    "--source",
    source,
    "--standards-version",
    "v1.0.0",
    "--profile",
    "work",
    ...(platform ? ["--platform", platform] : []),
    "--json",
  ];
  // The low-level commands need the platform of a profile that supports
  // several.
  const required = f.json<ErrorReport>(args());
  assert.equal(required.result.status, 1);
  assert.equal(required.report.errors[0]!.code, "PLATFORM_REQUIRED");

  const github = f.json<Inspection>(args("github")).report;
  const forgejo = f.json<Inspection>(args("forgejo")).report;
  assert.equal(github.selection.platform, "github");
  assert.equal(forgejo.selection.platform, "forgejo");
  assert.notEqual(github.identity, forgejo.identity);
  assert.deepEqual(
    github.resolved.declarations.map(({ id }) => id),
    ["agents", "github-hosting"],
  );
  assert.deepEqual(
    forgejo.resolved.declarations.map(({ id }) => id),
    ["agents", "forgejo-hosting"],
  );

  // A start of one platform bound to the other's inspection is stale, and
  // the same platform's inspection starts it.
  const stale = f.json<ErrorReport>(
    startArgs(github.identity, args("forgejo")),
  );
  assert.equal(stale.result.status, 1, stale.result.stdout);
  assert.equal(stale.report.errors[0]!.code, "STALE_INSPECTION");
  const started = f.json<Run>(startArgs(forgejo.identity, args("forgejo")));
  assert.equal(started.result.status, 0, started.result.stdout);
  assert.equal(started.report.outcome, "complete");
  assert.equal(started.report.selection.platform, "forgejo");
});

test("a recorded selection without a platform is read as github and behaves as before, and the next run records it", async (t) => {
  const f = await fixture(t, standards());
  const adopted = f.adopt([source, "--profile", "work"]);
  assert.equal(adopted.report.outcome, "complete");
  commit(f.root);

  // Rewrite the committed selection as an earlier CLI wrote it, keeping the
  // lock's hash of selection.yaml in step.
  const lock = f.lock();
  const { platform: _platform, ...selection } = lock.selection;
  const yaml = stringify(selection);
  writeFileSync(join(f.root, ".repo-standards/selection.yaml"), yaml);
  lock.selection = selection as Lock["selection"];
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
  assert.equal(status.report.selection!.platform, "github");
  const check = cli.run(["check"], f.root, f.env);
  assert.equal(check.status, 0, check.stderr);
  assert.match(
    check.stdout,
    /, profile work, platform github: none declared\./,
  );
  const retained = f.json<Inspection>(["inspect", "--json"]).report;
  assert.equal(retained.selection.platform, "github");
  assert.equal(retained.previousSelection!.platform, "github");
  assert.deepEqual(retained.update, []);

  // Applying the selection again records the platform explicitly.
  const again = f.adopt([]);
  assert.equal(again.result.status, 0, again.result.stderr);
  assert.equal(again.report.outcome, "complete");
  assert.equal(f.lock().selection.platform, "github");
  assert.equal(f.hosting(), "Hosted on GitHub\n");
});

test("adopting again in place over a stopped run keeps its platform over detection", async (t) => {
  const f = await fixture(
    t,
    standards(
      { platforms: ["github", "forgejo"] },
      {
        ...forgejoHosting,
        readme: {
          kind: "file",
          target: "README.md",
          guidance: "guidance/readme.md",
        },
      },
    ),
    { second: true },
  );
  git(f.root, "remote", "add", "origin", "https://github.com/acme/project.git");
  const run = f.adopt([source, "--profile", "work", "--platform", "forgejo"]);
  assert.equal(run.report.outcome, "contextual", run.result.stderr);
  const active = f.json<Status>(["status", "--json"]).report;
  assert.equal(active.active!.selection.platform, "forgejo");

  // Another platform cannot continue the active run.
  const other = cli.run(
    ["adopt", "--platform", "github", "--json"],
    f.root,
    f.env,
  );
  assert.equal(other.status, 1, other.stdout);
  assert.match(other.stdout, /with profile work on forgejo is active/);

  const abandoned = f.json<Run>(["abandon", "--json"]);
  assert.equal(abandoned.result.status, 0, abandoned.result.stdout);
  const again = f.adopt([source]);
  assert.equal(again.report.selection.platform, "forgejo", again.result.stderr);
  assert.equal(again.report.outcome, "contextual");
  assert.equal(f.hosting(), "Hosted on Forgejo\n");
});

test("a headless update keeps the recorded platform, and stops when the profile no longer supports it", async (t) => {
  const f = await fixture(
    t,
    standards({ platforms: ["github", "forgejo"] }, forgejoHosting),
    { second: true },
  );
  git(f.root, "remote", "add", "origin", "https://github.com/acme/project.git");
  const adopted = f.adopt([
    source,
    "--profile",
    "work",
    "--platform",
    "forgejo",
  ]);
  assert.equal(adopted.report.outcome, "complete", adopted.result.stderr);
  commit(f.root);

  // It keeps forgejo over the GitHub remote, and rejects --platform.
  const kept = f.adopt(["--headless", "--standards-version", "v1.0.0"], true);
  assert.equal(kept.report.outcome, "complete", kept.result.stdout);
  assert.equal(kept.report.selection.platform, "forgejo");
  assert.equal(f.lock().selection.platform, "forgejo");
  commit(f.root);
  const flag = f.adopt(["--headless", "--platform", "github"], true);
  assert.equal(flag.result.status, 2, flag.result.stdout);

  // A version whose profile supports github alone stops before writing.
  f.remote.addVersion("v1.1.0", standards({}, forgejoHosting), files);
  const stopped = f.adopt(
    ["--headless", "--standards-version", "v1.1.0"],
    true,
  );
  assert.equal(stopped.result.status, 1, stopped.result.stdout);
  assert.equal(stopped.report.outcome, "answers-required");
  assert.deepEqual(stopped.report.missing, ["platform"]);
  assert.equal(stopped.report.selection.platform, null);
  assert.match(
    question(stopped.report, "platform")!.context,
    /no longer supports the platform the project adopts, forgejo, so a headless update cannot choose one/,
  );
  assert.equal(git(f.root, "status", "--porcelain"), "");
  assert.equal(f.hosting(), "Hosted on Forgejo\n");
});
