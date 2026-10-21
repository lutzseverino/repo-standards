// The text the action writes: the rolling pull request's title and the
// Impact and Migration sections of a breaking one, the rolling issue, and the
// comments that close a rolling item. Each is a pure function of its input.

export const branch = "repo-standards/update";
export const issueMarker = "<!-- repo-standards:rolling-update";
const cliReleases = "https://github.com/lutzseverino/repo-standards/releases";
const pinnedCli = ".repo-standards/runtime/node_modules/.bin/repo-standards";

// A selection's two pins.
export interface Pins {
  cli: string;
  standards: string;
}

// The parts of the `adopt --headless --json` report the action reads.
export interface HeadlessReport {
  outcome: string;
  missing?: string[];
  blockers?: { code: string; message: string }[];
  inspection?: { summary: string };
  run?: { id: string; phase: string; reason: string };
  contextual?: { id: string }[];
  failedChecks?: { declaration: string; id: string; message: string }[];
  deferred?: { declaration: string; id: string; reason: string }[];
  answers?: { questions?: { id: string; question: string; answer: unknown }[] };
}

// Why an update ends in the rolling issue instead of a pull request.
export type Stop =
  | { kind: "stopped" }
  | { kind: "agent"; exit: number | null; reasons: string[] }
  | { kind: "not-ready"; reasons: string[] }
  | { kind: "push"; reason: string };

function semver(version: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  return match ? match.slice(1, 4).map(Number) : null;
}

// Whether a pin's move may break under SemVer: a new major version, or a new
// minor version of a 0.x pin. A version that is not SemVer counts as one.
export function breakingMove(from: string, to: string) {
  const before = semver(from);
  const after = semver(to);
  if (!before || !after) return "a version that is not SemVer";
  if (before[0] !== after[0]) return "a new major version";
  if (before[0] === 0 && before[1] !== after[1])
    return "a new minor version of a 0.x release, which SemVer allows to break";
  return null;
}

// Whether `version` is at or past `reached`.
export function reaches(reached: string, version: string) {
  const a = semver(reached);
  const b = semver(version);
  if (!a || !b) return reached === version;
  for (let index = 0; index < 3; index++)
    if (a[index] !== b[index]) return a[index]! > b[index]!;
  return true;
}

// The source by the repository name in its URL.
export function sourceName(source: string) {
  const name = source.replace(/\/+$/, "").split("/").pop() ?? source;
  return name.replace(/\.git$/, "");
}

export function pullRequestTitle(source: string, to: Pins, breaking: boolean) {
  return `chore${breaking ? "!" : ""}: adopt ${sourceName(source)} ${to.standards} with CLI ${to.cli}`;
}

export function issueTitle(source: string, to: Pins) {
  return `Finish the Repository Standards update to ${sourceName(source)} ${to.standards} with CLI ${to.cli}`;
}

// The first line of the inspection summary's Update class section, such as
// "Exact update: …" or "Contextual update: 2 declarations differ …".
export function updateClass(report: HeadlessReport) {
  const summary = report.inspection?.summary ?? "";
  return /^## Update class\n\n(.+)$/m.exec(summary)?.[1] ?? null;
}

function inline(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}

