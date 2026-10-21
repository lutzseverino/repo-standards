import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  adopt,
  type AdoptOptions,
  type AdoptReport,
  type Answers,
  type Question,
} from "./adopt.js";
import { projectRoot } from "./adoption-files.js";
import { abandon, resume } from "./adoption.js";
import type { Judgment, ScopeReview } from "./assessment.js";
import { checkContextual } from "./check.js";
import { ProductError } from "./errors.js";
import { record } from "./records.js";
import type { Candidate } from "./scope.js";
import { reuseReason } from "./summary.js";

// Guided adoption in a terminal: adopt asks a person the questions an answers
// file holds, one stage at a time with each default proposed, then walks each
// contextual declaration. It shows the declaration's rules and adoption
// guidance, waits while the person edits, runs its checks, and asks whether it
// is done, or blocked with a reason; the assessment is written from those
// answers. Before a run starts nothing is written, and once it has, the run
// holds everything, so running adopt again after an interruption continues
// where the run stopped. A run stopped for its scope is replaced in place
// once the person changes the scope.

export interface Terminal {
  write: (text: string) => void;
  // The line the person typed, as typed. It fails with INTERRUPTED when they
  // interrupt or end the input.
  ask: (prompt: string) => Promise<string>;
}

// The process's own terminal. Each question opens the input only while it
// waits, so an interruption during a run's operations stops the process as
// it does for every other command.
export function processTerminal(): Terminal {
  return {
    write: (text) => {
      process.stdout.write(text);
    },
    ask: async (prompt) => {
      const lines = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const interrupted = new AbortController();
      lines.on("SIGINT", () => interrupted.abort());
      lines.on("close", () => interrupted.abort());
      try {
        return await lines.question(prompt, { signal: interrupted.signal });
      } catch {
        process.stdout.write("\n");
        throw new ProductError(
          "INTERRUPTED",
          "adopt was interrupted. Run it again to continue where it stopped.",
        );
      } finally {
        lines.close();
      }
    },
  };
}

const pinnedCli = ".repo-standards/runtime/node_modules/.bin/repo-standards";
const editing =
  "Edit the files now. Press Enter when you are done, or type blocked: ";
const fixing = "Fix it, then press Enter to check again, or type blocked: ";
// The inspection blockers a listed scope file can cause, such as a directory
// listed as a file; other blockers on it, such as its Git index state, are
// resolved outside adopt.
const scopeBlockers = [
  "TARGET_TYPE",
  "UNSAFE_TARGET",
  "CASE_CONFLICT",
  "TARGET_OVERLAP",
  "RESERVED_TARGET",
];
// The codes with which inspection rejects a scope entry or its paths.
const scopeRejections = [
  "INVALID_SCOPE",
  "UNSAFE_PATH",
  "RESERVED_TARGET",
  "TARGET_OVERLAP",
  "CASE_CONFLICT",
  "UNSAFE_TARGET",
  "OBSERVATION_UNSAFE",
];

// A contextual declaration, and whether its confirmed scope is no scope, as
// its assessment question names it.
type Contextual = NonNullable<AdoptReport["contextual"]>[number] & {
  noScope?: boolean;
};
// A judgment adopt writes; the question names its declaration.
type Answer = Omit<Judgment, "id">;
interface Session {
  root: string;
  cliVersion: string;
}

// The ways adopt asks a person through a terminal.
type Prompts = ReturnType<typeof prompts>;
function prompts({ write, ask: line }: Terminal) {
  // An answer, without the spaces around it.
  const ask = async (prompt: string) => (await line(prompt)).trim();
  // One of the choices, or the fallback when the person types nothing.
  const choose = async <T extends string>(
    prompt: string,
    choices: Record<string, T>,
    fallback?: T,
  ) => {
    for (;;) {
      const typed = (await ask(prompt)).toLowerCase();
      if (!typed && fallback) return fallback;
      const chosen = Object.hasOwn(choices, typed) ? choices[typed] : undefined;
      if (chosen) return chosen;
      write(`Type ${Object.keys(choices).join(", ")}.\n`);
    }
  };
  return {
    write,
    ask,
    choose,
    // A line the person must not leave empty.
    required: async (prompt: string) => {
      for (;;) {
        const typed = await ask(prompt);
        if (typed) return typed;
      }
    },
    yes: async (prompt: string, fallback: "yes" | "no") =>
      (await choose(
        prompt,
        { y: "yes", yes: "yes", n: "no", no: "no" },
        fallback,
      )) === "yes",
    // Paths, one per line as typed, since a path may begin or end with a
    // space or be only spaces; an empty line ends them.
    paths: async (prompt: string) => {
      const paths: string[] = [];
      for (;;) {
        const typed = await line(prompt);
        if (!typed) return [...new Set(paths)];
        paths.push(typed);
      }
    },
    // One of the names, or the proposed one when the person types nothing.
    // A name may begin or end with a space, so the line as typed is a name
    // before its trimmed form is; a name no line can hold, such as one with a
    // line break, is chosen by its number in the list.
    named: async (label: string, proposed: string | null, names: string[]) => {
      for (;;) {
        const typed = await line(
          `${label}${proposed ? ` [${proposed}]` : ""}: `,
        );
        const number = /^\s*([1-9][0-9]*)\s*$/.exec(typed)?.[1];
        const name = names.includes(typed)
          ? typed
          : names.includes(typed.trim())
            ? typed.trim()
            : number && Number(number) <= names.length
              ? names[Number(number) - 1]!
              : typed.trim() || proposed;
        if (name && names.includes(name)) return name;
        if (name) write(`Choose one of: ${names.join(", ")}.\n`);
      }
    },
  };
}

