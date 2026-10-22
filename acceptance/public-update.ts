// Public-package/public-source update verification, not real-agent assessment.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compare, lt, prerelease, valid } from "semver";
import type { AdoptReport, AnswersFile } from "../src/adopt.ts";

const packageName = "@lutzseverino/repo-standards";
const source = "https://github.com/lutzseverino/repo-standards-example";
const profile = "work";

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
export interface PublicCommand {
  executable: string;
  args: string[];
}
type Execute = (
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) => CommandResult;

export interface RequestCount {
  githubRest: number;
  observedFetchAttempts: number;
  byPhase: Record<string, number>;
  scope: string;
}

export function requestCount(path: string): RequestCount {
  const entries = readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { origin: string; phase: string });
  const github = entries.filter(
    ({ origin }) => origin === "https://api.github.com",
  );
  const byPhase: Record<string, number> = {};
  for (const { phase } of github) byPhase[phase] = (byPhase[phase] ?? 0) + 1;
  return {
    githubRest: github.length,
    observedFetchAttempts: entries.length,
    byPhase,
    scope:
      "Actual child-process fetch attempts; GitHub REST is counted separately. npm's own HTTP transport and smart Git transfers are not counted.",
  };
}

export function previousStableVersion(versions: string[], version: string) {
  assert.ok(
    valid(version) && prerelease(version) === null,
    "Release version must be stable SemVer.",
  );
  const previous = versions
    .filter(
      (entry) =>
        valid(entry) && prerelease(entry) === null && lt(entry, version),
    )
    .sort(compare)
    .at(-1);
  assert.ok(previous, `No published stable npm release precedes ${version}.`);
  return previous;
}

interface ReadyStatus {
  readyToCommit: boolean;
  selection: {
    cli: { version: string };
    standards: { repository: string; version: string; commit: string };
    profile: string;
  };
  impact?: { derived: string };
}

export interface UpdateEvidence {
  passed: boolean;
  failure?: string;
  previousVersion?: string;
  version: string;
  source: string;
  profile: string;
  sourceVersion?: string;
  sourceCommit?: string;
  registry: { url: string; requests: number; status: number | null };
  baseline: {
    commands: PublicCommand[];
    reports: unknown[];
    status?: ReadyStatus;
    committedHead?: string;
  };
  update?: {
    command: PublicCommand;
    result: CommandResult;
    report?: AdoptReport;
    status?: ReadyStatus;
    adopterAction?: string;
  };
  requests?: RequestCount;
}

// This prepared project has real commands and a documented, already useful
// layout. Scripted judgments below describe these fixed bytes, not arbitrary
// future guidance, and do not establish a real-agent journey.
const projectFiles = {
  "package.json":
    JSON.stringify(
      {
        name: "release-update-acceptance",
        private: true,
        type: "module",
        scripts: {
          start: "node src/cli.mjs",
          test: "node --test test/double.test.mjs",
        },
      },
      null,
      2,
    ) + "\n",
  "README.md": `# Number doubler

Print twice one finite numeric input; this disposable command has no network,
persistence or external dependencies.

## Setup

Use stable Node.js 24 or 26. The adopted README check needs Python >=3.12,<4.
There are no dependencies to install.

## Usage

Run \`node src/cli.mjs 3\` to print \`6\`. Missing or nonnumeric input prints
usage to stderr and exits 2.

## Development

Run \`npm test\` for the pure calculation test. \`src/cli.mjs\` owns argument
validation and output; \`src/double.mjs\` owns the calculation. The source
README explains that boundary.
`,
  "src/README.md": `# Source layout

cli.mjs is the executable entry point. It validates one numeric command-line
argument, calls double.mjs and prints the result. double.mjs exports the pure
calculation and performs no I/O. Tests live in test/double.test.mjs. Changing
documentation does not require reorganizing these modules.
`,
  "src/double.mjs": "export const double = (value) => value * 2;\n",
  "src/cli.mjs": `import { double } from './double.mjs';
const value = Number(process.argv[2]);
if (process.argv.length !== 3 || !Number.isFinite(value)) {
  console.error('Usage: node src/cli.mjs <finite-number>');
  process.exitCode = 2;
} else console.log(double(value));
`,
  "test/double.test.mjs": `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { double } from '../src/double.mjs';
test('doubles a number', () => assert.equal(double(3), 6));
`,
};

