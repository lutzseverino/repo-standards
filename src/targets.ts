import type { Declaration } from './model.js';

// Declaration targets: where each resolved declaration applies in the project,
// and the system skills the product reserves and installs. Every other module
// asks this one for a skill's target, a declaration's targets, or the system
// skills, instead of deriving them.

export interface Targets { paths: string[]; directories: string[] }
export interface SystemSkill { name: string; target: string }

// The shared skill location every installed skill, system or author, lives in.
export function skillTarget(name: string) { return `.agents/skills/${name}`; }

// The system skill adoption installs, from this CLI's packaged copy.
export const adoptionSkill: SystemSkill = { name: 'adopt-standards', target: skillTarget('adopt-standards') };

// Every system skill: no author skill may take its name, and no declared
// target may overlap its target. Adoption installs only the adoption skill.
export const systemSkills: readonly SystemSkill[] = [adoptionSkill, { name: 'author-standards', target: skillTarget('author-standards') }];

// The one installation target of an exact file or skill, or none for
// contextual guidance.
export function installationTarget(declaration: Declaration): string | undefined {
  return declaration.kind === 'skill' ? skillTarget(declaration.name) : 'exact' in declaration ? declaration.target : undefined;
}

// Every target a declaration applies to, as paths and directory trees: an
// exact or contextual file's path, a skill's directory, or repository
// guidance's targets.
export function declarationTargets(declaration: Declaration): Targets {
  return declaration.kind === 'repository' ? declaration.targets
    : declaration.kind === 'skill' ? { paths: [], directories: [skillTarget(declaration.name)] }
    : { paths: [declaration.target], directories: [] };
}
