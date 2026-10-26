// The producer's JSON belongs to one workflow run and attempt. The consumer
// rejects absent, invalid, or earlier-run data rather than substituting zero.
export type CountRun = { run: string; attempt: string };

export function countOutput(counts: Record<string, number>, run: CountRun) {
  return { schema: "repo-standards/public-adopters/v1", ...run, counts };
}

export function readCounts(
  value: unknown,
  run: CountRun,
): Record<string, number> {
  if (
    !value ||
    typeof value !== "object" ||
    !("schema" in value) ||
    value.schema !== "repo-standards/public-adopters/v1" ||
    !("run" in value) ||
    value.run !== run.run ||
    !("attempt" in value) ||
    value.attempt !== run.attempt ||
    !("counts" in value) ||
    !value.counts ||
    typeof value.counts !== "object" ||
    Array.isArray(value.counts)
  )
    throw new Error(
      "Public-adopter JSON does not belong to this build's workflow run and attempt.",
    );
  const counts: Record<string, number> = {};
  for (const [repository, count] of Object.entries(
    value.counts as Record<string, unknown>,
  )) {
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      throw new Error("Invalid public-adopter count.");
    counts[repository.toLowerCase()] = count;
  }
  return counts;
}
