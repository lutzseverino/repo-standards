export interface Operation {
  id: string;
  run: { executable: string; script: string; resources: string[]; arguments: string[] };
  prerequisite: { 'version-arguments': string[]; version: string };
  'timeout-seconds': number;
}

interface DeclarationBase { id: string; checks: Operation[]; fixes: Operation[] }
export type Declaration = DeclarationBase & (
  | { kind: 'file'; target: string; exact: string }
  | { kind: 'file'; target: string; guidance: string }
  | { kind: 'skill'; name: string; source: string }
  | { kind: 'repository'; guidance: string; targets: { paths: string[]; directories: string[] } }
);

export interface ResolvedProfile { description: string; declarations: Declaration[] }
