import { validRange } from "semver";
import type { SourceDeclaration, Operation, Script } from "./model.js";
import { Fields } from "./yaml.js";
import type { Value } from "./yaml.js";
import type { Paths, Target } from "./paths.js";
import { skillLinkTarget, skillTarget, systemSkills } from "./targets.js";

const identity = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validExecutable(executable: string): boolean {
  if (/[^A-Za-z0-9_./+-]/u.test(executable) || executable.startsWith("-"))
    return false;
  const components = executable.split("/");
  const basename = components.pop();
  return Boolean(
    basename &&
    basename !== "." &&
    basename !== ".." &&
    components.every((component, index) => component !== "" || index === 0),
  );
}

export class Declarations {
  readonly locations = new WeakMap<SourceDeclaration, Target[]>();
  constructor(
    private readonly fields: Fields,
    private readonly paths: Paths,
    private readonly validateSkill: (
      name: string,
      source: Value & { data: string },
    ) => void,
  ) {}

  private id(value: Value): string | undefined {
    const name = this.fields.string(value);
    if (name && !identity.test(name))
      this.fields.error(
        "INVALID_ID",
        "Expected a lower-case kebab-case identity.",
        value,
      );
    return name;
  }

  // A trusted script's run, prerequisite and timeout, as checks, fixes and
  // readiness probes declare them.
  private script(value: Value): Script {
    const f = this.fields;
    const run = f.get(value, "run");
    f.map(run, ["executable", "script", "resources", "arguments"]);
    const executableValue = f.get(run, "executable");
    const executable = f.string(executableValue) ?? "";
    if (executable && !validExecutable(executable)) {
      f.error(
        "INVALID_EXECUTABLE",
        "Expected an executable name or path using ASCII letters, digits, dot, underscore, plus, hyphen, and slash.",
        executableValue,
      );
    }
    const script = this.paths.reference(f.get(run, "script"), "file");
    const resources = f
      .list(f.get(run, "resources"))
      .map((resource) => this.paths.reference(resource, "resource"));
    const arguments_ = f.strings(f.get(run, "arguments"));
    const prerequisite = f.get(value, "prerequisite");
    f.map(prerequisite, ["version-arguments", "version"]);
    const versionArguments = f.strings(
      f.get(prerequisite, "version-arguments"),
    );
    const versionValue = f.get(prerequisite, "version");
    const version = f.string(versionValue) ?? "";
    if (version && !validRange(version))
      f.error(
        "INVALID_VERSION",
        "Expected a prerequisite SemVer range.",
        versionValue,
      );
    const timeout = f.get(value, "timeout-seconds");
    if (
      typeof timeout.data !== "number" ||
      !Number.isSafeInteger(timeout.data) ||
      timeout.data <= 0
    ) {
      f.error(
        "INVALID_TIMEOUT",
        "Timeout must be a positive integer number of seconds.",
        timeout,
      );
    }
    return {
      run: { executable, script, resources, arguments: arguments_ },
      prerequisite: { "version-arguments": versionArguments, version },
      "timeout-seconds": timeout.data as number,
    };
  }

  private operations(
    value: Value | undefined,
    identities: Set<string>,
    phase: "checks" | "fixes",
  ): Operation[] {
    if (!value) return [];
    const f = this.fields;
    return f.list(value).map((operation) => {
      const entries = f.map(operation, [
        "id",
        "run",
        "prerequisite",
        "timeout-seconds",
        ...(phase === "fixes" ? ["remote-setup"] : []),
      ]);
      const idValue = f.get(operation, "id");
      const id = this.id(idValue) ?? "";
      if (identities.has(id))
        f.error(
          "DUPLICATE_IDENTITY",
          `Duplicate operation ID: ${id}.`,
          idValue,
        );
      identities.add(id);
      const script = this.script(operation);
      if (phase === "checks" || !entries.has("remote-setup"))
        return { id, ...script };
      const remoteSetup = f.get(operation, "remote-setup");
      f.map(remoteSetup, ["probe"]);
      const probe = f.get(remoteSetup, "probe");
      f.map(probe, ["run", "prerequisite", "timeout-seconds"]);
      return { id, ...script, "remote-setup": { probe: this.script(probe) } };
    });
  }

