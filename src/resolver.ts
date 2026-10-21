import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { satisfies, validRange } from "semver";
import { Fields, readYaml } from "./yaml.js";
import type { Diagnostic, Value } from "./yaml.js";
import { validAdopterAction } from "./adopter-action.js";
import { Declarations } from "./declarations.js";
import type { SourceProfile } from "./model.js";
import { isRootLicense, Paths, type SourcePaths } from "./paths.js";
import { validateSkillInvocation } from "./skill-invocation.js";
import { dictionary } from "./records.js";
import { defaultPlatform } from "./platforms.js";

export function validateSource(
  directory: string,
  cliVersion: string,
  sourcePaths?: SourcePaths,
  retainedManifest?: string,
) {
  const errors: Diagnostic[] = [];
  const file = resolve(directory, "standards.yaml");
  let text: string;
  try {
    if (
      retainedManifest === undefined &&
      sourcePaths &&
      !sourcePaths.paths.has("standards.yaml")
    )
      throw new Error("Missing exact Git path");
    if (
      lstatSync(resolve(directory)).isSymbolicLink() ||
      (retainedManifest === undefined && lstatSync(file).isSymbolicLink())
    ) {
      return {
        valid: false,
        errors: [
          {
            code: "SOURCE_SYMLINK",
            message:
              "The source root and standards.yaml cannot be symbolic links.",
            file,
            line: 1,
            column: 1,
            path: "",
          },
        ],
        profiles: {},
      };
    }
    if (retainedManifest === undefined && !lstatSync(file).isFile())
      throw new Error("Not a regular file");
    text = retainedManifest ?? readFileSync(file, "utf8");
  } catch {
    return {
      valid: false,
      errors: [
        {
          code: "SOURCE_READ",
          message: "Cannot read standards.yaml.",
          file,
          line: 1,
          column: 1,
          path: "",
        },
      ],
      profiles: {},
    };
  }
  try {
    function inspectLicense(path: string) {
      const location = resolve(directory, path);
      const stat = lstatSync(location);
      if (stat.isSymbolicLink())
        errors.push({
          code: "SOURCE_SYMLINK",
          message: `Source license entry contains a symbolic link: ${path}.`,
          file: location,
          line: 1,
          column: 1,
          path: "",
        });
      else if (stat.isDirectory())
        for (const name of readdirSync(location).sort())
          inspectLicense(`${path}/${name}`);
    }
    for (const name of readdirSync(directory).sort())
      if (isRootLicense(name)) inspectLicense(name);
  } catch {
    errors.push({
      code: "SOURCE_READ",
      message: "Cannot inspect root license entries.",
      file,
      line: 1,
      column: 1,
      path: "",
    });
  }
  const { roots, error } = readYaml(text, file, errors);
  const fields = new Fields(error);
  const paths = new Paths(resolve(directory), fields, sourcePaths);
  let result: ReturnType<typeof resolveDocument> | undefined;
  // The author's range gates selecting a standards version from its source
  // only. Retained inputs are validated against this CLI's formats alone.
  const validateSkill = (name: string, source: Value & { data: string }) =>
    validateSkillInvocation(
      resolve(directory),
      name,
      source,
      paths,
      fields,
      errors,
    );
  for (const root of roots)
    result = resolveDocument(
      root,
      fields,
      paths,
      validateSkill,
      retainedManifest === undefined ? cliVersion : undefined,
    );
  return {
    valid: errors.length === 0,
    errors,
    ...(errors.length ? {} : { source: result?.source, scope: result?.scope }),
    profiles: errors.length ? {} : (result?.profiles ?? {}),
  };
}

// The optional adopter action: one nonempty line of plain text for an action
// outside adoption. Older CLIs reject the field, so a source that sets it
// requires a CLI that accepts it.
function adopterActionField(root: Value, fields: Fields) {
  const value = fields.optional(root, "adopter-action");
  if (!value) return undefined;
  if (validAdopterAction(value.data)) return value.data;
  fields.error(
    "INVALID_TYPE",
    "Expected adopter-action to be one nonempty line of plain text. A source that sets it must raise requires.repo-standards to the first CLI that accepts the field, because older CLIs reject it as an unknown field.",
    value,
  );
  return undefined;
}

