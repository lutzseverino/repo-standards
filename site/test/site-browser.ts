// Shared production-site setup for the browser tests. Each acquired resource
// belongs to the caller's fixture, even when a later setup step fails.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "astro";
import { Browser, findBrowser } from "./browser.ts";
import type { BrowserFixture } from "./fixture.ts";

const site = fileURLToPath(new URL("../", import.meta.url));

export const executable = findBrowser();
export const skip = executable
  ? false
  : "no Chrome, Chromium or Edge found; set SITE_BROWSER to one";

/** Build in a child process so production React never enters a caller that
 * also starts a development server. Restore preview's process-wide mode. */
export async function setupSiteBrowser(
  fixture: BrowserFixture,
  executable: string,
  options: { prefix: string; env?: NodeJS.ProcessEnv },
): Promise<{ base: string; browser: Browser }> {
  const output = mkdtempSync(path.join(site, "node_modules", options.prefix));
  fixture.ownDirectory(output);
  fixture.defer("build output removal", () =>
    rmSync(output, { recursive: true, force: true }),
  );
  execFileSync(
    process.execPath,
    ["node_modules/astro/bin/astro.mjs", "build", "--outDir", output],
    {
      cwd: site,
      env: { ...process.env, ...options.env },
      timeout: 120_000,
      stdio: "pipe",
    },
  );

  const mode = process.env.NODE_ENV;
  let server: Awaited<ReturnType<typeof preview>>;
  try {
    server = await preview({
      root: site,
      outDir: output,
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0 },
    });
    fixture.defer("preview server stop", () => server.stop());
  } finally {
    if (mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = mode;
  }

  const browser = await Browser.launch(executable, fixture);
  return { base: `http://127.0.0.1:${server.port}`, browser };
}
