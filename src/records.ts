// The properties of a JSON object, or none for any other JSON value, so a
// caller narrows each property it reads.
export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// An empty dictionary without a prototype, so no key resolves to an inherited property.
export function dictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
