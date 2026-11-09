// Independent of the test's event loop and reporter. This process never
// signals the runner or another fixture: only its parent and owned children.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const owner = process.ppid;
const groups = new Set<number>();
const directories = new Set<string>();
const stages = new Set<string>();
const failures = new Set<string>();
let timer: NodeJS.Timeout | undefined;
let finished = false;

function signal(pid: number, name: NodeJS.Signals) {
  try {
    process.kill(pid, name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function descendants() {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const owned = new Set([owner]);
  for (let size = 0; size !== owned.size;) {
    size = owned.size;
    for (const [pid, parent] of rows)
      if (pid !== process.pid && owned.has(parent)) owned.add(pid);
  }
  owned.delete(owner);
  return owned;
}

function enforce(reason: string) {
  finished = true;
  clearTimeout(timer);
  console.error(
    `[site fixture] ${reason}; active stages: ${[...stages].join(", ")}; failed stages: ${[...failures].join(", ")}`,
  );
  // Freeze the fixture before observing its descendants so it cannot acquire
  // another resource between observation and termination. Servers live in it;
  // Astro's services and browser descendants are also fixture-owned.
  signal(owner, "SIGSTOP");
  try {
    const children = descendants();
    for (const group of groups) signal(-group, "SIGKILL");
    for (const pid of children) signal(pid, "SIGKILL");
  } catch (error) {
    console.error("[site fixture] process enforcement failed", error);
  } finally {
    signal(owner, "SIGKILL");
  }
  for (const directory of directories) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      console.error(`[site fixture] emergency removal ${directory}`, error);
    }
  }
  process.exitCode = 1;
  if (process.connected) process.disconnect?.();
}

type Message = {
  type:
    "process" | "directory" | "start" | "end" | "failure" | "arm" | "finish";
  pid: number;
  directory: string;
  stage: string;
  deadline: number;
};

process.on("message", (message: Message) => {
  switch (message.type) {
    case "process":
      groups.add(message.pid);
      break;
    case "directory":
      directories.add(message.directory);
      break;
    case "start":
      stages.add(message.stage);
      break;
    case "failure":
      failures.add(message.stage);
      break;
    case "end":
      stages.delete(message.stage);
      break;
    case "arm":
      timer = setTimeout(
        () => enforce("60-second total teardown budget exhausted"),
        Math.max(0, message.deadline - Date.now()),
      );
      process.send?.("armed");
      break;
    case "finish":
      // A leader exiting is insufficient: Chromium can leave descendants in
      // its private process group. Never turn forced cleanup into a pass.
      if (
        execFileSync("ps", ["-axo", "pgid=,stat="], { encoding: "utf8" })
          .trim()
          .split("\n")
          .some((line) => {
            const [group, state] = line.trim().split(/\s+/);
            return groups.has(Number(group)) && !state.startsWith("Z");
          })
      ) {
        enforce("browser process group remains after cleanup");
        break;
      }
      clearTimeout(timer);
      finished = true;
      process.send?.("finished");
      break;
  }
});

process.on("disconnect", () => {
  if (!finished) enforce("fixture exited before teardown completed");
});
process.send?.("ready");
