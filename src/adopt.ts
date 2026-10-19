import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { rcompare } from "semver";
import { parse } from "yaml";
import {
  acquireSource,
  externalPath,
  github,
  GithubRefusal,
  githubSource,
  isStableVersion,
  type SourceObservations,
} from "./acquisition.js";
import { lockPath, projectRoot, safe } from "./adoption-files.js";
import { linkTextAt } from "./targets.js";
import {
  abandon,
  inspectRetained,
  resume,
  start,
  startRetained,
  status,
  submitAssessment,
} from "./adoption.js";
import { readRecordedAdoption, type RetainedSource } from "./recorded-state.js";
import {
  canResumeAssessment,
  confirmationStop,
  confirmedProposal,
  scopeStop,
} from "./adoption-run.js";
import type { Run } from "./adoption-run.js";
import { ProductError } from "./errors.js";
import { formats } from "./formats.js";
import { inspect } from "./inspection.js";
import type { Blocker } from "./observation.js";
import { observeGitStart, requireSupportedGit } from "./observation.js";
import {
  findPreservedRun,
  preservedStartBlockers,
  type PreservedRun,
} from "./preserved-run.js";
import { parseScope } from "./scope.js";
import { record } from "./records.js";
import { deferredRemoteSetup } from "./remote-setup.js";
import { validateSource } from "./resolver.js";
import {
  code,
  inspectionSummary,
  section,
  table,
  text,
  type InspectionReport,
} from "./summary.js";
import { readYaml, type Diagnostic } from "./yaml.js";

// Guided adoption: one command adopts or updates a project for an agent by
// driving inspect, start and resume. Without an answers file it prints the
// questions the adoption asks as an answers-file template, with the agent's
// next steps, and changes nothing. With a filled file it asks what remains,
// starts the run once nothing does, and advances an active run by at most one
// step: a confirmed or deferred fix or a submitted assessment. Questions that
// depend on an answer, such as discovery after a profile, appear once it is
// given. An answers file confirms a confirmation-required change only by
// naming the inspection identity the maintainer confirmed. A run stopped for
// its scope is replaced in place by a changed scope answer, and an abandoned
// run's preserved changes are adopted over in place.

const packageName = "@lutzseverino/repo-standards";
const pinnedCli = ".repo-standards/runtime/node_modules/.bin/repo-standards";

export interface AdoptOptions {
  source?: string;
  standardsVersion?: string;
  profile?: string;
  answers?: string;
  project: string;
}

// A question the adoption asks, with what the maintainer or agent needs to
// answer it. Only `id` and `answer` are read back.
export interface Question {
  id: string;
  question: string;
  context: string;
  choices?: unknown[];
  details?: unknown;
  answer: unknown;
}
export interface AnswersFile {
  format: typeof formats.answers;
  source: string;
  questions: Question[];
}

interface Text {
  path: string;
  content: string;
}
export interface AdoptReport {
  format: typeof formats.adopt;
  outcome:
    "answers-required" | "blocked" | "contextual" | "complete" | "incomplete";
  selection: {
    cli: string;
    source: string;
    version: string | null;
    profile: string | null;
  };
  // The questions still unanswered, by ID.
  missing: string[];
  blockers: Blocker[];
  inspection?: { identity: string; summary: string };
  // Each edit the run discards, with its changed files' diffs.
  discarded?: {
    target: string;
    files: { path: string; diff?: string; binary?: boolean }[];
    // What replaces a target the inspection reports no file changes for: a
    // system skill or a skill link.
    replacement?: string;
  }[];
  // Each active discovery declaration's discovery and adoption guidance.
  discovery?: { id: string; discovery: Text; guidance: Text }[];
  run?: { id: string; outcome: string; phase: string; reason: string };
  // Each contextual declaration of a run that waits for contextual work.
  contextual?: {
    id: string;
    allowedTargets: { paths: string[]; directories: string[] };
    rules?: Text;
    guidance: Text;
    // The discovery guidance of a discovered declaration.
    discovery?: Text;
  }[];
  // The checks that failed in the run's latest check round.
  failedChecks?: { declaration: string; id: string; message: string }[];
  answers: AnswersFile;
  nextSteps: string[];
}

// Answers by question ID, from an answers file or a terminal.
export type Answers = Map<string, unknown>;

// How adopt is answered: an answers-file template that only proposes, a
// filled answers file, or a person at a terminal, whom adopt asks one stage
// of questions at a time, proposing defaults.
type Mode = "template" | "answers" | "terminal";

const questionId =
  /^(?:version|profile|remote-setup|confirmation|inspection|(?:scope|assessment):[^/\s]+|fix:[^/\s]+\/[^/\s]+)$/;
const questionKeys = ["id", "question", "context", "choices", "details"];

function malformed(message: string): never {
  throw new ProductError("ANSWERS_FORMAT", message);
}

// The answers file is read strictly, outside the project, like a scope
// proposal: inside it, the file would be an uncommitted change that blocks
// the start, and later an observed change outside every target.
function readAnswers(path: string, root: string): AnswersFile {
  let location: string;
  try {
    location = realpathSync(resolve(path));
  } catch {
    malformed(`Cannot read the answers file ${path}.`);
  }
  const within = relative(root, location);
  if (
    within === "" ||
    (within !== ".." && !within.startsWith("../") && !isAbsolute(within))
  )
    throw new ProductError(
      "ANSWERS_LOCATION",
      "Keep the answers file outside the adopting project: inside it, the file is a change to the project.",
    );
  const stat = lstatSync(location);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024)
    malformed("The answers file must be a regular JSON file of at most 2 MiB.");
  const input = readFileSync(location, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    malformed("The answers file must be valid JSON.");
  }
  if (record(value).format !== formats.answers)
    malformed(`The answers file format must be ${formats.answers}.`);
  const diagnostics: Diagnostic[] = [];
  // JSON is YAML: the strict YAML reader reports the duplicate keys that
  // JSON.parse silently resolves.
  readYaml(input, "answers.json", diagnostics);
  if (diagnostics.length) malformed("The answers file has duplicate keys.");
  const file = record(value);
  if (
    Object.keys(file).sort().join() !== "format,questions,source" ||
    typeof file.source !== "string" ||
    !file.source ||
    !Array.isArray(file.questions)
  )
    malformed(
      "The answers file holds exactly format, source, and questions, as adopt prints it.",
    );
  const seen = new Set<string>();
  for (const entry of file.questions as unknown[]) {
    const question = record(entry);
    const { id, answer } = question;
    if (
      typeof id !== "string" ||
      !questionId.test(id) ||
      !("answer" in question) ||
      Object.keys(question).some(
        (key) => key !== "answer" && !questionKeys.includes(key),
      )
    )
      malformed(
        `Each question holds the id and answer adopt printed, with its question, context, choices, and details: ${JSON.stringify(entry)}.`,
      );
    if (seen.has(id)) malformed(`The answers file repeats question ${id}.`);
    seen.add(id);
    const kind = id.split(":")[0]!;
    const valid =
      answer === null ||
      (kind === "remote-setup"
        ? answer === "defer" || answer === "resolve"
        : kind === "scope" || kind === "assessment"
          ? typeof answer === "object" && !Array.isArray(answer)
          : typeof answer === "string" && answer.length > 0);
    if (!valid)
      malformed(
        `Question ${id} has an answer of the wrong kind; see its context.`,
      );
  }
  return file as unknown as AnswersFile;
}