export async function adoptInTerminal(
  options: AdoptOptions,
  cliVersion: string,
  terminal: Terminal,
): Promise<AdoptReport["outcome"]> {
  const prompt = prompts(terminal);
  const { write } = prompt;
  const session = { root: projectRoot(options.project), cliVersion };
  const answers: Answers = new Map();
  // This session's judgments, kept for declarations a later walk skips.
  const judged = new Map<string, Answer>();
  // The session's reviews of each discovered scope as the run's fixes left
  // the project, kept for a renewed assessment.
  const reviewedAfterFixes = new Map<string, ScopeReview>();
  // A retry runs the fixes again and renews the work request, so the
  // session's scope reviews and judgments are asked again.
  const renew = () => {
    reviewedAfterFixes.clear();
    judged.clear();
  };
  let presented: string | undefined;
  let submitted = false;
  // The reused answers already shown: reused answers are shown, not asked.
  const shown = new Set<string>();

  write("Repository Standards adoption\n");
  write("An agent runs adopt with --json to get the answers-file template.\n");
  for (;;) {
    let report: AdoptReport;
    try {
      report = await adopt(options, cliVersion, answers);
    } catch (error) {
      // A scope answer inspection rejects is asked again.
      const scopes = [...answers.keys()].filter((id) =>
        id.startsWith("scope:"),
      );
      if (
        !(error instanceof ProductError) ||
        !scopeRejections.includes(error.code) ||
        !scopes.length
      )
        throw error;
      write(`\n${error.message}\nAnswer the scope questions again.\n`);
      for (const id of scopes) answers.delete(id);
      continue;
    }
    // Answers that advance a run apply once, and a started run holds its
    // scope, which only a changed answer replaces.
    for (const id of answers.keys())
      if (
        id.startsWith("assessment:") ||
        id.startsWith("fix:") ||
        (report.run && id.startsWith("scope:"))
      )
        answers.delete(id);
    // A blocker on a file the person included in a scope, such as a
    // directory listed as a file, asks the scope questions again.
    const included = [...answers].flatMap(([id, answer]) =>
      id.startsWith("scope:")
        ? (record(answer).candidates as Candidate[])
            .filter((candidate) => candidate.decision === "include")
            .map((candidate) => candidate.path)
        : [],
    );
    const rejected = report.run
      ? []
      : report.blockers.filter(
          (blocker) =>
            scopeBlockers.includes(blocker.code) &&
            blocker.path !== undefined &&
            included.includes(blocker.path),
        );
    if (rejected.length) {
      write(
        `\nInspection rejects the scope:\n${rejected.map((blocker) => `- ${blocker.code} ${blocker.path}: ${blocker.message}\n`).join("")}Answer the scope questions again.\n`,
      );
      for (const id of answers.keys())
        if (id.startsWith("scope:")) answers.delete(id);
      continue;
    }
    for (const answer of report.reused)
      if (!shown.has(answer.id)) {
        shown.add(answer.id);
        write(
          `\nReusing the last complete adoption's answer to ${answer.id}: ${reuseReason(answer)}\n`,
        );
      }
    const reason = report.run?.reason ?? "";
    switch (report.outcome) {
      case "answers-required": {
        if (report.run) {
          const [question] = report.answers.questions;
          const { fix, identity } = record(question!.details) as {
            fix: string;
            identity: string;
          };
          write(`\nFix ${fix} stopped the run: ${reason}\n`);
          const choice = await prompt.choose(
            "Overwrite the setting, defer the fix, or stop? [overwrite/defer/stop]: ",
            { overwrite: "overwrite", defer: "defer", stop: "stop" },
          );
          if (choice === "overwrite") {
            answers.set(question!.id, identity);
            write("Running the fix again, allowed to overwrite.\n");
            continue;
          }
          if (choice === "defer") {
            answers.set(question!.id, "defer");
            write(
              "Deferring the fix: the run records it as deferred and continues with the next fix. Every later run runs it again.\n",
            );
            continue;
          }
          write(
            "The run stays stopped at this fix. Run adopt again to overwrite the setting or defer the fix.\n",
          );
          return report.outcome;
        }
        if (report.blockers.length) {
          showBlockers(prompt, report);
          return report.outcome;
        }
        const asked = report.answers.questions.filter((question) =>
          report.missing.includes(question.id),
        );
        if (!asked.length) return report.outcome;
        // Scope answers change the inspection the remaining questions are
        // about, so they come first.
        const scopes = asked.filter((question) =>
          question.id.startsWith("scope:"),
        );
        if (scopes.length) {
          for (const question of scopes)
            answers.set(
              question.id,
              await askScope(prompt, session.root, question, report),
            );
          continue;
        }
        if (report.inspection && presented !== report.inspection.identity) {
          write(`\n${report.inspection.summary.trimEnd()}\n`);
          presented = report.inspection.identity;
        }
        for (const question of asked) {
          const answer = await askSelection(prompt, question, report);
          if (answer === undefined) {
            write("Nothing was changed.\n");
            return report.outcome;
          }
          answers.set(question.id, answer);
          if (answer === "resolve") {
            write(
              "Nothing was changed. Resolve the remote setup that is not ready, then run adopt again.\n",
            );
            return "blocked";
          }
        }
        continue;
      }
      case "blocked":
        if (report.run)
          write(`\nThe run stopped before writing anything: ${reason}\n`);
        else if (report.blockers.length) showBlockers(prompt, report);
        else
          write(
            "\nNothing was changed. Resolve the remote setup that is not ready, then run adopt again.\n",
          );
        return report.outcome;
      case "contextual": {
        // A run's confirmed scope never changes, so walking it again cannot
        // help; a changed scope replaces the run.
        if (reason.startsWith("SCOPE_INCOMPLETE:")) {
          const outcome = await decide(
            prompt,
            session,
            reason,
            renew,
            report,
            answers,
          );
          if (outcome) return outcome;
          continue;
        }
        if (submitted && reason.startsWith("ASSESSMENT_BLOCKED:")) {
          const blocked = [...judged].filter(
            ([, judgment]) => judgment.status === "blocked",
          );
          write(
            `\nThe run is incomplete. Blocked: ${blocked.map(([id, judgment]) => `${id}: ${judgment.explanation}`).join("; ")}\n`,
          );
          if (
            scopeQuestions(report).length &&
            (await prompt.choose(
              "Change the scope and adopt again in place, or stop? [scope/stop]: ",
              { scope: "scope", stop: "stop" },
            )) === "scope"
          ) {
            await changeScope(prompt, session, report, answers);
            renew();
            submitted = false;
            continue;
          }
          write("Resolve it, then run adopt again to continue.\n");
          return report.outcome;
        }
        const declarations: Contextual[] = report.contextual!.map(
          (declaration) => ({
            ...declaration,
            noScope: report.answers.questions.some(
              (question) =>
                question.id === `assessment:${declaration.id}` &&
                (question.details as { noScope?: unknown } | undefined)
                  ?.noScope === true,
            ),
          }),
        );
        const failed = report.failedChecks ?? [];
        // A reused assessment keeps the recorded judgment and is walked only
        // when one of its checks failed.
        const reused = new Set(
          report.reused
            .filter((answer) => answer.kind === "assessment")
            .map((answer) => answer.id.slice("assessment:".length)),
        );
        for (const { id } of declarations)
          if (reused.has(id) && !judged.has(id))
            judged.set(
              id,
              report.answers.questions.find(
                (question) => question.id === `assessment:${id}`,
              )!.answer as Answer,
            );
        let walk = declarations.filter(
          ({ id }) =>
            !reused.has(id) || failed.some((check) => check.declaration === id),
        );
        if (reason.startsWith("CHECKS_FAILED:")) {
          write("\nThe run's checks failed after the assessment.\n");
          // Contextual work cannot fix the checks of other declarations: the
          // person resolves them, and the same assessment runs every check
          // again.
          const elsewhere = failed.filter(
            (check) => !declarations.some(({ id }) => id === check.declaration),
          );
          if (elsewhere.length) {
            write(
              `${elsewhere.map((check) => `Failed: ${check.declaration}/${check.id}: ${check.message}\n`).join("")}These checks are not of contextual work, which cannot change what they check.\n`,
            );
            if (
              (await prompt.choose(
                "Resolve them, then press Enter to run every check again, or type stop: ",
                { stop: "stop" },
                "again",
              )) === "stop"
            ) {
              write(
                `Read ${pinnedCli} status, resolve them, then run adopt again.\n`,
              );
              return report.outcome;
            }
          }
          walk = walk.filter(
            ({ id }) =>
              !judged.has(id) ||
              failed.some((check) => check.declaration === id),
          );
        } else if (!reason.startsWith("CONTEXTUAL_REQUIRED:")) {
          write(`\nThe run did not accept the last assessment: ${reason}\n`);
          // The rejected answers may hold the cause, such as a path the
          // assessment refuses, so the scope is reviewed again.
          reviewedAfterFixes.clear();
        }
        // Each discovered scope is reviewed as the run's fixes left the
        // project, before any contextual edit. An incomplete confirmed scope
        // stops the run, so nothing more is asked once one is reported.
        let incomplete: string | undefined;
        // A reused assessment keeps its recorded scope reviews too.
        const kept = (id: string) =>
          reused.has(id) && !walk.some((entry) => entry.id === id);
        for (const declaration of declarations) {
          if (!declaration.discovery || incomplete || kept(declaration.id))
            continue;
          let review = reviewedAfterFixes.get(declaration.id);
          if (!review) {
            write(
              `\nThe confirmed scope of ${declaration.id}, as the run's fixes left the project.\n`,
            );
            review = await reviewScope(
              prompt,
              declaration,
              declaration.noScope
                ? `Before any contextual edit, does no project file belong in the scope of ${declaration.id}? [Y/n]: `
                : `Before any contextual edit, does it cover every file ${declaration.id} should? [Y/n]: `,
              "after the run's fixes",
            );
            reviewedAfterFixes.set(declaration.id, review);
          }
          if (review.status === "blocked") incomplete = declaration.id;
        }
        // A declaration with no scope has no contextual work: only its
        // scope reviews judge it.
        if (!incomplete)
          for (const declaration of walk)
            if (declaration.noScope)
              judged.set(
                declaration.id,
                withoutScope(
                  declaration,
                  reviewedAfterFixes.get(declaration.id)!,
                ),
              );
        const working = walk.filter((declaration) => !declaration.noScope);
        if (!incomplete)
          for (const [index, declaration] of working.entries())
            judged.set(
              declaration.id,
              await walkDeclaration(
                prompt,
                session,
                declaration,
                `${index + 1} of ${working.length}`,
                failed.filter((check) => check.declaration === declaration.id),
                reviewedAfterFixes.get(declaration.id),
              ),
            );
        // With all contextual work done, each discovered scope is reviewed
        // as the project now is.
        const reviewedNow = new Set<string>();
        for (const declaration of declarations) {
          if (!declaration.discovery || incomplete || kept(declaration.id))
            continue;
          const judgment = judged.get(declaration.id)!;
          const current = await reviewScope(
            prompt,
            declaration,
            declaration.noScope
              ? `Now that the contextual work is done, does no project file belong in the scope of ${declaration.id}? [Y/n]: `
              : `Now that the contextual work is done, does the confirmed scope of ${declaration.id}, ${targetList(declaration)}, cover every file it should? [Y/n]: `,
            "after the contextual work",
          );
          judged.set(declaration.id, {
            ...judgment,
            scopeValidity: { ...judgment.scopeValidity!, current },
          });
          reviewedNow.add(declaration.id);
          if (current.status === "blocked") incomplete = declaration.id;
        }
        // Once a scope is incomplete, every declaration it stopped is judged
        // blocked, naming it.
        if (incomplete) {
          const stop = incomplete;
          for (const declaration of declarations) {
            const judgment = judged.get(declaration.id);
            const afterFixes = reviewedAfterFixes.get(declaration.id);
            if (declaration.id === stop && afterFixes?.status === "blocked")
              judged.set(declaration.id, {
                status: "blocked",
                explanation: afterFixes.explanation,
                evidence: [
                  "The maintainer reported the confirmed scope incomplete in adopt's terminal walk-through.",
                ],
                scopeValidity: { afterFixes, current: afterFixes },
              });
            else if (!judgment)
              judged.set(
                declaration.id,
                notWalked(declaration, stop, afterFixes),
              );
            else if (declaration.discovery && !reviewedNow.has(declaration.id))
              judged.set(declaration.id, {
                ...judgment,
                scopeValidity: {
                  ...judgment.scopeValidity!,
                  current: unreviewed(stop),
                },
              });
          }
        }
        for (const { id } of declarations)
          answers.set(`assessment:${id}`, judged.get(id));
        submitted = true;
        write("\nSubmitting the assessment and running every check.\n");
        continue;
      }
      case "complete":
        return completed(prompt);
      case "incomplete": {
        const outcome = await decide(
          prompt,
          session,
          reason,
          renew,
          report,
          answers,
        );
        if (outcome) return outcome;
        continue;
      }
    }
  }
}

