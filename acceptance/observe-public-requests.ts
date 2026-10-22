// A pass-through observer for child Node processes in public acceptance.
// It records request attempts, never headers, bodies, query strings or responses.
import { appendFileSync } from "node:fs";

const path = process.env.REPO_STANDARDS_ACCEPTANCE_REQUEST_LOG;
if (!path) throw new Error("Public acceptance request log is required.");

const transport = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(input instanceof Request ? input.url : input);
  const headers = new Headers(init?.headers ?? request?.headers);
  if (headers.has("authorization"))
    throw new Error("Public acceptance must not authenticate acquisition.");
  appendFileSync(
    path,
    JSON.stringify({
      phase: process.env.REPO_STANDARDS_ACCEPTANCE_PHASE ?? "installation",
      origin: url.origin,
      path: url.pathname,
      method: init?.method ?? request?.method ?? "GET",
    }) + "\n",
  );
  return transport(input, init);
};
