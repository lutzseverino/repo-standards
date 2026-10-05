import { join } from "node:path";
import {
  isAlias,
  isMap,
  isNode,
  isScalar,
  LineCounter,
  parseDocument,
} from "yaml";
import { Fields } from "./yaml.js";
import type { Diagnostic, Value } from "./yaml.js";
import type { Paths } from "./paths.js";

// Recover only a setting's block-mapping path when malformed YAML hides its
// node. Indented prose in literal/folded scalars is never a setting line.
function hasSettingLine(text: string, keys: string[]): boolean {
  const parents: { key: string; indent: number }[] = [];
  const blockScalar = /^(?:[!&]\S+[ \t]+)*[|>][0-9+-]*[ \t]*(?:#.*)?$/;
  let proseIndent: number | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.match(/^[ \t]*/)![0].length;
    if (proseIndent !== undefined && indent > proseIndent) continue;
    proseIndent = undefined;
    if (blockScalar.test(line.trim().replace(/^-[ \t]+/, ""))) {
      proseIndent = indent;
      continue;
    }
    const match = line.match(
      /^[ \t]*("[^"]*"|'[^']*'|[^:#]+):(?:[ \t]|$)(.*)$/,
    );
    if (!match) continue;
    const key = match[1]!.trim().replace(/^(["'])(.*)\1$/, "$2");
    while (parents.length && parents.at(-1)!.indent >= indent) parents.pop();
    const path = [...parents.map((parent) => parent.key), key];
    if (
      path.length === keys.length &&
      path.every((part, index) => part === keys[index])
    )
      return true;
    parents.push({ key, indent });
    if (blockScalar.test(match[2]!.trim())) proseIndent = indent;
  }
  return false;
}

// Skill metadata has its own open schema; interpret only invocation settings.
function setting(
  text: string,
  file: string,
  keys: string[],
  fallback: boolean,
  errors: Diagnostic[],
): boolean | undefined {
  const lines = new LineCounter();
  const document = parseDocument(text, {
    lineCounter: lines,
    uniqueKeys: false,
  });
  const problems: Diagnostic[] = [];
  function error(code: string, message: string, offset: number, path: string) {
    const { line, col: column } = lines.linePos(offset);
    problems.push({ code, message, file, line, column, path });
  }
  const active = new Set<unknown>();
  function find(
    node: unknown,
    index: number,
    offset = 0,
    referenceOffset?: number,
  ): boolean[] {
    const path = "/" + keys.slice(0, index).join("/");
    if (isNode(node)) offset = referenceOffset ?? node.range?.[0] ?? offset;
    if (isAlias(node)) {
      const resolved = node.resolve(document);
      if (!resolved || active.has(node) || active.size > 100) {
        if (index === keys.length)
          error(
            "YAML_STRUCTURE",
            "Unresolved or recursive invocation setting alias.",
            offset,
            path,
          );
        return [];
      }
      active.add(node);
      const values = find(resolved, index, offset, offset);
      active.delete(node);
      return values;
    }
    if (index === keys.length) {
      if (isScalar(node) && typeof node.value === "boolean")
        return [node.value];
      error(
        "INVALID_TYPE",
        `Expected a boolean for ${keys.join(".")}.`,
        offset,
        path,
      );
      return [];
    }
    if (!isMap(node)) return [];
    const pairs = node.items.filter(
      (pair) => isScalar(pair.key) && pair.key.value === keys[index],
    );
    const before = problems.length;
    const values = pairs.flatMap((pair) =>
      find(
        pair.value,
        index + 1,
        isNode(pair.key) ? (pair.key.range?.[0] ?? offset) : offset,
      ),
    );
    if (pairs.length > 1 && (values.length || problems.length > before)) {
      const duplicate = pairs[1]!.key;
      error(
        "DUPLICATE_IDENTITY",
        `Duplicate mapping key: ${keys[index]}.`,
        isNode(duplicate) ? (duplicate.range?.[0] ?? offset) : offset,
        "/" + keys.slice(0, index + 1).join("/"),
      );
    }
    return values;
  }
  const values = find(document.contents, 0);
  // A broken document may hide the node. A setting line still prevents
  // silently treating an indeterminate invocation policy as absent.
  if (values.length || problems.length || hasSettingLine(text, keys)) {
    for (const problem of document.errors)
      error("YAML_SYNTAX", problem.message, problem.pos[0], "");
  }
  errors.push(...problems);
  return problems.length ? undefined : (values[0] ?? fallback);
}

export function validateSkillInvocation(
  directory: string,
  name: string,
  source: Value & { data: string },
  paths: Paths,
  fields: Fields,
  errors: Diagnostic[],
) {
  const skillPath = `${source.data}/SKILL.md`;
  const skill = paths.readFile({ ...source, data: skillPath });
  const policyPath = `${source.data}/agents/openai.yaml`;
  const policy = paths.readFile({ ...source, data: policyPath }, true);
  // Leading newline retains the SKILL.md frontmatter's original line numbers.
  const frontmatter = skill?.match(
    /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  )?.[1];
  const disabled =
    frontmatter === undefined
      ? false
      : setting(
          `\n${frontmatter}`,
          join(directory, skillPath),
          ["disable-model-invocation"],
          false,
          errors,
        );
  const implicit =
    policy === undefined
      ? true
      : setting(
          policy,
          join(directory, policyPath),
          ["policy", "allow_implicit_invocation"],
          true,
          errors,
        );
  if (
    disabled !== undefined &&
    implicit !== undefined &&
    disabled === implicit
  ) {
    fields.error(
      "SKILL_INVOCATION_MISMATCH",
      `Skill ${name}: disable-model-invocation: ${disabled} disagrees with policy.allow_implicit_invocation: ${implicit}. Absent settings default to model-invocable.`,
      source,
    );
  }
}