// A scope review not asked because another declaration's confirmed scope
// is incomplete.
function unreviewed(incomplete: string): ScopeReview {
  return {
    status: "blocked",
    explanation: `Not reviewed: the confirmed scope of ${incomplete} is incomplete, so the run stops.`,
    evidence: [
      `The maintainer reported the scope of ${incomplete} incomplete.`,
    ],
    additionalPaths: [],
  };
}

// The judgment of a declaration with no scope, which has no contextual work
// to walk.
function withoutScope(
  declaration: Contextual,
  afterFixes: ScopeReview,
): Answer {
  return {
    status: "satisfied",
    explanation: `${declaration.id} has no scope, so it has no contextual work.`,
    evidence: [
      "The maintainer confirmed in adopt's terminal walk-through that no project file belongs in its scope.",
    ],
    scopeValidity: { afterFixes, current: afterFixes },
  };
}

// The judgment of a declaration the walk did not reach because a confirmed
// scope is incomplete.
function notWalked(
  declaration: Contextual,
  incomplete: string,
  afterFixes: ScopeReview | undefined,
): Answer {
  const review = unreviewed(incomplete);
  return {
    status: "blocked",
    explanation: `Not walked: the confirmed scope of ${incomplete} is incomplete, so the run stops before this declaration's contextual work.`,
    evidence: [
      `The maintainer reported the scope of ${incomplete} incomplete in adopt's terminal walk-through.`,
    ],
    ...(declaration.discovery
      ? { scopeValidity: { afterFixes: afterFixes ?? review, current: review } }
      : {}),
  };
}