const judgments: Record<string, object> = {
  readme: {
    status: "satisfied",
    explanation:
      "The prepared README describes the actual numeric CLI, runtime, checked Setup/Usage/Development commands, concrete output, error behavior and limitations.",
    evidence: [
      "Read package.json, README.md and both source modules; node src/cli.mjs 3 prints 6 and the pure calculation test passes.",
    ],
  },
  "source-layout": {
    status: "satisfied",
    explanation:
      "The prepared source layout already separates command-line I/O from the pure calculation; src/README.md describes its real entry point, data flow, ownership and test boundary. No reorganization is needed.",
    evidence: [
      "Read src/cli.mjs, src/double.mjs and src/README.md and ran the CLI and pure calculation test.",
    ],
  },
};

function baselineAnswers(report: AdoptReport): AnswersFile {
  return {
    ...report.answers,
    questions: report.answers.questions.map((question) => {
      let answer = question.answer;
      if (question.id === "profile") answer = profile;
      else if (question.id === "inspection")
        answer = report.inspection?.identity;
      else if (question.id === "remote-setup") answer = "defer";
      else if (question.id.startsWith("assessment:")) {
        answer = judgments[question.id.slice("assessment:".length)];
        assert.ok(answer, `No prepared-project assessment for ${question.id}.`);
      } else if (question.id.startsWith("scope:")) {
        const draft = answer as { unresolved?: unknown[] } | null;
        assert.ok(
          draft && draft.unresolved?.length === 0,
          `No complete scope draft for ${question.id}.`,
        );
      } else
        assert.equal(
          question.id,
          "version",
          `Unexpected baseline question ${question.id}.`,
        );
      assert.ok(
        answer !== undefined && answer !== null,
        `Unanswered baseline question ${question.id}.`,
      );
      return { ...question, answer };
    }),
  };
}

