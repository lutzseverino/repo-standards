import type { SpawnSyncReturns } from "node:child_process";

// Called only when a probe failed or its output lacked the expected value.
export function probeFailureMessage(
  command: string,
  result: SpawnSyncReturns<string>,
  {
    timeout,
    missingOutput,
    advice,
  }: {
    timeout: number;
    missingOutput: "version" | "cache path";
    advice: string;
  },
) {
  const error: NodeJS.ErrnoException | undefined = result.error;
  const code = error?.code;
  if (code === "ETIMEDOUT")
    return `\`${command}\` did not answer within ${timeout / 1000} seconds; the machine may be overloaded. Retry when it is less busy.`;
  const condition = result.error
    ? `could not start (${code})`
    : result.signal
      ? `was stopped by signal ${result.signal}`
      : result.status !== 0
        ? `exited with status ${result.status}`
        : `printed no ${missingOutput}`;
  return `\`${command}\` ${condition}. ${advice}`;
}