// The answer to a question before the run starts, or undefined when the
// person declines to confirm the discarded edits or to start the run.
async function askSelection(
  { write, choose, yes, named }: Prompts,
  question: Question,
  report: AdoptReport,
): Promise<unknown> {
  switch (question.id) {
    case "version": {
      write(`\n${question.question}\n${question.context}\n`);
      const releases = question.choices as string[] | undefined;
      if (releases)
        write(
          `Stable releases: ${releases.slice(0, 10).join(", ")}${releases.length > 10 ? `, and ${releases.length - 10} more` : ""}.\n`,
        );
      const proposed = question.answer as string | null;
      // Without the release list, the proposed version is the only one.
      return named(
        "Version",
        proposed,
        releases ?? (proposed ? [proposed] : []),
      );
    }
    case "profile": {
      write(`\n${question.question}\n${question.context}\n`);
      const profiles = question.choices as {
        name: string;
        description: string;
      }[];
      for (const [index, { name, description }] of profiles.entries())
        write(`  ${index + 1}. ${name}: ${description}\n`);
      return named(
        "Profile",
        question.answer as string | null,
        profiles.map(({ name }) => name),
      );
    }
    case "platform": {
      write(`\n${question.question}\n${question.context}\n`);
      const platforms = question.choices as string[];
      for (const [index, name] of platforms.entries())
        write(`  ${index + 1}. ${name}\n`);
      return named("Platform", question.answer as string | null, platforms);
    }
    case "remote-setup":
      write("\nRemote setup is not ready:\n");
      for (const entry of question.details as {
        declaration: string;
        id: string;
        reason: string;
      }[])
        write(`- ${entry.declaration}/${entry.id}: ${entry.reason}\n`);
      write(`${question.context}\n`);
      return choose("Defer it, or resolve it first? [defer/resolve]: ", {
        defer: "defer",
        resolve: "resolve",
      });
    case "confirmation":
      write("\nThe run discards these edits:\n");
      for (const entry of report.discarded ?? []) {
        write(`\n${entry.target}:\n`);
        for (const changed of entry.files)
          write(
            changed.diff !== undefined
              ? `${changed.diff}${changed.diff.endsWith("\n") ? "" : "\n"}`
              : `${changed.path}: its ${changed.binary ? "binary " : ""}content is replaced.\n`,
          );
        if (!entry.files.length)
          write(
            `It is replaced whole with ${entry.replacement ?? "its candidate content"}.\n`,
          );
      }
      return (await yes("Discard these edits? [y/N]: ", "no"))
        ? report.inspection!.identity
        : undefined;
    default:
      // The inspection the person is shown, which the run carries out.
      write(
        "\nThe run carries out the inspection above: it installs its changes and runs its operations, trusted scripts with your access to this host, its environment, and the network.\n",
      );
      if (!(await yes("Start the run? [Y/n]: ", "yes"))) return undefined;
      write(
        "Starting the run: it installs the exact content and runs the fixes.\n",
      );
      return question.answer;
  }
}

