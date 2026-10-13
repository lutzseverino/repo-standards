// A trusted script as checks, fixes and readiness probes declare it.
export interface Script {
  run: {
    executable: string;
    script: string;
    resources: string[];
    arguments: string[];
  };
  prerequisite: { "version-arguments": string[]; version: string };
  "timeout-seconds": number;
}
export interface Operation extends Script {
  id: string;
  // A fix that changes the hosting platform's settings, with the read-only
  // probe that says whether it can apply.
  "remote-setup"?: { probe: Script };
}

interface DeclarationBase {
  id: string;
  checks: Operation[];
  fixes: Operation[];
}
export type Declaration = DeclarationBase &
  (
    | { kind: "file"; target: string; exact: string }
    | { kind: "file"; target: string; guidance: string }
    | { kind: "skill"; name: string; source: string }
    | {
        kind: "repository";
        guidance: string;
        targets: { paths: string[]; directories: string[] };
      }
  );

// Source discovery has no executable targets until project scope is confirmed.
export type SourceDeclaration =
  | Declaration
  | (DeclarationBase & {
      kind: "repository";
      guidance: string;
      discovery: string;
    });
export interface SourceProfile {
  description: string;
  declarations: SourceDeclaration[];
}

export interface ResolvedProfile {
  description: string;
  declarations: Declaration[];
}
