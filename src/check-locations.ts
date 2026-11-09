import type { Fields, Value } from "./yaml.js";

export const checkLocations = ["github", "runner", "self-reported"] as const;
export type CheckLocation = (typeof checkLocations)[number];
export const defaultCheckLocation: CheckLocation = "github";

export function isCheckLocation(value: unknown): value is CheckLocation {
  return checkLocations.some((location) => location === value);
}

// The sole interpreter of either author check-locations array. Omitting a
// declaration filter and omitting a profile offer have different defaults;
// callers supply those defaults, while present arrays follow the same rules.
export function readCheckLocations(
  value: Value,
  fields: Fields,
): CheckLocation[] {
  const locations: CheckLocation[] = [];
  const items = fields.list(value);
  if (Array.isArray(value.data) && !items.length)
    fields.error(
      "EMPTY_CHECK_LOCATIONS",
      "check-locations must name at least one check location.",
      value,
    );
  for (const item of items) {
    if (!isCheckLocation(item.data)) {
      fields.error(
        "UNSUPPORTED_CHECK_LOCATION",
        `Unsupported check-locations value ${JSON.stringify(item.data)}. Supported values: ${checkLocations.join(", ")}.`,
        item,
      );
      continue;
    }
    if (locations.includes(item.data))
      fields.error(
        "DUPLICATE_IDENTITY",
        `Duplicate check-locations value: ${item.data}.`,
        item,
      );
    else locations.push(item.data);
  }
  return locations;
}

export function atCheckLocation<
  T extends { "check-locations"?: CheckLocation[] },
>(declarations: readonly T[], checks: CheckLocation): T[] {
  return declarations.filter(
    (declaration) =>
      declaration["check-locations"] === undefined ||
      declaration["check-locations"].includes(checks),
  );
}