function code(value: string) {
  const fence = "`".repeat(
    Math.max(0, ...[...value.matchAll(/`+/g)].map((run) => run[0].length)) + 1,
  );
  const padded = /^`|`$/.test(value) ? ` ${value} ` : value;
  return `${fence}${padded}${fence}`;
}

function deferredLine(report: HeadlessReport) {
  const deferred = report.deferred ?? [];
  return deferred.length
    ? `It defers remote setup, which the next local \`adopt\` applies once its probe is ready: ${deferred
        .map((fix) => code(`${fix.declaration}/${fix.id}`))
        .join(", ")}.`
    : "It defers no remote setup.";
}

// What the adopter must do: the update class and the deferred remote setup.
function adopterAction(report: HeadlessReport) {
  const updateLine = updateClass(report);
  return [updateLine, deferredLine(report)].filter(Boolean).join(" ");
}

function moves(from: Pins, to: Pins, source: string) {
  return [
    ["The CLI pin", from.cli, to.cli],
    [`The ${sourceName(source)} standards pin`, from.standards, to.standards],
  ].map(([name, before, after]) => {
    const breaking = breakingMove(before!, after!);
    return before === after
      ? `${name} stays at ${code(after!)}.`
      : `${name} moves from ${code(before!)} to ${code(after!)}${breaking ? `, ${breaking}` : ""}.`;
  });
}

// The Impact and Migration sections a breaking pull request's record carries,
// unless the record already renders its own.
export function breakingSections(
  record: string,
  source: string,
  from: Pins,
  to: Pins,
  report: HeadlessReport,
) {
  if (/^## Impact$/m.test(record) && /^## Migration$/m.test(record)) return "";
  const notes = [
    from.cli !== to.cli ? `[CLI releases](${cliReleases})` : null,
    from.standards !== to.standards
      ? `[${sourceName(source)} releases](${source.replace(/\/+$/, "")}/releases)`
      : null,
  ].filter(Boolean);
  const deferred = (report.deferred ?? []).length > 0;
  return [
    "",
    "## Impact",
    "",
    [...moves(from, to, source), adopterAction(report)].join(" "),
    "",
    "## Migration",
    "",
    `Before merging, read the release notes at ${notes.join(" and ")} for any change that needs action beyond this update.${
      deferred
        ? " After merging, run the pinned `adopt` in a clean checkout to apply the deferred remote setup:"
        : " Nothing else needs to run after merging."
    }`,
    ...(deferred ? ["", "```sh", `${pinnedCli} adopt`, "```"] : []),
    "",
  ].join("\n");
}

function openQuestions(report: HeadlessReport) {
  const questions = new Map(
    (report.answers?.questions ?? []).map((question) => [
      question.id,
      question,
    ]),
  );
  return [
    ...(report.missing ?? []).map((id) => {
      const question = questions.get(id);
      const proposed =
        question && question.answer !== null && question.answer !== undefined;
      return `- ${code(id)}${question ? `: ${inline(question.question)}` : ""}${
        proposed ? " A prefilled proposal awaits review." : ""
      }`;
    }),
    ...(report.blockers ?? []).map(
      (blocker) =>
        `- Blocker ${code(blocker.code)}: ${inline(blocker.message)}`,
    ),
    ...(report.contextual ?? []).map(
      (declaration) =>
        `- Contextual work for ${code(declaration.id)} awaits its assessment.`,
    ),
    ...(report.failedChecks ?? []).map(
      (check) =>
        `- Failed check ${code(`${check.declaration}/${check.id}`)}: ${inline(check.message)}`,
    ),
  ];
}

function problem(stop: Stop, report: HeadlessReport, update: string) {
  const reasons = (list: string[]) =>
    list.length
      ? `\n\n${list.map((reason) => `- ${inline(reason)}`).join("\n")}`
      : "";
  switch (stop.kind) {
    case "stopped":
      return `The headless ${update} stopped with outcome ${code(report.outcome)}: it needs answers or decisions that only an agent or a person can give.`;
    case "agent":
      return `The headless ${update} stopped with outcome ${code(report.outcome)}, and the agent command, which exited ${stop.exit ?? "on a signal"}, did not leave it ready to commit.${reasons(stop.reasons)}`;
    case "not-ready":
      return `The headless ${update} completed, but \`status\` does not report it ready to commit.${reasons(stop.reasons)}`;
    case "push":
      return `The headless ${update} completed, but pushing the rolling branch ${code(branch)} was refused:\n\n\`\`\`text\n${stop.reason.replace(/`{3,}/g, "``")}\n\`\`\`\n\nA \`GITHUB_TOKEN\` can't push changes to \`.github/workflows/\` files; a GitHub App installation token granted workflow-file permission can.`;
  }
}

export function issueBody(input: {
  source: string;
  from: Pins;
  to: Pins;
  base: string;
  stop: Stop;
  report: HeadlessReport;
}) {
  const { source, from, to, base, stop, report } = input;
  const update = `update of \`${base}\` to ${sourceName(source)} ${code(to.standards)} with CLI ${code(to.cli)}`;
  const questions = stop.kind === "push" ? [] : openQuestions(report);
  const run = report.run;
  return [
    "### Problem",
    "",
    problem(stop, report, update),
    "",
    "### Desired outcome",
    "",
    `The default branch's selection reaches CLI ${code(to.cli)} and ${sourceName(source)} ${code(to.standards)}. ${
      stop.kind === "push"
        ? "Give the action's token permission to push this change, then close this issue and run the action's workflow again, or"
        : "To have the action try this release again, such as after changing its agent command, close this issue and run its workflow again. Otherwise,"
    } in a clean checkout of \`${base}\`, run \`npx --yes @lutzseverino/repo-standards@${to.cli} adopt --json\`, follow what it prints, and open the adoption pull request. This issue closes once the update lands on \`${base}\`, or a newer release replaces it.`,
    "",
    "### Additional context",
    "",
    moves(from, to, source).join(" "),
    "",
    `Adopter action: ${adopterAction(report)}`,
    ...(questions.length ? ["", "Open questions:", "", ...questions] : []),
    ...(run && stop.kind !== "push"
      ? [
          "",
          `The run ${code(run.id)} stopped in phase ${code(run.phase)}: ${inline(run.reason)}`,
        ]
      : []),
    "",
    `${issueMarker} ${JSON.stringify(to)} -->`,
    "",
  ].join("\n");
}

// The target a rolling issue records in its marker.
export function issueTarget(body: string): Pins | null {
  const start = body.indexOf(issueMarker);
  if (start < 0) return null;
  const json = /^\s*(\{[^\n]*?\})\s*-->/.exec(
    body.slice(start + issueMarker.length),
  )?.[1];
  try {
    const value = JSON.parse(json ?? "null") as Partial<Pins> | null;
    return typeof value?.cli === "string" && typeof value.standards === "string"
      ? { cli: value.cli, standards: value.standards }
      : null;
  } catch {
    return null;
  }
}

// The pins a `.repo-standards/selection.yaml` records.
export function selectionPins(yaml: string): Pins | null {
  const pins: Partial<Pins> = {};
  let section = "";
  for (const line of yaml.split("\n")) {
    const top = /^([A-Za-z]+):/.exec(line);
    if (top) section = top[1]!;
    const version = /^\s+version:\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
    if (version && (section === "cli" || section === "standards"))
      pins[section] = version[1]!;
  }
  return pins.cli && pins.standards
    ? { cli: pins.cli, standards: pins.standards }
    : null;
}

export function landedComment(to: Pins, base: string) {
  return `The update to CLI ${code(to.cli)} and standards ${code(to.standards)} has landed on \`${base}\`, so this is closed.`;
}

export function supersededComment(successor: string) {
  return `Superseded by ${successor}, which carries the newest Repository Standards update.`;
}
