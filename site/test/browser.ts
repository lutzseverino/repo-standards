// A headless Chromium-family browser driven through the Chrome DevTools
// Protocol over Node's own WebSocket, so the site's layout tests need no
// browser package. `SITE_BROWSER` names the executable; otherwise the first
// Chrome, Chromium or Edge found on `PATH` or in the usual install places is
// used.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const COMMANDS = [
  "google-chrome-stable",
  "google-chrome",
  "chromium",
  "chromium-browser",
  "microsoft-edge",
];
const INSTALLED = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

/** The browser executable to drive, or undefined when none is installed. */
export function findBrowser(): string | undefined {
  if (process.env.SITE_BROWSER) return process.env.SITE_BROWSER;
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const command of COMMANDS)
    for (const dir of dirs)
      if (existsSync(path.join(dir, command))) return path.join(dir, command);
  return INSTALLED.find((file) => existsSync(file));
}

type Message = {
  id?: number;
  sessionId?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
};

/** A phone-sized view of a page: its width in CSS pixels and its theme. */
export type View = { width: number; theme: "light" | "dark" };

const PHONE_HEIGHT = 800;

export class Browser {
  #process: ChildProcess;
  #profile: string;
  #socket: WebSocket;
  #next = 0;
  #pending = new Map<
    number,
    {
      resolve: (result: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();
  #listeners = new Set<(message: Message) => void>();

  private constructor(
    process: ChildProcess,
    profile: string,
    socket: WebSocket,
  ) {
    this.#process = process;
    this.#profile = profile;
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Message;
      const pending =
        message.id === undefined ? undefined : this.#pending.get(message.id);
      if (pending) {
        this.#pending.delete(message.id!);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      }
      for (const listener of this.#listeners) listener(message);
    });
  }

  /** Starts `executable` headless, reaching only this machine's own
   * servers, so pages load no third-party scripts such as the analytics
   * beacon. */
  static async launch(executable: string): Promise<Browser> {
    const profile = mkdtempSync(path.join(tmpdir(), "site-browser-"));
    const child = spawn(
      executable,
      [
        "--headless",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
        // CI runners' kernels refuse the sandbox's user namespaces; the
        // browser only loads the site built from this checkout
        ...(process.platform === "linux" ? ["--no-sandbox"] : []),
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const endpoint = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error(`${executable} did not start:\n${output}`)),
        30_000,
      );
      child.once("exit", (code) =>
        reject(new Error(`${executable} exited with ${code}:\n${output}`)),
      );
      child.once("error", reject);
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
    });
    child.stderr.resume();
    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new Browser(child, profile, socket);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const id = ++this.#next;
    this.#socket.send(JSON.stringify({ id, method, params, sessionId }));
    // a browser that stops answering fails the command instead of hanging
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} had no answer within 60 seconds`));
      }, 60_000);
      this.#pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  /** The next event `method` in `sessionId`, which fails after a minute
   * without one; `stop` stops waiting for it. */
  event(method: string, sessionId: string) {
    let stop = () => {};
    const next = new Promise<Record<string, unknown>>((resolve, reject) => {
      const listener = (message: Message) => {
        if (message.method === method && message.sessionId === sessionId) {
          stop();
          resolve(message.params ?? {});
        }
      };
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`no ${method} within 60 seconds`));
      }, 60_000);
      stop = () => {
        clearTimeout(timer);
        this.#listeners.delete(listener);
      };
      this.#listeners.add(listener);
    });
    return { next, stop };
  }

  /** A new tab showing `url` as a touch-first phone in `view`, with
   * `storage` in its local storage, once its fonts have loaded and its
   * islands have hydrated. */
  async open(
    url: string,
    view: View,
    storage: Record<string, string> = {},
  ): Promise<Tab> {
    const { targetId } = await this.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = (await this.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    })) as { sessionId: string };
    const tab = new Tab(this, targetId as string, sessionId);
    await tab.send("Page.enable");
    await tab.send("Runtime.enable");
    await tab.resize(view.width);
    await tab.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await tab.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: view.theme }],
    });
    // the theme the nav's toggle would have chosen and stored
    const stored = { ...storage, theme: view.theme };
    await tab.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `for (const [key, value] of Object.entries(${JSON.stringify(stored)})) localStorage.setItem(key, value);`,
    });
    await tab.goto(url);
    return tab;
  }

  async close() {
    this.#socket.close();
    if (this.#process.exitCode === null && this.#process.signalCode === null) {
      const exited = new Promise((resolve) =>
        this.#process.once("exit", resolve),
      );
      this.#process.kill();
      await exited;
    }
    rmSync(this.#profile, { recursive: true, force: true });
  }
}

export class Tab {
  #browser: Browser;
  #targetId: string;
  #sessionId: string;

  constructor(browser: Browser, targetId: string, sessionId: string) {
    this.#browser = browser;
    this.#targetId = targetId;
    this.#sessionId = sessionId;
  }

  send(method: string, params: Record<string, unknown> = {}) {
    return this.#browser.send(method, params, this.#sessionId);
  }

  async goto(url: string) {
    const loaded = this.#browser.event("Page.loadEventFired", this.#sessionId);
    const { errorText } = (await this.send("Page.navigate", { url })) as {
      errorText?: string;
    };
    if (errorText) {
      loaded.stop();
      throw new Error(`${url}: ${errorText}`);
    }
    await loaded.next;
    await this.settle();
  }

  /** Lays the page out `width` CSS pixels wide, as a phone's screen. */
  async resize(width: number) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: PHONE_HEIGHT,
      deviceScaleFactor: 2,
      mobile: true,
    });
  }

  /** Waits for the fonts, every island's hydration and two frames, so
   * fitted text and hydrated controls have their final size. An island
   * that has not hydrated within 15 seconds fails. */
  async settle() {
    const unhydrated = await this.evaluate(async () => {
      await document.fonts.ready;
      const deadline = Date.now() + 15_000;
      while (
        document.querySelector("astro-island[ssr]") &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
      return [...document.querySelectorAll("astro-island[ssr]")].map((island) =>
        island.getAttribute("component-export"),
      );
    });
    if (unhydrated.length)
      throw new Error(`islands not hydrated: ${unhydrated.join(", ")}`);
  }

  /** Runs `fn(arg)` in the page and returns its result, which must survive
   * JSON. `fn` must reference nothing outside its own body. */
  async evaluate<A, R>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R> {
    const { result, exceptionDetails } = (await this.send("Runtime.evaluate", {
      expression: `(${fn.toString()})(${JSON.stringify(arg ?? null)})`,
      awaitPromise: true,
      returnByValue: true,
    })) as {
      result: { value: R };
      exceptionDetails?: { exception?: { description?: string }; text: string };
    };
    if (exceptionDetails)
      throw new Error(
        exceptionDetails.exception?.description ?? exceptionDetails.text,
      );
    return result.value;
  }

  /** Writes a PNG of the screen, or of the whole page if `full`, to
   * `file`. */
  async screenshot(file: string, full = false) {
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: full,
    });
    writeFileSync(file, Buffer.from(data as string, "base64"));
  }

  close() {
    return this.#browser.send("Target.closeTarget", {
      targetId: this.#targetId,
    });
  }
}
