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
import { checkContextual, type CheckResult } from "./check.js";
import { ProductError } from "./errors.js";
import { record } from "./records.js";

// Guided adoption in a terminal: adopt asks a person the questions an answers
// file holds, one stage at a time with each default proposed, then walks each
// contextual declaration. It shows the declaration's rules and adoption
// guidance, waits while the person edits, runs its checks, and asks whether it
// is done, or blocked with a reason; the assessment is written from those
// answers. Before a run starts nothing is written, and once it has, the run
// holds everything, so running adopt again after an interruption continues
// where the run stopped.

export interface Terminal {
  write: (text: string) => void;
  // The line the person typed, trimmed. It fails with INTERRUPTED when they
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
        return (
          await lines.question(prompt, { signal: interrupted.signal })
        ).trim();
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

type Contextual = NonNullable<AdoptReport["contextual"]>[number];
interface ScopeReview {
  status: "valid" | "blocked";
  explanation: string;
  evidence: string[];
  additionalPaths: string[];
}
interface Judgment {
  status: "satisfied" | "blocked";
  explanation: string;
  evidence: string[];
  scopeValidity?: { afterFixes: ScopeReview; current: ScopeReview };
}

export async function adoptInTerminal(
  options: AdoptOptions,
  cliVersion: string,
  terminal: Terminal,
): Promise<AdoptReport["outcome"]> {
  const root = projectRoot(options.project);
  const answers: Answers = new Map();
  // This session's judgments, kept for declarations a later walk skips.
  const judged = new Map<string, Judgment>();
  let presented: string | undefined;
  let submitted = false;
  const { write } = terminal;

  // A line the person must not leave empty.
  const required = async (prompt: string) => {
    for (;;) {
      const typed = await terminal.ask(prompt);
      if (typed) return typed;
    }
  };
  // One of the choices, or the fallback when the person types nothing.
  const choose = async <T extends string>(
    prompt: string,
    choices: Record<string, T>,
    fallback?: T,
  ) => {
    for (;;) {
      const typed = (await terminal.ask(prompt)).toLowerCase();
      if (!typed && fallback) return fallback;
      const chosen = Object.hasOwn(choices, typed) ? choices[typed] : undefined;
      if (chosen) return chosen;
      write(`Type ${Object.keys(choices).join(", ")}.\n`);
    }
  };
  const yes = (prompt: string, fallback: "yes" | "no") =>
    choose(prompt, { y: "yes", yes: "yes", n: "no", no: "no" }, fallback).then(
      (answer) => answer === "yes",
    );
  const completed = () => {
    write(
      `\nThe adoption is complete. Its changes are uncommitted.\nReview them with git status and git diff, then commit them through the project's normal workflow. ${pinnedCli} status says whether the run is ready to commit, and ${pinnedCli} status --summary renders its adoption record.\n`,
    );
    return "complete" as const;
  };
  // A run that needs the maintainer's decision: a retry of its interrupted
  // work, which continues the session, or abandonment, or stopping here.
  // A run's confirmed scope never changes, so retrying it cannot help.
  const decide = async (reason: string) => {
    write(`\nThe run is incomplete: ${reason}\n`);
    const scope = reason.startsWith("SCOPE_INCOMPLETE:");
    const choice = scope
      ? await choose("Abandon the run, or stop? [abandon/stop]: ", {
          abandon: "abandon",
          stop: "stop",
        })
      : await choose(
          "Retry the interrupted work, abandon the run, or stop? [retry/abandon/stop]: ",
          { retry: "retry", abandon: "abandon", stop: "stop" },
        );
    if (choice === "retry") {
      write("Retrying the run's interrupted work.\n");
      const run = await resume(root, cliVersion, undefined, true);
      return run.outcome === "complete" ? completed() : undefined;
    }
    if (choice === "abandon") {
      abandon(root, cliVersion);
      write(
        `Abandoned the run. Its changes stay in the project, and ${pinnedCli} status shows its report.${scope ? " Commit or discard the changes, then run adopt again to confirm a new scope." : ""}\n`,
      );
    } else
      write(`Run adopt again to decide, or read ${pinnedCli} status first.\n`);
    return "incomplete" as const;
  };

  write("Repository Standards adoption\n");
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
        error.code !== "INVALID_SCOPE" ||
        !scopes.length
      )
        throw error;
      write(`\n${error.message}\nAnswer the scope questions again.\n`);
      for (const id of scopes) answers.delete(id);
      continue;
    }
    // Answers that advance a run apply once.
    for (const id of answers.keys())
      if (id.startsWith("assessment:") || id.startsWith("fix:"))
        answers.delete(id);
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
          if (
            await yes("Allow the fix to overwrite the setting? [y/N]: ", "no")
          ) {
            answers.set(question!.id, identity);
            write("Running the fix again, allowed to overwrite.\n");
            continue;
          }
          write(
            `The run stays stopped at this fix. Run adopt again to confirm it, or abandon the run with ${pinnedCli} abandon.\n`,
          );
          return report.outcome;
        }
        if (report.blockers.length) {
          showBlockers(terminal, report);
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
              await askScope(terminal, root, question, report, required),
            );
          continue;
        }
        if (report.inspection && presented !== report.inspection.identity) {
          write(`\n${report.inspection.summary.trimEnd()}\n`);
          presented = report.inspection.identity;
        }
        for (const question of asked) {
          switch (question.id) {
            case "version": {
              write(`\n${question.question}\n${question.context}\n`);
              const releases = question.choices as string[] | undefined;
              if (releases)
                write(
                  `Stable releases: ${releases.slice(0, 10).join(", ")}${releases.length > 10 ? `, and ${releases.length - 10} more` : ""}.\n`,
                );
              const proposed = question.answer as string | null;
              for (;;) {
                const version =
                  (await terminal.ask(
                    `Version${proposed ? ` [${proposed}]` : ""}: `,
                  )) || proposed;
                if (!version) continue;
                if (releases && !releases.includes(version)) {
                  write(`Choose a stable release, such as ${releases[0]}.\n`);
                  continue;
                }
                answers.set("version", version);
                break;
              }
              break;
            }
            case "profile": {
              write(`\n${question.question}\n${question.context}\n`);
              const profiles = question.choices as {
                name: string;
                description: string;
              }[];
              for (const { name, description } of profiles)
                write(`  ${name}: ${description}\n`);
              const names = profiles.map(({ name }) => name);
              const proposed = question.answer as string | null;
              for (;;) {
                const profile =
                  (await terminal.ask(
                    `Profile${proposed ? ` [${proposed}]` : ""}: `,
                  )) || proposed;
                if (profile && names.includes(profile)) {
                  answers.set("profile", profile);
                  break;
                }
                if (profile) write(`Choose one of: ${names.join(", ")}.\n`);
              }
              break;
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
              answers.set(
                "remote-setup",
                await choose(
                  "Defer it, or resolve it first? [defer/resolve]: ",
                  { defer: "defer", resolve: "resolve" },
                ),
              );
              break;
            case "confirmation":
              write("\nThe run discards these edits:\n");
              for (const entry of report.discarded ?? []) {
                write(`\n${entry.target}:\n`);
                for (const changed of entry.files)
                  write(
                    changed.diff !== undefined
                      ? `${changed.diff.trimEnd()}\n`
                      : `${changed.path}: its ${changed.binary ? "binary " : ""}content is replaced.\n`,
                  );
                if (!entry.files.length)
                  write(
                    `It is replaced whole with ${entry.replacement ?? "its candidate content"}.\n`,
                  );
              }
              if (!(await yes("Discard these edits? [y/N]: ", "no"))) {
                write("Nothing was changed.\n");
                return report.outcome;
              }
              answers.set("confirmation", report.inspection!.identity);
              break;
            case "inspection":
              write(
                "\nThe run carries out the inspection above: it installs its changes and runs its operations, trusted scripts with your access to this host, its environment, and the network.\n",
              );
              if (!(await yes("Start the run? [Y/n]: ", "yes"))) {
                write("Nothing was changed.\n");
                return report.outcome;
              }
              answers.set("inspection", question.answer);
              write(
                "Starting the run: it installs the exact content and runs the fixes.\n",
              );
              break;
          }
        }
        continue;
      }
      case "blocked":
        if (report.run)
          write(`\nThe run stopped before writing anything: ${reason}\n`);
        else if (report.blockers.length) showBlockers(terminal, report);
        else
          write(
            "\nNothing was changed. Resolve the remote setup that is not ready, then run adopt again.\n",
          );
        return report.outcome;
      case "contextual": {
        if (reason.startsWith("SCOPE_INCOMPLETE:")) {
          const outcome = await decide(reason);
          if (outcome) return outcome;
          continue;
        }
        const blocked = [...judged].filter(
          ([, judgment]) => judgment.status === "blocked",
        );
        if (submitted && reason.startsWith("ASSESSMENT_BLOCKED:")) {
          write(
            `\nThe run is incomplete. Blocked: ${blocked.map(([id, judgment]) => `${id}: ${judgment.explanation}`).join("; ")}\nResolve it, then run adopt again to continue.\n`,
          );
          return report.outcome;
        }
        const declarations = report.contextual!;
        const failed = report.failedChecks ?? [];
        let walk = declarations;
        if (reason.startsWith("CHECKS_FAILED:")) {
          write("\nThe run's checks failed after the assessment.\n");
          walk = declarations.filter(
            ({ id }) =>
              !judged.has(id) ||
              failed.some((check) => check.declaration === id),
          );
        } else if (!reason.startsWith("CONTEXTUAL_REQUIRED:"))
          write(`\nThe run did not accept the last assessment: ${reason}\n`);
        for (const [index, declaration] of walk.entries())
          judged.set(
            declaration.id,
            await walkDeclaration(
              terminal,
              { root, cliVersion },
              declaration,
              `${index + 1} of ${walk.length}`,
              failed.filter((check) => check.declaration === declaration.id),
              { required, choose, yes },
            ),
          );
        for (const { id } of declarations)
          answers.set(`assessment:${id}`, judged.get(id));
        submitted = true;
        write("\nSubmitting the assessment and running every check.\n");
        continue;
      }
      case "complete":
        return completed();
      case "incomplete": {
        const outcome = await decide(reason);
        if (outcome) return outcome;
        continue;
      }
    }
  }
}