function completed({ write }: Prompts) {
  write(
    `\nThe adoption is complete. Its changes are uncommitted.\nReview them with git status and git diff, then commit them through the project's normal workflow. ${pinnedCli} status says whether the run is ready to commit, and ${pinnedCli} status --summary renders its adoption record.\n`,
  );
  return "complete" as const;
}

// The scope questions of a run stopped for its scope.
const scopeQuestions = (report: AdoptReport) =>
  report.answers.questions.filter((question) =>
    question.id.startsWith("scope:"),
  );

// The person's new scope for each discovered declaration of a run stopped for
// its scope; the next adopt replaces the run in place with it.
async function changeScope(
  prompt: Prompts,
  { root }: Session,
  report: AdoptReport,
  answers: Answers,
) {
  for (const question of scopeQuestions(report))
    answers.set(question.id, await askScope(prompt, root, question, report));
  prompt.write(
    "Adopting again in place: the run is replaced, its changes stay, and the unchanged selection is inspected with the new scope.\n",
  );
}

// A run that needs the maintainer's decision: a changed scope, which replaces
// a run stopped for its scope in place, a retry of its interrupted work, after
// which the session continues, abandonment, or stopping here. A run's confirmed
// scope never changes, so retrying it cannot help.
async function decide(
  prompt: Prompts,
  session: Session,
  reason: string,
  afterRetry: () => void,
  report: AdoptReport,
  answers: Answers,
) {
  const { root, cliVersion } = session;
  const { write, choose } = prompt;
  write(`\nThe run is incomplete: ${reason}\n`);
  const scope = reason.startsWith("SCOPE_INCOMPLETE:");
  const scoped = scopeQuestions(report).length > 0;
  const choice = scope
    ? scoped
      ? await choose(
          "Change the scope and adopt again in place, abandon the run, or stop? [scope/abandon/stop]: ",
          { scope: "scope", abandon: "abandon", stop: "stop" },
        )
      : await choose("Abandon the run, or stop? [abandon/stop]: ", {
          abandon: "abandon",
          stop: "stop",
        })
    : scoped
      ? await choose(
          "Change the scope and adopt again in place, retry the interrupted work, abandon the run, or stop? [scope/retry/abandon/stop]: ",
          { scope: "scope", retry: "retry", abandon: "abandon", stop: "stop" },
        )
      : await choose(
          "Retry the interrupted work, abandon the run, or stop? [retry/abandon/stop]: ",
          { retry: "retry", abandon: "abandon", stop: "stop" },
        );
  if (choice === "scope") {
    await changeScope(prompt, session, report, answers);
    afterRetry();
    return undefined;
  }
  if (choice === "retry") {
    write("Retrying the run's interrupted work.\n");
    afterRetry();
    const run = await resume(root, cliVersion, undefined, true);
    return run.outcome === "complete" ? completed(prompt) : undefined;
  }
  if (choice === "abandon") {
    abandon(root, cliVersion);
    write(
      `Abandoned the run. Its changes stay in the project, and ${pinnedCli} status shows its report. Run adopt again in this checkout to adopt again in place over them.\n`,
    );
  } else
    write(`Run adopt again to decide, or read ${pinnedCli} status first.\n`);
  return "incomplete" as const;
}

