import type { Declaration } from "./model.js";

// Declaration targets: where each resolved declaration applies in the project,
// the skill link of each installed skill, and the system skills the product
// reserves and installs. Every other module asks this one for a skill's target
// or link, a declaration's targets, or the system skills, instead of deriving
// them.

export interface Targets {
  paths: string[];
  directories: string[];
}
export interface SystemSkill {
  name: string;
  target: string;
  link: string;
}

// The shared skill location every installed skill, system or author, lives in.
export function skillTarget(name: string) {
  return `.agents/skills/${name}`;
}

// The skill link that exposes an installed skill to Claude Code, which reads
// only its own skill location: a relative symbolic link from that location
// back to the skill's directory in the shared one.
const linkLocation = ".claude/skills/";
export function skillLinkTarget(name: string) {
  return `${linkLocation}${name}`;
}
function skillLinkText(name: string) {
  return `${"../".repeat(linkLocation.split("/").length - 1)}${skillTarget(name)}`;
}

// The skill a skill-link path links, or none for any other path.
function linkedName(path: string) {
  const name = path.startsWith(linkLocation)
    ? path.slice(linkLocation.length)
    : "";
  return name && name !== "." && name !== ".." && !name.includes("/")
    ? name
    : undefined;
}

// The text the product writes at a skill-link path, or none for any other path.
export function linkTextAt(path: string): string | undefined {
  const name = linkedName(path);
  return name === undefined ? undefined : skillLinkText(name);
}

// The skill target a skill-link path exposes, or none for any other path.
export function linkedSkillTarget(path: string): string | undefined {
  const name = linkedName(path);
  return name === undefined ? undefined : skillTarget(name);
}

function systemSkill(name: string): SystemSkill {
  return { name, target: skillTarget(name), link: skillLinkTarget(name) };
}

// The system skills adoption installs, each from this CLI's packaged copy:
// the adoption skill and the update notice, in name order.
export const installedSystemSkills: readonly SystemSkill[] = [
  "adopt-standards",
  "standards-updates",
].map(systemSkill);

// Every system skill: no author skill may take its name, and no declared
// target may overlap its target or its link. Adoption installs all but
// author-standards.
export const systemSkills: readonly SystemSkill[] = [
  ...installedSystemSkills,
  systemSkill("author-standards"),
];

// The one installation target of an exact file or skill, or none for
// contextual guidance.
export function installationTarget(
  declaration: Declaration,
): string | undefined {
  return declaration.kind === "skill"
    ? skillTarget(declaration.name)
    : "exact" in declaration
      ? declaration.target
      : undefined;
}

// The skill link a declaration installs: a skill's, or none.
export function declarationLink(declaration: Declaration): string | undefined {
  return declaration.kind === "skill"
    ? skillLinkTarget(declaration.name)
    : undefined;
}

// Every target a declaration applies to, as paths and directory trees: an
// exact or contextual file's path, a skill's directory, or repository
// guidance's targets.
export function declarationTargets(declaration: Declaration): Targets {
  return declaration.kind === "repository"
    ? declaration.targets
    : declaration.kind === "skill"
      ? { paths: [], directories: [skillTarget(declaration.name)] }
      : { paths: [declaration.target], directories: [] };
}