function showBlockers(terminal: Terminal, report: AdoptReport) {
  terminal.write(
    `\nAdoption cannot start until these are resolved. Nothing was changed.\n${report.blockers.map((blocker) => `- ${blocker.code}${blocker.path === undefined ? "" : ` ${blocker.path}`}: ${blocker.message}\n`).join("")}`,
  );
}

interface Prompts {
  required: (prompt: string) => Promise<string>;
  choose: <T extends string>(
    prompt: string,
    choices: Record<string, T>,
    fallback?: T,
  ) => Promise<T>;
  yes: (prompt: string, fallback: "yes" | "no") => Promise<boolean>;
}

interface Candidate {
  path: string;
  decision: "include" | "exclude";
  reason: string;
  evidence: string[];
}

// A discovery declaration's scope entry, from its draft, if any, and the
// person's answers to its open questions and the files it covers.
async function askScope(
  terminal: Terminal,
  root: string,
  question: Question,
  report: AdoptReport,
  required: Prompts["required"],
) {
  const { write } = terminal;
  const id = question.id.slice("scope:".length);
  write(`\n${question.question}\n`);
  const entry = report.discovery?.find((discovery) => discovery.id === id);
  if (entry)
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
        });
  if (draft) {
    write(
      `The discovery script drafted this scope.\nCoverage: ${draft.coverage}\n`,
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
  const drafted = (draft?.candidates ?? [])
    .filter((candidate) => candidate.decision === "include")
    .map((candidate) => candidate.path);
  const listed = (
    await terminal.ask(
      `Files ${id} covers, separated by spaces${drafted.length ? ` [${drafted.join(" ")}]` : ""}: `,
    )
  )
    .split(/\s+/)
    .filter(Boolean);
  const paths = [...new Set(listed.length ? listed : drafted)];
  const changed =
    !draft ||
    paths.length !== drafted.length ||
    paths.some((path) => !drafted.includes(path));
  const why = changed
    ? await required("Why do these files make up its scope? ")
    : undefined;
  const coverage = [draft?.coverage, why, ...notes]
    .filter((text) => text)
    .join(" ");
  const kept = (draft?.candidates ?? []).flatMap((candidate): Candidate[] =>
    paths.includes(candidate.path) || candidate.decision === "exclude"
      ? [candidate]
      : [
          {
            ...candidate,
            decision: "exclude",
            reason:
              "The maintainer excluded it in adopt's terminal walk-through.",
          },
        ],
  );
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
  terminal: Terminal,
  { root, cliVersion }: { root: string; cliVersion: string },
  declaration: Contextual,
  position: string,
  failed: NonNullable<AdoptReport["failedChecks"]>,
  { required, choose, yes }: Prompts,
): Promise<Judgment> {
  const { write } = terminal;
  const { id, allowedTargets, rules, guidance, discovery } = declaration;
  const targets = [
    ...allowedTargets.paths,
    ...allowedTargets.directories.map((directory) => `${directory}/`),
  ];
  write(
    `\nContextual work ${position}: ${id}\nEdit only: ${targets.join(", ") || "no files"}\n`,
  );
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
  const edit =
    "Edit the files now. Press Enter when you are done, or type blocked: ";
  let prompt = failed.length
    ? "Fix it, then press Enter to check again, or type blocked: "
    : edit;
  const blocked = async (
    evidence: string[],
    reviewed?: Judgment["scopeValidity"],
  ): Promise<Judgment> => {
    const explanation = await required(`Why is ${id} blocked? `);
    const scopeValidity =
      reviewed ?? (discovery ? await reviewScope() : undefined);
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
  // The person's review of a discovered declaration's confirmed scope, after
  // the run's fixes and now.
  const reviewScope = async () => {
    const scope = targets.join(", ") || "no files";
    let review: ScopeReview = {
      status: "valid",
      explanation:
        "The maintainer confirmed in adopt's terminal walk-through, after the run's fixes, that the confirmed scope covers every file the declaration should.",
      evidence: [`The confirmed scope: ${scope}.`],
      additionalPaths: [],
    };
    if (
      !(await yes(
        `Does its confirmed scope, ${scope}, still cover every file ${id} should? [Y/n]: `,
        "yes",
      ))
    ) {
      const missing = [
        ...new Set(
          (
            await required(
              "Which files does it miss? Separate them with spaces: ",
            )
          )
            .split(/\s+/)
            .filter(Boolean),
        ),
      ];
      write(
        "A run's confirmed scope never changes, so the run stops incomplete: abandon it, then adopt again with a new scope.\n",
      );
      review = {
        status: "blocked",
        explanation: `The maintainer reports files the confirmed scope misses: ${missing.join(", ")}.`,
        evidence: [`The confirmed scope: ${scope}.`],
        additionalPaths: missing,
      };
    }
    return { afterFixes: review, current: review };
  };
  for (;;) {
    if ((await terminal.ask(prompt)).toLowerCase() === "blocked")
      return blocked([]);
    write(`Running the checks of ${id}.\n`);
    const results: CheckResult[] = await checkContextual(root, cliVersion, id);
    if (!results.length) write(`${id} declares no checks.\n`);
    for (const result of results)
      write(
        `${result.status[0]!.toUpperCase()}${result.status.slice(1)}: ${result.id}: ${result.message}${result.status === "passed" ? "" : ` Output: ${result.stdout}, ${result.stderr}`}\n`,
      );
    const evidence = results.map(
      (result) => `Check ${result.id} ${result.status}: ${result.message}`,
    );
    if (results.some((result) => result.status !== "passed")) {
      showRules("Its rules");
      prompt = "Fix it, then press Enter to check again, or type blocked: ";
      continue;
    }
    const scopeValidity = discovery ? await reviewScope() : undefined;
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
    if (answer === "blocked") return blocked(evidence, scopeValidity);
    prompt = edit;
  }
}