export async function verifyPublicUpdate(options: {
  version: string;
  root: string;
  env: NodeJS.ProcessEnv;
  execute: Execute;
  requestLog: string;
  fetch?: typeof globalThis.fetch;
}): Promise<UpdateEvidence> {
  const { version, root, env, execute, requestLog } = options;
  const evidence: UpdateEvidence = {
    passed: false,
    version,
    source,
    profile,
    registry: {
      url: "https://registry.npmjs.org/@lutzseverino%2Frepo-standards",
      requests: 0,
      status: null,
    },
    baseline: { commands: [], reports: [] },
  };
  const project = join(root, "update-project");
  const pinned = join(
    project,
    ".repo-standards/runtime/node_modules/.bin/repo-standards",
  );
  const command = (executable: string, args: string[], phase: string) =>
    execute(executable, args, project, {
      ...env,
      REPO_STANDARDS_ACCEPTANCE_PHASE: phase,
    });
  const successful = (
    executable: string,
    args: string[],
    phase = "baseline",
  ) => {
    const result = command(executable, args, phase);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  const commit = (message: string) =>
    successful("git", [
      "-c",
      "user.name=Release acceptance",
      "-c",
      "user.email=release@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "-m",
      message,
    ]);
  try {
    evidence.registry.requests++;
    const response = await (options.fetch ?? globalThis.fetch)(
      evidence.registry.url,
      { signal: AbortSignal.timeout(30_000) },
    );
    evidence.registry.status = response.status;
    assert.equal(
      response.status,
      200,
      `Public npm versions returned HTTP ${response.status}.`,
    );
    const metadata = (await response.json()) as {
      versions?: Record<string, unknown>;
    };
    assert.ok(
      metadata.versions &&
        typeof metadata.versions === "object" &&
        !Array.isArray(metadata.versions),
      "Public npm returned no version map.",
    );
    const previous = previousStableVersion(
      Object.keys(metadata.versions),
      version,
    );
    evidence.previousVersion = previous;
    for (const [path, text] of Object.entries(projectFiles)) {
      mkdirSync(join(project, path, ".."), { recursive: true });
      writeFileSync(join(project, path), text);
    }
    successful("git", ["init", "--quiet"]);
    successful("git", ["config", "maintenance.auto", "false"]);
    successful("git", ["add", "."]);
    commit("test: prepare public update acceptance project");
    assert.equal(
      successful(process.execPath, ["src/cli.mjs", "3"]).trim(),
      "6",
    );
    successful(process.execPath, ["--test", "test/double.test.mjs"]);
    const answers = join(root, "previous-release-answers.json");
    let args = ["adopt", source, "--profile", profile, "--json"];
    let started = false;
    for (let round = 0; round < 8; round++) {
      const invocation = started
        ? { executable: pinned, args }
        : {
            executable: "npx",
            args: ["--yes", `${packageName}@${previous}`, ...args],
          };
      evidence.baseline.commands.push(invocation);
      const result = command(
        invocation.executable,
        invocation.args,
        "baseline",
      );
      assert.ok(
        result.stdout.trim(),
        result.stderr || "Previous-release adopt returned no JSON report.",
      );
      const report = JSON.parse(result.stdout) as AdoptReport;
      evidence.baseline.reports.push(report);
      if (report.outcome === "complete") {
        assert.equal(result.status, 0, result.stderr);
        break;
      }
      assert.ok(
        result.status === 0 || result.status === 1,
        result.stdout + result.stderr,
      );
      assert.ok(
        ["answers-required", "contextual"].includes(report.outcome),
        `Previous release did not complete: ${report.outcome ?? result.stdout}.`,
      );
      writeFileSync(
        answers,
        JSON.stringify(baselineAnswers(report), null, 2) + "\n",
      );
      args = ["adopt", "--answers", answers, "--json"];
      started ||= report.run !== undefined;
    }
    assert.equal(
      (evidence.baseline.reports.at(-1) as AdoptReport).outcome,
      "complete",
      "Previous-release adoption exceeded its eight-round bound.",
    );
    const baseline = JSON.parse(
      successful(pinned, ["status", "--json"]),
    ) as ReadyStatus;
    evidence.baseline.status = baseline;
    assert.equal(
      baseline.readyToCommit,
      true,
      "Previous-release baseline is not ready to commit.",
    );
    assert.equal(baseline.selection.cli.version, previous);
    assert.equal(baseline.selection.standards.repository, source);
    assert.equal(baseline.selection.profile, profile);
    evidence.sourceVersion = baseline.selection.standards.version;
    evidence.sourceCommit = baseline.selection.standards.commit;
    successful("git", ["add", "."]);
    commit("test: establish previous release adoption");
    evidence.baseline.committedHead = successful("git", [
      "rev-parse",
      "HEAD",
    ]).trim();

    const invocation = {
      executable: "npx",
      args: ["--yes", `${packageName}@${version}`, "adopt", "--json"],
    };
    const result = command(invocation.executable, invocation.args, "update");
    evidence.update = { command: invocation, result };
    const report = JSON.parse(result.stdout) as AdoptReport;
    evidence.update.report = report;
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(
      report.outcome,
      "complete",
      `One adopt stopped with ${report.outcome}.`,
    );
    const status = JSON.parse(
      successful(pinned, ["status", "--json"], "update"),
    ) as ReadyStatus;
    evidence.update.status = status;
    assert.equal(
      status.readyToCommit,
      true,
      "The one-invocation update is not ready to commit.",
    );
    assert.equal(status.selection.cli.version, version);
    const line = status.impact?.derived;
    assert.ok(
      typeof line === "string" &&
        line.trim() &&
        !/[\r\n\u2028\u2029]/u.test(line),
      "The update did not report its derived adopter-action line.",
    );
    evidence.update.adopterAction = line;
    evidence.passed = true;
  } catch (error) {
    evidence.failure = error instanceof Error ? error.message : String(error);
  } finally {
    evidence.requests = requestCount(requestLog);
  }
  return evidence;
}