function showBlockers({ write }: Prompts, report: AdoptReport) {
  write(
    `\nAdoption cannot start until these are resolved. Nothing was changed.\n${report.blockers.map((blocker) => `- ${blocker.code}${blocker.path === undefined ? "" : ` ${blocker.path}`}: ${blocker.message}\n`).join("")}`,
  );
}

// A discovery declaration's scope entry, from its draft, if any, and the
// person's answers to its open questions and the files it covers.
async function askScope(
  { write, required, yes, paths: list }: Prompts,
  root: string,
  question: Question,
  report: AdoptReport,
) {
  const id = question.id.slice("scope:".length);
  write(`\n${question.question}\n`);
  const entry =
    report.discovery?.find((discovery) => discovery.id === id) ??
    report.contextual?.find((contextual) => contextual.id === id);
  if (entry?.discovery)
    write(
      `Discovery guidance, ${entry.discovery.path}:\n${entry.discovery.content.trimEnd()}\nAdoption guidance, ${entry.guidance.path}:\n${entry.guidance.content.trimEnd()}\n`,
    );
  const draft =
    question.answer === null
      ? undefined
      : (record(question.answer) as {
          coverage: string;
          candidates: Candidate[];
          unresolved: string[];
          noScope?: true;
        });
  // Only an optional declaration's scope may be no scope.
  const optional =
    (question.details as { optional?: unknown } | undefined)?.optional === true;
  // A recorded scope proposed for review names what changed.
  const changed = (question.details as { changed?: string[] } | undefined)
    ?.changed;
  // A run stopped for its scope asks again from its confirmed scope.
  const label = report.run ? "confirmed" : changed ? "recorded" : "drafted";
  if (draft) {
    write(
      `${report.run ? "The run's confirmed scope." : changed ? `The last complete adoption recorded this scope, proposed for review: ${changed.join(" ")}` : "The discovery script drafted this scope."}${draft.noScope ? " It has no scope." : ""}\nCoverage: ${draft.coverage}\n`,
    );
    for (const candidate of draft.candidates)
      write(
        `  ${candidate.decision} ${candidate.path}: ${candidate.reason} Evidence: ${candidate.evidence.join(", ") || "none"}.\n`,
      );
  }
  const notes: string[] = [];
  for (const open of draft?.unresolved ?? []) {
    write(`Open question: ${open}\n`);
    notes.push(`${open} ${await required("Answer: ")}`);
  }
  // No scope, unlike an empty one, installs none of its rules and runs none
  // of its checks or fixes.
  if (
    optional &&
    (await yes(
      `${id} is optional. Does it have no scope, so that none of its rules install and none of its checks or fixes run? [${draft?.noScope ? "Y/n" : "y/N"}]: `,
      draft?.noScope ? "yes" : "no",
    ))
  ) {
    const why =
      draft?.noScope && !notes.length
        ? undefined
        : await required("Why does no project file belong in its scope? ");
    return {
      coverage: [draft?.coverage, why, ...notes]
        .filter((text) => text)
        .join(" "),
      // An included file with no evidence, one that does not exist yet,
      // is no candidate once excluded.
      candidates: (draft?.candidates ?? []).flatMap((candidate): Candidate[] =>
        candidate.decision === "exclude"
          ? [candidate]
          : candidate.evidence.length
            ? [
                {
                  ...candidate,
                  decision: "exclude",
                  reason:
                    "The maintainer gave it no scope in adopt's terminal walk-through.",
                },
              ]
            : [],
      ),
      unresolved: [],
      noScope: true,
    };
  }
  const drafted = (draft?.candidates ?? [])
    .filter((candidate) => candidate.decision === "include")
    .map((candidate) => candidate.path);
  const accepted =
    draft !== undefined &&
    (await yes(
      `Does ${id} cover exactly the ${label} files, ${drafted.join(", ") || "none"}? [Y/n]: `,
      "yes",
    ));
  if (!accepted)
    write(
      `List the files ${id} covers, one per line; an empty line ends the list.\n`,
    );
  const paths = accepted ? drafted : await list("File: ");
  const why = accepted
    ? undefined
    : await required("Why do these files make up its scope? ");
  const coverage = [draft?.coverage, why, ...notes]
    .filter((text) => text)
    .join(" ");
  // Each drafted candidate is included exactly when the person lists it.
  const kept = (draft?.candidates ?? []).map((candidate): Candidate => {
    const included = paths.includes(candidate.path);
    return included === (candidate.decision === "include")
      ? candidate
      : {
          ...candidate,
          decision: included ? "include" : "exclude",
          reason: included
            ? why!
            : "The maintainer excluded it in adopt's terminal walk-through.",
        };
  });
  const added = paths
    .filter((path) => !kept.some((candidate) => candidate.path === path))
    .map((path): Candidate => ({
      path,
      decision: "include",
      reason: why!,
      // An existing file is its own evidence; a missing one needs none.
      evidence: existsSync(join(root, path)) ? [path] : [],
    }));
  return { coverage, candidates: [...kept, ...added], unresolved: [] };
}

