#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { searchSources } from "./discovery.js";
import { validateSource } from "./resolver.js";
import { inspect } from "./inspection.js";
import { ProductError } from "./errors.js";
import { requireSupportedGit } from "./observation.js";
import {
  abandon,
  inspectRetained,
  resume,
  start,
  startRetained,
  status,
} from "./adoption.js";
import { outdated } from "./outdated.js";
import { check, checkSummary } from "./check.js";
import { rules, rulesSummary } from "./rules.js";
import { adopt, adoptSummary } from "./adopt.js";
import { adoptInTerminal, processTerminal } from "./adopt-terminal.js";
import {
  inspectionSummary,
  outdatedSummary,
  statusSummary,
} from "./summary.js";
import type { InspectionReport, StatusRecord } from "./summary.js";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") {
  console.log(version);
} else if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
  console.log(
    "Usage: repo-standards adopt [<GitHub URL>] [--standards-version <tag>] [--profile <name>] [--answers <file>] [--project <directory>] [--json]\n       repo-standards adopt --headless [--standards-version <tag>] [--project <directory>] [--json]\n       repo-standards source validate [directory] [--json]\n       repo-standards source search [--page <1-34>] [--json]\n       repo-standards inspect [--scope <file>] [--source <GitHub URL> --standards-version <tag> --profile <name>] [--project <directory>] [--json | --summary]\n       repo-standards start [--scope <file>] [--source <GitHub URL> --standards-version <tag> --profile <name>] --identity <inspection identity> [--confirmed] [--defer-remote-setup] [--project <directory>] [--json]\n       repo-standards resume [--retry | --assessment <file> | --confirmed | --defer] [--project <directory>] [--json]\n       repo-standards abandon [--project <directory>] [--json]\n       repo-standards status [--project <directory>] [--json | --summary]\n       repo-standards outdated [--project <directory>] [--json]\n       repo-standards check [--project <directory>] [--json]\n       repo-standards rules [<path>] [--project <directory>] [--json]\n\nAdopt adopts a standards source, or updates the current selection when no source is given. In a terminal, without --answers or --json, it asks its questions, walks each contextual declaration through its rules, adoption guidance and checks, and writes the assessment from the answers; otherwise, with or without an answers file, it starts the run over the fresh inspection when no question is open, nothing blocks it, and no confirmation is required; else, without an answers file it prints its questions as an answers-file template with the next steps and changes nothing, and with an answers file it asks what remains. It continues an active run and prints what the run needs next. adopt --headless updates an established adoption and asks nobody, even in a terminal: it takes the recorded source and profile and the newest stable release or --standards-version, answers only with the recorded answers an update reuses, and defers every remote setup, ready or not, so that it never writes to the hosting platform. It completes in one invocation and exits 0, or exits 1 with its report's open questions, before any write when a confirmation, an answer it cannot reuse, a profile the source no longer offers, or a blocker is open, and with the run active at contextual work or a fix's confirmation; adopt --answers in the same checkout finishes it. Inspect, start, and resume are the lower-level commands it drives. Start binds to the identity of the inspection it carries out. Pass --confirmed only when the inspection reports confirmation.required, after the maintainer confirms its confirmation-required changes. Inspection probes each remote setup before any write; a start stops when one is not ready, unless --defer-remote-setup completes adoption without it, and every later run applies it once it is ready. An update is one run: pass source flags to select a standards version, source, or profile, and run a candidate exact CLI to change the CLI pin, in any combination. Omit source flags to use retained standards; inspecting the unchanged selection with the pinned CLI starts a run that re-applies it. Active v2 discovery declarations require a fresh --scope proposal for every adoption and update. In an update, adopt reuses each recorded scope answer, remote setup deferral, and assessment that is provably unchanged, and proposes the others for review. Resume refreshes contextual work requests or submits assessment; when a fix stopped the run because overwriting a setting needs confirmation, resume --confirmed reruns that fix allowed to overwrite, after the maintainer confirms, and resume --defer records the fix as deferred, after the maintainer declines, and continues with the next fix. Use resume --retry for interrupted work, or abandon to preserve its changes and report; abandon exits 0 once the run is abandoned. adopt in that checkout adopts again in place over the preserved changes, and so does adopt with a changed scope answer while a run is stopped for its scope. Outdated reports available CLI and standards updates without changing the project, as Markdown, or as JSON with --json. Check runs the adopted checks against the working tree and fails when any does not pass. Rules prints the installed rules that cover a path, named from the current directory, and the rules of repository-wide declarations; without a path it prints only the repository-wide rules, which govern any work in the project. --summary renders an inspection or status as Markdown instead of JSON.",
  );
} else if (args[0] === "adopt") {
  const flags = new Map<string, string>();
  let usage: string | undefined;
  for (let index = 1; index < args.length; index++) {
    const key = args[index]!;
    if ((key === "--json" || key === "--headless") && !flags.has(key))
      flags.set(key, "true");
    else if (!key.startsWith("--") && !flags.has("source"))
      flags.set("source", key);
    else if (
      ["--standards-version", "--profile", "--answers", "--project"].includes(
        key,
      ) &&
      !flags.has(key) &&
      args[index + 1] &&
      !args[index + 1]!.startsWith("--")
    )
      flags.set(key, args[++index]!);
    else usage = key;
  }
  try {
    if (usage !== undefined)
      throw new ProductError(
        "USAGE",
        `Unknown, duplicate, or incomplete option: ${usage}. Use repo-standards adopt [<GitHub URL>] [--standards-version <tag>] [--profile <name>] [--answers <file>] [--project <directory>] [--json], or repo-standards adopt --headless [--standards-version <tag>] [--project <directory>] [--json].`,
      );
    const headless = flags.has("--headless");
    // A headless update keeps the recorded source and profile and takes no
    // answers.
    if (
      headless &&
      (flags.has("source") || flags.has("--answers") || flags.has("--profile"))
    )
      throw new ProductError(
        "USAGE",
        "adopt --headless updates the recorded source and profile without answers; omit the source, --profile and --answers. Use repo-standards adopt --headless [--standards-version <tag>] [--project <directory>] [--json].",
      );
    const options = {
      project: flags.get("--project") ?? ".",
      ...(flags.has("source") ? { source: flags.get("source")! } : {}),
      ...(flags.has("--standards-version")
        ? { standardsVersion: flags.get("--standards-version")! }
        : {}),
      ...(flags.has("--profile") ? { profile: flags.get("--profile")! } : {}),
      ...(flags.has("--answers") ? { answers: flags.get("--answers")! } : {}),
      ...(headless ? { headless } : {}),
    };
    // A person at a terminal is asked; an answers file or JSON is for an
    // agent, and a headless update asks nobody.
    if (
      !headless &&
      !flags.has("--answers") &&
      !flags.has("--json") &&
      process.stdin.isTTY &&
      process.stdout.isTTY
    ) {
      const outcome = await adoptInTerminal(
        options,
        version,
        processTerminal(),
      );
      if (outcome !== "complete") process.exitCode = 1;
    } else {
      const report = await adopt(options, version);
      if (flags.has("--json")) console.log(JSON.stringify(report, null, 2));
      else process.stdout.write(adoptSummary(report));
      // Printing the template is the whole request without an answers file;
      // a headless update that stops leaves its request unfinished.
      if (
        report.outcome !== "complete" &&
        (report.outcome !== "answers-required" ||
          headless ||
          flags.has("--answers") ||
          report.run)
      )
        process.exitCode = 1;
    }
  } catch (error) {
    const diagnostic =
      error instanceof ProductError
        ? {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
          }
        : { code: "ADOPTION_FAILED", message: (error as Error).message };
    if (flags.has("--json"))
      console.log(
        JSON.stringify({ valid: false, errors: [diagnostic] }, null, 2),
      );
    else console.error(`[${diagnostic.code}] ${diagnostic.message}`);
    process.exitCode =
      diagnostic.code === "USAGE"
        ? 2
        : diagnostic.code === "INTERRUPTED"
          ? 130
          : 1;
  }
} else if (
  args[0] === "outdated" ||
  args[0] === "check" ||
  args[0] === "rules"
) {
  const command = args[0];
  const flags = new Map<string, string>();
  for (let index = 1; index < args.length; index++) {
    const key = args[index]!;
    if (key === "--json" && !flags.has(key)) flags.set(key, "true");
    else if (command === "rules" && !key.startsWith("--") && !flags.has("path"))
      flags.set("path", key);
    else if (
      key === "--project" &&
      !flags.has(key) &&
      args[index + 1] &&
      !args[index + 1]!.startsWith("--")
    )
      flags.set(key, args[++index]!);
    else flags.set("usage", key);
  }
  let diagnostic:
    { code: string; message: string; details?: unknown } | undefined;
  if (flags.has("usage"))
    diagnostic = {
      code: "USAGE",
      message: `Use repo-standards ${command}${command === "rules" ? " [<path>]" : ""} [--project <directory>] [--json].`,
    };
  else
    try {
      const project = flags.get("--project") ?? ".";
      if (command === "outdated") {
        const report = await outdated(project, version);
        if (flags.has("--json")) console.log(JSON.stringify(report, null, 2));
        else process.stdout.write(outdatedSummary(report));
      } else if (command === "rules") {
        const report = rules(project, version, flags.get("path"));
        if (flags.has("--json")) console.log(JSON.stringify(report, null, 2));
        else process.stdout.write(rulesSummary(report));
      } else {
        const report = await check(project, version);
        if (flags.has("--json")) console.log(JSON.stringify(report, null, 2));
        else process.stdout.write(checkSummary(report));
        if (report.outcome !== "passed") process.exitCode = 1;
      }
    } catch (error) {
      // An unexpected check failure, such as a filesystem error before any check
      // runs, is still reported as a diagnostic.
      if (!(error instanceof ProductError) && command !== "check") throw error;
      diagnostic =
        error instanceof ProductError
          ? {
              code: error.code,
              message: error.message,
              ...(error.details === undefined
                ? {}
                : { details: error.details }),
            }
          : { code: "CHECK_FAILED", message: (error as Error).message };
    }
  if (diagnostic) {
    if (flags.has("--json"))
      console.log(
        JSON.stringify({ valid: false, errors: [diagnostic] }, null, 2),
      );
    else console.error(`[${diagnostic.code}] ${diagnostic.message}`);
    process.exitCode = diagnostic.code === "USAGE" ? 2 : 1;
  }
} else if (
  args[0] === "inspect" ||
  args[0] === "start" ||
  args[0] === "status" ||
  args[0] === "resume" ||
  args[0] === "abandon"
) {
  try {
    const flags = new Map<string, string>();
    for (let index = 1; index < args.length; index++) {
      const key = args[index]!;
      if (
        (key === "--json" ||
          (key === "--retry" && args[0] === "resume") ||
          (key === "--confirmed" && ["start", "resume"].includes(args[0])) ||
          (key === "--defer" && args[0] === "resume") ||
          (key === "--defer-remote-setup" && args[0] === "start") ||
          (key === "--summary" && ["inspect", "status"].includes(args[0]))) &&
        !flags.has(key)
      ) {
        flags.set(key, "true");
        continue;
      }
      if (
        ![
          "--project",
          ...(["status", "resume", "abandon"].includes(args[0])
            ? []
            : ["--source", "--standards-version", "--profile"]),
          ...(["inspect", "start"].includes(args[0]) ? ["--scope"] : []),
          ...(args[0] === "start" ? ["--identity"] : []),
          ...(args[0] === "resume" ? ["--assessment"] : []),
        ].includes(key) ||
        flags.has(key) ||
        !args[index + 1] ||
        args[index + 1]!.startsWith("--")
      )
        throw new ProductError(
          "USAGE",
          `Unknown, duplicate, or incomplete option: ${key}. Use --help.`,
        );
      flags.set(key, args[++index]!);
    }
    if (flags.has("--summary") && flags.has("--json"))
      throw new ProductError(
        "USAGE",
        "Use either --summary or --json, not both.",
      );
    if (flags.has("--retry") && flags.has("--assessment"))
      throw new ProductError(
        "USAGE",
        "Retry requests renewed contextual work; submit assessment separately after retry.",
      );
    if (
      args[0] === "resume" &&
      flags.has("--confirmed") &&
      (flags.has("--retry") || flags.has("--assessment"))
    )
      throw new ProductError(
        "USAGE",
        "Confirmation continues a run stopped for a fix's confirmation; use resume --confirmed alone, without --retry or --assessment.",
      );
    if (
      args[0] === "resume" &&
      flags.has("--defer") &&
      (flags.has("--retry") ||
        flags.has("--assessment") ||
        flags.has("--confirmed"))
    )
      throw new ProductError(
        "USAGE",
        "Deferral continues a run stopped for a fix's confirmation after the maintainer declines it; use resume --defer alone, without --retry, --assessment, or --confirmed.",
      );
    const selectionKeys = ["--source", "--standards-version", "--profile"];
    const selectionCount = selectionKeys.filter((key) => flags.has(key)).length;
    const retained =
      ["inspect", "start"].includes(args[0]) && selectionCount === 0;
    if (
      ["inspect", "start"].includes(args[0]) &&
      selectionCount !== 0 &&
      selectionCount !== selectionKeys.length
    )
      throw new ProductError(
        "USAGE",
        "Provide --source, --standards-version and --profile together, or omit all three to use retained standards.",
      );
    if (args[0] === "start" && !flags.has("--identity"))
      throw new ProductError(
        "USAGE",
        "Inspect the selection and pass its identity with --identity <inspection identity>.",
      );
    if (args[0] === "inspect" || args[0] === "start") requireSupportedGit();
    const options = {
      source: flags.get("--source")!,
      standardsVersion: flags.get("--standards-version")!,
      profile: flags.get("--profile")!,
      project: flags.get("--project") ?? ".",
      ...(flags.has("--scope") ? { scope: flags.get("--scope")! } : {}),
    };
    const report =
      args[0] === "abandon"
        ? abandon(options.project, version)
        : args[0] === "resume"
          ? await resume(
              options.project,
              version,
              flags.get("--assessment"),
              flags.has("--retry"),
              flags.has("--confirmed"),
              flags.has("--defer"),
            )
          : args[0] === "status"
            ? status(options.project, version)
            : args[0] === "start"
              ? retained
                ? await startRetained(
                    options.project,
                    version,
                    flags.get("--identity")!,
                    flags.has("--confirmed"),
                    options.scope,
                    flags.has("--defer-remote-setup"),
                  )
                : await start(
                    options,
                    version,
                    flags.get("--identity")!,
                    flags.has("--confirmed"),
                    flags.has("--defer-remote-setup"),
                  )
              : retained
                ? await inspectRetained(options.project, version, options.scope)
                : await inspect(options, version);
    if (
      flags.has("--summary") ||
      (args[0] === "status" && !flags.has("--json"))
    )
      process.stdout.write(
        args[0] === "status"
          ? statusSummary(report as StatusRecord)
          : inspectionSummary(report as InspectionReport),
      );
    else console.log(JSON.stringify(report, null, 2));
    // An abandoned run stays incomplete, but abandoning it succeeded.
    if (
      "outcome" in report &&
      report.outcome === "incomplete" &&
      args[0] !== "abandon"
    )
      process.exitCode = 1;
  } catch (error) {
    const diagnostic =
      error instanceof ProductError
        ? {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
          }
        : { code: "INSPECTION_FAILED", message: (error as Error).message };
    if (args.includes("--json"))
      console.log(
        JSON.stringify({ valid: false, errors: [diagnostic] }, null, 2),
      );
    else console.error(`[${diagnostic.code}] ${diagnostic.message}`);
    process.exitCode = diagnostic.code === "USAGE" ? 2 : 1;
  }
} else if (args[0] === "source" && args[1] === "search") {
  try {
    let page = 1;
    const seen = new Set<string>();
    for (let index = 2; index < args.length; index++) {
      const key = args[index]!;
      if (seen.has(key) || !["--json", "--page"].includes(key))
        throw new ProductError(
          "USAGE",
          "Use repo-standards source search [--page <1-34>] [--json].",
        );
      seen.add(key);
      if (key === "--page") {
        const value = args[++index] ?? "";
        page = Number(value);
        if (!/^[1-9][0-9]?$/.test(value) || page > 34)
          throw new ProductError(
            "USAGE",
            "Search page must be an integer from 1 to 34.",
          );
      }
    }
    console.log(JSON.stringify(await searchSources(version, page), null, 2));
  } catch (error) {
    const diagnostic =
      error instanceof ProductError
        ? { code: error.code, message: error.message }
        : { code: "SEARCH_FAILED", message: (error as Error).message };
    if (args.includes("--json"))
      console.log(
        JSON.stringify({ valid: false, errors: [diagnostic] }, null, 2),
      );
    else console.error(`[${diagnostic.code}] ${diagnostic.message}`);
    process.exitCode = diagnostic.code === "USAGE" ? 2 : 1;
  }
} else if (
  args[0] === "source" &&
  args[1] === "validate" &&
  args.slice(2).filter((arg) => arg !== "--json").length <= 1 &&
  !args.slice(2).some((arg) => arg.startsWith("-") && arg !== "--json")
) {
  const directory = args.slice(2).find((arg) => arg !== "--json") ?? ".";
  const report = validateSource(directory, version);
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else if (report.valid) {
    console.log(
      `Valid standards source; profiles: ${Object.keys(report.profiles).join(", ")}.`,
    );
    console.log(report.scope?.verified);
    console.log(report.scope?.limitations);
    for (const [profile, declarations] of Object.entries(
      report.scope?.discoveryRequired ?? {},
    )) {
      if (declarations.length)
        console.log(
          `Discovery required for profile ${profile}: ${declarations.join(", ")}.`,
        );
    }
  } else
    for (const error of report.errors)
      console.error(
        `${error.file}:${error.line}:${error.column} [${error.code}] ${error.message} (${error.path || "/"})`,
      );
  process.exitCode = report.valid ? 0 : 1;
} else {
  console.error("Usage: repo-standards source validate [directory] [--json]");
  process.exitCode = 2;
}
