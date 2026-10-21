// A trusted script as checks, fixes, readiness probes and discovery scripts
// declare it.
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
  // The one hosting platform the declaration applies on; without it, it
  // applies on every platform of its profile.
  platform?: string;
  checks: Operation[];
  fixes: Operation[];
}
// Every declaration but a skill may name its rules: the lasting requirements
// adoption installs. Guidance is the declaration's adoption guidance.
interface Ruled {
  rules?: string;
}
export type Declaration = DeclarationBase &
  (
    | (Ruled & { kind: "file"; target: string; exact: string })
    | (Ruled & { kind: "file"; target: string; guidance: string })
    | { kind: "skill"; name: string; source: string }
    | (Ruled & {
        kind: "repository";
        guidance: string;
        targets: { paths: string[]; directories: string[] };
        // An optional discovery declaration confirmed with no scope: it keeps
        // no rules, checks or fixes, and its empty targets are not
        // repository-wide.
        "no-scope"?: true;
      })
  );

// Source discovery has no executable targets until project scope is confirmed.
export type SourceDeclaration =
  | Declaration
  | (DeclarationBase &
      Ruled & {
        kind: "repository";
        guidance: string;
        discovery: string;
        "discovery-script"?: Script;
        // Its confirmed scope may be no scope.
        optional?: true;
      });
// A profile's platforms are the hosting platforms an adopting project can
// select it on, which default to github alone. Its declarations still hold
// those of every platform until one is selected.
export interface SourceProfile {
  description: string;
  platforms: string[];
  declarations: SourceDeclaration[];
}

// A source profile on its selected platform: the declarations that apply
// there, before scope.
export interface SelectedProfile {
  description: string;
  declarations: SourceDeclaration[];
}

// A profile resolved for one selected platform: its declarations are those
// that apply on that platform.
export interface ResolvedProfile {
  description: string;
  declarations: Declaration[];
}