// One contextual declaration, walked until the person reports it done with
// its checks passing, or blocked.
async function walkDeclaration(
  prompt: Prompts,
  { root, cliVersion }: Session,
  declaration: Contextual,
  position: string,
  failed: NonNullable<AdoptReport["failedChecks"]>,
  afterFixes: ScopeReview | undefined,
): Promise<Answer> {
  const { write, ask, required, choose } = prompt;
  const { id, rules, guidance, discovery } = declaration;
  const scope = targetList(declaration);
  write(`\nContextual work ${position}: ${id}\nEdit only: ${scope}\n`);
  const showRules = (heading: string) =>
    write(
      rules
        ? `${heading}, ${rules.path}:\n${rules.content.trimEnd()}\n`
        : `${id} has no installed rules.\n`,
    );
  showRules("Rules");
  write(
    `Adoption guidance, ${guidance.path}:\n${guidance.content.trimEnd()}\n`,
  );
  if (discovery)
    write(
      `Discovery guidance, ${discovery.path}:\n${discovery.content.trimEnd()}\n`,
    );
  for (const check of failed)
    write(`Failed after the assessment: ${check.id}: ${check.message}\n`);
  // The current review, once all contextual work is done, replaces the
  // second copy of the after-fixes review.
  const scopeValidity = afterFixes
    ? { afterFixes, current: afterFixes }
    : undefined;
  const blocked = async (evidence: string[]): Promise<Answer> => {
    const explanation = await required(`Why is ${id} blocked? `);
    return {
      status: "blocked",
      explanation,
      evidence: [
        ...evidence,
        "The maintainer marked it blocked in adopt's terminal walk-through.",
      ],
      ...(scopeValidity ? { scopeValidity } : {}),
    };
  };
  let wait = failed.length ? fixing : editing;
  // The latest check results, the evidence of a block that follows them.
  let evidence = failed.map(
    (check) => `Check ${check.id} failed: ${check.message}`,
  );
  for (;;) {
    // Only Enter or blocked answers the wait; anything else asks again.
    const typed = (await ask(wait)).toLowerCase();
    if (typed === "blocked") return blocked(evidence);
    if (typed) continue;
    write(`Running the checks of ${id}.\n`);
    const results = await checkContextual(root, cliVersion, id);
    if (!results.length) write(`${id} declares no checks.\n`);
    for (const result of results)
      write(
        `${result.status[0]!.toUpperCase()}${result.status.slice(1)}: ${result.id}: ${result.message}${result.status === "passed" ? "" : ` Output: ${result.stdout}, ${result.stderr}`}\n`,
      );
    evidence = results.map(
      (result) => `Check ${result.id} ${result.status}: ${result.message}`,
    );
    if (results.some((result) => result.status !== "passed")) {
      showRules("Its rules");
      wait = fixing;
      continue;
    }
    const answer = await choose(
      `Is ${id} done? [Y/n/blocked]: `,
      { y: "done", yes: "done", n: "edit", no: "edit", blocked: "blocked" },
      "done",
    );
    if (answer === "done")
      return {
        status: "satisfied",
        explanation: `The maintainer confirmed in adopt's terminal walk-through that the project satisfies the rules and adoption guidance of ${id}.`,
        evidence: [
          ...evidence,
          "The maintainer confirmed it done in adopt's terminal walk-through.",
        ],
        ...(scopeValidity ? { scopeValidity } : {}),
      };
    if (answer === "blocked") return blocked(evidence);
    wait = editing;
  }
}

