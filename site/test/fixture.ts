// Browser-backed fixtures share one teardown deadline. The watchdog runs in
// another process: even a blocked event loop cannot keep the serial runner open.
import { fork, type ChildProcess } from "node:child_process";
import { inspect } from "node:util";

export const TEARDOWN_BUDGET = 60_000;

type Cleanup = () => unknown;

export class BrowserFixture {
  #watchdog: ChildProcess;
  #ready: Promise<void>;
  #cleanups: { stage: string; cleanup: Cleanup }[] = [];
  #errors: unknown[] = [];
  #closing: Promise<void> | undefined;

  constructor() {
    this.#watchdog = fork(
      new URL("./fixture-watchdog.ts", import.meta.url),
      [],
      {
        execArgv: [],
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      },
    );
    this.#ready = this.#reply("ready");
  }

  #reply(message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (value: unknown) => {
        if (value !== message) return;
        stop();
        resolve();
      };
      const onExit = (code: number | null, signal: string | null) => {
        stop();
        reject(new Error(`fixture watchdog exited: ${code}, ${signal}`));
      };
      const stop = () => {
        this.#watchdog.off("message", onMessage);
        this.#watchdog.off("exit", onExit);
        this.#watchdog.off("error", onError);
      };
      const onError = (error: Error) => {
        stop();
        reject(error);
      };
      this.#watchdog.on("message", onMessage);
      this.#watchdog.once("exit", onExit);
      this.#watchdog.once("error", onError);
    });
  }

  /** Register immediately after acquisition, before the next await. */
  defer(stage: string, cleanup: Cleanup) {
    this.#cleanups.push({ stage, cleanup });
  }

  /** Only detached children started by this fixture may be registered. */
  ownProcess(child: ChildProcess) {
    if (child.pid) this.#watchdog.send({ type: "process", pid: child.pid });
  }

  ownDirectory(directory: string) {
    this.#watchdog.send({ type: "directory", directory });
  }

  /** Log original errors now; Node's spec reporter may defer its summary. */
  async attempt(stage: string, cleanup: Cleanup) {
    this.#watchdog.send({ type: "start", stage });
    try {
      await cleanup();
    } catch (error) {
      console.error(
        `[site fixture] ${stage}: ${inspect(error, { depth: null })}`,
      );
      this.#errors.push(error);
      this.#watchdog.send({ type: "failure", stage });
    } finally {
      this.#watchdog.send({ type: "end", stage });
    }
  }

  async setup(acquire: () => Promise<void>) {
    try {
      await acquire();
    } catch (error) {
      console.error(`[site fixture] setup: ${inspect(error, { depth: null })}`);
      throw error;
    }
  }

  close(): Promise<void> {
    return (this.#closing ??= this.#close());
  }

  async #close() {
    const deadline = Date.now() + TEARDOWN_BUDGET;
    await this.#ready;
    const armed = this.#reply("armed");
    this.#watchdog.send({ type: "arm", deadline });
    await armed;
    // Independent resources all receive an attempt even if one never settles.
    await Promise.all(
      this.#cleanups.map(({ stage, cleanup }) => this.attempt(stage, cleanup)),
    );
    if (this.#errors.length) {
      // Let a successfully cleaned-up failed test exit normally. If a rejected
      // stop left a server handle alive, keep enforcement armed until the same
      // deadline; neither this child nor its IPC channel keeps the test alive.
      this.#watchdog.unref();
      this.#watchdog.channel?.unref();
      throw new AggregateError(this.#errors, "site fixture teardown failed");
    }
    const finished = this.#reply("finished");
    this.#watchdog.send({ type: "finish" });
    await finished;
    this.#watchdog.disconnect();
  }
}
