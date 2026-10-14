import { spawn } from "node:child_process";
import { closeSync, writeSync } from "node:fs";
import { createRequire } from "node:module";
import { ReadStream } from "node:tty";

// A pseudo-terminal from the C library through koffi, the product's own FFI
// dependency, so a test drives a command as a person at a terminal would.
const koffi = createRequire(import.meta.url)("koffi") as typeof import("koffi");
koffi.struct("terminal_winsize", {
  ws_row: "ushort",
  ws_col: "ushort",
  ws_xpixel: "ushort",
  ws_ypixel: "ushort",
});
let openpty:
  | ((
      master: number[],
      slave: number[],
      name: null,
      termios: null,
      size: Record<string, number>,
    ) => number)
  | undefined;

function pseudoTerminal() {
  openpty ??= koffi
    .load(
      process.platform === "darwin"
        ? "/usr/lib/libSystem.B.dylib"
        : "libc.so.6",
    )
    .func(
      "int openpty(_Out_ int *master, _Out_ int *slave, void *name, void *termios, const terminal_winsize *size)",
    );
  const master = [0];
  const slave = [0];
  if (
    openpty(master, slave, null, null, {
      ws_row: 50,
      ws_col: 200,
      ws_xpixel: 0,
      ws_ypixel: 0,
    }) !== 0
  )
    throw new Error("Cannot open a pseudo-terminal.");
  return { master: master[0]!, slave: slave[0]! };
}

// What a person saw: the terminal's output without control sequences, with
// plain line ends.
function visible(output: string) {
  return (
    output
      // oxlint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
      .replace(/\r+\n/g, "\n")
      .replace(/\r/g, "")
  );
}

// A command run in a terminal session the test scripts: it waits for what the
// command shows, then types an answer.
export function terminalSession(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) {
  const { master, slave } = pseudoTerminal();
  const child = spawn(command, args, {
    ...options,
    stdio: [slave, slave, slave],
    detached: true,
  });
  closeSync(slave);
  let output = "";
  let seen = 0;
  let waiting: (() => void) | undefined;
  const reader = new ReadStream(master);
  reader.on("data", (data: Buffer) => {
    output += data.toString("utf8");
    waiting?.();
  });
  // Reading past the end of a closed terminal fails with EIO on Linux.
  reader.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EIO") throw error;
  });
  const exited = new Promise<number | null>((resolve) =>
    child.on("exit", (code, signal) => resolve(signal ? null : code)),
  );
  let ended = false;
  void exited.then(() => {
    ended = true;
    waiting?.();
  });
  return {
    // Waits until the output since the last match shows the text, and
    // returns what it showed up to and including it.
    async expect(text: string | RegExp, timeout = 60_000) {
      const deadline = Date.now() + timeout;
      for (;;) {
        const rest = visible(output).slice(seen);
        const match =
          typeof text === "string"
            ? { index: rest.indexOf(text), length: text.length }
            : (() => {
                const found = text.exec(rest);
                return found
                  ? { index: found.index, length: found[0].length }
                  : { index: -1, length: 0 };
              })();
        if (match.index >= 0) {
          const shown = rest.slice(0, match.index + match.length);
          seen += match.index + match.length;
          return shown;
        }
        if (ended || Date.now() > deadline)
          throw new Error(
            `The terminal did not show ${String(text)}${ended ? " before the command exited" : ""}. It showed:\n${rest}`,
          );
        await new Promise<void>((resolve) => {
          waiting = resolve;
          setTimeout(resolve, 200);
        });
        waiting = undefined;
      }
    },
    // Types a line, as a person pressing Enter after it.
    type(line: string) {
      writeSync(master, `${line}\r`);
    },
    // Sends keys without Enter, such as Ctrl-C.
    press(keys: string) {
      writeSync(master, keys);
    },
    // Everything shown since the last match.
    rest() {
      return visible(output).slice(seen);
    },
    async exit() {
      const code = await exited;
      reader.destroy();
      return code;
    },
    kill(signal: NodeJS.Signals) {
      child.kill(signal);
    },
    // Ends the session and whatever the command left running in its group.
    close() {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // The group has already exited.
      }
      reader.destroy();
    },
  };
}