// A declaration's allowed targets, as a person reads them.
function targetList({ allowedTargets, noScope }: Contextual) {
  if (noScope) return "no scope";
  return (
    [
      ...allowedTargets.paths,
      ...allowedTargets.directories.map((directory) => `${directory}/`),
    ].join(", ") || "no files"
  );
}

// The person's review of a discovered declaration's confirmed scope at one
// point of the run.
async function reviewScope(
  { write, yes, paths, required }: Prompts,
  declaration: Contextual,
  question: string,
  when: string,
): Promise<ScopeReview> {
  const evidence = [`The confirmed scope: ${targetList(declaration)}.`];
  if (await yes(question, "yes"))
    return {
      status: "valid",
      explanation: declaration.noScope
        ? `The maintainer confirmed in adopt's terminal walk-through that, ${when}, no project file belongs in the declaration's scope.`
        : `The maintainer confirmed in adopt's terminal walk-through that, ${when}, the confirmed scope covers every file the declaration should.`,
      evidence,
      additionalPaths: [],
    };
  write(
    declaration.noScope
      ? "List the files that belong in its scope, one per line; an empty line ends the list, which may be empty.\n"
      : "List any files it misses, one per line; an empty line ends the list, which may be empty.\n",
  );
  const missing = await paths("File: ");
  const reason = await required("Why is the confirmed scope incomplete? ");
  write(
    "A run's confirmed scope never changes, so the run stops incomplete. Change the scope then, and adopt replaces the run in place over its changes.\n",
  );
  return {
    status: "blocked",
    explanation: `The maintainer reports that the confirmed scope is incomplete ${when}: ${reason}${missing.length ? ` Missing files: ${missing.join(", ")}.` : ""}`,
    evidence,
    additionalPaths: missing,
  };
}
