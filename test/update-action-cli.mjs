// The update action tests' fake CLI. As `npm` it installs a pinned runtime that
// runs this script, as `npx` it runs as the CLI version it names, and as
// `agent` it is the agent command, which finishes the update or gives up. It
// logs every invocation, with whether GH_TOKEN carried the expected token.

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const [mode, ...args] = process.argv.slice(2);
const scenario = JSON.parse(readFileSync(process.env.FAKE_SCENARIO, "utf8"));
const source = process.env.FAKE_SOURCE;
const root = process.cwd();
const selectionPath = join(root, ".repo-standards/selection.yaml");

const pins = (yaml) => ({
  cli: /^cli:\n(?: {2}.*\n)*? {2}version: (.+)$/m.exec(yaml)[1],
  standards: /^standards:\n(?: {2}.*\n)*? {2}version: (.+)$/m.exec(yaml)[1],
});
const current = () => pins(readFileSync(selectionPath, "utf8"));
const log = (entry) =>
  appendFileSync(
    process.env.FAKE_LOG,
    JSON.stringify({
      ...entry,
      ghToken: process.env.GH_TOKEN === process.env.FAKE_EXPECTED_TOKEN,
      actionToken: "REPO_STANDARDS_TOKEN" in process.env,
    }) + "\n",
  );
const print = (value) =>
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");

const applyUpdate = () => {
  const yaml = readFileSync(selectionPath, "utf8");
  const { cli, standards } = pins(yaml);
  writeFileSync(
    selectionPath,
    yaml
      .replace(`version: ${cli}`, `version: ${scenario.newest.cli}`)
      .replace(
        `version: ${standards}`,
        `version: ${scenario.newest.standards}`,
      ),
  );
  writeFileSync(
    join(root, "CONTRIBUTING.md"),
    `Contributing at ${scenario.newest.standards}\n`,
  );
};
// Ready once the update is applied and uncommitted.
const ready = () => {
  const committed = execFileSync(
    "git",
    ["show", "HEAD:.repo-standards/selection.yaml"],
    { cwd: root, encoding: "utf8" },
  );
  const yaml = readFileSync(selectionPath, "utf8");
  return (
    yaml !== committed && pins(yaml).standards === scenario.newest.standards
  );
};
const deferred = [
  {
    declaration: "github-settings",
    id: "apply",
    reason:
      "Deferred by a headless update, which never writes to the hosting platform; the next local adopt applies it once its probe is ready.",
  },
];

function outdated() {
  const pinned = current();
  const pin = (name, extra) =>
    scenario.unknown && name === "standards"
      ? {
          ...extra,
          pinned: pinned[name],
          update: "unknown",
          reason: {
            code: "SOURCE_UNAVAILABLE",
            message: "GitHub returned HTTP 503.",
          },
        }
      : {
          ...extra,
          pinned: pinned[name],
          update: pinned[name] === scenario.newest[name] ? "none" : "available",
          newest: scenario.newest[name],
          newerStableReleases: pinned[name] === scenario.newest[name] ? 0 : 1,
          checkedAt: "2026-10-21T00:00:00.000Z",
          cached: false,
        };
  print({
    format: "repo-standards/outdated/v1",
    cli: pin("cli", { package: "@lutzseverino/repo-standards" }),
    standards: pin("standards", { repository: source }),
  });
}

function headless(version) {
  const report = {
    format: "repo-standards/adopt/v2",
    headless: true,
    selection: {
      cli: version,
      source,
      version: scenario.newest.standards,
      profile: "default",
    },
    reused: [],
    inspection: {
      identity: "sha256:inspection",
      summary: [
        "# Repo Standards update proposal",
        "",
        "## Selection",
        "",
        "Changed components: standards.",
        "",
        "## Update class",
        "",
        "Contextual update: 1 declaration differs from the retained inputs.",
        "",
        "| Declaration | Changes |",
        "| --- | --- |",
        "| `project-docs` | guidance |",
        "",
      ].join("\n"),
    },
    deferred,
    nextSteps: [],
  };
  if (scenario.headless === "complete") {
    applyUpdate();
    return print({
      ...report,
      outcome: "complete",
      missing: [],
      blockers: [],
      answers: {
        format: "repo-standards/answers/v1",
        source,
        questions: [],
      },
    });
  }
  print({
    ...report,
    outcome: "answers-required",
    missing: ["scope:project-docs", "remote-setup"],
    blockers: [
      { code: "SOURCE_CHANGED", message: "The source moved its tag." },
    ],
    answers: {
      format: "repo-standards/answers/v1",
      source,
      questions: [
        {
          id: "version",
          question: "Which version?",
          context: "",
          answer: scenario.newest.standards,
        },
        {
          id: "scope:project-docs",
          question: "Which files does project-docs cover?",
          context: "",
          answer: null,
        },
        {
          id: "remote-setup",
          question: "Defer the remote setup that is not ready?",
          context: "",
          answer: "defer",
        },
      ],
    },
  });
  process.exitCode = 1;
}

function summary() {
  const { cli, standards } = current();
  return [
    "# Repository Standards adoption record",
    "",
    "## Ready to commit",
    "",
    `Ready to commit: ${ready() ? "yes" : "no"}.`,
    "",
    "## Selection",
    "",
    "| Component | Value |",
    "| --- | --- |",
    `| CLI | \`${cli}\` |`,
    `| Standards source | \`${source}\` |`,
    `| Standards version | \`${standards}\` |`,
    "| Profile | `default` |",
    "",
    "## Operations",
    "",
    "| Operation | Result |",
    "| --- | --- |",
    `| \`github-settings/apply\` | deferred: ${deferred[0].reason} |`,
    "",
  ].join("\n");
}

function cli(kind, version) {
  const command = args.join(" ");
  if (command === "outdated --json") {
    log({ kind, version, args });
    return outdated();
  }
  if (command === "adopt --headless --json") {
    log({ kind, version, args });
    return headless(version);
  }
  if (command === "status --json") {
    log({ kind, version, args });
    const isReady = ready();
    const { cli, standards } = current();
    return print({
      readyToCommit: isReady,
      readinessReasons: isReady ? [] : ["The update has not completed."],
      selection: {
        cli: { version: cli },
        standards: {
          repository: source,
          version: standards,
          commit: "0".repeat(40),
        },
        profile: "default",
      },
    });
  }
  if (command === "status --summary") {
    const output = summary();
    log({ kind, version, args, output });
    return process.stdout.write(output);
  }
  process.stderr.write(`fake CLI: unexpected ${command}\n`);
  process.exitCode = 2;
}

if (mode === "npm") {
  log({ kind: "npm", args });
  const bin = join(root, ".repo-standards/runtime/node_modules/.bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "repo-standards"),
    `#!/bin/sh\nexec "${process.execPath}" "${process.argv[1]}" pinned "$@"\n`,
  );
  chmodSync(join(bin, "repo-standards"), 0o755);
} else if (mode === "npx") {
  const spec = args.splice(0, 2)[1];
  cli("newest", spec.slice(spec.lastIndexOf("@") + 1));
} else if (mode === "pinned") {
  cli("pinned", current().cli);
} else if (mode === "agent") {
  const report = process.env.REPO_STANDARDS_REPORT;
  log({
    kind: "agent",
    args,
    report: existsSync(report)
      ? JSON.parse(readFileSync(report, "utf8")).outcome
      : "missing",
  });
  if (args[0] === "finish") applyUpdate();
}