// A profile's platforms: a nonempty list of distinct platforms this CLI
// supports.
function profilePlatforms(
  value: Value,
  fields: Fields,
  declarations: Declarations,
) {
  const platforms: string[] = [];
  const items = fields.list(value);
  if (Array.isArray(value.data) && !items.length)
    fields.error(
      "EMPTY_PLATFORMS",
      "A profile that declares platforms names at least one.",
      value,
    );
  for (const item of items) {
    const platform = declarations.platform(item);
    if (platform === undefined) continue;
    if (platforms.includes(platform))
      fields.error(
        "DUPLICATE_IDENTITY",
        `Duplicate platform: ${platform}.`,
        item,
      );
    else platforms.push(platform);
  }
  return platforms;
}

function resolveDocument(
  root: Value,
  fields: Fields,
  paths: Paths,
  validateSkill: (name: string, source: Value & { data: string }) => void,
  cliVersion: string | undefined,
) {
  const error = fields.error;
  fields.map(root, [
    "format",
    "name",
    "description",
    "requires",
    "adopter-action",
    "defaults",
    "profiles",
  ]);
  const format = fields.get(root, "format");
  const formatName = fields.string(format);
  if (formatName !== "repo-standards/v2")
    error("INVALID_FORMAT", "Expected repo-standards/v2.", format);
  const name = fields.string(fields.get(root, "name"));
  const description = fields.string(fields.get(root, "description"));
  const requires = fields.get(root, "requires");
  fields.map(requires, ["repo-standards"]);
  const rangeValue = fields.get(requires, "repo-standards");
  const range = fields.string(rangeValue);
  if (range && !validRange(range))
    error("INVALID_VERSION", "Expected a CLI SemVer range.", rangeValue);
  else if (range && cliVersion !== undefined && !satisfies(cliVersion, range))
    error(
      "INCOMPATIBLE_CLI",
      `CLI ${cliVersion} does not satisfy ${range}. Declare an open-ended minimum CLI version, such as ">=${cliVersion}", so later CLI versions can select this standards version.`,
      rangeValue,
    );
  const adopterAction = adopterActionField(root, fields);
  const defaults = fields.get(root, "defaults");
  fields.map(defaults, ["declarations"]);
  const declarations = new Declarations(fields, paths, validateSkill);
  const inherited = declarations.read(fields.get(defaults, "declarations"));
  const profilesValue = fields.get(root, "profiles");
  const profiles: Record<string, SourceProfile> = dictionary();
  const entries = fields.map(profilesValue);
  if (entries.size === 0)
    error(
      "EMPTY_PROFILES",
      "At least one named profile is required.",
      profilesValue,
    );
  for (const [id, profile] of entries) {
    fields.string({ ...profile, data: id });
    const profileFields = fields.map(profile, [
      "description",
      "platforms",
      "declarations",
    ]);
    const profileDescription = fields.string(
      fields.get(profile, "description"),
    );
    // A profile that declares no platforms supports github alone.
    const platformsValue = profileFields.get("platforms");
    const platforms = platformsValue
      ? profilePlatforms(platformsValue, fields, declarations)
      : [defaultPlatform];
    const replacements = declarations.read(
      fields.get(profile, "declarations"),
      inherited,
    );
    const resolved = new Map([...inherited, ...replacements]);
    profiles[id] = {
      description: profileDescription ?? "",
      platforms,
      declarations: [...resolved.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .flatMap(([, declaration]) =>
          declaration === null ? [] : [declaration],
        ),
    };
    // Declarations for different platforms never apply together, so their
    // targets may overlap.
    paths.conflicts(
      [...resolved.values()].flatMap((declaration) =>
        declaration === null
          ? []
          : (declarations.locations.get(declaration) ?? []).map((target) => ({
              ...target,
              platform: declaration.platform,
            })),
      ),
      id,
    );
  }
  const scope = {
    verified:
      "Validated all profiles: schema, references, skill invocation agreement, operations, reserved identities, and determinable explicit-target conflicts. No author code was executed.",
    limitations:
      "Source validation does not prove concrete scope safety or semantic completeness in an unfamiliar adopting project. Project inspection is required; discovery guidance still requires agent interpretation and adopter review.",
    discoveryRequired: Object.fromEntries(
      Object.entries(profiles).map(([id, profile]) => [
        id,
        profile.declarations
          .filter((declaration) => "discovery" in declaration)
          .map((declaration) => declaration.id),
      ]),
    ),
  };
  return {
    scope,
    source: {
      format: formatName,
      name,
      description,
      requires: { "repo-standards": range },
      ...(adopterAction === undefined
        ? {}
        : { "adopter-action": adopterAction }),
    },
    profiles,
  };
}
