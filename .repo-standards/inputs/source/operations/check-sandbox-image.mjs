import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const resultFormat = "repo-standards/result/v2";
const target = ".sandcastle/Dockerfile";
const base = readFileSync(
  new URL("./sandbox-image-base.Dockerfile", import.meta.url),
  "utf8",
);

function failProcess(message) {
  throw new Error(message);
}

function readRequest() {
  let request;
  try {
    request = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    failProcess("Operation input must be one JSON object.");
  }
  if (request?.format !== "repo-standards/operation/v2") {
    failProcess(
      "Unsupported operation input format; expected repo-standards/operation/v2.",
    );
  }
  if (request.operation?.phase !== "checks") {
    failProcess("Sandbox image validation must run as a checks operation.");
  }
  const { paths, directories } = request.allowedTargets ?? {};
  if (
    !Array.isArray(paths) ||
    paths.length !== 1 ||
    paths[0] !== target ||
    !Array.isArray(directories) ||
    directories.length !== 0
  ) {
    failProcess(
      `Sandbox image validation requires the exact ${target} target and no directory targets.`,
    );
  }
  if (
    typeof request.projectRoot !== "string" ||
    request.projectRoot.length === 0
  ) {
    failProcess("Operation input must identify the project root.");
  }
  return request;
}

function result(status, message) {
  process.stdout.write(
    `${JSON.stringify({ format: resultFormat, status, message })}\n`,
  );
}

function lstatIsFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

// The Dockerfile instructions in text that holds no parser directives: each
// logical line, with its continuations joined and its comments and heredoc
// bodies left out, as an uppercase keyword and its arguments.
function instructions(text) {
  const lines = text.split("\n");
  const found = [];
  let index = 0;
  const skippable = (line) => /^\s*(?:#.*)?$/.test(line);
  while (index < lines.length) {
    if (skippable(lines[index])) {
      index += 1;
      continue;
    }
    let logical = "";
    for (;;) {
      const line = lines[index] ?? "";
      index += 1;
      const continued = /\\\s*$/.exec(line);
      logical += continued ? line.slice(0, continued.index) : line;
      if (!continued) break;
      while (index < lines.length && skippable(lines[index])) index += 1;
      if (index >= lines.length) break;
    }
    const [, keyword = "", rest = ""] = /^\s*(\S+)\s*(.*)$/.exec(logical) ?? [];
    const instruction = { keyword: keyword.toUpperCase(), arguments: rest };
    found.push(instruction);
    if (!["RUN", "COPY", "ADD"].includes(instruction.keyword)) continue;
    for (const [, strip, , word] of rest.matchAll(
      /<<(-?)(["']?)([A-Za-z_][A-Za-z0-9_]*)\2/g,
    )) {
      while (index < lines.length) {
        const line = lines[index];
        index += 1;
        if ((strip ? line.replace(/^\t+/, "") : line) === word) break;
      }
    }
  }
  return found;
}

const lastUser = (found) =>
  found.findLast((instruction) => instruction.keyword === "USER")?.arguments;
const baseUser = lastUser(instructions(base));

function corrections(image) {
  if (image === null)
    return [
      `Create ${target} from the factory's base, and add the repository's toolchain after it.`,
    ];
  if (!image.startsWith(base))
    return [
      `Restore the factory's base unchanged at the top of ${target}, and add the toolchain after it.`,
    ];
  const toolchain = instructions(image.slice(base.length));
  const found = [];
  const keywords = new Set(toolchain.map((instruction) => instruction.keyword));
  if (keywords.has("FROM"))
    found.push(
      "Remove FROM after the base; a new stage discards the base, so install the toolchain in the base's stage.",
    );
  for (const keyword of ["ENTRYPOINT", "CMD"])
    if (keywords.has(keyword))
      found.push(
        `Remove ${keyword} after the base; Sandcastle starts the base's entrypoint.`,
      );
  const user = lastUser(toolchain);
  if (user !== undefined && user.trim() !== baseUser)
    found.push(
      `End the toolchain as the base's user with USER ${baseUser}; Sandcastle runs the agent as that user.`,
    );
  return found;
}

try {
  const request = readRequest();
  const path = join(request.projectRoot, target);
  const found = corrections(
    lstatIsFile(path) ? readFileSync(path, "utf8") : null,
  );
  result(
    found.length === 0 ? "passed" : "failed",
    found.length === 0
      ? "The sandbox image extends the factory's base; the toolchain it adds still requires maintainer or agent review."
      : `The sandbox image needs correction: ${found.join(" ")}`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