  read(
    value: Value,
    defaults?: Map<string, SourceDeclaration | null>,
  ): Map<string, SourceDeclaration | null> {
    const f = this.fields;
    const declarations = new Map<string, SourceDeclaration | null>();
    for (const [id, declaration] of f.map(value)) {
      this.id({ ...declaration, data: id });
      const entries = f.map(declaration);
      if (entries.has("exclude")) {
        f.map(declaration, ["exclude"]);
        if (!defaults?.has(id) || entries.get("exclude")?.data !== true) {
          f.error(
            "INVALID_EXCLUSION",
            "An exclusion must be true and remove a declaration from defaults.",
            declaration,
          );
        }
        declarations.set(id, null);
        continue;
      }
      const operationIds = new Set<string>();
      const checks = this.operations(
        entries.get("checks"),
        operationIds,
        "checks",
      );
      const fixes = this.operations(
        entries.get("fixes"),
        operationIds,
        "fixes",
      );
      const kindValue = f.get(declaration, "kind");
      const kind = f.string(kindValue);
      const base = { id, checks, fixes };
      // Rules are optional on every declaration but a skill. Installed rules
      // are named by declaration ID beside their README.md index, which the
      // ID readme would fold onto.
      const rules = () => {
        if (!entries.has("rules")) return {};
        const value = f.get(declaration, "rules");
        if (id === "readme")
          f.error(
            "RESERVED_NAME",
            "A declaration with rules cannot have the ID readme: its installed rules would collide with the generated rules index README.md.",
            value,
          );
        return { rules: this.paths.reference(value, "file") };
      };
      const targets: Target[] = [];
      const targetPath = (location: Value) => {
        const target = this.paths.target(location);
        if (target) targets.push(target);
        return target?.path ?? "";
      };
      if (kind === "file") {
        f.map(declaration, [
          "kind",
          "target",
          "exact",
          "guidance",
          "rules",
          "checks",
          "fixes",
        ]);
        const target = targetPath(f.get(declaration, "target"));
        if (entries.has("exact") === entries.has("guidance")) {
          f.error(
            "INVALID_DECLARATION",
            "A file requires exactly one of exact or guidance.",
            declaration,
          );
        }
        const exact = entries.has("exact")
          ? this.paths.reference(f.get(declaration, "exact"), "file")
          : undefined;
        const guidance = entries.has("guidance")
          ? this.paths.reference(f.get(declaration, "guidance"), "file")
          : undefined;
        declarations.set(id, {
          ...base,
          kind,
          target,
          ...(exact !== undefined ? { exact } : { guidance: guidance ?? "" }),
          ...rules(),
        });
      } else if (kind === "skill") {
        f.map(declaration, ["kind", "name", "source", "checks", "fixes"]);
        const nameValue = f.get(declaration, "name");
        const name = this.id(nameValue) ?? "";
        const reserved = systemSkills.some(
          (skill) => skill.name === name.toLowerCase(),
        );
        if (reserved)
          f.error(
            "RESERVED_NAME",
            `${name.toLowerCase()} is a product-owned system skill.`,
            nameValue,
          );
        targetPath({ ...nameValue, data: skillTarget(name) });
        // The skill's link is a target too, so no other target may overlap it.
        if (!reserved)
          targetPath({ ...nameValue, data: skillLinkTarget(name) });
        const sourceValue = f.get(declaration, "source");
        const source = this.paths.reference(sourceValue, "directory");
        if (source) this.validateSkill(name, { ...sourceValue, data: source });
        declarations.set(id, { ...base, kind, name, source });
      } else if (kind === "repository") {
        f.map(declaration, [
          "kind",
          "guidance",
          "rules",
          "targets",
          "checks",
          "fixes",
          "discovery",
          "discovery-script",
        ]);
        const guidance = this.paths.reference(
          f.get(declaration, "guidance"),
          "file",
        );
        const ruled = rules();
        if (entries.has("targets") === entries.has("discovery")) {
          f.error(
            "INVALID_DECLARATION",
            "Repository guidance requires exactly one of targets or discovery.",
            declaration,
          );
        }
        // Validate both branches of an ambiguous declaration for independent errors.
        if (entries.has("targets")) {
          const targetsValue = f.get(declaration, "targets");
          f.map(targetsValue, ["paths", "directories"]);
          const paths = f.list(f.get(targetsValue, "paths")).map(targetPath);
          const directories = f
            .list(f.get(targetsValue, "directories"))
            .map(targetPath);
          if (!paths.length && !directories.length)
            f.error(
              "EMPTY_TARGETS",
              "Repository guidance requires at least one target.",
              targetsValue,
            );
          declarations.set(id, {
            ...base,
            kind,
            guidance,
            ...ruled,
            targets: { paths, directories },
          });
        }
        if (entries.has("discovery-script") && !entries.has("discovery"))
          f.error(
            "INVALID_DECLARATION",
            "A discovery script requires discovery.",
            f.get(declaration, "discovery-script"),
          );
        const scriptValue = entries.get("discovery-script");
        if (scriptValue)
          f.map(scriptValue, ["run", "prerequisite", "timeout-seconds"]);
        const script = scriptValue ? this.script(scriptValue) : undefined;
        if (entries.has("discovery")) {
          const discovery = this.paths.reference(
            f.get(declaration, "discovery"),
            "file",
          );
          declarations.set(id, {
            ...base,
            kind,
            guidance,
            ...ruled,
            discovery,
            ...(script ? { "discovery-script": script } : {}),
          });
        }
      } else {
        f.map(declaration, [
          "kind",
          "target",
          "exact",
          "guidance",
          "rules",
          "name",
          "source",
          "targets",
          "checks",
          "fixes",
        ]);
        f.error(
          "INVALID_DECLARATION",
          "Expected kind file, skill, or repository.",
          kindValue,
        );
      }
      const parsed = declarations.get(id);
      if (parsed) this.locations.set(parsed, targets);
    }
    return declarations;
  }
}