// A source URL compared as acquisition reads it: case-insensitively, without
// a trailing slash or .git suffix.
function sourceKey(url: string) {
  return url
    .toLowerCase()
    .replace(/\/$/, "")
    .replace(/\.git$/, "");
}

// The selection a project records, read leniently: it only proposes defaults,
// and inspection verifies the recorded adoption.
function recordedSelection(root: string) {
  try {
    const selection = safe(root, ".repo-standards/selection.yaml");
    if (selection.type !== "file") return undefined;
    const value = record(
      parse(Buffer.from(selection.content, selection.encoding).toString()),
    );
    const standards = record(value.standards);
    return typeof standards.repository === "string" &&
      typeof standards.version === "string" &&
      typeof value.profile === "string"
      ? {
          source: standards.repository,
          version: standards.version,
          profile: value.profile,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

// The source's stable releases, newest first, from every page of its
// release list.
async function stableReleases(source: string) {
  const { owner, name } = githubSource(source);
  const releases: unknown[] = [];
  for (let page = 1; ; page++) {
    const listed = await github(
      `/repos/${owner}/${name}/releases?per_page=100&page=${page}`,
    );
    if (!Array.isArray(listed))
      throw new ProductError(
        "INVALID_SOURCE",
        "GitHub did not return a release list.",
      );
    releases.push(...(listed as unknown[]));
    if (listed.length < 100) break;
  }
  const versions = releases
    .map(record)
    .filter(
      (release) =>
        release.draft === false &&
        release.prerelease === false &&
        isStableVersion(release.tag_name),
    )
    .map((release) => release.tag_name as string)
    .sort(rcompare);
  if (!versions.length)
    throw new ProductError(
      "NO_STABLE_RELEASE",
      "The source has no stable release. Name an exact stable tag with --standards-version.",
    );
  return versions;
}

// Before a run, use the exact candidate; after start, prefer its installed
// runtime. npm can satisfy npx from the product checkout itself, even when
// that checkout has no executable, so it needs an external installation.
function continuationCommand(root: string, cliVersion: string, active = true) {
  if (active)
    try {
      const manifest = record(
        JSON.parse(
          readFileSync(
            join(
              root,
              ".repo-standards/runtime/node_modules",
              packageName,
              "package.json",
            ),
            "utf8",
          ),
        ),
      );
      if (manifest.version === cliVersion && existsSync(join(root, pinnedCli)))
        return { invoke: (args: string) => `${pinnedCli} ${args}` };
    } catch {
      // No usable pinned runtime yet.
    }
  try {
    const manifest = record(
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
    );
    if (manifest.name === packageName && manifest.version === cliVersion)
      return {
        setup: `adoption_cli=$(mktemp -d /tmp/repo-standards-cli.XXXXXX) && (cd "$adoption_cli" && npm install --prefix "$adoption_cli" --ignore-scripts --save-exact --no-audit --no-fund ${packageName}@${cliVersion})`,
        invoke: (args: string) =>
          `"$adoption_cli/node_modules/.bin/repo-standards" ${args} --project ${shellArgument(root)}`,
      };
  } catch {
    // A project without a matching package identity uses ordinary npx.
  }
  return {
    invoke: (args: string) => `npx --yes ${packageName}@${cliVersion} ${args}`,
  };
}

// The text of a product file the run wrote, such as installed rules or
// retained adoption guidance.
function productText(root: string, path: string): Text {
  const value = safe(root, path);
  if (value.type !== "file")
    throw new ProductError(
      "STATE_INTEGRITY",
      `Retained product material is missing: ${path}.`,
    );
  return {
    path,
    content: Buffer.from(value.content, value.encoding).toString("utf8"),
  };
}

const unanswered = (question: Question) => question.answer === null;

// Adopts with the answers file the options name, or, given `asked`, with the
// answers a person gave at a terminal.
export async function adopt(
  options: AdoptOptions,
  cliVersion: string,
  asked?: Answers,
): Promise<AdoptReport> {
  const root = projectRoot(options.project);
  const file =
    options.answers === undefined || asked
      ? undefined
      : readAnswers(options.answers, root);
  const given: Answers =
    asked ??
    new Map(file?.questions.map((question) => [question.id, question.answer]));
  if (
    options.source !== undefined &&
    file &&
    sourceKey(options.source) !== sourceKey(file.source)
  )
    throw new ProductError(
      "USAGE",
      `The answers file adopts ${file.source}, not ${options.source}. Omit the source to use the answers file's.`,
    );
  for (const [flag, id, value] of [
    ["--standards-version", "version", options.standardsVersion],
    ["--profile", "profile", options.profile],
  ] as const)
    if (
      value !== undefined &&
      given.get(id) !== undefined &&
      given.get(id) !== null &&
      given.get(id) !== value
    )
      throw new ProductError(
        "USAGE",
        `${flag} ${value} conflicts with the answers file's ${id} ${String(given.get(id))}.`,
      );
  const context: Context = {
    root,
    cliVersion,
    given,
    mode: asked ? "terminal" : file ? "answers" : "template",
    answersPath:
      options.answers === undefined ? undefined : resolve(options.answers),
  };
  if (existsSync(lockPath(root))) {
    const run = status(root, cliVersion).active;
    // A run that ended since the lock was seen leaves nothing to continue.
    if (run) return continueRun(context, options, file, run);
  }
  requireSupportedGit();
  return prepare(context, options, file);
}

interface Context {
  root: string;
  cliVersion: string;
  given: Answers;
  mode: Mode;
  answersPath: string | undefined;
  // The run whose preserved changes a start adopts over in place.
  preserved?: string;
}

// Before a run: the selection questions, then those its inspection raises,
// and the start once every one is answered and nothing blocks it.
async function prepare(
  context: Context,
  options: AdoptOptions,
  file: AnswersFile | undefined,
): Promise<AdoptReport> {
  const { root, cliVersion, given, mode } = context;
  const recorded = recordedSelection(root);
  const source = options.source ?? file?.source ?? recorded?.source;
  if (source === undefined)
    throw new ProductError(
      "USAGE",
      "Name the standards source to adopt: repo-standards adopt https://github.com/OWNER/STANDARDS.",
    );
  // Over the changes an abandoned or replaced run of this source and CLI left,
  // adopt adopts again in place, answering its selection by default.
  const lookup = findPreservedRun(root);
  const preserved: PreservedRun | undefined =
    lookup.preserved &&
    lookup.preserved.run.selection.cli.version === cliVersion &&
    sourceKey(lookup.preserved.run.selection.standards.repository) ===
      sourceKey(source)
      ? lookup.preserved
      : undefined;
  if (preserved) context.preserved = preserved.run.id;
  const defaults: Answers = new Map(
    preserved
      ? [
          ["version", preserved.run.selection.standards.version],
          ["profile", preserved.run.selection.profile],
          ...(
            preserved.installation.report.discovery?.proposal?.declarations ??
            []
          ).map(({ id, ...entry }): [string, unknown] => [
            `scope:${id}`,
            entry,
          ]),
        ]
      : [],
  );
  const gitBlockers = () =>
    preservedStartBlockers(observeGitStart(root).blockers, lookup, preserved);
  // The template proposes each default as the answer, and a terminal offers
  // it as the default.
  const proposing = mode !== "answers";
  // A terminal asks each question it has no answer to, starting with the
  // version and then the profile, on which the later questions depend.
  const asking = (id: string, flag: string | undefined) =>
    mode === "terminal" &&
    flag === undefined &&
    !given.has(id) &&
    !defaults.has(id);
  const answered = (id: string) => {
    const value = given.get(id) ?? defaults.get(id);
    return typeof value === "string" ? value : undefined;
  };
  // Without its source, an adopted project applies its current selection
  // again from the retained inputs, as inspect and start do without source
  // flags.
  const current =
    recorded !== undefined && sourceKey(source) === sourceKey(recorded.source)
      ? recorded
      : undefined;
  const unavailable = (error: unknown) =>
    error instanceof ProductError &&
    ["SOURCE_UNAVAILABLE", "QUOTA_EXHAUSTED"].includes(error.code);
  let version = options.standardsVersion ?? answered("version");
  let profile: string | undefined;
  let releases: string[] | undefined;
  let lookupFailure: string | undefined;
  if (version === undefined) {
    try {
      releases = await stableReleases(source);
    } catch (error) {
      // Only a source that cannot be reached proposes the current version.
      // GitHub refusing the lookup would pass it off as the newest, so a
      // reapplication is then explicit.
      if (current && error instanceof GithubRefusal)
        throw new ProductError(
          error.code,
          `${error.message} To apply the current version, ${current.version}, again, pass --standards-version ${current.version}.`,
        );
      if (!current || !unavailable(error)) throw error;
      lookupFailure = (error as ProductError).message;
    }
    if (proposing) version = releases?.[0] ?? current?.version;
  }
  const versionQuestion: Question = {
    id: "version",
    question: "Which standards version should the project adopt?",
    context: [
      preserved
        ? `Adopting again in place over the changes run ${preserved.run.id} preserved keeps its version, ${preserved.run.selection.standards.version}.`
        : lookupFailure
          ? `The releases of ${source} cannot be read: ${lookupFailure} The template proposes the current version, ${current!.version}, which the retained standards apply again.`
          : `A stable release of ${source}${recorded ? `; the project adopts ${recorded.version} now` : ""}. The template proposes the newest stable release.`,
      ...(mode === "terminal"
        ? []
        : [
            "Choose the proposed newest stable release unless the maintainer's request names another; record your choice in the handoff.",
          ]),
    ].join(" "),
    ...(releases ? { choices: releases } : {}),
    answer: version ?? null,
  };
  if (lookupFailure) unreadReleases.add(versionQuestion);
  const report = (
    outcome: AdoptReport["outcome"],
    questions: Question[],
    rest: Partial<AdoptReport> = {},
  ): AdoptReport => ({
    ...skeleton(
      {
        cli: cliVersion,
        source,
        version: version ?? null,
        profile: profile ?? null,
      },
      questions,
    ),
    outcome,
    ...rest,
  });
  if (version === undefined || asking("version", options.standardsVersion))
    return withSteps(
      context,
      {
        ...report("answers-required", [versionQuestion]),
        missing: ["version"],
        blockers: gitBlockers(),
      },
      mode === "template",
    );

  // This invocation observes the source's repository and tag once, for the
  // profile, the inspection and the start's first inspection; the start
  // observes the tag again after acquiring the runtime. Each invocation
  // observes them anew, while the immutable snapshot is reused across them.
  const observations: SourceObservations = new Map();
  let retained: RetainedSource | undefined;
  let acquired: Awaited<ReturnType<typeof acquireSource>>;
  try {
    acquired = await acquireSource(source, version, root, observations);
  } catch (error) {
    if (current?.version !== version || !unavailable(error)) throw error;
    // Over a preserved update, the retained standards are the last complete
    // adoption's, which apply only that adoption's version again.
    const recordedAdoption = preserved
      ? preserved.previous
      : readRecordedAdoption(root);
    if (recordedAdoption?.selection.standards.version !== version) throw error;
    retained = recordedAdoption.source();
    acquired = retained;
  }
  let profileQuestion: Question;
  let discovery: NonNullable<AdoptReport["discovery"]> = [];
  try {
    const validation = validateSource(
      acquired.root,
      cliVersion,
      acquired,
      retained?.manifest,
    );
    if (!validation.valid)
      throw new ProductError(
        "INVALID_STANDARDS",
        "The standards source is invalid or incompatible with this CLI.",
        validation.errors.map((error) => ({
          ...error,
          file: relative(acquired.root, error.file),
        })),
      );
    const profiles = validation.profiles;
    const names = Object.keys(profiles);
    profile = options.profile ?? answered("profile");
    if (profile === undefined && proposing)
      profile =
        recorded && names.includes(recorded.profile)
          ? recorded.profile
          : names.length === 1
            ? names[0]
            : undefined;
    if (profile !== undefined && !Object.hasOwn(profiles, profile))
      throw new ProductError(
        "UNKNOWN_PROFILE",
        `Unknown profile ${profile}. Available profiles: ${names.join(", ")}.${retained ? " The source is unavailable, and its retained standards hold only the current profile." : ""}`,
      );
    profileQuestion = {
      id: "profile",
      question: "Which profile should the project adopt?",
      context: [
        preserved
          ? `Adopting again in place over the changes run ${preserved.run.id} preserved keeps its profile, ${preserved.run.selection.profile}.`
          : retained
            ? `The source is unavailable, so its retained standards apply the current profile, ${current!.profile}, again.`
            : `Each profile of ${source} ${version} is a complete selection of its standards.${recorded ? ` The project adopts ${recorded.profile} now.` : ""}`,
        ...(mode === "terminal"
          ? []
          : [
              "Choose from the profile descriptions, the maintainer's request, and repository evidence. Ask the maintainer only when these do not settle it. Record your choice and reasons in the handoff.",
            ]),
      ].join(" "),
      choices: names.map((name) => ({
        name,
        description: profiles[name]!.description,
      })),
      answer: profile ?? null,
    };
    // The discovery and adoption guidance of each declaration whose scope
    // the adopter decides, from the acquired source.
    const read = (path: string) => ({
      path,
      content: readFileSync(join(acquired.root, path), "utf8"),
    });
    if (profile !== undefined)
      discovery = profiles[profile]!.declarations.flatMap((declaration) =>
        "discovery" in declaration
          ? [
              {
                id: declaration.id,
                discovery: read(declaration.discovery),
                guidance: read(declaration.guidance),
              },
            ]
          : [],
      );
  } finally {
    acquired.close();
  }
  if (profile === undefined || asking("profile", options.profile))
    return withSteps(
      context,
      {
        ...report("answers-required", [versionQuestion, profileQuestion]),
        missing: ["profile"],
        blockers: gitBlockers(),
      },
      mode === "template",
    );

  // Only the preserved run's own selection adopts again in place.
  if (
    preserved &&
    (version !== preserved.run.selection.standards.version ||
      profile !== preserved.run.selection.profile)
  )
    delete context.preserved;

  // Once the answers file supplies every scope entry, inspection reads them as
  // one proposal, written outside the project, and validates each; an entry
  // is complete once it has no open question.
  const scopeAnswer = (id: string) => {
    const answer = given.get(`scope:${id}`) ?? defaults.get(`scope:${id}`);
    return answer === null || answer === undefined ? undefined : record(answer);
  };
  const proposed =
    discovery.length > 0 &&
    discovery.every(({ id }) => scopeAnswer(id) !== undefined);
  const temporary = proposed
    ? mkdtempSync(join(externalPath(tmpdir(), root), "repo-standards-adopt-"))
    : undefined;
  let keep = false;
  try {
    const scope = temporary ? join(temporary, "scope.json") : undefined;
    if (scope)
      writeFileSync(
        scope,
        JSON.stringify({
          format: formats.scope,
          // The question names the declaration, whatever the answer holds.
          declarations: discovery.map(({ id }) => ({
            ...scopeAnswer(id),
            id,
          })),
        }),
      );
    const inspectOptions = {
      source,
      standardsVersion: version,
      profile,
      project: root,
      ...(scope ? { scope } : {}),
    };
    const inspection = retained
      ? await inspectRetained(root, cliVersion, scope)
      : await inspect(inspectOptions, cliVersion, observations);
    const questions = [versionQuestion, profileQuestion];
    const missing: string[] = [];
    for (const { id } of discovery) {
      const draft = inspection.discovery?.draft?.declarations.find(
        (entry) => entry.id === id,
      );
      const answer =
        scopeAnswer(id) ??
        (draft
          ? {
              coverage: draft.coverage,
              candidates: draft.candidates,
              unresolved: draft.unresolved,
            }
          : null);
      const open = Array.isArray(answer?.unresolved)
        ? (answer.unresolved as unknown[])
        : [];
      questions.push({
        id: `scope:${id}`,
        question: `Which project files does ${id} cover?`,
        context: [
          draft
            ? `Its discovery script drafted this scope entry; review each candidate against the discovery guidance.`
            : `Interpret its discovery guidance and write its scope entry: coverage, candidates, and unresolved.`,
          `Each candidate has a path, a decision of include or exclude, a reason, and evidence paths of existing project files and directories; an included candidate is one file.`,
          open.length
            ? mode === "terminal"
              ? `Ask the maintainer each open question in unresolved, record the answers as candidate decisions and coverage, and empty unresolved.`
              : `Decide each open question in unresolved from project evidence, with reasons, without asking the maintainer; record the decisions as candidates and coverage, and empty unresolved.`
            : `An entry whose unresolved is empty is complete.`,
        ].join(" "),
        details: { unresolved: open },
        answer,
      });
      // A drafted entry an answers file has not carried back is not yet an
      // answer: inspection read no proposal for it. The template proposes it,
      // as it proposes the other defaults.
      if ((mode !== "template" && scopeAnswer(id) === undefined) || open.length)
        missing.push(`scope:${id}`);
    }
    const notReady = deferredRemoteSetup(inspection.remoteSetup);
    // Adopting again in place keeps the preserved run's deferral of remote
    // setup that is still not ready.
    const remoteSetup =
      given.get("remote-setup") ??
      (notReady.some((entry) =>
        preserved?.run.deferred.some(
          (deferred) =>
            deferred.declaration === entry.declaration &&
            deferred.id === entry.id,
        ),
      )
        ? "defer"
        : null);
    if (notReady.length)
      questions.push({
        id: "remote-setup",
        question:
          "Defer the remote setup that is not ready, or stop and resolve it first?",
        context:
          "Remote setup changes the hosting platform's settings, and its probe says it cannot apply yet. Deferred, adoption completes locally without it, and every later run applies it once its probe is ready. Resolved, adopt writes nothing until it is." +
          (mode === "terminal"
            ? ""
            : " Answer defer without asking: it changes nothing remotely. Report each reason in the handoff."),
        choices: ["defer", "resolve"],
        details: notReady,
        answer: remoteSetup,
      });
    const { confirmation, identity } = inspection;
    let discarded: AdoptReport["discarded"];
    if (confirmation.required) {
      // The answers file holds a confirmation as an identity string.
      const answer = (given.get("confirmation") as string | undefined) ?? null;
      const stale = answer !== null && answer !== identity;
      questions.push({
        id: "confirmation",
        question:
          mode === "terminal"
            ? "Does the maintainer confirm discarding these edits?"
            : "Do you confirm discarding these Git-recoverable edits after review?",
        context: [
          ...(stale
            ? [
                `The answer names ${answer}, but this inspection is ${identity}: what the run discards changed since that confirmation.`,
              ]
            : []),
          mode === "terminal"
            ? `The run replaces or removes each target in details with content that discards edits. Only after the maintainer confirms discarding them, answer with this inspection's identity, ${identity}.`
            : `The run replaces or removes each target in details with content that discards edits. A new run starts from a clean, committed tree, so Git can restore them. Review each discarded edit with its diff, or its current content where there is none, then answer with this inspection's identity, ${identity}, without asking. List each discarded edit with its diff or current content in the handoff.`,
        ].join(" "),
        details: { identity, targets: inspection.discardedEdits },
        answer,
      });
      if (stale) missing.push("confirmation");
      discarded = inspection.discardedEdits.map((target) => {
        const files = [...inspection.exact, ...(inspection.removed ?? [])]
          .filter((entry) => entry.target === target)
          .flatMap((entry) =>
            entry.files.map((changed) => ({
              path: changed.path,
              ...(changed.diff === undefined ? {} : { diff: changed.diff }),
              ...(changed.binary ? { binary: true } : {}),
            })),
          );
        const skill = inspection.systemSkills.find(
          (entry) => entry.target === target,
        );
        const link = linkTextAt(target);
        const replacement = files.length
          ? undefined
          : skill
            ? `this CLI's packaged ${skill.name} skill`
            : link
              ? `a skill link to ${link}`
              : undefined;
        return { target, files, ...(replacement ? { replacement } : {}) };
      });
    }
    // The answers file names the inspection it was written against, so a run
    // starts only after the agent reviewed the inspection it carries out.
    // A new or changed inspection goes back for another answer round.
    questions.push({
      id: "inspection",
      question: "Which inspection does the run carry out?",
      context:
        mode === "terminal"
          ? `The identity of the inspection above, ${identity}, which this answers file was written against. Present that inspection to the maintainer before running adopt with it. adopt starts a run only when this answer names the current inspection; when the inspection changes, it prints the new one to present.`
          : `Answer with the current inspection identity without asking for approval: ${identity}. Review the inspection and summarize its changes, discarded edits, and operations that run trusted scripts with the user's access to the host, environment, and network in the handoff. adopt starts only the current inspection; review a changed inspection and answer with its new identity.`,
      answer: identity,
    });
    if (mode !== "template" && given.get("inspection") !== identity)
      missing.push("inspection");
    const blockers = inspection.start.blockers.filter(
      (blocker) =>
        !["DISCOVERY_REQUIRED", "UNRESOLVED_SCOPE"].includes(blocker.code),
    );
    const inspected = report("answers-required", questions, {
      blockers,
      inspection: {
        identity,
        summary: inspectionSummary(inspection as unknown as InspectionReport),
      },
      ...(discarded ? { discarded } : {}),
      ...(discovery.length ? { discovery } : {}),
    });
    inspected.missing = [...new Set([...inspected.missing, ...missing])];
    if (mode === "template" || inspected.missing.length)
      return withSteps(context, inspected, mode === "template");
    if (blockers.length || (notReady.length && remoteSetup === "resolve"))
      return withSteps(context, { ...inspected, outcome: "blocked" }, false);
    const run = retained
      ? await startRetained(
          root,
          cliVersion,
          identity,
          confirmation.required,
          scope,
          notReady.length > 0,
        )
      : await start(
          inspectOptions,
          cliVersion,
          identity,
          confirmation.required,
          notReady.length > 0,
          observations,
        );
    // A retry of a start interrupted before its installation was prepared
    // reads the proposal again.
    keep = existsSync(lockPath(root)) && !run.continuation;
    return describeRun(context, run, runReport(run), false);
  } finally {
    if (temporary && !keep) rmSync(temporary, { recursive: true, force: true });
  }
}

// An active run: its selection must be the one the answers adopt.
async function continueRun(
  context: Context,
  options: AdoptOptions,
  file: AnswersFile | undefined,
  run: Run,
) {
  const { root, cliVersion, given } = context;
  const { standards, profile } = run.selection;
  const source = options.source ?? file?.source;
  const version = options.standardsVersion ?? given.get("version");
  const chosen = options.profile ?? given.get("profile");
  if (
    (source !== undefined &&
      sourceKey(source) !== sourceKey(standards.repository)) ||
    (typeof version === "string" && version !== standards.version) ||
    (typeof chosen === "string" && chosen !== profile)
  ) {
    const continuation = continuationCommand(root, cliVersion);
    throw new ProductError(
      "ACTIVE_RUN",
      `A run adopting ${standards.repository} ${standards.version} with profile ${profile} is active. Continue it with an answers file for it, or, with the maintainer's instruction, abandon it with ${continuation.invoke("abandon")} before adopting another selection.${continuation.setup ? ` First set adoption_cli to the external installation of CLI ${cliVersion} that started the run; if unavailable, acquire it outside the project with ${continuation.setup}.` : ""}`,
    );
  }
  // A run stopped for its scope and given a changed scope answer is replaced
  // in place: archived as abandonment archives it, its changes preserved, and
  // the unchanged selection inspected with the new scope.
  if (scopeStop(run) && changesScope(given, confirmedProposal(root, run))) {
    abandon(root, cliVersion, true);
    requireSupportedGit();
    return prepare(context, options, file);
  }
  return describeRun(context, run, runReport(run), true);
}

// Whether the answers change a confirmed scope entry. An answer is compared as
// a proposal reads it, so one inspection would reject fails here, before the
// run is replaced.
function changesScope(
  given: Answers,
  proposal: ReturnType<typeof confirmedProposal>,
) {
  return (proposal?.declarations ?? []).some((confirmed) => {
    const answer = given.get(`scope:${confirmed.id}`);
    if (answer === undefined || answer === null) return false;
    const [entry] = parseScope(
      JSON.stringify({
        format: formats.scope,
        declarations: [{ ...record(answer), id: confirmed.id }],
      }),
    ).declarations;
    return JSON.stringify(entry) !== JSON.stringify(confirmed);
  });
}

// The scope questions of a run stopped for its scope: each confirmed entry,
// which a changed answer replaces in place.
function scopeQuestions(context: Context, run: Run): Question[] {
  if (!scopeStop(run)) return [];
  return (confirmedProposal(context.root, run)?.declarations ?? []).map(
    ({ id, ...entry }) => ({
      id: `scope:${id}`,
      question: `Which project files does ${id} cover?`,
      context:
        "The run's confirmed scope, which never changes within the run. When the contextual work needs a file this scope misses, change this answer to include it, with a reason and evidence, and run adopt again: adopt replaces the run in place, archiving its report and keeping its changes, inspects the unchanged selection with the new scope, and starts a new run over those changes." +
        (context.mode === "terminal"
          ? ""
          : " A scope answer is Git-undoable, so change it without asking, and record the change and its reasons in the handoff."),
      details: { unresolved: [] },
      answer: context.given.get(`scope:${id}`) ?? entry,
    }),
  );
}

// The report of a run, before describing what it asks.
function runReport(run: Run): AdoptReport {
  const { cli, standards, profile } = run.selection;
  return skeleton(
    {
      cli: cli.version,
      source: standards.repository,
      version: standards.version,
      profile,
    },
    [],
  );
}

// A report of a selection and the questions asked about it, which each
// outcome completes.
function skeleton(
  selection: AdoptReport["selection"],
  questions: Question[],
): AdoptReport {
  return {
    format: formats.adopt,
    outcome: "incomplete",
    selection,
    missing: questions.filter(unanswered).map((question) => question.id),
    blockers: [],
    answers: { format: formats.answers, source: selection.source, questions },
    nextSteps: [],
  };
}

// What a run's result asks of the agent, advancing it by one step first when
// `advance` allows and its answers are complete: a fix confirmed by the
// maintainer, or the assessments of finished contextual work.
async function describeRun(
  context: Context,
  run: Run,
  base: AdoptReport,
  advance: boolean,
): Promise<AdoptReport> {
  const { root, cliVersion, given } = context;
  const report: AdoptReport = {
    ...base,
    run: {
      id: run.id,
      outcome: run.outcome,
      phase: run.phase,
      reason: run.reason,
    },
  };
  if (run.outcome === "complete")
    return withSteps(context, { ...report, outcome: "complete" }, false);
  // A start that wrote nothing removes its run.
  if (!existsSync(lockPath(root)))
    return withSteps(context, { ...report, outcome: "blocked" }, false);
  const stop = confirmationStop(run);
  if (stop) {
    const fix = `${stop.operation.declaration}/${stop.operation.id}`;
    const id = `fix:${fix}`;
    const answer = given.get(id) ?? null;
    if (advance && (answer === run.inspection || answer === "defer"))
      return describeRun(
        context,
        await resume(
          root,
          cliVersion,
          undefined,
          false,
          answer !== "defer",
          answer === "defer",
        ),
        base,
        false,
      );
    const question: Question = {
      id,
      question: `Does the maintainer confirm that fix ${fix} overwrites this setting, or defer it?`,
      context: `${stop.message} The fix changed nothing. Only after the maintainer confirms the overwrite, answer with this run's inspection identity, ${run.inspection}; the run then reruns the fix allowed to overwrite. When the maintainer declines it, answer defer: the run records the fix as deferred, with a reason naming the declined settings, and continues with the next fix, and every later run runs it again.`,
      choices: [run.inspection, "defer"],
      details: { fix, identity: run.inspection },
      answer,
    };
    return withSteps(
      context,
      {
        ...report,
        outcome: "answers-required",
        missing: answer === run.inspection || answer === "defer" ? [] : [id],
        answers: { ...report.answers, questions: [question] },
      },
      false,
    );
  }
  const request = run.workRequest;
  const scopes = scopeQuestions(context, run);
  if (!request || !canResumeAssessment(run))
    return withSteps(
      context,
      scopes.length
        ? {
            ...report,
            answers: { ...report.answers, questions: scopes },
          }
        : report,
      false,
    );
  const assessments = request.declarations.map(
    ({ id, allowedTargets, discovery }): Question => ({
      id: `assessment:${id}`,
      question: `Does the project now satisfy ${id}?`,
      context: `After the contextual work, judge the declaration: answer with status satisfied or blocked, an explanation, and evidence, the concrete project content or command outcomes you observed${discovery ? ", and scopeValidity with an afterFixes and a current review, each with status valid or blocked, explanation, evidence, and additionalPaths" : ""}. Copy no identities or changed paths.`,
      details: { allowedTargets },
      // A run that just reached its contextual work has no assessment yet.
      answer: advance ? (given.get(`assessment:${id}`) ?? null) : null,
    }),
  );
  if (advance && !assessments.some(unanswered)) {
    // Refresh the work request at the project's current snapshot, then
    // submit the assessment against it.
    const refreshed = await resume(root, cliVersion);
    if (!refreshed.workRequest || !canResumeAssessment(refreshed))
      return describeRun(context, refreshed, base, false);
    return describeRun(
      context,
      await submitAssessment(root, cliVersion, {
        format: formats.assessment,
        // The question names the declaration, whatever the answer holds.
        declarations: assessments.map((question) => ({
          ...record(question.answer),
          id: question.id.slice("assessment:".length),
        })),
      }),
      { ...base, answers: { ...base.answers, questions: assessments } },
      false,
    );
  }
  // Each check's latest result, when the checks failed: every round runs
  // every check, and the rounds since the last fix hold only checks.
  const latest = new Map<string, Run["operations"][number]>();
  if (run.reason.startsWith("CHECKS_FAILED:"))
    for (const evidence of [...run.operations].reverse()) {
      if (evidence.operation.phase !== "checks") break;
      const key = `${evidence.operation.declaration}/${evidence.operation.id}`;
      if (!latest.has(key)) latest.set(key, evidence);
    }
  const failedChecks = [...latest.values()].reverse().flatMap((evidence) =>
    evidence.result?.status === "failed"
      ? [
          {
            declaration: evidence.operation.declaration,
            id: evidence.operation.id,
            message: evidence.result.message,
          },
        ]
      : [],
  );
  // A renewed assessment starts from the answers just submitted.
  const questions = assessments.map((question) => ({
    ...question,
    answer:
      base.answers.questions.find((entry) => entry.id === question.id)
        ?.answer ?? question.answer,
  }));
  return withSteps(
    context,
    {
      ...report,
      outcome: "contextual",
      missing: questions.filter(unanswered).map((question) => question.id),
      contextual: request.declarations.map((declaration) => ({
        id: declaration.id,
        allowedTargets: declaration.allowedTargets,
        ...(declaration.rules
          ? { rules: productText(root, declaration.rules) }
          : {}),
        guidance: productText(root, declaration.guidance.retained),
        ...(declaration.discovery
          ? { discovery: productText(root, declaration.discovery.retained) }
          : {}),
      })),
      ...(failedChecks.length ? { failedChecks } : {}),
      answers: { ...report.answers, questions: [...questions, ...scopes] },
    },
    false,
  );
}

// The agent's next steps for a report: the adoption procedure from here.
// The sections they mention precede them.
function withSteps(
  context: Context,
  report: AdoptReport,
  template: boolean,
): AdoptReport {
  const { root, cliVersion } = context;
  // Before a run installs it, nothing establishes the project's runtime, so
  // only a run's steps name it.
  const cli = continuationCommand(root, cliVersion, !!report.run);
  const answers =
    context.answersPath === undefined
      ? "<answers file>"
      : shellArgument(context.answersPath);
  const invoke = (args: string) => code(cli.invoke(args));
  const again = invoke(`adopt --answers ${answers}`);
  const ids = new Set(report.answers.questions.map((question) => question.id));
  const steps: string[] = [`Work from the project root, ${code(root)}.`];
  if (
    report.outcome === "blocked" ||
    (!report.run && report.outcome === "answers-required")
  )
    steps.push(
      "Make no project edits until the run starts. Write files implied by your answers, such as optional scope files, during contextual work.",
    );
  if (!report.run && context.preserved)
    steps.push(
      `This adoption adopts again in place over the changes run ${context.preserved} preserved: its start exempts exactly the uncommitted state that run recorded from the Git start blockers, reruns the fixes, keeps the contextual work for you to reassess, and its change set covers every change since the HEAD that run started from. Leave those changes as they are: nothing needs to be abandoned, committed, or cloned afresh.`,
    );
  if (
    !report.run &&
    report.blockers.some(
      ({ code }) => code === "NO_COMMIT" || code === "DIRTY_PROJECT",
    )
  ) {
    steps.push(
      context.preserved
        ? `Stop and tell the maintainer about the Git blockers above: adopting again in place exempts only the uncommitted state run ${context.preserved} recorded, and the blockers name changes it did not record. Leave their pending work unchanged; the maintainer must commit or reconcile it before adoption can start.`
        : "Stop and tell the maintainer about the Git blockers above: a new adoption run requires a clean, committed project. Leave their pending work unchanged; the maintainer must resolve it before adoption can start.",
    );
    return { ...report, nextSteps: steps };
  }
  if (cli.setup)
    steps.push(
      `This checkout's package name and version match CLI ${cliVersion}, so pinned npx can select its local package and fail to find the executable. Set ${code("adoption_cli")} to the external installation directory of that exact CLI and keep it for every answer round and recovery until the matching project runtime is available. If you need to acquire it, run ${code(cli.setup)}. Keep that installation and the answers file outside the project. The commands below use this shell variable and explicitly name the target project; --project alone does not change npm's package resolution.`,
    );
  const reason = report.run?.reason ?? "";
  // A run stopped for its scope carries its scope questions, which a changed
  // answer recovers by replacing the run in place.
  const scoped = !!report.run && [...ids].some((id) => id.startsWith("scope:"));
  const scopeStep = `To cover files the confirmed scope misses, change the \`scope:\` answers above to include them, with reasons and evidence from the project, and run ${again}. adopt replaces this run in place: it archives the run's report, keeps its changes, inspects the unchanged selection with the new scope, and starts a new run over them; nothing needs to be abandoned, committed, or cloned afresh. A scope answer is Git-undoable, so change it without asking, and record the change in the handoff. Answer the new inspection's questions as before; the new run reruns the fixes and asks for renewed assessments.`;
  switch (report.outcome) {
    case "answers-required":
      if (report.run) {
        steps.push(
          "Present each setting with its current and standard values from the fix's message to the maintainer, and ask whether to overwrite it.",
          `Only after they confirm, answer its question with the run's inspection identity and run ${again}; the fix reruns allowed to overwrite. If they decline, answer \`defer\` and run ${again}: the run records the fix as deferred, with a reason naming the declined settings, continues with the next fix, and completes without it; every later run runs it again. Record the maintainer's decision in the handoff.`,
        );
        break;
      }
      steps.push(
        template
          ? "Save the answers file above outside the project, such as in a temporary directory."
          : `Edit the answers file at ${code(answers)}; the answers file above carries your answers.`,
      );
      if (report.inspection)
        steps.push(
          "Summarize the inspection in the handoff: its changes, discarded edits, and the operations that run trusted scripts with the user's access to the host, environment, and network. Answer `inspection` with the current identity without asking for approval; the run starts only that inspection.",
        );
      steps.push(
        "Decide the answers from each question's context and choices, and record your decisions and reasons in the handoff. Choose the proposed newest stable version unless the maintainer requested another. Choose the profile from its descriptions, the request, and repository evidence; ask the maintainer only when these do not settle it.",
      );
      if ([...ids].some((id) => id.startsWith("scope:")))
        steps.push(
          "For each scope answer, judge the candidates against the discovery guidance above, inspecting the real project, not only its inventory. Explain exclusions such as fixtures and generated output, and resolve membership questions from project evidence, with reasons, without asking. An explained empty scope is valid.",
        );
      if (ids.has("confirmation"))
        steps.push(
          "Review each discarded edit with its diff, or its current content where there is none. A new run starts from a clean, committed tree, so Git can restore it. Answer `confirmation` with the inspection identity after your review, without asking. List each discarded edit with its diff or current content in the handoff.",
        );
      if (ids.has("remote-setup"))
        steps.push(
          "Answer `defer` for remote setup that is not ready, without asking: it changes nothing remotely, and every later run applies it once ready. Report each reason, such as a missing tool, sign-in, or role, in the handoff.",
        );
      if (report.blockers.length)
        steps.push(
          "Resolve each blocker above with the maintainer before the run can start.",
        );
      steps.push(
        `Run ${again}. It names any missing answers, asks the questions your answers raise, such as discovery once a profile is chosen, and starts the run once none remain.`,
      );
      break;
    case "blocked":
      if (report.run)
        steps.push(
          `The run stopped before writing anything: ${reason} Resolve it with the maintainer.`,
        );
      else if (report.blockers.length)
        steps.push(
          "Resolve each blocker above with the maintainer; adoption writes nothing until they are resolved.",
        );
      else
        steps.push(
          "Answer `remote-setup` with `defer` for setup that is not ready, without asking; it changes nothing remotely, and every later run applies it once ready. Report each reason in the handoff.",
        );
      steps.push(`Run ${again}.`);
      break;
    case "contextual":
      if (scoped) steps.push(scopeStep);
      if (report.failedChecks?.length)
        steps.push(
          "The checks above failed. Correct the content so that it satisfies the rules they cite, and renew each affected assessment.",
        );
      else if (reason.startsWith("CONTEXTUAL_REQUIRED:"))
        steps.push(
          "The run installed exact content and ran fixes. Its contextual work above is yours.",
        );
      else if (reason.startsWith("ASSESSMENT_SCOPE:"))
        steps.push(
          `The run did not accept the assessment: ${reason} Undo each named change in place, keeping your work on the allowed targets; nothing else needs correcting.${scoped ? " When a named path belongs in a discovered declaration's scope, change that scope answer instead, as above." : ""}`,
        );
      else
        steps.push(
          `The run did not accept the assessment: ${reason} Correct the answers or the content.`,
        );
      steps.push(
        "For each declaration, read its rules and adoption guidance and the real project files you need, then edit only its allowed targets so that they satisfy the rules. A directory target allows everything beneath it. Preserve project facts, exact content, skills, excluded content, and unrelated work.",
        "Keep the answers file outside the project, and notes outside it or in `.repo-standards/local/`; any other new file is an observed change.",
        "When the guidance needs work outside the allowed targets, or facts the project does not support, leave it undone and answer that assessment `blocked`, explaining the decision the maintainer needs to make.",
      );
      if (report.contextual?.some((entry) => entry.discovery))
        steps.push(
          "For a discovered declaration, recheck coverage against the project as fixes left it, and again before running adopt. Never write a file outside the confirmed scope: answer that scope review `blocked` with its `additionalPaths`.",
        );
      steps.push(
        "Answer each assessment with your own judgment, separate from check results: a passing check alone does not show that the content is useful.",
        `Run ${again}. It refreshes the work request, submits the assessments, and runs the checks. Leave the project unchanged until it returns.`,
      );
      break;
    case "complete":
      steps.push(
        "Review every output before the maintainer commits it: run `git --no-optional-locks diff --no-ext-diff --no-textconv --binary` and `git --no-optional-locks ls-files --others --exclude-standard -z`, and read each new file's complete content. A list of names or hashes is not a review.",
        "Leave the changes uncommitted and unstaged, and keep review artifacts outside the project.",
        `Report script outcomes and your assessments separately. ${invoke("status")} says whether the run is ready to commit, and ${invoke("status --summary")} renders its adoption record. The ready-to-commit verdict describes the uncommitted changes. Record it before committing: once the changes are committed, status reports them not ready.`,
        "Do not commit; hand the changes to the maintainer for review and their project's normal workflow. Run adopt again later to update the selection.",
      );
      break;
    case "incomplete":
      if (scoped) steps.push(scopeStep);
      if (reason.startsWith("SCOPE_INCOMPLETE:") && scoped) {
        // The scope answers are the recovery.
      } else if (
        /^(ASSESSMENT_SCOPE|OPERATION_SCOPE|CHECK_MUTATION):/.test(reason)
      )
        steps.push(
          `Read ${invoke("status")} and explain the run's reason and actual changes to the maintainer. Restore each path the reason names to its state before the run: remove a file the run added, or restore an edited file's committed content. A restored path no longer stops the run.`,
          `Only on the maintainer's explicit instruction, run ${invoke("resume --retry")}, which repeats trusted operations and needs renewed assessments, then ${again}. An operation that writes the path again stops the run again.`,
        );
      else
        steps.push(
          `Read ${invoke("status")} and explain the run's phase, reason, actual changes, and completed and uncertain work to the maintainer. While execution is active, wait for it; stop a surviving process only on their instruction.`,
          `Run ${invoke("resume --retry")}: its trusted operations are repeat-safe, so retry without asking, renew the assessments, then ${again}. Record the retry in the handoff. Abandon only on the maintainer's instruction with ${invoke("abandon")}, which keeps the project content and archives the run's report.`,
        );
      break;
  }
  return { ...report, nextSteps: steps };
}

// A command argument as a shell reads it back verbatim.
function shellArgument(value: string) {
  return /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

// A fence longer than any backtick run in its content.
function fenced(content: string, language = "") {
  const longest = Math.max(
    2,
    ...[...content.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(longest + 1);
  return `${fence}${language}\n${content}${content.endsWith("\n") ? "" : "\n"}${fence}`;
}

// The version questions whose source's releases could not be read, so their
// proposal is the current version. The Markdown report says so next to the
// selection; the JSON report keeps its shape and carries it in the context.
const unreadReleases = new WeakSet<Question>();

const statements: Record<AdoptReport["outcome"], string> = {
  "answers-required":
    "The adoption needs answers. Nothing was changed by this command.",
  blocked: "The adoption cannot start yet. Nothing was changed.",
  contextual: "The run waits for contextual work and its assessment.",
  complete: "The adoption is complete. Its changes are uncommitted.",
  incomplete: "The run is incomplete; follow the recovery steps below.",
};

// The report as Markdown for the agent: what it asks, what to read, the
// answers file, and the next steps.
export function adoptSummary(report: AdoptReport) {
  const parts = [
    "# Repository Standards adoption",
    report.outcome === "answers-required" && report.run
      ? "The run waits for the maintainer's decision on a fix's overwrite."
      : statements[report.outcome],
  ];
  const { selection } = report;
  const questions = new Map(
    report.answers.questions.map((question) => [question.id, question]),
  );
  const version = questions.get("version");
  parts.push(
    section(
      "Selection",
      [
        table(
          ["Component", "Value"],
          [
            ["CLI", code(`${packageName}@${selection.cli}`)],
            ["Source", code(selection.source)],
            [
              "Version",
              selection.version ? code(selection.version) : "unanswered",
            ],
            [
              "Profile",
              selection.profile ? code(selection.profile) : "unanswered",
            ],
          ],
        ),
        ...(version && unreadReleases.has(version)
          ? [text(version.context)]
          : []),
      ].join("\n\n"),
    ),
  );
  if (report.missing.length)
    parts.push(
      section(
        "Missing answers",
        report.missing
          .map((id) => `- ${code(id)}: ${text(questions.get(id)!.question)}`)
          .join("\n"),
      ),
    );
  if (report.blockers.length)
    parts.push(
      section(
        "Blockers",
        table(
          ["Code", "Path", "Message"],
          report.blockers.map((blocker) => [
            code(blocker.code),
            blocker.path === undefined ? "" : code(blocker.path),
            text(blocker.message),
          ]),
        ),
      ),
    );
  if (report.run)
    parts.push(
      section(
        "Run",
        table(
          ["Run", "Phase", "Reason"],
          [[code(report.run.id), report.run.phase, text(report.run.reason)]],
        ),
      ),
    );
  if (report.failedChecks?.length)
    parts.push(
      section(
        "Failed checks",
        table(
          ["Declaration", "Check", "Message"],
          report.failedChecks.map((check) => [
            code(check.declaration),
            code(check.id),
            text(check.message),
          ]),
        ),
      ),
    );
  // The inspection summary, one heading level down.
  if (report.inspection)
    parts.push(report.inspection.summary.replace(/^(#+) /gm, "#$1 ").trimEnd());
  if (report.discarded?.length)
    parts.push(
      section(
        "Discarded edits",
        report.discarded
          .map((entry) =>
            [
              `### ${code(entry.target)}`,
              ...entry.files.map((changed) =>
                changed.diff !== undefined
                  ? fenced(changed.diff, "diff")
                  : `${code(changed.path)}: ${changed.binary ? "binary content" : "content"} is replaced.`,
              ),
              ...(entry.files.length
                ? []
                : [
                    `The run replaces it whole with ${text(entry.replacement ?? "its candidate content")}. The inspection reports no file diff for it: review its current content in the project and include it in the handoff.`,
                  ]),
            ].join("\n\n"),
          )
          .join("\n\n"),
      ),
    );
  if (report.discovery?.length)
    parts.push(
      section(
        "Discovery guidance",
        report.discovery
          .map((entry) =>
            [
              `### ${code(entry.id)}`,
              `Discovery guidance, ${code(entry.discovery.path)}:`,
              fenced(entry.discovery.content, "markdown"),
              `Adoption guidance, ${code(entry.guidance.path)}:`,
              fenced(entry.guidance.content, "markdown"),
            ].join("\n\n"),
          )
          .join("\n\n"),
      ),
    );
  if (report.contextual?.length)
    parts.push(
      section(
        "Contextual work",
        report.contextual
          .map((entry) =>
            [
              `### ${code(entry.id)}`,
              `Allowed targets: ${[...entry.allowedTargets.paths, ...entry.allowedTargets.directories.map((directory) => `${directory}/`)].map(code).join(", ") || "none"}.`,
              ...(entry.rules
                ? [
                    `Rules, ${code(entry.rules.path)}:`,
                    fenced(entry.rules.content, "markdown"),
                  ]
                : ["No installed rules."]),
              `Adoption guidance, ${code(entry.guidance.path)}:`,
              fenced(entry.guidance.content, "markdown"),
              ...(entry.discovery
                ? [
                    `Discovery guidance, ${code(entry.discovery.path)}:`,
                    fenced(entry.discovery.content, "markdown"),
                  ]
                : []),
            ].join("\n\n"),
          )
          .join("\n\n"),
      ),
    );
  if (report.answers.questions.length)
    parts.push(
      section(
        "Answers file",
        fenced(JSON.stringify(report.answers, null, 2), "json"),
      ),
    );
  parts.push(
    section(
      "Next steps",
      report.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
    ),
  );
  return parts.join("\n\n") + "\n";
}
