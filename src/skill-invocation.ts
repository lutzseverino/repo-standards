import { join } from 'node:path';
import { Fields, readYaml } from './yaml.js';
import type { Diagnostic, Value } from './yaml.js';
import type { Paths } from './paths.js';

// Skill metadata has its own open schema; interpret only invocation settings.
function setting(text: string, file: string, keys: string[], fallback: boolean, errors: Diagnostic[]): boolean | undefined {
  const { roots, error } = readYaml(text, file, errors);
  const fields = new Fields(error);
  let result: boolean | undefined;
  for (const root of roots) {
    let value = root;
    if (value.data === null) { result = fallback; continue; }
    for (const key of keys) {
      const child = fields.map(value).get(key);
      if (!child) { value = { ...value, data: fallback }; break; }
      value = child;
    }
    if (typeof value.data === 'boolean') result = value.data;
    else fields.error('INVALID_TYPE', `Expected a boolean for ${keys.join('.')}.`, value);
  }
  return result;
}

export function validateSkillInvocation(directory: string, name: string, source: Value, paths: Paths, fields: Fields, errors: Diagnostic[]) {
  const skillPath = `${source.data}/SKILL.md`;
  const skill = paths.readFile({ ...source, data: skillPath });
  const policyPath = `${source.data}/agents/openai.yaml`;
  const policy = paths.readFile({ ...source, data: policyPath }, true);
  // Leading newline retains the SKILL.md frontmatter's original line numbers.
  const frontmatter = skill?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const disabled = frontmatter === undefined ? false :
    setting(`\n${frontmatter}`, join(directory, skillPath), ['disable-model-invocation'], false, errors);
  const implicit = policy === undefined ? true :
    setting(policy, join(directory, policyPath), ['policy', 'allow_implicit_invocation'], true, errors);
  if (disabled !== undefined && implicit !== undefined && disabled === implicit) {
    fields.error('SKILL_INVOCATION_MISMATCH',
      `Skill ${name}: disable-model-invocation: ${disabled} disagrees with policy.allow_implicit_invocation: ${implicit}. Absent settings default to model-invocable.`, source);
  }
}
